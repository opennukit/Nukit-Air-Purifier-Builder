// Derives the print-sheet preview plans shown in the workbench from a layout:
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

// Whether the assembled view draws print seams for this configuration — the
// one case the generated sheet plan is shown outside the print-sheets preview.
export function assemblyPrintSeamPlanApplies(
  currentLayout: LayoutResult,
  currentPreviewMode: PreviewMode,
  currentFabricationMethod: ExportFormat,
  currentSettings: RawPurifierSettings,
): boolean {
  return (
    currentPreviewMode === "enclosure" &&
    currentFabricationMethod === "print-3mf" &&
    currentSettings.showPrintSeams &&
    !isTempestPrintDesignId(currentLayout.configuration.printDesign.id) &&
    !isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)
  );
}

export function createActiveAssemblyPrintSeamPlan(
  currentLayout: LayoutResult,
  currentPreviewMode: PreviewMode,
  currentFabricationMethod: ExportFormat,
  currentSettings: RawPurifierSettings,
  currentGeneratedPlan: PrintableSheetPlan | null,
): PrintableSheetPlan | null {
  if (!assemblyPrintSeamPlanApplies(currentLayout, currentPreviewMode, currentFabricationMethod, currentSettings)) {
    return null;
  }
  return currentGeneratedPlan;
}
