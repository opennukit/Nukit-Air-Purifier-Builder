// The single sync kit-build core, runnable on whichever thread hosts it: the
// kit worker normally, or the client thread when Workers are unavailable. The
// Manifold kernel must already be initialized on the calling thread.

import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { createLayout } from "@/fabrication/purifierLayout";
import { createPrintDesignKit } from "@/fabrication/printing/printDesignKit";
import type { PrintableKit, PrintVolumePresetId } from "@/fabrication/printing/printableKit";

export type KitBuildResult =
  | { readonly type: "built"; readonly kit: PrintableKit }
  | { readonly type: "failed"; readonly message: string };

export function buildKitResult(rawSettings: RawPurifierSettings, presetId: PrintVolumePresetId): KitBuildResult {
  try {
    return { type: "built", kit: createPrintDesignKit(createLayout(rawSettings), presetId) };
  } catch (error) {
    return { type: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}
