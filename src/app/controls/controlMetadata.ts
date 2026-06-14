// Static control tables that drive the workbench control panels: which
// numeric/boolean settings each panel edits, with labels, units, and steps,
// plus the setting-name types those tables are keyed by.

import type { TempestArrangementPreset } from "@/domain/purifier/designPresets";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";

export type NumericSettingName = {
  [Key in keyof RawPurifierSettings]: RawPurifierSettings[Key] extends number ? Key : never;
}[keyof RawPurifierSettings];
export type BooleanSettingName = {
  [Key in keyof RawPurifierSettings]: RawPurifierSettings[Key] extends boolean ? Key : never;
}[keyof RawPurifierSettings];
export type FanCountSettingName = "fansLeft" | "fansRight" | "fansTop" | "fansBottom";
export type FilterDimensionName = "filterWidth" | "filterDepth" | "filterThickness";
export type DonutFilterDimensionName =
  | "donutFilterOuterDiameter"
  | "donutFilterLength"
  | "donutFilterHoleDiameter";
export type DonutNumberSettingName =
  | "donutFilterOuterDiameter"
  | "donutFilterLength"
  | "donutFilterHoleDiameter"
  | "donutAdapterInsertLength"
  | "donutCapRim";
export type NumberControl<Name extends NumericSettingName> = {
  readonly name: Name;
  readonly label: string;
  readonly suffix: string;
  readonly step: string;
  // Optional hover explainer rendered as a small "i" next to the label.
  readonly info?: string;
};
// Dimension inputs render their unit suffix and step from the active display
// unit, so their control rows carry only the label and millimeter step.
export type DimensionControl<Name extends NumericSettingName> = {
  readonly name: Name;
  readonly label: string;
  readonly step: string;
};

export const fanPlacementControls: readonly { readonly name: FanCountSettingName; readonly label: string }[] = [
  { name: "fansLeft", label: "Left" },
  { name: "fansRight", label: "Right" },
  { name: "fansTop", label: "Top" },
  { name: "fansBottom", label: "Bottom" },
];
export const filterDimensionControls: readonly DimensionControl<FilterDimensionName>[] = [
  { name: "filterWidth", label: "Filter width", step: "1" },
  { name: "filterDepth", label: "Filter length", step: "1" },
  { name: "filterThickness", label: "Filter thickness", step: "0.1" },
];
export const donutFilterDimensionControls: readonly DimensionControl<DonutFilterDimensionName>[] = [
  { name: "donutFilterOuterDiameter", label: "Outer diameter", step: "1" },
  { name: "donutFilterLength", label: "Length", step: "1" },
  { name: "donutFilterHoleDiameter", label: "Center hole", step: "0.1" },
];
export const generatedGeometryControls: readonly NumberControl<NumericSettingName>[] = [
  { name: "materialThickness", label: "Material thickness", suffix: "mm", step: "0.1" },
  { name: "screwHoleDiameter", label: "Fan screw holes", suffix: "mm", step: "0.1" },
];
export const nukitPanelFitControls: readonly NumberControl<NumericSettingName>[] = [
  { name: "rim", label: "Filter rim", suffix: "mm", step: "1" },
  { name: "kerfFit", label: "Fit allowance", suffix: "mm", step: "0.01" },
];
// Slide-in clearance around the measured filter; mm-only like the other
// generated-geometry inputs.
export const tempestFitControls: readonly NumberControl<NumericSettingName>[] = [
  {
    name: "filterFitClearance",
    label: "Filter fit clearance",
    suffix: "mm",
    step: "0.5",
    info:
      "Extra space added around your measured filter so it slides in instead of press-fitting. 1 mm per side works for most printers; 0 makes the cavity exactly the measured size.",
  },
];
// Tempest honeycomb fan grill (hidden in box/exhaust mode). hexSize is the hex
// flat-to-flat, hexSpacing the rib between cells — matches tempest-builder.html.
export const tempestHexGrillControls: readonly NumberControl<NumericSettingName>[] = [
  { name: "hexSize", label: "Hex size", suffix: "mm", step: "0.5" },
  { name: "hexSpacing", label: "Hex spacing", suffix: "mm", step: "0.1" },
];
// Tempest 4-filter tower box/exhaust geometry (shown only when Box-Exhaust is the
// fan choice). A 0 size/radius means "auto" — see tempest-builder.html.
export const tempestBoxExhaustControls: readonly NumberControl<NumericSettingName>[] = [
  { name: "boxFanHoleSize", label: "Fan hole diameter", suffix: "mm", step: "1" },
  { name: "boxRingOneScrewHoles", label: "Ring 1 screw size", suffix: "x", step: "1" },
  { name: "boxRingOneScrewDiameter", label: "Ring 1 screw ø", suffix: "mm", step: "0.5" },
  { name: "boxRingOneDiameter", label: "Ring 1 diameter", suffix: "mm", step: "1" },
  { name: "boxRingTwoScrewHoles", label: "Ring 2 screw size", suffix: "x", step: "1" },
  { name: "boxRingTwoScrewDiameter", label: "Ring 2 screw ø", suffix: "mm", step: "0.5" },
  { name: "boxRingTwoDiameter", label: "Ring 2 diameter", suffix: "mm", step: "1" },
];
export const advancedJointControls: readonly NumberControl<NumericSettingName>[] = [
  { name: "fingerWidthMultiplier", label: "Finger width", suffix: "x", step: "0.1" },
  { name: "fingerSpaceMultiplier", label: "Finger space", suffix: "x", step: "0.1" },
  { name: "fingerHoleWidthMultiplier", label: "Slot width", suffix: "x", step: "0.05" },
  { name: "fingerHoleOffsetMultiplier", label: "Slot offset", suffix: "x", step: "0.05" },
  { name: "fingerPlayMultiplier", label: "Finger play", suffix: "x", step: "0.05" },
  { name: "dovetailSizeMultiplier", label: "Dovetail size", suffix: "x", step: "0.1" },
  { name: "dovetailDepthMultiplier", label: "Dovetail depth", suffix: "x", step: "0.05" },
  { name: "dovetailTaper", label: "Dovetail taper", suffix: "0-80", step: "1" },
];
export const tempestArrangementOptions: readonly {
  readonly id: TempestArrangementPreset;
  readonly label: string;
}[] = [
  { id: "single-horizontal-top-filter", label: "1 top filter" },
  { id: "dual-horizontal-sandwich", label: "2-filter sandwich" },
  { id: "four-side-filter-tower", label: "4 side filters" },
];
export const cordHoleInfo =
  "Diameter of the hole the fan power cables exit through, near the bottom of the right wall. The 4-side tower routes it through the matching top-plate corner instead.";
