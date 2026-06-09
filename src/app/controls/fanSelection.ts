// Recommended-fan selection model for the fan controls: the recommended
// 120/140 mm diameters, the product presets offered for each, and how a
// settings snapshot maps to the diameter/product pickers.

import {
  customFanProductPresetId,
  fanProductPresets,
  findFanProductPreset,
  type FanDiameter,
  type FanProductPresetId,
  type PresetFanProduct,
} from "@/domain/purifier/fanProducts";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";

export type RecommendedFanDiameter = Extract<FanDiameter, 120 | 140>;
export type FanDiameterSelection = RecommendedFanDiameter | "custom";
export type RecommendedFanProductPreset = PresetFanProduct & {
  readonly diameter: RecommendedFanDiameter;
};

export const recommendedFanDiameterOptions: readonly RecommendedFanDiameter[] = [120, 140];
export const defaultRecommendedFanDiameter: RecommendedFanDiameter = 140;

export function isRecommendedFanDiameter(diameter: FanDiameter): diameter is RecommendedFanDiameter {
  return diameter === 120 || diameter === 140;
}

export function isRecommendedFanProductPreset(preset: {
  readonly id: FanProductPresetId;
  readonly diameter: FanDiameter;
}): preset is RecommendedFanProductPreset {
  return preset.id !== customFanProductPresetId && isRecommendedFanDiameter(preset.diameter);
}

const recommendedFanProductPresets: readonly RecommendedFanProductPreset[] = fanProductPresets.filter(
  isRecommendedFanProductPreset,
);

export function fanDiameterSelectionForSettings(currentSettings: RawPurifierSettings): FanDiameterSelection {
  if (currentSettings.fanPreset === customFanProductPresetId && !isRecommendedFanDiameter(currentSettings.fanDiameter)) {
    return "custom";
  }
  const fanProduct = findFanProductPreset(currentSettings.fanPreset);
  if (isRecommendedFanProductPreset(fanProduct)) {
    return fanProduct.diameter;
  }
  if (isRecommendedFanDiameter(currentSettings.fanDiameter)) {
    return currentSettings.fanDiameter;
  }
  return defaultRecommendedFanDiameter;
}

function recommendedFanProductPresetsForDiameter(diameter: RecommendedFanDiameter): readonly RecommendedFanProductPreset[] {
  return recommendedFanProductPresets.filter((preset) => preset.diameter === diameter);
}

export function fanProductOptionsForSelection(selection: FanDiameterSelection): readonly PresetFanProduct[] {
  if (selection === "custom") {
    return [];
  }
  return recommendedFanProductPresetsForDiameter(selection);
}

export function defaultFanProductPresetForRecommendedDiameter(diameter: RecommendedFanDiameter): RecommendedFanProductPreset {
  const preset = recommendedFanProductPresetsForDiameter(diameter)[0];
  if (preset === undefined) {
    throw new Error(`defaultFanProductPresetForRecommendedDiameter: Missing ${diameter} mm fan preset`);
  }
  return preset;
}
