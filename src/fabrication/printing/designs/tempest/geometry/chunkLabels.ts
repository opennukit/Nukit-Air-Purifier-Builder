import type { TempestChunkGrid } from "@/domain/designs/tempest/model";

// #######################################
// Chunk Labels & Seam Codes (pure)
// #######################################

// Each printed chunk gets a letter so the assembly guide can say which pieces
// glue together. The seam between two chunks is debossed with both letters (the
// "seam code"), so you match a part to the one carrying the same code. This
// module is the pure planning layer: letter assignment, code formatting, and the
// per-seam geometry anchors. The geometry layer turns the anchors into debossed
// glyphs; nothing here touches the CSG kernel.

// 0 -> A, 25 -> Z, 26 -> A1, 27 -> B1 ... so a 27th chunk reads "A1". The letter
// cycles every 26; the group number (blank for the first cycle) disambiguates.
export function chunkLabel(index: number): string {
  const letter = String.fromCharCode("A".charCodeAt(0) + (index % 26));
  const group = Math.floor(index / 26);
  return group === 0 ? letter : `${letter}${group}`;
}

// The shared code for a seam: both chunk letters, ordered so each side computes
// the same string (you find the matching part by reading the identical code).
export function seamCode(labelA: string, labelB: string): string {
  return labelA <= labelB ? `${labelA}${labelB}` : `${labelB}${labelA}`;
}

export type ChunkCell = { readonly x: number; readonly y: number; readonly z: number };

export type SeamAxis = "x" | "y" | "z";

// One chunk's view of a seam it shares with a neighbour: the code to deboss, the
// axis the seam cuts across, the boundary coordinate, the sign pointing from this
// chunk toward the neighbour, and the shared face rectangle on the other two
// axes (where the code can sit). All in the frame of the supplied chunk grid.
export type ChunkSeamLabel = {
  readonly cell: ChunkCell;
  readonly label: string;
  readonly code: string;
  readonly axis: SeamAxis;
  readonly boundary: number;
  // +1 when the neighbour is on the higher-coordinate side of this chunk.
  readonly towardNeighbour: 1 | -1;
  readonly faceMin: readonly [number, number];
  readonly faceMax: readonly [number, number];
};

export type ChunkLabelPlan = {
  readonly labels: ReadonlyMap<string, string>;
  readonly seams: readonly ChunkSeamLabel[];
};

export function cellKey(cell: ChunkCell): string {
  return `${cell.x},${cell.y},${cell.z}`;
}

// The two axes that span a seam whose normal is `axis` (the face rectangle axes).
function faceAxes(axis: SeamAxis): readonly [SeamAxis, SeamAxis] {
  if (axis === "x") {
    return ["y", "z"];
  }
  if (axis === "y") {
    return ["x", "z"];
  }
  return ["x", "y"];
}

function boundariesFor(grid: TempestChunkGrid, axis: SeamAxis): readonly number[] {
  return axis === "x" ? grid.boundariesX : axis === "y" ? grid.boundariesY : grid.boundariesZ;
}

function cellIndex(cell: ChunkCell, axis: SeamAxis): number {
  return axis === "x" ? cell.x : axis === "y" ? cell.y : cell.z;
}

// Assign letters to the occupied cells (in z, then y, then x order — bottom layer
// first, matching the part build order) and enumerate every seam between two
// occupied neighbours, producing each side's debossable code + anchor rectangle.
export function planChunkLabels(grid: TempestChunkGrid, occupied: ReadonlySet<string>): ChunkLabelPlan {
  const labels = new Map<string, string>();
  let next = 0;
  for (let z = 0; z < grid.countZ; z += 1) {
    for (let y = 0; y < grid.countY; y += 1) {
      for (let x = 0; x < grid.countX; x += 1) {
        const key = cellKey({ x, y, z });
        if (occupied.has(key)) {
          labels.set(key, chunkLabel(next));
          next += 1;
        }
      }
    }
  }

  const seams: ChunkSeamLabel[] = [];
  const addSeam = (cell: ChunkCell, neighbour: ChunkCell, axis: SeamAxis): void => {
    const cellLabel = labels.get(cellKey(cell));
    const neighbourLabel = labels.get(cellKey(neighbour));
    if (cellLabel === undefined || neighbourLabel === undefined) {
      return;
    }
    const higher = cellIndex(neighbour, axis) > cellIndex(cell, axis);
    const boundary = boundariesFor(grid, axis)[higher ? cellIndex(neighbour, axis) : cellIndex(cell, axis)];
    const [u, v] = faceAxes(axis);
    const ub = boundariesFor(grid, u);
    const vb = boundariesFor(grid, v);
    seams.push({
      cell,
      label: cellLabel,
      code: seamCode(cellLabel, neighbourLabel),
      axis,
      boundary,
      towardNeighbour: higher ? 1 : -1,
      faceMin: [ub[cellIndex(cell, u)], vb[cellIndex(cell, v)]],
      faceMax: [ub[cellIndex(cell, u) + 1], vb[cellIndex(cell, v) + 1]],
    });
  };

  for (let z = 0; z < grid.countZ; z += 1) {
    for (let y = 0; y < grid.countY; y += 1) {
      for (let x = 0; x < grid.countX; x += 1) {
        const cell = { x, y, z };
        if (!occupied.has(cellKey(cell))) {
          continue;
        }
        // Only the +side neighbours, so each seam is emitted once per chunk pair
        // from each side (both sides get the same code).
        if (x + 1 < grid.countX) {
          addSeam(cell, { x: x + 1, y, z }, "x");
          addSeam({ x: x + 1, y, z }, cell, "x");
        }
        if (y + 1 < grid.countY) {
          addSeam(cell, { x, y: y + 1, z }, "y");
          addSeam({ x, y: y + 1, z }, cell, "y");
        }
        if (z + 1 < grid.countZ) {
          addSeam(cell, { x, y, z: z + 1 }, "z");
          addSeam({ x, y, z: z + 1 }, cell, "z");
        }
      }
    }
  }

  return { labels, seams };
}
