import {
  applyPrintDesignPreset,
  normalizePurifierDraft,
  printDesignIdForPurifierDraft,
  serializePurifierDraft,
  type PurifierDraft,
  type PrintDesignId,
  type RawPurifierSettings,
} from "@/domain/purifier/airPurifier";

export type PrintDesignSettingsMemory = Readonly<Partial<Record<PrintDesignId, PurifierDraft>>>;

export type PrintDesignSettingsSwitch = {
  readonly settings: PurifierDraft;
  readonly memory: PrintDesignSettingsMemory;
};

export function createPrintDesignSettingsMemory(settings: RawPurifierSettings | PurifierDraft): PrintDesignSettingsMemory {
  return rememberPrintDesignSettings({}, settings);
}

export function rememberPrintDesignSettings(
  memory: PrintDesignSettingsMemory,
  settings: RawPurifierSettings | PurifierDraft,
): PrintDesignSettingsMemory {
  const draft = normalizePurifierDraft(settings);
  return {
    ...memory,
    [printDesignIdForPurifierDraft(draft)]: draft,
  };
}

export function switchPrintDesignSettings(
  memory: PrintDesignSettingsMemory,
  currentSettings: RawPurifierSettings | PurifierDraft,
  nextPrintDesign: PrintDesignId,
): PrintDesignSettingsSwitch {
  const memoryWithCurrentDesign = rememberPrintDesignSettings(memory, currentSettings);
  const rememberedSettings = memoryWithCurrentDesign[nextPrintDesign];
  const currentDraft = normalizePurifierDraft(currentSettings);
  const nextSettings = normalizePurifierDraft(
    rememberedSettings ?? applyPrintDesignPreset(serializePurifierDraft(currentDraft), nextPrintDesign),
  );

  return {
    settings: nextSettings,
    memory: rememberPrintDesignSettings(memoryWithCurrentDesign, nextSettings),
  };
}
