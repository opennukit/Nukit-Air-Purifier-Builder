import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";

describe("tempest hex grill settings", () => {
  test("honeycomb settings flow into the fan opening", () => {
    const settings = createTempestSettingsFromLayout(
      createLayout(decodeSettings("printDesign=nukit-tempest&hexGrill=true&hexSize=12&hexSpacing=2")),
    );
    expect(settings.fan.opening).toEqual({ type: "honeycomb", hexFlatToFlat: 12, ribThickness: 2, fullCellsOnly: false });
  });

  test("hexFullCellsOnly flows into the fan opening and round-trips", () => {
    const settings = createTempestSettingsFromLayout(
      createLayout(decodeSettings("printDesign=nukit-tempest&hexGrill=true&hexFullCellsOnly=true")),
    );
    expect(settings.fan.opening).toEqual({ type: "honeycomb", hexFlatToFlat: 10, ribThickness: 1.6, fullCellsOnly: true });
    const params = new URLSearchParams(encodeSettings(decodeSettings("printDesign=nukit-tempest&hexFullCellsOnly=true")));
    expect(params.get("hexFullCellsOnly")).toBe("true");
  });

  test("turning the grill off gives a plain circular opening", () => {
    const settings = createTempestSettingsFromLayout(
      createLayout(decodeSettings("printDesign=nukit-tempest&hexGrill=false")),
    );
    expect(settings.fan.opening).toEqual({ type: "plain" });
  });

  test("round-trips through the URL", () => {
    const params = new URLSearchParams(
      encodeSettings(decodeSettings("printDesign=nukit-tempest&hexGrill=false&hexSize=9&hexSpacing=1.2")),
    );
    expect(params.get("hexGrill")).toBe("false");
    expect(params.get("hexSize")).toBe("9");
    expect(params.get("hexSpacing")).toBe("1.2");
  });

  test("defaults match tempest-builder.html (grill on, 10 / 1.6)", () => {
    const settings = createTempestSettingsFromLayout(createLayout(decodeSettings("printDesign=nukit-tempest")));
    expect(settings.fan.opening).toEqual({ type: "honeycomb", hexFlatToFlat: 10, ribThickness: 1.6, fullCellsOnly: false });
  });
});
