import {
  normalizeRawSettings,
  normalizeSettings,
  normalizePurifierDraft,
  serializePurifierDraft,
} from "@/domain/purifier/airPurifier";
import type {
  BuildFabricationSummary,
  BuildSummary,
  BuildFanSummary,
  ConfiguredPrintDesign,
  PurifierDraft,
  RawPurifierSettings,
  ResolvedFanBanks,
  PurifierSettings,
} from "@/domain/purifier/settingsModel";
import { createTempestModel, type TempestFanLayout } from "@/domain/designs/tempest/model";
import { estimateBuildCadr } from "@/domain/purifier/buildCadr";
import { matchTopology } from "@/domain/designs/tempest/topology";
import { createAirPurifierGeometry } from "@/domain/purifier/geometry";
import type { CutPanel } from "@/fabrication/laser/cutGeometry";
import { createAirPurifierCutSheet, resolveFanCount } from "@/fabrication/laser/panels";
import { createTempestSettingsFromConfiguration } from "@/fabrication/printing/designs/tempest/settings";
import { renderBoxesDocumentSvg } from "@/ports/boxes/svg";
import { renderBoxesDocumentDxf } from "@/ports/boxes/dxf";

type CutSheetDocument = ReturnType<typeof createAirPurifierCutSheet>["document"];

type GeneratedPrintDesignType = Extract<
  ConfiguredPrintDesign["type"],
  "donut-filter-adapter" | "tempest"
>;

export type CutPanelFabricationPlan = {
  readonly type: "cut-panel-source";
  readonly cutPanels: readonly CutPanel[];
  readonly cutSheet: CutSheetDocument;
};

export type GeneratedPrintFabricationPlan = {
  readonly type: "generated-print-design";
  readonly designType: GeneratedPrintDesignType;
};

export type StaticReferenceFabricationPlan = {
  readonly type: "static-print-reference";
  readonly reference: Extract<ConfiguredPrintDesign, { readonly type: "static-reference" }>["reference"];
};

export type LayoutFabricationPlan =
  | CutPanelFabricationPlan
  | GeneratedPrintFabricationPlan
  | StaticReferenceFabricationPlan;

export type LayoutResult = {
  readonly settingsDraft: PurifierDraft;
  readonly rawSettings: RawPurifierSettings;
  readonly configuration: PurifierSettings;
  readonly fabrication: LayoutFabricationPlan;
  readonly summary: BuildSummary;
};

export function createLayout(input: RawPurifierSettings | PurifierDraft): LayoutResult {
  const settingsDraft = normalizePurifierDraft(input);
  const settings = normalizeRawSettings(serializePurifierDraft(settingsDraft));
  const configuration = normalizeSettings(settingsDraft);
  const geometry = createAirPurifierGeometry(configuration);
  const fabrication = createLayoutFabricationPlan(configuration);
  const resolvedFans: ResolvedFanBanks = {
    top: resolveFanCount(configuration.fan.banks.top, geometry.filterDimensions.width, configuration.fan.spec.diameter),
    bottom: resolveFanCount(configuration.fan.banks.bottom, geometry.filterDimensions.width, configuration.fan.spec.diameter),
    left: resolveFanCount(configuration.fan.banks.left, geometry.workingDepth, configuration.fan.spec.diameter),
    right: resolveFanCount(configuration.fan.banks.right, geometry.workingDepth, configuration.fan.spec.diameter),
  };
  const fans = createBuildFanSummary(configuration, resolvedFans, backPlateFanCount(fabrication));
  const summary: BuildSummary = {
    chamberHeight: geometry.chamberHeight,
    workingDepth: geometry.workingDepth,
    fans,
    fabrication: createBuildFabricationSummary(fabrication),
    cadr: estimateBuildCadr({ configuration, rawSettings: settings, fanCount: totalFanCount(fans) }),
  };

  return {
    settingsDraft,
    rawSettings: settings,
    configuration,
    fabrication,
    summary,
  };
}

// Total fans driving the build's airflow (PC grid / wall banks). Box/exhaust is one
// box fan, handled inside estimateBuildCadr, so its tempest fanCount (0) is fine.
function totalFanCount(fans: BuildFanSummary): number {
  if (fans.type === "wall-banks") {
    const banks = fans.resolvedFans;
    return banks.left + banks.right + banks.top + banks.bottom + fans.backPlateFans;
  }
  return fans.fanCount;
}

export function createLaserSvg(layout: LayoutResult): string {
  return renderBoxesDocumentSvg(requireCutPanelFabricationPlan(layout, "createLaserSvg").cutSheet);
}

export function createLaserDxf(layout: LayoutResult): string {
  return renderBoxesDocumentDxf(requireCutPanelFabricationPlan(layout, "createLaserDxf").cutSheet);
}

export function requireCutPanelFabricationPlan(layout: LayoutResult, caller: string): CutPanelFabricationPlan {
  if (layout.fabrication.type !== "cut-panel-source") {
    throw new Error(`${caller}: ${layout.configuration.printDesign.label} does not have cut-panel fabrication`);
  }
  return layout.fabrication;
}

function createLayoutFabricationPlan(configuration: PurifierSettings): LayoutFabricationPlan {
  if (configuration.design.type === "laser-cut") {
    const cutSheetResult = createAirPurifierCutSheet(configuration);
    return {
      type: "cut-panel-source",
      cutPanels: cutSheetResult.panels,
      cutSheet: cutSheetResult.document,
    };
  }

  if (configuration.design.type === "static-reference") {
    return {
      type: "static-print-reference",
      reference: configuration.design.reference,
    };
  }

  return {
    type: "generated-print-design",
    designType: configuration.design.type,
  };
}

function createBuildFabricationSummary(fabrication: LayoutFabricationPlan): BuildFabricationSummary {
  if (fabrication.type === "cut-panel-source") {
    return {
      type: "cut-panel-source",
      panelCount: fabrication.cutPanels.length,
      sheetWidth: fabrication.cutSheet.width,
      sheetHeight: fabrication.cutSheet.height,
    };
  }

  if (fabrication.type === "static-print-reference") {
    return {
      type: "static-print-reference",
      sourceFileCount: fabrication.reference.previewAssets.length,
      localPlatePreviewCount: fabrication.reference.platePreviewAssets.length,
    };
  }

  return fabrication;
}

// Fans cut into the one-side closed back panel (the "Back" fan grid). They are
// not wall banks, so count them off the built panel to add to the fan totals.
function backPlateFanCount(fabrication: LayoutFabricationPlan): number {
  if (fabrication.type !== "cut-panel-source") {
    return 0;
  }
  const backPanel = fabrication.cutPanels.find((panel) => panel.id === "closed-back-panel");
  return backPanel === undefined
    ? 0
    : backPanel.cuts.filter((cut) => cut.type === "circle" && cut.role === "fan").length;
}

function createBuildFanSummary(
  configuration: PurifierSettings,
  resolvedWallFans: ResolvedFanBanks,
  backPlateFans: number,
): BuildFanSummary {
  if (configuration.design.type === "donut-filter-adapter") {
    return {
      type: "donut-filter-adapter",
      fanCount: configuration.design.fan.count,
    };
  }

  if (configuration.design.type === "tempest") {
    const tempestModel = createTempestModel(createTempestSettingsFromConfiguration(configuration));
    return {
      type: "tempest",
      arrangement: configuration.design.arrangement,
      fanCount: resolvedTempestFanCount(tempestModel.fanLayout),
    };
  }

  if (configuration.design.type === "static-reference") {
    return {
      type: "static-reference",
      fanCount: configuration.design.fanCount,
    };
  }

  return {
    type: "wall-banks",
    resolvedFans: resolvedWallFans,
    backPlateFans,
  };
}

function resolvedTempestFanCount(fanLayout: TempestFanLayout): number {
  return matchTopology(fanLayout, {
    quad: (fans) => fans.fanCount,
    sandwich: (fans) =>
      fans.walls.front.actualCount +
      fans.walls.back.actualCount +
      fans.walls.left.actualCount +
      fans.walls.right.actualCount +
      fans.bottomPlate.fanCount,
  });
}
