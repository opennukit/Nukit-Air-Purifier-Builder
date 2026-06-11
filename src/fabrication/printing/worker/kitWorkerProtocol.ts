// The message contract between the kit worker and its client, plus the one sync
// build both sides invoke. Messages cross the boundary via structured clone, so
// every field is plain data: RawPurifierSettings in, PrintableKit (extracted
// meshes, no WASM handles) out.

import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { createLayout } from "@/fabrication/purifierLayout";
import { createPrintDesignKit } from "@/fabrication/printing/printDesignKit";
import type { PrintableKit, PrintVolumePresetId } from "@/fabrication/printing/printableKit";

export type KitWorkerRequest = {
  readonly requestId: number;
  readonly rawSettings: RawPurifierSettings;
  readonly presetId: PrintVolumePresetId;
};

export type KitBuildResult =
  | { readonly type: "built"; readonly kit: PrintableKit }
  | { readonly type: "failed"; readonly message: string };

export type KitWorkerResponse = {
  readonly requestId: number;
  readonly result: KitBuildResult;
};

// The single sync core a kit build runs, on whichever thread hosts it: the
// worker normally, or the client thread when Workers are unavailable. The
// Manifold kernel must already be initialized on the calling thread.
export function buildKitResult(rawSettings: RawPurifierSettings, presetId: PrintVolumePresetId): KitBuildResult {
  try {
    return { type: "built", kit: createPrintDesignKit(createLayout(rawSettings), presetId) };
  } catch (error) {
    return { type: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}
