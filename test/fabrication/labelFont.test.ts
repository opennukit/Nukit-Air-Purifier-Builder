import { describe, expect, test } from "bun:test";
import { labelSupportsAllChars, renderLabel } from "@/fabrication/printing/designs/tempest/geometry/labelFont";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

describe("label stroke font", () => {
  test("renders every letter and digit as non-empty closed loops", () => {
    for (const char of ALPHANUMERIC) {
      const rendered = renderLabel(char, 7);
      expect(rendered.loops.length).toBeGreaterThan(0);
      for (const loop of rendered.loops) {
        expect(loop.length).toBeGreaterThanOrEqual(3);
      }
    }
    expect(labelSupportsAllChars(ALPHANUMERIC)).toBe(true);
  });

  test("scales to the requested cap height and stays in the positive quadrant", () => {
    const rendered = renderLabel("AB", 7);
    expect(rendered.height).toBe(7);
    const points = rendered.loops.flat();
    const ys = points.map((p) => p[1]);
    const xs = points.map((p) => p[0]);
    // Baseline at 0, cap top at ~7 (allow the stroke half-width + cap to spill).
    const strokeSpill = 1.2;
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-strokeSpill);
    expect(Math.max(...ys)).toBeLessThanOrEqual(7 + strokeSpill);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-strokeSpill);
    // Two glyphs advance well past a single glyph's width.
    expect(rendered.width).toBeGreaterThan(7);
  });

  test("lays glyphs left to right with spacing between them", () => {
    const one = renderLabel("A", 7).width;
    const two = renderLabel("AA", 7).width;
    expect(two).toBeGreaterThan(2 * one);
  });

  test("lower-case input is treated as upper-case", () => {
    expect(renderLabel("ab", 7).loops.length).toBe(renderLabel("AB", 7).loops.length);
  });

  test("unknown characters advance the cursor without emitting loops", () => {
    expect(labelSupportsAllChars("A-B")).toBe(false);
    const withGap = renderLabel("A B", 7);
    const tight = renderLabel("AB", 7);
    expect(withGap.loops.length).toBe(tight.loops.length);
    expect(withGap.width).toBeGreaterThan(tight.width);
  });
});
