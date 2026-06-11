import { describe, expect, test } from "bun:test";
import { chunkSeamExplodeOffsetsMillimeters } from "@/rendering/three/preview/sceneMath";
import { tempestChunkSeamExplodeFraction } from "@/rendering/three/preview/previewData";

describe("chunk seam explode offsets", () => {
  test("displaces each chunk outward from the assembly center along the seam normal", () => {
    const offsets = chunkSeamExplodeOffsetsMillimeters([
      { min: [0, 0, 0], size: [100, 50, 50] },
      { min: [100, 0, 0], size: [100, 50, 50] },
    ]);

    // Assembly is 200×50×50, so the explode distance is 15% of 200 mm, and the
    // two chunks part along the x seam only.
    const expectedDistance = 200 * tempestChunkSeamExplodeFraction;
    expect(offsets).toHaveLength(2);
    expect(offsets[0][0]).toBeCloseTo(-expectedDistance, 6);
    expect(offsets[1][0]).toBeCloseTo(expectedDistance, 6);
    expect(offsets[0].slice(1)).toEqual([0, 0]);
    expect(offsets[1].slice(1)).toEqual([0, 0]);
  });

  test("keeps a chunk centered on the assembly in place", () => {
    const offsets = chunkSeamExplodeOffsetsMillimeters([
      { min: [0, 0, 0], size: [100, 100, 100] },
      { min: [100, 0, 0], size: [100, 100, 100] },
      { min: [200, 0, 0], size: [100, 100, 100] },
    ]);

    expect(offsets[1]).toEqual([0, 0, 0]);
    expect(offsets[0][0]).toBeLessThan(0);
    expect(offsets[2][0]).toBeGreaterThan(0);
  });

  test("a corner chunk of a 2x2x2 grid moves diagonally away from the center", () => {
    const cells: { readonly min: readonly [number, number, number]; readonly size: readonly [number, number, number] }[] = [];
    for (const x of [0, 100]) {
      for (const y of [0, 100]) {
        for (const z of [0, 100]) {
          cells.push({ min: [x, y, z], size: [100, 100, 100] });
        }
      }
    }

    const offsets = chunkSeamExplodeOffsetsMillimeters(cells);
    const expectedDistance = 200 * tempestChunkSeamExplodeFraction;
    for (const [index, offset] of offsets.entries()) {
      const cell = cells[index];
      const magnitude = Math.hypot(...offset);
      expect(magnitude).toBeCloseTo(expectedDistance, 6);
      for (const axis of [0, 1, 2] as const) {
        const outwardSign = cell.min[axis] === 0 ? -1 : 1;
        expect(Math.sign(offset[axis])).toBe(outwardSign);
      }
    }
  });
});
