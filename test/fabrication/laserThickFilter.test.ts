import { describe, expect, test } from "bun:test";
import { createLayout, requireCutPanelFabricationPlan } from "@/fabrication/purifierLayout";
import { defaultSettings } from "@/domain/purifier/settingsModel";
import type { CircleCut, CutPanel } from "@/fabrication/laser/cutGeometry";

// A single thick filter in hand-cut mode makes the rear wall span the FULL chamber,
// so the top fans and a back-wall cord must sit in the fan-clear zone rather than
// the chamber center, which would drop them into the filter. The bottom and side
// walls already do this; these guard that the rear wall matches.
const thickFilterHandCut = {
  ...defaultSettings,
  printDesign: "nukit-open-air",
  cutStyle: "hand",
  filters: 1 as const,
  filterWidth: 502,
  filterDepth: 625,
  filterThickness: 109,
  materialThickness: 5,
  fanDiameter: 140,
  fansLeft: -1,
  fansRight: -1,
  fansBottom: -1,
};

function circles(panel: CutPanel | undefined, role: "fan" | "cord"): CircleCut[] {
  return (panel?.cuts ?? []).filter((cut): cut is CircleCut => cut.type === "circle" && cut.role === role);
}

function build(extra: Record<string, unknown>): readonly CutPanel[] {
  return requireCutPanelFabricationPlan(createLayout({ ...thickFilterHandCut, ...extra } as never), "test").cutPanels;
}

describe("hand-cut thick filter keeps fans and cord out of the filter zone", () => {
  test("top fans line up with the bottom fans in the fan-clear zone, not the chamber center", () => {
    const panels = build({ fansTop: -1, fansBottom: -1, cordHoleWall: "none" });
    const top = circles(panels.find((panel) => panel.id === "top-fan-wall"), "fan");
    const bottom = circles(panels.find((panel) => panel.id === "bottom-fan-wall"), "fan");
    expect(top.length).toBeGreaterThan(0);
    expect(bottom.length).toBeGreaterThan(0);
    expect(top[0]!.cy).toBeCloseTo(bottom[0]!.cy, 1);
  });

  test("a back-wall cord clears the filter (sits in the fan band, above the filter zone)", () => {
    const panels = build({ fansTop: 0, fansBottom: -1, cordHoleWall: "back", cordHoleSide: "right", cordHoleDiameter: 10 });
    const cord = circles(panels.find((panel) => panel.id === "top-fan-wall"), "cord")[0];
    expect(cord).toBeDefined();
    // The filter occupies the bottom filterThickness + material of the chamber; the
    // cord must sit well above that, not at the old fan-diameter/2 (70 mm) position.
    expect(cord!.cy).toBeGreaterThan(114);
  });
});
