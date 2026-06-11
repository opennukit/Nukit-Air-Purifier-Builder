// Derives the print-sheet preview plan shown in the workbench from a layout.
// The kits behind these plans build asynchronously, so a null generated plan
// means "still building"; the preview keeps showing the previous plan until
// the new one lands.

import { isStaticReferencePrintDesignId, staticPrintReferenceForPreset } from "@/domain/purifier/designPresets";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  findPrintVolumePreset,
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
