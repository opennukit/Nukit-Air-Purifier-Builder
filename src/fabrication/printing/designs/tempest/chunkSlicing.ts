import type { TempestChunkGrid, TempestModel, TempestPrintablePose } from "@/domain/designs/tempest/model";
import { matchTopology } from "@/domain/designs/tempest/topology";

// #######################################
// Feature-Aware Print-Chunk Slicing
// #######################################

// Splits the posed model into bed-sized print chunks whose seams avoid slicing
// through fragile features: fan grills, and thin internal walls such as the
// inside filter flanges. A seam through a grill ruins the part; a seam through a
// thin flange splits it into weak slivers. Following Naomi's OpenSCAD/JSCAD
// builder, each candidate seam is snapped out of the "bands" those features
// occupy (grill keep-outs below; thin-wall keep-outs in internalWallBandsInPose).
//
// Band model: every grill is treated as a sphere of radius R around its centre,
// so a seam on axis A is blocked whenever it falls within R of a grill centre on
// A. A real grill spans ±R on its two in-plane axes and is thin on its normal
// axis, so this is SAFE — it can never leave a grill-cutting seam unblocked. It
// can over-block on a grill's normal axis, but only near the walls where no
// interior seam falls, so the over-blocking is harmless.

type Band = readonly [number, number];
type GrillCentre = readonly [number, number, number];
type AxisBands = { readonly x: Band[]; readonly y: Band[]; readonly z: Band[] };

const EPS = 1e-6;
// Every print chunk must be at least this big on each axis, so a feature-avoidance
// seam can never isolate a thin, hard-to-handle sliver or crowd the alignment pins.
// When honoring it would force a seam through a fragile feature, the slicer adds
// another plate instead (more, chunkier plates beat fewer slivered ones). It is
// relaxed toward smaller chunks only when a model is so constrained that 40 mm is
// impossible, and never relaxed by cutting a feature.
const MIN_CHUNK_MM = 40;
const GRILL_MARGIN_MM = 2; // grill keep-out band radius padding beyond the fan radius
// A seam must clear a thin internal wall (e.g. the inside filter flanges) by at
// least this on the wall's thin axis, so it is never split into weak slivers.
const WALL_SEAM_CLEARANCE_MM = 2;

export function featureAwarePrintableChunkGrid(
  model: TempestModel,
  pose: TempestPrintablePose,
  bed: { readonly width: number; readonly depth: number; readonly height: number },
): TempestChunkGrid {
  const radius = model.settings.fan.diameter / 2 + GRILL_MARGIN_MM;
  const grill = grillBandsInPose(model, pose, radius);
  const wall = internalWallBandsInPose(model, pose);
  const rim = towerOpeningRimBandsInPose(model, pose);
  // Every fragile feature is a HARD keep-out: a chunk seam never cuts a fan grill
  // (slicing one ruins a hex grill), never bisects a thin inside flange into a
  // sliver, and never shaves a filter-opening rim into a detached stick. When
  // honoring them needs more plates on a small bed, the slicer adds plates, a
  // higher part count is always preferred to a cut feature.
  const bands = matchTopology(model, {
    quad: () => mergeAxisBands(mergeAxisBands(grill, wall), rim),
    sandwich: () => mergeAxisBands(grill, wall),
  });
  return chunkGridFromBoundaries(
    axisCuts(pose.envelope.width, bed.width, bands.x),
    axisCuts(pose.envelope.depth, bed.depth, bands.y),
    axisCuts(pose.envelope.height, bed.height, bands.z),
  );
}

// Maps the posed (cut-frame) grid back to source coordinates for the geometry's
// alignment-pin placement, so pins land on the same planes the chunks are cut on.
export function sourceChunkGridForPose(pose: TempestPrintablePose, printableGrid: TempestChunkGrid): TempestChunkGrid {
  if (pose.type === "source") {
    return printableGrid;
  }
  // upright-dual-filter rotates source (x,y,z) -> pose (x, boxHeight - z, y), with
  // boxHeight == pose.envelope.depth. Invert per axis: sourceX = poseX,
  // sourceY = poseZ, sourceZ = boxHeight - poseY.
  const boxHeight = pose.envelope.depth;
  return chunkGridFromBoundaries(
    [...printableGrid.boundariesX],
    [...printableGrid.boundariesZ],
    [...printableGrid.boundariesY].map((boundary) => boxHeight - boundary).sort((a, b) => a - b),
  );
}

export function chunkGridFromBoundaries(
  boundariesX: readonly number[],
  boundariesY: readonly number[],
  boundariesZ: readonly number[],
): TempestChunkGrid {
  const countX = boundariesX.length - 1;
  const countY = boundariesY.length - 1;
  const countZ = boundariesZ.length - 1;
  return {
    countX,
    countY,
    countZ,
    totalCount: countX * countY * countZ,
    chunkWidth: largestGap(boundariesX),
    chunkDepth: largestGap(boundariesY),
    chunkHeight: largestGap(boundariesZ),
    boundariesX,
    boundariesY,
    boundariesZ,
  };
}

// #######################################
// Grill Bands
// #######################################

function grillBandsInPose(model: TempestModel, pose: TempestPrintablePose, radius: number): AxisBands {
  const bands: AxisBands = { x: [], y: [], z: [] };
  for (const centre of grillCentresSource(model)) {
    const [px, py, pz] = toPose(centre, pose);
    bands.x.push([px - radius, px + radius]);
    bands.y.push([py - radius, py + radius]);
    bands.z.push([pz - radius, pz + radius]);
  }
  return bands;
}

// Fan-grill centres in source (model) coordinates. Wall positions are local to
// each wall, so they are mapped through the same placement the geometry uses.
function grillCentresSource(model: TempestModel): GrillCentre[] {
  const { box, frame } = model;
  return matchTopology(model, {
    sandwich: ({ fanLayout }) => {
      const z = frame.outsideFlangeThickness + fanLayout.localVerticalCenter;
      const wall = frame.wallThickness / 2;
      // The "Back" grid lies flat in the bottom plate (normal +z), centred on its
      // thickness.
      const plateZ = frame.outsideFlangeThickness / 2;
      return [
        ...fanLayout.walls.front.positionsAlongWall.map((p): GrillCentre => [p, wall, z]),
        ...fanLayout.walls.back.positionsAlongWall.map((p): GrillCentre => [box.width - p, box.depth - wall, z]),
        ...fanLayout.walls.left.positionsAlongWall.map((p): GrillCentre => [wall, box.depth - p, z]),
        ...fanLayout.walls.right.positionsAlongWall.map((p): GrillCentre => [box.width - wall, p, z]),
        ...fanLayout.bottomPlate.positions.map(({ x, y }): GrillCentre => [x, y, plateZ]),
      ];
    },
    quad: ({ fanLayout, filterLayout }) => {
      // The box-exhaust hole needs no fan-grill seam avoidance.
      if (fanLayout.topExhaust === "box-exhaust") {
        return [];
      }
      const z = box.height - filterLayout.topPlateThickness / 2;
      return fanLayout.positionsX.flatMap((x) => fanLayout.positionsY.map((y): GrillCentre => [x, y, z]));
    },
  });
}

function toPose([x, y, z]: GrillCentre, pose: TempestPrintablePose): GrillCentre {
  if (pose.type === "upright-dual-filter") {
    return [x, pose.envelope.depth - z, y];
  }
  return [x, y, z];
}

// #######################################
// Internal-Wall Bands
// #######################################

// Keep-out bands for thin internal walls whose thin dimension runs along a seam
// axis. The sandwich's inside filter flanges are thin horizontal slabs (thin in
// source Z); a seam perpendicular to that axis bisects them into weak slivers,
// so we block the seam across each slab's extent (plus a clearance) on whichever
// pose axis source Z maps to. A seam on the other axes only crosses the slab's
// large face, which is fine, so no band is needed there.
function internalWallBandsInPose(model: TempestModel, pose: TempestPrintablePose): AxisBands {
  const bands: AxisBands = { x: [], y: [], z: [] };
  const thinZSlabs = matchTopology(model, {
    sandwich: ({ filterLayout }): Band[] =>
      filterLayout.flanges.map((flange) => [flange.zBottom, flange.zTop]),
    quad: (): Band[] => [],
  });
  for (const [zBottom, zTop] of thinZSlabs) {
    const low = zBottom - WALL_SEAM_CLEARANCE_MM;
    const high = zTop + WALL_SEAM_CLEARANCE_MM;
    if (pose.type === "upright-dual-filter") {
      // Source Z maps to pose Y as (envelope.depth - z), which flips the range.
      bands.y.push([pose.envelope.depth - high, pose.envelope.depth - low]);
    } else {
      bands.z.push([low, high]);
    }
  }
  return bands;
}

function mergeAxisBands(a: AxisBands, b: AxisBands): AxisBands {
  return { x: [...a.x, ...b.x], y: [...a.y, ...b.y], z: [...a.z, ...b.z] };
}

// #######################################
// Tower Opening-Rim Bands
// #######################################

// A tower carries a big square opening (the filter face minus its rim) through the
// bottom flange, the bottom plate, and each side wall. The plate/flange rim around
// that opening is only `rim` wide, so a seam landing a few mm short of an opening
// EDGE clips off a thin strip of that rim, a detached stick once the pocket void
// separates the flange band from the plate band. Material sits OUTSIDE the opening,
// so we forbid a seam within one min-chunk of an edge on the material side: a seam
// AT the edge (a clean cut flush with the void) or a full min-chunk clear is fine,
// anything between shaves a sliver. X and Y both carry the square opening's edges;
// Z runs along the opening so no rim is shaved there.
function towerOpeningRimBandsInPose(model: TempestModel, pose: TempestPrintablePose): AxisBands {
  const empty: AxisBands = { x: [], y: [], z: [] };
  return matchTopology(model, {
    sandwich: () => empty,
    quad: ({ filterLayout }) => {
      const openHalf = (filterLayout.filter.faceWidth - 2 * model.frame.rim) / 2;
      // The tower prints in the source pose (no upright rotation), so source X/Y map
      // straight to pose X/Y; bail to no bands if that ever changes.
      if (openHalf <= 0 || pose.type === "upright-dual-filter") {
        return empty;
      }
      const edgeBands = (center: number): Band[] => [
        [center - openHalf - MIN_CHUNK_MM, center - openHalf],
        [center + openHalf, center + openHalf + MIN_CHUNK_MM],
      ];
      return { x: edgeBands(model.box.width / 2), y: edgeBands(model.box.depth / 2), z: [] };
    },
  });
}

// #######################################
// Axis Cuts
// #######################################

// Boundaries whose seams all stay out of `bands` (every fragile feature: fan grills,
// thin inside flanges, filter-opening rims), as even as possible. A fan grill is
// never cut, slicing one ruins a hex grill, so when a slice count cannot clear
// every feature the slicer adds a slice (another plate); more plates are always
// preferred to a cut feature. When a model is so constrained that even a small
// minimum chunk is impossible, it lowers the minimum before ever cutting a feature.
// Ported and hardened from Naomi's builder.
export function axisCuts(length: number, bed: number, bands: readonly Band[]): number[] {
  if (length <= bed) {
    return [0, length]; // fits the bed whole; never cut a part that does not need it
  }
  const gaps = gapsBetween(mergeBands(bands), length);
  const minCount = Math.ceil(length / bed);
  // Prefer the target minimum; relax toward smaller chunks only for a model too
  // constrained to honor it. Seams always stay in `gaps`, so relaxing never cuts a
  // feature, it only permits smaller chunks as a last resort.
  for (const minChunk of [MIN_CHUNK_MM, 20, 8, 1]) {
    const maxCount = Math.min(24, Math.max(minCount, Math.floor(length / minChunk)));
    for (let count = minCount; count <= maxCount; count += 1) {
      const seams = solveSeams(count, length, bed, gaps, minChunk);
      if (seams !== null) {
        return [0, ...seams, length];
      }
    }
  }
  return uniformBoundaries(length, minCount); // last resort: a keep-out wider than the bed
}

// Places count-1 interior seams, each inside a feature-free gap, so every chunk is
// within [minChunk, bed]. Best-first over gap-snapped candidates with backtracking,
// each seam preferring the position closest to its even split so the result stays
// balanced. Returns null when this count cannot be satisfied.
function solveSeams(count: number, length: number, bed: number, gaps: readonly Band[], minChunk: number): number[] | null {
  const place = (index: number, previous: number): number[] | null => {
    if (index === count) {
      const last = length - previous;
      return last >= minChunk - EPS && last <= bed + EPS ? [] : null;
    }
    const remaining = count - index; // chunks that follow this seam
    const low = Math.max(previous + minChunk, length - remaining * bed);
    const high = Math.min(previous + bed, length - remaining * minChunk);
    if (low > high + EPS) {
      return null;
    }
    const target = clamp((index * length) / count, low, high);
    for (const candidate of gapCandidates(gaps, low, high, target)) {
      const rest = place(index + 1, candidate);
      if (rest !== null) {
        return [Number(candidate.toFixed(4)), ...rest];
      }
    }
    return null;
  };
  return place(1, 0);
}

// Seam positions inside [low, high] that lie in a feature-free gap, ordered by
// closeness to `target` so the search prefers the most even split.
function gapCandidates(gaps: readonly Band[], low: number, high: number, target: number): number[] {
  const candidates = new Set<number>();
  for (const [gapLow, gapHigh] of gaps) {
    const windowLow = Math.max(gapLow, low);
    const windowHigh = Math.min(gapHigh, high);
    if (windowLow <= windowHigh + EPS) {
      candidates.add(clamp(target, windowLow, windowHigh));
      candidates.add(windowLow);
      candidates.add(windowHigh);
    }
  }
  return [...candidates].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function mergeBands(bands: readonly Band[]): Band[] {
  const sorted = bands.filter(([low, high]) => high > low).slice().sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [low, high] of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && low <= last[1]) {
      last[1] = Math.max(last[1], high);
    } else {
      merged.push([low, high]);
    }
  }
  return merged;
}

function gapsBetween(merged: readonly Band[], length: number): Band[] {
  const gaps: Band[] = [];
  let cursor = 0;
  for (const [low, high] of merged) {
    if (low > cursor) {
      gaps.push([cursor, low]);
    }
    cursor = Math.max(cursor, high);
  }
  if (cursor < length) {
    gaps.push([cursor, length]);
  }
  return gaps;
}

function uniformBoundaries(length: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (length * index) / count);
}

function largestGap(boundaries: readonly number[]): number {
  let largest = 0;
  for (let index = 1; index < boundaries.length; index += 1) {
    largest = Math.max(largest, boundaries[index] - boundaries[index - 1]);
  }
  return largest;
}
