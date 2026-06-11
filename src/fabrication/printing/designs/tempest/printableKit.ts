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
  tempestPinPlacementsClearOfFans,
  type TempestAlignmentPinPlacement,
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
    return createChunkParts(ctx, printableChunkGrid, assembly);
  });

  return {
    preset,
    parts,
    summary: {
      partCount: parts.length,
      oversizedPartCount: parts.filter((part) => printBedFitForPart(part, preset.bed).type === "oversized").length,
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

// #######################################
// Assembly Pin Diagram (pure, no CSG)
// #######################################

// The seam alignment pins as plain posed-frame data for the exploded preview:
// where each filament pin sits and along which posed axis it runs. Derived
// from the same chunk plan and pin-candidate math the kit's CSG build cuts
// the holes with, so the diagram always matches the exported parts.
export type TempestPosedPinPlacement = {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly axis: "x" | "y" | "z";
};

export type TempestAssemblyPinDiagram = {
  readonly pinDiameter: number;
  // The physical pin: holeDepth into the chunk on each side of the seam.
  readonly pinLength: number;
  readonly placements: readonly TempestPosedPinPlacement[];
};

export function createTempestAssemblyPinDiagram(
  settings: TempestSettings,
  presetId: PrintVolumePresetId,
): TempestAssemblyPinDiagram | null {
  const { model, pose, sourceChunkGrid } = createTempestChunkPlan(settings, presetId);
  const pins = model.settings.alignmentPins;
  if (pins.type === "disabled") {
    return null;
  }
  const placements = tempestPinPlacementsClearOfFans(model, sourceChunkGrid).map((placement) => posePinPlacement(placement, pose));
  if (placements.length === 0) {
    return null;
  }
  return {
    pinDiameter: pins.diameter,
    pinLength: 2 * pins.holeDepth,
    placements,
  };
}

// Source -> posed frame, matching posePrintableAssembly and
// sourceChunkGridForPose: upright-dual-filter maps (x, y, z) to
// (x, envelope.depth - z, y), so the axes follow the same rotation.
function posePinPlacement(placement: TempestAlignmentPinPlacement, pose: TempestPrintablePose): TempestPosedPinPlacement {
  const [x, y, z] = placement.position;
  if (pose.type === "source") {
    return { position: { x, y, z }, axis: placement.axis };
  }
  return {
    position: { x, y: pose.envelope.depth - z, z: y },
    axis: placement.axis === "x" ? "x" : placement.axis === "y" ? "z" : "y",
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
  chunkGrid: TempestChunkGrid,
  assembly: Geom3,
): PrintablePart[] {
  const parts: PrintablePart[] = [];
  for (let z = 0; z < chunkGrid.countZ; z += 1) {
    for (let y = 0; y < chunkGrid.countY; y += 1) {
      for (let x = 0; x < chunkGrid.countX; x += 1) {
        const part = createChunkPart(ctx, chunkGrid, assembly, { x, y, z });
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
): PrintablePart {
  const bounds = chunkBoundsAt(chunkGrid, address);
  const [width, depth, height] = bounds.size;
  const [originX, originY, originZ] = bounds.origin;
  return {
    id: `tempest-chunk-${address.x}-${address.y}-${address.z}`,
    name: `Tempest chunk ${address.x},${address.y},${address.z}`,
    kind: "tempest-print-chunk",
    sourcePlacement: {
      x: roundMillimeters(originX),
      y: roundMillimeters(originY),
      z: roundMillimeters(originZ),
    },
    width: roundMillimeters(width),
    depth: roundMillimeters(depth),
    height: roundMillimeters(height),
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

