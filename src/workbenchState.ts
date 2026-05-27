import type { PreviewMode } from "./airPurifier";
import {
  findPrintVolumePreset,
  readExportFormat,
  type ExportFormat,
  type PrintVolumePresetId,
} from "./printableKit";

export type ControlsTab = "design" | "parts" | "setup";

export type WorkbenchFabrication =
  | {
      readonly method: "laser-svg";
    }
  | {
      readonly method: "print-3mf";
      readonly printVolumePresetId: PrintVolumePresetId;
    };

export type WorkbenchState = {
  readonly preview: "enclosure" | "fabrication";
  readonly controlsTab: ControlsTab;
  readonly fabrication: WorkbenchFabrication;
};

export function decodeWorkbenchState(params: URLSearchParams): WorkbenchState {
  const explicitMethodValue = params.get("fabricationMethod") ?? params.get("exportFormat");
  const previewMode = readPreviewMode(params.get("previewMode"));
  const method = explicitMethodValue === null ? fabricationMethodFromPreviewMode(previewMode) : readExportFormat(explicitMethodValue);
  return {
    preview: previewMode === "enclosure" ? "enclosure" : "fabrication",
    controlsTab: readControlsTab(params.get("controlsTab")),
    fabrication: createFabricationState(method, params.get("printVolume")),
  };
}

export function encodeWorkbenchState(state: WorkbenchState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("previewMode", previewModeForWorkbenchState(state));
  params.set("controlsTab", state.controlsTab);
  params.set("fabricationMethod", fabricationMethodForWorkbenchState(state));
  if (state.fabrication.method === "print-3mf") {
    params.set("printVolume", state.fabrication.printVolumePresetId);
  }
  return params;
}

export function previewModeForWorkbenchState(state: WorkbenchState): PreviewMode {
  if (state.preview === "enclosure") {
    return "enclosure";
  }
  return state.fabrication.method === "print-3mf" ? "print-sheets" : "cut-sheet";
}

export function fabricationMethodForWorkbenchState(state: WorkbenchState): ExportFormat {
  return state.fabrication.method;
}

export function printVolumePresetIdForWorkbenchState(state: WorkbenchState): PrintVolumePresetId {
  return state.fabrication.method === "print-3mf" ? state.fabrication.printVolumePresetId : findPrintVolumePreset(null).id;
}

export function withPreviewMode(state: WorkbenchState, previewMode: PreviewMode): WorkbenchState {
  if (previewMode === "enclosure") {
    return {
      ...state,
      preview: "enclosure",
    };
  }
  return {
    ...state,
    preview: "fabrication",
    fabrication: createFabricationState(fabricationMethodFromPreviewMode(previewMode), printVolumePresetIdForWorkbenchState(state)),
  };
}

export function withControlsTab(state: WorkbenchState, controlsTab: ControlsTab): WorkbenchState {
  return {
    ...state,
    controlsTab,
  };
}

export function withFabricationMethod(state: WorkbenchState, method: ExportFormat): WorkbenchState {
  return {
    ...state,
    fabrication: createFabricationState(method, printVolumePresetIdForWorkbenchState(state)),
  };
}

export function withPrintVolumePreset(state: WorkbenchState, presetId: PrintVolumePresetId): WorkbenchState {
  if (state.fabrication.method !== "print-3mf") {
    return {
      ...state,
      fabrication: {
        method: "print-3mf",
        printVolumePresetId: presetId,
      },
    };
  }
  return {
    ...state,
    fabrication: {
      ...state.fabrication,
      printVolumePresetId: presetId,
    },
  };
}

function createFabricationState(method: ExportFormat, printVolume: string | null): WorkbenchFabrication {
  if (method === "print-3mf") {
    return {
      method,
      printVolumePresetId: findPrintVolumePreset(printVolume).id,
    };
  }
  return { method };
}

function readPreviewMode(value: string | null): PreviewMode {
  if (value === "cut-sheet" || value === "print-sheets") {
    return value;
  }
  return "enclosure";
}

export function readControlsTab(value: string | null): ControlsTab {
  if (value === "design" || value === "parts" || value === "setup") {
    return value;
  }
  if (value === "fit" || value === "fabrication" || value === "cutting" || value === "export") {
    return "setup";
  }
  return "design";
}

function fabricationMethodFromPreviewMode(previewMode: PreviewMode): ExportFormat {
  if (previewMode === "cut-sheet") {
    return "laser-svg";
  }
  return "print-3mf";
}
