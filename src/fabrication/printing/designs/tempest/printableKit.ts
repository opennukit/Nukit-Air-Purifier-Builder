import {
  type Geom2,
  type Geom3,
  manifoldModeling,
  meshData,
  POSITION_PROP_COUNT,
} from "@/fabrication/printing/modeling/manifoldOps";
import { withGeometryArena } from "@/fabrication/printing/modeling/manifoldKernel";
import type { GeometryContext } from "@/fabrication/printing/designs/tempest/geometry/context";
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
import {
  buildTempestGeometry,
  type ChunkBounds,
  clipPrintChunk,
  posePrintableAssembly,
} from "@/fabrication/printing/designs/tempest/geometry";
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
  const { model, pose, printableChunkGrid, sourceChunkGrid } = createTempestChunkPlan(settings, presetId);
  // Every Manifold value the build allocates is freed when this arena exits;
  // the returned parts carry only extracted plain-data meshes. The posing and
  // chunk-clipping run through the same ModelingApi seam as the parametric shape
  // (geometry/chunking.ts); only mesh extraction below is Manifold-bound.
  const parts = withGeometryArena(() => {
    const ctx: GeometryContext<Geom3, Geom2> = { modeling: manifoldModeling, fanPatternCache: new Map() };
    const assembly = posePrintableAssembly(
      ctx,
      pose,
      createFinalAssemblyGeometry(model, sourceChunkGrid),
    );
    return createChunkParts(ctx, model, printableChunkGrid, assembly);
  });
  const featureCount = estimateFeatureCount(model);

  return {
    preset,
    parts,
    summary: {
      partCount: parts.length,
      panelTileCount: 0,
      glueKeyCount: 0,
      splitPanelCount: printableChunkGrid.totalCount > 1 ? 1 : 0,
      oversizedPartCount: parts.filter((part) => printBedFitForPart(part, preset.bed).type === "oversized").length,
      sourceCutFeatureCount: featureCount,
      retainedCutFeatureCount: featureCount,
      sourcePrintCriticalCutFeatureCount: featureCount,
      retainedPrintCriticalCutFeatureCount: featureCount,
    },
  };
}

// #######################################
// Chunk Plan (pure, no CSG)
// #######################################

// How the kit will pose and split the model for a print volume, derived from
// pure arithmetic — no Manifold build. The same plan drives the kit's actual
// chunk cutting above, so plan consumers (assembly guidance, parts list, the
// exploded preview's pin diagram) always agree with the exported chunks.
export type TempestChunkPlan = {
  readonly model: TempestModel;
  readonly pose: TempestPrintablePose;
  // The cut boundaries in the posed (on-bed) frame the chunks are clipped on.
  readonly printableChunkGrid: TempestChunkGrid;
  // The same boundaries mapped back to the source (as-modelled) frame, where
  // the alignment-pin holes are placed.
  readonly sourceChunkGrid: TempestChunkGrid;
};

export function createTempestChunkPlan(settings: TempestSettings, presetId: PrintVolumePresetId): TempestChunkPlan {
  const model = createTempestModel(settingsForPresetBed(settings, presetId));
  const pose = createTempestPrintablePose(model);
  const printableChunkGrid = featureAwarePrintableChunkGrid(model, pose, model.settings.printBed);
  return {
    model,
    pose,
    printableChunkGrid,
    sourceChunkGrid: sourceChunkGridForPose(pose, printableChunkGrid),
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

function createChunkParts(
  ctx: GeometryContext<Geom3, Geom2>,
  model: TempestModel,
  chunkGrid: TempestChunkGrid,
  assembly: Geom3,
): PrintablePart[] {
  const parts: PrintablePart[] = [];
  const featureCount = estimateFeatureCount(model);
  for (let z = 0; z < chunkGrid.countZ; z += 1) {
    for (let y = 0; y < chunkGrid.countY; y += 1) {
      for (let x = 0; x < chunkGrid.countX; x += 1) {
        const part = createChunkPart(ctx, chunkGrid, assembly, { x, y, z }, featureCount);
        if (part.mesh.vertices.length > 0) {
          parts.push(part);
        }
      }
    }
  }
  return parts;
}

function createChunkPart(
  ctx: GeometryContext<Geom3, Geom2>,
  chunkGrid: TempestChunkGrid,
  assembly: Geom3,
  address: ChunkAddress,
  featureCount: number,
): PrintablePart {
  const bounds = chunkBoundsAt(chunkGrid, address);
  const [width, depth, height] = bounds.size;
  const [originX, originY, originZ] = bounds.origin;
  return {
    id: `tempest-chunk-${address.x}-${address.y}-${address.z}`,
    name: `Tempest chunk ${address.x},${address.y},${address.z}`,
    kind: "tempest-print-chunk",
    sourcePanelId: "tempest-parametric-csg",
    sourcePlacement: {
      x: roundMillimeters(originX),
      y: roundMillimeters(originY),
      z: roundMillimeters(originZ),
    },
    width: roundMillimeters(width),
    depth: roundMillimeters(depth),
    height: roundMillimeters(height),
    cutFeatureCount: featureCount,
    printCriticalCutFeatureCount: featureCount,
    mesh: manifoldGeometryToPrintableMesh(clipPrintChunk(ctx, assembly, bounds)),
  };
}

// The chunk's min corner and true extent, read straight off the grid boundaries
// for the given address. ChunkBounds is the kernel-agnostic shape clipPrintChunk
// consumes, so the cutting math lives behind the seam, not here.
function chunkBoundsAt(chunkGrid: TempestChunkGrid, address: ChunkAddress): ChunkBounds {
  const originX = chunkGrid.boundariesX[address.x];
  const originY = chunkGrid.boundariesY[address.y];
  const originZ = chunkGrid.boundariesZ[address.z];
  return {
    origin: [originX, originY, originZ],
    size: [
      chunkGrid.boundariesX[address.x + 1] - originX,
      chunkGrid.boundariesY[address.y + 1] - originY,
      chunkGrid.boundariesZ[address.z + 1] - originZ,
    ],
  };
}

// #######################################
// Printable Orientation
// #######################################

export function createTempestPrintablePose(model: TempestModel): TempestPrintablePose {
  return model.printablePose;
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
  return matchTopology(model, {
    quad: (m) => m.fanLayout.fanCount * fanOpeningAndScrewFeatureCount + 9,
    sandwich: (m) => {
      const fanHoleCount = Object.values(m.fanLayout.walls).reduce((total, wall) => total + wall.actualCount * fanOpeningAndScrewFeatureCount, 0);
      return fanHoleCount + (m.cordPassThrough.type === "none" ? 0 : 1);
    },
  });
}

// #######################################
// Primitive Helpers
// #######################################

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
