import {
  type Geom2,
  type Geom3,
  manifoldModeling,
} from "@/fabrication/printing/modeling/manifoldOps";
import { withGeometryArena } from "@/fabrication/printing/modeling/manifoldKernel";
import { extractWeldedMesh } from "@/fabrication/printing/modeling/meshConversion";
import { dropMeshFlakes, roundMillimeters } from "@/fabrication/printing/meshWelding";
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
  flagFragileParts,
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
  tempestFinalPinPlacements,
  type TempestAlignmentPinPlacement,
} from "@/fabrication/printing/designs/tempest/geometry";
import { featureAwarePrintableChunkGrid, sourceChunkGridForPose } from "@/fabrication/printing/designs/tempest/chunkSlicing";
import { cellKey, planChunkLabels, type ChunkSeamLabel, type SeamAxis } from "@/fabrication/printing/designs/tempest/geometry/chunkLabels";
import { debossChunkSeamLabels, type SeamDebossPlacement } from "@/fabrication/printing/designs/tempest/geometry/chunkLabelDeboss";
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
      fragilePartNames: flagFragileParts(parts),
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
  // Derive the diagram from the SAME solid-aware set the kit drills: build the
  // shell once (no pins, so no recursion), then take air-filtered seam pins plus
  // per-piece coverage pins. This keeps every drawn pin matched to a drilled hole.
  const finalPlacements = withGeometryArena(() => {
    const ctx: GeometryContext<Geom3, Geom2> = { modeling: manifoldModeling, fanPatternCache: new Map() };
    const shell = buildTempestGeometry(
      manifoldModeling,
      { ...model, settings: { ...model.settings, alignmentPins: { type: "disabled" } } },
      sourceChunkGrid,
    );
    return tempestFinalPinPlacements(ctx, shell, model, sourceChunkGrid);
  });
  const placements = finalPlacements.map((placement) => ({
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

// Chunk/seam label deboss. Off by default (control hidden); enabled via the
// chunkLabels setting. One code per seam is engraved on the interior face beside
// that seam, with an up-arrow pointing toward the top of the assembly.
const CHUNK_LABEL_CAP_HEIGHT_MM = 7;
const CHUNK_LABEL_DEPTH_MM = 1;
// Keep the engraved code at least this far from any opening (fan grille, screw or
// filter openings) in the host face.
const CHUNK_LABEL_HOLE_CLEARANCE_MM = 3;
// And at least this far from the part's outer/cut edges.
const CHUNK_LABEL_EDGE_CLEARANCE_MM = 2;

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

  // Pass 2: collect each occupied chunk's seams (when labelling is on and the
  // print is split), deboss one code per seam onto the interior face beside it,
  // then emit parts in the stable z,y,x order the clipped map preserves. The
  // letter plan is also computed (whenever split) to name each part by its chunk
  // letter (A, B, ...) so download filenames match the assembly-guide letters.
  const labelPlan = occupied.size > 1 ? planChunkLabels(chunkGrid, occupied) : null;
  const seamsByCell = new Map<string, ChunkSeamLabel[]>();
  if (model.settings.chunkLabels && labelPlan !== null) {
    for (const seam of labelPlan.seams) {
      const key = cellKey(seam.cell);
      (seamsByCell.get(key) ?? seamsByCell.set(key, []).get(key)!).push(seam);
    }
  }
  const boxCenter = chunkGridCenter(chunkGrid);

  const parts: PrintablePart[] = [];
  for (const chunk of clipped.values()) {
    const seams = seamsByCell.get(cellKey(chunk.address));
    const placements =
      seams === undefined || seams.length === 0
        ? []
        : seamDebossPlacements(seams, chunk.mesh, boxCenter, chunk.bounds.origin);
    const debossedMesh =
      placements.length === 0
        ? chunk.mesh
        : extractWeldedMesh(
            debossChunkSeamLabels(ctx, chunk.geom, placements, {
              capHeight: CHUNK_LABEL_CAP_HEIGHT_MM,
              depth: CHUNK_LABEL_DEPTH_MM,
              withArrow: false,
            }),
          );
    // Shed any wafer-thin detached shaving a seam clipped off a chamfer lip (small
    // beds thread seams past fan/opening chamfers); these would just fall off the
    // plate. Runs on the final welded mesh, whose shared-index connectivity is the
    // exact topology that prints, so it never touches a real connected body.
    const mesh = dropMeshFlakes(debossedMesh);
    parts.push(buildChunkPart(chunk.address, chunk.bounds, mesh, labelPlan?.labels.get(cellKey(chunk.address))));
  }
  return parts;
}

function chunkGridCenter(grid: TempestChunkGrid): readonly [number, number, number] {
  const mid = (b: readonly number[]): number => (b[0] + b[b.length - 1]) / 2;
  return [mid(grid.boundariesX), mid(grid.boundariesY), mid(grid.boundariesZ)];
}

// One flat axis-aligned face of a chunk: the plane (outward normal = sign along
// axis), its total area, the area-weighted centre of its two in-plane axes, and
// the in-plane extent (so we can tell which faces a seam crosses and keep the
// code inside the face).
type ChunkFaceBin = {
  readonly axis: 0 | 1 | 2;
  readonly sign: 1 | -1;
  readonly offset: number;
  area: number;
  sumU: number;
  sumV: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  // Per-triangle vertices in the face's (u, v) axes. Used both to find the run of
  // material along a seam (via per-triangle extents) and to rasterise the face's
  // solid material so codes can be kept clear of holes (grilles, screw/filter
  // openings). Flat coords keep it allocation-light.
  readonly samples: { au: number; av: number; bu: number; bv: number; cu: number; cv: number }[];
};

const IN_PLANE_AXES: Record<0 | 1 | 2, readonly [0 | 1 | 2, 0 | 1 | 2]> = { 0: [1, 2], 1: [0, 2], 2: [0, 1] };

function axisIndex(axis: SeamAxis): 0 | 1 | 2 {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}

function vertexComponent(vertex: { x: number; y: number; z: number }, axis: 0 | 1 | 2): number {
  return axis === 0 ? vertex.x : axis === 1 ? vertex.y : vertex.z;
}

// Bin every flat, axis-aligned facet of the mesh into faces, tracking area,
// in-plane centroid, and in-plane extent.
function catalogChunkFaces(mesh: ReturnType<typeof extractWeldedMesh>): ChunkFaceBin[] {
  const bins = new Map<string, ChunkFaceBin>();
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
      const [ui, vi] = IN_PLANE_AXES[axis];
      const area = len / 2;
      const bin =
        bins.get(key) ??
        ({
          axis,
          sign,
          offset,
          area: 0,
          sumU: 0,
          sumV: 0,
          uMin: Infinity,
          uMax: -Infinity,
          vMin: Infinity,
          vMax: -Infinity,
          samples: [],
        } satisfies ChunkFaceBin);
      bin.area += area;
      bin.sumU += area * cen[ui];
      bin.sumV += area * cen[vi];
      const au = vertexComponent(a, ui);
      const av = vertexComponent(a, vi);
      const bu = vertexComponent(b, ui);
      const bv = vertexComponent(b, vi);
      const cu = vertexComponent(c, ui);
      const cv = vertexComponent(c, vi);
      bin.uMin = Math.min(bin.uMin, au, bu, cu);
      bin.uMax = Math.max(bin.uMax, au, bu, cu);
      bin.vMin = Math.min(bin.vMin, av, bv, cv);
      bin.vMax = Math.max(bin.vMax, av, bv, cv);
      bin.samples.push({ au, av, bu, bv, cu, cv });
      bins.set(key, bin);
    }
  }
  return [...bins.values()];
}

// A face is interior-facing when its outward normal points toward the box centre
// (into the cavity) — that is the surface you read while assembling.
function isInteriorFacing(bin: ChunkFaceBin, boxCenter: readonly [number, number, number]): boolean {
  return bin.sign * (boxCenter[bin.axis] - bin.offset) > 0;
}

// The two axes (as indices) perpendicular to a seam, in the order
// planChunkLabels stores faceMin/faceMax — so faceMin[0] is the first axis here.
function seamPerpAxes(axis: SeamAxis): readonly [0 | 1 | 2, 0 | 1 | 2] {
  return axis === "x" ? [1, 2] : axis === "y" ? [0, 2] : [0, 1];
}

// Pick the interior face this chunk presents next to a seam, and where on it the
// code sits, for every seam — skipping any seam with no suitable face. The code
// reads ALONG the seam line (up runs across the seam, into this chunk) and sits
// at the seam's midpoint just inside the cut, so it lands beside the join rather
// than on the face centre.
//
// The chunk mesh is re-seated to its own origin (each chunk's min corner at 0),
// but the seam anchors and box centre come from the global posed grid. Everything
// here is converted into the chunk-local frame via `origin` so the code lands on
// the part, not 200 mm away.
function seamDebossPlacements(
  seams: readonly ChunkSeamLabel[],
  mesh: ReturnType<typeof extractWeldedMesh>,
  boxCenter: readonly [number, number, number],
  origin: readonly [number, number, number],
): SeamDebossPlacement[] {
  const bins = catalogChunkFaces(mesh);
  const margin = CHUNK_LABEL_CAP_HEIGHT_MM;
  const localBoxCenter: readonly [number, number, number] = [
    boxCenter[0] - origin[0],
    boxCenter[1] - origin[1],
    boxCenter[2] - origin[2],
  ];
  // How far along the seam axis a face must carry material to host the code.
  const seamBandWidth = CHUNK_LABEL_CAP_HEIGHT_MM * 2.5;
  const placements: SeamDebossPlacement[] = [];
  for (const seam of seams) {
    const sa = axisIndex(seam.axis);
    const boundaryLocal = seam.boundary - origin[sa];
    const interior = bins.filter((bin) => bin.axis !== sa && isInteriorFacing(bin, localBoxCenter));

    // For each interior face, measure the material it actually carries in a band
    // along the seam (NOT its bounding box, which on an L-shaped/gapped wall can
    // reach the seam with stray triangles while its real surface stops short).
    const banded = interior
      .map((bin) => ({ bin, band: seamBandOnFace(bin, sa, boundaryLocal, seamBandWidth, localBoxCenter) }))
      .filter((entry): entry is { bin: ChunkFaceBin; band: SeamBand } => entry.band !== null);

    // One code per seam, defaulting to the largest flat PANEL of the piece (the
    // dominant flat face, whatever its orientation), then the next-largest faces
    // (which include the side walls) as fallback. Within a face the code sits on
    // the material nearest the box centre (seamBandOnFace), so it stays inside the
    // box rather than in a filter pocket.
    const ordered: { bin: ChunkFaceBin; band: SeamBand | null }[] = [...banded].sort((a, b) => b.bin.area - a.bin.area);
    if (ordered.length === 0) {
      const fallback = largestFace(interior);
      if (fallback !== null) {
        ordered.push({ bin: fallback, band: null });
      }
    }
    // First face on which the code fits clear of holes wins. If none has room,
    // place it best-effort on the largest so a label is never dropped.
    let placement: SeamDebossPlacement | null = null;
    for (const host of ordered) {
      placement = seamPlacementOnFace(seam, sa, boundaryLocal, host.bin, host.band, origin, margin, true);
      if (placement !== null) {
        break;
      }
    }
    if (placement === null && ordered.length > 0) {
      placement = seamPlacementOnFace(seam, sa, boundaryLocal, ordered[0].bin, ordered[0].band, origin, margin, false);
    }
    if (placement !== null) {
      placements.push(placement);
    }
  }
  return placements;
}

// The material a face carries within a band along the seam: total area, and the
// ta (along-seam) centroid + extent of that material. ta is the face's in-plane
// axis that is not the seam axis.
type SeamBand = { readonly ta: 0 | 1 | 2; readonly area: number; readonly taCentroid: number; readonly taMin: number; readonly taMax: number };

function seamBandOnFace(
  bin: ChunkFaceBin,
  sa: 0 | 1 | 2,
  boundaryLocal: number,
  bandWidth: number,
  localBoxCenter: readonly [number, number, number],
): SeamBand | null {
  const [ui, vi] = IN_PLANE_AXES[bin.axis];
  const saIsU = ui === sa;
  const ta = saIsU ? vi : ui;
  // Collect the ta-intervals of triangles whose material reaches up into the band
  // just below the cut. Using triangle EXTENTS (not centroids) catches tall wall
  // facets whose centroid sits far from the seam.
  const intervals: Array<readonly [number, number]> = [];
  for (const sample of bin.samples) {
    const us = [sample.au, sample.bu, sample.cu];
    const vs = [sample.av, sample.bv, sample.cv];
    const saVals = saIsU ? us : vs;
    const taVals = saIsU ? vs : us;
    const saMin = Math.min(...saVals);
    const saMax = Math.max(...saVals);
    if (saMax >= boundaryLocal - bandWidth && saMin <= boundaryLocal + bandWidth) {
      intervals.push([Math.min(...taVals), Math.max(...taVals)]);
    }
  }
  if (intervals.length === 0) {
    return null;
  }
  // Union the intervals into continuous runs of material (so a hole/opening splits
  // them), then prefer the run nearest the box centre along ta. A face plane can
  // carry both a corner/filter-slot run (off toward the wall) and a chamber-facing
  // run (toward the centre); picking the central run keeps the code inside the box,
  // not in a filter pocket.
  intervals.sort((p, q) => p[0] - q[0]);
  const runs: Array<{ lo: number; hi: number }> = [];
  let runLo = intervals[0][0];
  let runHi = intervals[0][1];
  for (const [lo, hi] of intervals.slice(1)) {
    if (lo <= runHi + 1) {
      runHi = Math.max(runHi, hi);
    } else {
      runs.push({ lo: runLo, hi: runHi });
      runLo = lo;
      runHi = hi;
    }
  }
  runs.push({ lo: runLo, hi: runHi });

  const taCenter = localBoxCenter[ta];
  const distanceToCenter = (run: { lo: number; hi: number }): number =>
    taCenter < run.lo ? run.lo - taCenter : taCenter > run.hi ? taCenter - run.hi : 0;
  // Only consider runs wide enough to host a glyph; among those pick the one nearest
  // the centre, breaking ties toward the longer run.
  const usable = runs.filter((run) => run.hi - run.lo >= CHUNK_LABEL_CAP_HEIGHT_MM);
  if (usable.length === 0) {
    return null;
  }
  const chosen = usable.reduce((best, run) => {
    const d = distanceToCenter(run);
    const db = distanceToCenter(best);
    if (d < db - 0.5) {
      return run;
    }
    if (d <= db + 0.5 && run.hi - run.lo > best.hi - best.lo) {
      return run;
    }
    return best;
  });
  return { ta, area: chosen.hi - chosen.lo, taCentroid: (chosen.lo + chosen.hi) / 2, taMin: chosen.lo, taMax: chosen.hi };
}

function largestFace(bins: readonly ChunkFaceBin[]): ChunkFaceBin | null {
  return bins.reduce<ChunkFaceBin | null>((best, bin) => (best === null || bin.area > best.area ? bin : best), null);
}

// Fallback ta centre (chunk-local) from the seam's own rectangle, used only when a
// face has no measured band material.
function taSeamMidpoint(seam: ChunkSeamLabel, ta: 0 | 1 | 2, origin: readonly [number, number, number]): number {
  const perp = seamPerpAxes(seam.axis);
  const index = perp[0] === ta ? 0 : 1;
  return (seam.faceMin[index] + seam.faceMax[index]) / 2 - origin[ta];
}

// Place one seam code on one chosen interior face: read it along the seam line,
// centred on the face's material next to the seam, just inside the cut.
// In `strict` mode, returns null if the code cannot fit clear of holes on this
// face (so the caller can try the next face); otherwise places it best-effort.
function seamPlacementOnFace(
  seam: ChunkSeamLabel,
  sa: 0 | 1 | 2,
  boundaryLocal: number,
  host: ChunkFaceBin,
  band: SeamBand | null,
  origin: readonly [number, number, number],
  margin: number,
  strict: boolean,
): SeamDebossPlacement | null {
  const [ui, vi] = IN_PLANE_AXES[host.axis];
  const ta = band !== null ? band.ta : ui === sa ? vi : ui;
  const taPos =
    band !== null
      ? clampToRange(band.taCentroid, [band.taMin, band.taMax], margin * 0.5)
      : clampToRange(taSeamMidpoint(seam, ta, origin), ta === ui ? [host.uMin, host.uMax] : [host.vMin, host.vMax], margin);

  // Sit the code just inside the seam edge, on this chunk's side of the cut.
  const inset = CHUNK_LABEL_CAP_HEIGHT_MM * 0.9;
  const saPos = boundaryLocal - seam.towardNeighbour * inset;

  // Nudge off any opening: the code footprint (reads along ta, height along sa)
  // must stay on solid material and CHUNK_LABEL_HOLE_CLEARANCE_MM clear of holes.
  const halfTa = (estimateCodeWidth(seam.code) / 2) | 0;
  const halfSa = CHUNK_LABEL_CAP_HEIGHT_MM / 2;
  const placed = clearOfHoles(host, sa, saPos, taPos, halfSa, halfTa, CHUNK_LABEL_HOLE_CLEARANCE_MM);
  if (placed === null && strict) {
    return null; // no room clear of holes on this face — let the caller try another
  }
  const finalPos = placed ?? { saPos, taPos };

  const center: [number, number, number] = [0, 0, 0];
  center[host.axis] = host.offset;
  center[sa] = finalPos.saPos;
  center[ta] = finalPos.taPos;
  // Up runs across the seam, into this chunk (away from the neighbour); width then
  // falls along ta, so the code reads parallel to the seam.
  const up: [number, number, number] = [0, 0, 0];
  up[sa] = -seam.towardNeighbour;
  return { code: seam.code, faceAxis: host.axis, faceSign: host.sign, faceOffset: host.offset, center, up };
}

// Keep `value` within [min + margin, max - margin]; if the face is too small for
// the margin, fall back to its midpoint.
function clampToRange(value: number, range: readonly [number, number], margin: number): number {
  const low = range[0] + margin;
  const high = range[1] - margin;
  if (high < low) {
    return (range[0] + range[1]) / 2;
  }
  return Math.max(low, Math.min(high, value));
}

// Roughly how wide the rendered code is (mm). The stroke font advances ~1 cap per
// glyph including spacing; being a touch generous only widens the clearance.
function estimateCodeWidth(code: string): number {
  return Math.max(1, code.length) * CHUNK_LABEL_CAP_HEIGHT_MM;
}

// #######################################
// Hole-Clearance Placement
// #######################################

// A rasterised map of one face: which cells hold solid material, and which empty
// cells are interior HOLES (enclosed openings like a fan grille or screw hole) as
// opposed to the part's outer/cut edge. Clearance is required from holes only, so
// a code can still sit right beside the seam (an outer edge), just not near a hole.
type FaceMaps = {
  readonly u0: number;
  readonly v0: number;
  readonly res: number;
  readonly cols: number;
  readonly rows: number;
  readonly solid: Uint8Array;
  readonly hole: Uint8Array;
};

const FACE_MAP_RES_MM = 1.5;

function buildFaceMaps(host: ChunkFaceBin, clearance: number): FaceMaps {
  const res = FACE_MAP_RES_MM;
  const pad = clearance + res * 2;
  const u0 = host.uMin - pad;
  const v0 = host.vMin - pad;
  const cols = Math.max(1, Math.ceil((host.uMax - host.uMin + 2 * pad) / res));
  const rows = Math.max(1, Math.ceil((host.vMax - host.vMin + 2 * pad) / res));
  const solid = new Uint8Array(cols * rows);
  const sign = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number =>
    (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  for (const s of host.samples) {
    const minU = Math.min(s.au, s.bu, s.cu);
    const maxU = Math.max(s.au, s.bu, s.cu);
    const minV = Math.min(s.av, s.bv, s.cv);
    const maxV = Math.max(s.av, s.bv, s.cv);
    const ci0 = Math.max(0, Math.floor((minU - u0) / res));
    const ci1 = Math.min(cols - 1, Math.floor((maxU - u0) / res));
    const cj0 = Math.max(0, Math.floor((minV - v0) / res));
    const cj1 = Math.min(rows - 1, Math.floor((maxV - v0) / res));
    for (let cj = cj0; cj <= cj1; cj += 1) {
      const py = v0 + (cj + 0.5) * res;
      for (let ci = ci0; ci <= ci1; ci += 1) {
        const px = u0 + (ci + 0.5) * res;
        const d1 = sign(px, py, s.au, s.av, s.bu, s.bv);
        const d2 = sign(px, py, s.bu, s.bv, s.cu, s.cv);
        const d3 = sign(px, py, s.cu, s.cv, s.au, s.av);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) {
          solid[cj * cols + ci] = 1;
        }
      }
    }
  }
  // Flood empty cells from the border: those are "outside" the part. Empty cells
  // never reached are enclosed holes.
  const outside = new Uint8Array(cols * rows);
  const stack: number[] = [];
  const visit = (index: number): void => {
    if (solid[index] === 0 && outside[index] === 0) {
      outside[index] = 1;
      stack.push(index);
    }
  };
  for (let ci = 0; ci < cols; ci += 1) {
    visit(ci);
    visit((rows - 1) * cols + ci);
  }
  for (let cj = 0; cj < rows; cj += 1) {
    visit(cj * cols);
    visit(cj * cols + cols - 1);
  }
  while (stack.length > 0) {
    const index = stack.pop()!;
    const ci = index % cols;
    const cj = (index - ci) / cols;
    if (ci > 0) visit(index - 1);
    if (ci < cols - 1) visit(index + 1);
    if (cj > 0) visit(index - cols);
    if (cj < rows - 1) visit(index + cols);
  }
  const hole = new Uint8Array(cols * rows);
  for (let i = 0; i < hole.length; i += 1) {
    hole[i] = solid[i] === 0 && outside[i] === 0 ? 1 : 0;
  }
  return { u0, v0, res, cols, rows, solid, hole };
}

// Every cell covering [uLo,uHi] x [vLo,vHi] is solid (the code footprint lands on
// material, so glyphs are not clipped by an edge or hole).
function rectOnSolid(maps: FaceMaps, uLo: number, uHi: number, vLo: number, vHi: number): boolean {
  const ci0 = Math.floor((uLo - maps.u0) / maps.res);
  const ci1 = Math.floor((uHi - maps.u0) / maps.res);
  const cj0 = Math.floor((vLo - maps.v0) / maps.res);
  const cj1 = Math.floor((vHi - maps.v0) / maps.res);
  for (let cj = cj0; cj <= cj1; cj += 1) {
    for (let ci = ci0; ci <= ci1; ci += 1) {
      if (ci < 0 || ci >= maps.cols || cj < 0 || cj >= maps.rows || maps.solid[cj * maps.cols + ci] === 0) {
        return false;
      }
    }
  }
  return true;
}

// No hole cell lies within `clearance` of [uLo,uHi] x [vLo,vHi].
function rectClearOfHoles(maps: FaceMaps, uLo: number, uHi: number, vLo: number, vHi: number, clearance: number): boolean {
  const ci0 = Math.max(0, Math.floor((uLo - clearance - maps.u0) / maps.res));
  const ci1 = Math.min(maps.cols - 1, Math.floor((uHi + clearance - maps.u0) / maps.res));
  const cj0 = Math.max(0, Math.floor((vLo - clearance - maps.v0) / maps.res));
  const cj1 = Math.min(maps.rows - 1, Math.floor((vHi + clearance - maps.v0) / maps.res));
  for (let cj = cj0; cj <= cj1; cj += 1) {
    for (let ci = ci0; ci <= ci1; ci += 1) {
      if (maps.hole[cj * maps.cols + ci] === 1) {
        return false;
      }
    }
  }
  return true;
}

// No part edge (an "outside" cell, or off the map) lies within `clearance` of
// [uLo,uHi] x [vLo,vHi] — keeps the code off the outer/cut edges.
function rectClearOfEdges(maps: FaceMaps, uLo: number, uHi: number, vLo: number, vHi: number, clearance: number): boolean {
  const ci0 = Math.floor((uLo - clearance - maps.u0) / maps.res);
  const ci1 = Math.floor((uHi + clearance - maps.u0) / maps.res);
  const cj0 = Math.floor((vLo - clearance - maps.v0) / maps.res);
  const cj1 = Math.floor((vHi + clearance - maps.v0) / maps.res);
  for (let cj = cj0; cj <= cj1; cj += 1) {
    for (let ci = ci0; ci <= ci1; ci += 1) {
      if (ci < 0 || ci >= maps.cols || cj < 0 || cj >= maps.rows) {
        return false;
      }
      const index = cj * maps.cols + ci;
      // "outside" = empty cell that is not an enclosed hole (i.e. beyond a part edge).
      if (maps.solid[index] === 0 && maps.hole[index] === 0) {
        return false;
      }
    }
  }
  return true;
}

// Nudge a code so its footprint stays on solid material, `clearance` clear of holes,
// and CHUNK_LABEL_EDGE_CLEARANCE_MM clear of the part's outer/cut edges; it prefers
// to slide along the seam (ta) over moving off it (sa).
function clearOfHoles(
  host: ChunkFaceBin,
  sa: 0 | 1 | 2,
  saPos: number,
  taPos: number,
  halfSa: number,
  halfTa: number,
  clearance: number,
): { saPos: number; taPos: number } | null {
  const [ui] = IN_PLANE_AXES[host.axis];
  const saIsU = ui === sa;
  const halfU = saIsU ? halfSa : halfTa;
  const halfV = saIsU ? halfTa : halfSa;
  const maps = buildFaceMaps(host, Math.max(clearance, CHUNK_LABEL_EDGE_CLEARANCE_MM));
  const ok = (saC: number, taC: number): boolean => {
    const uC = saIsU ? saC : taC;
    const vC = saIsU ? taC : saC;
    return (
      rectOnSolid(maps, uC - halfU, uC + halfU, vC - halfV, vC + halfV) &&
      rectClearOfHoles(maps, uC - halfU, uC + halfU, vC - halfV, vC + halfV, clearance) &&
      rectClearOfEdges(maps, uC - halfU, uC + halfU, vC - halfV, vC + halfV, CHUNK_LABEL_EDGE_CLEARANCE_MM)
    );
  };
  if (ok(saPos, taPos)) {
    return { saPos, taPos };
  }
  let best: { saPos: number; taPos: number } | null = null;
  let bestCost = Infinity;
  const step = 2;
  for (let dTa = -60; dTa <= 60; dTa += step) {
    for (let dSa = -30; dSa <= 30; dSa += step) {
      const cost = Math.abs(dTa) + 1.5 * Math.abs(dSa);
      if (cost >= bestCost) {
        continue;
      }
      if (ok(saPos + dSa, taPos + dTa)) {
        best = { saPos: saPos + dSa, taPos: taPos + dTa };
        bestCost = cost;
      }
    }
  }
  return best; // null if no position keeps the footprint on material and clear of holes
}

function buildChunkPart(
  address: ChunkAddress,
  bounds: ChunkBounds,
  mesh: ReturnType<typeof extractWeldedMesh>,
  letter?: string,
): PrintablePart {
  const [width, depth, height] = bounds.size;
  const [originX, originY, originZ] = bounds.origin;
  return {
    id: `tempest-chunk-${address.x}-${address.y}-${address.z}`,
    // Name by the chunk letter (A, B, ...) when the print is split, so the export
    // filename reads "chunk-a.3mf" and matches the embossed assembly-guide letter.
    name: letter !== undefined ? `Chunk ${letter}` : `Tempest chunk ${address.x},${address.y},${address.z}`,
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

