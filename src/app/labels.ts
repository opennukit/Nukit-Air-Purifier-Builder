// Display text for workbench controls: fabrication method names, preview
// color names, fan color names, and swatch CSS color values.

import type { FanColor } from "@/domain/purifier/fans";
import type { PreviewMaterialColorPreset } from "@/domain/purifier/settingsModel";
import type { ExportFormat } from "@/fabrication/printing/printableKit";

export function fabricationMethodLabel(method: ExportFormat): string {
  return method === "print-3mf" ? "3D print" : "Laser cut";
}

export function previewMaterialColorLabel(color: PreviewMaterialColorPreset): string {
  return `${color.label} preview color`;
}

export const fanColorLabels: Record<FanColor, string> = {
  black: "Black",
  beige: "Beige/brown",
};

export function swatchColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
