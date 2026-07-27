import { describe, expect, test } from "bun:test";

import { createLayout } from "@/fabrication/purifierLayout";
import { createAirPurifierGeometry } from "@/domain/purifier/geometry";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { createTempestSettingsFromConfiguration } from "@/fabrication/printing/designs/tempest/settings";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
import { defaultSettings, type RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { cleanManifold, manifoldReport } from "../helpers/manifoldChecks";

// A two-filter laser box, 120 mm fans. Auto fan-chamber gap is fanDiameter + 2.
const laserTwoFilter: RawPurifierSettings = {
  ...defaultSettings,
  printDesign: "nukit-open-air",
  cutStyle: "laser",
  filters: 2,
  fanDiameter: 120,
  materialThickness: 5,
};

const handTwoFilter: RawPurifierSettings = { ...laserTwoFilter, cutStyle: "hand" };

// A 3D-print dual-horizontal sandwich, 120 mm fans.
const printSandwich: RawPurifierSettings = {
  ...defaultSettings,
  printDesign: "nukit-tempest",
  tempestArrangement: "dual-horizontal-sandwich",
  tempestDesign: "custom",
  filterWidth: 500,
  filterDepth: 622,
  fanDiameter: 120,
};

function geometryFor(raw: RawPurifierSettings) {
  return createAirPurifierGeometry(createLayout(raw).configuration);
}

function tempestBox(raw: RawPurifierSettings) {
  const model = createTempestModel(createTempestSettingsFromConfiguration(createLayout(raw).configuration));
  return model.box;
}

describe("two-filter fan-chamber width override", () => {
  test("laser: a manual width widens the chamber by exactly the delta over auto", () => {
    const auto = geometryFor(laserTwoFilter); // gap = 120 + 2 = 122
    const override = geometryFor({ ...laserTwoFilter, fanChamberDepth: 150 });
    expect(override.chamberHeight).toBe(auto.chamberHeight + (150 - 122));
  });

  test("hand-cut: the override applies there too (auto gap is fanDiameter + 8)", () => {
    const auto = geometryFor(handTwoFilter); // gap = 120 + 8 = 128
    const override = geometryFor({ ...handTwoFilter, fanChamberDepth: 150 });
    expect(override.chamberHeight).toBe(auto.chamberHeight + (150 - 128));
  });

  test("3D-print sandwich: the override widens the box between the filter flanges", () => {
    const auto = tempestBox(printSandwich); // chamberDepth = 120 + 2 = 122
    const override = tempestBox({ ...printSandwich, fanChamberDepth: 150 });
    expect(override.wallHeight).toBeGreaterThan(auto.wallHeight);
    expect(override.height).toBe(auto.height + (150 - 122));
  });

  test("the default (-1) leaves every mode at the auto chamber", () => {
    expect(geometryFor({ ...laserTwoFilter, fanChamberDepth: -1 }).chamberHeight).toBe(
      geometryFor(laserTwoFilter).chamberHeight,
    );
    expect(tempestBox({ ...printSandwich, fanChamberDepth: -1 }).height).toBe(tempestBox(printSandwich).height);
  });

  test("a single-filter build ignores the override (two-filter only)", () => {
    const oneFilter: RawPurifierSettings = { ...laserTwoFilter, filters: 1 };
    expect(geometryFor({ ...oneFilter, fanChamberDepth: 150 }).chamberHeight).toBe(
      geometryFor(oneFilter).chamberHeight,
    );
  });

  test("a non-positive override normalizes back to Auto", () => {
    expect(createLayout({ ...laserTwoFilter, fanChamberDepth: 0 }).configuration.cutting.fanChamberDepth).toBe(-1);
    expect(createLayout({ ...laserTwoFilter, fanChamberDepth: 150 }).configuration.cutting.fanChamberDepth).toBe(150);
  });

  test("a 3D-print sandwich with an override still prints watertight", () => {
    const settings = createTempestSettingsFromConfiguration(
      createLayout({ ...printSandwich, fanChamberDepth: 155 }).configuration,
    );
    const kit = createTempestPrintableKit(settings, "unsplit");
    expect(manifoldReport(kit.parts[0].mesh)).toEqual(cleanManifold);
  }, 30000);
});
