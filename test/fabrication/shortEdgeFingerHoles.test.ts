import { describe, expect, test } from "bun:test";
import { defaultSettings, type RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { createLayout } from "@/fabrication/purifierLayout";
import { createAirPurifierCutPanels } from "@/fabrication/laser/panels";
import { fingerHoleCutsAt } from "@/fabrication/laser/cutGeometry";

// A short edge (one whose length is under widthMultiplier + 1 thicknesses) gets
// no regular fingers from calcFingers. boxes.py falls back to a single centered
// rectangular finger in that case, and it applies that fallback on BOTH sides of
// the joint: the tab side in appendFingerProfile and the hole side in
// FingerHoles. If only the tab side has it, the mating panel grows a finger with
// nowhere to go and the box cannot be assembled.
//
// This bit the filter rails: their slotted edges are the rim (30 mm by default,
// user adjustable down to 12 mm), which is fixed while the finger width scales
// with material thickness. At 3 mm the regular path still produced a slot; at
// 5 mm it produced none, so both outer top rails came out with no slots at all.

const baseLaser: RawPurifierSettings = {
  ...defaultSettings,
  printDesign: "nukit-open-air",
  cutStyle: "laser",
  filters: 2,
  fanDiameter: 120,
  filterWidth: 365,
  filterDepth: 285,
  filterThickness: 35,
  rim: 30,
  splitFrames: true,
  fansLeft: -1,
  fansTop: -1,
  fansRight: 0,
  fansBottom: 0,
  fingerWidthMultiplier: 8,
  fingerSpaceMultiplier: 4,
};

function outerTopRailHoleCount(raw: RawPurifierSettings): number[] {
  const panels = createAirPurifierCutPanels(createLayout(raw).configuration);
  return panels
    .filter((panel) => panel.name.includes("outer top rail"))
    .map((panel) => panel.cuts.filter((cut) => cut.type === "rect" && cut.role === "finger-hole").length);
}

describe("short edge finger holes", () => {
  test("the hole side falls back to a single centered finger, like the tab side", () => {
    // 30 mm edge, 5 mm material, 8x finger width: 40 mm of finger cannot fit, so
    // calcFingers returns zero and the fallback has to supply the slot.
    const cuts = fingerHoleCutsAt(0, 0, 30, 0, 5, 0, {
      finger: { widthMultiplier: 8, spaceMultiplier: 4, playMultiplier: 0, holeWidthMultiplier: 1, holeOffsetMultiplier: 1 },
      dovetail: { sizeMultiplier: 3, depthMultiplier: 1, taper: 50 },
    });
    expect(cuts).toHaveLength(1);
    // One centered finger of half the leftover, so 15 mm wide centered at 15 mm.
    expect(cuts[0].width).toBeCloseTo(15, 5);
    expect(cuts[0].x + cuts[0].width / 2).toBeCloseTo(15, 5);
  });

  test("outer top rails keep their slots as material gets thicker", () => {
    // 3 mm was the last thickness the regular path covered, so it is the
    // reference; everything above it used to come out with zero slots.
    for (const materialThickness of [3, 3.4, 4, 5, 6, 9]) {
      const counts = outerTopRailHoleCount({ ...baseLaser, materialThickness });
      expect(counts).toHaveLength(2);
      for (const count of counts) {
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test("a narrow rim keeps its slots at every laser thickness", () => {
    for (const materialThickness of [3, 5, 9]) {
      const counts = outerTopRailHoleCount({ ...baseLaser, rim: 12, materialThickness });
      for (const count of counts) {
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test("hand cut is unaffected, because it has no finger joints", () => {
    const panels = createAirPurifierCutPanels(
      createLayout({ ...baseLaser, cutStyle: "hand", materialThickness: 5 }).configuration,
    );
    const holes = panels.flatMap((panel) =>
      panel.cuts.filter((cut) => cut.type === "rect" && cut.role === "finger-hole"),
    );
    expect(holes).toHaveLength(0);
  });
});
