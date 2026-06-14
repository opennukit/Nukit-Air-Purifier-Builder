import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";

const towerBoxExhaust =
  "printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&topExhaust=box-exhaust&filterWidth=300&filterDepth=300&filterThickness=25";

describe("tempest box/exhaust settings", () => {
  test("auto defaults derive from the filter width (matches tempest-builder.html)", () => {
    const fan = createTempestSettingsFromLayout(createLayout(decodeSettings(towerBoxExhaust))).fan;
    expect(fan.topExhaust).toBe("box-exhaust");
    expect(fan.boxExhaust.fanHoleSize).toBeCloseTo(250, 1); // 5/6 * 300
    expect(fan.boxExhaust.ringOne.radius).toBeCloseTo(150, 1); // 1.2 * (250/2)
    expect(fan.boxExhaust.ringTwo.radius).toBeCloseTo(175, 1); // 1.4 * (250/2)
    expect(fan.boxExhaust.ringOne.screwHoles).toBe(4);
    expect(fan.boxExhaust.ringOne.screwDiameter).toBe(6);
  });

  test("explicit values override the auto defaults", () => {
    const fan = createTempestSettingsFromLayout(
      createLayout(decodeSettings(`${towerBoxExhaust}&boxFanHoleSize=180&boxRingOneRadius=100&boxRingTwoScrewHoles=6`)),
    ).fan;
    expect(fan.boxExhaust.fanHoleSize).toBe(180);
    expect(fan.boxExhaust.ringOne.radius).toBe(100);
    expect(fan.boxExhaust.ringTwo.screwHoles).toBe(6);
  });

  test("defaults to the fan grid, and round-trips topExhaust through the URL", () => {
    const fanGrid = createTempestSettingsFromLayout(createLayout(decodeSettings("printDesign=nukit-tempest"))).fan;
    expect(fanGrid.topExhaust).toBe("fan-grid");
    const params = new URLSearchParams(encodeSettings(decodeSettings(towerBoxExhaust)));
    expect(params.get("topExhaust")).toBe("box-exhaust");
  });
});
