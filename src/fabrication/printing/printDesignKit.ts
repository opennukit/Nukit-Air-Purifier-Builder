import { createDonutFilterPrintableKit } from "@/fabrication/printing/designs/donut-filter/printableKit";
import { createTempestPrintableKitFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";
import { findPreviewMaterialColorPreset, type RawPurifierSettings } from "@/domain/purifier/settingsModel";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  createPrintableStlZipFromKit,
  createPrintableThreeMfExportFromKit,
  createPrintableThreeMfZipFromKit,
  type PrintableKit,
  type PrintableStlZip,
  type PrintableThreeMfExport,
  type PrintableThreeMfZip,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";

// Base name for every downloaded file/zip (print kit ZIP, per-chunk entries, and
// the laser SVG/DXF). Kept generic rather than per-design so downloads are easy
// to find regardless of which design or fabrication method produced them.
export const DOWNLOAD_BASE_NAME = "nukit-filterboxbuilder";

// The fingerprint a built kit is cached and deduplicated under: the print
// volume preset plus every setting that can shape kit geometry. Built by
// construction — spread ALL raw settings and strip only the fields known NOT
// to reach the kit — so a future geometry setting is keyed automatically
// instead of silently serving stale kits.
export function printKitCacheKey(
  rawSettings: RawPurifierSettings,
  presetId: PrintVolumePresetId,
): string {
  const {
    // Assembled-preview display toggles: they change what the three.js scene
    // shows around the model, never the kit meshes themselves.
    showFans,
    showFilterMedia,
    showFilterFrame,
    explodedView,
    showDimensions,
    showBananaScale,
    showPreviewEdges,
    autoRotate,
    cameraPreset,
    // Colors are applied at render/export time on top of a finished kit, not
    // baked into its geometry.
    previewMaterialColor,
    fanColor,
    // Laser-only settings; the print pipeline never reads them.
    labels,
    referenceScale,
    splitFrames,
    ...kitGeometryInputs
  } = rawSettings;
  return JSON.stringify({ printVolumePresetId: presetId, ...kitGeometryInputs });
}

export function createPrintDesignKit(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableKit {
  switch (layout.configuration.design.type) {
    case "donut-filter-adapter":
      return createDonutFilterPrintableKit(layout, presetId);
    case "tempest":
      return createTempestPrintableKitFromLayout(layout, presetId);
    case "static-reference":
      throw new Error("createPrintDesignKit: Static reference designs do not generate browser print kits");
    case "laser-cut":
      throw new Error("createPrintDesignKit: The Nukit Open Air design fabricates as a laser cut sheet, not a print kit");
  }
}

export function createPrintDesignThreeMfExport(
  layout: LayoutResult,
  presetId: PrintVolumePresetId,
): PrintableThreeMfExport {
  const kit = createPrintDesignKit(layout, presetId);
  return createPrintDesignThreeMfExportFromKit(layout, kit);
}

export function createPrintDesignThreeMfExportFromKit(
  layout: LayoutResult,
  kit: PrintableKit,
): PrintableThreeMfExport {
  return createPrintableThreeMfExportFromKit(
    kit,
    `${layout.configuration.printDesign.label} print kit`,
    `${DOWNLOAD_BASE_NAME}.3mf`,
    enclosureDisplayColor(layout),
  );
}

// The download the workbench ships: one 3MF per print chunk, zipped. Splitting
// the kit keeps every chunk on its own bed in any slicer (not only the ones
// that read Bambu/Orca plate metadata).
export function createPrintDesignThreeMfZip(
  layout: LayoutResult,
  presetId: PrintVolumePresetId,
): PrintableThreeMfZip {
  return createPrintDesignThreeMfZipFromKit(layout, createPrintDesignKit(layout, presetId));
}

export function createPrintDesignStlZipFromKit(
  _layout: LayoutResult,
  kit: PrintableKit,
): PrintableStlZip {
  return createPrintableStlZipFromKit(kit, DOWNLOAD_BASE_NAME);
}

export function createPrintDesignThreeMfZipFromKit(
  layout: LayoutResult,
  kit: PrintableKit,
): PrintableThreeMfZip {
  return createPrintableThreeMfZipFromKit(
    kit,
    `${layout.configuration.printDesign.label} print kit`,
    DOWNLOAD_BASE_NAME,
    enclosureDisplayColor(layout),
  );
}

// The selected preview enclosure color, as a 3MF displaycolor hex (#RRGGBBAA).
function enclosureDisplayColor(layout: LayoutResult): string {
  const color = findPreviewMaterialColorPreset(layout.configuration.preview.enclosure.materialColor).color;
  return `#${color.toString(16).padStart(6, "0")}ff`;
}
