import { describe, expect, test } from "bun:test";

import {
  createTempestModel,
  defaultTempestSettings,
  defaultTempestTowerFilter,
} from "@/domain/designs/tempest/model";
import type { TempestFanCountRequest, TempestSettings } from "@/domain/designs/tempest/shared";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
import { recommendedTowerFeetLengthMm } from "@/domain/purifier/cadr";
import { normalizeRawSettings } from "@/domain/purifier/airPurifier";
import { defaultSettings, type RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { cleanManifold, manifoldReport, meshVolume } from "../../helpers/manifoldChecks";

function towerFanLayout(
  bottomFans: TempestFanCountRequest | undefined,
  topExhaust: "fan-grid" | "box-exhaust" = "fan-grid",
) {
  const model = createTempestModel({
    ...defaultTempestSettings,
    arrangement: {
      type: "four-side-filter-tower",
      filter: defaultTempestTowerFilter,
      bottomFilter: false,
      feetLength: 100,
    },
    fan: { ...defaultTempestSettings.fan, topExhaust, topFans: { type: "automatic" }, bottomFans },
  });
  if (model.fanLayout.topology !== "quad") {
    throw new Error("expected a quad tower fan layout");
  }
  return model.fanLayout;
}

describe("tower bottom fan grid (model)", () => {
  test("an automatic bottom bank fills a grid that mirrors the top", () => {
    const layout = towerFanLayout({ type: "automatic" });
    expect(layout.bottom.fanCount).toBeGreaterThan(0);
    expect(layout.bottom.fanCount).toBe(layout.bottom.positions.length);
    // Same auto-filled positions as the top grid.
    expect(layout.bottom.positions).toEqual(layout.top.positions);
  });

  test("no bottom bank leaves the bottom plate solid", () => {
    expect(towerFanLayout(undefined).bottom.fanCount).toBe(0);
    expect(towerFanLayout({ type: "fixed", count: 0 }).bottom.fanCount).toBe(0);
  });

  test("a fixed bottom count places exactly that many fans", () => {
    const layout = towerFanLayout({ type: "fixed", count: 3 });
    expect(layout.bottom.fanCount).toBe(3);
    expect(layout.bottom.positions).toHaveLength(3);
  });

  test("bottom fans are independent of a Box/Exhaust top", () => {
    // Box/Exhaust removes the top grid but the bottom grid still fills (the app
    // forces bottom off upstream in that case; the geometry itself is independent).
    const layout = towerFanLayout({ type: "automatic" }, "box-exhaust");
    expect(layout.top.fanCount).toBe(0);
    expect(layout.bottom.fanCount).toBeGreaterThan(0);
  });
});

describe("tower bottom fan grille (CSG)", () => {
  const towerBase: TempestSettings = {
    ...defaultTempestSettings,
    arrangement: {
      type: "four-side-filter-tower",
      filter: defaultTempestTowerFilter,
      bottomFilter: false,
      feetLength: 100,
    },
  };

  test("a bottom fan tower is watertight and its grille removes material", () => {
    const withBottom = createTempestPrintableKit(
      { ...towerBase, fan: { ...towerBase.fan, bottomFans: { type: "automatic" } } },
      "unsplit",
    );
    const withoutBottom = createTempestPrintableKit(
      { ...towerBase, fan: { ...towerBase.fan, bottomFans: { type: "fixed", count: 0 } } },
      "unsplit",
    );
    expect(manifoldReport(withBottom.parts[0].mesh)).toEqual(cleanManifold);
    // The grille cut removes solid, so the bottom-fan body has less volume.
    expect(meshVolume(withBottom.parts[0].mesh)).toBeLessThan(meshVolume(withoutBottom.parts[0].mesh));
  }, 30000);
});

describe("tower auto foot length", () => {
  test("returns 100 mm when there is no bottom fan or filter", () => {
    expect(
      recommendedTowerFeetLengthMm({ boxWidthMm: 832, boxDepthMm: 832, structuralOffsetMm: 50.6, fanCount: 0, fanFreeAirM3h: 122.2, active: false }),
    ).toBe(100);
  });

  test("sizes the legs from the bottom-fan flow (curtain velocity ~2 m/s)", () => {
    // 16 x 140 mm fans (122 m3/h free-air each) on an 832 mm base: ~0.54 m3/s over
    // a ~2.9 m perimeter at 2 m/s is roughly 90 mm.
    const h = recommendedTowerFeetLengthMm({ boxWidthMm: 832, boxDepthMm: 832, structuralOffsetMm: 50.6, fanCount: 16, fanFreeAirM3h: 122.2, active: true });
    expect(h).toBeGreaterThan(60);
    expect(h).toBeLessThan(130);
  });

  test("a higher-flow fan needs taller legs", () => {
    const quiet = recommendedTowerFeetLengthMm({ boxWidthMm: 832, boxDepthMm: 832, structuralOffsetMm: 50.6, fanCount: 16, fanFreeAirM3h: 122.2, active: true });
    const highFlow = recommendedTowerFeetLengthMm({ boxWidthMm: 832, boxDepthMm: 832, structuralOffsetMm: 50.6, fanCount: 16, fanFreeAirM3h: 193.2, active: true });
    expect(highFlow).toBeGreaterThan(quiet);
  });

  test("the -1 Auto sentinel and manual heights both survive normalize", () => {
    const tower: RawPurifierSettings = { ...defaultSettings, printDesign: "nukit-tempest", tempestArrangement: "four-side-filter-tower", filterWidth: 290, filterDepth: 290 };
    expect(normalizeRawSettings({ ...tower, feetLength: -1 }).feetLength).toBe(-1);
    expect(normalizeRawSettings({ ...tower, feetLength: 120 }).feetLength).toBe(120);
  });
});

describe("tower bottom fan validation", () => {
  const squareTower: RawPurifierSettings = {
    ...defaultSettings,
    printDesign: "nukit-tempest",
    tempestArrangement: "four-side-filter-tower",
    filterWidth: 290,
    filterDepth: 290,
    fansBottom: -1, // automatic
  };

  test("Box/Exhaust forces the bottom bank off", () => {
    const out = normalizeRawSettings({ ...squareTower, topExhaust: "box-exhaust" });
    expect(out.fansBottom).toBe(0);
  });

  test("the bottom filter forces the bottom bank off (mutually exclusive)", () => {
    const out = normalizeRawSettings({ ...squareTower, topExhaust: "fan-grid", bottomFilter: true });
    expect(out.fansBottom).toBe(0);
  });

  test("a plain fan-grid tower keeps the bottom bank", () => {
    const out = normalizeRawSettings({ ...squareTower, topExhaust: "fan-grid", bottomFilter: false });
    expect(out.fansBottom).toBe(-1);
  });

  test("the exclusion does not touch non-tower designs", () => {
    const out = normalizeRawSettings({
      ...defaultSettings,
      printDesign: "nukit-open-air",
      fansBottom: -1,
      bottomFilter: true,
    });
    expect(out.fansBottom).toBe(-1);
  });
});
