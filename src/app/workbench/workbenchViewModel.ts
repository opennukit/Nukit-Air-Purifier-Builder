import {
  applyPrintDesignPreset,
  findPrintDesignPreset,
  isCorsiRosenthalPrintDesignId,
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  normalizeRawSettings,
  staticReferenceCanPreviewPrintPlates,
  staticPrintReferenceForPreset,
  type PrintDesignPreset,
  type RawPurifierSettings,
} from "@/domain/purifier/airPurifier";
import type { StaticPrintReference } from "@/resources/static-print-references/references";
import {
  fabricationMethodForWorkbenchState,
  previewModeForWorkbenchState,
  printVolumePresetIdForWorkbenchState,
  withControlsTab,
  withPreviewMode,
  type ControlsTab,
  type WorkbenchState,
} from "@/app/workbench/workbenchState";
import type { PreviewMode } from "@/app/workbench/previewMode";
import type { ExportFormat, PrintVolumePresetId } from "@/fabrication/printing/printableKit";

// #######################################
// Workbench View Model
// #######################################

export type WorkbenchDesignKind = "nukit" | "corsi-rosenthal" | "donut-filter-adapter" | "static-reference";

export type WorkbenchViewModel = {
  readonly previewMode: PreviewMode;
  readonly controlsTab: ControlsTab;
  readonly fabricationMethod: ExportFormat;
  readonly printVolumePresetId: PrintVolumePresetId;
  readonly printDesignPreset: PrintDesignPreset;
  readonly staticPrintReference: StaticPrintReference | undefined;
  readonly designKind: WorkbenchDesignKind;
  readonly isStaticReferenceControlsActive: boolean;
  readonly canPreviewStaticPrintPlate: boolean;
  readonly showCutSheetPreviewMode: boolean;
  readonly showPrintSheetsPreviewMode: boolean;
  readonly isCorsiControlsActive: boolean;
  readonly isDonutControlsActive: boolean;
  readonly isNukitControlsActive: boolean;
  readonly showSetupControlTab: boolean;
  readonly showAdvancedControlTab: boolean;
  readonly layoutSectionTitle: string;
  readonly partsSectionTitle: string;
  readonly setupTabLabel: string;
  readonly exportActionLabel: string;
};

export type WorkbenchSession = {
  readonly settings: RawPurifierSettings;
  readonly workbenchState: WorkbenchState;
};

export function normalizeWorkbenchSession(
  settings: RawPurifierSettings,
  workbenchState: WorkbenchState,
): WorkbenchSession {
  let normalizedSettings = settings;
  let normalizedState = normalizeWorkbenchStateForSettings(workbenchState, normalizedSettings);

  if (fabricationMethodForWorkbenchState(normalizedState) === "laser-svg" && normalizedSettings.printDesign !== "nukit-open-air") {
    normalizedSettings = normalizeRawSettings(applyPrintDesignPreset(normalizedSettings, "nukit-open-air"));
    normalizedState = normalizeWorkbenchStateForSettings(normalizedState, normalizedSettings);
  }

  return {
    settings: normalizedSettings,
    workbenchState: normalizedState,
  };
}

export function createWorkbenchViewModel(
  settings: RawPurifierSettings,
  state: WorkbenchState,
): WorkbenchViewModel {
  const previewMode = previewModeForWorkbenchState(state);
  const controlsTab = state.controlsTab;
  const fabricationMethod = fabricationMethodForWorkbenchState(state);
  const printVolumePresetId = printVolumePresetIdForWorkbenchState(state);
  const printDesignPreset = findPrintDesignPreset(settings.printDesign);
  const staticPrintReference = staticPrintReferenceForPreset(printDesignPreset);
  const isStaticReferenceControlsActive =
    fabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(settings.printDesign);
  const canPreviewStaticPrintPlate =
    isStaticReferenceControlsActive && staticReferenceCanPreviewPrintPlates(printDesignPreset);
  const showPrintSheetsPreviewMode =
    fabricationMethod === "print-3mf" && (!isStaticReferenceControlsActive || canPreviewStaticPrintPlate);
  const isCorsiControlsActive =
    fabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(settings.printDesign);
  const isDonutControlsActive =
    fabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(settings.printDesign);
  const isNukitControlsActive = !isCorsiControlsActive && !isDonutControlsActive && !isStaticReferenceControlsActive;

  return {
    previewMode,
    controlsTab,
    fabricationMethod,
    printVolumePresetId,
    printDesignPreset,
    staticPrintReference,
    designKind: designKindForSettings(settings, fabricationMethod),
    isStaticReferenceControlsActive,
    canPreviewStaticPrintPlate,
    showCutSheetPreviewMode: fabricationMethod === "laser-svg",
    showPrintSheetsPreviewMode,
    isCorsiControlsActive,
    isDonutControlsActive,
    isNukitControlsActive,
    showSetupControlTab: !isStaticReferenceControlsActive || canPreviewStaticPrintPlate,
    showAdvancedControlTab: !isStaticReferenceControlsActive,
    layoutSectionTitle: layoutSectionTitleForDesign(isCorsiControlsActive, isDonutControlsActive, isStaticReferenceControlsActive),
    partsSectionTitle: isStaticReferenceControlsActive ? "Source and license" : "Filter and fan",
    setupTabLabel: fabricationMethod === "print-3mf" ? "Print setup" : "Laser setup",
    exportActionLabel: exportActionLabelForDesign(fabricationMethod, isStaticReferenceControlsActive),
  };
}

export function normalizeWorkbenchStateForSettings(
  nextState: WorkbenchState,
  nextSettings: RawPurifierSettings,
): WorkbenchState {
  const viewModel = createWorkbenchViewModel(nextSettings, nextState);
  let normalizedState = nextState;

  if (
    (viewModel.previewMode === "print-sheets" && !viewModel.showPrintSheetsPreviewMode) ||
    (viewModel.previewMode === "cut-sheet" && viewModel.fabricationMethod !== "laser-svg")
  ) {
    normalizedState = withPreviewMode(nextState, "enclosure");
  }

  const normalizedViewModel = createWorkbenchViewModel(nextSettings, normalizedState);
  if (
    normalizedViewModel.isStaticReferenceControlsActive &&
    (normalizedViewModel.controlsTab === "advanced" ||
      (normalizedViewModel.controlsTab === "setup" && !normalizedViewModel.canPreviewStaticPrintPlate))
  ) {
    return withControlsTab(normalizedState, "design");
  }

  return normalizedState;
}

// #######################################
// Labels
// #######################################

function designKindForSettings(settings: RawPurifierSettings, fabricationMethod: ExportFormat): WorkbenchDesignKind {
  if (fabricationMethod !== "print-3mf") {
    return "nukit";
  }
  if (isCorsiRosenthalPrintDesignId(settings.printDesign)) {
    return "corsi-rosenthal";
  }
  if (isDonutFilterPrintDesignId(settings.printDesign)) {
    return "donut-filter-adapter";
  }
  if (isStaticReferencePrintDesignId(settings.printDesign)) {
    return "static-reference";
  }
  return "nukit";
}

function layoutSectionTitleForDesign(
  isCorsi: boolean,
  isDonut: boolean,
  isStaticReference: boolean,
): string {
  if (isCorsi) {
    return "Corsi layout";
  }
  if (isDonut) {
    return "Adaptor";
  }
  if (isStaticReference) {
    return "Source files";
  }
  return "Fan placement";
}

function exportActionLabelForDesign(
  fabricationMethod: ExportFormat,
  isStaticReferenceControlsActive: boolean,
): string {
  if (fabricationMethod === "print-3mf" && isStaticReferenceControlsActive) {
    return "Open Printables Files";
  }
  return fabricationMethod === "print-3mf" ? "Download 3MF" : "Export Laser Drawing";
}
