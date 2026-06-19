import { describe, expect, test } from "bun:test";
import { createLayout, requireCutPanelFabricationPlan } from "@/fabrication/purifierLayout";
import { defaultSettings } from "@/domain/purifier/settingsModel";
import { hexGrillHoles } from "@/fabrication/laser/cutGeometry";
import type { CircleCut, CutPanel } from "@/fabrication/laser/cutGeometry";

// The honeycomb grill replaces each plain fan bore with a field of hex holes in
// the laser cut drawing (and the 3D preview). It mirrors the 3D-print grill.

const baseRaw = {
  ...defaultSettings,
  printDesign: "nukit-open-air",
  filters: 1 as const,
  splitFrames: true,
  filterWidth: 495,
  filterDepth: 495,
  filterThickness: 44,
  rim: 30,
  fanDiameter: 140,
  materialThickness: 3,
  fansLeft: -1,
  fansRight: 0,
  fansTop: 0,
  fansBottom: 0,
  hexSize: 10,
  hexSpacing: 1.6,
};

function planFor(overrides: Record<string, unknown>) {
  return requireCutPanelFabricationPlan(createLayout({ ...baseRaw, ...overrides } as never), "test");
}

function firstFanCut(panels: readonly CutPanel[]): CircleCut {
  for (const panel of panels) {
    const fan = panel.cuts.find((cut): cut is CircleCut => cut.type === "circle" && cut.role === "fan");
    if (fan !== undefined) {
      return fan;
    }
  }
  throw new Error("no fan cut found");
}

function innerCutCount(overrides: Record<string, unknown>): number {
  return planFor(overrides).cutSheet.shapes.filter((shape) => shape.color === "inner-cut").length;
}

describe("laser honeycomb grill", () => {
  test("grill ON tags fan bores with a grill spec; OFF leaves them plain", () => {
    expect(firstFanCut(planFor({ hexGrill: true }).cutPanels).grill).toBeDefined();
    expect(firstFanCut(planFor({ hexGrill: false }).cutPanels).grill).toBeUndefined();
  });

  test("grill ON cuts many hex holes, so the drawing has more inner cuts than a plain bore", () => {
    expect(innerCutCount({ hexGrill: true })).toBeGreaterThan(innerCutCount({ hexGrill: false }));
  });

  test("partial cells (default) yield at least as many bore cuts as full-cells-only", () => {
    expect(innerCutCount({ hexGrill: true, hexFullCellsOnly: false })).toBeGreaterThanOrEqual(
      innerCutCount({ hexGrill: true, hexFullCellsOnly: true }),
    );
  });

  test("turning the grill on/off keeps the same part set (only the bore changes)", () => {
    expect(planFor({ hexGrill: true }).cutPanels.map((p) => p.id)).toEqual(
      planFor({ hexGrill: false }).cutPanels.map((p) => p.id),
    );
  });
});

describe("hexGrillHoles", () => {
  const bore = 60;
  const partial = hexGrillHoles(0, 0, bore, { hexFlatToFlat: 10, ribThickness: 1.6, fullCellsOnly: false });
  const full = hexGrillHoles(0, 0, bore, { hexFlatToFlat: 10, ribThickness: 1.6, fullCellsOnly: true });

  test("fills the bore with hexes", () => {
    expect(partial.length).toBeGreaterThan(10);
    expect(full.length).toBeGreaterThan(10);
  });

  test("full-cells keeps only whole 6-point hexes; partial includes clipped cells", () => {
    for (const hole of full) {
      expect(hole.length).toBe(6);
    }
    // Partial mode clips straddling hexes, so some cells have != 6 points.
    expect(partial.some((hole) => hole.length !== 6)).toBe(true);
    // ...and it therefore yields at least as many cells as full-cells-only.
    expect(partial.length).toBeGreaterThanOrEqual(full.length);
  });

  test("no cell crosses the bore in either mode", () => {
    for (const hole of [...partial, ...full]) {
      for (const point of hole) {
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(bore + 1e-6);
      }
    }
  });

  test("a bore smaller than one cell produces no full cells", () => {
    expect(hexGrillHoles(0, 0, 3, { hexFlatToFlat: 10, ribThickness: 1.6, fullCellsOnly: true })).toEqual([]);
  });
});
