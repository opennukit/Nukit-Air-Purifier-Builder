import { createCorsiRosenthalPrintableKit } from "./corsiRosenthalKit";
import { createDonutFilterPrintableKit } from "./donutFilterKit";
import { isCorsiRosenthalPrintDesignId, isDonutFilterPrintDesignId, type LayoutResult } from "./airPurifier";
import {
  createPrintableKit,
  createPrintableThreeMfExportFromKit,
  type PrintableKit,
  type PrintableThreeMfExport,
  type PrintVolumePresetId,
} from "./printableKit";

export function createPrintDesignKit(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableKit {
  if (isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
    return createCorsiRosenthalPrintableKit(layout, presetId);
  }
  if (isDonutFilterPrintDesignId(layout.configuration.printDesign.id)) {
    return createDonutFilterPrintableKit(layout, presetId);
  }
  return createPrintableKit(layout, presetId);
}

export function createPrintDesignThreeMfExport(
  layout: LayoutResult,
  presetId: PrintVolumePresetId,
): PrintableThreeMfExport {
  const kit = createPrintDesignKit(layout, presetId);
  if (isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id) || isDonutFilterPrintDesignId(layout.configuration.printDesign.id)) {
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
