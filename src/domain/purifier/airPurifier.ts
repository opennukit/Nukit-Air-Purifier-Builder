import { clampRimForGeometry } from "@/domain/purifier/geometry";
import { corsiRosenthalGeometry } from "@/domain/designs/corsi-rosenthal/geometry";
import type { Millimeters } from "@/domain/units";
import {
  customFilterPresetId,
  filterPresetIds,
  filterSelectionDimensions,
  findFilterPreset,
  findPresetFilter,
  isPresetFilterId,
  type FilterDimensions,
  type FilterPresetId,
  type FilterSelection,
} from "@/domain/purifier/filter";
import {
  defaultCutJointSettings,
  type CutJointSettings,
  type ReferenceScale,
} from "@/fabrication/laser/cutSettings";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import {
  staticPrintReferenceIds,
  staticPrintReferenceHasPlatePreview,
  staticPrintReferences,
  type StaticPrintReferenceCapabilities,
  type StaticPrintReference,
} from "@/resources/static-print-references/references";

// #######################################
// Product Vocabulary
// #######################################

// ##############################
// Fan Dimensions
// ##############################

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

// ##############################
// Design Identifiers
// ##############################

export type FilterCount = 1 | 2;

export const printDesignIds = [
  "nukit-open-air",
  "nukit-tempest",
  "corsi-rosenthal",
  "donut-hepa-adapter",
  ...staticPrintReferenceIds,
] as const;

export type PrintDesignId = (typeof printDesignIds)[number];

export const corsiRosenthalModes = ["top-exhaust", "side-exhaust"] as const;

export type CorsiRosenthalMode = (typeof corsiRosenthalModes)[number];

// ##############################
// Corsi-Rosenthal Types
// ##############################

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

export type CorsiRosenthalConfiguration = {
  readonly mode: CorsiRosenthalMode;
  readonly filterCount: number;
  readonly fanCount: FanCountRequest;
};

type CorsiFanGridFitFootprint = {
  readonly mode: CorsiRosenthalMode;
  readonly fanCount: number;
  readonly panelFanCount: number;
  readonly requiredWidth: Millimeters;
  readonly requiredDepth: Millimeters;
  readonly availableWidth: Millimeters;
  readonly availableDepth: Millimeters;
};

export type CorsiFanGridFit =
  | {
      readonly type: "invalid";
      readonly mode: CorsiRosenthalMode;
      readonly fanCount: number;
      readonly reason: CorsiFanGridFitInvalidReason;
    }
  | ({ readonly type: "fits" } & CorsiFanGridFitFootprint)
  | ({ readonly type: "does-not-fit" } & CorsiFanGridFitFootprint);

export type CorsiFanGridFitInvalidReason =
  | "fan-count-not-finite"
  | "fan-count-not-positive"
  | "fan-count-not-integer"
  | "side-exhaust-requires-even-fan-count";

// ##############################
// Donut Filter Types
// ##############################

export type DonutFilterSettings = {
  readonly outerDiameter: Millimeters;
  readonly length: Millimeters;
  readonly holeDiameter: Millimeters;
  readonly insertLength: Millimeters;
  readonly cap: DonutCap;
};

export type DonutCap =
  | {
      readonly type: "none";
    }
  | {
      readonly type: "printed-cap";
      readonly rim: Millimeters;
    };

export const donutFilterPresetIds = [
  "silentnight-92-reference",
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

// ##############################
// Preview and Fan Count Types
// ##############################

export const cameraPresets = ["official", "front", "side", "top"] as const;

export type CameraPreset = (typeof cameraPresets)[number];

export const fixedFanCountOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export const automaticFanCount = -1;

const corsiRosenthalTopFanCountOptions = [1, 2, 3, 4, 6, 8] as const;
const corsiRosenthalSideFanCountOptions = [2, 4, 6, 8] as const;

export type FixedFanCount = (typeof fixedFanCountOptions)[number];

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

export type ReleaseVisibility = "public" | "internal";

// ##############################
// Print Design Preset Types
// ##############################

export type PrintDesignPresetBase = {
  readonly id: PrintDesignId;
  readonly label: string;
  readonly detail: string;
  readonly source: string;
  readonly sourceUrl?: string;
  readonly license: string;
  readonly licenseUrl?: string;
  readonly releaseVisibility: ReleaseVisibility;
  readonly assemblyNotes: readonly string[];
};

export type PrintDesignImplementation =
  | {
      readonly type: "laser-derived-printable-kit";
      readonly defaults: LaserDerivedPrintDesignDefaults;
    }
  | {
      readonly type: "corsi-rosenthal";
      readonly frameStyle: CorsiRosenthalFrameStyle;
      readonly defaults: CorsiRosenthalPrintDesignDefaults;
    }
  | {
      readonly type: "donut-filter-adapter";
      readonly defaults: DonutFilterAdapterPrintDesignDefaults;
    }
  | {
      readonly type: "tempest";
      readonly defaults: TempestPrintDesignDefaults;
    }
  | {
      readonly type: "static-reference";
      readonly reference: StaticPrintReference;
      readonly defaults: StaticReferencePrintDesignDefaults;
    };

export type LaserDerivedPrintDesignPreset = PrintDesignPresetBase & {
  readonly implementation: Extract<PrintDesignImplementation, { readonly type: "laser-derived-printable-kit" }>;
};

export type CorsiRosenthalPrintDesignPreset = PrintDesignPresetBase & {
  readonly implementation: Extract<PrintDesignImplementation, { readonly type: "corsi-rosenthal" }>;
};

export type DonutFilterAdapterPrintDesignPreset = PrintDesignPresetBase & {
  readonly implementation: Extract<PrintDesignImplementation, { readonly type: "donut-filter-adapter" }>;
};

export type TempestPrintDesignPreset = PrintDesignPresetBase & {
  readonly implementation: Extract<PrintDesignImplementation, { readonly type: "tempest" }>;
};

export type StaticReferencePrintDesignPreset = PrintDesignPresetBase & {
  readonly implementation: Extract<PrintDesignImplementation, { readonly type: "static-reference" }>;
};

export type PrintDesignPreset =
  | LaserDerivedPrintDesignPreset
  | CorsiRosenthalPrintDesignPreset
  | DonutFilterAdapterPrintDesignPreset
  | TempestPrintDesignPreset
  | StaticReferencePrintDesignPreset;

export type CommonPrintDesignDefaults = {
  readonly filterPreset: FilterPresetId;
  readonly fanPreset: FanProductPresetId;
};

export type LaserDerivedPrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly filterCount: FilterCount;
  readonly fanBanks: FanBanks<FanCountRequest>;
  readonly splitFrames: boolean;
};

export type CorsiRosenthalPrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly mode: CorsiRosenthalMode;
  readonly filterCount: number;
  readonly fanCount: FanCountRequest;
  readonly splitFrames: boolean;
  readonly rim: Millimeters;
  readonly materialThickness: Millimeters;
  readonly screwHoleDiameter: Millimeters;
};

export type DonutFilterAdapterPrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly donutFilterPreset: PresetDonutFilterId;
  readonly filter: DonutFilterSettings;
  readonly fanCount: FixedFanCount;
  readonly splitFrames: boolean;
  readonly materialThickness: Millimeters;
  readonly screwHoleDiameter: Millimeters;
};

export const tempestArrangementPresets = [
  "single-horizontal-top-filter",
  "dual-horizontal-sandwich",
  "four-side-filter-tower",
] as const;

export type TempestArrangementPreset = (typeof tempestArrangementPresets)[number];

const defaultFilterPresetByTempestArrangement = {
  "single-horizontal-top-filter": "merv13-20x20x2",
  "dual-horizontal-sandwich": "merv13-20x20x2",
  "four-side-filter-tower": "air-fanta-compatible",
} satisfies Record<TempestArrangementPreset, FilterPresetId>;

export type TempestPrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly arrangement: TempestArrangementPreset;
  readonly materialThickness: Millimeters;
  readonly screwHoleDiameter: Millimeters;
  readonly rim: Millimeters;
};

export type StaticReferencePrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly filterCount: FilterCount;
  readonly fanCount: number;
  readonly splitFrames: boolean;
};

// ##############################
// Fan Product Types
// ##############################

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
  readonly previewCadModel?: FanPreviewCadModel;
};

export type FanPreviewCadModel =
  | {
      readonly type: "noctua-nf-a14-public-cad";
      readonly sourceUrl: "https://www.noctua.at/en/3d-cad-models";
      readonly assetUrl: "/vendor/fan-preview/noctua/nf-a14-public-cad-preview.json";
      readonly usage: "preview-only";
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

// #######################################
// Fan Product Presets
// #######################################

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
      previewCadModel: {
        type: "noctua-nf-a14-public-cad",
        sourceUrl: "https://www.noctua.at/en/3d-cad-models",
        assetUrl: "/vendor/fan-preview/noctua/nf-a14-public-cad-preview.json",
        usage: "preview-only",
      },
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

export type SingleFanConfiguration = {
  spec: FanSpec;
  productSelection: FanProductSelection;
  count: FixedFanCount;
};

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
      readonly type: "corsi-rosenthal";
      readonly mode: CorsiRosenthalMode;
      readonly filterCount: number;
      readonly fanCount: number;
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
  readonly showPrintSeams: boolean;
  readonly showPreviewEdges: boolean;
  readonly materialColor: PreviewMaterialColorId;
  readonly autoRotate: boolean;
  readonly cameraPreset: CameraPreset;
};

export const previewMaterialColorPresets = [
  { id: "matte-gray", label: "Gray", color: 0x82858a },
  { id: "matte-black", label: "Black", color: 0x111817 },
  { id: "warm-white", label: "White", color: 0xf3f0e6 },
  { id: "natural-tan", label: "Tan", color: 0xc7965a },
  { id: "forest-green", label: "Green", color: 0x1f6f56 },
] as const;

export type PreviewMaterialColorPreset = (typeof previewMaterialColorPresets)[number];
export type PreviewMaterialColorId = PreviewMaterialColorPreset["id"];

const defaultPreviewMaterialColorId: PreviewMaterialColorId = "matte-black";

export type CutSheetPreviewOptions = {
  readonly showLabels: boolean;
  readonly referenceScale: ReferenceScale;
};

export const customDonutFilterPresetId: DonutFilterPresetId = "custom";
export const defaultDonutFilterPresetId: PresetDonutFilterId = "silentnight-92-reference";

// #######################################
// Donut Filter Presets
// #######################################

export const donutFilterPresets: readonly DonutFilterPreset[] = [
  {
    id: "silentnight-92-reference",
    label: "Silentnight-style 92 mm cartridge",
    detail: "Compact round HEPA cartridge used by the OpenSCAD reference adapter.",
    source: "OpenSCAD reference dimensions",
    measurementNote: "The reference script uses a 92 mm center hole; measure the cartridge before printing.",
    settings: {
      outerDiameter: 125,
      length: 150,
      holeDiameter: 92,
      insertLength: 10,
      cap: { type: "printed-cap", rim: 10 },
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
      cap: { type: "printed-cap", rim: 10 },
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
      cap: { type: "printed-cap", rim: 12 },
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
      cap: { type: "printed-cap", rim: 12 },
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
      cap: { type: "printed-cap", rim: 10 },
    },
  },
];

export const defaultPrintDesignId: PrintDesignId = "nukit-open-air";
export const defaultThreeDimensionalPrintDesignId: PrintDesignId = "nukit-tempest";

// #######################################
// Print Design Presets
// #######################################

export const printDesignPresets: readonly PrintDesignPreset[] = [
  {
    id: "nukit-open-air",
    label: "Nukit Open Air",
    detail: "3D-printable Nukit enclosure split into bed-sized panels with dovetail lap keys for glued seams.",
    source: "FilterBoxBuilder browser generator",
    license: "Generated from this project",
    releaseVisibility: "public",
    implementation: {
      type: "laser-derived-printable-kit",
      defaults: {
        filterPreset: "merv13-20x25x1",
        fanPreset: defaultFanProductPresetId,
        filterCount: 2,
        fanBanks: {
          left: { type: "auto" },
          right: { type: "auto" },
          top: { type: "fixed", count: 0 },
          bottom: { type: "fixed", count: 0 },
        },
        splitFrames: true,
      },
    },
    assemblyNotes: [
      "Keeps the proven Nukit airflow layout",
      "Uses screws for fans because screws ship with the fans and do not wear like snap clips",
      "Uses printed dovetail lap keys where panels are split for the printer bed",
    ],
  },
  {
    id: "nukit-tempest",
    label: "Nukit Tempest",
    detail:
      "Parametric Tempest printable housing with selectable 1-filter, 2-filter, and 4-side-filter arrangements.",
    source: "Tempest OpenSCAD reference port",
    license: "Generated from this project",
    releaseVisibility: "public",
    implementation: {
      type: "tempest",
      defaults: {
        arrangement: "dual-horizontal-sandwich",
        filterPreset: "merv13-20x20x2",
        fanPreset: defaultFanProductPresetId,
        materialThickness: 5,
        screwHoleDiameter: 5,
        rim: 30,
      },
    },
    assemblyNotes: [
      "Keeps the Tempest printable housing separate from the laser-derived Nukit panel kit",
      "Supports one top filter, a two-filter sandwich, or four side-loaded filters around a central chamber",
      "Automatically chunks the generated CSG model to the selected printer volume",
    ],
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
    releaseVisibility: "internal",
    implementation: {
      type: "corsi-rosenthal",
      frameStyle: "modular-rail",
      defaults: {
        filterPreset: "ikea-starkvind",
        fanPreset: "arctic-p12-pwm-pst",
        mode: "top-exhaust",
        filterCount: 4,
        fanCount: { type: "auto" },
        splitFrames: true,
        rim: 24,
        materialThickness: 6,
        screwHoleDiameter: 4.5,
      },
    },
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
    source: "Donut HEPA OpenSCAD reference",
    license: "Reference script published in the video description; generated geometry is parametric in this app",
    releaseVisibility: "internal",
    implementation: {
      type: "donut-filter-adapter",
      defaults: {
        filterPreset: "custom",
        fanPreset: "arctic-p12-pwm-pst",
        donutFilterPreset: defaultDonutFilterPresetId,
        fanCount: 1,
        filter: {
          outerDiameter: 125,
          length: 150,
          holeDiameter: 92,
          insertLength: 10,
          cap: { type: "printed-cap", rim: 10 },
        },
        splitFrames: false,
        materialThickness: 1.5,
        screwHoleDiameter: 5,
      },
    },
    assemblyNotes: [
      "Fan adaptor tapers from the square fan flange into the measured filter hole",
      "Back cap is a press-fit plug for filters open at both ends",
      "Fan guard is generated as a separate printable part so a bare fan is not exposed",
    ],
  },
  {
    id: "static-cr-16x20-140",
    label: "Static CR 16x20 140 mm kit",
    detail: "Curated fixed Printables design for 16x20x1 filters and five 140 mm PC fans.",
    source: "Printables static reference",
    sourceUrl: staticPrintReferences["static-cr-16x20-140"].sourceUrl,
    license: "CC-BY",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    releaseVisibility: "internal",
    implementation: {
      type: "static-reference",
      reference: staticPrintReferences["static-cr-16x20-140"],
      defaults: {
        filterPreset: "merv13-16x20x1",
        fanPreset: defaultFanProductPresetId,
        fanCount: 5,
        filterCount: 1,
        splitFrames: false,
      },
    },
    assemblyNotes: [
      "Static curated reference, not generated from the current parameters",
      "Preview shows the mirrored STL file set as print parts",
      "Export opens the original Printables files page for the authoritative download",
    ],
  },
  {
    id: "static-cr-14x20-base",
    label: "Static CR 14x20 reference",
    detail: "Curated fixed Printables design with STEP source for a Corsi-Rosenthal filter housing.",
    source: "Printables static reference",
    sourceUrl: staticPrintReferences["static-cr-14x20-base"].sourceUrl,
    license: "CC-BY",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    releaseVisibility: "public",
    implementation: {
      type: "static-reference",
      reference: staticPrintReferences["static-cr-14x20-base"],
      defaults: {
        filterPreset: "merv13-14x20x1",
        fanPreset: "arctic-p12-pwm-pst",
        fanCount: 4,
        filterCount: 2,
        splitFrames: false,
      },
    },
    assemblyNotes: [
      "Static curated reference, not generated from the current parameters",
      "Assembled preview uses the complete source STL from the Printables project",
      "Print plates show the individual source STL parts laid out on the selected bed",
      "Includes a STEP reference in the original Printables project",
      "Export opens the original Printables files page for the authoritative download",
    ],
  },
  {
    id: "static-modular-20x20-reference",
    label: "Static modular 20x20 reference",
    detail: "External fixed Printables reference for a modular 20x20 air-filter frame.",
    source: "Printables external reference",
    sourceUrl: staticPrintReferences["static-modular-20x20-reference"].sourceUrl,
    license: "CC-BY-NC-SA",
    licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    releaseVisibility: "internal",
    implementation: {
      type: "static-reference",
      reference: staticPrintReferences["static-modular-20x20-reference"],
      defaults: {
        filterPreset: "merv13-20x20x1",
        fanPreset: defaultFanProductPresetId,
        fanCount: 4,
        filterCount: 1,
        splitFrames: false,
      },
    },
    assemblyNotes: [
      "Static external reference, not generated from the current parameters",
      "Not mirrored locally because the license is noncommercial/share-alike",
      "Export opens the original Printables files page",
    ],
  },
];

export const publicPrintDesignPresets: readonly PrintDesignPreset[] = printDesignPresets.filter(isPublicPrintDesignPreset);
export const publicThreeDimensionalPrintDesignPresets: readonly PrintDesignPreset[] = publicPrintDesignPresets.filter(
  isPublicThreeDimensionalPrintDesignPreset,
);

// #######################################
// Public Release Presets
// #######################################

export function isPublicPrintDesignId(id: PrintDesignId): boolean {
  return publicPrintDesignPresets.some((preset) => preset.id === id);
}

export function isPublicThreeDimensionalPrintDesignId(id: PrintDesignId): boolean {
  return publicThreeDimensionalPrintDesignPresets.some((preset) => preset.id === id);
}

function isPublicPrintDesignPreset(preset: PrintDesignPreset): boolean {
  return preset.releaseVisibility === "public";
}

function isPublicThreeDimensionalPrintDesignPreset(preset: PrintDesignPreset): boolean {
  return !isLaserDerivedPrintDesignPreset(preset);
}

function rawFilterCountForPrintDesign(preset: PrintDesignPreset): FilterCount {
  if (isLaserDerivedPrintDesignPreset(preset) || isStaticReferencePrintDesignPreset(preset)) {
    return preset.implementation.defaults.filterCount;
  }
  if (isTempestPrintDesignPreset(preset)) {
    return preset.implementation.defaults.arrangement === "single-horizontal-top-filter" ? 1 : 2;
  }
  if (isDonutFilterAdapterPrintDesignPreset(preset)) {
    return 1;
  }
  return defaultSettings.filters;
}

// #######################################
// Settings Model
// #######################################

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
  tempestArrangement: TempestArrangementPreset;
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
  showPrintSeams: boolean;
  showPreviewEdges: boolean;
  previewMaterialColor: PreviewMaterialColorId;
  autoRotate: boolean;
  cameraPreset: CameraPreset;
  labels: boolean;
  referenceScale: Millimeters;
};

export type PurifierFanDraft = {
  readonly presetId: FanProductPresetId;
  readonly diameter: FanDiameter;
};

export type PurifierCuttingDraft = {
  readonly materialThickness: Millimeters;
  readonly rim: Millimeters;
  readonly screwHoleDiameter: Millimeters;
  readonly kerfFit: Millimeters;
  readonly joints: JointSettings;
};

export type LaserDerivedPrintDesignDraft = {
  readonly type: "laser-derived-printable-kit";
  readonly printDesign: LaserDerivedPrintDesignPreset["id"];
  readonly preset: LaserDerivedPrintDesignPreset;
  readonly filter: FilterSelection;
  readonly filterCount: FilterCount;
  readonly fanBanks: FanBanks<FanCountRequest>;
  readonly frameConstruction: FilterFrameConstruction;
};

export type CorsiRosenthalPrintDesignDraft = {
  readonly type: "corsi-rosenthal";
  readonly printDesign: CorsiRosenthalPrintDesignPreset["id"];
  readonly preset: CorsiRosenthalPrintDesignPreset;
  readonly filter: FilterSelection;
  readonly configuration: CorsiRosenthalConfiguration;
  readonly frameStyle: CorsiRosenthalFrameStyle;
};

export type DonutFilterAdapterPrintDesignDraft = {
  readonly type: "donut-filter-adapter";
  readonly printDesign: DonutFilterAdapterPrintDesignPreset["id"];
  readonly preset: DonutFilterAdapterPrintDesignPreset;
  readonly donutFilterPreset: DonutFilterPresetId;
  readonly filter: DonutFilterSettings;
  readonly fanCount: FixedFanCount;
};

export type TempestPrintDesignDraft = {
  readonly type: "tempest";
  readonly printDesign: TempestPrintDesignPreset["id"];
  readonly preset: TempestPrintDesignPreset;
  readonly arrangement: TempestArrangementPreset;
  readonly filter: FilterSelection;
};

export type StaticReferencePrintDesignDraft = {
  readonly type: "static-reference";
  readonly printDesign: StaticReferencePrintDesignPreset["id"];
  readonly preset: StaticReferencePrintDesignPreset;
  readonly reference: StaticPrintReference;
  readonly capabilities: StaticPrintReferenceCapabilities;
  readonly filter: FilterSelection;
  readonly filterCount: FilterCount;
  readonly fanCount: number;
};

export type PurifierDesignDraft =
  | LaserDerivedPrintDesignDraft
  | CorsiRosenthalPrintDesignDraft
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
      readonly type: "laser-derived-printable-kit";
      readonly preset: LaserDerivedPrintDesignPreset;
      readonly filter: FilterSelection;
      readonly filterCount: FilterCount;
      readonly fanBanks: FanBanks<FanCountRequest>;
      readonly frameConstruction: FilterFrameConstruction;
    }
  | {
      readonly type: "corsi-rosenthal";
      readonly preset: CorsiRosenthalPrintDesignPreset;
      readonly filter: FilterSelection;
      readonly configuration: CorsiRosenthalConfiguration;
      readonly frameStyle: CorsiRosenthalFrameStyle;
    }
  | {
      readonly type: "donut-filter-adapter";
      readonly preset: DonutFilterAdapterPrintDesignPreset;
      readonly donutFilterPreset: DonutFilterPresetId;
      readonly filter: DonutFilterSettings;
      readonly fan: SingleFanConfiguration;
    }
  | {
      readonly type: "tempest";
      readonly preset: TempestPrintDesignPreset;
      readonly arrangement: TempestArrangementPreset;
      readonly filter: FilterSelection;
    }
  | {
      readonly type: "static-reference";
      readonly preset: StaticReferencePrintDesignPreset;
      readonly reference: StaticPrintReference;
      readonly capabilities: StaticPrintReferenceCapabilities;
      readonly filter: FilterSelection;
      readonly filterCount: FilterCount;
      readonly fanCount: number;
    };

export type PurifierSettings = {
  printDesign: PrintDesignPreset;
  design: ConfiguredPrintDesign;
  filter: FilterSelection;
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
      readonly designType: "corsi-rosenthal" | "donut-filter-adapter" | "tempest";
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

export type PurifierInput = RawPurifierSettings | PurifierSettings | PurifierDraft;

// #######################################
// Defaults
// #######################################

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
  tempestArrangement: "dual-horizontal-sandwich",
  donutFilterPreset: defaultDonutFilterPresetId,
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
  fingerHoleOffsetMultiplier: defaultCutJointSettings.finger.holeOffsetMultiplier,
  dovetailSizeMultiplier: defaultCutJointSettings.dovetail.sizeMultiplier,
  dovetailDepthMultiplier: defaultCutJointSettings.dovetail.depthMultiplier,
  dovetailTaper: defaultCutJointSettings.dovetail.taper,
  showFilterMedia: true,
  showFans: true,
  showFilterFrame: true,
  explodedView: false,
  showDimensions: false,
  showBananaScale: false,
  showPrintSeams: false,
  showPreviewEdges: false,
  previewMaterialColor: defaultPreviewMaterialColorId,
  autoRotate: true,
  cameraPreset: "official",
  labels: true,
  referenceScale: 100,
};

// #######################################
// Settings Normalization
// #######################################

// ##############################
// Structured Settings
// ##############################

export function normalizeSettings(input: PurifierInput): PurifierSettings {
  const raw = isStructuredSettings(input) ? toRawSettings(input) : isPurifierDraft(input) ? serializePurifierDraft(input) : input;
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
  const filter = createFilterSelection(preset.id, dimensions);
  const fan: FanConfiguration = {
    spec: fanSpec,
    productSelection: createFanProductSelection(fanProductPreset.id),
    banks: {
      left: fanCountRequestFromRawSetting(raw.fansLeft),
      right: fanCountRequestFromRawSetting(raw.fansRight),
      top: fanCountRequestFromRawSetting(raw.fansTop),
      bottom: fanCountRequestFromRawSetting(raw.fansBottom),
    },
  };
  const frameConstruction: FilterFrameConstruction = raw.splitFrames ? { type: "split-rails" } : { type: "full-panels" };
  const cutting: CuttingSettings = {
    materialThickness,
    rim,
    screwHoleDiameter: clamp(raw.screwHoleDiameter, 2, 10),
    kerfFit: clamp(raw.kerfFit, 0, 1),
    labels: raw.labels,
    referenceScale: referenceScaleFromNumber(raw.referenceScale),
    joints: normalizeJointSettings(raw),
  };

  return {
    printDesign,
    design: createConfiguredPrintDesign({
      raw,
      printDesign,
      filter,
      filterCount,
      fan,
      frameConstruction,
    }),
    filter,
    filterCount,
    fan,
    frameConstruction,
    cutting,
    preview: createPreviewSettings(raw, cutting.referenceScale),
  };
}

// ##############################
// Raw Settings
// ##############################

export function normalizeRawSettings(input: RawPurifierSettings): RawPurifierSettings {
  const normalized = toRawSettings(normalizeSettings(input));
  const corsiMode = canonicalCorsiRosenthalMode(input.corsiMode);
  const tempestArrangement = canonicalTempestArrangement(input.tempestArrangement);
  const donutFilter = normalizeDonutFilterSettings(input);
  const donutCapRim = normalizeDonutCapRim(input, donutFilter.outerDiameter, donutFilter.holeDiameter);
  const donutFilterPreset = findDonutFilterPreset(input.donutFilterPreset);
  return canonicalizePrintDesignRawSettings({
    ...normalized,
    corsiMode,
    corsiFilterCount: canonicalCorsiFilterCount(input.corsiFilterCount, corsiMode),
    corsiFanCount: canonicalCorsiFanCount(input.corsiFanCount, normalized.printDesign, corsiMode),
    tempestArrangement,
    donutFilterPreset: donutFilterPreset.id,
    donutFilterOuterDiameter: donutFilter.outerDiameter,
    donutFilterLength: donutFilter.length,
    donutFilterHoleDiameter: donutFilter.holeDiameter,
    donutAdapterInsertLength: donutFilter.insertLength,
    donutCapRim,
    donutCapEnabled: donutFilter.cap.type === "printed-cap",
  });
}

// ##############################
// Draft Settings
// ##############################

export function normalizePurifierDraft(input: RawPurifierSettings | PurifierDraft): PurifierDraft {
  if (!isPurifierDraft(input)) {
    return createPurifierDraft(input);
  }
  return createPurifierDraft(serializePurifierDraft(input));
}

export function createPurifierDraft(input: RawPurifierSettings | PurifierDraft): PurifierDraft {
  if (isPurifierDraft(input)) {
    return input;
  }

  const raw = normalizeRawSettings(input);
  const configuration = normalizeSettings(raw);
  return {
    design: createPurifierDesignDraft(configuration, raw),
    fan: {
      presetId: findFanProductPreset(raw.fanPreset).id,
      diameter: configuration.fan.spec.diameter,
    },
    cutting: {
      materialThickness: configuration.cutting.materialThickness,
      rim: configuration.cutting.rim,
      screwHoleDiameter: configuration.cutting.screwHoleDiameter,
      kerfFit: configuration.cutting.kerfFit,
      joints: configuration.cutting.joints,
    },
    preview: configuration.preview,
  };
}

export function serializePurifierDraft(draft: PurifierDraft): RawPurifierSettings {
  const base: RawPurifierSettings = {
    ...defaultSettings,
    printDesign: printDesignIdForPurifierDraft(draft),
    fanPreset: draft.fan.presetId,
    fanDiameter: draft.fan.diameter,
    rim: draft.cutting.rim,
    screwHoleDiameter: draft.cutting.screwHoleDiameter,
    materialThickness: draft.cutting.materialThickness,
    kerfFit: draft.cutting.kerfFit,
    fingerWidthMultiplier: draft.cutting.joints.finger.widthMultiplier,
    fingerSpaceMultiplier: draft.cutting.joints.finger.spaceMultiplier,
    fingerPlayMultiplier: draft.cutting.joints.finger.playMultiplier,
    fingerHoleWidthMultiplier: draft.cutting.joints.finger.holeWidthMultiplier,
    fingerHoleOffsetMultiplier: draft.cutting.joints.finger.holeOffsetMultiplier,
    dovetailSizeMultiplier: draft.cutting.joints.dovetail.sizeMultiplier,
    dovetailDepthMultiplier: draft.cutting.joints.dovetail.depthMultiplier,
    dovetailTaper: draft.cutting.joints.dovetail.taper,
    showFilterMedia: draft.preview.enclosure.showFilterMedia,
    showFans: draft.preview.enclosure.showFans,
    showFilterFrame: draft.preview.enclosure.showFilterFrame,
    explodedView: draft.preview.enclosure.explodedView,
    showDimensions: draft.preview.enclosure.showDimensions,
    showBananaScale: draft.preview.enclosure.showBananaScale,
    showPrintSeams: draft.preview.enclosure.showPrintSeams,
    showPreviewEdges: draft.preview.enclosure.showPreviewEdges,
    previewMaterialColor: draft.preview.enclosure.materialColor,
    autoRotate: draft.preview.enclosure.autoRotate,
    cameraPreset: draft.preview.enclosure.cameraPreset,
    labels: draft.preview.cutSheet.showLabels,
    referenceScale: draft.preview.cutSheet.referenceScale.type === "enabled" ? draft.preview.cutSheet.referenceScale.length : 0,
  };

  if (draft.design.type === "laser-derived-printable-kit") {
    return normalizeRawSettings({
      ...base,
      ...serializedFilterFields(draft.design.filter),
      filters: draft.design.filterCount,
      splitFrames: draft.design.frameConstruction.type === "split-rails",
      fansLeft: fanCountRequestToRawSetting(draft.design.fanBanks.left),
      fansRight: fanCountRequestToRawSetting(draft.design.fanBanks.right),
      fansTop: fanCountRequestToRawSetting(draft.design.fanBanks.top),
      fansBottom: fanCountRequestToRawSetting(draft.design.fanBanks.bottom),
    });
  }

  if (draft.design.type === "corsi-rosenthal") {
    return normalizeRawSettings({
      ...base,
      ...serializedFilterFields(draft.design.filter),
      splitFrames: draft.design.preset.implementation.defaults.splitFrames,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      corsiMode: draft.design.configuration.mode,
      corsiFilterCount: draft.design.configuration.filterCount,
      corsiFanCount: fanCountRequestToRawSetting(draft.design.configuration.fanCount),
    });
  }

  if (draft.design.type === "donut-filter-adapter") {
    return normalizeRawSettings({
      ...base,
      filterPreset: customFilterPresetId,
      filterWidth: draft.design.filter.outerDiameter,
      filterDepth: draft.design.filter.length,
      filterThickness: draft.design.filter.holeDiameter,
      filters: 1,
      splitFrames: draft.design.preset.implementation.defaults.splitFrames,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      donutFilterPreset: draft.design.donutFilterPreset,
      donutFilterOuterDiameter: draft.design.filter.outerDiameter,
      donutFilterLength: draft.design.filter.length,
      donutFilterHoleDiameter: draft.design.filter.holeDiameter,
      donutAdapterInsertLength: draft.design.filter.insertLength,
      donutCapRim: donutCapRawRim(draft.design.filter.cap),
      donutCapEnabled: draft.design.filter.cap.type === "printed-cap",
    });
  }

  if (draft.design.type === "tempest") {
    const fanBanks = tempestRawFanBanksForArrangement(draft.design.arrangement);
    return normalizeRawSettings({
      ...base,
      ...serializedFilterFields(draft.design.filter),
      tempestArrangement: draft.design.arrangement,
      filters: draft.design.arrangement === "single-horizontal-top-filter" ? 1 : 2,
      splitFrames: true,
      fansLeft: fanBanks.left,
      fansRight: fanBanks.right,
      fansTop: fanBanks.top,
      fansBottom: fanBanks.bottom,
    });
  }

  return normalizeRawSettings({
    ...base,
    ...serializedFilterFields(draft.design.filter),
    filters: draft.design.filterCount,
    splitFrames: draft.design.preset.implementation.defaults.splitFrames,
    fansLeft: 0,
    fansRight: 0,
    fansTop: draft.design.fanCount,
    fansBottom: 0,
    corsiFanCount: draft.design.fanCount > 0 ? draft.design.fanCount : defaultSettings.corsiFanCount,
  });
}

export function printDesignIdForPurifierDraft(draft: PurifierDraft): PrintDesignId {
  return draft.design.printDesign;
}

// ##############################
// Raw Conversion
// ##############################

function toRawSettings(input: PurifierInput): RawPurifierSettings {
  if (isPurifierDraft(input)) {
    return serializePurifierDraft(input);
  }
  if (!isStructuredSettings(input)) {
    return input;
  }

  const filterDimensions = filterSelectionDimensions(input.filter);
  const base: RawPurifierSettings = {
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
    fansLeft: fanCountRequestToRawSetting(input.fan.banks.left),
    fansRight: fanCountRequestToRawSetting(input.fan.banks.right),
    fansTop: fanCountRequestToRawSetting(input.fan.banks.top),
    fansBottom: fanCountRequestToRawSetting(input.fan.banks.bottom),
    corsiMode: defaultSettings.corsiMode,
    corsiFilterCount: defaultSettings.corsiFilterCount,
    corsiFanCount: defaultSettings.corsiFanCount,
    tempestArrangement: defaultSettings.tempestArrangement,
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
    fingerWidthMultiplier: input.cutting.joints.finger.widthMultiplier,
    fingerSpaceMultiplier: input.cutting.joints.finger.spaceMultiplier,
    fingerPlayMultiplier: input.cutting.joints.finger.playMultiplier,
    fingerHoleWidthMultiplier: input.cutting.joints.finger.holeWidthMultiplier,
    fingerHoleOffsetMultiplier: input.cutting.joints.finger.holeOffsetMultiplier,
    dovetailSizeMultiplier: input.cutting.joints.dovetail.sizeMultiplier,
    dovetailDepthMultiplier: input.cutting.joints.dovetail.depthMultiplier,
    dovetailTaper: input.cutting.joints.dovetail.taper,
    showFilterMedia: input.preview.enclosure.showFilterMedia,
    showFans: input.preview.enclosure.showFans,
    showFilterFrame: input.preview.enclosure.showFilterFrame,
    explodedView: input.preview.enclosure.explodedView,
    showDimensions: input.preview.enclosure.showDimensions,
    showBananaScale: input.preview.enclosure.showBananaScale,
    showPrintSeams: input.preview.enclosure.showPrintSeams,
    showPreviewEdges: input.preview.enclosure.showPreviewEdges,
    previewMaterialColor: input.preview.enclosure.materialColor,
    autoRotate: input.preview.enclosure.autoRotate,
    cameraPreset: input.preview.enclosure.cameraPreset,
    labels: input.preview.cutSheet.showLabels,
    referenceScale: input.preview.cutSheet.referenceScale.type === "enabled" ? input.preview.cutSheet.referenceScale.length : 0,
  };

  if (input.design.type === "laser-derived-printable-kit") {
    return {
      ...base,
      filters: input.design.filterCount,
      splitFrames: input.design.frameConstruction.type === "split-rails",
      fansLeft: fanCountRequestToRawSetting(input.design.fanBanks.left),
      fansRight: fanCountRequestToRawSetting(input.design.fanBanks.right),
      fansTop: fanCountRequestToRawSetting(input.design.fanBanks.top),
      fansBottom: fanCountRequestToRawSetting(input.design.fanBanks.bottom),
    };
  }

  if (input.design.type === "corsi-rosenthal") {
    return {
      ...base,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      corsiMode: input.design.configuration.mode,
      corsiFilterCount: input.design.configuration.filterCount,
      corsiFanCount: fanCountRequestToRawSetting(input.design.configuration.fanCount),
      splitFrames: input.design.preset.implementation.defaults.splitFrames,
    };
  }

  if (input.design.type === "donut-filter-adapter") {
    return {
      ...base,
      filterPreset: customFilterPresetId,
      filterWidth: input.design.filter.outerDiameter,
      filterDepth: input.design.filter.length,
      filterThickness: input.design.filter.holeDiameter,
      filters: 1,
      splitFrames: input.design.preset.implementation.defaults.splitFrames,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      donutFilterPreset: input.design.donutFilterPreset,
      donutFilterOuterDiameter: input.design.filter.outerDiameter,
      donutFilterLength: input.design.filter.length,
      donutFilterHoleDiameter: input.design.filter.holeDiameter,
      donutAdapterInsertLength: input.design.filter.insertLength,
      donutCapRim: donutCapRawRim(input.design.filter.cap),
      donutCapEnabled: input.design.filter.cap.type === "printed-cap",
    };
  }

  if (input.design.type === "tempest") {
    const fanBanks = tempestRawFanBanksForArrangement(input.design.arrangement);
    return {
      ...base,
      ...serializedFilterFields(input.design.filter),
      tempestArrangement: input.design.arrangement,
      filters: input.design.arrangement === "single-horizontal-top-filter" ? 1 : 2,
      splitFrames: true,
      fansLeft: fanBanks.left,
      fansRight: fanBanks.right,
      fansTop: fanBanks.top,
      fansBottom: fanBanks.bottom,
    };
  }

  return {
    ...base,
    filters: input.design.filterCount,
    splitFrames: input.design.preset.implementation.defaults.splitFrames,
    fansLeft: 0,
    fansRight: 0,
    fansTop: input.design.fanCount,
    fansBottom: 0,
    corsiFanCount: input.design.fanCount > 0 ? input.design.fanCount : defaultSettings.corsiFanCount,
  };
}

// #######################################
// Catalog Lookup Helpers
// #######################################

export function findPrintDesignPreset(id: PrintDesignId | string | null): PrintDesignPreset {
  return printDesignPresets.find((preset) => preset.id === id) ?? requiredPrintDesignPreset(defaultPrintDesignId);
}

export function isCorsiRosenthalPrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).implementation.type === "corsi-rosenthal";
}

export function isDonutFilterPrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).implementation.type === "donut-filter-adapter";
}

export function isTempestPrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).implementation.type === "tempest";
}

export function isStaticReferencePrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).implementation.type === "static-reference";
}

export function isLaserDerivedPrintDesignPreset(preset: PrintDesignPreset): preset is LaserDerivedPrintDesignPreset {
  return preset.implementation.type === "laser-derived-printable-kit";
}

export function isCorsiRosenthalPrintDesignPreset(preset: PrintDesignPreset): preset is CorsiRosenthalPrintDesignPreset {
  return preset.implementation.type === "corsi-rosenthal";
}

export function isDonutFilterAdapterPrintDesignPreset(preset: PrintDesignPreset): preset is DonutFilterAdapterPrintDesignPreset {
  return preset.implementation.type === "donut-filter-adapter";
}

export function isTempestPrintDesignPreset(preset: PrintDesignPreset): preset is TempestPrintDesignPreset {
  return preset.implementation.type === "tempest";
}

export function isStaticReferencePrintDesignPreset(preset: PrintDesignPreset): preset is StaticReferencePrintDesignPreset {
  return preset.implementation.type === "static-reference";
}

export function staticPrintReferenceForPreset(preset: PrintDesignPreset): StaticPrintReference | undefined {
  return preset.implementation.type === "static-reference" ? preset.implementation.reference : undefined;
}

export function staticReferenceCanPreviewPrintPlates(preset: PrintDesignPreset): boolean {
  return preset.implementation.type === "static-reference" && staticPrintReferenceHasPlatePreview(preset.implementation.reference);
}

export function defaultFilterPresetForPrintDesign(preset: PrintDesignPreset): FilterPresetId {
  return preset.implementation.defaults.filterPreset;
}

export function defaultFanPresetForPrintDesign(preset: PrintDesignPreset): FanProductPresetId {
  return preset.implementation.defaults.fanPreset;
}

export function staticReferenceDefaultsForPreset(
  preset: PrintDesignPreset,
): StaticReferencePrintDesignDefaults | undefined {
  return preset.implementation.type === "static-reference" ? preset.implementation.defaults : undefined;
}

export function corsiFrameStyleForPreset(preset: PrintDesignPreset): CorsiRosenthalFrameStyle | undefined {
  return preset.implementation.type === "corsi-rosenthal" ? preset.implementation.frameStyle : undefined;
}

function requiredPrintDesignPreset(id: PrintDesignId): PrintDesignPreset {
  const preset = printDesignPresets.find((entry) => entry.id === id);
  if (preset === undefined) {
    throw new Error(`requiredPrintDesignPreset: Missing print design ${id}`);
  }
  return preset;
}

function requiredDonutFilterDefaults(preset: PrintDesignPreset): DonutFilterSettings {
  if (preset.implementation.type !== "donut-filter-adapter") {
    throw new Error(`requiredDonutFilterDefaults: ${preset.id} is not a donut-filter design`);
  }
  return preset.implementation.defaults.filter;
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

export function findPreviewMaterialColorPreset(id: PreviewMaterialColorId | string | null | undefined): PreviewMaterialColorPreset {
  return previewMaterialColorPresets.find((preset) => preset.id === id) ?? requiredPreviewMaterialColorPreset(defaultPreviewMaterialColorId);
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

// #######################################
// Preset Application
// #######################################

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
    donutCapRim: donutCapRawRim(preset.settings.cap),
    donutCapEnabled: preset.settings.cap.type === "printed-cap",
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
  return applyFilterPreset(arrangedSettings, defaultFilterPresetForTempestArrangement(arrangedSettings.tempestArrangement));
}

export function applyPrintDesignPreset(settings: RawPurifierSettings, presetId: PrintDesignId): RawPurifierSettings {
  const preset = findPrintDesignPreset(presetId);
  const filterPreset = findFilterPreset(defaultFilterPresetForPrintDesign(preset));
  const fanPreset = findFanProductPreset(defaultFanPresetForPrintDesign(preset));
  const base = {
    ...settings,
    printDesign: preset.id,
    filters: rawFilterCountForPrintDesign(preset),
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

  if (preset.implementation.type === "corsi-rosenthal") {
    return {
      ...withRecommendedFilter,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      corsiMode: preset.implementation.defaults.mode,
      corsiFilterCount: preset.implementation.defaults.filterCount,
      corsiFanCount: fanCountRequestToRawSetting(preset.implementation.defaults.fanCount),
      splitFrames: preset.implementation.defaults.splitFrames,
      rim: preset.implementation.defaults.rim,
      materialThickness: preset.implementation.defaults.materialThickness,
      screwHoleDiameter: preset.implementation.defaults.screwHoleDiameter,
    };
  }

  if (preset.implementation.type === "donut-filter-adapter") {
    const donutPreset = findDonutFilterPreset(preset.implementation.defaults.donutFilterPreset);
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
      donutCapRim: donutCapRawRim(donutFilter.cap),
      donutCapEnabled: donutFilter.cap.type === "printed-cap",
      splitFrames: preset.implementation.defaults.splitFrames,
      rim: defaultSettings.rim,
      materialThickness: preset.implementation.defaults.materialThickness,
      screwHoleDiameter: preset.implementation.defaults.screwHoleDiameter,
    };
  }

  if (preset.implementation.type === "tempest") {
    const fanBanks = tempestRawFanBanksForArrangement(preset.implementation.defaults.arrangement);
    return {
      ...withRecommendedFilter,
      tempestArrangement: preset.implementation.defaults.arrangement,
      filters: rawFilterCountForPrintDesign(preset),
      fansLeft: fanBanks.left,
      fansRight: fanBanks.right,
      fansTop: fanBanks.top,
      fansBottom: fanBanks.bottom,
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
      splitFrames: true,
      rim: preset.implementation.defaults.rim,
      materialThickness: preset.implementation.defaults.materialThickness,
      screwHoleDiameter: preset.implementation.defaults.screwHoleDiameter,
    };
  }

  if (preset.implementation.type === "static-reference") {
    return {
      ...withRecommendedFilter,
      fansLeft: 0,
      fansRight: 0,
      fansTop: preset.implementation.defaults.fanCount,
      fansBottom: 0,
      corsiMode: defaultSettings.corsiMode,
      corsiFilterCount: defaultSettings.corsiFilterCount,
      corsiFanCount: preset.implementation.defaults.fanCount > 0 ? preset.implementation.defaults.fanCount : defaultSettings.corsiFanCount,
      donutFilterPreset: defaultSettings.donutFilterPreset,
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
    ...withRecommendedFilter,
    fansLeft: fanCountRequestToRawSetting(preset.implementation.defaults.fanBanks.left),
    fansRight: fanCountRequestToRawSetting(preset.implementation.defaults.fanBanks.right),
    fansTop: fanCountRequestToRawSetting(preset.implementation.defaults.fanBanks.top),
    fansBottom: fanCountRequestToRawSetting(preset.implementation.defaults.fanBanks.bottom),
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
    splitFrames: preset.implementation.defaults.splitFrames,
    rim: defaultSettings.rim,
    materialThickness: defaultSettings.materialThickness,
    screwHoleDiameter: defaultSettings.screwHoleDiameter,
  };
}

// #######################################
// Corsi-Rosenthal Layout Rules
// #######################################

// ##############################
// Resolved Layout
// ##############################

export function resolveCorsiRosenthalFanCount(layout: LayoutResult): number {
  return resolveCorsiRosenthalFanCountForConfiguration(layout.configuration);
}

export function resolveCorsiRosenthalLayout(layout: LayoutResult): CorsiRosenthalLayoutSettings {
  const design = corsiRosenthalDesignConfiguration(layout.configuration);
  return {
    mode: design.configuration.mode,
    filterCount: design.configuration.filterCount,
    fanCount: resolveCorsiRosenthalFanCountForConfiguration(layout.configuration),
  };
}

export function resolveCorsiRosenthalFanCountForConfiguration(configuration: PurifierSettings): number {
  const design = corsiRosenthalDesignConfiguration(configuration);
  const fanCount = design.configuration.fanCount;
  if (
    fanCount.type === "fixed" &&
    corsiFanCountFitsConfiguration(configuration, design.configuration.mode, fanCount.count)
  ) {
    return fanCount.count;
  }
  return resolveAutomaticCorsiFanCount(configuration, design.configuration.mode);
}

// ##############################
// Filter and Fan Options
// ##############################

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

// #######################################
// URL Settings
// #######################################

export function encodeSettings(input: RawPurifierSettings | PurifierDraft): string {
  const settings = isPurifierDraft(input) ? serializePurifierDraft(input) : input;
  const params = new URLSearchParams();
  params.set("printDesign", settings.printDesign);
  params.set("filterPreset", settings.filterPreset);
  params.set("filterWidth", formatNumber(settings.filterWidth));
  params.set("filterDepth", formatNumber(settings.filterDepth));
  params.set("filterThickness", formatNumber(settings.filterThickness));
  params.set("rim", formatNumber(settings.rim));
  params.set("fanPreset", settings.fanPreset);
  params.set("fanDiameter", String(settings.fanDiameter));
  if (!isTempestPrintDesignId(settings.printDesign)) {
    params.set("filters", String(settings.filters));
    params.set("splitFrames", String(settings.splitFrames));
    params.set("fansLeft", String(settings.fansLeft));
    params.set("fansRight", String(settings.fansRight));
    params.set("fansTop", String(settings.fansTop));
    params.set("fansBottom", String(settings.fansBottom));
  }
  params.set("corsiMode", settings.corsiMode);
  params.set("corsiFilterCount", String(settings.corsiFilterCount));
  params.set("corsiFanCount", String(settings.corsiFanCount));
  params.set("tempestArrangement", settings.tempestArrangement);
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
  params.set("fingerWidthMultiplier", formatNumber(settings.fingerWidthMultiplier));
  params.set("fingerSpaceMultiplier", formatNumber(settings.fingerSpaceMultiplier));
  params.set("fingerPlayMultiplier", formatNumber(settings.fingerPlayMultiplier));
  params.set("fingerHoleWidthMultiplier", formatNumber(settings.fingerHoleWidthMultiplier));
  params.set("fingerHoleOffsetMultiplier", formatNumber(settings.fingerHoleOffsetMultiplier));
  params.set("dovetailSizeMultiplier", formatNumber(settings.dovetailSizeMultiplier));
  params.set("dovetailDepthMultiplier", formatNumber(settings.dovetailDepthMultiplier));
  params.set("dovetailTaper", formatNumber(settings.dovetailTaper));
  params.set("showFilterMedia", String(settings.showFilterMedia));
  params.set("showFans", String(settings.showFans));
  params.set("showFilterFrame", String(settings.showFilterFrame));
  params.set("explodedView", String(settings.explodedView));
  params.set("showDimensions", String(settings.showDimensions));
  params.set("showBananaScale", String(settings.showBananaScale));
  params.set("showPrintSeams", String(settings.showPrintSeams));
  params.set("showPreviewEdges", String(settings.showPreviewEdges));
  params.set("previewMaterialColor", settings.previewMaterialColor);
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
  const fanDiameter = readFanDiameter(params, ["fanDiameter", "fan_diameter"], defaultSettings.fanDiameter);
  const fanPreset = readFanProductPreset(params, fanDiameter);
  const corsiMode = readCorsiRosenthalMode(params);
  const parsed: RawPurifierSettings = {
    ...defaultSettings,
    printDesign,
    filterPreset,
    filterWidth: readNumber(params, ["filterWidth", "x"], defaultSettings.filterWidth),
    filterDepth: readNumber(params, ["filterDepth", "y"], defaultSettings.filterDepth),
    filterThickness: readNumber(params, ["filterThickness", "filter_height"], defaultSettings.filterThickness),
    rim: readNumber(params, "rim", defaultSettings.rim),
    fanPreset,
    fanDiameter,
    filters: readFilterCount(params, "filters", defaultSettings.filters),
    splitFrames: readBoolean(params, ["splitFrames", "split_frames"], defaultSettings.splitFrames),
    fansLeft: readInteger(params, ["fansLeft", "fans_left"], defaultSettings.fansLeft),
    fansRight: readInteger(params, ["fansRight", "fans_right"], defaultSettings.fansRight),
    fansTop: readInteger(params, ["fansTop", "fans_top"], defaultSettings.fansTop),
    fansBottom: readInteger(params, ["fansBottom", "fans_bottom"], defaultSettings.fansBottom),
    corsiMode,
    corsiFilterCount: readCorsiFilterCount(params, corsiMode),
    corsiFanCount: readCorsiFanCount(params, printDesign),
    tempestArrangement: readTempestArrangement(params),
    donutFilterPreset: readDonutFilterPreset(params),
    donutFilterOuterDiameter: readNumber(params, "donutFilterOuterDiameter", defaultSettings.donutFilterOuterDiameter),
    donutFilterLength: readNumber(params, "donutFilterLength", defaultSettings.donutFilterLength),
    donutFilterHoleDiameter: readNumber(params, "donutFilterHoleDiameter", defaultSettings.donutFilterHoleDiameter),
    donutAdapterInsertLength: readNumber(params, "donutAdapterInsertLength", defaultSettings.donutAdapterInsertLength),
    donutCapRim: readNumber(params, "donutCapRim", defaultSettings.donutCapRim),
    donutCapEnabled: readBoolean(params, "donutCapEnabled", defaultSettings.donutCapEnabled),
    screwHoleDiameter: readNumber(params, ["screwHoleDiameter", "screw_holes"], defaultSettings.screwHoleDiameter),
    materialThickness: readNumber(params, ["materialThickness", "thickness"], defaultSettings.materialThickness),
    kerfFit: readNumber(params, ["kerfFit", "burn"], defaultSettings.kerfFit),
    fingerWidthMultiplier: readNumber(
      params,
      ["fingerWidthMultiplier", "FingerJoint_finger"],
      defaultSettings.fingerWidthMultiplier,
    ),
    fingerSpaceMultiplier: readNumber(
      params,
      ["fingerSpaceMultiplier", "FingerJoint_space"],
      defaultSettings.fingerSpaceMultiplier,
    ),
    fingerPlayMultiplier: readNumber(
      params,
      ["fingerPlayMultiplier", "FingerJoint_play"],
      defaultSettings.fingerPlayMultiplier,
    ),
    fingerHoleWidthMultiplier: readNumber(
      params,
      ["fingerHoleWidthMultiplier", "FingerJoint_width"],
      defaultSettings.fingerHoleWidthMultiplier,
    ),
    fingerHoleOffsetMultiplier: readNumber(
      params,
      ["fingerHoleOffsetMultiplier", "FingerJoint_edge_width"],
      defaultSettings.fingerHoleOffsetMultiplier,
    ),
    dovetailSizeMultiplier: readNumber(
      params,
      ["dovetailSizeMultiplier", "DoveTail_size"],
      defaultSettings.dovetailSizeMultiplier,
    ),
    dovetailDepthMultiplier: readNumber(
      params,
      ["dovetailDepthMultiplier", "DoveTail_depth"],
      defaultSettings.dovetailDepthMultiplier,
    ),
    dovetailTaper: readNumber(params, ["dovetailTaper", "DoveTail_angle"], defaultSettings.dovetailTaper),
    showFilterMedia: readBoolean(params, "showFilterMedia", defaultSettings.showFilterMedia),
    showFans: readBoolean(params, "showFans", defaultSettings.showFans),
    showFilterFrame: readBoolean(params, "showFilterFrame", defaultSettings.showFilterFrame),
    explodedView: readBoolean(params, "explodedView", defaultSettings.explodedView),
    showDimensions: readBoolean(params, "showDimensions", defaultSettings.showDimensions),
    showBananaScale: readBoolean(params, "showBananaScale", defaultSettings.showBananaScale),
    showPrintSeams: readBoolean(params, "showPrintSeams", defaultSettings.showPrintSeams),
    showPreviewEdges: readBoolean(params, "showPreviewEdges", defaultSettings.showPreviewEdges),
    previewMaterialColor: readPreviewMaterialColor(params),
    autoRotate: readBoolean(params, "autoRotate", defaultSettings.autoRotate),
    cameraPreset: readCameraPreset(params, "cameraPreset", defaultSettings.cameraPreset),
    labels: readBoolean(params, "labels", defaultSettings.labels),
    referenceScale: readNumber(params, ["referenceScale", "reference"], defaultSettings.referenceScale),
  };
  const parsedWithDonutPreset = applyDonutUrlPresetAndMeasurements(params, parsed);
  return normalizeRawSettings(applyPrintDesignUrlDefaults(params, parsedWithDonutPreset, printDesign));
}

export function decodePurifierDraftSettings(search: string): PurifierDraft {
  return createPurifierDraft(decodeSettings(search));
}

export function formatMillimeters(value: number): string {
  return `${formatNumber(value)} mm`;
}

// #######################################
// Settings Helpers
// #######################################

// ##############################
// Design Construction
// ##############################

function createConfiguredPrintDesign(input: {
  readonly raw: RawPurifierSettings;
  readonly printDesign: PrintDesignPreset;
  readonly filter: FilterSelection;
  readonly filterCount: FilterCount;
  readonly fan: FanConfiguration;
  readonly frameConstruction: FilterFrameConstruction;
}): ConfiguredPrintDesign {
  const { printDesign } = input;
  if (isLaserDerivedPrintDesignPreset(printDesign)) {
    return {
      type: "laser-derived-printable-kit",
      preset: printDesign,
      filter: input.filter,
      filterCount: input.filterCount,
      fanBanks: input.fan.banks,
      frameConstruction: input.frameConstruction,
    };
  }

  if (isCorsiRosenthalPrintDesignPreset(printDesign)) {
    const mode = canonicalCorsiRosenthalMode(input.raw.corsiMode);
    return {
      type: "corsi-rosenthal",
      preset: printDesign,
      filter: input.filter,
      configuration: {
        mode,
        filterCount: canonicalCorsiFilterCount(input.raw.corsiFilterCount, mode),
        fanCount: fanCountRequestFromRawSetting(canonicalCorsiFanCount(input.raw.corsiFanCount, printDesign.id, mode)),
      },
      frameStyle: printDesign.implementation.frameStyle,
    };
  }

  if (isDonutFilterAdapterPrintDesignPreset(printDesign)) {
    return {
      type: "donut-filter-adapter",
      preset: printDesign,
      donutFilterPreset: findDonutFilterPreset(input.raw.donutFilterPreset).id,
      filter: normalizeDonutFilterSettings(input.raw),
      fan: {
        spec: input.fan.spec,
        productSelection: input.fan.productSelection,
        count: printDesign.implementation.defaults.fanCount,
      },
    };
  }

  if (isTempestPrintDesignPreset(printDesign)) {
    return {
      type: "tempest",
      preset: printDesign,
      arrangement: canonicalTempestArrangement(input.raw.tempestArrangement),
      filter: input.filter,
    };
  }

  return {
    type: "static-reference",
    preset: printDesign,
    reference: printDesign.implementation.reference,
    capabilities: printDesign.implementation.reference.capabilities,
    filter: input.filter,
    filterCount: printDesign.implementation.defaults.filterCount,
    fanCount: printDesign.implementation.defaults.fanCount,
  };
}

// ##############################
// Preview Construction
// ##############################

function createPreviewSettings(raw: RawPurifierSettings, referenceScale: ReferenceScale): PreviewSettings {
  const cameraPreset = cameraPresets.includes(raw.cameraPreset) ? raw.cameraPreset : defaultSettings.cameraPreset;
  const enclosure: EnclosurePreviewOptions = {
    showFilterMedia: raw.showFilterMedia,
    showFans: raw.showFans,
    showFilterFrame: raw.showFilterFrame,
    explodedView: raw.explodedView,
    showDimensions: raw.showDimensions,
    showBananaScale: raw.showBananaScale,
    showPrintSeams: raw.showPrintSeams,
    showPreviewEdges: raw.showPreviewEdges,
    materialColor: findPreviewMaterialColorPreset(raw.previewMaterialColor).id,
    autoRotate: raw.autoRotate,
    cameraPreset,
  };
  const cutSheet: CutSheetPreviewOptions = {
    showLabels: raw.labels,
    referenceScale,
  };

  return {
    enclosure,
    cutSheet,
  };
}

// ##############################
// Normalization Helpers
// ##############################

function isStructuredSettings(input: PurifierInput): input is PurifierSettings {
  return "filter" in input && "fan" in input && "cutting" in input;
}

function isPurifierDraft(input: PurifierInput | RawPurifierSettings | PurifierDraft): input is PurifierDraft {
  return "fan" in input && "presetId" in input.fan;
}

function createPurifierDesignDraft(configuration: PurifierSettings, raw: RawPurifierSettings): PurifierDesignDraft {
  if (configuration.design.type === "laser-derived-printable-kit") {
    return {
      type: "laser-derived-printable-kit",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      filter: configuration.design.filter,
      filterCount: configuration.design.filterCount,
      fanBanks: configuration.design.fanBanks,
      frameConstruction: configuration.design.frameConstruction,
    };
  }

  if (configuration.design.type === "corsi-rosenthal") {
    return {
      type: "corsi-rosenthal",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      filter: configuration.design.filter,
      configuration: configuration.design.configuration,
      frameStyle: configuration.design.frameStyle,
    };
  }

  if (configuration.design.type === "donut-filter-adapter") {
    return {
      type: "donut-filter-adapter",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      donutFilterPreset: findDonutFilterPreset(raw.donutFilterPreset).id,
      filter: configuration.design.filter,
      fanCount: configuration.design.fan.count,
    };
  }

  if (configuration.design.type === "tempest") {
    return {
      type: "tempest",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      arrangement: configuration.design.arrangement,
      filter: configuration.design.filter,
    };
  }

  return {
    type: "static-reference",
    printDesign: configuration.design.preset.id,
    preset: configuration.design.preset,
    reference: configuration.design.reference,
    capabilities: configuration.design.capabilities,
    filter: configuration.design.filter,
    filterCount: configuration.design.filterCount,
    fanCount: configuration.design.fanCount,
  };
}

function serializedFilterFields(filter: FilterSelection): Pick<
  RawPurifierSettings,
  "filterPreset" | "filterWidth" | "filterDepth" | "filterThickness"
> {
  if (filter.type === "preset") {
    const preset = findPresetFilter(filter.presetId);
    return {
      filterPreset: preset.id,
      filterWidth: preset.dimensions.width,
      filterDepth: preset.dimensions.depth,
      filterThickness: preset.dimensions.thickness,
    };
  }

  return {
    filterPreset: customFilterPresetId,
    filterWidth: filter.dimensions.width,
    filterDepth: filter.dimensions.depth,
    filterThickness: filter.dimensions.thickness,
  };
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
    thickness: clamp(dimensions.thickness, 10, 300),
  };
}

function normalizeDonutFilterSettings(settings: RawPurifierSettings): DonutFilterSettings {
  const outerDiameter = clamp(settings.donutFilterOuterDiameter, 70, 420);
  const length = clamp(settings.donutFilterLength, 35, 520);
  const holeDiameter = clamp(settings.donutFilterHoleDiameter, 18, Math.max(20, outerDiameter - 8));
  const capRim = normalizeDonutCapRim(settings, outerDiameter, holeDiameter);
  return {
    outerDiameter,
    length,
    holeDiameter,
    insertLength: clamp(settings.donutAdapterInsertLength, 2, Math.min(60, length)),
    cap: settings.donutCapEnabled
      ? {
          type: "printed-cap",
          rim: capRim,
        }
      : { type: "none" },
  };
}

function normalizeDonutCapRim(
  settings: RawPurifierSettings,
  outerDiameter: Millimeters,
  holeDiameter: Millimeters,
): Millimeters {
  return clamp(settings.donutCapRim, 0, Math.max(0, (outerDiameter - holeDiameter) / 2));
}

function normalizeJointSettings(settings: RawPurifierSettings): JointSettings {
  return {
    finger: {
      widthMultiplier: clamp(settings.fingerWidthMultiplier, 0.5, 8),
      spaceMultiplier: clamp(settings.fingerSpaceMultiplier, 0.5, 8),
      playMultiplier: clamp(settings.fingerPlayMultiplier, 0, 1),
      holeWidthMultiplier: clamp(settings.fingerHoleWidthMultiplier, 0.5, 2),
      holeOffsetMultiplier: clamp(settings.fingerHoleOffsetMultiplier, 0.75, 4),
    },
    dovetail: {
      sizeMultiplier: clamp(settings.dovetailSizeMultiplier, 0.75, 8),
      depthMultiplier: clamp(settings.dovetailDepthMultiplier, 0.5, 2),
      taper: clamp(settings.dovetailTaper, 0, 80),
    },
  };
}

// ##############################
// Selection Helpers
// ##############################

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

// #######################################
// Corsi-Rosenthal Canonicalization
// #######################################

// ##############################
// Raw Corsi Settings
// ##############################

function canonicalizePrintDesignRawSettings(settings: RawPurifierSettings): RawPurifierSettings {
  if (isTempestPrintDesignId(settings.printDesign)) {
    return applyTempestArrangement(settings, settings.tempestArrangement);
  }
  if (!isCorsiRosenthalPrintDesignId(settings.printDesign)) {
    return settings;
  }
  const corsiMode = canonicalCorsiRosenthalMode(settings.corsiMode);
  const corsiFanCount = canonicalCorsiFanCount(settings.corsiFanCount, settings.printDesign, corsiMode);
  return {
    ...settings,
    fansLeft: 0,
    fansRight: 0,
    fansTop: 0,
    fansBottom: 0,
    corsiMode,
    corsiFilterCount: canonicalCorsiFilterCount(settings.corsiFilterCount, corsiMode),
    corsiFanCount:
      corsiFanCount === automaticFanCount || corsiFanCountFitsRawSettings(settings, corsiMode, corsiFanCount)
        ? corsiFanCount
        : automaticFanCount,
  };
}

function canonicalCorsiRosenthalMode(value: CorsiRosenthalMode | string | null | undefined): CorsiRosenthalMode {
  const found = corsiRosenthalModes.find((mode) => mode === value);
  return found ?? defaultSettings.corsiMode;
}

function canonicalTempestArrangement(value: TempestArrangementPreset | string | null | undefined): TempestArrangementPreset {
  const found = tempestArrangementPresets.find((arrangement) => arrangement === value);
  return found ?? defaultSettings.tempestArrangement;
}

// ##############################
// Raw Count Canonicalization
// ##############################

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

  const fallback = defaultCorsiFanCountForPrintDesign(printDesign);
  const parsed = Number.isFinite(value) ? Math.trunc(value) : fallback;
  if (parsed === automaticFanCount) {
    return automaticFanCount;
  }

  const allowedCounts = corsiRosenthalFixedFanCountOptions(mode);
  return allowedCounts.includes(parsed) ? parsed : automaticFanCount;
}

function defaultCorsiFanCountForPrintDesign(printDesign: PrintDesignId): number {
  const preset = findPrintDesignPreset(printDesign);
  return isCorsiRosenthalPrintDesignPreset(preset)
    ? fanCountRequestToRawSetting(preset.implementation.defaults.fanCount)
    : defaultSettings.corsiFanCount;
}

function resolveAutomaticCorsiFanCount(configuration: PurifierSettings, mode: CorsiRosenthalMode): number {
  const candidates = mode === "side-exhaust" ? [6, 4, 2] : [8, 6, 4, 3, 2, 1];

  for (const candidate of candidates) {
    if (corsiFanCountFitsConfiguration(configuration, mode, candidate)) {
      return candidate;
    }
  }

  return mode === "side-exhaust" ? 2 : 1;
}

// ##############################
// Fan Grid Fit
// ##############################

export function corsiFanGridFit(input: {
  readonly mode: CorsiRosenthalMode;
  readonly fanCount: number;
  readonly filterDimensions: FilterDimensions;
  readonly fanDiameter: number;
}): CorsiFanGridFit {
  const invalidReason = invalidCorsiFanGridFitReason(input.mode, input.fanCount);
  if (invalidReason !== null) {
    return {
      type: "invalid",
      mode: input.mode,
      fanCount: input.fanCount,
      reason: invalidReason,
    };
  }

  const panelFanCount = input.mode === "side-exhaust" ? Math.ceil(input.fanCount / 2) : input.fanCount;
  const required = corsiFanGridFootprint(panelFanCount, input.fanDiameter);
  const availableWidth = input.filterDimensions.width + 2 * corsiRosenthalGeometry.railDepth;
  const availableDepth =
    input.mode === "side-exhaust"
      ? input.filterDimensions.depth + 2 * corsiRosenthalGeometry.railDepth
      : input.filterDimensions.width + 2 * corsiRosenthalGeometry.railDepth;
  const fitSlack = 8;
  const type =
    required.width <= availableWidth + fitSlack && required.depth <= availableDepth + fitSlack
      ? "fits"
      : "does-not-fit";
  return {
    type,
    mode: input.mode,
    fanCount: input.fanCount,
    panelFanCount,
    requiredWidth: required.width,
    requiredDepth: required.depth,
    availableWidth,
    availableDepth,
  };
}

function invalidCorsiFanGridFitReason(
  mode: CorsiRosenthalMode,
  fanCount: number,
): CorsiFanGridFitInvalidReason | null {
  if (!Number.isFinite(fanCount)) {
    return "fan-count-not-finite";
  }
  if (fanCount <= 0) {
    return "fan-count-not-positive";
  }
  if (!Number.isInteger(fanCount)) {
    return "fan-count-not-integer";
  }
  if (mode === "side-exhaust" && fanCount % 2 !== 0) {
    return "side-exhaust-requires-even-fan-count";
  }
  return null;
}

export function corsiFanCountFits(input: {
  readonly mode: CorsiRosenthalMode;
  readonly fanCount: number;
  readonly filterDimensions: FilterDimensions;
  readonly fanDiameter: number;
}): boolean {
  return corsiFanGridFit(input).type === "fits";
}

function corsiFanCountFitsConfiguration(
  configuration: PurifierSettings,
  mode: CorsiRosenthalMode,
  fanCount: number,
): boolean {
  return corsiFanCountFits({
    mode,
    fanCount,
    filterDimensions: filterSelectionDimensions(configuration.filter),
    fanDiameter: configuration.fan.spec.diameter,
  });
}

function corsiRosenthalDesignConfiguration(
  configuration: PurifierSettings,
): Extract<ConfiguredPrintDesign, { readonly type: "corsi-rosenthal" }> {
  if (configuration.design.type !== "corsi-rosenthal") {
    throw new Error("corsiRosenthalDesignConfiguration: Settings are not using the Corsi-Rosenthal print design");
  }
  return configuration.design;
}

function corsiFanCountFitsRawSettings(settings: RawPurifierSettings, mode: CorsiRosenthalMode, fanCount: number): boolean {
  return corsiFanCountFits({
    mode,
    fanCount,
    filterDimensions: rawFilterDimensions(settings),
    fanDiameter: settings.fanDiameter,
  });
}

function corsiFanGridFootprint(fanCount: number, fanDiameter: number): { readonly width: number; readonly depth: number } {
  const columns = corsiFanGridColumns(fanCount);
  const rows = Math.ceil(fanCount / columns);
  const fanCell = fanDiameter * 1.18;
  return {
    width:
      columns * fanCell +
      Math.max(0, columns - 1) * corsiRosenthalGeometry.fanGap +
      corsiRosenthalGeometry.railDepth * 1.4,
    depth:
      rows * fanCell +
      Math.max(0, rows - 1) * corsiRosenthalGeometry.fanGap +
      corsiRosenthalGeometry.railDepth * 2,
  };
}

// ##############################
// Shared Type Guards and Converters
// ##############################

function isPresetDonutFilterId(id: DonutFilterPresetId): id is PresetDonutFilterId {
  return id !== customDonutFilterPresetId;
}

function isPresetFanProductId(id: FanProductPresetId): id is PresetFanProductId {
  return id !== customFanProductPresetId;
}

function requiredPreviewMaterialColorPreset(id: PreviewMaterialColorId): PreviewMaterialColorPreset {
  const preset = previewMaterialColorPresets.find((entry) => entry.id === id);
  if (preset === undefined) {
    throw new Error(`requiredPreviewMaterialColorPreset: Missing preview color ${id}`);
  }
  return preset;
}

export function fanCountRequestFromRawSetting(value: number): FanCountRequest {
  const clamped = clampInteger(value, automaticFanCount, fixedFanCountOptions[fixedFanCountOptions.length - 1]);
  if (clamped === automaticFanCount) {
    return { type: "auto" };
  }
  const fixedCount = fixedFanCountOptions.find((count) => count === clamped) ?? 0;
  return { type: "fixed", count: fixedCount };
}

export function fanCountRequestToRawSetting(request: FanCountRequest): number {
  return request.type === "auto" ? automaticFanCount : request.count;
}

function tempestRawFanBanksForArrangement(arrangement: TempestArrangementPreset): FanBanks<number> {
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

function donutCapRawRim(cap: DonutCap): Millimeters {
  return cap.type === "printed-cap" ? cap.rim : defaultSettings.donutCapRim;
}

function referenceScaleFromNumber(value: number): ReferenceScale {
  const length = clamp(value, 0, 300);
  return length > 0 ? { type: "enabled", length } : { type: "disabled" };
}

// #######################################
// URL Parsing Helpers
// #######################################

// ##############################
// Primitive Readers
// ##############################

function readNumber(params: URLSearchParams, key: string | readonly string[], fallback: number): number {
  const value = readParam(params, key);
  if (value === null) {
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readInteger(params: URLSearchParams, key: string | readonly string[], fallback: number): number {
  return Math.trunc(readNumber(params, key, fallback));
}

function readBoolean(params: URLSearchParams, key: string | readonly string[], fallback: boolean): boolean {
  const value = readParam(params, key);
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

function readFanDiameter(params: URLSearchParams, key: string | readonly string[], fallback: FanDiameter): FanDiameter {
  const parsed = Number(readParam(params, key));
  const found = fanDiameters.find((diameter) => diameter === parsed);
  return found ?? fallback;
}

// ##############################
// Preset Readers
// ##############################

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
  if (
    hasAnyParam(params, ["filterWidth", "x"]) ||
    hasAnyParam(params, ["filterDepth", "y"]) ||
    hasAnyParam(params, ["filterThickness", "filter_height"])
  ) {
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

function readPreviewMaterialColor(params: URLSearchParams): PreviewMaterialColorId {
  return findPreviewMaterialColorPreset(params.get("previewMaterialColor")).id;
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

// ##############################
// Donut URL Defaults
// ##############################

function applyDonutUrlPresetAndMeasurements(
  params: URLSearchParams,
  parsed: RawPurifierSettings,
): RawPurifierSettings {
  const presetValue = params.get("donutFilterPreset");
  const presetId = donutFilterPresetIds.find((id) => id === presetValue);
  if (presetId === undefined) {
    return parsed;
  }

  const presetSettings = applyDonutFilterPreset(parsed, presetId);
  if (!hasDonutFilterMeasurementParams(params)) {
    return presetSettings;
  }

  return {
    ...presetSettings,
    donutFilterPreset: customDonutFilterPresetId,
    donutFilterOuterDiameter: params.has("donutFilterOuterDiameter")
      ? parsed.donutFilterOuterDiameter
      : presetSettings.donutFilterOuterDiameter,
    donutFilterLength: params.has("donutFilterLength") ? parsed.donutFilterLength : presetSettings.donutFilterLength,
    donutFilterHoleDiameter: params.has("donutFilterHoleDiameter")
      ? parsed.donutFilterHoleDiameter
      : presetSettings.donutFilterHoleDiameter,
    donutAdapterInsertLength: params.has("donutAdapterInsertLength")
      ? parsed.donutAdapterInsertLength
      : presetSettings.donutAdapterInsertLength,
    donutCapRim: params.has("donutCapRim") ? parsed.donutCapRim : presetSettings.donutCapRim,
    donutCapEnabled: params.has("donutCapEnabled") ? parsed.donutCapEnabled : presetSettings.donutCapEnabled,
  };
}

// ##############################
// Corsi URL Readers
// ##############################

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
  const recommended = defaultCorsiFanCountForPrintDesign(printDesign);
  if (params.has("corsiFanCount")) {
    return readAutomaticInteger(params, "corsiFanCount", recommended);
  }
  if (isCorsiRosenthalPrintDesignId(printDesign) && hasAnyParam(params, ["fansLeft", "fans_left"])) {
    return readInteger(params, ["fansLeft", "fans_left"], recommended);
  }
  return defaultSettings.corsiFanCount;
}

function readTempestArrangement(params: URLSearchParams): TempestArrangementPreset {
  return canonicalTempestArrangement(params.get("tempestArrangement"));
}

function defaultFilterPresetForTempestArrangement(arrangement: TempestArrangementPreset): FilterPresetId {
  return defaultFilterPresetByTempestArrangement[canonicalTempestArrangement(arrangement)];
}

// ##############################
// Design URL Defaults
// ##############################

function applyPrintDesignUrlDefaults(
  params: URLSearchParams,
  parsed: RawPurifierSettings,
  printDesign: PrintDesignId,
): RawPurifierSettings {
  if (!params.has("printDesign")) {
    return parsed;
  }

  const baseDefaults = applyPrintDesignPreset(defaultSettings, printDesign);
  const defaults =
    isTempestPrintDesignId(printDesign) && params.has("tempestArrangement")
      ? applyTempestArrangementDefaults(baseDefaults, parsed.tempestArrangement)
      : baseDefaults;
  const hasFilterInputs =
    params.has("filterPreset") ||
    hasAnyParam(params, ["filterWidth", "x"]) ||
    hasAnyParam(params, ["filterDepth", "y"]) ||
    hasAnyParam(params, ["filterThickness", "filter_height"]);
  const hasFanInputs = params.has("fanPreset") || hasAnyParam(params, ["fanDiameter", "fan_diameter"]);
  const hasDonutFilterInputs = params.has("donutFilterPreset") || hasDonutFilterMeasurementParams(params);
  const hasLegacyCorsiFanCount = isCorsiRosenthalPrintDesignId(printDesign) && hasAnyParam(params, ["fansLeft", "fans_left"]);

  return {
    ...parsed,
    filterPreset: hasFilterInputs ? parsed.filterPreset : defaults.filterPreset,
    filterWidth: hasFilterInputs ? parsed.filterWidth : defaults.filterWidth,
    filterDepth: hasFilterInputs ? parsed.filterDepth : defaults.filterDepth,
    filterThickness: hasFilterInputs ? parsed.filterThickness : defaults.filterThickness,
    fanPreset: hasFanInputs ? parsed.fanPreset : defaults.fanPreset,
    fanDiameter: hasFanInputs ? parsed.fanDiameter : defaults.fanDiameter,
    filters: params.has("filters") ? parsed.filters : defaults.filters,
    splitFrames: hasAnyParam(params, ["splitFrames", "split_frames"]) ? parsed.splitFrames : defaults.splitFrames,
    fansLeft: hasAnyParam(params, ["fansLeft", "fans_left"]) ? parsed.fansLeft : defaults.fansLeft,
    fansRight: hasAnyParam(params, ["fansRight", "fans_right"]) ? parsed.fansRight : defaults.fansRight,
    fansTop: hasAnyParam(params, ["fansTop", "fans_top"]) ? parsed.fansTop : defaults.fansTop,
    fansBottom: hasAnyParam(params, ["fansBottom", "fans_bottom"]) ? parsed.fansBottom : defaults.fansBottom,
    corsiMode: params.has("corsiMode") ? parsed.corsiMode : defaults.corsiMode,
    corsiFilterCount: params.has("corsiFilterCount") ? parsed.corsiFilterCount : defaults.corsiFilterCount,
    corsiFanCount: params.has("corsiFanCount") || hasLegacyCorsiFanCount ? parsed.corsiFanCount : defaults.corsiFanCount,
    tempestArrangement: params.has("tempestArrangement") ? parsed.tempestArrangement : defaults.tempestArrangement,
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
    materialThickness: hasAnyParam(params, ["materialThickness", "thickness"])
      ? parsed.materialThickness
      : defaults.materialThickness,
    screwHoleDiameter: hasAnyParam(params, ["screwHoleDiameter", "screw_holes"])
      ? parsed.screwHoleDiameter
      : defaults.screwHoleDiameter,
  };
}

// ##############################
// Fallback Readers
// ##############################

function readAutomaticInteger(params: URLSearchParams, key: string | readonly string[], fallback: number): number {
  return readParam(params, key) === "auto" ? automaticFanCount : readInteger(params, key, fallback);
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

function readParam(params: URLSearchParams, key: string | readonly string[]): string | null {
  const keys = Array.isArray(key) ? key : [key];
  for (const entry of keys) {
    const values = params.getAll(entry);
    const value = values[values.length - 1];
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}

function hasAnyParam(params: URLSearchParams, keys: readonly string[]): boolean {
  return keys.some((key) => params.has(key));
}

// #######################################
// Primitive Helpers
// #######################################

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
