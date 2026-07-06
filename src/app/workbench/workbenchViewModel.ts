import {
  normalizePurifierDraft,
  normalizeRawSettings,
  printDesignIdForPurifierDraft,
  serializePurifierDraft,
} from "@/domain/purifier/airPurifier";
import {
  applyPrintDesignPreset,
  type PurifierDraft,
  type RawPurifierSettings,
} from "@/domain/purifier/settingsModel";
import {
  defaultThreeDimensionalPrintDesignId,
  findPrintDesignPreset,
  isLaserCutDesignPreset,
  isPublicThreeDimensionalPrintDesignId,
  isTempestPrintDesignPreset,
  type DonutFilterAdapterPrintDesignPreset,
  type LaserCutDesignPreset,
  type PrintDesignPreset,
  type StaticReferencePrintDesignPreset,
  type TempestPrintDesignPreset,
} from "@/domain/purifier/designPresets";
import { staticPrintReferenceHasPlatePreview, type StaticPrintReference } from "@/resources/static-print-references/references";
import {
  fabricationMethodForWorkbenchState,
  previewModeForWorkbenchState,
  printVolumePresetIdForWorkbenchState,
  withPreviewMode,
  type WorkbenchState,
} from "@/app/workbench/workbenchState";
import type { PreviewMode } from "@/app/workbench/previewMode";
import { isCutSheetExportFormat, type ExportFormat, type PrintVolumePresetId } from "@/fabrication/printing/printableKit";

// #######################################
// Workbench View Model
// #######################################

export type StaticReferencePlatePreview =
  | {
      readonly type: "available";
    }
  | {
      readonly type: "unavailable";
      readonly reason: "no-local-print-plate-preview";
    };

export type WorkbenchDesignContext =
  | {
      readonly type: "nukit";
      readonly preset: LaserCutDesignPreset;
      readonly layoutSectionTitle: "";
      readonly partsSectionTitle: "Filter";
    }
  | {
      readonly type: "donut-filter-adapter";
      readonly preset: DonutFilterAdapterPrintDesignPreset;
      readonly layoutSectionTitle: "Adaptor";
      readonly partsSectionTitle: "Filter and fan";
    }
  | {
      readonly type: "tempest";
      readonly preset: TempestPrintDesignPreset;
      readonly layoutSectionTitle: "";
      readonly partsSectionTitle: "Filter and fan";
    }
  | {
      readonly type: "static-reference";
      readonly preset: StaticReferencePrintDesignPreset;
      readonly reference: StaticPrintReference;
      readonly platePreview: StaticReferencePlatePreview;
      readonly layoutSectionTitle: "Source files";
      readonly partsSectionTitle: "Source and license";
    };

export type WorkbenchFabricationPreview =
  | {
      readonly type: "cut-sheet";
    }
  | {
      readonly type: "print-sheets";
      readonly source: "generated";
    }
  | {
      readonly type: "print-sheets";
      readonly source: "static-reference";
      readonly reference: StaticPrintReference;
    }
  | {
      readonly type: "unavailable";
      readonly reason: "static-reference-without-plate-preview";
      readonly reference: StaticPrintReference;
    };

export type WorkbenchControlPanelAvailability =
  | {
      readonly type: "available";
    }
  | {
      readonly type: "hidden";
      readonly reason: "not-supported-by-design" | "static-reference-without-plate-preview";
    };

export type WorkbenchControlPanels = {
  readonly setup: WorkbenchControlPanelAvailability;
  readonly advanced: WorkbenchControlPanelAvailability;
};

export type WorkbenchViewModel = {
  readonly previewMode: PreviewMode;
  readonly fabricationMethod: ExportFormat;
  readonly printVolumePresetId: PrintVolumePresetId;
  readonly printDesignPreset: PrintDesignPreset;
  readonly design: WorkbenchDesignContext;
  readonly fabricationPreview: WorkbenchFabricationPreview;
  readonly controlPanels: WorkbenchControlPanels;
  readonly exportActionLabel: string;
};

export type WorkbenchSession = {
  readonly settings: PurifierDraft;
  readonly workbenchState: WorkbenchState;
};

export function normalizeWorkbenchSession(
  settings: RawPurifierSettings | PurifierDraft,
  workbenchState: WorkbenchState,
): WorkbenchSession {
  let normalizedSettings = normalizePurifierDraft(settings);
  let normalizedState = normalizeWorkbenchStateForSettings(workbenchState, normalizedSettings);

  if (isCutSheetExportFormat(fabricationMethodForWorkbenchState(normalizedState)) && printDesignIdForPurifierDraft(normalizedSettings) !== "nukit-open-air") {
    normalizedSettings = normalizePurifierDraft(applyPrintDesignPreset(serializePurifierDraft(normalizedSettings), "nukit-open-air"));
    normalizedState = normalizeWorkbenchStateForSettings(normalizedState, normalizedSettings);
  } else if (
    fabricationMethodForWorkbenchState(normalizedState) === "print-3mf" &&
    !isPublicThreeDimensionalPrintDesignId(printDesignIdForPurifierDraft(normalizedSettings))
  ) {
    normalizedSettings = normalizePurifierDraft(
      applyPrintDesignPreset(serializePurifierDraft(normalizedSettings), defaultThreeDimensionalPrintDesignId),
    );
    normalizedState = normalizeWorkbenchStateForSettings(normalizedState, normalizedSettings);
  }

  return {
    settings: normalizedSettings,
    workbenchState: normalizedState,
  };
}

export function createWorkbenchViewModel(
  settings: RawPurifierSettings | PurifierDraft,
  state: WorkbenchState,
): WorkbenchViewModel {
  const rawSettings = isRawPurifierSettings(settings) ? normalizeRawSettings(settings) : serializePurifierDraft(settings);
  const previewMode = previewModeForWorkbenchState(state);
  const fabricationMethod = fabricationMethodForWorkbenchState(state);
  const printVolumePresetId = printVolumePresetIdForWorkbenchState(state);
  const printDesignPreset = findPrintDesignPreset(rawSettings.printDesign);
  const design = createWorkbenchDesignContext(printDesignPreset, fabricationMethod);
  const fabricationPreview = createWorkbenchFabricationPreview(fabricationMethod, design);
  const controlPanels = createWorkbenchControlPanels(design);

  return {
    previewMode,
    fabricationMethod,
    printVolumePresetId,
    printDesignPreset: design.preset,
    design,
    fabricationPreview,
    controlPanels,
    exportActionLabel: exportActionLabelForDesign(fabricationMethod, design),
  };
}

export function normalizeWorkbenchStateForSettings(
  nextState: WorkbenchState,
  nextSettings: RawPurifierSettings | PurifierDraft,
): WorkbenchState {
  const viewModel = createWorkbenchViewModel(nextSettings, nextState);

  if (
    (viewModel.previewMode === "print-sheets" && viewModel.fabricationPreview.type !== "print-sheets") ||
    (viewModel.previewMode === "cut-sheet" && viewModel.fabricationPreview.type !== "cut-sheet")
  ) {
    return withPreviewMode(nextState, "enclosure");
  }

  return nextState;
}

// #######################################
// Labels
// #######################################

function createWorkbenchDesignContext(
  preset: PrintDesignPreset,
  fabricationMethod: ExportFormat,
): WorkbenchDesignContext {
  if (fabricationMethod !== "print-3mf") {
    return {
      type: "nukit",
      preset: isLaserCutDesignPreset(preset) ? preset : findLaserCutDesignPreset(),
      layoutSectionTitle: "",
      partsSectionTitle: "Filter",
    };
  }

  // Each arm rebuilds the preset with the narrowed implementation because
  // TypeScript does not narrow the parent union through a nested discriminant.
  switch (preset.implementation.type) {
    case "donut-filter-adapter":
      return {
        type: "donut-filter-adapter",
        preset: { ...preset, implementation: preset.implementation },
        layoutSectionTitle: "Adaptor",
        partsSectionTitle: "Filter and fan",
      };
    case "tempest":
      return {
        type: "tempest",
        preset: { ...preset, implementation: preset.implementation },
        layoutSectionTitle: "",
        partsSectionTitle: "Filter and fan",
      };
    case "static-reference": {
      const reference = preset.implementation.reference;
      return {
        type: "static-reference",
        preset: { ...preset, implementation: preset.implementation },
        reference,
        platePreview: staticPrintReferenceHasPlatePreview(reference)
          ? { type: "available" }
          : { type: "unavailable", reason: "no-local-print-plate-preview" },
        layoutSectionTitle: "Source files",
        partsSectionTitle: "Source and license",
      };
    }
    case "laser-cut":
      // A laser-only preset under the print method: session normalization
      // lands such sessions on the default 3D design, so the design context
      // resolves the same way.
      return {
        type: "tempest",
        preset: findDefaultThreeDimensionalPrintDesignPreset(),
        layoutSectionTitle: "",
        partsSectionTitle: "Filter and fan",
      };
  }
}

function isRawPurifierSettings(settings: RawPurifierSettings | PurifierDraft): settings is RawPurifierSettings {
  return "printDesign" in settings;
}

function createWorkbenchFabricationPreview(
  fabricationMethod: ExportFormat,
  design: WorkbenchDesignContext,
): WorkbenchFabricationPreview {
  if (isCutSheetExportFormat(fabricationMethod)) {
    return { type: "cut-sheet" };
  }
  if (design.type !== "static-reference") {
    return {
      type: "print-sheets",
      source: "generated",
    };
  }
  if (design.platePreview.type === "available") {
    return {
      type: "print-sheets",
      source: "static-reference",
      reference: design.reference,
    };
  }
  return {
    type: "unavailable",
    reason: "static-reference-without-plate-preview",
    reference: design.reference,
  };
}

function createWorkbenchControlPanels(design: WorkbenchDesignContext): WorkbenchControlPanels {
  if (design.type === "nukit") {
    return {
      setup: { type: "available" },
      advanced: { type: "available" },
    };
  }
  if (design.type === "static-reference" && design.platePreview.type === "unavailable") {
    return {
      setup: { type: "hidden", reason: "static-reference-without-plate-preview" },
      advanced: { type: "hidden", reason: "not-supported-by-design" },
    };
  }
  return {
    setup: { type: "available" },
    advanced: { type: "hidden", reason: "not-supported-by-design" },
  };
}

function exportActionLabelForDesign(
  fabricationMethod: ExportFormat,
  design: WorkbenchDesignContext,
): string {
  if (fabricationMethod === "print-3mf" && design.type === "static-reference") {
    return "Open Printables Files";
  }
  if (fabricationMethod === "print-3mf") {
    return "Download print kit";
  }
  return fabricationMethod === "hand-svg" ? "Export Plans" : "Export Laser Drawing";
}

function findLaserCutDesignPreset(): LaserCutDesignPreset {
  const preset = findPrintDesignPreset("nukit-open-air");
  if (!isLaserCutDesignPreset(preset)) {
    throw new Error("findLaserCutDesignPreset: Nukit Open Air is not a laser-cut design");
  }
  return preset;
}

function findDefaultThreeDimensionalPrintDesignPreset(): TempestPrintDesignPreset {
  const preset = findPrintDesignPreset(defaultThreeDimensionalPrintDesignId);
  if (!isTempestPrintDesignPreset(preset)) {
    throw new Error("findDefaultThreeDimensionalPrintDesignPreset: the default 3D design is not a tempest design");
  }
  return preset;
}
