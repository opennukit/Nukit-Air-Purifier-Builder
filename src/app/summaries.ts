// Derives the read-only listings shown beside the preview: the summary grid
// under the preview stage and the parts list, both computed from the
// current layout, fabrication method, and settings snapshot.

import { createDonutFilterModel } from "@/domain/designs/donut-filter/model";
import { createTempestModel } from "@/domain/designs/tempest/model";
import {
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
  staticPrintReferenceForPreset,
  staticReferenceDefaultsForPreset,
} from "@/domain/purifier/designPresets";
import type { StaticReferencePrintDesignDefaults } from "@/domain/purifier/designPresets";
import { formatMillimeters } from "@/domain/purifier/settingsCodec";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { staticReferenceFilesUrl } from "@/app/externalLinks";
import { requireGeneratedPrintSheetPlan } from "@/app/printSheetPlans";
import type { PreviewMode } from "@/app/workbench/previewMode";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  findPrintVolumePreset,
  type ExportFormat,
  type PrintableSheetPlan,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";
import type { StaticPrintEstimate } from "@/resources/static-print-references/references";

export type SummaryItem = {
  readonly label: string;
  readonly value: string;
};
// Describes what this design needs as neutral quantities and measured
// dimensions; urls appear only on source-file and license attribution rows.
export type PartsListItem = {
  readonly category: string;
  readonly label: string;
  readonly detail: string;
  readonly url?: string;
};

// ##############################
// Preview Summary
// ##############################

export function createPreviewSummaryItems(
  currentLayout: LayoutResult,
  currentPreviewMode: PreviewMode,
  currentFabricationMethod: ExportFormat,
  currentPrintVolumePresetId: PrintVolumePresetId,
  currentGeneratedPlan: PrintableSheetPlan | null,
): readonly SummaryItem[] {
  if (currentPreviewMode === "print-sheets") {
    if (isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
      return [
        { label: "Print plates", value: findPrintVolumePreset(currentPrintVolumePresetId).label },
        { label: "Source STLs", value: String(reference?.platePreviewAssets.length ?? 0) },
        ...staticPrintEstimateSummaryItems(reference?.printEstimate),
        { label: "License", value: currentLayout.configuration.printDesign.license },
        { label: "Source", value: reference?.attribution ?? currentLayout.configuration.printDesign.source },
      ];
    }
    const plan = requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createPreviewSummaryItems");
    if (isTempestPrintDesignId(currentLayout.configuration.printDesign.id)) {
      return [
        { label: "Print plates", value: String(plan.sheets.length) },
        { label: "Print chunks", value: String(plan.kit.summary.partCount) },
        { label: "Split model", value: String(plan.kit.summary.splitPanelCount) },
        { label: "Bed", value: plan.kit.preset.label },
      ];
    }
    return [
      { label: "Print plates", value: String(plan.sheets.length) },
      { label: "Panel tiles", value: String(plan.kit.summary.panelTileCount) },
      { label: "Glue keys", value: String(plan.kit.summary.glueKeyCount) },
      { label: "Split panels", value: String(plan.kit.summary.splitPanelCount) },
      { label: "Bed", value: plan.kit.preset.label },
    ];
  }

  if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
    return [
      { label: "Design", value: currentLayout.configuration.printDesign.label },
      { label: "Type", value: "Curated static" },
      { label: "Files", value: reference?.fileSummary ?? "Original source files" },
      ...staticPrintEstimateSummaryItems(reference?.printEstimate),
      { label: "Source", value: reference?.attribution ?? currentLayout.configuration.printDesign.source },
    ];
  }

  if (currentFabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id)) {
    const plan = requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createPreviewSummaryItems");
    const model = createDonutFilterModel(currentLayout);
    return [
      { label: "Design", value: currentLayout.configuration.printDesign.label },
      {
        label: "Filter",
        value: `${formatMillimeters(model.filter.outerDiameter)} dia x ${formatMillimeters(model.filter.length)}`,
      },
      { label: "Center hole", value: formatMillimeters(model.filter.holeDiameter) },
      { label: "Fan", value: `${model.fanSize} mm` },
      { label: "Print parts", value: String(plan.kit.summary.partCount) },
      { label: "Bed", value: plan.kit.preset.label },
    ];
  }

  if (currentFabricationMethod === "print-3mf" && isTempestPrintDesignId(currentLayout.configuration.printDesign.id)) {
    const plan = requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createPreviewSummaryItems");
    const model = createTempestModel(createTempestSettingsFromLayout(currentLayout));
    return [
      { label: "Design", value: currentLayout.configuration.printDesign.label },
      { label: "Arrangement", value: tempestArrangementLabel(model.settings.arrangement.type) },
      { label: "Fans", value: String(totalConfiguredFans(currentLayout.summary.fans)) },
      { label: "Print chunks", value: String(plan.kit.summary.partCount) },
      { label: "Bed", value: plan.kit.preset.label },
    ];
  }

  const cutPanelSummary = requireCutPanelFabricationSummary(currentLayout, "createPreviewSummaryItems");
  return [
    { label: "Panels", value: String(cutPanelSummary.panelCount) },
    { label: "Chamber height", value: formatMillimeters(currentLayout.summary.chamberHeight) },
    { label: "Working depth", value: formatMillimeters(currentLayout.summary.workingDepth) },
    { label: "Fans", value: String(totalConfiguredFans(currentLayout.summary.fans)) },
    {
      label: "Sheet",
      value: `${formatMillimeters(cutPanelSummary.sheetWidth)} x ${formatMillimeters(cutPanelSummary.sheetHeight)}`,
    },
  ];
}

function staticPrintEstimateSummaryItems(estimate: StaticPrintEstimate | undefined): readonly SummaryItem[] {
  if (estimate === undefined) {
    return [];
  }
  return [
    { label: "Filament", value: `${formatKilograms(estimate.estimatedFilamentKilograms)} @ ${estimate.assumptions.infillPercent}%` },
    { label: "Print time", value: `${formatHourRange(estimate.printTimeHours)} h` },
  ];
}

// ##############################
// Parts List
// ##############################

// Any 4-pin PWM 12 V PC fan of the configured size works; the parts list
// states the electrical requirement rather than a product.
const FAN_POWER_NOTE = "4-pin PWM, 12 V";

export function createPartsListItems(
  currentLayout: LayoutResult,
  currentFabricationMethod: ExportFormat,
  currentSettings: RawPurifierSettings,
): readonly PartsListItem[] {
  if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
    if (reference === undefined) {
      return [];
    }
    const staticDefaults = staticReferenceDefaultsForPreset(currentLayout.configuration.printDesign);
    if (staticDefaults === undefined) {
      return [];
    }
    const fanCount = staticDefaults.fanCount;
    const filterCount = staticDefaults.filterCount;
    return [
      {
        category: "Source files",
        label: currentLayout.configuration.printDesign.label,
        detail: reference.fileSummary,
        url: staticReferenceFilesUrl(currentLayout),
      },
      ...staticPrintEstimatePartsItems(reference.printEstimate),
      {
        category: "Filters",
        label: `${filterCount} x ${rectangularFilterSize(currentSettings)}`,
        detail: staticReferenceFilterDetail(staticDefaults, currentSettings),
      },
      {
        category: "Fans",
        label: `${fanCount} x ${currentLayout.configuration.fan.spec.diameter} mm`,
        detail: FAN_POWER_NOTE,
      },
      {
        category: "Power",
        label: "12 V fan power",
        detail: `PWM power supply or fan hub sized for ${fanCount} fans`,
      },
      {
        category: "License",
        label: currentLayout.configuration.printDesign.license,
        detail: reference.usePolicy.note,
        url: currentLayout.configuration.printDesign.licenseUrl,
      },
    ];
  }

  const fanCount = configuredFanCountFor(currentLayout, currentFabricationMethod);
  const baseItems: PartsListItem[] = [
    {
      category: "Fans",
      label: `${fanCount} x ${currentLayout.configuration.fan.spec.diameter} mm`,
      detail: FAN_POWER_NOTE,
    },
    {
      category: "Power",
      label: "12 V fan power",
      detail: "PWM power supply or fan hub sized for the fan current",
    },
  ];

  if (currentFabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id)) {
    return [
      {
        category: "Filter",
        label: "Round HEPA filter",
        detail: `${formatMillimeters(currentSettings.donutFilterOuterDiameter)} dia x ${formatMillimeters(currentSettings.donutFilterLength)}`,
      },
      ...baseItems,
      {
        category: "Seal",
        label: "Foam gasket tape",
        detail: "Optional seal between adaptor, fan, and filter",
      },
    ];
  }

  return [
    {
      category: "Filter",
      label: rectangularFilterSize(currentSettings),
      detail: "Measured width x depth x thickness",
    },
    ...baseItems,
  ];
}

function rectangularFilterSize(currentSettings: RawPurifierSettings): string {
  return `${formatMillimeters(currentSettings.filterWidth)} x ${formatMillimeters(currentSettings.filterDepth)} x ${formatMillimeters(currentSettings.filterThickness)}`;
}

// The static design's recommended filter has a nominal trade size; once the
// settings carry different measured dimensions the row reports those instead.
function staticReferenceFilterDetail(
  staticDefaults: StaticReferencePrintDesignDefaults,
  currentSettings: RawPurifierSettings,
): string {
  const matchesRecommendedFilter =
    currentSettings.filterWidth === staticDefaults.filter.width &&
    currentSettings.filterDepth === staticDefaults.filter.depth &&
    currentSettings.filterThickness === staticDefaults.filter.thickness;
  return matchesRecommendedFilter ? `${staticDefaults.filterNominalSize} nominal size` : "User measured dimensions";
}

function staticPrintEstimatePartsItems(estimate: StaticPrintEstimate | undefined): readonly PartsListItem[] {
  if (estimate === undefined) {
    return [];
  }
  return [
    {
      category: "Filament",
      label: `${estimate.recommendedSpoolCount} x 1 kg ${estimate.assumptions.material}`,
      detail: `${formatKilograms(estimate.estimatedFilamentKilograms)} used at ${estimate.assumptions.infillPercent}% infill; about ${formatUsd(staticPrintUsedFilamentCostUsd(estimate))} used or ${formatUsd(staticPrintSpoolBudgetUsd(estimate))} with margin`,
    },
    {
      category: "Print time",
      label: `About ${formatHourRange(estimate.printTimeHours)} h`,
      detail: `${estimate.assumptions.nozzleMm} mm nozzle, ${estimate.assumptions.layerHeightMm} mm layers, ${estimate.assumptions.wallThicknessMm} mm walls. ${estimate.note}`,
    },
  ];
}

function staticPrintUsedFilamentCostUsd(estimate: StaticPrintEstimate): number {
  return estimate.estimatedFilamentKilograms * estimate.filamentCostUsdPerKilogram;
}

function staticPrintSpoolBudgetUsd(estimate: StaticPrintEstimate): number {
  return estimate.recommendedSpoolCount * estimate.filamentCostUsdPerKilogram;
}

// ##############################
// Layout Readings and Formatting
// ##############################

function tempestArrangementLabel(arrangement: string): string {
  if (arrangement === "single-horizontal-top-filter") {
    return "Single horizontal filter";
  }
  if (arrangement === "four-side-filter-tower") {
    return "Four-filter tower";
  }
  return "Dual horizontal filters";
}

function configuredFanCountFor(currentLayout: LayoutResult, currentFabricationMethod: ExportFormat): number {
  if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
    return staticReferenceDefaultsForPreset(currentLayout.configuration.printDesign)?.fanCount ?? 0;
  }
  if (currentFabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id)) {
    return currentLayout.configuration.design.type === "donut-filter-adapter" ? currentLayout.configuration.design.fan.count : 0;
  }
  return totalConfiguredFans(currentLayout.summary.fans);
}

function totalConfiguredFans(fans: LayoutResult["summary"]["fans"]): number {
  if (fans.type === "wall-banks") {
    return fans.resolvedFans.left + fans.resolvedFans.right + fans.resolvedFans.top + fans.resolvedFans.bottom;
  }
  return fans.fanCount;
}

function requireCutPanelFabricationSummary(
  currentLayout: LayoutResult,
  caller: string,
): Extract<LayoutResult["summary"]["fabrication"], { readonly type: "cut-panel-source" }> {
  if (currentLayout.summary.fabrication.type !== "cut-panel-source") {
    throw new Error(`${caller}: ${currentLayout.configuration.printDesign.label} does not have cut-panel fabrication`);
  }
  return currentLayout.summary.fabrication;
}

function formatKilograms(value: number): string {
  return `${trimNumber(value)} kg`;
}

function formatUsd(value: number): string {
  return `$${trimNumber(value)}`;
}

function formatHourRange(range: StaticPrintEstimate["printTimeHours"]): string {
  return `${trimNumber(range.min)}-${trimNumber(range.max)}`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}
