import { createAirPurifierCutSheet, resolveFanCount } from "./airPurifierPanels";
import { clampRimForGeometry, createAirPurifierGeometry } from "./airPurifierGeometry";
import { renderBoxesDocumentSvg } from "./boxes/svg";
import type { CutPanel } from "./cutGeometry";

export const fanDiameters = [40, 60, 80, 92, 120, 140] as const;

export type FanDiameter = (typeof fanDiameters)[number];

export const fanSpecs: readonly FanSpec[] = [
  { diameter: 40, screwSpacing: 32.5, cutClearance: 4 },
  { diameter: 60, screwSpacing: 50, cutClearance: 4 },
  { diameter: 80, screwSpacing: 71.5, cutClearance: 4 },
  { diameter: 92, screwSpacing: 82.5, cutClearance: 4 },
  { diameter: 120, screwSpacing: 105, cutClearance: 4 },
  { diameter: 140, screwSpacing: 125, cutClearance: 4 },
];

export type FilterCount = 1 | 2;

export type PreviewMode = "enclosure" | "cut-sheet";

export const cameraPresets = ["official", "front", "side", "top"] as const;

export type CameraPreset = (typeof cameraPresets)[number];

export const fixedFanCountOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export const automaticFanCount = -1;

export type FixedFanCount = (typeof fixedFanCountOptions)[number];

export type Millimeters = number;

export type FilterDimensions = {
  readonly width: Millimeters;
  readonly depth: Millimeters;
  readonly thickness: Millimeters;
};

export type FanCountRequest =
  | {
      type: "auto";
    }
  | {
      type: "fixed";
      count: FixedFanCount;
    };

export type FanWall = "left" | "right" | "top" | "bottom";

export type FanBanks<T> = Record<FanWall, T>;

export type FanSpec = {
  diameter: FanDiameter;
  screwSpacing: Millimeters;
  cutClearance: Millimeters;
};

export type FanAppearance = {
  readonly frameColor: number;
  readonly ringColor: number;
  readonly bladeColor: number;
  readonly hubColor: number;
  readonly accentColor: number;
  readonly bladeOpacity: number;
};

export const fanProductPresetIds = [
  "nukit-arctic-p14",
  "cleanairkits-mobius-120p",
  "noctua-nf-a14",
  "custom",
] as const;

export type FanProductPresetId = (typeof fanProductPresetIds)[number];

export type PresetFanProductId = Exclude<FanProductPresetId, "custom">;

export type FanProductPreset = {
  readonly id: FanProductPresetId;
  readonly label: string;
  readonly detail: string;
  readonly diameter: FanDiameter;
  readonly source: string;
  readonly productUrl?: string;
  readonly powerNote: string;
  readonly buyingNotes: readonly string[];
  readonly appearance: FanAppearance;
};

export type PresetFanProduct = FanProductPreset & {
  readonly id: PresetFanProductId;
};

export const customFanProductPresetId: FanProductPresetId = "custom";
export const defaultFanProductPresetId: PresetFanProductId = "nukit-arctic-p14";

export const fanProductPresets: readonly FanProductPreset[] = [
  {
    id: "nukit-arctic-p14",
    label: "ARCTIC P14 PWM PST",
    detail: "Nukit baseline recommendation: black 140 mm pressure-optimized PWM fan with PST daisy-chain cabling.",
    diameter: 140,
    source: "Nukit README / ARCTIC P14 PWM PST",
    productUrl: "https://www.arctic.de/en/P14-PWM-PST/ACFAN00125A",
    powerNote: "4-pin PWM PST, 12 V",
    buyingNotes: ["Good low-cost default", "PST cabling can simplify multi-fan wiring"],
    appearance: {
      frameColor: 0x111817,
      ringColor: 0x050807,
      bladeColor: 0x49525a,
      hubColor: 0x919a96,
      accentColor: 0x253a38,
      bladeOpacity: 0.84,
    },
  },
  {
    id: "cleanairkits-mobius-120p",
    label: "Cooler Master Mobius 120P",
    detail: "CleanAirKits Luggable Ultra style: high-pressure 120 mm Mobius fan family.",
    diameter: 120,
    source: "CleanAirKits Luggables / Cooler Master Mobius 120P",
    productUrl: "https://www.coolermaster.com/en-global/products/mobius-120p-argb/",
    powerNote: "4-pin PWM, 12 V",
    buyingNotes: ["Matches the Luggable Ultra fan size", "Black retail or ARGB versions may vary by region"],
    appearance: {
      frameColor: 0x080d11,
      ringColor: 0x151c22,
      bladeColor: 0x202b33,
      hubColor: 0x8a969c,
      accentColor: 0x50b8ff,
      bladeOpacity: 0.88,
    },
  },
  {
    id: "noctua-nf-a14",
    label: "Noctua NF-A14 PWM",
    detail: "Premium quiet 140 mm option with Noctua's recognizable beige frame and brown blades.",
    diameter: 140,
    source: "Noctua NF-A14 PWM",
    productUrl: "https://noctua.at/en/nf-a14-pwm",
    powerNote: "4-pin PWM, 12 V",
    buyingNotes: ["Premium acoustic choice", "Color is intentionally visible in the preview"],
    appearance: {
      frameColor: 0xd6bd8d,
      ringColor: 0xb79a67,
      bladeColor: 0x6b3b25,
      hubColor: 0xe2cda4,
      accentColor: 0x8f5b35,
      bladeOpacity: 0.92,
    },
  },
  {
    id: "custom",
    label: "Custom fan",
    detail: "Use a generic fan size and enter the diameter separately.",
    diameter: 140,
    source: "User supplied fan",
    powerNote: "Check the fan datasheet",
    buyingNotes: ["Verify screw spacing before cutting", "Check voltage and current draw"],
    appearance: {
      frameColor: 0x111817,
      ringColor: 0x060a09,
      bladeColor: 0x657179,
      hubColor: 0x9aa39f,
      accentColor: 0x3c6f61,
      bladeOpacity: 0.84,
    },
  },
];

export type FanProductSelection =
  | {
      readonly type: "preset";
      readonly presetId: PresetFanProductId;
      readonly product: PresetFanProduct;
    }
  | {
      readonly type: "custom";
      readonly product: FanProductPreset;
    };

export type FanConfiguration = {
  spec: FanSpec;
  productSelection: FanProductSelection;
  banks: FanBanks<FanCountRequest>;
};

export type ResolvedFanBanks = FanBanks<number>;

export type FilterFrameConstruction =
  | {
      type: "split-rails";
    }
  | {
      type: "full-panels";
    };

export type ReferenceScale =
  | {
      type: "disabled";
    }
  | {
      type: "enabled";
      length: Millimeters;
    };

export type CuttingSettings = {
  materialThickness: Millimeters;
  rim: Millimeters;
  screwHoleDiameter: Millimeters;
  kerfFit: Millimeters;
  labels: boolean;
  referenceScale: ReferenceScale;
};

export type PreviewSettings = {
  showFilterMedia: boolean;
  showFans: boolean;
  showFilterFrame: boolean;
  transparentWalls: boolean;
  explodedView: boolean;
  showDimensions: boolean;
  cameraPreset: CameraPreset;
};

export const filterPresetIds = [
  "merv13-20x20x2",
  "merv13-20x25x1",
  "merv13-16x25x1",
  "merv13-20x20x1",
  "ikea-fornuftig",
  "ikea-starkvind",
  "ikea-uppatvind",
  "custom",
] as const;

export type FilterPresetId = (typeof filterPresetIds)[number];

export type PresetFilterId = Exclude<FilterPresetId, "custom">;

export type FilterSelection =
  | {
      type: "preset";
      presetId: PresetFilterId;
    }
  | {
      type: "custom";
      dimensions: FilterDimensions;
    };

export type FilterPreset = {
  id: FilterPresetId;
  label: string;
  detail: string;
  examples: readonly string[];
  nominalSize: string;
  source: string;
  dimensions: FilterDimensions;
};

export type PresetFilter = FilterPreset & {
  id: PresetFilterId;
};

export const customFilterPresetId: FilterPresetId = "custom";

export const filterPresets: readonly FilterPreset[] = [
  {
    id: "merv13-20x20x2",
    label: "20x20x2 MERV 13",
    detail: "20x20x2 MERV 13",
    examples: ["Nukit", "Tempest Pro"],
    nominalSize: "20 x 20 x 2 in",
    source: "Nukit / standard HVAC actual size",
    dimensions: { width: 498, depth: 496, thickness: 46.77 },
  },
  {
    id: "merv13-20x25x1",
    label: "20x25x1 MERV 13",
    detail: "20x25x1 MERV 13",
    examples: ["Luggable XL Ultra"],
    nominalSize: "20 x 25 x 1 in",
    source: "CleanAirKits / standard HVAC actual size",
    dimensions: { width: 622.3, depth: 495.3, thickness: 19.1 },
  },
  {
    id: "merv13-16x25x1",
    label: "16x25x1 MERV 13",
    detail: "16x25x1 MERV 13",
    examples: ["Luggable", "Luggable Ultra"],
    nominalSize: "16 x 25 x 1 in",
    source: "CleanAirKits / standard HVAC actual size",
    dimensions: { width: 622.3, depth: 393.7, thickness: 19.1 },
  },
  {
    id: "merv13-20x20x1",
    label: "20x20x1 MERV 13",
    detail: "20x20x1 MERV 13",
    examples: ["Common square HVAC filter"],
    nominalSize: "20 x 20 x 1 in",
    source: "Standard HVAC actual size",
    dimensions: { width: 495.3, depth: 495.3, thickness: 19.1 },
  },
  {
    id: "ikea-fornuftig",
    label: "IKEA FORNUFTIG",
    detail: "IKEA FORNUFTIG",
    examples: ["FÖRNUFTIG"],
    nominalSize: "15.25 x 9.75 x 0.75 in",
    source: "IKEA published replacement filter size",
    dimensions: { width: 387.4, depth: 247.7, thickness: 19.1 },
  },
  {
    id: "ikea-starkvind",
    label: "IKEA STARKVIND",
    detail: "IKEA STARKVIND",
    examples: ["STARKVIND"],
    nominalSize: "14.5 x 11.5 x 1.5 in",
    source: "IKEA published replacement filter size",
    dimensions: { width: 368.3, depth: 292.1, thickness: 38.1 },
  },
  {
    id: "ikea-uppatvind",
    label: "IKEA UPPATVIND",
    detail: "IKEA UPPATVIND",
    examples: ["UPPÅTVIND"],
    nominalSize: "9.875 x 7.875 x 1 in",
    source: "IKEA published replacement filter size",
    dimensions: { width: 250.8, depth: 200, thickness: 25.4 },
  },
  {
    id: "custom",
    label: "Custom measured filter",
    detail: "Enter exact dimensions",
    examples: ["Custom build"],
    nominalSize: "Measured",
    source: "User supplied dimensions",
    dimensions: { width: 498, depth: 496, thickness: 46.77 },
  },
];

export type RawPurifierSettings = {
  filterPreset: FilterPresetId;
  filterWidth: Millimeters;
  filterDepth: Millimeters;
  filterThickness: Millimeters;
  rim: Millimeters;
  fanPreset: FanProductPresetId;
  fanDiameter: FanDiameter;
  filters: FilterCount;
  splitFrames: boolean;
  fansLeft: number;
  fansRight: number;
  fansTop: number;
  fansBottom: number;
  screwHoleDiameter: Millimeters;
  materialThickness: Millimeters;
  kerfFit: Millimeters;
  showFilterMedia: boolean;
  showFans: boolean;
  showFilterFrame: boolean;
  transparentWalls: boolean;
  explodedView: boolean;
  showDimensions: boolean;
  cameraPreset: CameraPreset;
  labels: boolean;
  referenceScale: Millimeters;
};

export type PurifierSettings = {
  filter: FilterSelection;
  filterCount: FilterCount;
  fan: FanConfiguration;
  frameConstruction: FilterFrameConstruction;
  cutting: CuttingSettings;
  preview: PreviewSettings;
};

export type BuildSummary = {
  chamberHeight: number;
  workingDepth: number;
  resolvedFans: ResolvedFanBanks;
  panelCount: number;
  sheetWidth: number;
  sheetHeight: number;
};

export type LayoutResult = {
  rawSettings: RawPurifierSettings;
  configuration: PurifierSettings;
  cutPanels: CutPanel[];
  cutSheet: ReturnType<typeof createAirPurifierCutSheet>["document"];
  summary: BuildSummary;
};

export type PurifierInput = RawPurifierSettings | PurifierSettings;

export const defaultSettings: RawPurifierSettings = {
  filterPreset: "merv13-20x25x1",
  filterWidth: 622.3,
  filterDepth: 495.3,
  filterThickness: 19.1,
  rim: 30,
  fanPreset: defaultFanProductPresetId,
  fanDiameter: 140,
  filters: 2,
  splitFrames: true,
  fansLeft: automaticFanCount,
  fansRight: automaticFanCount,
  fansTop: 0,
  fansBottom: 0,
  screwHoleDiameter: 5,
  materialThickness: 3,
  kerfFit: 0.1,
  showFilterMedia: true,
  showFans: true,
  showFilterFrame: true,
  transparentWalls: false,
  explodedView: false,
  showDimensions: false,
  cameraPreset: "official",
  labels: true,
  referenceScale: 100,
};

export function normalizeSettings(input: PurifierInput): PurifierSettings {
  const raw = isStructuredSettings(input) ? toRawSettings(input) : input;
  const preset = findFilterPreset(raw.filterPreset);
  const dimensions = normalizeFilterDimensions(preset.id === customFilterPresetId ? rawFilterDimensions(raw) : preset.dimensions);
  const materialThickness = clamp(raw.materialThickness, 1.5, 9);
  const fanProductPreset = findFanProductPreset(raw.fanPreset);
  const fanDiameter = fanProductPreset.id === customFanProductPresetId ? raw.fanDiameter : fanProductPreset.diameter;
  const fanSpec = findFanSpec(fanDiameter);
  const filterCount = raw.filters === 1 ? 1 : 2;
  const workingDepth = dimensions.depth - materialThickness;
  const chamberHeight = fanSpec.diameter + 2 + filterCount * (dimensions.thickness + materialThickness);
  const rim = clampRimForGeometry(raw.rim, dimensions.width, workingDepth, chamberHeight);

  return {
    filter: createFilterSelection(preset.id, dimensions),
    filterCount,
    fan: {
      spec: fanSpec,
      productSelection: createFanProductSelection(fanProductPreset.id),
      banks: {
        left: fanCountRequestFromNumber(raw.fansLeft),
        right: fanCountRequestFromNumber(raw.fansRight),
        top: fanCountRequestFromNumber(raw.fansTop),
        bottom: fanCountRequestFromNumber(raw.fansBottom),
      },
    },
    frameConstruction: raw.splitFrames ? { type: "split-rails" } : { type: "full-panels" },
    cutting: {
      materialThickness,
      rim,
      screwHoleDiameter: clamp(raw.screwHoleDiameter, 2, 10),
      kerfFit: clamp(raw.kerfFit, 0, 1),
      labels: raw.labels,
      referenceScale: referenceScaleFromNumber(raw.referenceScale),
    },
    preview: {
      showFilterMedia: raw.showFilterMedia,
      showFans: raw.showFans,
      showFilterFrame: raw.showFilterFrame,
      transparentWalls: raw.transparentWalls,
      explodedView: raw.explodedView,
      showDimensions: raw.showDimensions,
      cameraPreset: cameraPresets.includes(raw.cameraPreset) ? raw.cameraPreset : defaultSettings.cameraPreset,
    },
  };
}

export function normalizeRawSettings(input: PurifierInput): RawPurifierSettings {
  return toRawSettings(normalizeSettings(input));
}

export function toRawSettings(input: PurifierInput): RawPurifierSettings {
  if (!isStructuredSettings(input)) {
    return input;
  }

  const filterDimensions = filterSelectionDimensions(input.filter);
  return {
    filterPreset: input.filter.type === "preset" ? input.filter.presetId : customFilterPresetId,
    filterWidth: filterDimensions.width,
    filterDepth: filterDimensions.depth,
    filterThickness: filterDimensions.thickness,
    rim: input.cutting.rim,
    fanPreset: input.fan.productSelection.type === "preset" ? input.fan.productSelection.presetId : customFanProductPresetId,
    fanDiameter: input.fan.spec.diameter,
    filters: input.filterCount,
    splitFrames: input.frameConstruction.type === "split-rails",
    fansLeft: fanCountRequestToNumber(input.fan.banks.left),
    fansRight: fanCountRequestToNumber(input.fan.banks.right),
    fansTop: fanCountRequestToNumber(input.fan.banks.top),
    fansBottom: fanCountRequestToNumber(input.fan.banks.bottom),
    screwHoleDiameter: input.cutting.screwHoleDiameter,
    materialThickness: input.cutting.materialThickness,
    kerfFit: input.cutting.kerfFit,
    showFilterMedia: input.preview.showFilterMedia,
    showFans: input.preview.showFans,
    showFilterFrame: input.preview.showFilterFrame,
    transparentWalls: input.preview.transparentWalls,
    explodedView: input.preview.explodedView,
    showDimensions: input.preview.showDimensions,
    cameraPreset: input.preview.cameraPreset,
    labels: input.cutting.labels,
    referenceScale: input.cutting.referenceScale.type === "enabled" ? input.cutting.referenceScale.length : 0,
  };
}

export function findFilterPreset(id: FilterPresetId): FilterPreset {
  return filterPresets.find((preset) => preset.id === id) ?? filterPresets[0];
}

export function findPresetFilter(id: PresetFilterId): PresetFilter {
  const preset = filterPresets.find((entry): entry is PresetFilter => entry.id === id && isPresetFilterId(entry.id));
  if (preset === undefined) {
    throw new Error(`findPresetFilter: Missing preset filter ${id}`);
  }
  return preset;
}

export function filterSelectionDimensions(filter: FilterSelection): FilterDimensions {
  const dimensions = filter.type === "preset" ? findPresetFilter(filter.presetId).dimensions : filter.dimensions;
  return {
    width: dimensions.width,
    depth: dimensions.depth,
    thickness: dimensions.thickness,
  };
}

export function findFanSpec(diameter: FanDiameter): FanSpec {
  return fanSpecs.find((spec) => spec.diameter === diameter) ?? fanSpecs[fanSpecs.length - 1];
}

export function findFanProductPreset(id: FanProductPresetId): FanProductPreset {
  return fanProductPresets.find((preset) => preset.id === id) ?? findPresetFanProduct(defaultFanProductPresetId);
}

export function findPresetFanProduct(id: PresetFanProductId): PresetFanProduct {
  const preset = fanProductPresets.find((entry): entry is PresetFanProduct => entry.id === id && isPresetFanProductId(entry.id));
  if (preset === undefined) {
    throw new Error(`findPresetFanProduct: Missing fan product ${id}`);
  }
  return preset;
}

export function applyFilterPreset(settings: RawPurifierSettings, presetId: FilterPresetId): RawPurifierSettings {
  const preset = findFilterPreset(presetId);
  if (preset.id === customFilterPresetId) {
    return {
      ...settings,
      filterPreset: customFilterPresetId,
    };
  }

  return {
    ...settings,
    filterPreset: preset.id,
    filterWidth: preset.dimensions.width,
    filterDepth: preset.dimensions.depth,
    filterThickness: preset.dimensions.thickness,
  };
}

export function applyFanProductPreset(settings: RawPurifierSettings, presetId: FanProductPresetId): RawPurifierSettings {
  const preset = findFanProductPreset(presetId);
  if (preset.id === customFanProductPresetId) {
    return {
      ...settings,
      fanPreset: customFanProductPresetId,
    };
  }

  return {
    ...settings,
    fanPreset: preset.id,
    fanDiameter: preset.diameter,
  };
}

export function createLayout(input: PurifierInput): LayoutResult {
  const configuration = normalizeSettings(input);
  const settings = toRawSettings(configuration);
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

export function encodeSettings(input: PurifierInput): string {
  const settings = toRawSettings(input);
  const params = new URLSearchParams();
  params.set("filterPreset", settings.filterPreset);
  params.set("filterWidth", formatNumber(settings.filterWidth));
  params.set("filterDepth", formatNumber(settings.filterDepth));
  params.set("filterThickness", formatNumber(settings.filterThickness));
  params.set("rim", formatNumber(settings.rim));
  params.set("fanPreset", settings.fanPreset);
  params.set("fanDiameter", String(settings.fanDiameter));
  params.set("filters", String(settings.filters));
  params.set("splitFrames", String(settings.splitFrames));
  params.set("fansLeft", String(settings.fansLeft));
  params.set("fansRight", String(settings.fansRight));
  params.set("fansTop", String(settings.fansTop));
  params.set("fansBottom", String(settings.fansBottom));
  params.set("screwHoleDiameter", formatNumber(settings.screwHoleDiameter));
  params.set("materialThickness", formatNumber(settings.materialThickness));
  params.set("kerfFit", formatNumber(settings.kerfFit));
  params.set("showFilterMedia", String(settings.showFilterMedia));
  params.set("showFans", String(settings.showFans));
  params.set("showFilterFrame", String(settings.showFilterFrame));
  params.set("transparentWalls", String(settings.transparentWalls));
  params.set("explodedView", String(settings.explodedView));
  params.set("showDimensions", String(settings.showDimensions));
  params.set("cameraPreset", settings.cameraPreset);
  params.set("labels", String(settings.labels));
  params.set("referenceScale", formatNumber(settings.referenceScale));
  return params.toString();
}

export function decodeSettings(search: string): RawPurifierSettings {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const filterPreset = readFilterPreset(params);
  const fanDiameter = readFanDiameter(params, "fanDiameter", defaultSettings.fanDiameter);
  const fanPreset = readFanProductPreset(params, fanDiameter);
  const parsed: RawPurifierSettings = {
    ...defaultSettings,
    filterPreset,
    filterWidth: readNumber(params, "filterWidth", defaultSettings.filterWidth),
    filterDepth: readNumber(params, "filterDepth", defaultSettings.filterDepth),
    filterThickness: readNumber(params, "filterThickness", defaultSettings.filterThickness),
    rim: readNumber(params, "rim", defaultSettings.rim),
    fanPreset,
    fanDiameter,
    filters: readFilterCount(params, "filters", defaultSettings.filters),
    splitFrames: readBoolean(params, "splitFrames", defaultSettings.splitFrames),
    fansLeft: readInteger(params, "fansLeft", defaultSettings.fansLeft),
    fansRight: readInteger(params, "fansRight", defaultSettings.fansRight),
    fansTop: readInteger(params, "fansTop", defaultSettings.fansTop),
    fansBottom: readInteger(params, "fansBottom", defaultSettings.fansBottom),
    screwHoleDiameter: readNumber(params, "screwHoleDiameter", defaultSettings.screwHoleDiameter),
    materialThickness: readNumber(params, "materialThickness", defaultSettings.materialThickness),
    kerfFit: readNumber(params, "kerfFit", defaultSettings.kerfFit),
    showFilterMedia: readBoolean(params, "showFilterMedia", defaultSettings.showFilterMedia),
    showFans: readBoolean(params, "showFans", defaultSettings.showFans),
    showFilterFrame: readBoolean(params, "showFilterFrame", defaultSettings.showFilterFrame),
    transparentWalls: readBoolean(params, "transparentWalls", defaultSettings.transparentWalls),
    explodedView: readBoolean(params, "explodedView", defaultSettings.explodedView),
    showDimensions: readBoolean(params, "showDimensions", defaultSettings.showDimensions),
    cameraPreset: readCameraPreset(params, "cameraPreset", defaultSettings.cameraPreset),
    labels: readBoolean(params, "labels", defaultSettings.labels),
    referenceScale: readNumber(params, "referenceScale", defaultSettings.referenceScale),
  };
  return normalizeRawSettings(parsed);
}

export function formatMillimeters(value: number): string {
  return `${formatNumber(value)} mm`;
}

function isStructuredSettings(input: PurifierInput): input is PurifierSettings {
  return "filter" in input && "fan" in input && "cutting" in input;
}

function rawFilterDimensions(settings: RawPurifierSettings): FilterDimensions {
  return {
    width: settings.filterWidth,
    depth: settings.filterDepth,
    thickness: settings.filterThickness,
  };
}

function normalizeFilterDimensions(dimensions: FilterDimensions): FilterDimensions {
  return {
    width: clamp(dimensions.width, 120, 900),
    depth: clamp(dimensions.depth, 120, 900),
    thickness: clamp(dimensions.thickness, 10, 120),
  };
}

function createFilterSelection(presetId: FilterPresetId, dimensions: FilterDimensions): FilterSelection {
  if (isPresetFilterId(presetId)) {
    return {
      type: "preset",
      presetId,
    };
  }
  return {
    type: "custom",
    dimensions,
  };
}

function createFanProductSelection(presetId: FanProductPresetId): FanProductSelection {
  if (isPresetFanProductId(presetId)) {
    return {
      type: "preset",
      presetId,
      product: findPresetFanProduct(presetId),
    };
  }
  return {
    type: "custom",
    product: findFanProductPreset(customFanProductPresetId),
  };
}

function isPresetFilterId(id: FilterPresetId): id is PresetFilterId {
  return id !== customFilterPresetId;
}

function isPresetFanProductId(id: FanProductPresetId): id is PresetFanProductId {
  return id !== customFanProductPresetId;
}

function fanCountRequestFromNumber(value: number): FanCountRequest {
  const clamped = clampInteger(value, automaticFanCount, fixedFanCountOptions[fixedFanCountOptions.length - 1]);
  if (clamped === automaticFanCount) {
    return { type: "auto" };
  }
  const fixedCount = fixedFanCountOptions.find((count) => count === clamped) ?? 0;
  return { type: "fixed", count: fixedCount };
}

function fanCountRequestToNumber(request: FanCountRequest): number {
  return request.type === "auto" ? automaticFanCount : request.count;
}

function referenceScaleFromNumber(value: number): ReferenceScale {
  const length = clamp(value, 0, 300);
  return length > 0 ? { type: "enabled", length } : { type: "disabled" };
}

function readNumber(params: URLSearchParams, key: string, fallback: number): number {
  const value = params.get(key);
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readInteger(params: URLSearchParams, key: string, fallback: number): number {
  return Math.trunc(readNumber(params, key, fallback));
}

function readBoolean(params: URLSearchParams, key: string, fallback: boolean): boolean {
  const value = params.get(key);
  if (value === null) {
    return fallback;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return fallback;
}

function readFanDiameter(params: URLSearchParams, key: string, fallback: FanDiameter): FanDiameter {
  const parsed = Number(params.get(key));
  const found = fanDiameters.find((diameter) => diameter === parsed);
  return found ?? fallback;
}

function readFanProductPreset(params: URLSearchParams, fanDiameter: FanDiameter): FanProductPresetId {
  const value = params.get("fanPreset");
  const found = fanProductPresetIds.find((preset) => preset === value);
  if (found !== undefined) {
    return found;
  }
  return fanDiameter === findFanProductPreset(defaultSettings.fanPreset).diameter
    ? defaultSettings.fanPreset
    : customFanProductPresetId;
}

function readFilterPreset(params: URLSearchParams): FilterPresetId {
  const value = params.get("filterPreset");
  const found = filterPresetIds.find((preset) => preset === value);
  if (found !== undefined) {
    return found;
  }
  if (params.has("filterWidth") || params.has("filterDepth") || params.has("filterThickness")) {
    return customFilterPresetId;
  }
  return defaultSettings.filterPreset;
}

function readFilterCount(params: URLSearchParams, key: string, fallback: FilterCount): FilterCount {
  const parsed = Number(params.get(key));
  return parsed === 1 || parsed === 2 ? parsed : fallback;
}

function readCameraPreset(params: URLSearchParams, key: string, fallback: CameraPreset): CameraPreset {
  const value = params.get(key);
  const found = cameraPresets.find((preset) => preset === value);
  return found ?? fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(clamp(value, min, max));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
