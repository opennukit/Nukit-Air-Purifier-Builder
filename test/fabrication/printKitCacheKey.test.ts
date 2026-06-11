import { describe, expect, test } from "bun:test";
import { serializePurifierDraft } from "@/domain/purifier/airPurifier";
import { decodePurifierDraftSettings } from "@/domain/purifier/settingsCodec";
import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { printKitCacheKey } from "@/fabrication/printing/printDesignKit";

const defaultSettings: RawPurifierSettings = serializePurifierDraft(decodePurifierDraftSettings(""));

describe("printKitCacheKey", () => {
  test("every geometry input changes the key", () => {
    const baseKey = printKitCacheKey(defaultSettings, "bed-220");
    const geometryEdits: Partial<RawPurifierSettings>[] = [
      { filterWidth: defaultSettings.filterWidth + 1 },
      { filterFitClearance: defaultSettings.filterFitClearance + 0.2 },
      { tempestArrangement: "four-side-filter-tower" },
      { materialThickness: defaultSettings.materialThickness + 1 },
    ];
    for (const edit of geometryEdits) {
      expect(printKitCacheKey({ ...defaultSettings, ...edit }, "bed-220")).not.toBe(baseKey);
    }
    expect(printKitCacheKey(defaultSettings, "bed-180")).not.toBe(baseKey);
  });

  test("preview-only and laser-only settings do not change the key", () => {
    const baseKey = printKitCacheKey(defaultSettings, "bed-220");
    const nonGeometryEdits: Partial<RawPurifierSettings>[] = [
      { showFans: !defaultSettings.showFans },
      { showFilterMedia: !defaultSettings.showFilterMedia },
      { showFilterFrame: !defaultSettings.showFilterFrame },
      { explodedView: !defaultSettings.explodedView },
      { showDimensions: !defaultSettings.showDimensions },
      { showBananaScale: !defaultSettings.showBananaScale },
      { showPreviewEdges: !defaultSettings.showPreviewEdges },
      { autoRotate: !defaultSettings.autoRotate },
      { cameraPreset: "top" },
      { previewMaterialColor: "forest-green" },
      { fanColor: defaultSettings.fanColor === "black" ? "beige" : "black" },
      { labels: !defaultSettings.labels },
      { referenceScale: defaultSettings.referenceScale + 10 },
      { splitFrames: !defaultSettings.splitFrames },
    ];
    for (const edit of nonGeometryEdits) {
      expect(printKitCacheKey({ ...defaultSettings, ...edit }, "bed-220")).toBe(baseKey);
    }
  });
});
