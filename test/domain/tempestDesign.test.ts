import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { normalizeSettings } from "@/domain/purifier/airPurifier";
import { tempestDesignLabels } from "@/domain/purifier/settingsModel";

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
