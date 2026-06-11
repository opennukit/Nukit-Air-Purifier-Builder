import { createDonutFilterPrintableKit } from "@/fabrication/printing/designs/donut-filter/printableKit";
import { createTempestPrintableKitFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";
import { findPreviewMaterialColorPreset, type RawPurifierSettings } from "@/domain/purifier/settingsModel";
import {
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
} from "@/domain/purifier/designPresets";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  createPrintableKit,
  createPrintableThreeMfExportFromKit,
  type PrintableKit,
  type PrintableThreeMfExport,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";

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
    // Laser-SVG output options; the print pipeline never reads them.
    labels,
    referenceScale,
    ...kitGeometryInputs
  } = rawSettings;
  return JSON.stringify({ printVolumePresetId: presetId, ...kitGeometryInputs });
}

export function createPrintDesignKit(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableKit {
  if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    throw new Error("createPrintDesignKit: Static reference designs do not generate browser print kits");
  }
  if (isDonutFilterPrintDesignId(layout.configuration.printDesign.id)) {
    return createDonutFilterPrintableKit(layout, presetId);
  }
  if (isTempestPrintDesignId(layout.configuration.printDesign.id)) {
    return createTempestPrintableKitFromLayout(layout, presetId);
  }
  return createPrintableKit(layout, presetId);
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
  const displayColor = enclosureDisplayColor(layout);

  if (
    isDonutFilterPrintDesignId(layout.configuration.printDesign.id) ||
    isTempestPrintDesignId(layout.configuration.printDesign.id)
  ) {
    return createPrintableThreeMfExportFromKit(
      kit,
      `${layout.configuration.printDesign.label} print kit`,
      `${layout.configuration.printDesign.id}-print-kit.3mf`,
      displayColor,
    );
  }

  return createPrintableThreeMfExportFromKit(
    kit,
    "Nukit Open Air Purifier print kit",
    "nukit-open-air-purifier-print-kit.3mf",
    displayColor,
  );
}

// The selected preview enclosure color, as a 3MF displaycolor hex (#RRGGBBAA).
function enclosureDisplayColor(layout: LayoutResult): string {
  const color = findPreviewMaterialColorPreset(layout.configuration.preview.enclosure.materialColor).color;
  return `#${color.toString(16).padStart(6, "0")}ff`;
}
