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

  test("turning the grill on/off keeps the same part set (only the bore changes)", () => {
    expect(planFor({ hexGrill: true }).cutPanels.map((p) => p.id)).toEqual(
      planFor({ hexGrill: false }).cutPanels.map((p) => p.id),
    );
  });
});

describe("hexGrillHoles", () => {
  const bore = 60;
  const holes = hexGrillHoles(0, 0, bore, { hexFlatToFlat: 10, ribThickness: 1.6 });

  test("fills the bore with whole hexes", () => {
    expect(holes.length).toBeGreaterThan(10);
    for (const hole of holes) {
      expect(hole.length).toBe(6);
    }
  });

  test("every hex vertex stays inside the bore (no slivers crossing the rim)", () => {
    for (const hole of holes) {
      for (const point of hole) {
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(bore + 1e-6);
      }
    }
  });

  test("a bore smaller than one cell produces no holes", () => {
    expect(hexGrillHoles(0, 0, 3, { hexFlatToFlat: 10, ribThickness: 1.6 })).toEqual([]);
  });
});
