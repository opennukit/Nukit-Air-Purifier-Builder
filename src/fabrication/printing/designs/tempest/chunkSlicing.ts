import type { TempestChunkGrid, TempestModel, TempestPrintablePose } from "@/domain/designs/tempest/model";
import { matchTopology } from "@/domain/designs/tempest/topology";

// #######################################
// Feature-Aware Print-Chunk Slicing
// #######################################

// Splits the posed model into bed-sized print chunks whose seams avoid slicing
// through fan grills. Grills are the fragile, hard-to-glue features; a seam
// through one ruins the part. Following Naomi's OpenSCAD/JSCAD builder, each
// candidate seam is snapped out of the "bands" the grills occupy.
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

const SEAM_GAP_MM = 0.5; // a seam must clear the previous one (and the bed edge) by at least this
const GRILL_MARGIN_MM = 2; // grill keep-out band radius padding beyond the fan radius

export function featureAwarePrintableChunkGrid(
  model: TempestModel,
  pose: TempestPrintablePose,
  bed: { readonly width: number; readonly depth: number; readonly height: number },
): TempestChunkGrid {
  const radius = model.settings.fan.diameter / 2 + GRILL_MARGIN_MM;
  const bands = grillBandsInPose(model, pose, radius);
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
      return [
        ...fanLayout.walls.front.positionsAlongWall.map((p): GrillCentre => [p, wall, z]),
        ...fanLayout.walls.back.positionsAlongWall.map((p): GrillCentre => [box.width - p, box.depth - wall, z]),
        ...fanLayout.walls.left.positionsAlongWall.map((p): GrillCentre => [wall, box.depth - p, z]),
        ...fanLayout.walls.right.positionsAlongWall.map((p): GrillCentre => [box.width - wall, p, z]),
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
// Axis Cuts
// #######################################

// Boundaries that keep each chunk <= bed AND keep all seams out of `bands`,
// adding chunks as needed and staying as even as possible. Ported from Naomi's
// builder.
function axisCuts(length: number, bed: number, bands: readonly Band[]): number[] {
  const merged = mergeBands(bands);
  const minCount = Math.max(1, Math.ceil(length / bed));
  if (merged.length === 0) {
    return uniformBoundaries(length, minCount);
  }
  const gaps = gapsBetween(merged, length);
  const snap = (position: number): number => {
    for (const [low, high] of gaps) {
      if (position >= low - 0.01 && position <= high + 0.01) {
        return position;
      }
    }
    let best = position;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [low, high] of gaps) {
      for (const edge of [low, high]) {
        const distance = Math.abs(edge - position);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = edge;
        }
      }
    }
    return best;
  };

  for (let count = minCount; count <= 16; count += 1) {
    const seams: number[] = [];
    let ok = true;
    let previous = 0;
    for (let index = 1; index < count; index += 1) {
      const seam = snap((index * length) / count);
      if (seam <= previous + SEAM_GAP_MM || seam - previous > bed + SEAM_GAP_MM) {
        ok = false;
        break;
      }
      seams.push(Number(seam.toFixed(4)));
      previous = seam;
    }
    if (ok && length - previous <= bed + SEAM_GAP_MM) {
      return [0, ...seams, length];
    }
  }
  return uniformBoundaries(length, minCount);
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
