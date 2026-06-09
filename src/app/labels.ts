// Display text for workbench controls: fabrication method names, filter
// preset option labels, preview color names, and swatch CSS color values.

import { customFilterPresetId, filterPresets } from "@/domain/purifier/filter";
import { formatMillimeters } from "@/domain/purifier/settingsCodec";
import type { PreviewMaterialColorPreset } from "@/domain/purifier/settingsModel";
import type { ExportFormat } from "@/fabrication/printing/printableKit";

export function fabricationMethodLabel(method: ExportFormat): string {
  return method === "print-3mf" ? "3D print" : "Laser cut";
}

export function filterPresetOptionLabel(preset: (typeof filterPresets)[number]): string {
  if (preset.id === customFilterPresetId) {
    return `${preset.label} - enter exact dimensions`;
  }
  return `${preset.label} - ${formatFilterDimensions(preset.dimensions)}`;
}

function formatFilterDimensions(dimensions: (typeof filterPresets)[number]["dimensions"]): string {
  return `${formatMillimeters(dimensions.width)} x ${formatMillimeters(dimensions.depth)} x ${formatMillimeters(dimensions.thickness)}`;
}

export function previewMaterialColorLabel(color: PreviewMaterialColorPreset): string {
  return `${color.label} preview color`;
}

export function swatchColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
