import {
  booleans,
  type Geom3,
  manifoldModeling,
  meshData,
  POSITION_PROP_COUNT,
  primitives,
  transforms,
} from "@/fabrication/printing/modeling/manifoldOps";
import { withGeometryArena } from "@/fabrication/printing/modeling/manifoldKernel";
import {
  createTempestModel,
  defaultTempestSettings,
  type TempestChunkGrid,
  type TempestModel,
  type TempestPrintablePose,
} from "@/domain/designs/tempest/model";
import type { TempestSettings } from "@/domain/designs/tempest/shared";
import { matchTopology } from "@/domain/designs/tempest/topology";
import {
  findPrintVolumePreset,
  printBedFitForPart,
  type PrintableKit,
  type PrintableMesh,
  type PrintablePart,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import { buildTempestGeometry } from "@/fabrication/printing/designs/tempest/geometry";
import { featureAwarePrintableChunkGrid, sourceChunkGridForPose } from "@/fabrication/printing/designs/tempest/chunkSlicing";
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

// `Geom3` is the Manifold solid type, imported from manifoldOps — the service
// always builds the geometry on the Manifold backend.

type ChunkAddress = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

const epsilon = 0.05;
// One fan cutout is five CSG features: the opening plus its four corner screw holes.
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
  const chunkGrid = featureAwarePrintableChunkGrid(model, pose, model.settings.printBed);
  // Every Manifold value the build allocates is freed when this arena exits;
  // the returned parts carry only extracted plain-data meshes.
  const parts = withGeometryArena(() => {
    const assembly = applyTempestPrintablePose(
      createFinalAssemblyGeometry(model, sourceChunkGridForPose(pose, chunkGrid)),
      pose,
    );
    return createChunkParts(model, chunkGrid, assembly);
  });
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
    x: chunkGrid.boundariesX[address.x],
    y: chunkGrid.boundariesY[address.y],
    z: chunkGrid.boundariesZ[address.z],
  };
  const size = {
    x: chunkGrid.boundariesX[address.x + 1] - origin.x,
    y: chunkGrid.boundariesY[address.y + 1] - origin.y,
    z: chunkGrid.boundariesZ[address.z + 1] - origin.z,
  };
  const chunkBox = cuboidFromMinSize(
    origin.x - epsilon,
    origin.y - epsilon,
    origin.z - epsilon,
    size.x + 2 * epsilon,
    size.y + 2 * epsilon,
    size.z + 2 * epsilon,
  );
  const roughChunkGeometry = transforms.translate(
    [-origin.x, -origin.y, -origin.z],
    booleans.intersect(assembly, chunkBox),
  );
  const exactChunkBox = cuboidFromMinSize(0, 0, 0, size.x, size.y, size.z);
  const chunkGeometry = booleans.intersect(roughChunkGeometry, exactChunkBox);
  return {
    id: `tempest-chunk-${address.x}-${address.y}-${address.z}`,
    name: `Tempest chunk ${address.x},${address.y},${address.z}`,
    kind: "tempest-print-chunk",
    sourcePanelId: "tempest-parametric-csg",
    width: roundMillimeters(size.x),
    depth: roundMillimeters(size.y),
    height: roundMillimeters(size.z),
    cutFeatureCount: featureCount,
    printCriticalCutFeatureCount: featureCount,
    mesh: manifoldGeometryToPrintableMesh(chunkGeometry),
  };
}

// #######################################
// Printable Orientation
// #######################################

export function createTempestPrintablePose(model: TempestModel): TempestPrintablePose {
  return model.printablePose;
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

// #######################################
// Final Assembly Geometry
// #######################################

function createFinalAssemblyGeometry(model: TempestModel, alignmentPinChunkGrid: TempestChunkGrid): Geom3 {
  return buildTempestGeometry(manifoldModeling, model, alignmentPinChunkGrid);
}

// #######################################
// Mesh Conversion
// #######################################

// Manifold guarantees the solid's topology is watertight and T-junction-free,
// but `getMesh()` may still duplicate a position across its internal face runs.
// Welding coincident vertices (snapped to export precision) into one index
// collapses those duplicates, yielding a compact, fully edge-shared mesh.
function manifoldGeometryToPrintableMesh(geometry: Geom3): PrintableMesh {
  const mesh = meshData(geometry);
  const vertices: MeshVertex[] = [];
  const triangles: MeshTriangle[] = [];
  const indexByPosition = new Map<string, number>();

  const weldVertex = (sourceIndex: number): number => {
    // Position occupies the first POSITION_PROP_COUNT channels of the vertex; the
    // stride between vertices is the full per-vertex property count (numProp).
    const positionBase = sourceIndex * mesh.numProp;
    const vertex = roundVertex(readPosition(mesh.vertProperties, positionBase));
    const positionKey = `${vertex.x},${vertex.y},${vertex.z}`;
    const existingIndex = indexByPosition.get(positionKey);
    if (existingIndex !== undefined) {
      return existingIndex;
    }
    const newIndex = vertices.length;
    vertices.push(vertex);
    indexByPosition.set(positionKey, newIndex);
    return newIndex;
  };

  for (let cursor = 0; cursor < mesh.triVerts.length; cursor += 3) {
    const first = weldVertex(mesh.triVerts[cursor]);
    const second = weldVertex(mesh.triVerts[cursor + 1]);
    const third = weldVertex(mesh.triVerts[cursor + 2]);
    if (first === second || second === third || first === third) {
      continue;
    }
    triangles.push({ v1: first, v2: second, v3: third });
  }
  return { vertices, triangles };
}

// Reads the x, y, z position from the first POSITION_PROP_COUNT channels of a
// vertex's interleaved properties. The xyz field names of `MeshVertex` are the
// canonical naming of that layout, so this maps the channels onto them.
function readPosition(vertProperties: Float32Array, positionBase: number): MeshVertex {
  const [xChannel, yChannel, zChannel] = positionChannelsFrom(positionBase);
  return {
    x: vertProperties[xChannel],
    y: vertProperties[yChannel],
    z: vertProperties[zChannel],
  };
}

function positionChannelsFrom(positionBase: number): readonly number[] {
  return Array.from({ length: POSITION_PROP_COUNT }, (_, channel) => positionBase + channel);
}

// #######################################
// Summary Helpers
// #######################################

function estimateFeatureCount(model: TempestModel): number {
  return matchTopology(model.fanLayout, {
    quad: (fanLayout) => fanLayout.fanCount * fanOpeningAndScrewFeatureCount + 9,
    sandwich: (fanLayout) => {
      const fanHoleCount = Object.values(fanLayout.walls).reduce((total, wall) => total + wall.actualCount * fanOpeningAndScrewFeatureCount, 0);
      return fanHoleCount + (model.cordPassThrough.type === "none" ? 0 : 1);
    },
  });
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
