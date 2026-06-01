import { booleans, geometries, primitives, transforms } from "@jscad/modeling";
import {
  createTempestModel,
  defaultTempestSettings,
  type TempestChunkGrid,
  type TempestModel,
  type TempestSettings,
} from "@/domain/designs/tempest/model";
import {
  findPrintVolumePreset,
  printBedFitForPart,
  type PrintableKit,
  type PrintableMesh,
  type PrintablePart,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import { createTempestScadFinalModel, type TempestScadGeom3 } from "@/fabrication/printing/designs/tempest/scadPort";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

export {
  createTempestSettingsFromConfiguration,
  createTempestSettingsFromLayout,
} from "@/fabrication/printing/designs/tempest/settings";

// #######################################
// Tempest Printable CSG Model
// #######################################

// ##############################
// CSG Types and Constants
// ##############################

type Geom3 = TempestScadGeom3;

type ChunkAddress = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type TempestPrintableEnvelope = {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
};

export type TempestPrintablePose =
  | {
      readonly type: "source";
      readonly envelope: TempestPrintableEnvelope;
    }
  | {
      readonly type: "upright-dual-filter";
      readonly envelope: TempestPrintableEnvelope;
    };

const epsilon = 0.05;
const fanOpeningAndScrewFeatureCount = 5;

// #######################################
// Public Kit API
// #######################################

export function createTempestPrintableKit(
  settings: TempestSettings = defaultTempestSettings,
  presetId: PrintVolumePresetId,
): PrintableKit {
  const preset = findPrintVolumePreset(presetId);
  const model = createTempestModel(settingsForPresetBed(settings, presetId));
  const pose = createTempestPrintablePose(model);
  const chunkGrid = createPrintableChunkGrid(pose.envelope, model.settings.printBed);
  const assembly = applyTempestPrintablePose(createFinalAssemblyGeometry(model, sourceChunkGridForPrintablePose(pose, chunkGrid)), pose);
  const parts = createChunkParts(model, chunkGrid, assembly);
  const featureCount = estimateFeatureCount(model);

  return {
    preset,
    parts,
    summary: {
      partCount: parts.length,
      panelTileCount: 0,
      glueKeyCount: 0,
      splitPanelCount: chunkGrid.totalCount > 1 ? 1 : 0,
      oversizedPartCount: parts.filter((part) => printBedFitForPart(part, preset.bed).type === "oversized").length,
      sourceCutFeatureCount: featureCount,
      retainedCutFeatureCount: featureCount,
      sourcePrintCriticalCutFeatureCount: featureCount,
      retainedPrintCriticalCutFeatureCount: featureCount,
    },
  };
}

export function createTempestPrintableKitFromLayout(
  layout: LayoutResult,
  presetId: PrintVolumePresetId,
): PrintableKit {
  return createTempestPrintableKit(createTempestSettingsFromLayout(layout), presetId);
}

function settingsForPresetBed(settings: TempestSettings, presetId: PrintVolumePresetId): TempestSettings {
  const preset = findPrintVolumePreset(presetId);
  if (preset.bed.type === "unbounded") {
    const unboundedModel = createTempestModel(settings);
    const pose = createTempestPrintablePose(unboundedModel);
    return {
      ...settings,
      printBed: {
        width: pose.envelope.width,
        depth: pose.envelope.depth,
        height: pose.envelope.height,
      },
    };
  }
  return {
    ...settings,
    printBed: {
      width: preset.bed.width,
      depth: preset.bed.depth,
      height: preset.bed.height,
    },
  };
}

// #######################################
// Chunk Parts
// #######################################

function createChunkParts(model: TempestModel, chunkGrid: TempestChunkGrid, assembly: Geom3): PrintablePart[] {
  const parts: PrintablePart[] = [];
  const featureCount = estimateFeatureCount(model);
  for (let z = 0; z < chunkGrid.countZ; z += 1) {
    for (let y = 0; y < chunkGrid.countY; y += 1) {
      for (let x = 0; x < chunkGrid.countX; x += 1) {
        const part = createChunkPart(chunkGrid, assembly, { x, y, z }, featureCount);
        if (part.mesh.vertices.length > 0) {
          parts.push(part);
        }
      }
    }
  }
  return parts;
}

function createChunkPart(
  chunkGrid: TempestChunkGrid,
  assembly: Geom3,
  address: ChunkAddress,
  featureCount: number,
): PrintablePart {
  const origin = {
    x: address.x * chunkGrid.chunkWidth,
    y: address.y * chunkGrid.chunkDepth,
    z: address.z * chunkGrid.chunkHeight,
  };
  const chunkBox = cuboidFromMinSize(
    origin.x - epsilon,
    origin.y - epsilon,
    origin.z - epsilon,
    chunkGrid.chunkWidth + 2 * epsilon,
    chunkGrid.chunkDepth + 2 * epsilon,
    chunkGrid.chunkHeight + 2 * epsilon,
  );
  const roughChunkGeometry = transforms.translate(
    [-origin.x, -origin.y, -origin.z],
    booleans.intersect(assembly, chunkBox),
  );
  const exactChunkBox = cuboidFromMinSize(0, 0, 0, chunkGrid.chunkWidth, chunkGrid.chunkDepth, chunkGrid.chunkHeight);
  const chunkGeometry = booleans.intersect(roughChunkGeometry, exactChunkBox);
  return {
    id: `tempest-chunk-${address.x}-${address.y}-${address.z}`,
    name: `Tempest chunk ${address.x},${address.y},${address.z}`,
    kind: "tempest-print-chunk",
    sourcePanelId: "tempest-parametric-csg",
    width: roundMillimeters(chunkGrid.chunkWidth),
    depth: roundMillimeters(chunkGrid.chunkDepth),
    height: roundMillimeters(chunkGrid.chunkHeight),
    cutFeatureCount: featureCount,
    printCriticalCutFeatureCount: featureCount,
    mesh: jscadGeometryToPrintableMesh(chunkGeometry),
  };
}

// #######################################
// Printable Orientation
// #######################################

export function createTempestPrintablePose(model: TempestModel): TempestPrintablePose {
  if (model.settings.arrangement.type === "dual-horizontal-sandwich") {
    return {
      type: "upright-dual-filter",
      envelope: {
        width: model.box.width,
        depth: model.box.height,
        height: model.box.depth,
      },
    };
  }
  return {
    type: "source",
    envelope: {
      width: model.box.width,
      depth: model.box.depth,
      height: model.box.height,
    },
  };
}

function applyTempestPrintablePose(geometry: Geom3, pose: TempestPrintablePose): Geom3 {
  if (pose.type === "source") {
    return geometry;
  }
  return transforms.translate(
    [0, pose.envelope.depth, 0],
    transforms.rotateX(Math.PI / 2, geometry),
  );
}

function createPrintableChunkGrid(envelope: TempestPrintableEnvelope, bed: TempestSettings["printBed"]): TempestChunkGrid {
  const countX = Math.max(1, Math.ceil(envelope.width / bed.width));
  const countY = Math.max(1, Math.ceil(envelope.depth / bed.depth));
  const countZ = Math.max(1, Math.ceil(envelope.height / bed.height));
  return {
    countX,
    countY,
    countZ,
    totalCount: countX * countY * countZ,
    chunkWidth: envelope.width / countX,
    chunkDepth: envelope.depth / countY,
    chunkHeight: envelope.height / countZ,
  };
}

function sourceChunkGridForPrintablePose(pose: TempestPrintablePose, printableGrid: TempestChunkGrid): TempestChunkGrid {
  if (pose.type === "source") {
    return printableGrid;
  }
  return {
    countX: printableGrid.countX,
    countY: printableGrid.countZ,
    countZ: printableGrid.countY,
    totalCount: printableGrid.totalCount,
    chunkWidth: printableGrid.chunkWidth,
    chunkDepth: printableGrid.chunkHeight,
    chunkHeight: printableGrid.chunkDepth,
  };
}

// #######################################
// Final Assembly Geometry
// #######################################

function createFinalAssemblyGeometry(model: TempestModel, alignmentPinChunkGrid: TempestChunkGrid): Geom3 {
  return createTempestScadFinalModel(model, alignmentPinChunkGrid);
}

// #######################################
// Mesh Conversion
// #######################################

function jscadGeometryToPrintableMesh(geometry: Geom3): PrintableMesh {
  const vertices: MeshVertex[] = [];
  const triangles: MeshTriangle[] = [];
  for (const polygon of geometries.geom3.toPolygons(geometry)) {
    const points = polygon.vertices;
    if (points.length < 3) {
      continue;
    }
    const offset = vertices.length;
    vertices.push(
      ...points.map((point) =>
        roundVertex({
          x: point[0],
          y: point[1],
          z: point[2],
        }),
      ),
    );
    for (let index = 1; index < points.length - 1; index += 1) {
      triangles.push({
        v1: offset,
        v2: offset + index,
        v3: offset + index + 1,
      });
    }
  }
  return { vertices, triangles };
}

// #######################################
// Summary Helpers
// #######################################

function estimateFeatureCount(model: TempestModel): number {
  if (model.fanLayout.type === "tower-top-grid") {
    return model.fanLayout.fanCount * fanOpeningAndScrewFeatureCount + 9;
  }
  const fanHoleCount = Object.values(model.fanLayout.walls).reduce((total, wall) => total + wall.actualCount * fanOpeningAndScrewFeatureCount, 0);
  return fanHoleCount + (model.cordPassThrough.type === "none" ? 0 : 1);
}

// #######################################
// Primitive Helpers
// #######################################

function cuboidFromMinSize(x: number, y: number, z: number, width: number, depth: number, height: number): Geom3 {
  return primitives.cuboid({
    center: [x + width / 2, y + depth / 2, z + height / 2],
    size: [Math.max(0.001, width), Math.max(0.001, depth), Math.max(0.001, height)],
  });
}

function roundVertex(vertex: MeshVertex): MeshVertex {
  return {
    x: roundMillimeters(vertex.x),
    y: roundMillimeters(vertex.y),
    z: roundMillimeters(vertex.z),
  };
}

function roundMillimeters(value: number): number {
  return Number(value.toFixed(4));
}
