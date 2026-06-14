// Fan size choice model for the fan controls: the recommended 120/140 mm PC-fan
// diameters, plus "box-exhaust" (4-filter tower only) which switches the top to a
// single box/exhaust-fan hole instead of a fan grid. Mirrors tempest-builder.html.

import type { FanDiameter } from "@/domain/purifier/fans";
import type { TopExhaust } from "@/domain/purifier/settingsModel";

export type RecommendedFanDiameter = Extract<FanDiameter, 120 | 140>;
export type FanSizeChoice = RecommendedFanDiameter | "box-exhaust";

export const recommendedFanDiameterOptions: readonly RecommendedFanDiameter[] = [120, 140];

export function isRecommendedFanDiameter(diameter: FanDiameter): diameter is RecommendedFanDiameter {
  return diameter === 120 || diameter === 140;
}

// The recommended size closest to an arbitrary diameter (legacy URLs may carry a
// non-120/140 value; the UI now only offers the two).
export function nearestRecommendedFanDiameter(diameter: FanDiameter): RecommendedFanDiameter {
  return Math.abs(diameter - 120) <= Math.abs(diameter - 140) ? 120 : 140;
}

// Which segment is active: box/exhaust wins when selected; otherwise the diameter
// snapped to the nearest recommended size.
export function fanSizeChoiceForSettings(diameter: FanDiameter, topExhaust: TopExhaust): FanSizeChoice {
  if (topExhaust === "box-exhaust") {
    return "box-exhaust";
  }
  return isRecommendedFanDiameter(diameter) ? diameter : nearestRecommendedFanDiameter(diameter);
}
