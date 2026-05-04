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

export type PreviewMode = "enclosure" | "cut-sheet" | "print-sheets";

export const printDesignIds = ["nukit-open-air", "corsi-rosenthal", "donut-hepa-adapter"] as const;

export type PrintDesignId = (typeof printDesignIds)[number];

export const corsiRosenthalModes = ["top-exhaust", "side-exhaust"] as const;

export type CorsiRosenthalMode = (typeof corsiRosenthalModes)[number];

export type CorsiRosenthalFilterCountRange = {
  readonly defaultCount: number;
  readonly min: number;
  readonly max: number;
};

export type CorsiRosenthalLayoutSettings = {
  readonly mode: CorsiRosenthalMode;
  readonly filterCount: number;
  readonly fanCount: number;
};

export type DonutFilterSettings = {
  readonly outerDiameter: Millimeters;
  readonly length: Millimeters;
  readonly holeDiameter: Millimeters;
  readonly insertLength: Millimeters;
  readonly capRim: Millimeters;
  readonly capEnabled: boolean;
};

export const donutFilterPresetIds = [
  "big-clive-silentnight-92",
  "levoit-core-mini",
  "levoit-core-200s",
  "levoit-core-300",
  "custom",
] as const;

export type DonutFilterPresetId = (typeof donutFilterPresetIds)[number];

export type PresetDonutFilterId = Exclude<DonutFilterPresetId, "custom">;

export type DonutFilterPreset = {
  readonly id: DonutFilterPresetId;
  readonly label: string;
  readonly detail: string;
  readonly source: string;
  readonly sourceUrl?: string;
  readonly productUrl?: string;
  readonly measurementNote: string;
  readonly settings: DonutFilterSettings;
};

export type PresetDonutFilter = DonutFilterPreset & {
  readonly id: PresetDonutFilterId;
};

export const corsiRosenthalFrameStyles = ["scarf-rail", "modular-rail"] as const;

export type CorsiRosenthalFrameStyle = (typeof corsiRosenthalFrameStyles)[number];

export const cameraPresets = ["official", "front", "side", "top"] as const;

export type CameraPreset = (typeof cameraPresets)[number];

export const fixedFanCountOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export const automaticFanCount = -1;

const corsiRosenthalTopFanCountOptions = [1, 2, 3, 4, 6, 8] as const;
const corsiRosenthalSideFanCountOptions = [2, 4, 6, 8] as const;

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

export type PrintDesignPreset = {
  readonly id: PrintDesignId;
  readonly label: string;
  readonly detail: string;
  readonly source: string;
  readonly sourceUrl?: string;
  readonly license: string;
  readonly licenseUrl?: string;
  readonly recommendedFilterPreset: FilterPresetId;
  readonly recommendedFanPreset: FanProductPresetId;
  readonly recommendedFanCount: number;
  readonly recommendedFilterCount: FilterCount;
  readonly recommendedDonutFilterPreset?: PresetDonutFilterId;
  readonly recommendedCorsiMode?: CorsiRosenthalMode;
  readonly recommendedCorsiFilterCount?: number;
  readonly corsiFrameStyle?: CorsiRosenthalFrameStyle;
  readonly donutFilterDefaults?: DonutFilterSettings;
  readonly assemblyNotes: readonly string[];
};

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
  "arctic-p12-pwm-pst",
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
    id: "arctic-p12-pwm-pst",
    label: "ARCTIC P12 PWM PST",
    detail: "120 mm pressure-optimized PWM fan used by several compact printable CR box builds.",
    diameter: 120,
    source: "ARCTIC P12 PWM PST",
    productUrl: "https://www.arctic.de/en/P12-PWM-PST/ACFAN00120A",
    powerNote: "4-pin PWM PST, 12 V",
    buyingNotes: ["Good compact printable-box fan", "PST cabling can simplify six-fan wiring"],
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
  autoRotate: boolean;
  cameraPreset: CameraPreset;
};

export const filterPresetIds = [
  "merv13-20x20x2",
  "merv13-20x25x1",
  "merv13-16x16x1",
  "merv13-16x20x1",
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
    id: "merv13-16x16x1",
    label: "16x16x1 MERV 13",
    detail: "16x16x1 MERV 13",
    examples: ["Modular Corsi-Rosenthal box"],
    nominalSize: "16 x 16 x 1 in",
    source: "Standard HVAC actual size",
    dimensions: { width: 393.7, depth: 393.7, thickness: 19.1 },
  },
  {
    id: "merv13-16x20x1",
    label: "16x20x1 MERV 13",
    detail: "16x20x1 MERV 13",
    examples: ["Corsi-Rosenthal printed box"],
    nominalSize: "16 x 20 x 1 in",
    source: "Standard HVAC actual size",
    dimensions: { width: 495.3, depth: 393.7, thickness: 19.1 },
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

export const customDonutFilterPresetId: DonutFilterPresetId = "custom";
export const defaultDonutFilterPresetId: PresetDonutFilterId = "big-clive-silentnight-92";

export const donutFilterPresets: readonly DonutFilterPreset[] = [
  {
    id: "big-clive-silentnight-92",
    label: "Big Clive / Silentnight style",
    detail: "Compact round HEPA cartridge used by the OpenSCAD reference adaptor.",
    source: "Big Clive OpenSCAD reference dimensions",
    measurementNote: "The reference script uses a 92 mm center hole; measure the cartridge before printing.",
    settings: {
      outerDiameter: 125,
      length: 150,
      holeDiameter: 92,
      insertLength: 10,
      capRim: 10,
      capEnabled: true,
    },
  },
  {
    id: "levoit-core-mini",
    label: "Levoit Core Mini",
    detail: "Small round replacement filter cartridge.",
    source: "Levoit Core Mini-RF listing",
    sourceUrl: "https://www.levoit.com.ph/products/levoit-core-mini-true-hepa-3-stage-original-replacement-filter-core-mini-rf-white",
    productUrl: "https://www.levoit.com.ph/products/levoit-core-mini-true-hepa-3-stage-original-replacement-filter-core-mini-rf-white",
    measurementNote: "Outer size is from published listings; center hole is a starter value and should be measured.",
    settings: {
      outerDiameter: 159,
      length: 135,
      holeDiameter: 92,
      insertLength: 10,
      capRim: 10,
      capEnabled: true,
    },
  },
  {
    id: "levoit-core-200s",
    label: "Levoit Core 200S",
    detail: "Medium round replacement filter cartridge.",
    source: "Levoit Core 200S-RF listings",
    sourceUrl: "https://device.report/levoit/core-200s-rf",
    productUrl: "https://levoit.com/products/core-200s-p-replacement-filter",
    measurementNote: "Outer size is from published listings; center hole is a starter value and should be measured.",
    settings: {
      outerDiameter: 183,
      length: 145,
      holeDiameter: 110,
      insertLength: 12,
      capRim: 12,
      capEnabled: true,
    },
  },
  {
    id: "levoit-core-300",
    label: "Levoit Core 300",
    detail: "Larger round replacement filter cartridge.",
    source: "Levoit Core 300-RF listings",
    sourceUrl: "https://cleanairadviser.com/levoit-core-300-replacement-filter-guide/",
    productUrl: "https://levoit.com/products/core300-air-purifier-replacement-filter",
    measurementNote: "Outer size is from published listings; center hole is a starter value and should be measured.",
    settings: {
      outerDiameter: 193,
      length: 147,
      holeDiameter: 120,
      insertLength: 12,
      capRim: 12,
      capEnabled: true,
    },
  },
  {
    id: "custom",
    label: "Custom measured round filter",
    detail: "Use calipers and enter the exact outside diameter, length, and center-hole diameter.",
    source: "User supplied measurements",
    measurementNote: "Measure the center hole carefully; that dimension controls whether the adaptor actually seats.",
    settings: {
      outerDiameter: 125,
      length: 150,
      holeDiameter: 92,
      insertLength: 10,
      capRim: 10,
      capEnabled: true,
    },
  },
];

export const defaultPrintDesignId: PrintDesignId = "nukit-open-air";

export const printDesignPresets: readonly PrintDesignPreset[] = [
  {
    id: "nukit-open-air",
    label: "Nukit Open Air laser-derived kit",
    detail: "Printable version of the current Nukit panel generator, split into bed-sized panels and glue keys.",
    source: "FilterBoxBuilder browser generator",
    license: "Generated from this project",
    recommendedFilterPreset: "merv13-20x25x1",
    recommendedFanPreset: defaultFanProductPresetId,
    recommendedFanCount: automaticFanCount,
    recommendedFilterCount: 2,
    assemblyNotes: ["Keeps the laser-cut wall layout", "Uses printed glue keys where panels are split for the printer bed"],
  },
  {
    id: "corsi-rosenthal",
    label: "Corsi-Rosenthal box",
    detail:
      "Modular CR frame with small IKEA filter defaults, repeated rails, corner blocks, fan plates, and connector keys.",
    source: "Gary Jepsen modular Printables CR reference",
    sourceUrl: "https://www.printables.com/model/1348938-corsi-rosenthal-box-air-filter",
    license: "Inspired by CC BY-NC 4.0 reference; generated geometry is original and parametric in this app",
    licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
    recommendedFilterPreset: "ikea-starkvind",
    recommendedFanPreset: "arctic-p12-pwm-pst",
    recommendedFanCount: automaticFanCount,
    recommendedFilterCount: 2,
    recommendedCorsiMode: "top-exhaust",
    recommendedCorsiFilterCount: 4,
    corsiFrameStyle: "modular-rail",
    assemblyNotes: [
      "Uses repeated frame-unit rails and separate corner blocks so the frame can be printed on smaller beds",
      "Automatic fan count keeps the top fan plate rectangular for the selected filter and fan size",
      "Connector pieces are generated separately from the rails so the geometry can stay parametric",
    ],
  },
  {
    id: "donut-hepa-adapter",
    label: "Donut HEPA fan adaptor",
    detail: "Self-scaling round-filter adaptor for a PC fan, with optional press-fit blanking cap and printed fan guard.",
    source: "Big Clive donut HEPA OpenSCAD reference",
    license: "Reference script published in the video description; generated geometry is parametric in this app",
    recommendedFilterPreset: "custom",
    recommendedFanPreset: "arctic-p12-pwm-pst",
    recommendedFanCount: 1,
    recommendedFilterCount: 1,
    recommendedDonutFilterPreset: defaultDonutFilterPresetId,
    donutFilterDefaults: {
      outerDiameter: 125,
      length: 150,
      holeDiameter: 92,
      insertLength: 10,
      capRim: 10,
      capEnabled: true,
    },
    assemblyNotes: [
      "Fan adaptor tapers from the square fan flange into the measured filter hole",
      "Back cap is a press-fit plug for filters open at both ends",
      "Fan guard is generated as a separate printable part so a bare fan is not exposed",
    ],
  },
];

export type RawPurifierSettings = {
  printDesign: PrintDesignId;
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
  corsiMode: CorsiRosenthalMode;
  corsiFilterCount: number;
  corsiFanCount: number;
  donutFilterPreset: DonutFilterPresetId;
  donutFilterOuterDiameter: Millimeters;
  donutFilterLength: Millimeters;
  donutFilterHoleDiameter: Millimeters;
  donutAdapterInsertLength: Millimeters;
  donutCapRim: Millimeters;
  donutCapEnabled: boolean;
  screwHoleDiameter: Millimeters;
  materialThickness: Millimeters;
  kerfFit: Millimeters;
  showFilterMedia: boolean;
  showFans: boolean;
  showFilterFrame: boolean;
  transparentWalls: boolean;
  explodedView: boolean;
  showDimensions: boolean;
  autoRotate: boolean;
  cameraPreset: CameraPreset;
  labels: boolean;
  referenceScale: Millimeters;
};

export type PurifierSettings = {
  printDesign: PrintDesignPreset;
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
  printDesign: defaultPrintDesignId,
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
  corsiMode: "top-exhaust",
  corsiFilterCount: 4,
  corsiFanCount: automaticFanCount,
  donutFilterPreset: defaultDonutFilterPresetId,
  donutFilterOuterDiameter: 125,
  donutFilterLength: 150,
  donutFilterHoleDiameter: 92,
  donutAdapterInsertLength: 10,
  donutCapRim: 10,
  donutCapEnabled: true,
  screwHoleDiameter: 5,
  materialThickness: 3,
  kerfFit: 0.1,
  showFilterMedia: true,
  showFans: true,
  showFilterFrame: true,
  transparentWalls: false,
  explodedView: false,
  showDimensions: false,
  autoRotate: true,
  cameraPreset: "official",
  labels: true,
  referenceScale: 100,
};

export function normalizeSettings(input: PurifierInput): PurifierSettings {
  const raw = isStructuredSettings(input) ? toRawSettings(input) : input;
  const printDesign = findPrintDesignPreset(raw.printDesign);
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
    printDesign,
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
      autoRotate: raw.autoRotate,
      cameraPreset: cameraPresets.includes(raw.cameraPreset) ? raw.cameraPreset : defaultSettings.cameraPreset,
    },
  };
}

export function normalizeRawSettings(input: PurifierInput): RawPurifierSettings {
  const rawInput = isStructuredSettings(input) ? toRawSettings(input) : input;
  const normalized = toRawSettings(normalizeSettings(rawInput));
  const corsiMode = canonicalCorsiRosenthalMode(rawInput.corsiMode);
  const donutFilter = normalizeDonutFilterSettings(rawInput);
  const donutFilterPreset = findDonutFilterPreset(rawInput.donutFilterPreset);
  return canonicalizePrintDesignRawSettings({
    ...normalized,
    corsiMode,
    corsiFilterCount: canonicalCorsiFilterCount(rawInput.corsiFilterCount, corsiMode),
    corsiFanCount: canonicalCorsiFanCount(rawInput.corsiFanCount, normalized.printDesign, corsiMode),
    donutFilterPreset: donutFilterPreset.id,
    donutFilterOuterDiameter: donutFilter.outerDiameter,
    donutFilterLength: donutFilter.length,
    donutFilterHoleDiameter: donutFilter.holeDiameter,
    donutAdapterInsertLength: donutFilter.insertLength,
    donutCapRim: donutFilter.capRim,
    donutCapEnabled: donutFilter.capEnabled,
  });
}

export function toRawSettings(input: PurifierInput): RawPurifierSettings {
  if (!isStructuredSettings(input)) {
    return input;
  }

  const filterDimensions = filterSelectionDimensions(input.filter);
  return {
    printDesign: input.printDesign.id,
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
    corsiMode: defaultSettings.corsiMode,
    corsiFilterCount: defaultSettings.corsiFilterCount,
    corsiFanCount: defaultSettings.corsiFanCount,
    donutFilterPreset: defaultSettings.donutFilterPreset,
    donutFilterOuterDiameter: defaultSettings.donutFilterOuterDiameter,
    donutFilterLength: defaultSettings.donutFilterLength,
    donutFilterHoleDiameter: defaultSettings.donutFilterHoleDiameter,
    donutAdapterInsertLength: defaultSettings.donutAdapterInsertLength,
    donutCapRim: defaultSettings.donutCapRim,
    donutCapEnabled: defaultSettings.donutCapEnabled,
    screwHoleDiameter: input.cutting.screwHoleDiameter,
    materialThickness: input.cutting.materialThickness,
    kerfFit: input.cutting.kerfFit,
    showFilterMedia: input.preview.showFilterMedia,
    showFans: input.preview.showFans,
    showFilterFrame: input.preview.showFilterFrame,
    transparentWalls: input.preview.transparentWalls,
    explodedView: input.preview.explodedView,
    showDimensions: input.preview.showDimensions,
    autoRotate: input.preview.autoRotate,
    cameraPreset: input.preview.cameraPreset,
    labels: input.cutting.labels,
    referenceScale: input.cutting.referenceScale.type === "enabled" ? input.cutting.referenceScale.length : 0,
  };
}

export function findPrintDesignPreset(id: PrintDesignId | string | null): PrintDesignPreset {
  return printDesignPresets.find((preset) => preset.id === id) ?? requiredPrintDesignPreset(defaultPrintDesignId);
}

export function isCorsiRosenthalPrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).corsiFrameStyle !== undefined;
}

export function isDonutFilterPrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).donutFilterDefaults !== undefined;
}

function requiredPrintDesignPreset(id: PrintDesignId): PrintDesignPreset {
  const preset = printDesignPresets.find((entry) => entry.id === id);
  if (preset === undefined) {
    throw new Error(`requiredPrintDesignPreset: Missing print design ${id}`);
  }
  return preset;
}

function requiredDonutFilterDefaults(preset: PrintDesignPreset): DonutFilterSettings {
  if (preset.donutFilterDefaults === undefined) {
    throw new Error(`requiredDonutFilterDefaults: ${preset.id} is not a donut-filter design`);
  }
  return preset.donutFilterDefaults;
}

export function findFilterPreset(id: FilterPresetId): FilterPreset {
  return filterPresets.find((preset) => preset.id === id) ?? filterPresets[0];
}

export function findDonutFilterPreset(id: DonutFilterPresetId | string | null): DonutFilterPreset {
  return donutFilterPresets.find((preset) => preset.id === id) ?? findPresetDonutFilter(defaultDonutFilterPresetId);
}

export function findPresetDonutFilter(id: PresetDonutFilterId): PresetDonutFilter {
  const preset = donutFilterPresets.find((entry): entry is PresetDonutFilter => entry.id === id && isPresetDonutFilterId(entry.id));
  if (preset === undefined) {
    throw new Error(`findPresetDonutFilter: Missing preset round filter ${id}`);
  }
  return preset;
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

export function applyDonutFilterPreset(settings: RawPurifierSettings, presetId: DonutFilterPresetId): RawPurifierSettings {
  const preset = findDonutFilterPreset(presetId);
  if (preset.id === customDonutFilterPresetId) {
    return {
      ...settings,
      donutFilterPreset: customDonutFilterPresetId,
    };
  }

  return {
    ...settings,
    donutFilterPreset: preset.id,
    donutFilterOuterDiameter: preset.settings.outerDiameter,
    donutFilterLength: preset.settings.length,
    donutFilterHoleDiameter: preset.settings.holeDiameter,
    donutAdapterInsertLength: preset.settings.insertLength,
    donutCapRim: preset.settings.capRim,
    donutCapEnabled: preset.settings.capEnabled,
  };
}

export function applyPrintDesignPreset(settings: RawPurifierSettings, presetId: PrintDesignId): RawPurifierSettings {
  const preset = findPrintDesignPreset(presetId);
  const filterPreset = findFilterPreset(preset.recommendedFilterPreset);
  const fanPreset = findFanProductPreset(preset.recommendedFanPreset);
  const base = {
    ...settings,
    printDesign: preset.id,
    filters: preset.recommendedFilterCount,
    fanPreset: fanPreset.id,
    fanDiameter: fanPreset.diameter,
  };

  const withRecommendedFilter =
    filterPreset.id === customFilterPresetId
      ? base
      : {
          ...base,
          filterPreset: filterPreset.id,
          filterWidth: filterPreset.dimensions.width,
          filterDepth: filterPreset.dimensions.depth,
          filterThickness: filterPreset.dimensions.thickness,
        };

  if (isCorsiRosenthalPrintDesignId(preset.id)) {
    return {
      ...withRecommendedFilter,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      corsiMode: preset.recommendedCorsiMode ?? defaultSettings.corsiMode,
      corsiFilterCount: preset.recommendedCorsiFilterCount ?? defaultCorsiRosenthalFilterCount(defaultSettings.corsiMode),
      corsiFanCount: preset.recommendedFanCount,
      splitFrames: true,
      rim: 24,
      materialThickness: 4,
      screwHoleDiameter: 4.5,
    };
  }

  if (isDonutFilterPrintDesignId(preset.id)) {
    const donutPreset = findDonutFilterPreset(preset.recommendedDonutFilterPreset ?? defaultDonutFilterPresetId);
    const donutFilter = donutPreset.id === customDonutFilterPresetId ? requiredDonutFilterDefaults(preset) : donutPreset.settings;
    return {
      ...withRecommendedFilter,
      filterPreset: customFilterPresetId,
      filterWidth: donutFilter.outerDiameter,
      filterDepth: donutFilter.length,
      filterThickness: donutFilter.holeDiameter,
      filters: 1,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      corsiMode: defaultSettings.corsiMode,
      corsiFilterCount: defaultSettings.corsiFilterCount,
      corsiFanCount: defaultSettings.corsiFanCount,
      donutFilterPreset: donutPreset.id,
      donutFilterOuterDiameter: donutFilter.outerDiameter,
      donutFilterLength: donutFilter.length,
      donutFilterHoleDiameter: donutFilter.holeDiameter,
      donutAdapterInsertLength: donutFilter.insertLength,
      donutCapRim: donutFilter.capRim,
      donutCapEnabled: donutFilter.capEnabled,
      splitFrames: false,
      rim: defaultSettings.rim,
      materialThickness: 1.5,
      screwHoleDiameter: 5,
    };
  }

  return {
    ...withRecommendedFilter,
    fansLeft: preset.recommendedFanCount,
    fansRight: preset.recommendedFanCount,
    fansTop: 0,
    fansBottom: 0,
    corsiMode: defaultSettings.corsiMode,
    corsiFilterCount: defaultSettings.corsiFilterCount,
    corsiFanCount: preset.recommendedFanCount > 0 ? preset.recommendedFanCount : defaultSettings.corsiFanCount,
    donutFilterPreset: defaultSettings.donutFilterPreset,
    donutFilterOuterDiameter: defaultSettings.donutFilterOuterDiameter,
    donutFilterLength: defaultSettings.donutFilterLength,
    donutFilterHoleDiameter: defaultSettings.donutFilterHoleDiameter,
    donutAdapterInsertLength: defaultSettings.donutAdapterInsertLength,
    donutCapRim: defaultSettings.donutCapRim,
    donutCapEnabled: defaultSettings.donutCapEnabled,
    rim: defaultSettings.rim,
    materialThickness: defaultSettings.materialThickness,
    screwHoleDiameter: defaultSettings.screwHoleDiameter,
  };
}

export function resolveCorsiRosenthalFanCount(layout: LayoutResult): number {
  if (!isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
    throw new Error("resolveCorsiRosenthalFanCount: Layout is not using the Corsi-Rosenthal print design");
  }
  const mode = canonicalCorsiRosenthalMode(layout.rawSettings.corsiMode);
  const fanCount = canonicalCorsiFanCount(layout.rawSettings.corsiFanCount, layout.configuration.printDesign.id, mode);
  return fanCount === automaticFanCount ? resolveAutomaticCorsiFanCount(layout, mode) : fanCount;
}

export function resolveCorsiRosenthalLayout(layout: LayoutResult): CorsiRosenthalLayoutSettings {
  if (!isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
    throw new Error("resolveCorsiRosenthalLayout: Layout is not using the Corsi-Rosenthal print design");
  }
  const mode = canonicalCorsiRosenthalMode(layout.rawSettings.corsiMode);
  return {
    mode,
    filterCount: canonicalCorsiFilterCount(layout.rawSettings.corsiFilterCount, mode),
    fanCount: resolveCorsiRosenthalFanCount(layout),
  };
}

export function defaultCorsiRosenthalFilterCount(mode: CorsiRosenthalMode): number {
  return corsiRosenthalFilterCountRange(mode).defaultCount;
}

export function corsiRosenthalFilterCountRange(mode: CorsiRosenthalMode): CorsiRosenthalFilterCountRange {
  if (mode === "side-exhaust") {
    return {
      defaultCount: 3,
      min: 1,
      max: 4,
    };
  }
  return {
    defaultCount: 4,
    min: 1,
    max: 5,
  };
}

export function corsiRosenthalFanCountOptions(mode: CorsiRosenthalMode): readonly number[] {
  return [automaticFanCount, ...corsiRosenthalFixedFanCountOptions(mode)];
}

export function corsiRosenthalFixedFanCountOptions(mode: CorsiRosenthalMode): readonly number[] {
  return mode === "side-exhaust" ? corsiRosenthalSideFanCountOptions : corsiRosenthalTopFanCountOptions;
}

export function corsiFanGridColumns(fanCount: number): number {
  if (fanCount <= 2) {
    return Math.max(1, fanCount);
  }
  if (fanCount === 3 || fanCount === 6) {
    return 3;
  }
  if (fanCount === 4) {
    return 2;
  }
  if (fanCount === 8) {
    return 4;
  }
  return Math.min(3, fanCount);
}

export function createLayout(input: PurifierInput): LayoutResult {
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

export function encodeSettings(input: PurifierInput): string {
  const settings = toRawSettings(input);
  const params = new URLSearchParams();
  params.set("printDesign", settings.printDesign);
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
  params.set("corsiMode", settings.corsiMode);
  params.set("corsiFilterCount", String(settings.corsiFilterCount));
  params.set("corsiFanCount", String(settings.corsiFanCount));
  params.set("donutFilterPreset", settings.donutFilterPreset);
  params.set("donutFilterOuterDiameter", formatNumber(settings.donutFilterOuterDiameter));
  params.set("donutFilterLength", formatNumber(settings.donutFilterLength));
  params.set("donutFilterHoleDiameter", formatNumber(settings.donutFilterHoleDiameter));
  params.set("donutAdapterInsertLength", formatNumber(settings.donutAdapterInsertLength));
  params.set("donutCapRim", formatNumber(settings.donutCapRim));
  params.set("donutCapEnabled", String(settings.donutCapEnabled));
  params.set("screwHoleDiameter", formatNumber(settings.screwHoleDiameter));
  params.set("materialThickness", formatNumber(settings.materialThickness));
  params.set("kerfFit", formatNumber(settings.kerfFit));
  params.set("showFilterMedia", String(settings.showFilterMedia));
  params.set("showFans", String(settings.showFans));
  params.set("showFilterFrame", String(settings.showFilterFrame));
  params.set("transparentWalls", String(settings.transparentWalls));
  params.set("explodedView", String(settings.explodedView));
  params.set("showDimensions", String(settings.showDimensions));
  params.set("autoRotate", String(settings.autoRotate));
  params.set("cameraPreset", settings.cameraPreset);
  params.set("labels", String(settings.labels));
  params.set("referenceScale", formatNumber(settings.referenceScale));
  return params.toString();
}

export function decodeSettings(search: string): RawPurifierSettings {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const printDesign = readPrintDesign(params);
  const filterPreset = readFilterPreset(params);
  const fanDiameter = readFanDiameter(params, "fanDiameter", defaultSettings.fanDiameter);
  const fanPreset = readFanProductPreset(params, fanDiameter);
  const corsiMode = readCorsiRosenthalMode(params);
  const parsed: RawPurifierSettings = {
    ...defaultSettings,
    printDesign,
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
    corsiMode,
    corsiFilterCount: readCorsiFilterCount(params, corsiMode),
    corsiFanCount: readCorsiFanCount(params, printDesign),
    donutFilterPreset: readDonutFilterPreset(params),
    donutFilterOuterDiameter: readNumber(params, "donutFilterOuterDiameter", defaultSettings.donutFilterOuterDiameter),
    donutFilterLength: readNumber(params, "donutFilterLength", defaultSettings.donutFilterLength),
    donutFilterHoleDiameter: readNumber(params, "donutFilterHoleDiameter", defaultSettings.donutFilterHoleDiameter),
    donutAdapterInsertLength: readNumber(params, "donutAdapterInsertLength", defaultSettings.donutAdapterInsertLength),
    donutCapRim: readNumber(params, "donutCapRim", defaultSettings.donutCapRim),
    donutCapEnabled: readBoolean(params, "donutCapEnabled", defaultSettings.donutCapEnabled),
    screwHoleDiameter: readNumber(params, "screwHoleDiameter", defaultSettings.screwHoleDiameter),
    materialThickness: readNumber(params, "materialThickness", defaultSettings.materialThickness),
    kerfFit: readNumber(params, "kerfFit", defaultSettings.kerfFit),
    showFilterMedia: readBoolean(params, "showFilterMedia", defaultSettings.showFilterMedia),
    showFans: readBoolean(params, "showFans", defaultSettings.showFans),
    showFilterFrame: readBoolean(params, "showFilterFrame", defaultSettings.showFilterFrame),
    transparentWalls: readBoolean(params, "transparentWalls", defaultSettings.transparentWalls),
    explodedView: readBoolean(params, "explodedView", defaultSettings.explodedView),
    showDimensions: readBoolean(params, "showDimensions", defaultSettings.showDimensions),
    autoRotate: readBoolean(params, "autoRotate", defaultSettings.autoRotate),
    cameraPreset: readCameraPreset(params, "cameraPreset", defaultSettings.cameraPreset),
    labels: readBoolean(params, "labels", defaultSettings.labels),
    referenceScale: readNumber(params, "referenceScale", defaultSettings.referenceScale),
  };
  const parsedWithDonutPreset =
    params.has("donutFilterPreset") && !hasDonutFilterMeasurementParams(params)
      ? applyDonutFilterPreset(parsed, parsed.donutFilterPreset)
      : parsed;
  return normalizeRawSettings(applyPrintDesignUrlDefaults(params, parsedWithDonutPreset, printDesign));
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

function normalizeDonutFilterSettings(settings: RawPurifierSettings): DonutFilterSettings {
  const outerDiameter = clamp(settings.donutFilterOuterDiameter, 70, 420);
  const length = clamp(settings.donutFilterLength, 35, 520);
  const holeDiameter = clamp(settings.donutFilterHoleDiameter, 18, Math.max(20, outerDiameter - 8));
  return {
    outerDiameter,
    length,
    holeDiameter,
    insertLength: clamp(settings.donutAdapterInsertLength, 2, 60),
    capRim: clamp(settings.donutCapRim, 0, 40),
    capEnabled: settings.donutCapEnabled,
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

function canonicalizePrintDesignRawSettings(settings: RawPurifierSettings): RawPurifierSettings {
  if (!isCorsiRosenthalPrintDesignId(settings.printDesign)) {
    return settings;
  }
  const corsiMode = canonicalCorsiRosenthalMode(settings.corsiMode);
  return {
    ...settings,
    fansLeft: 0,
    fansRight: 0,
    fansTop: 0,
    fansBottom: 0,
    corsiMode,
    corsiFilterCount: canonicalCorsiFilterCount(settings.corsiFilterCount, corsiMode),
    corsiFanCount: canonicalCorsiFanCount(settings.corsiFanCount, settings.printDesign, corsiMode),
  };
}

function canonicalCorsiRosenthalMode(value: CorsiRosenthalMode | string | null | undefined): CorsiRosenthalMode {
  const found = corsiRosenthalModes.find((mode) => mode === value);
  return found ?? defaultSettings.corsiMode;
}

function canonicalCorsiFilterCount(value: number, mode: CorsiRosenthalMode): number {
  const range = corsiRosenthalFilterCountRange(mode);
  const parsed = Number.isFinite(value) && value > 0 ? value : range.defaultCount;
  return clampInteger(parsed, range.min, range.max);
}

function canonicalCorsiFanCount(value: number, printDesign: PrintDesignId, mode: CorsiRosenthalMode): number {
  if (value === automaticFanCount) {
    return automaticFanCount;
  }
  if (!isCorsiRosenthalPrintDesignId(printDesign)) {
    return defaultSettings.corsiFanCount;
  }

  const fallback = findPrintDesignPreset(printDesign).recommendedFanCount;
  const parsed = Number.isFinite(value) ? Math.trunc(value) : fallback;
  if (parsed === automaticFanCount) {
    return automaticFanCount;
  }

  const allowedCounts = corsiRosenthalFixedFanCountOptions(mode);
  return allowedCounts.includes(parsed) ? parsed : automaticFanCount;
}

function resolveAutomaticCorsiFanCount(layout: LayoutResult, mode: CorsiRosenthalMode): number {
  const candidates = mode === "side-exhaust" ? [6, 4, 2] : [8, 6, 4, 3, 2, 1];
  const filterDimensions = filterSelectionDimensions(layout.configuration.filter);
  const fanDiameter = layout.configuration.fan.spec.diameter;
  const availableWidth = filterDimensions.width + 2 * corsiAutoRailDepth();
  const availableDepth = filterDimensions.depth + 2 * corsiAutoRailDepth();
  const fitSlack = 8;

  for (const candidate of candidates) {
    const panelFanCount = mode === "side-exhaust" ? candidate / 2 : candidate;
    const size = corsiFanGridFootprint(panelFanCount, fanDiameter);
    if (size.width <= availableWidth + fitSlack && size.depth <= availableDepth + fitSlack) {
      return candidate;
    }
  }

  return mode === "side-exhaust" ? 2 : 1;
}

function corsiFanGridFootprint(fanCount: number, fanDiameter: number): { readonly width: number; readonly depth: number } {
  const columns = corsiFanGridColumns(fanCount);
  const rows = Math.ceil(fanCount / columns);
  const fanCell = fanDiameter * 1.18;
  const gap = 12;
  return {
    width: columns * fanCell + Math.max(0, columns - 1) * gap + corsiAutoRailDepth() * 1.4,
    depth: rows * fanCell + Math.max(0, rows - 1) * gap + corsiAutoRailDepth() * 2,
  };
}

function corsiAutoRailDepth(): number {
  return 32;
}

function isPresetFilterId(id: FilterPresetId): id is PresetFilterId {
  return id !== customFilterPresetId;
}

function isPresetDonutFilterId(id: DonutFilterPresetId): id is PresetDonutFilterId {
  return id !== customDonutFilterPresetId;
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

function readDonutFilterPreset(params: URLSearchParams): DonutFilterPresetId {
  const value = params.get("donutFilterPreset");
  const found = donutFilterPresetIds.find((preset) => preset === value);
  if (found !== undefined) {
    return found;
  }
  if (hasDonutFilterMeasurementParams(params)) {
    return customDonutFilterPresetId;
  }
  return defaultSettings.donutFilterPreset;
}

function hasDonutFilterMeasurementParams(params: URLSearchParams): boolean {
  return (
    params.has("donutFilterOuterDiameter") ||
    params.has("donutFilterLength") ||
    params.has("donutFilterHoleDiameter") ||
    params.has("donutAdapterInsertLength") ||
    params.has("donutCapRim") ||
    params.has("donutCapEnabled")
  );
}

function readFilterCount(params: URLSearchParams, key: string, fallback: FilterCount): FilterCount {
  const parsed = Number(params.get(key));
  return parsed === 1 || parsed === 2 ? parsed : fallback;
}

function readCorsiRosenthalMode(params: URLSearchParams): CorsiRosenthalMode {
  return canonicalCorsiRosenthalMode(params.get("corsiMode"));
}

function readCorsiFilterCount(params: URLSearchParams, mode: CorsiRosenthalMode): number {
  if (params.has("corsiFilterCount")) {
    return readInteger(params, "corsiFilterCount", defaultCorsiRosenthalFilterCount(mode));
  }
  return defaultCorsiRosenthalFilterCount(mode);
}

function readCorsiFanCount(params: URLSearchParams, printDesign: PrintDesignId): number {
  const recommended = findPrintDesignPreset(printDesign).recommendedFanCount;
  if (params.has("corsiFanCount")) {
    return readAutomaticInteger(params, "corsiFanCount", recommended);
  }
  if (isCorsiRosenthalPrintDesignId(printDesign) && params.has("fansLeft")) {
    return readInteger(params, "fansLeft", recommended);
  }
  return defaultSettings.corsiFanCount;
}

function applyPrintDesignUrlDefaults(
  params: URLSearchParams,
  parsed: RawPurifierSettings,
  printDesign: PrintDesignId,
): RawPurifierSettings {
  if (!params.has("printDesign")) {
    return parsed;
  }

  const defaults = applyPrintDesignPreset(defaultSettings, printDesign);
  const hasFilterInputs =
    params.has("filterPreset") || params.has("filterWidth") || params.has("filterDepth") || params.has("filterThickness");
  const hasFanInputs = params.has("fanPreset") || params.has("fanDiameter");
  const hasDonutFilterInputs = params.has("donutFilterPreset") || hasDonutFilterMeasurementParams(params);
  const hasLegacyCorsiFanCount = isCorsiRosenthalPrintDesignId(printDesign) && params.has("fansLeft");

  return {
    ...parsed,
    filterPreset: hasFilterInputs ? parsed.filterPreset : defaults.filterPreset,
    filterWidth: hasFilterInputs ? parsed.filterWidth : defaults.filterWidth,
    filterDepth: hasFilterInputs ? parsed.filterDepth : defaults.filterDepth,
    filterThickness: hasFilterInputs ? parsed.filterThickness : defaults.filterThickness,
    fanPreset: hasFanInputs ? parsed.fanPreset : defaults.fanPreset,
    fanDiameter: hasFanInputs ? parsed.fanDiameter : defaults.fanDiameter,
    filters: params.has("filters") ? parsed.filters : defaults.filters,
    splitFrames: params.has("splitFrames") ? parsed.splitFrames : defaults.splitFrames,
    fansLeft: params.has("fansLeft") ? parsed.fansLeft : defaults.fansLeft,
    fansRight: params.has("fansRight") ? parsed.fansRight : defaults.fansRight,
    fansTop: params.has("fansTop") ? parsed.fansTop : defaults.fansTop,
    fansBottom: params.has("fansBottom") ? parsed.fansBottom : defaults.fansBottom,
    corsiMode: params.has("corsiMode") ? parsed.corsiMode : defaults.corsiMode,
    corsiFilterCount: params.has("corsiFilterCount") ? parsed.corsiFilterCount : defaults.corsiFilterCount,
    corsiFanCount: params.has("corsiFanCount") || hasLegacyCorsiFanCount ? parsed.corsiFanCount : defaults.corsiFanCount,
    donutFilterPreset: hasDonutFilterInputs ? parsed.donutFilterPreset : defaults.donutFilterPreset,
    donutFilterOuterDiameter: hasDonutFilterInputs || params.has("donutFilterOuterDiameter")
      ? parsed.donutFilterOuterDiameter
      : defaults.donutFilterOuterDiameter,
    donutFilterLength: hasDonutFilterInputs || params.has("donutFilterLength") ? parsed.donutFilterLength : defaults.donutFilterLength,
    donutFilterHoleDiameter: hasDonutFilterInputs || params.has("donutFilterHoleDiameter")
      ? parsed.donutFilterHoleDiameter
      : defaults.donutFilterHoleDiameter,
    donutAdapterInsertLength: hasDonutFilterInputs || params.has("donutAdapterInsertLength")
      ? parsed.donutAdapterInsertLength
      : defaults.donutAdapterInsertLength,
    donutCapRim: hasDonutFilterInputs || params.has("donutCapRim") ? parsed.donutCapRim : defaults.donutCapRim,
    donutCapEnabled: hasDonutFilterInputs || params.has("donutCapEnabled") ? parsed.donutCapEnabled : defaults.donutCapEnabled,
    rim: params.has("rim") ? parsed.rim : defaults.rim,
    materialThickness: params.has("materialThickness") ? parsed.materialThickness : defaults.materialThickness,
    screwHoleDiameter: params.has("screwHoleDiameter") ? parsed.screwHoleDiameter : defaults.screwHoleDiameter,
  };
}

function readAutomaticInteger(params: URLSearchParams, key: string, fallback: number): number {
  return params.get(key) === "auto" ? automaticFanCount : readInteger(params, key, fallback);
}

function readCameraPreset(params: URLSearchParams, key: string, fallback: CameraPreset): CameraPreset {
  const value = params.get(key);
  const found = cameraPresets.find((preset) => preset === value);
  return found ?? fallback;
}

function readPrintDesign(params: URLSearchParams): PrintDesignId {
  const value = params.get("printDesign");
  if (value === "modular-corsi-rosenthal") {
    return "corsi-rosenthal";
  }
  const found = printDesignIds.find((design) => design === value);
  return found ?? defaultSettings.printDesign;
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
