import {
  applyPrintDesignPreset,
  normalizeRawSettings,
  type PrintDesignId,
  type RawPurifierSettings,
} from "@/domain/purifier/airPurifier";

export type PrintDesignSettingsMemory = Readonly<Partial<Record<PrintDesignId, RawPurifierSettings>>>;

export type PrintDesignSettingsSwitch = {
  readonly settings: RawPurifierSettings;
  readonly memory: PrintDesignSettingsMemory;
};

export function createPrintDesignSettingsMemory(settings: RawPurifierSettings): PrintDesignSettingsMemory {
  return rememberPrintDesignSettings({}, settings);
}

export function rememberPrintDesignSettings(
  memory: PrintDesignSettingsMemory,
  settings: RawPurifierSettings,
): PrintDesignSettingsMemory {
  return {
    ...memory,
    [settings.printDesign]: settings,
  };
}

export function switchPrintDesignSettings(
  memory: PrintDesignSettingsMemory,
  currentSettings: RawPurifierSettings,
  nextPrintDesign: PrintDesignId,
): PrintDesignSettingsSwitch {
  const memoryWithCurrentDesign = rememberPrintDesignSettings(memory, currentSettings);
  const rememberedSettings = memoryWithCurrentDesign[nextPrintDesign];
  const nextSettings = normalizeRawSettings(rememberedSettings ?? applyPrintDesignPreset(currentSettings, nextPrintDesign));

  return {
    settings: nextSettings,
    memory: rememberPrintDesignSettings(memoryWithCurrentDesign, nextSettings),
  };
}
