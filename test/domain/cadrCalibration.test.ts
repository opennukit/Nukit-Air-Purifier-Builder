import { describe, expect, test } from "bun:test";
import {
  estimateBoxCadr,
  estimatePcCadr,
  findBoxFanModel,
  findPcFanModel,
  FILTER_CURVES,
  type FilterCadrCalibration,
} from "@/domain/purifier/cadr";
import { matchedStockCadrPreset } from "@/domain/purifier/filterPresets";

// A matched stock filter can pin its own resistance, efficiency and area model
// instead of borrowing the single MERV-13 furnace baseline. STARKVIND is the first
// calibrated filter (EPA12, measured to about 240 CFM in its reference box).

const p14Max = { group: "140" as const, nFans: 4, q0_m3h: 193.2, p0_mm: 4.11, noiseDb: 30.6, currentA: 0.35, arctic: true };

// A measured build anchor, evaluated with the code's CURRENT fan data (so any drift in
// PC_FAN_MODELS or the physics constants that breaks a real calibration fails here).
function anchorCadr(
  fanId: string,
  nFans: number,
  nFilters: number,
  filter: { w: number; l: number; t: number },
  calibration?: FilterCadrCalibration,
): number {
  const fan = findPcFanModel(fanId);
  if (fan === undefined) {
    throw new Error(`missing fan ${fanId}`);
  }
  return estimatePcCadr({
    group: fan.group,
    nFans,
    nFilters,
    filter,
    q0_m3h: fan.q0,
    p0_mm: fan.p0,
    noiseDb: fan.db,
    currentA: fan.a,
    arctic: fan.arctic,
    calibration,
  }).cadrCfm;
}

describe("per-filter CADR calibration", () => {
  test("STARKVIND carries its measured calibration", () => {
    const calibration = matchedStockCadrPreset(365, 285, 35)?.cadr;
    expect(calibration).toEqual({ cls: "EPA12", eff: 0.99, res: 1.494, area: "direct" });
  });

  test("the STARKVIND reference box reproduces its measured ~240 CFM anchor", () => {
    // Measured box: 4x Arctic P14 Max + 2x STARKVIND, 85% build efficiency (default).
    const cadr = anchorCadr("arctic-p14-max", 4, 2, { w: 365, l: 285, t: 35 }, matchedStockCadrPreset(365, 285, 35)?.cadr);
    expect(cadr).toBeGreaterThan(236);
    expect(cadr).toBeLessThan(244);
  });

  test("the Nukit Tempest reproduces its measured ~247 CFM anchor", () => {
    // Measured box: 6x Arctic P14 PWM PST + 2x 20x20x2 MERV-13.
    const cadr = anchorCadr("arctic-p14-pwm-pst", 6, 2, { w: 495, l: 495, t: 44 });
    expect(cadr).toBeGreaterThan(244);
    expect(cadr).toBeLessThan(258);
  });

  test("STARKVIND uses its own efficiency and class, not the MERV-13 default", () => {
    const filter = { w: 365, l: 285, t: 35 };
    const calibrated = estimatePcCadr({ ...p14Max, nFilters: 2, filter, calibration: matchedStockCadrPreset(365, 285, 35)?.cadr });
    expect(calibrated.filterEfficiency).toBeCloseTo(0.99, 5);
    expect(calibrated.filterClass).toBe("EPA12");
    expect(calibrated.efficiencyBreakdown.map((entry) => entry.label)).toEqual(["EPA12"]);
  });

  test("a plain MERV-13 filter is unchanged (no calibration, weighted MERV-13 efficiency)", () => {
    const matched = matchedStockCadrPreset(495, 495, 44);
    expect(matched?.cadr).toBeUndefined();
    const merv13 = estimatePcCadr({ ...p14Max, nFilters: 1, filter: { w: 495, l: 495, t: 44 } });
    expect(merv13.filterEfficiency).toBeGreaterThan(0.8);
    expect(merv13.filterEfficiency).toBeLessThan(0.82);
  });

  test("the box-fan (filter cube) path also applies STARKVIND's calibration", () => {
    const calibrated = estimateBoxCadr({
      nFilters: 4,
      filter: { w: 365, l: 285, t: 35 },
      speed: 2,
      shroud: true,
      preset: findBoxFanModel("lasko-b20200"),
      calibration: matchedStockCadrPreset(365, 285, 35)?.cadr,
    });
    expect(calibrated.filterEfficiency).toBeCloseTo(0.99, 5);
    expect(calibrated.filterClass).toBe("EPA12");
    expect(calibrated.cadrCfm).toBeGreaterThan(0);
  });

  test("FILTER_CURVES carries the MERV-13 baseline and the six documented grades", () => {
    expect(FILTER_CURVES["merv-13"]).toEqual({ A: 4.7302e-7, B: 3.3752e-4 });
    expect(Object.keys(FILTER_CURVES)).toEqual(["merv-11", "merv-12", "merv-13", "merv-13-hi", "merv-14", "merv-14-hi"]);
  });

  test("a filter's own resistance curve is applied; the explicit MERV-13 curve matches the baseline", () => {
    const filter = { w: 495, l: 495, t: 44 };
    const baseline = estimatePcCadr({ ...p14Max, nFilters: 1, filter });
    const merv13 = estimatePcCadr({ ...p14Max, nFilters: 1, filter, calibration: { curve: FILTER_CURVES["merv-13"] } });
    const merv14 = estimatePcCadr({ ...p14Max, nFilters: 1, filter, calibration: { curve: FILTER_CURVES["merv-14"] } });

    expect(merv13.cadrCfm).toBeCloseTo(baseline.cadrCfm, 6);
    // A stiffer (higher-MERV) curve resists more, so less air moves at the same efficiency.
    expect(merv14.cadrCfm).toBeLessThan(baseline.cadrCfm);
    expect(merv14.pressureDropPa).toBeGreaterThan(baseline.pressureDropPa);
  });

  test("a plain MERV-13 filter cube is unchanged (box-velocity efficiency, no class override)", () => {
    const merv13 = estimateBoxCadr({
      nFilters: 4,
      filter: { w: 495, l: 495, t: 44 },
      speed: 2,
      shroud: true,
      preset: findBoxFanModel("lasko-b20200"),
      calibration: matchedStockCadrPreset(495, 495, 44)?.cadr,
    });
    expect(merv13.filterEfficiency).toBeCloseTo(0.5, 5);
    expect(merv13.filterClass).toBe("MERV-13");
  });
});
