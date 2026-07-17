import { describe, expect, test } from "bun:test";
import { estimatePcCadr } from "@/domain/purifier/cadr";
import { matchedStockCadrPreset } from "@/domain/purifier/filterPresets";

// A matched stock filter can pin its own resistance, efficiency and area model
// instead of borrowing the single MERV-13 furnace baseline. STARKVIND is the first
// calibrated filter (EPA12, measured to about 240 CFM in its reference box).

const p14Max = { group: "140" as const, nFans: 4, q0_m3h: 193.2, p0_mm: 4.11, noiseDb: 30.6, currentA: 0.35, arctic: true };

describe("per-filter CADR calibration", () => {
  test("STARKVIND carries its measured calibration", () => {
    const calibration = matchedStockCadrPreset(365, 285, 35)?.cadr;
    expect(calibration).toEqual({ cls: "EPA12", eff: 0.99, res: 0.668, area: "direct" });
  });

  test("a STARKVIND build uses its own efficiency and resistance, not the MERV-13 default", () => {
    const filter = { w: 365, l: 285, t: 35 };
    const calibrated = estimatePcCadr({ ...p14Max, nFilters: 1, filter, calibration: matchedStockCadrPreset(365, 285, 35)?.cadr });
    const naive = estimatePcCadr({ ...p14Max, nFilters: 1, filter });

    expect(calibrated.filterEfficiency).toBeCloseTo(0.99, 5);
    expect(calibrated.efficiencyBreakdown.map((entry) => entry.label)).toEqual(["EPA12"]);
    // The 99% capture and easier-flowing media lift the estimate above the naive
    // MERV-13 result, and land near the ~240 CFM reference box.
    expect(calibrated.cadrCfm).toBeGreaterThan(naive.cadrCfm);
    expect(calibrated.cadrCfm).toBeGreaterThan(210);
    expect(calibrated.cadrCfm).toBeLessThan(265);
  });

  test("a plain MERV-13 filter is unchanged (no calibration, weighted MERV-13 efficiency)", () => {
    const matched = matchedStockCadrPreset(495, 495, 44);
    expect(matched?.cadr).toBeUndefined();
    const merv13 = estimatePcCadr({ ...p14Max, nFilters: 1, filter: { w: 495, l: 495, t: 44 } });
    expect(merv13.filterEfficiency).toBeGreaterThan(0.8);
    expect(merv13.filterEfficiency).toBeLessThan(0.82);
  });
});
