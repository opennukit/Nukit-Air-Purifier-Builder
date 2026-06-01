import { createCorsiRosenthalPrintableKit } from "@/fabrication/printing/designs/corsi-rosenthal/printableKit";
import { createDonutFilterPrintableKit } from "@/fabrication/printing/designs/donut-filter/printableKit";
import { createTempestPrintableKitFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";
import {
  isCorsiRosenthalPrintDesignId,
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
} from "@/domain/purifier/airPurifier";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  createPrintableKit,
  createPrintableThreeMfExportFromKit,
  type PrintableKit,
  type PrintableThreeMfExport,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";

export function createPrintDesignKit(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableKit {
  if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    throw new Error("createPrintDesignKit: Static reference designs do not generate browser print kits");
  }
  if (isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
    return createCorsiRosenthalPrintableKit(layout, presetId);
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
  if (
    isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id) ||
    isDonutFilterPrintDesignId(layout.configuration.printDesign.id) ||
    isTempestPrintDesignId(layout.configuration.printDesign.id)
  ) {
    return createPrintableThreeMfExportFromKit(
      kit,
      `${layout.configuration.printDesign.label} print kit`,
      `${layout.configuration.printDesign.id}-print-kit.3mf`,
    );
  }

  return createPrintableThreeMfExportFromKit(
    kit,
    "Nukit Open Air Purifier print kit",
    "nukit-open-air-purifier-print-kit.3mf",
  );
}
