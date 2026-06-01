import {
  normalizeRawSettings,
  normalizeSettings,
  normalizePurifierDraft,
  serializePurifierDraft,
  resolveCorsiRosenthalFanCountForConfiguration,
  type BuildFabricationSummary,
  type BuildSummary,
  type BuildFanSummary,
  type ConfiguredPrintDesign,
  type PurifierDraft,
  type RawPurifierSettings,
  type ResolvedFanBanks,
  type PurifierSettings,
} from "@/domain/purifier/airPurifier";
import { createTempestModel, type TempestFanLayout } from "@/domain/designs/tempest/model";
import { createAirPurifierGeometry } from "@/domain/purifier/geometry";
import type { CutPanel } from "@/fabrication/laser/cutGeometry";
import { createAirPurifierCutSheet, resolveFanCount } from "@/fabrication/laser/panels";
import { createTempestSettingsFromConfiguration } from "@/fabrication/printing/designs/tempest/settings";
import { renderBoxesDocumentSvg } from "@/ports/boxes/svg";

type CutSheetDocument = ReturnType<typeof createAirPurifierCutSheet>["document"];

type GeneratedPrintDesignType = Extract<
  ConfiguredPrintDesign["type"],
  "corsi-rosenthal" | "donut-filter-adapter" | "tempest"
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
  const summary: BuildSummary = {
    chamberHeight: geometry.chamberHeight,
    workingDepth: geometry.workingDepth,
    fans: createBuildFanSummary(configuration, resolvedFans),
    fabrication: createBuildFabricationSummary(fabrication),
  };

  return {
    settingsDraft,
    rawSettings: settings,
    configuration,
    fabrication,
    summary,
  };
}

export function createLaserSvg(layout: LayoutResult): string {
  return renderBoxesDocumentSvg(requireCutPanelFabricationPlan(layout, "createLaserSvg").cutSheet);
}

export function requireCutPanelFabricationPlan(layout: LayoutResult, caller: string): CutPanelFabricationPlan {
  if (layout.fabrication.type !== "cut-panel-source") {
    throw new Error(`${caller}: ${layout.configuration.printDesign.label} does not have cut-panel fabrication`);
  }
  return layout.fabrication;
}

function createLayoutFabricationPlan(configuration: PurifierSettings): LayoutFabricationPlan {
  if (configuration.design.type === "laser-derived-printable-kit") {
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

function createBuildFanSummary(configuration: PurifierSettings, resolvedWallFans: ResolvedFanBanks): BuildFanSummary {
  if (configuration.design.type === "corsi-rosenthal") {
    return {
      type: "corsi-rosenthal",
      mode: configuration.design.configuration.mode,
      filterCount: configuration.design.configuration.filterCount,
      fanCount: resolveCorsiRosenthalFanCountForConfiguration(configuration),
    };
  }

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
  };
}

function resolvedTempestFanCount(fanLayout: TempestFanLayout): number {
  if (fanLayout.type === "tower-top-grid") {
    return fanLayout.fanCount;
  }
  return (
    fanLayout.walls.front.actualCount +
    fanLayout.walls.back.actualCount +
    fanLayout.walls.left.actualCount +
    fanLayout.walls.right.actualCount
  );
}
