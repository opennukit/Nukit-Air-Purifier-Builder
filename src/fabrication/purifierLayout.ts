import {
  normalizeRawSettings,
  normalizeSettings,
  type BuildSummary,
  type RawPurifierSettings,
  type ResolvedFanBanks,
  type PurifierSettings,
} from "@/domain/purifier/airPurifier";
import { createAirPurifierGeometry } from "@/domain/purifier/geometry";
import type { CutPanel } from "@/fabrication/laser/cutGeometry";
import { createAirPurifierCutSheet, resolveFanCount } from "@/fabrication/laser/panels";
import { renderBoxesDocumentSvg } from "@/ports/boxes/svg";

export type LayoutResult = {
  rawSettings: RawPurifierSettings;
  configuration: PurifierSettings;
  cutPanels: CutPanel[];
  cutSheet: ReturnType<typeof createAirPurifierCutSheet>["document"];
  summary: BuildSummary;
};

export function createLayout(input: RawPurifierSettings): LayoutResult {
  const settings = normalizeRawSettings(input);
  const configuration = normalizeSettings(settings);
  const geometry = createAirPurifierGeometry(configuration);
  const cutSheetResult = createAirPurifierCutSheet(configuration);
  const cutSheet = cutSheetResult.document;
  const resolvedFans: ResolvedFanBanks = {
    top: resolveFanCount(configuration.fan.banks.top, geometry.filterDimensions.width, configuration.fan.spec.diameter),
    bottom: resolveFanCount(configuration.fan.banks.bottom, geometry.filterDimensions.width, configuration.fan.spec.diameter),
    left: resolveFanCount(configuration.fan.banks.left, geometry.workingDepth, configuration.fan.spec.diameter),
    right: resolveFanCount(configuration.fan.banks.right, geometry.workingDepth, configuration.fan.spec.diameter),
  };
  const summary: BuildSummary = {
    chamberHeight: geometry.chamberHeight,
    workingDepth: geometry.workingDepth,
    resolvedFans,
    panelCount: cutSheetResult.panels.length,
    sheetWidth: cutSheet.width,
    sheetHeight: cutSheet.height,
  };

  return {
    rawSettings: settings,
    configuration,
    cutPanels: cutSheetResult.panels,
    cutSheet,
    summary,
  };
}

export function createLaserSvg(layout: LayoutResult): string {
  return renderBoxesDocumentSvg(layout.cutSheet);
}
