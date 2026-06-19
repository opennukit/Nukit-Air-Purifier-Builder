import { describe, expect, test } from "bun:test";
import { createLayout, requireCutPanelFabricationPlan } from "@/fabrication/purifierLayout";
import { evaluateBuildDiagnostics } from "@/fabrication/buildDiagnostics";
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

  test("the Back fan grid counts toward the fan total (clears the 'no fans' advisory)", () => {
    const layout = createLayout({ ...baseRaw, backPlateFans: -1 } as never);
    expect(layout.summary.fans.type).toBe("wall-banks");
    if (layout.summary.fans.type === "wall-banks") {
      expect(layout.summary.fans.backPlateFans).toBeGreaterThan(0);
    }
    expect(evaluateBuildDiagnostics(layout).some((d) => d.id === "no-fans")).toBe(false);
  });

  test("turning Back on keeps the full part set (slot + flanges + walls intact)", () => {
    // Back on resizes the box to the Box depth, but the box keeps all its parts.
    expect(panelsFor(-1).map((panel) => panel.id)).toEqual(panelsFor(0).map((panel) => panel.id));
  });
});

function sideWallHeight(raw: typeof baseRaw): number {
  const wall = createLayout(raw as never);
  const panel = requireCutPanelFabricationPlan(wall, "test").cutPanels.find((p) => p.id === "left-side-wall");
  if (panel === undefined) {
    throw new Error("missing side wall");
  }
  return panel.height;
}

describe("laser one-side Box depth", () => {
  test("Box depth sets the chamber: a deeper box gives taller side walls", () => {
    const shallow = sideWallHeight({ ...baseRaw, backPlateFans: -1, boxDepth: 60 });
    const deep = sideWallHeight({ ...baseRaw, backPlateFans: -1, boxDepth: 120 });
    expect(deep - shallow).toBeCloseTo(60, 1);
  });

  test("Box depth is ignored unless Back fans are on with no wall fans", () => {
    const back = sideWallHeight({ ...baseRaw, backPlateFans: -1, boxDepth: 60 });
    const noBack = sideWallHeight({ ...baseRaw, backPlateFans: 0, boxDepth: 60 });
    const withWallFan = sideWallHeight({ ...baseRaw, backPlateFans: -1, boxDepth: 60, fansLeft: -1 });
    // Without the Back box, the chamber is the fan-diameter chamber, not Box depth.
    expect(noBack).toBe(withWallFan);
    expect(back).toBeLessThan(noBack);
  });
});
