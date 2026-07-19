// Derives the read-only listings shown beside the preview: the summary grid
// under the preview stage and the parts list, both computed from the
// current layout, fabrication method, and settings snapshot.

import { createDonutFilterModel } from "@/domain/designs/donut-filter/model";
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
import { filterHasStockCadrData, matchedFilterSizePreset } from "@/domain/purifier/filterPresets";
import { staticReferenceFilesUrl } from "@/app/externalLinks";
import type { PreviewMode } from "@/app/workbench/previewMode";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  findPrintVolumePreset,
  isCutSheetExportFormat,
  type ExportFormat,
  type PrintableSheetPlan,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import { CUSTOM_FAN_ID, findBoxFanModel, findPcFanModel, type CadrEstimate } from "@/domain/purifier/cadr";
import { createTempestChunkPlan, createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";
import type {
  StaticPrintEstimate,
  StaticPrintReference,
} from "@/resources/static-print-references/references";

export type SummaryItem = {
  readonly label: string;
  readonly value: string;
  // Optional secondary value shown smaller, on its own line under the main value
  // (e.g. the metric CADR, the "@ 1 m" noise distance, the wattage/voltage).
  readonly detail?: string;
};
// Describes what this design needs as neutral quantities and measured
// dimensions; urls appear only on source-file and license attribution rows.
// A detail can optionally be a run of plain-text and linked keyword segments, so a
// single note can carry several inline links (e.g. one fastener line linking each of
// its parts to a supplier). `detail` stays the plain-text equivalent for anything
// that renders text only.
export type PartsListDetailSegment = string | { readonly text: string; readonly url: string };

export type PartsListItem = {
  readonly category: string;
  readonly label: string;
  readonly detail: string;
  readonly url?: string;
  readonly detailSegments?: readonly PartsListDetailSegment[];
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
    // Assembled-box (enclosure) view: estimated performance only. The build
    // quantities (chunks, filament, bed) live in the print-sheets view.
    return cadrSummaryItems(currentLayout.summary.cadr, currentLayout.rawSettings.baselineAch, isCustomFilter(currentLayout));
  }

  const cutPanelSummary = requireCutPanelFabricationSummary(currentLayout, "createPreviewSummaryItems");
  // The cut-sheet drawing view keeps the panel/sheet dimensions; the assembled-box
  // (enclosure) view shows estimated performance + the panel count.
  if (currentPreviewMode === "cut-sheet") {
    return [
      { label: "Panels", value: String(cutPanelSummary.panelCount) },
      // Labelled to match the 3D dimension guides: the preview tilts the model so
      // workingDepth reads as the outside height and chamberHeight as the outside depth.
      { label: "Outside height", value: formatMillimeters(currentLayout.summary.workingDepth) },
      { label: "Outside depth", value: formatMillimeters(currentLayout.summary.chamberHeight) },
      { label: "Fans", value: String(totalConfiguredFans(currentLayout.summary.fans)) },
      {
        label: "Sheet",
        value: `${formatMillimeters(cutPanelSummary.sheetWidth)} x ${formatMillimeters(cutPanelSummary.sheetHeight)}`,
      },
    ];
  }
  return cadrSummaryItems(currentLayout.summary.cadr, currentLayout.rawSettings.baselineAch, isCustomFilter(currentLayout));
}

// A custom filter has no characterized pressure drop, so the MERV-13 CADR model does
// not apply and the performance figures are suppressed. Stock sizes (within the CADR
// tolerance) keep their estimate.
function isCustomFilter(layout: LayoutResult): boolean {
  const filter = layout.configuration.filter;
  return !filterHasStockCadrData(filter.width, filter.depth, filter.thickness);
}

// The performance tiles shown under the assembled-box (enclosure) preview. A custom
// filter (no matched stock size) has no characterized pressure drop, so the CADR
// model does not apply; show it as unavailable rather than an extrapolated number.
function cadrSummaryItems(cadr: CadrEstimate, baselineAch: number, filterIsCustom: boolean): readonly SummaryItem[] {
  if (filterIsCustom) {
    // No characterized drop for a custom filter, so the whole filter-derived estimate
    // (CADR, ACH, infection risk) is unavailable. Keep the fan count for context.
    return [
      { label: "CADR", value: "n/a", detail: "estimate not available for this filter" },
      { label: "Fans", value: String(cadr.fanCount) },
    ];
  }
  return [
    cadr.cadrCfm > 0
      ? { label: "CADR", value: `${Math.round(cadr.cadrCfm)} CFM`, detail: `${Math.round(cadr.cadrM3h)} m³/h` }
      : { label: "CADR", value: "—" },
    cadr.ach === null
      ? { label: "ACH", value: "—" }
      : { label: "ACH", value: cadr.ach.toFixed(1), detail: cadr.roomLabel },
    cadr.noiseDbA === null
      ? { label: "Noise", value: "—" }
      : { label: "Noise", value: `${cadr.noiseDbA.toFixed(1)} dBA`, detail: "@ 1 m" },
    cadrPowerItem(cadr),
    riskReductionItem(cadr, baselineAch),
    { label: "Fans", value: String(cadr.fanCount) },
  ];
}

// Approximate reduction in long-range airborne infection risk from the build's
// clean-air delivery: ach / (baselineAch + ach). Relative estimate.
function riskReductionItem(cadr: CadrEstimate, baselineAch: number): SummaryItem {
  const total = (cadr.ach ?? 0) + baselineAch;
  if (cadr.ach === null || total <= 0) {
    return { label: "Infection risk", value: "—" };
  }
  return {
    label: "Infection risk",
    value: `−${Math.round((cadr.ach / total) * 100)}%`,
    detail: `vs ${baselineAch} ACH room`,
  };
}

// Power tile: PC fans show the current large with the wattage/voltage smaller; the
// box fan shows the wattage large with the amperage/voltage smaller (matching the
// diy-cadr-calculator).
function cadrPowerItem(cadr: CadrEstimate): SummaryItem {
  if (cadr.powerW === null || cadr.currentA === null) {
    return { label: "Power", value: "—" };
  }
  if (cadr.voltage === 12) {
    return { label: "Power", value: `${cadr.currentA.toFixed(2)} A`, detail: `≈ ${cadr.powerW.toFixed(1)} W @ 12 V` };
  }
  return { label: "Power", value: `${Math.round(cadr.powerW)} W`, detail: `≈ ${cadr.currentA.toFixed(2)} A @ 120 V` };
}

// The print kit builds asynchronously in the kit worker, so a null plan means
// "still building": plan-derived values show a pending placeholder until the
// first build lands.
function planValue(plan: PrintableSheetPlan | null, read: (plan: PrintableSheetPlan) => string): string {
  return plan === null ? "…" : read(plan);
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

// The specific fan the build is priced/spec'd against, so the parts list names it
// alongside the neutral "any fan of this size" note. Falls back to the bare size
// when the fan is custom or unrecognized.
function selectedFanTypeLabel(currentLayout: LayoutResult): string {
  const id = currentLayout.summary.cadr.fanModelId;
  if (id === CUSTOM_FAN_ID) {
    return "Custom fan";
  }
  return findPcFanModel(id)?.name ?? findBoxFanModel(id)?.name ?? `${currentLayout.configuration.fan.spec.diameter} mm fan`;
}

// The 3D-printed enclosure is thicker than a PC case, so the short self-tapping
// screws bundled with fans do not reach; the fastener row links each option to a
// supplier listing at the matching size.
const FAN_SCREW_LINKS = {
  m4Bolts:
    "https://www.mcmaster.com/products/screws/system-of-measurement~metric/thread-size~m4-1/length~45-mm/fastener-head-type~rounded/rounded-head-screws-2~rounded-head-style~pan/",
  m4Locknuts:
    "https://www.mcmaster.com/products/locknuts/nylon-insert-locknuts-2~~/system-of-measurement~metric/thread-size~m4-1/nut-type~locknut/",
  m4Washers:
    "https://www.mcmaster.com/products/washers/general-purpose-washers-3~~/system-of-measurement~metric/screw-size~m4/",
  m5Tapping:
    "https://www.mcmaster.com/products/product-line~~screws-and-bolts~~2q3Rr7zj/tapping-screws-2~/system-of-measurement~metric/screw-size~m5/length~20-mm/tapping-screws-2~fastener-head-type~rounded/",
} as const;

// Power-supply parts row sized from the estimated draw. PC fans run on a 12 V
// PWM supply / fan hub; we round the calculated current UP to the next whole amp
// so the suggested rating always has headroom (1.5 A draw -> "≥ 2 A"). The box
// fan plugs into a 120 V mains outlet, so it states that instead of a 12 V supply.
function fanPowerSupplyItem(cadr: CadrEstimate): PartsListItem {
  if (cadr.voltage === 120) {
    const detail =
      cadr.currentA !== null && cadr.currentA > 0
        ? `120 V mains outlet (fan draws ≈ ${cadr.currentA.toFixed(2)} A)`
        : "120 V mains outlet for the box fan";
    return { category: "Power", label: "Mains power", detail };
  }
  if (cadr.currentA === null || cadr.currentA <= 0) {
    return { category: "Power", label: "12 V fan power", detail: "PWM power supply or fan hub sized for the fan current" };
  }
  const suggestedAmps = Math.max(1, Math.ceil(cadr.currentA));
  return {
    category: "Power",
    label: "12 V fan power",
    detail: `PWM power supply or fan hub, ≥ ${suggestedAmps} A at 12 V (fans draw ≈ ${cadr.currentA.toFixed(2)} A)`,
  };
}

// Solid PLA is ~1.24 g/cm^3; PETG (~1.27) is within the ballpark, so one
// constant covers the "A spool of PLA or PETG" estimate.
const FILAMENT_DENSITY_G_PER_CM3 = 1.24;
// A maker does not print these walls 100% solid, so the kit's true (solid)
// material volume overstates filament use by ~2x. Model a typical sliced wall:
// the perimeter shells print solid on both faces, the enclosed core fills at a
// sparse infill fraction. Thin walls are nearly all perimeter (factor -> 1);
// thick walls benefit most from infill. 10% is the field-tested setting these
// boxes are actually printed at — rock solid, and the estimate should not
// encourage wasting plastic.
const FILAMENT_INFILL_FRACTION = 0.1;
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

// The preview "Filament" row: the infill-discounted estimate once the lazy
// plan exists, the pending placeholder until then.
function filamentSummaryValue(plan: PrintableSheetPlan | null, wallThicknessMm: number): string {
  return planValue(plan, (built) =>
    formatGrams(filamentGramsFromVolume(built.kit.summary.materialVolumeMm3, wallThicknessMm)),
  );
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
      fanPowerSupplyItem(currentLayout.summary.cadr),
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
      detail: `${selectedFanTypeLabel(currentLayout)} · ${FAN_POWER_NOTE}`,
    },
    fanPowerSupplyItem(currentLayout.summary.cadr),
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
        detail: "Measured width x length x thickness",
      },
      ...baseItems,
      ...tempestPrintPartsItems(currentLayout, currentPrintVolumePresetId, currentGeneratedPlan),
    ];
  }

  return [
    {
      category: "Filter",
      label: rectangularFilterSize(currentSettings),
      detail: "Measured width x length x thickness",
    },
    ...baseItems,
    // Laser-cut and hand-cut boxes are PC-case thin, so the fans' own bundled screws
    // (or push-in silicone pins) reach; no longer bolts like the thick 3D print.
    ...(isCutSheetExportFormat(currentFabricationMethod)
      ? [
          {
            category: "Fasteners",
            label: "Fan screws",
            detail: "You can use the M5 self-tapping screws that come with the fans or silicone pins.",
            detailSegments: [
              "You can use the M5 self-tapping screws that come with the fans or ",
              { text: "silicone pins", url: "https://www.amazon.com/s?k=silicone%2Bpc%2Bcase%2Bfan%2Bpins" },
              ".",
            ],
          } satisfies PartsListItem,
        ]
      : []),
    ...laserSheetPartsItems(currentLayout, currentFabricationMethod),
  ];
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
  const boltCount = configuredFanCountFor(currentLayout, "print-3mf") * 4;
  return [
    filamentPartsItem(currentGeneratedPlan, "the housing", currentLayout.configuration.cutting.materialThickness),
    {
      category: "Fasteners",
      label: "Fan screws",
      detail:
        `You will need ${boltCount} 45mm M4 bolts with washers and lock nuts or 20mm M5 self-tapping screws. ` +
        "The self-tapping screws included with most fans are not long enough for the 3D printed enclosure.",
      detailSegments: [
        `You will need ${boltCount} `,
        { text: "45mm M4 bolts", url: FAN_SCREW_LINKS.m4Bolts },
        " with ",
        { text: "washers", url: FAN_SCREW_LINKS.m4Washers },
        " and ",
        { text: "lock nuts", url: FAN_SCREW_LINKS.m4Locknuts },
        " or ",
        { text: "20mm M5 self-tapping screws", url: FAN_SCREW_LINKS.m5Tapping },
        ". The self-tapping screws included with most fans are not long enough for the 3D printed enclosure.",
      ],
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
  if (!isCutSheetExportFormat(currentFabricationMethod) || currentLayout.summary.fabrication.type !== "cut-panel-source") {
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
  // Show the stock filter's name when the dimensions match a preset (in either
  // orientation); otherwise the measured size. Filters are entered as whole
  // measured millimetres, so the summary rounds them.
  const preset = matchedFilterSizePreset(
    currentSettings.filterWidth,
    currentSettings.filterDepth,
    currentSettings.filterThickness,
  );
  if (preset !== undefined) {
    return preset.label;
  }
  const whole = (value: number) => formatMillimeters(Math.round(value));
  return `${whole(currentSettings.filterWidth)} x ${whole(currentSettings.filterDepth)} x ${whole(currentSettings.filterThickness)}`;
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
    return fans.resolvedFans.left + fans.resolvedFans.right + fans.resolvedFans.top + fans.resolvedFans.bottom + fans.backPlateFans;
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
