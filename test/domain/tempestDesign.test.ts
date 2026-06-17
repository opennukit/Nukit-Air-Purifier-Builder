import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { normalizeSettings } from "@/domain/purifier/airPurifier";
import {
  applyTempestDesign,
  defaultSettings,
  reconcileTempestDesign,
  tempestDesignLabels,
} from "@/domain/purifier/settingsModel";

describe("tempest design selector", () => {
  test("defaults to custom and round-trips through the URL", () => {
    const params = new URLSearchParams(
      encodeSettings(decodeSettings("printDesign=nukit-tempest")),
    );
    expect(params.get("tempestDesign")).toBe("custom");
  });

  test("the selection reaches the configured design (drives the preview readout)", () => {
    const config = normalizeSettings(decodeSettings("printDesign=nukit-tempest&tempestDesign=custom"));
    expect(config.design.type).toBe("tempest");
    if (config.design.type !== "tempest") throw new Error("expected tempest design");
    expect(config.design.design).toBe("custom");
    expect(tempestDesignLabels[config.design.design]).toBe("Custom");
  });

  test("an unknown design value falls back to custom", () => {
    const config = normalizeSettings(decodeSettings("printDesign=nukit-tempest&tempestDesign=bogus"));
    if (config.design.type !== "tempest") throw new Error("expected tempest design");
    expect(config.design.design).toBe("custom");
  });
});

describe("editing a selected design drops it to Custom", () => {
  const euro = applyTempestDesign(defaultSettings, "nukit-tempest-euro");

  test("a freshly applied design stays selected", () => {
    expect(reconcileTempestDesign(euro).tempestDesign).toBe("nukit-tempest-euro");
  });

  test("changing any defining variable switches to custom", () => {
    expect(reconcileTempestDesign({ ...euro, filterWidth: 371 }).tempestDesign).toBe("custom");
    expect(reconcileTempestDesign({ ...euro, hexSpacing: 2 }).tempestDesign).toBe("custom");
    expect(reconcileTempestDesign({ ...euro, fansLeft: -1 }).tempestDesign).toBe("custom");
    expect(reconcileTempestDesign({ ...euro, cordHoleWall: "left" }).tempestDesign).toBe("custom");
  });

  test("custom stays custom", () => {
    expect(reconcileTempestDesign({ ...euro, tempestDesign: "custom", filterWidth: 999 }).tempestDesign).toBe("custom");
  });

  test("every named preset round-trips: apply then reconcile keeps it", () => {
    for (const design of ["nukit-tempest-euro", "nukit-tempest-euro-cube", "nukit-tempest-original", "nukit-tempest-original-cube", "nukit-tempest-pro"] as const) {
      expect(reconcileTempestDesign(applyTempestDesign(defaultSettings, design)).tempestDesign).toBe(design);
    }
  });
});
