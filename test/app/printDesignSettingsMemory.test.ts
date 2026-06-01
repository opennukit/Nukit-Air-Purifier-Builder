import { describe, expect, test } from "bun:test";
import {
  applyPrintDesignPreset,
  applyTempestArrangement,
  automaticFanCount,
  defaultSettings,
  serializePurifierDraft,
} from "@/domain/purifier/airPurifier";
import {
  createPrintDesignSettingsMemory,
  rememberPrintDesignSettings,
  switchPrintDesignSettings,
} from "@/app/state/printDesignSettingsMemory";

describe("Print design settings memory", () => {
  test("applies recommended settings the first time a design is selected", () => {
    const memory = createPrintDesignSettingsMemory(defaultSettings);
    const switched = switchPrintDesignSettings(memory, defaultSettings, "corsi-rosenthal");
    const settings = serializePurifierDraft(switched.settings);

    expect(switched.settings.design.type).toBe("corsi-rosenthal");
    expect(settings.printDesign).toBe("corsi-rosenthal");
    expect(settings.filterPreset).toBe("ikea-starkvind");
    expect(settings.corsiMode).toBe("top-exhaust");
    expect(settings.corsiFilterCount).toBe(4);
    expect(settings.corsiFanCount).toBe(automaticFanCount);
    expect(settings.materialThickness).toBe(6);
  });

  test("restores the last settings used for a design when switching back", () => {
    const nukitSettings = {
      ...defaultSettings,
      fansTop: 2,
      rim: 34,
    };
    const corsiSettings = {
      ...applyPrintDesignPreset(nukitSettings, "corsi-rosenthal"),
      corsiMode: "side-exhaust" as const,
      corsiFilterCount: 3,
      corsiFanCount: 4,
      materialThickness: 5,
    };
    const memory = rememberPrintDesignSettings(
      rememberPrintDesignSettings(createPrintDesignSettingsMemory(nukitSettings), corsiSettings),
      nukitSettings,
    );

    const toCorsi = switchPrintDesignSettings(memory, nukitSettings, "corsi-rosenthal");
    const toCorsiSerialized = serializePurifierDraft(toCorsi.settings);
    expect(toCorsi.settings.design.type).toBe("corsi-rosenthal");
    expect(toCorsiSerialized.corsiMode).toBe("side-exhaust");
    expect(toCorsiSerialized.corsiFilterCount).toBe(3);
    expect(toCorsiSerialized.corsiFanCount).toBe(4);
    expect(toCorsiSerialized.materialThickness).toBe(5);

    const toNukit = switchPrintDesignSettings(toCorsi.memory, toCorsi.settings, "nukit-open-air");
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
