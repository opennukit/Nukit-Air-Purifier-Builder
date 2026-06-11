// Fan size choice model for the fan controls: the recommended 120/140 mm
// diameters offered as segmented options, plus the "custom" choice that
// reveals the free diameter input.

import type { FanDiameter } from "@/domain/purifier/fans";

export type RecommendedFanDiameter = Extract<FanDiameter, 120 | 140>;
export type FanSizeChoice = RecommendedFanDiameter | "custom";

export const recommendedFanDiameterOptions: readonly RecommendedFanDiameter[] = [120, 140];

export function isRecommendedFanDiameter(diameter: FanDiameter): diameter is RecommendedFanDiameter {
  return diameter === 120 || diameter === 140;
}

// The settings only store the diameter; "custom" is a UI affordance. It is
// selected when the diameter is not a recommended size, or when the user
// pinned the custom segment while the diameter still matches one.
export function fanSizeChoiceForDiameter(diameter: FanDiameter, customPinned: boolean): FanSizeChoice {
  if (customPinned || !isRecommendedFanDiameter(diameter)) {
    return "custom";
  }
  return diameter;
}
