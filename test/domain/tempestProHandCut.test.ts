import { describe, expect, test } from "bun:test";

import { applyNukitLaserDesign, defaultSettings, type RawPurifierSettings } from "@/domain/purifier/settingsModel";

const base = (cutStyle: "hand" | "laser"): RawPurifierSettings => ({
  ...defaultSettings,
  printDesign: "nukit-open-air",
  cutStyle,
});

describe("Nukit Tempest Pro hand-cut preset", () => {
  test("hand cut applies the full single-filter foamcore build", () => {
    const pro = applyNukitLaserDesign(base("hand"), "nukit-tempest-pro");
    expect(pro).toMatchObject({
      filters: 1,
      filterWidth: 500,
      filterDepth: 622,
      filterThickness: 19,
      fanDiameter: 140,
      fanModel: "arctic-p14-pwm-pst",
      fansLeft: -1,
      fansRight: -1,
      fansTop: 0,
      fansBottom: 0,
      materialThickness: 9,
      splitFrames: true,
      cordHoleWall: "left",
      cordHoleSide: "right",
      boxDepth: 50,
      previewMaterialColor: "matte-gray",
    });
  });

  test("laser cut Pro is unchanged: two-filter sandwich, no hand-only overrides", () => {
    const pro = applyNukitLaserDesign(base("laser"), "nukit-tempest-pro");
    expect(pro.filters).toBe(2);
    // The hand-only build details are not forced onto the laser preset.
    expect(pro.materialThickness).toBe(defaultSettings.materialThickness);
    expect(pro.filterWidth).toBe(500);
    expect(pro.fanModel).toBe("arctic-p14-pwm-pst");
  });
});
