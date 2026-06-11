// Derives the print-sheet preview plans shown in the workbench from a layout:
// the settings-based cache key the app memoizes worker-built kits under, and
// the plan variants for the plate and seam previews. The kits behind these
// plans build asynchronously, so a null generated plan means "still building";
// the previews keep showing the previous plan until the new one lands.

import { isStaticReferencePrintDesignId, isTempestPrintDesignId, staticPrintReferenceForPreset } from "@/domain/purifier/designPresets";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import type { PreviewMode } from "@/app/workbench/previewMode";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  findPrintVolumePreset,
  type ExportFormat,
  type PrintableSheetPlan,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import type { PrintSheetThreePreviewPlan } from "@/rendering/three/printSheetThreePreview";

export type GeneratedPrintSheetPlanCacheEntry = {
  readonly key: string;
  readonly plan: PrintableSheetPlan;
};

export function createActivePrintSheetPlan(
  currentLayout: LayoutResult,
  currentPrintVolumePresetId: PrintVolumePresetId,
  currentGeneratedPlan: PrintableSheetPlan | null,
): PrintSheetThreePreviewPlan | null {
  if (isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
    if (reference === undefined) {
      throw new Error("createActivePrintSheetPlan: Static reference design is missing source file metadata");
    }
    const preset = findPrintVolumePreset(currentPrintVolumePresetId);
    return {
      type: "static-reference",
      reference,
      bed: preset.bed,
      bedLabel: preset.label,
    };
  }
  return currentGeneratedPlan;
}

export function printKitCacheKey(
  rawSettings: RawPurifierSettings,
  currentPrintVolumePresetId: PrintVolumePresetId,
): string {
  return JSON.stringify({
    printVolumePresetId: currentPrintVolumePresetId,
    printDesign: rawSettings.printDesign,
    filterWidth: rawSettings.filterWidth,
    filterDepth: rawSettings.filterDepth,
    filterThickness: rawSettings.filterThickness,
    rim: rawSettings.rim,
    fanDiameter: rawSettings.fanDiameter,
    filters: rawSettings.filters,
    splitFrames: rawSettings.splitFrames,
    fansLeft: rawSettings.fansLeft,
    fansRight: rawSettings.fansRight,
    fansTop: rawSettings.fansTop,
    fansBottom: rawSettings.fansBottom,
    tempestArrangement: rawSettings.tempestArrangement,
    donutFilterOuterDiameter: rawSettings.donutFilterOuterDiameter,
    donutFilterLength: rawSettings.donutFilterLength,
    donutFilterHoleDiameter: rawSettings.donutFilterHoleDiameter,
    donutAdapterInsertLength: rawSettings.donutAdapterInsertLength,
    donutCapRim: rawSettings.donutCapRim,
    donutCapEnabled: rawSettings.donutCapEnabled,
    screwHoleDiameter: rawSettings.screwHoleDiameter,
    materialThickness: rawSettings.materialThickness,
    kerfFit: rawSettings.kerfFit,
    fingerWidthMultiplier: rawSettings.fingerWidthMultiplier,
    fingerSpaceMultiplier: rawSettings.fingerSpaceMultiplier,
    fingerPlayMultiplier: rawSettings.fingerPlayMultiplier,
    fingerHoleWidthMultiplier: rawSettings.fingerHoleWidthMultiplier,
    fingerHoleOffsetMultiplier: rawSettings.fingerHoleOffsetMultiplier,
    dovetailSizeMultiplier: rawSettings.dovetailSizeMultiplier,
    dovetailDepthMultiplier: rawSettings.dovetailDepthMultiplier,
    dovetailTaper: rawSettings.dovetailTaper,
  });
}

export function createActiveAssemblyPrintSeamPlan(
  currentLayout: LayoutResult,
  currentPreviewMode: PreviewMode,
  currentFabricationMethod: ExportFormat,
  currentSettings: RawPurifierSettings,
  currentGeneratedPlan: PrintableSheetPlan | null,
): PrintableSheetPlan | null {
  if (
    currentPreviewMode !== "enclosure" ||
    currentFabricationMethod !== "print-3mf" ||
    !currentSettings.showPrintSeams ||
    isTempestPrintDesignId(currentLayout.configuration.printDesign.id) ||
    isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)
  ) {
    return null;
  }
  return currentGeneratedPlan;
}
