import { describe, expect, test } from "bun:test";
import type { TempestChunkGrid } from "@/domain/designs/tempest/model";
import {
  cellKey,
  chunkLabel,
  planChunkLabels,
  seamCode,
} from "@/fabrication/printing/designs/tempest/geometry/chunkLabels";

function uniformGrid(countX: number, countY: number, countZ: number, step = 100): TempestChunkGrid {
  const axis = (count: number) => Array.from({ length: count + 1 }, (_, i) => i * step);
  return {
    countX,
    countY,
    countZ,
    totalCount: countX * countY * countZ,
    chunkWidth: step,
    chunkDepth: step,
    chunkHeight: step,
    boundariesX: axis(countX),
    boundariesY: axis(countY),
    boundariesZ: axis(countZ),
  };
}

function allOccupied(grid: TempestChunkGrid): Set<string> {
  const set = new Set<string>();
  for (let z = 0; z < grid.countZ; z += 1) {
    for (let y = 0; y < grid.countY; y += 1) {
      for (let x = 0; x < grid.countX; x += 1) {
        set.add(cellKey({ x, y, z }));
      }
    }
  }
  return set;
}

describe("chunk labels", () => {
  test("letters cycle then gain a group number after Z", () => {
    expect(chunkLabel(0)).toBe("A");
    expect(chunkLabel(25)).toBe("Z");
    expect(chunkLabel(26)).toBe("A1");
    expect(chunkLabel(27)).toBe("B1");
    expect(chunkLabel(51)).toBe("Z1");
    expect(chunkLabel(52)).toBe("A2");
  });

  test("seam code is order-independent", () => {
    expect(seamCode("A", "B")).toBe("AB");
    expect(seamCode("B", "A")).toBe("AB");
    expect(seamCode("A1", "B")).toBe(seamCode("B", "A1"));
  });

  test("assigns letters to occupied cells in z,y,x order", () => {
    const grid = uniformGrid(2, 2, 1);
    const { labels } = planChunkLabels(grid, allOccupied(grid));
    expect(labels.get(cellKey({ x: 0, y: 0, z: 0 }))).toBe("A");
    expect(labels.get(cellKey({ x: 1, y: 0, z: 0 }))).toBe("B");
    expect(labels.get(cellKey({ x: 0, y: 1, z: 0 }))).toBe("C");
    expect(labels.get(cellKey({ x: 1, y: 1, z: 0 }))).toBe("D");
  });

  test("emits each seam from both sides with a shared code", () => {
    const grid = uniformGrid(2, 2, 1);
    const { seams } = planChunkLabels(grid, allOccupied(grid));
    // 4 unique seams (AB, CD, AC, BD), each emitted from both chunks.
    expect(seams).toHaveLength(8);
    const codes = seams.map((s) => s.code).sort();
    expect(codes).toEqual(["AB", "AB", "AC", "AC", "BD", "BD", "CD", "CD"]);
    // The A|B seam: A sees the neighbour on its +x side at the x=100 boundary.
    const fromA = seams.find((s) => s.label === "A" && s.code === "AB");
    expect(fromA).toMatchObject({ axis: "x", boundary: 100, towardNeighbour: 1 });
    const fromB = seams.find((s) => s.label === "B" && s.code === "AB");
    expect(fromB).toMatchObject({ axis: "x", boundary: 100, towardNeighbour: -1 });
  });

  test("skips seams toward an unoccupied neighbour and its letter", () => {
    const grid = uniformGrid(2, 1, 1);
    const occupied = new Set([cellKey({ x: 0, y: 0, z: 0 })]); // only one chunk
    const { labels, seams } = planChunkLabels(grid, occupied);
    expect(labels.size).toBe(1);
    expect(seams).toHaveLength(0);
  });

  test("face rectangle spans the neighbouring cell's other two axes", () => {
    const grid = uniformGrid(2, 2, 1, 100);
    const { seams } = planChunkLabels(grid, allOccupied(grid));
    const fromA = seams.find((s) => s.label === "A" && s.code === "AB")!;
    // x-seam: face spans y in [0,100] and z in [0,100].
    expect(fromA.faceMin).toEqual([0, 0]);
    expect(fromA.faceMax).toEqual([100, 100]);
  });
});
