import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";

describe("tempest outside flange thickness", () => {
  test("defaults to 10 mm and drives the frame", () => {
    const frame = createTempestSettingsFromLayout(createLayout(decodeSettings("printDesign=nukit-tempest"))).frame;
    expect(frame.outsideFlangeThickness).toBe(10);
  });

  test("the set value reaches the frame and round-trips through the URL", () => {
    const frame = createTempestSettingsFromLayout(
      createLayout(decodeSettings("printDesign=nukit-tempest&outsideFlangeThickness=15")),
    ).frame;
    expect(frame.outsideFlangeThickness).toBe(15);
    expect(
      new URLSearchParams(encodeSettings(decodeSettings("printDesign=nukit-tempest&outsideFlangeThickness=15"))).get(
        "outsideFlangeThickness",
      ),
    ).toBe("15");
  });

  test("clamps to a printable range", () => {
    const frame = createTempestSettingsFromLayout(
      createLayout(decodeSettings("printDesign=nukit-tempest&outsideFlangeThickness=0")),
    ).frame;
    expect(frame.outsideFlangeThickness).toBe(1);
  });
});
