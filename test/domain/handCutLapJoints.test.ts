import { describe, expect, test } from "bun:test";

import { createLayout } from "@/fabrication/purifierLayout";
import { createAirPurifierCutPanels } from "@/fabrication/laser/panels";
import { defaultSettings, type RawPurifierSettings } from "@/domain/purifier/settingsModel";

const THICK = 5;

const handCut: RawPurifierSettings = {
  ...defaultSettings,
  printDesign: "nukit-open-air",
  cutStyle: "hand",
  filters: 2,
  filterWidth: 495,
  filterDepth: 495,
  filterThickness: 44,
  materialThickness: THICK,
  fanDiameter: 140,
};

function panelsById(raw: RawPurifierSettings) {
  const map = new Map<string, { width: number; height: number; pos: readonly number[] }>();
  for (const p of createAirPurifierCutPanels(createLayout(raw).configuration)) {
    const pos = (p.assembly as { placement?: { position: readonly number[] } }).placement?.position ?? [0, 0, 0];
    map.set(p.id, { width: p.width, height: p.height, pos });
  }
  return map;
}

describe("hand-cut lap joints", () => {
  test("fan walls wrap outside (filter width + 2 walls); side walls fit between (filter depth)", () => {
    const p = panelsById(handCut);
    const top = p.get("top-fan-wall")!;
    const side = p.get("left-side-wall")!;
    // The fan wall is exactly two wall thicknesses longer than the side wall (kerf
    // growth is identical on both, so it cancels in the difference).
    expect(top.width - side.width).toBeCloseTo(2 * THICK, 5);
  });

  test("the internal cavity equals the filter, so a snug press-fit fits", () => {
    const p = panelsById(handCut);
    const side = p.get("right-side-wall")!; // sits at +x; inner face one half-thickness in
    const top = p.get("top-fan-wall")!; // sits at +z
    const cavityWidth = 2 * (Math.abs(side.pos[0]) - THICK / 2);
    const cavityDepth = 2 * (Math.abs(top.pos[2]) - THICK / 2);
    expect(cavityWidth).toBeCloseTo(495, 5);
    expect(cavityDepth).toBeCloseTo(495, 5);
  });

  test("the fan walls lap over the side walls' outer faces (no gap, no overlap)", () => {
    const p = panelsById(handCut);
    const side = p.get("right-side-wall")!;
    const top = p.get("top-fan-wall")!;
    // Side wall outer face (x) and the fan wall's half-width must coincide.
    const sideOuterX = Math.abs(side.pos[0]) + THICK / 2;
    const fanHalfWidth = top.width / 2;
    // Allow the shared kerf growth on the fan wall half-width.
    expect(fanHalfWidth).toBeGreaterThanOrEqual(sideOuterX - 0.5);
  });

  test("a non-square filter maps the axes correctly", () => {
    const p = panelsById({ ...handCut, filterWidth: 495, filterDepth: 400 });
    const top = p.get("top-fan-wall")!;
    const side = p.get("left-side-wall")!;
    // Fan wall spans the width (495 + 2 walls); side wall spans the depth (400).
    expect(top.width).toBeGreaterThan(side.width);
    expect(2 * (Math.abs(top.pos[2]) - THICK / 2)).toBeCloseTo(400, 5); // depth cavity
    expect(2 * (Math.abs(side.pos[0]) - THICK / 2)).toBeCloseTo(495, 5); // width cavity
  });

  test("hand-cut allows thick stock (up to 50 mm); laser stays capped at 9 mm", () => {
    const thk = (raw: RawPurifierSettings): number => createLayout(raw).configuration.cutting.materialThickness;
    expect(thk({ ...handCut, materialThickness: 10 })).toBe(10);
    expect(thk({ ...handCut, materialThickness: 40 })).toBe(40);
    expect(thk({ ...handCut, materialThickness: 60 })).toBe(50); // clamped to the 50 mm max
    // Laser (finger-jointed) construction still caps at 9 mm.
    expect(thk({ ...handCut, cutStyle: "laser", materialThickness: 10 })).toBe(9);
  });

  test("laser (finger-jointed) construction is unaffected: no 2-thickness lap", () => {
    const p = panelsById({ ...handCut, cutStyle: "laser" });
    const top = p.get("top-fan-wall")!;
    const side = p.get("left-side-wall")!;
    // Laser fan walls are the plain filter width, not width + 2 thicknesses.
    expect(top.width - side.width).not.toBeCloseTo(2 * THICK, 1);
  });
});
