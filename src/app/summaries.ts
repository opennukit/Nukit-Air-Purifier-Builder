// Derives the read-only listings shown beside the preview: the summary grid
// under the preview stage and the parts list, both computed from the
// current layout, fabrication method, and settings snapshot.

import { createDonutFilterModel } from "@/domain/designs/donut-filter/model";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { alignmentPinPieceLength } from "@/domain/designs/tempest/shared";
import {
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
  staticPrintReferenceForPreset,
  staticReferenceDefaultsForPreset,
} from "@/domain/purifier/designPresets";
import type {
  PrintDesignPreset,
  StaticReferencePrintDesignDefaults,
} from "@/domain/purifier/designPresets";
import { formatMillimeters } from "@/domain/purifier/settingsCodec";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { staticReferenceFilesUrl } from "@/app/externalLinks";
import type { PreviewMode } from "@/app/workbench/previewMode";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  findPrintVolumePreset,
  type ExportFormat,
  type PrintableSheetPlan,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import { createTempestChunkPlan, createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";
import type {
  StaticPrintEstimate,
  StaticPrintReference,
} from "@/resources/static-print-references/references";

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
        { label: "Bed", value: findPrintVolumePreset(currentPrintVolumePresetId).label },
        { label: "Source STLs", value: String(reference?.platePreviewAssets.length ?? 0) },
        ...staticPrintEstimateSummaryItems(reference?.printEstimate),
        { label: "License", value: currentLayout.configuration.printDesign.license },
        ...sourceSummaryItems(reference, currentLayout.configuration.printDesign),
      ];
    }
    if (isTempestPrintDesignId(currentLayout.configuration.printDesign.id)) {
      return [
        { label: "Print plates", value: planValue(currentGeneratedPlan, (plan) => String(plan.sheets.length)) },
        { label: "Print chunks", value: planValue(currentGeneratedPlan, (plan) => String(plan.kit.summary.partCount)) },
        { label: "Filament", value: filamentSummaryValue(currentGeneratedPlan, currentLayout.configuration.cutting.materialThickness) },
        { label: "Bed", value: planValue(currentGeneratedPlan, (plan) => plan.kit.preset.label) },
      ];
    }
    return [
      { label: "Print plates", value: planValue(currentGeneratedPlan, (plan) => String(plan.sheets.length)) },
      { label: "Print parts", value: planValue(currentGeneratedPlan, (plan) => String(plan.kit.summary.partCount)) },
      { label: "Filament", value: filamentSummaryValue(currentGeneratedPlan, currentLayout.configuration.cutting.materialThickness) },
      { label: "Bed", value: planValue(currentGeneratedPlan, (plan) => plan.kit.preset.label) },
    ];
  }

  if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
    return [
      { label: "Design", value: currentLayout.configuration.printDesign.label },
      { label: "Type", value: "Community files" },
      { label: "Files", value: reference?.fileSummary ?? "Original source files" },
      ...staticPrintEstimateSummaryItems(reference?.printEstimate),
      ...sourceSummaryItems(reference, currentLayout.configuration.printDesign),
    ];
  }

  if (currentFabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id)) {
    const model = createDonutFilterModel(currentLayout);
    return [
      { label: "Design", value: currentLayout.configuration.printDesign.label },
      {
        label: "Filter",
        value: `${formatMillimeters(model.filter.outerDiameter)} dia x ${formatMillimeters(model.filter.length)}`,
      },
      { label: "Center hole", value: formatMillimeters(model.filter.holeDiameter) },
      { label: "Fan", value: `${model.fanSize} mm` },
      { label: "Print parts", value: planValue(currentGeneratedPlan, (plan) => String(plan.kit.summary.partCount)) },
      { label: "Filament", value: filamentSummaryValue(currentGeneratedPlan, currentLayout.configuration.cutting.materialThickness) },
      { label: "Bed", value: planValue(currentGeneratedPlan, (plan) => plan.kit.preset.label) },
    ];
  }

  if (currentFabricationMethod === "print-3mf" && isTempestPrintDesignId(currentLayout.configuration.printDesign.id)) {
    const model = createTempestModel(createTempestSettingsFromLayout(currentLayout));
    return [
      { label: "Design", value: currentLayout.configuration.printDesign.label },
      { label: "Arrangement", value: tempestArrangementLabel(model.settings.arrangement.type) },
      { label: "Fans", value: String(totalConfiguredFans(currentLayout.summary.fans)) },
      { label: "Print chunks", value: planValue(currentGeneratedPlan, (plan) => String(plan.kit.summary.partCount)) },
      { label: "Filament", value: filamentSummaryValue(currentGeneratedPlan, currentLayout.configuration.cutting.materialThickness) },
      { label: "Bed", value: planValue(currentGeneratedPlan, (plan) => plan.kit.preset.label) },
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

// The print kit builds asynchronously in the kit worker, so a null plan means
// "still building": plan-derived values show a pending placeholder until the
// first build lands.
function planValue(plan: PrintableSheetPlan | null, read: (plan: PrintableSheetPlan) => string): string {
  return plan === null ? "…" : read(plan);
}

// The preview "Filament" row: the infill-discounted estimate once the lazy
// plan exists, the pending placeholder until then.
function filamentSummaryValue(plan: PrintableSheetPlan | null, wallThicknessMm: number): string {
  return planValue(plan, (built) =>
    formatGrams(filamentGramsFromVolume(built.kit.summary.materialVolumeMm3, wallThicknessMm)),
  );
}

// Attribution row for curated static designs; omitted when neither the
// reference nor the preset names a source.
function sourceSummaryItems(
  reference: StaticPrintReference | undefined,
  preset: PrintDesignPreset,
): readonly SummaryItem[] {
  const source = reference?.attribution ?? preset.source;
  return source === undefined ? [] : [{ label: "Source", value: source }];
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

// Solid PLA is ~1.24 g/cm^3; PETG (~1.27) is within the ballpark, so one
// constant covers the "A spool of PLA or PETG" estimate.
const FILAMENT_DENSITY_G_PER_CM3 = 1.24;
// A maker does not print these walls 100% solid, so the kit's true (solid)
// material volume overstates filament use by ~2x. Model a typical sliced wall:
// the perimeter shells print solid on both faces, the enclosed core fills at a
// sparse infill fraction. Thin walls are nearly all perimeter (factor -> 1);
// thick walls benefit most from infill.
const FILAMENT_INFILL_FRACTION = 0.15;
const PRINT_PERIMETER_COUNT = 2;
const PRINT_LINE_WIDTH_MM = 0.45;
const FILAMENT_INFILL_PERCENT_LABEL = `~${Math.round(FILAMENT_INFILL_FRACTION * 100)}% infill`;

// Fraction of a solid wall of the given thickness that ends up as deposited
// filament once sliced with the assumptions above.
function printedSolidFraction(wallThicknessMm: number): number {
  if (wallThicknessMm <= 0) {
    return 1;
  }
  const perimeterSolidMm = Math.min(wallThicknessMm, 2 * PRINT_PERIMETER_COUNT * PRINT_LINE_WIDTH_MM);
  const coreMm = wallThicknessMm - perimeterSolidMm;
  return (perimeterSolidMm + coreMm * FILAMENT_INFILL_FRACTION) / wallThicknessMm;
}

// Approximate deposited-filament grams from the kit's solid material volume,
// discounted by the sliced wall model. Deliberately a ballpark — reads "about".
function filamentGramsFromVolume(materialVolumeMm3: number, wallThicknessMm: number): number {
  return (materialVolumeMm3 / 1000) * FILAMENT_DENSITY_G_PER_CM3 * printedSolidFraction(wallThicknessMm);
}

// A ballpark figure a maker can act on: round to the nearest 5 g under a
// kilogram, switch to one-decimal kilograms once a single spool is in play.
function formatGrams(grams: number): string {
  if (grams >= 1000) {
    return `about ${trimNumber(grams / 1000)} kg`;
  }
  return `about ${(Math.round(grams / 5) * 5).toFixed(0)} g`;
}

export function createPartsListItems(
  currentLayout: LayoutResult,
  currentFabricationMethod: ExportFormat,
  currentSettings: RawPurifierSettings,
  currentPrintVolumePresetId: PrintVolumePresetId,
  currentGeneratedPlan: PrintableSheetPlan | null,
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
      filamentPartsItem(currentGeneratedPlan, "the adaptor, fan guard, and cap", currentLayout.configuration.cutting.materialThickness),
      ...baseItems,
      {
        category: "Seal",
        label: "Foam gasket tape",
        detail: "Optional seal between adaptor, fan, and filter",
      },
    ];
  }

  if (currentFabricationMethod === "print-3mf" && isTempestPrintDesignId(currentLayout.configuration.printDesign.id)) {
    return [
      {
        category: "Filter",
        label: rectangularFilterSize(currentSettings),
        detail: "Measured width x depth x thickness",
      },
      ...baseItems,
      ...tempestPrintPartsItems(currentLayout, currentPrintVolumePresetId, currentGeneratedPlan),
    ];
  }

  return [
    {
      category: "Filter",
      label: rectangularFilterSize(currentSettings),
      detail: "Measured width x depth x thickness",
    },
    ...baseItems,
    ...laserSheetPartsItems(currentLayout, currentFabricationMethod),
  ];
}

// The filament line for a generated print: once a plan exists the kit's
// material volume gives an "about N g" estimate, discounted for sparse infill;
// until the lazy build lands (plan null) it stays the generic spool line.
// `usage` names what prints so the placeholder reads naturally for either design.
function filamentPartsItem(
  plan: PrintableSheetPlan | null,
  usage: string,
  wallThicknessMm: number,
): PartsListItem {
  if (plan === null) {
    return {
      category: "Filament",
      label: "A spool of PLA or PETG",
      detail: `Prints ${usage} on the selected bed`,
    };
  }
  return {
    category: "Filament",
    label: "A spool of PLA or PETG",
    detail: `${formatGrams(filamentGramsFromVolume(plan.kit.summary.materialVolumeMm3, wallThicknessMm))} at ${FILAMENT_INFILL_PERCENT_LABEL} (PLA density)`,
  };
}

// The consumables behind a tempest print: filament for the housing, the
// fans' own screws, and — only when the active print volume splits the
// model — seam glue and filament pin stock.
function tempestPrintPartsItems(
  currentLayout: LayoutResult,
  currentPrintVolumePresetId: PrintVolumePresetId,
  currentGeneratedPlan: PrintableSheetPlan | null,
): readonly PartsListItem[] {
  const plan = createTempestChunkPlan(createTempestSettingsFromLayout(currentLayout), currentPrintVolumePresetId);
  const pins = plan.model.settings.alignmentPins;
  const seamItems: PartsListItem[] =
    plan.printableChunkGrid.totalCount > 1
      ? [
          {
            category: "Assembly",
            label: "Super glue or epoxy",
            detail: "Bonds the printed chunks at the seams",
          },
          ...(pins.type === "enabled"
            ? [
                {
                  category: "Assembly",
                  label: "Filament alignment pins",
                  detail: `Short ${formatMillimeters(alignmentPinPieceLength(pins.holeDepth))} pieces of 1.75 mm filament for the holes along each seam`,
                },
              ]
            : []),
        ]
      : [];
  return [
    filamentPartsItem(currentGeneratedPlan, "the housing", currentLayout.configuration.cutting.materialThickness),
    {
      category: "Fasteners",
      label: "Fan screws",
      detail: "Included with the fans; the screw holes are sized for them",
    },
    ...seamItems,
  ];
}

// The laser drawing needs one sheet of rigid stock at least as large as the
// arranged cut sheet, at the configured material thickness.
function laserSheetPartsItems(
  currentLayout: LayoutResult,
  currentFabricationMethod: ExportFormat,
): readonly PartsListItem[] {
  if (currentFabricationMethod !== "laser-svg" || currentLayout.summary.fabrication.type !== "cut-panel-source") {
    return [];
  }
  const { sheetWidth, sheetHeight } = currentLayout.summary.fabrication;
  return [
    {
      category: "Sheet",
      label: `${formatMillimeters(sheetWidth)} x ${formatMillimeters(sheetHeight)}`,
      detail: `Rigid sheet stock, ${formatMillimeters(currentLayout.configuration.cutting.materialThickness)} thick`,
    },
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
