import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { boxExhaustDiametersForWidth } from "@/domain/purifier/settingsModel";

const towerBoxExhaust =
  "printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&topExhaust=box-exhaust&filterWidth=300&filterDepth=300&filterThickness=25";

describe("tempest box/exhaust settings", () => {
  test("the width-derived diameters become the fan hole and ring radii", () => {
    // boxExhaustDiametersForWidth(300): fan hole 225, ring 1 300, ring 2 360.
    const url =
      "printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&topExhaust=box-exhaust&filterWidth=300&filterDepth=300&filterThickness=25&boxFanHoleSize=225&boxRingOneDiameter=300&boxRingTwoDiameter=360";
    const fan = createTempestSettingsFromLayout(createLayout(decodeSettings(url))).fan;
    expect(fan.topExhaust).toBe("box-exhaust");
    expect(fan.boxExhaust.fanHoleSize).toBe(225); // 75% of 300
    expect(fan.boxExhaust.ringOne.radius).toBe(150); // diameter 300 / 2 -> 50% of 300
    expect(fan.boxExhaust.ringTwo.radius).toBe(180); // diameter 360 / 2 -> 60% of 300
    expect(fan.boxExhaust.ringOne.screwHoles).toBe(4);
    expect(fan.boxExhaust.ringOne.screwDiameter).toBe(6);
  });

  test("the helper sets fan hole 75% of width and ring radii 50% / 60% of the width", () => {
    // width 300 -> fan hole 225; ring diameters 100% / 120% of 300 -> 300 / 360.
    expect(boxExhaustDiametersForWidth(300)).toEqual({
      boxFanHoleSize: 225,
      boxRingOneDiameter: 300,
      boxRingTwoDiameter: 360,
    });
  });

  test("a non-positive diameter falls back to the width-derived ring radius", () => {
    const fan = createTempestSettingsFromLayout(
      createLayout(decodeSettings(`${towerBoxExhaust}&boxRingOneDiameter=0&boxRingTwoScrewHoles=6`)),
    ).fan;
    expect(fan.boxExhaust.ringOne.radius).toBeCloseTo(0.5 * 300, 1); // 50% of width
    expect(fan.boxExhaust.ringTwo.screwHoles).toBe(6);
  });

  test("defaults to the fan grid, and round-trips topExhaust through the URL", () => {
    const fanGrid = createTempestSettingsFromLayout(createLayout(decodeSettings("printDesign=nukit-tempest"))).fan;
    expect(fanGrid.topExhaust).toBe("fan-grid");
    const params = new URLSearchParams(encodeSettings(decodeSettings(towerBoxExhaust)));
    expect(params.get("topExhaust")).toBe("box-exhaust");
  });

  test("box/exhaust renders no PC fans (external box fan instead)", () => {
    const settings = createTempestSettingsFromLayout(createLayout(decodeSettings(towerBoxExhaust)));
    const fanLayout = createTempestModel(settings).fanLayout;
    if (fanLayout.topology !== "quad") throw new Error("expected a quad tower layout");
    expect(fanLayout.fanCount).toBe(0);
    expect(fanLayout.positionsX.length).toBe(0);
    expect(fanLayout.positionsY.length).toBe(0);

    // sanity: the fan grid still places fans
    const grid = createTempestModel(
      createTempestSettingsFromLayout(
        createLayout(decodeSettings("printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&filterWidth=300&filterDepth=300&filterThickness=25")),
      ),
    ).fanLayout;
    if (grid.topology !== "quad") throw new Error("expected a quad tower layout");
    expect(grid.fanCount).toBeGreaterThan(0);
  });

  test("turning the tower top fans off removes the grid", () => {
    const off = createTempestModel(
      createTempestSettingsFromLayout(
        createLayout(decodeSettings("printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&fansTop=0&filterWidth=300&filterDepth=300&filterThickness=25")),
      ),
    ).fanLayout;
    if (off.topology !== "quad") throw new Error("expected a quad tower layout");
    expect(off.fanCount).toBe(0);
  });
});
