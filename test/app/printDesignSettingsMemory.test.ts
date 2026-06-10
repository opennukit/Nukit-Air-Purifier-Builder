import { describe, expect, test } from "bun:test";
import { serializePurifierDraft } from "@/domain/purifier/airPurifier";
import {
  applyPrintDesignPreset,
  applyTempestArrangement,
  defaultSettings,
} from "@/domain/purifier/settingsModel";
import {
  createPrintDesignSettingsMemory,
  rememberPrintDesignSettings,
  switchPrintDesignSettings,
} from "@/app/state/printDesignSettingsMemory";

describe("Print design settings memory", () => {
  test("applies recommended settings the first time a design is selected", () => {
    const memory = createPrintDesignSettingsMemory(defaultSettings);
    const switched = switchPrintDesignSettings(memory, defaultSettings, "nukit-tempest");
    const settings = serializePurifierDraft(switched.settings);

    expect(switched.settings.design.type).toBe("tempest");
    expect(settings.printDesign).toBe("nukit-tempest");
    expect(settings.filterWidth).toBe(498);
    expect(settings.filterDepth).toBe(496);
    expect(settings.filterThickness).toBe(46.77);
    expect(settings.tempestArrangement).toBe("dual-horizontal-sandwich");
    expect(settings.materialThickness).toBe(5);
  });

  test("restores the last settings used for a design when switching back", () => {
    const nukitSettings = {
      ...defaultSettings,
      fansTop: 2,
      rim: 34,
    };
    const tempestSettings = {
      ...applyPrintDesignPreset(nukitSettings, "nukit-tempest"),
      materialThickness: 5,
    };
    const memory = rememberPrintDesignSettings(
      rememberPrintDesignSettings(createPrintDesignSettingsMemory(nukitSettings), tempestSettings),
      nukitSettings,
    );

    const toTempest = switchPrintDesignSettings(memory, nukitSettings, "nukit-tempest");
    const toTempestSerialized = serializePurifierDraft(toTempest.settings);
    expect(toTempest.settings.design.type).toBe("tempest");
    expect(toTempestSerialized.materialThickness).toBe(5);

    const toNukit = switchPrintDesignSettings(toTempest.memory, toTempest.settings, "nukit-open-air");
    const toNukitSerialized = serializePurifierDraft(toNukit.settings);
    expect(toNukit.settings.design.type).toBe("laser-derived-printable-kit");
    expect(toNukitSerialized.fansTop).toBe(2);
    expect(toNukitSerialized.rim).toBe(34);
  });

  test("remembers the Tempest arrangement inside the single Tempest design", () => {
    const tempestSettings = applyTempestArrangement(
      applyPrintDesignPreset(defaultSettings, "nukit-tempest"),
      "four-side-filter-tower",
    );
    const memory = rememberPrintDesignSettings(createPrintDesignSettingsMemory(defaultSettings), tempestSettings);
    const toTempest = switchPrintDesignSettings(memory, defaultSettings, "nukit-tempest");
    const serialized = serializePurifierDraft(toTempest.settings);

    expect(toTempest.settings.design.type).toBe("tempest");
    expect(serialized.printDesign).toBe("nukit-tempest");
    expect(serialized.tempestArrangement).toBe("four-side-filter-tower");
  });
});
