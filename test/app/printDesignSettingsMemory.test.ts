import { describe, expect, test } from "bun:test";
import { applyPrintDesignPreset, automaticFanCount, defaultSettings } from "@/domain/purifier/airPurifier";
import {
  createPrintDesignSettingsMemory,
  rememberPrintDesignSettings,
  switchPrintDesignSettings,
} from "@/app/state/printDesignSettingsMemory";

describe("Print design settings memory", () => {
  test("applies recommended settings the first time a design is selected", () => {
    const memory = createPrintDesignSettingsMemory(defaultSettings);
    const switched = switchPrintDesignSettings(memory, defaultSettings, "corsi-rosenthal");

    expect(switched.settings.printDesign).toBe("corsi-rosenthal");
    expect(switched.settings.filterPreset).toBe("ikea-starkvind");
    expect(switched.settings.corsiMode).toBe("top-exhaust");
    expect(switched.settings.corsiFilterCount).toBe(4);
    expect(switched.settings.corsiFanCount).toBe(automaticFanCount);
    expect(switched.settings.materialThickness).toBe(6);
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
    expect(toCorsi.settings.corsiMode).toBe("side-exhaust");
    expect(toCorsi.settings.corsiFilterCount).toBe(3);
    expect(toCorsi.settings.corsiFanCount).toBe(4);
    expect(toCorsi.settings.materialThickness).toBe(5);

    const toNukit = switchPrintDesignSettings(toCorsi.memory, toCorsi.settings, "nukit-open-air");
    expect(toNukit.settings.fansTop).toBe(2);
    expect(toNukit.settings.rim).toBe(34);
  });
});
