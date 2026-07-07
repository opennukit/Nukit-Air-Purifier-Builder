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
import { alignmentPinPieceLength, type TempestSettings } from "@/domain/designs/tempest/shared";
import {
  findPrintVolumePreset,
  kitMaterialVolumeMm3,
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
import { cellKey, planChunkLabels } from "@/fabrication/printing/designs/tempest/geometry/chunkLabels";
import { debossChunkSeamLabels, type DebossFace } from "@/fabrication/printing/designs/tempest/geometry/chunkLabelDeboss";
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
    return createChunkParts(ctx, model, printableChunkGrid, assembly);
  });

  return {
    preset,
    parts,
    summary: {
      partCount: parts.length,
      oversizedPartCount: parts.filter((part) => printBedFitForPart(part, preset.bed).type === "oversized").length,
      materialVolumeMm3: kitMaterialVolumeMm3(parts),
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
  // The physical pin piece length for this seam, derived from its (possibly
  // shortened) hole depth so the preview matches the cut holes pin-for-pin.
  readonly length: number;
};

export type TempestAssemblyPinDiagram = {
  readonly pinDiameter: number;
  // The physical pin piece: it reaches into the chunk on each side of the
  // seam, cut shorter than the combined hole depth to leave glue room.
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
  const placements = tempestPinPlacementsClearOfFans(model, sourceChunkGrid).map((placement) => ({
    ...posePinPlacement(placement, pose),
    length: alignmentPinPieceLength(placement.holeDepth ?? pins.holeDepth),
  }));
  if (placements.length === 0) {
    return null;
  }
  return {
    pinDiameter: pins.diameter,
    pinLength: alignmentPinPieceLength(pins.holeDepth),
    placements,
  };
}

// Source -> posed frame, matching posePrintableAssembly and
// sourceChunkGridForPose: upright-dual-filter maps (x, y, z) to
// (x, envelope.depth - z, y), so the axes follow the same rotation.
function posePinPlacement(
  placement: TempestAlignmentPinPlacement,
  pose: TempestPrintablePose,
): Omit<TempestPosedPinPlacement, "length"> {
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

// Chunk/seam label deboss. Parked for now (off by default, control hidden); the
// placement still needs work — it can land on the fan grill — before re-enabling.
const CHUNK_LABEL_CAP_HEIGHT_MM = 7;
const CHUNK_LABEL_DEPTH_MM = 1;

type ClippedChunk = {
  readonly address: ChunkAddress;
  readonly bounds: ChunkBounds;
  readonly geom: Geom3;
  readonly mesh: ReturnType<typeof extractWeldedMesh>;
};

function createChunkParts(
  ctx: GeometryContext<Geom3, Geom2>,
  model: TempestModel,
  chunkGrid: TempestChunkGrid,
  assembly: Geom3,
): PrintablePart[] {
  // Pass 1: clip every cell and record which ones actually hold material — the
  // letter plan and seam codes can only reference occupied chunks.
  const clipped = new Map<string, ClippedChunk>();
  const occupied = new Set<string>();
  for (let z = 0; z < chunkGrid.countZ; z += 1) {
    for (let y = 0; y < chunkGrid.countY; y += 1) {
      for (let x = 0; x < chunkGrid.countX; x += 1) {
        const address = { x, y, z };
        const bounds = chunkBoundsAt(chunkGrid, address);
        const geom = clipPrintChunk(ctx, assembly, bounds);
        const mesh = extractWeldedMesh(geom);
        if (mesh.vertices.length === 0) {
          continue;
        }
        const key = cellKey(address);
        occupied.add(key);
        clipped.set(key, { address, bounds, geom, mesh });
      }
    }
  }

  // Pass 2: collect each occupied chunk's seam codes (when labelling is on and the
  // print is split), deboss them into the bottom face, then emit parts in the
  // stable z,y,x order the clipped map preserves.
  const codesByCell = new Map<string, string[]>();
  if (model.settings.chunkLabels && occupied.size > 1) {
    for (const seam of planChunkLabels(chunkGrid, occupied).seams) {
      const key = cellKey(seam.cell);
      (codesByCell.get(key) ?? codesByCell.set(key, []).get(key)!).push(seam.code);
    }
  }

  const parts: PrintablePart[] = [];
  for (const chunk of clipped.values()) {
    const codes = codesByCell.get(cellKey(chunk.address));
    const face = codes && codes.length > 0 ? dominantFlatFace(chunk.mesh) : null;
    const mesh =
      codes === undefined || codes.length === 0 || face === null
        ? chunk.mesh
        : extractWeldedMesh(
            debossChunkSeamLabels(ctx, chunk.geom, codes, face, {
              capHeight: CHUNK_LABEL_CAP_HEIGHT_MM,
              depth: CHUNK_LABEL_DEPTH_MM,
            }),
          );
    parts.push(buildChunkPart(chunk.address, chunk.bounds, mesh));
  }
  return parts;
}

// The biggest flat axis-aligned face of a chunk to engrave the codes on. Prefers
// the printing base (downward-facing -z face) when it carries a decent share of
// the area, otherwise the single largest face — so every chunk gets a solid,
// readable surface whatever its shape. Returns null if no flat face is found.
function dominantFlatFace(mesh: ReturnType<typeof extractWeldedMesh>): DebossFace | null {
  const otherAxes: Record<0 | 1 | 2, readonly [0 | 1 | 2, 0 | 1 | 2]> = { 0: [1, 2], 1: [0, 2], 2: [0, 1] };
  type Bin = { axis: 0 | 1 | 2; sign: 1 | -1; offset: number; area: number; su: number; sv: number };
  const bins = new Map<string, Bin>();
  const v = mesh.vertices;
  for (const t of mesh.triangles) {
    const a = v[t.v1];
    const b = v[t.v2];
    const c = v[t.v3];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const wx = c.x - a.x;
    const wy = c.y - a.y;
    const wz = c.z - a.z;
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) {
      continue;
    }
    const n = [nx / len, ny / len, nz / len] as const;
    const cen = [(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3] as const;
    for (const axis of [0, 1, 2] as const) {
      if (Math.abs(n[axis]) < 0.97) {
        continue;
      }
      const sign: 1 | -1 = n[axis] > 0 ? 1 : -1;
      const offset = Math.round(cen[axis] * 2) / 2;
      const key = `${axis}:${sign}:${offset}`;
      const [ui, vi] = otherAxes[axis];
      const area = len / 2;
      const bin = bins.get(key) ?? { axis, sign, offset, area: 0, su: 0, sv: 0 };
      bin.area += area;
      bin.su += area * cen[ui];
      bin.sv += area * cen[vi];
      bins.set(key, bin);
    }
  }
  const all = [...bins.values()];
  if (all.length === 0) {
    return null;
  }
  const largest = all.reduce((m, e) => (e.area > m.area ? e : m));
  const base = all.filter((e) => e.axis === 2 && e.sign === -1).sort((p, q) => q.area - p.area)[0];
  const chosen = base !== undefined && base.area >= 0.4 * largest.area ? base : largest;
  const [uIdx, vIdx] = otherAxes[chosen.axis];
  return {
    axis: chosen.axis,
    sign: chosen.sign,
    offset: chosen.offset,
    uIdx,
    vIdx,
    uCenter: chosen.su / chosen.area,
    vCenter: chosen.sv / chosen.area,
  };
}

function buildChunkPart(
  address: ChunkAddress,
  bounds: ChunkBounds,
  mesh: ReturnType<typeof extractWeldedMesh>,
): PrintablePart {
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
    mesh,
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

