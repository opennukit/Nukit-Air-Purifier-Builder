import { describe, expect, test } from "bun:test";
import { chunkSeamExplodeOffsetsMillimeters } from "@/rendering/three/preview/sceneMath";
import { tempestChunkSeamExplodeFraction } from "@/rendering/three/preview/previewData";

describe("chunk seam explode offsets", () => {
  test("displaces each chunk outward proportionally to its center offset", () => {
    const offsets = chunkSeamExplodeOffsetsMillimeters([
      { min: [0, 0, 0], size: [100, 50, 50] },
      { min: [100, 0, 0], size: [100, 50, 50] },
    ]);

    // Chunk centers sit ±50 mm from the assembly center, so each moves by
    // 50 × fraction and the seam opens by pitch (100) × fraction.
    const expectedDistance = 50 * tempestChunkSeamExplodeFraction;
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

  test("opens every seam between same-side collinear chunks", () => {
    // Four chunks along one axis: a fixed-magnitude rule would give the two
    // chunks on each side identical offsets and keep their shared seam closed.
    const offsets = chunkSeamExplodeOffsetsMillimeters([
      { min: [0, 0, 0], size: [100, 100, 100] },
      { min: [100, 0, 0], size: [100, 100, 100] },
      { min: [200, 0, 0], size: [100, 100, 100] },
      { min: [300, 0, 0], size: [100, 100, 100] },
    ]);

    const seamOpening = 100 * tempestChunkSeamExplodeFraction;
    for (let index = 0; index < offsets.length - 1; index += 1) {
      expect(offsets[index + 1][0] - offsets[index][0]).toBeCloseTo(seamOpening, 6);
    }
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
    // Each corner chunk's center is (±50, ±50, ±50) from the assembly center.
    const expectedAxisDistance = 50 * tempestChunkSeamExplodeFraction;
    for (const [index, offset] of offsets.entries()) {
      const cell = cells[index];
      for (const axis of [0, 1, 2] as const) {
        const outwardSign = cell.min[axis] === 0 ? -1 : 1;
        expect(Math.sign(offset[axis])).toBe(outwardSign);
        expect(Math.abs(offset[axis])).toBeCloseTo(expectedAxisDistance, 6);
      }
    }
  });
});
