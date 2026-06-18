import { describe, expect, test } from "bun:test";
import { createLayout, requireCutPanelFabricationPlan } from "@/fabrication/purifierLayout";
import { defaultSettings } from "@/domain/purifier/settingsModel";
import type { CircleCut, CutPanel } from "@/fabrication/laser/cutGeometry";

// The one-side laser box already has its slot and flanges; turning on "Back" fans
// only adds a fan grid to the existing closed back panel — nothing else changes.

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
  fansLeft: 0,
  fansRight: 0,
  fansTop: 0,
  fansBottom: 0,
};

function panelsFor(backPlateFans: number): readonly CutPanel[] {
  return requireCutPanelFabricationPlan(createLayout({ ...baseRaw, backPlateFans } as never), "test").cutPanels;
}

function fans(panel: CutPanel | undefined, role: "fan" | "screw"): number {
  return (panel?.cuts ?? []).filter((cut): cut is CircleCut => cut.type === "circle" && cut.role === role).length;
}

describe("laser one-side Back fans (closed back panel)", () => {
  test("Back off leaves the closed back panel fan-free", () => {
    const back = panelsFor(0).find((panel) => panel.id === "closed-back-panel");
    expect(back).toBeDefined();
    expect(fans(back, "fan")).toBe(0);
  });

  test("Back on cuts a fan grid (four screws per fan) into the closed back panel", () => {
    const back = panelsFor(-1).find((panel) => panel.id === "closed-back-panel");
    expect(fans(back, "fan")).toBeGreaterThan(0);
    expect(fans(back, "screw")).toBe(fans(back, "fan") * 4);
  });

  test("turning Back on changes nothing but the back panel", () => {
    const off = panelsFor(0);
    const on = panelsFor(-1);
    // Same parts in the same order; only the back panel differs.
    expect(on.map((panel) => panel.id)).toEqual(off.map((panel) => panel.id));
    for (let i = 0; i < off.length; i += 1) {
      if (off[i].id === "closed-back-panel") {
        continue;
      }
      expect(on[i].cuts.length).toBe(off[i].cuts.length);
      expect(on[i].outline.length).toBe(off[i].outline.length);
    }
  });
});
