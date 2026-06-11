import {
  type Geom2,
  type Geom3,
  manifoldModeling,
} from "@/fabrication/printing/modeling/manifoldOps";
import { withGeometryArena } from "@/fabrication/printing/modeling/manifoldKernel";
import { extractWeldedMesh } from "@/fabrication/printing/modeling/meshConversion";
import { roundMillimeters } from "@/fabrication/printing/meshWelding";
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
  const model = createTempestModel(settingsForPresetBed(settings, presetId));
  const pose = createTempestPrintablePose(model);
  const chunkGrid = featureAwarePrintableChunkGrid(model, pose, model.settings.printBed);
  // Every Manifold value the build allocates is freed when this arena exits;
  // the returned parts carry only extracted plain-data meshes. The posing and
  // chunk-clipping run through the same ModelingApi seam as the parametric shape
  // (geometry/chunking.ts); only mesh extraction below is Manifold-bound.
  const parts = withGeometryArena(() => {
    const ctx: GeometryContext<Geom3, Geom2> = { modeling: manifoldModeling, fanPatternCache: new Map() };
    const assembly = posePrintableAssembly(
      ctx,
      pose,
      createFinalAssemblyGeometry(model, sourceChunkGridForPose(pose, chunkGrid)),
    );
    return createChunkParts(ctx, model, chunkGrid, assembly);
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
    mesh: extractWeldedMesh(clipPrintChunk(ctx, assembly, bounds)),
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
