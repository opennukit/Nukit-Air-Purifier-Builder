// The message contract between the kit worker and its client — types only.
// Messages cross the boundary via structured clone, so every field is plain
// data: RawPurifierSettings in, PrintableKit (extracted meshes, no WASM
// handles) out.

import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import type { PrintVolumePresetId } from "@/fabrication/printing/printableKit";
import type { KitBuildResult } from "@/fabrication/printing/worker/kitBuild";

export type KitWorkerRequest = {
  readonly requestId: number;
  readonly rawSettings: RawPurifierSettings;
  readonly presetId: PrintVolumePresetId;
};

export type KitWorkerResponse = {
  readonly requestId: number;
  readonly result: KitBuildResult;
};
