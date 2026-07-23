import { describe, expect, test } from "bun:test";

import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import {
  decodeShareToken,
  encodeShareToken,
  shareTokenSchemaKeys,
} from "@/domain/purifier/shareLinkCodec";
import { defaultSettings } from "@/domain/purifier/settingsModel";
import { decodeWorkbenchState } from "@/app/workbench/workbenchState";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";

// Build the same canonical query encodeShareState produces: settings + workbench.
function shareQuery(settings: RawPurifierSettings, workbench: string): string {
  const params = new URLSearchParams(encodeSettings(settings));
  for (const [key, value] of new URLSearchParams(workbench)) {
    params.set(key, value);
  }
  return params.toString();
}

const towerExample: RawPurifierSettings = {
  ...defaultSettings,
  printDesign: "nukit-tempest",
  filterWidth: 501,
  filterDepth: 501,
  filterThickness: 19,
  fansTop: -1,
  tempestArrangement: "four-side-filter-tower",
  tempestDesign: "custom",
  topExhaust: "box-exhaust",
  boxFanHoleSize: 376,
  fanModel: "arctic-p14-pwm-pst",
  customFanAirflow: 129.1248,
  customFanPressure: 2.86,
  electricityPrice: 0.1765,
  currencySymbol: "$",
  hexGrill: true,
};

const sandwichExample: RawPurifierSettings = {
  ...defaultSettings,
  printDesign: "nukit-tempest",
  filterWidth: 500,
  filterDepth: 622,
  fansLeft: -1,
  fansRight: -1,
  tempestArrangement: "dual-horizontal-sandwich",
  tempestDesign: "nukit-tempest-pro",
  topExhaust: "fan-grid",
};

const laserExample: RawPurifierSettings = {
  ...defaultSettings,
  printDesign: "nukit-open-air",
  cutStyle: "hand",
  filters: 2,
  kerfFit: 0.1,
  materialThickness: 5,
};

const cases: ReadonlyArray<readonly [string, RawPurifierSettings, string]> = [
  ["defaults / 3mf", defaultSettings, "previewMode=enclosure&fabricationMethod=print-3mf&printVolume=bed-256"],
  ["tower / 3mf", towerExample, "previewMode=enclosure&fabricationMethod=print-3mf&printVolume=bed-256"],
  ["sandwich / 3mf", sandwichExample, "previewMode=print-sheets&fabricationMethod=print-3mf&printVolume=bed-256"],
  ["laser / cut-sheet", laserExample, "previewMode=cut-sheet&fabricationMethod=laser-svg"],
];

describe("share-link codec", () => {
  test.each(cases)("round-trips settings + workbench: %s", (_label, settings, workbench) => {
    const query = shareQuery(settings, workbench);
    const token = encodeShareToken(query);
    const restored = decodeShareToken(token);

    // Decoded settings must be identical to decoding the original query.
    expect(decodeSettings(restored)).toEqual(decodeSettings(query));
    // Workbench state must match too.
    expect(decodeWorkbenchState(new URLSearchParams(restored))).toEqual(
      decodeWorkbenchState(new URLSearchParams(query)),
    );
  });

  test.each(cases)("token is dramatically shorter than the query: %s", (_label, settings, workbench) => {
    const query = shareQuery(settings, workbench);
    const token = encodeShareToken(query);
    // At least 60% shorter; in practice ~85%.
    expect(token.length).toBeLessThan(query.length * 0.4);
  });

  test("schema covers every key the encoders can emit", () => {
    // Non-tempest + print-3mf emits the widest key set (filters/splitFrames/cutStyle
    // AND printVolume).
    const query = shareQuery(
      { ...defaultSettings, printDesign: "nukit-open-air" },
      "previewMode=print-sheets&fabricationMethod=print-3mf&printVolume=bed-256",
    );
    const schema = new Set(shareTokenSchemaKeys());
    for (const key of new URLSearchParams(query).keys()) {
      expect(schema.has(key)).toBe(true);
    }
  });

  test("unknown enum values survive via the string escape", () => {
    // A static-reference printDesign id is not in the enum table; it must escape
    // to a string and round-trip exactly.
    const query = "printDesign=nukit-static-reference-foo&previewMode=enclosure&fabricationMethod=print-3mf&printVolume=bed-256";
    const restored = new URLSearchParams(decodeShareToken(encodeShareToken(query)));
    expect(restored.get("printDesign")).toBe("nukit-static-reference-foo");
  });

  test("preserves fractional precision (4 dp)", () => {
    const query = shareQuery(
      { ...defaultSettings, electricityPrice: 0.1765, customFanAirflow: 129.1248, kerfFit: 0.1 },
      "previewMode=enclosure&fabricationMethod=print-3mf&printVolume=bed-256",
    );
    const restored = new URLSearchParams(decodeShareToken(encodeShareToken(query)));
    expect(restored.get("electricityPrice")).toBe("0.1765");
    expect(restored.get("customFanAirflow")).toBe("129.1248");
    expect(restored.get("kerfFit")).toBe("0.1");
  });

  test("negative counts round-trip", () => {
    const query = shareQuery(
      { ...defaultSettings, fansTop: -1, fansLeft: -1 },
      "previewMode=enclosure&fabricationMethod=print-3mf&printVolume=bed-256",
    );
    const restored = new URLSearchParams(decodeShareToken(encodeShareToken(query)));
    expect(restored.get("fansTop")).toBe("-1");
    expect(restored.get("fansLeft")).toBe("-1");
  });

  test("throws on a malformed token", () => {
    expect(() => decodeShareToken("!!!!not-valid!!!!")).toThrow();
    expect(() => decodeShareToken("")).toThrow();
  });
});
