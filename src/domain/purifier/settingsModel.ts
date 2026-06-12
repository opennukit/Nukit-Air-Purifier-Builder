// Purifier settings model: the raw, structured, and draft settings types,
// camera and preview-material vocabulary, the default settings, and the
// preset-application functions that rewrite raw settings when the user picks
// a tempest arrangement or print design preset.


import {
  defaultFanDiameterForPrintDesign,
  defaultFilterDimensionsByTempestArrangement,
  defaultPrintDesignId,
  findPrintDesignPreset,
  isDonutFilterAdapterPrintDesignPreset,
  isLaserCutDesignPreset,
  isStaticReferencePrintDesignPreset,
  isTempestPrintDesignPreset,
  tempestArrangementPresets,
  type DonutCap,
  type DonutFilterAdapterPrintDesignPreset,
  type DonutFilterSettings,
  type FilterCount,
  type LaserCutDesignPreset,
  type PrintDesignId,
  type PrintDesignPreset,
  type StaticReferencePrintDesignPreset,
  type TempestArrangementPreset,
  type TempestPrintDesignPreset,
} from "@/domain/purifier/designPresets";
import {
  automaticFanCount,
  defaultFanColor,
  fixedFanCountOptions,
  type FanBanks,
  type FanColor,
  type FanConfiguration,
  type FanCountRequest,
  type FanDiameter,
  type FixedFanCount,
  type SingleFanConfiguration,
} from "@/domain/purifier/fans";
import {
  defaultRectangularFilterDimensions,
  type FilterDimensions,
} from "@/domain/purifier/filter";
import {
  defaultCutJointSettings,
  type CutJointSettings,
  type ReferenceScale,
} from "@/fabrication/laser/cutSettings";
import type { Millimeters } from "@/domain/units";
import { defaultTempestCordPassThrough } from "@/domain/designs/tempest/shared";
import type {
  StaticPrintReferenceCapabilities,
  StaticPrintReference,
} from "@/resources/static-print-references/references";

// #######################################
// Product Vocabulary
// #######################################

// ##############################
// Preview and Fan Count Types
// ##############################

export const cameraPresets = ["official", "front", "side", "top"] as const;

export type CameraPreset = (typeof cameraPresets)[number];

// #######################################
// Build Configuration
// #######################################

// ##############################
// Fan Summary
// ##############################

export type ResolvedFanBanks = FanBanks<number>;

export type BuildFanSummary =
  | {
      readonly type: "wall-banks";
      readonly resolvedFans: ResolvedFanBanks;
    }
  | {
      readonly type: "donut-filter-adapter";
      readonly fanCount: FixedFanCount;
    }
  | {
      readonly type: "tempest";
      readonly arrangement: TempestArrangementPreset;
      readonly fanCount: number;
    }
  | {
      readonly type: "static-reference";
      readonly fanCount: number;
    };

// ##############################
// Cutting and Preview
// ##############################

export type FilterFrameConstruction =
  | {
      type: "split-rails";
    }
  | {
      type: "full-panels";
    };

export type CuttingSettings = {
  materialThickness: Millimeters;
  rim: Millimeters;
  screwHoleDiameter: Millimeters;
  kerfFit: Millimeters;
  labels: boolean;
  referenceScale: ReferenceScale;
  joints: JointSettings;
};

export type JointSettings = CutJointSettings;

export type PreviewSettings = {
  readonly enclosure: EnclosurePreviewOptions;
  readonly cutSheet: CutSheetPreviewOptions;
};

export type EnclosurePreviewOptions = {
  readonly showFilterMedia: boolean;
  readonly showFans: boolean;
  readonly showFilterFrame: boolean;
  readonly explodedView: boolean;
  readonly showDimensions: boolean;
  readonly showBananaScale: boolean;
  readonly showPreviewEdges: boolean;
  readonly materialColor: PreviewMaterialColorId;
  readonly autoRotate: boolean;
  readonly cameraPreset: CameraPreset;
};

export const previewMaterialColorPresets = [
  { id: "matte-black", label: "Black", color: 0x111817 },
  { id: "matte-gray", label: "Gray", color: 0x82858a },
  { id: "warm-white", label: "White", color: 0xf3f0e6 },
  { id: "natural-tan", label: "Tan", color: 0xc7965a },
  { id: "forest-green", label: "Green", color: 0x1f6f56 },
] as const;

export type PreviewMaterialColorPreset =
  (typeof previewMaterialColorPresets)[number];
export type PreviewMaterialColorId = PreviewMaterialColorPreset["id"];

const defaultPreviewMaterialColorId: PreviewMaterialColorId = "matte-black";

export type CutSheetPreviewOptions = {
  readonly showLabels: boolean;
  readonly referenceScale: ReferenceScale;
};

// #######################################
// Settings Model
// #######################################

export type RawPurifierSettings = {
  printDesign: PrintDesignId;
  filterWidth: Millimeters;
  filterDepth: Millimeters;
  filterThickness: Millimeters;
  rim: Millimeters;
  fanColor: FanColor;
  fanDiameter: FanDiameter;
  filters: FilterCount;
  splitFrames: boolean;
  fansLeft: number;
  fansRight: number;
  fansTop: number;
  fansBottom: number;
  tempestArrangement: TempestArrangementPreset;
  // Tempest-only: clearance added per side around the MEASURED filter so it
  // slides into its cavity; separate from the measurement on purpose.
  filterFitClearance: Millimeters;
  // Tempest-only: bore diameter of the power-cord hole in the right wall.
  cordHoleDiameter: Millimeters;
  donutFilterOuterDiameter: Millimeters;
  donutFilterLength: Millimeters;
  donutFilterHoleDiameter: Millimeters;
  donutAdapterInsertLength: Millimeters;
  donutCapRim: Millimeters;
  donutCapEnabled: boolean;
  screwHoleDiameter: Millimeters;
  materialThickness: Millimeters;
  kerfFit: Millimeters;
  fingerWidthMultiplier: number;
  fingerSpaceMultiplier: number;
  fingerPlayMultiplier: number;
  fingerHoleWidthMultiplier: number;
  fingerHoleOffsetMultiplier: number;
  dovetailSizeMultiplier: number;
  dovetailDepthMultiplier: number;
  dovetailTaper: number;
  showFilterMedia: boolean;
  showFans: boolean;
  showFilterFrame: boolean;
  explodedView: boolean;
  showDimensions: boolean;
  showBananaScale: boolean;
  showPreviewEdges: boolean;
  previewMaterialColor: PreviewMaterialColorId;
  autoRotate: boolean;
  cameraPreset: CameraPreset;
  labels: boolean;
  referenceScale: Millimeters;
};

export type PurifierFanDraft = {
  readonly diameter: FanDiameter;
  readonly color: FanColor;
};

export type PurifierCuttingDraft = {
  readonly materialThickness: Millimeters;
  readonly rim: Millimeters;
  readonly screwHoleDiameter: Millimeters;
  readonly kerfFit: Millimeters;
  readonly joints: JointSettings;
};

export type LaserCutDesignDraft = {
  readonly type: "laser-cut";
  readonly printDesign: LaserCutDesignPreset["id"];
  readonly preset: LaserCutDesignPreset;
  readonly filter: FilterDimensions;
  readonly filterCount: FilterCount;
  readonly fanBanks: FanBanks<FanCountRequest>;
  readonly frameConstruction: FilterFrameConstruction;
};

export type DonutFilterAdapterPrintDesignDraft = {
  readonly type: "donut-filter-adapter";
  readonly printDesign: DonutFilterAdapterPrintDesignPreset["id"];
  readonly preset: DonutFilterAdapterPrintDesignPreset;
  readonly filter: DonutFilterSettings;
  readonly fanCount: FixedFanCount;
};

export type TempestPrintDesignDraft = {
  readonly type: "tempest";
  readonly printDesign: TempestPrintDesignPreset["id"];
  readonly preset: TempestPrintDesignPreset;
  readonly arrangement: TempestArrangementPreset;
  readonly filter: FilterDimensions;
  readonly filterFitClearance: Millimeters;
  readonly cordHoleDiameter: Millimeters;
};

export type StaticReferencePrintDesignDraft = {
  readonly type: "static-reference";
  readonly printDesign: StaticReferencePrintDesignPreset["id"];
  readonly preset: StaticReferencePrintDesignPreset;
  readonly reference: StaticPrintReference;
  readonly capabilities: StaticPrintReferenceCapabilities;
  readonly filter: FilterDimensions;
  readonly filterCount: FilterCount;
  readonly fanCount: number;
};

export type PurifierDesignDraft =
  | LaserCutDesignDraft
  | DonutFilterAdapterPrintDesignDraft
  | TempestPrintDesignDraft
  | StaticReferencePrintDesignDraft;

export type PurifierDraft = {
  readonly design: PurifierDesignDraft;
  readonly fan: PurifierFanDraft;
  readonly cutting: PurifierCuttingDraft;
  readonly preview: PreviewSettings;
};

export type ConfiguredPrintDesign =
  | {
      readonly type: "laser-cut";
      readonly preset: LaserCutDesignPreset;
      readonly filter: FilterDimensions;
      readonly filterCount: FilterCount;
      readonly fanBanks: FanBanks<FanCountRequest>;
      readonly frameConstruction: FilterFrameConstruction;
    }
  | {
      readonly type: "donut-filter-adapter";
      readonly preset: DonutFilterAdapterPrintDesignPreset;
      readonly filter: DonutFilterSettings;
      readonly fan: SingleFanConfiguration;
    }
  | {
      readonly type: "tempest";
      readonly preset: TempestPrintDesignPreset;
      readonly arrangement: TempestArrangementPreset;
      readonly filter: FilterDimensions;
      readonly filterFitClearance: Millimeters;
      readonly cordHoleDiameter: Millimeters;
    }
  | {
      readonly type: "static-reference";
      readonly preset: StaticReferencePrintDesignPreset;
      readonly reference: StaticPrintReference;
      readonly capabilities: StaticPrintReferenceCapabilities;
      readonly filter: FilterDimensions;
      readonly filterCount: FilterCount;
      readonly fanCount: number;
    };

export type PurifierSettings = {
  printDesign: PrintDesignPreset;
  design: ConfiguredPrintDesign;
  filter: FilterDimensions;
  filterCount: FilterCount;
  fan: FanConfiguration;
  frameConstruction: FilterFrameConstruction;
  cutting: CuttingSettings;
  preview: PreviewSettings;
};

export type BuildFabricationSummary =
  | {
      readonly type: "cut-panel-source";
      readonly panelCount: number;
      readonly sheetWidth: number;
      readonly sheetHeight: number;
    }
  | {
      readonly type: "generated-print-design";
      readonly designType: "donut-filter-adapter" | "tempest";
    }
  | {
      readonly type: "static-print-reference";
      readonly sourceFileCount: number;
      readonly localPlatePreviewCount: number;
    };

export type BuildSummary = {
  chamberHeight: number;
  workingDepth: number;
  fans: BuildFanSummary;
  fabrication: BuildFabricationSummary;
};

export type PurifierInput =
  | RawPurifierSettings
  | PurifierSettings
  | PurifierDraft;

// #######################################
// Defaults
// #######################################

export const defaultSettings: RawPurifierSettings = {
  printDesign: defaultPrintDesignId,
  filterWidth: defaultRectangularFilterDimensions.width,
  filterDepth: defaultRectangularFilterDimensions.depth,
  filterThickness: defaultRectangularFilterDimensions.thickness,
  rim: 30,
  fanColor: defaultFanColor,
  fanDiameter: 140,
  filters: 2,
  splitFrames: true,
  fansLeft: automaticFanCount,
  fansRight: automaticFanCount,
  fansTop: 0,
  fansBottom: 0,
  tempestArrangement: "dual-horizontal-sandwich",
  filterFitClearance: 1,
  cordHoleDiameter: defaultTempestCordPassThrough.diameter,
  donutFilterOuterDiameter: 125,
  donutFilterLength: 150,
  donutFilterHoleDiameter: 92,
  donutAdapterInsertLength: 10,
  donutCapRim: 10,
  donutCapEnabled: true,
  screwHoleDiameter: 5,
  materialThickness: 6,
  kerfFit: 0.1,
  fingerWidthMultiplier: defaultCutJointSettings.finger.widthMultiplier,
  fingerSpaceMultiplier: defaultCutJointSettings.finger.spaceMultiplier,
  fingerPlayMultiplier: defaultCutJointSettings.finger.playMultiplier,
  fingerHoleWidthMultiplier: defaultCutJointSettings.finger.holeWidthMultiplier,
  fingerHoleOffsetMultiplier:
    defaultCutJointSettings.finger.holeOffsetMultiplier,
  dovetailSizeMultiplier: defaultCutJointSettings.dovetail.sizeMultiplier,
  dovetailDepthMultiplier: defaultCutJointSettings.dovetail.depthMultiplier,
  dovetailTaper: defaultCutJointSettings.dovetail.taper,
  showFilterMedia: true,
  showFans: true,
  showFilterFrame: true,
  explodedView: false,
  showDimensions: false,
  showBananaScale: false,
  showPreviewEdges: false,
  previewMaterialColor: defaultPreviewMaterialColorId,
  autoRotate: true,
  cameraPreset: "official",
  labels: true,
  referenceScale: 100,
};


// #######################################
// Catalog Lookup Helpers
// #######################################

export function findPreviewMaterialColorPreset(
  id: PreviewMaterialColorId | string | null | undefined,
): PreviewMaterialColorPreset {
  return (
    previewMaterialColorPresets.find((preset) => preset.id === id) ??
    requiredPreviewMaterialColorPreset(defaultPreviewMaterialColorId)
  );
}

// #######################################
// Preset Application
// #######################################

function applyFilterDimensions(
  settings: RawPurifierSettings,
  filter: FilterDimensions,
): RawPurifierSettings {
  return {
    ...settings,
    filterWidth: filter.width,
    filterDepth: filter.depth,
    filterThickness: filter.thickness,
  };
}

export function applyTempestArrangement(
  settings: RawPurifierSettings,
  arrangement: TempestArrangementPreset,
): RawPurifierSettings {
  const canonicalArrangement = canonicalTempestArrangement(arrangement);
  const fanBanks = tempestRawFanBanksForArrangement(canonicalArrangement);
  return {
    ...settings,
    tempestArrangement: canonicalArrangement,
    filters: canonicalArrangement === "single-horizontal-top-filter" ? 1 : 2,
    fansLeft: fanBanks.left,
    fansRight: fanBanks.right,
    fansTop: fanBanks.top,
    fansBottom: fanBanks.bottom,
  };
}

export function applyTempestArrangementDefaults(
  settings: RawPurifierSettings,
  arrangement: TempestArrangementPreset,
): RawPurifierSettings {
  const arrangedSettings = applyTempestArrangement(settings, arrangement);
  return applyFilterDimensions(
    arrangedSettings,
    defaultFilterDimensionsByTempestArrangement[
      arrangedSettings.tempestArrangement
    ],
  );
}

export function applyPrintDesignPreset(
  settings: RawPurifierSettings,
  presetId: PrintDesignId,
): RawPurifierSettings {
  const preset = findPrintDesignPreset(presetId);
  const base = {
    ...settings,
    printDesign: preset.id,
    filters: rawFilterCountForPrintDesign(preset),
    fanDiameter: defaultFanDiameterForPrintDesign(preset),
  };

  if (preset.implementation.type === "donut-filter-adapter") {
    const donutFilter = preset.implementation.defaults.filter;
    return {
      ...base,
      filterWidth: donutFilter.outerDiameter,
      filterDepth: donutFilter.length,
      filterThickness: donutFilter.holeDiameter,
      filters: 1,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      donutFilterOuterDiameter: donutFilter.outerDiameter,
      donutFilterLength: donutFilter.length,
      donutFilterHoleDiameter: donutFilter.holeDiameter,
      donutAdapterInsertLength: donutFilter.insertLength,
      donutCapRim: donutCapRawRim(donutFilter.cap),
      donutCapEnabled: donutFilter.cap.type === "printed-cap",
      splitFrames: preset.implementation.defaults.splitFrames,
      rim: defaultSettings.rim,
      materialThickness: preset.implementation.defaults.materialThickness,
      screwHoleDiameter: preset.implementation.defaults.screwHoleDiameter,
    };
  }

  if (preset.implementation.type === "tempest") {
    const arrangement = preset.implementation.defaults.arrangement;
    const fanBanks = tempestRawFanBanksForArrangement(arrangement);
    return {
      ...applyFilterDimensions(
        base,
        defaultFilterDimensionsByTempestArrangement[arrangement],
      ),
      tempestArrangement: arrangement,
      fansLeft: fanBanks.left,
      fansRight: fanBanks.right,
      fansTop: fanBanks.top,
      fansBottom: fanBanks.bottom,
      donutFilterOuterDiameter: defaultSettings.donutFilterOuterDiameter,
      donutFilterLength: defaultSettings.donutFilterLength,
      donutFilterHoleDiameter: defaultSettings.donutFilterHoleDiameter,
      donutAdapterInsertLength: defaultSettings.donutAdapterInsertLength,
      donutCapRim: defaultSettings.donutCapRim,
      donutCapEnabled: defaultSettings.donutCapEnabled,
      splitFrames: true,
      rim: preset.implementation.defaults.rim,
      materialThickness: preset.implementation.defaults.materialThickness,
      screwHoleDiameter: preset.implementation.defaults.screwHoleDiameter,
    };
  }

  if (preset.implementation.type === "static-reference") {
    return {
      ...applyFilterDimensions(base, preset.implementation.defaults.filter),
      fansLeft: 0,
      fansRight: 0,
      fansTop: preset.implementation.defaults.fanCount,
      fansBottom: 0,
      donutFilterOuterDiameter: defaultSettings.donutFilterOuterDiameter,
      donutFilterLength: defaultSettings.donutFilterLength,
      donutFilterHoleDiameter: defaultSettings.donutFilterHoleDiameter,
      donutAdapterInsertLength: defaultSettings.donutAdapterInsertLength,
      donutCapRim: defaultSettings.donutCapRim,
      donutCapEnabled: defaultSettings.donutCapEnabled,
      splitFrames: preset.implementation.defaults.splitFrames,
      rim: defaultSettings.rim,
      materialThickness: defaultSettings.materialThickness,
      screwHoleDiameter: defaultSettings.screwHoleDiameter,
    };
  }

  return {
    ...applyFilterDimensions(base, preset.implementation.defaults.filter),
    fansLeft: fanCountRequestToRawSetting(
      preset.implementation.defaults.fanBanks.left,
    ),
    fansRight: fanCountRequestToRawSetting(
      preset.implementation.defaults.fanBanks.right,
    ),
    fansTop: fanCountRequestToRawSetting(
      preset.implementation.defaults.fanBanks.top,
    ),
    fansBottom: fanCountRequestToRawSetting(
      preset.implementation.defaults.fanBanks.bottom,
    ),
    donutFilterOuterDiameter: defaultSettings.donutFilterOuterDiameter,
    donutFilterLength: defaultSettings.donutFilterLength,
    donutFilterHoleDiameter: defaultSettings.donutFilterHoleDiameter,
    donutAdapterInsertLength: defaultSettings.donutAdapterInsertLength,
    donutCapRim: defaultSettings.donutCapRim,
    donutCapEnabled: defaultSettings.donutCapEnabled,
    splitFrames: preset.implementation.defaults.splitFrames,
    rim: defaultSettings.rim,
    materialThickness: defaultSettings.materialThickness,
    screwHoleDiameter: defaultSettings.screwHoleDiameter,
  };
}

// #######################################
// Shared Helpers
// #######################################

function rawFilterCountForPrintDesign(preset: PrintDesignPreset): FilterCount {
  if (
    isLaserCutDesignPreset(preset) ||
    isStaticReferencePrintDesignPreset(preset)
  ) {
    return preset.implementation.defaults.filterCount;
  }
  if (isTempestPrintDesignPreset(preset)) {
    return preset.implementation.defaults.arrangement ===
      "single-horizontal-top-filter"
      ? 1
      : 2;
  }
  if (isDonutFilterAdapterPrintDesignPreset(preset)) {
    return 1;
  }
  return defaultSettings.filters;
}

export function canonicalTempestArrangement(
  value: TempestArrangementPreset | string | null | undefined,
): TempestArrangementPreset {
  const found = tempestArrangementPresets.find(
    (arrangement) => arrangement === value,
  );
  return found ?? defaultSettings.tempestArrangement;
}

function requiredPreviewMaterialColorPreset(
  id: PreviewMaterialColorId,
): PreviewMaterialColorPreset {
  const preset = previewMaterialColorPresets.find((entry) => entry.id === id);
  if (preset === undefined) {
    throw new Error(
      `requiredPreviewMaterialColorPreset: Missing preview color ${id}`,
    );
  }
  return preset;
}

export function fanCountRequestFromRawSetting(value: number): FanCountRequest {
  const clamped = clampInteger(
    value,
    automaticFanCount,
    fixedFanCountOptions[fixedFanCountOptions.length - 1],
  );
  if (clamped === automaticFanCount) {
    return { type: "auto" };
  }
  const fixedCount =
    fixedFanCountOptions.find((count) => count === clamped) ?? 0;
  return { type: "fixed", count: fixedCount };
}

export function fanCountRequestToRawSetting(request: FanCountRequest): number {
  return request.type === "auto" ? automaticFanCount : request.count;
}

export function tempestRawFanBanksForArrangement(
  arrangement: TempestArrangementPreset,
): FanBanks<number> {
  if (arrangement === "four-side-filter-tower") {
    return {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    };
  }
  return {
    left: automaticFanCount,
    right: automaticFanCount,
    top: 0,
    bottom: 0,
  };
}

export function donutCapRawRim(cap: DonutCap): Millimeters {
  return cap.type === "printed-cap" ? cap.rim : defaultSettings.donutCapRim;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(clamp(value, min, max));
}
