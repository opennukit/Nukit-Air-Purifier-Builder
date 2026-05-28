import { clampRimForGeometry } from "@/domain/purifier/geometry";
import { corsiRosenthalGeometry } from "@/domain/designs/corsi-rosenthal/geometry";
import type { Millimeters } from "@/domain/units";
import {
  customFilterPresetId,
  filterPresetIds,
  filterSelectionDimensions,
  findFilterPreset,
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

export const printDesignIds = [
  "nukit-open-air",
  "corsi-rosenthal",
  "donut-hepa-adapter",
  ...staticPrintReferenceIds,
] as const;

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

export type CorsiRosenthalConfiguration = {
  readonly mode: CorsiRosenthalMode;
  readonly filterCount: number;
  readonly fanCount: FanCountRequest;
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

type CorsiFanGridFitFootprint = {
  readonly mode: CorsiRosenthalMode;
  readonly fanCount: number;
  readonly panelFanCount: number;
  readonly requiredWidth: Millimeters;
  readonly requiredDepth: Millimeters;
  readonly availableWidth: Millimeters;
  readonly availableDepth: Millimeters;
};

export type CorsiFanGridFitInvalidReason =
  | "fan-count-not-finite"
  | "fan-count-not-positive"
  | "fan-count-not-integer"
  | "side-exhaust-requires-even-fan-count";

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

export type PrintDesignModel =
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
      readonly type: "static-reference";
      readonly reference: StaticPrintReference;
      readonly defaults: StaticReferencePrintDesignDefaults;
    };

export type LaserDerivedPrintDesignPreset = PrintDesignPresetBase & {
  readonly model: Extract<PrintDesignModel, { readonly type: "laser-derived-printable-kit" }>;
};

export type CorsiRosenthalPrintDesignPreset = PrintDesignPresetBase & {
  readonly model: Extract<PrintDesignModel, { readonly type: "corsi-rosenthal" }>;
};

export type DonutFilterAdapterPrintDesignPreset = PrintDesignPresetBase & {
  readonly model: Extract<PrintDesignModel, { readonly type: "donut-filter-adapter" }>;
};

export type StaticReferencePrintDesignPreset = PrintDesignPresetBase & {
  readonly model: Extract<PrintDesignModel, { readonly type: "static-reference" }>;
};

export type PrintDesignPreset =
  | LaserDerivedPrintDesignPreset
  | CorsiRosenthalPrintDesignPreset
  | DonutFilterAdapterPrintDesignPreset
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

export type StaticReferencePrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly filterCount: FilterCount;
  readonly fanCount: number;
  readonly splitFrames: boolean;
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

export type ResolvedFanBanks = FanBanks<number>;

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
  readonly printSheets: PrintSheetPreviewOptions;
  readonly cutSheet: CutSheetPreviewOptions;
};

export type EnclosurePreviewOptions = {
  readonly showFilterMedia: boolean;
  readonly showFans: boolean;
  readonly showFilterFrame: boolean;
  readonly transparentWalls: boolean;
  readonly explodedView: boolean;
  readonly showDimensions: boolean;
  readonly showBananaScale: boolean;
  readonly showPrintSeams: boolean;
  readonly autoRotate: boolean;
  readonly cameraPreset: CameraPreset;
};

export type PrintSheetPreviewOptions = {
  readonly showPlateLabels: boolean;
};

export type CutSheetPreviewOptions = {
  readonly showLabels: boolean;
  readonly referenceScale: ReferenceScale;
};

export const customDonutFilterPresetId: DonutFilterPresetId = "custom";
export const defaultDonutFilterPresetId: PresetDonutFilterId = "big-clive-silentnight-92";

// #######################################
// Donut Filter Presets
// #######################################

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

// #######################################
// Print Design Presets
// #######################################

export const printDesignPresets: readonly PrintDesignPreset[] = [
  {
    id: "nukit-open-air",
    label: "Nukit Open Air printable kit",
    detail: "3D-printable Nukit enclosure split into bed-sized panels with dovetail lap keys for glued seams.",
    source: "FilterBoxBuilder browser generator",
    license: "Generated from this project",
    releaseVisibility: "public",
    model: {
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
    id: "corsi-rosenthal",
    label: "Corsi-Rosenthal box",
    detail:
      "Modular CR frame with small IKEA filter defaults, repeated rails, corner blocks, fan plates, and connector keys.",
    source: "Gary Jepsen modular Printables CR reference",
    sourceUrl: "https://www.printables.com/model/1348938-corsi-rosenthal-box-air-filter",
    license: "Inspired by CC BY-NC 4.0 reference; generated geometry is original and parametric in this app",
    licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
    releaseVisibility: "internal",
    model: {
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
    source: "Big Clive donut HEPA OpenSCAD reference",
    license: "Reference script published in the video description; generated geometry is parametric in this app",
    releaseVisibility: "internal",
    model: {
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
    model: {
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
    model: {
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
    model: {
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

// #######################################
// Public Release Presets
// #######################################

export function isPublicPrintDesignId(id: PrintDesignId): boolean {
  return publicPrintDesignPresets.some((preset) => preset.id === id);
}

function isPublicPrintDesignPreset(preset: PrintDesignPreset): boolean {
  return preset.releaseVisibility === "public";
}

function rawFilterCountForPrintDesign(preset: PrintDesignPreset): FilterCount {
  if (isLaserDerivedPrintDesignPreset(preset) || isStaticReferencePrintDesignPreset(preset)) {
    return preset.model.defaults.filterCount;
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
  transparentWalls: boolean;
  explodedView: boolean;
  showDimensions: boolean;
  showBananaScale: boolean;
  showPrintSeams: boolean;
  showPrintPlateLabels: boolean;
  autoRotate: boolean;
  cameraPreset: CameraPreset;
  labels: boolean;
  referenceScale: Millimeters;
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

export type BuildSummary = {
  chamberHeight: number;
  workingDepth: number;
  resolvedFans: ResolvedFanBanks;
  panelCount: number;
  sheetWidth: number;
  sheetHeight: number;
};

export type PurifierInput = RawPurifierSettings | PurifierSettings;

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
  transparentWalls: false,
  explodedView: false,
  showDimensions: false,
  showBananaScale: false,
  showPrintSeams: false,
  showPrintPlateLabels: false,
  autoRotate: true,
  cameraPreset: "official",
  labels: true,
  referenceScale: 100,
};

// #######################################
// Settings Normalization
// #######################################

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

export function normalizeRawSettings(input: RawPurifierSettings): RawPurifierSettings {
  const normalized = toRawSettings(normalizeSettings(input));
  const corsiMode = canonicalCorsiRosenthalMode(input.corsiMode);
  const donutFilter = normalizeDonutFilterSettings(input);
  const donutFilterPreset = findDonutFilterPreset(input.donutFilterPreset);
  return canonicalizePrintDesignRawSettings({
    ...normalized,
    corsiMode,
    corsiFilterCount: canonicalCorsiFilterCount(input.corsiFilterCount, corsiMode),
    corsiFanCount: canonicalCorsiFanCount(input.corsiFanCount, normalized.printDesign, corsiMode),
    donutFilterPreset: donutFilterPreset.id,
    donutFilterOuterDiameter: donutFilter.outerDiameter,
    donutFilterLength: donutFilter.length,
    donutFilterHoleDiameter: donutFilter.holeDiameter,
    donutAdapterInsertLength: donutFilter.insertLength,
    donutCapRim: donutCapRawRim(donutFilter.cap),
    donutCapEnabled: donutFilter.cap.type === "printed-cap",
  });
}

function toRawSettings(input: PurifierInput): RawPurifierSettings {
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
    transparentWalls: input.preview.enclosure.transparentWalls,
    explodedView: input.preview.enclosure.explodedView,
    showDimensions: input.preview.enclosure.showDimensions,
    showBananaScale: input.preview.enclosure.showBananaScale,
    showPrintSeams: input.preview.enclosure.showPrintSeams,
    showPrintPlateLabels: input.preview.printSheets.showPlateLabels,
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
      splitFrames: input.design.preset.model.defaults.splitFrames,
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
      splitFrames: input.design.preset.model.defaults.splitFrames,
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

  return {
    ...base,
    filters: input.design.filterCount,
    splitFrames: input.design.preset.model.defaults.splitFrames,
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
  return findPrintDesignPreset(id).model.type === "corsi-rosenthal";
}

export function isDonutFilterPrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).model.type === "donut-filter-adapter";
}

export function isStaticReferencePrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).model.type === "static-reference";
}

export function isLaserDerivedPrintDesignPreset(preset: PrintDesignPreset): preset is LaserDerivedPrintDesignPreset {
  return preset.model.type === "laser-derived-printable-kit";
}

export function isCorsiRosenthalPrintDesignPreset(preset: PrintDesignPreset): preset is CorsiRosenthalPrintDesignPreset {
  return preset.model.type === "corsi-rosenthal";
}

export function isDonutFilterAdapterPrintDesignPreset(preset: PrintDesignPreset): preset is DonutFilterAdapterPrintDesignPreset {
  return preset.model.type === "donut-filter-adapter";
}

export function isStaticReferencePrintDesignPreset(preset: PrintDesignPreset): preset is StaticReferencePrintDesignPreset {
  return preset.model.type === "static-reference";
}

export function staticPrintReferenceForPreset(preset: PrintDesignPreset): StaticPrintReference | undefined {
  return preset.model.type === "static-reference" ? preset.model.reference : undefined;
}

export function staticReferenceCanPreviewPrintPlates(preset: PrintDesignPreset): boolean {
  return preset.model.type === "static-reference" && staticPrintReferenceHasPlatePreview(preset.model.reference);
}

export function defaultFilterPresetForPrintDesign(preset: PrintDesignPreset): FilterPresetId {
  return preset.model.defaults.filterPreset;
}

export function defaultFanPresetForPrintDesign(preset: PrintDesignPreset): FanProductPresetId {
  return preset.model.defaults.fanPreset;
}

export function staticReferenceDefaultsForPreset(
  preset: PrintDesignPreset,
): StaticReferencePrintDesignDefaults | undefined {
  return preset.model.type === "static-reference" ? preset.model.defaults : undefined;
}

export function corsiFrameStyleForPreset(preset: PrintDesignPreset): CorsiRosenthalFrameStyle | undefined {
  return preset.model.type === "corsi-rosenthal" ? preset.model.frameStyle : undefined;
}

function requiredPrintDesignPreset(id: PrintDesignId): PrintDesignPreset {
  const preset = printDesignPresets.find((entry) => entry.id === id);
  if (preset === undefined) {
    throw new Error(`requiredPrintDesignPreset: Missing print design ${id}`);
  }
  return preset;
}

function requiredDonutFilterDefaults(preset: PrintDesignPreset): DonutFilterSettings {
  if (preset.model.type !== "donut-filter-adapter") {
    throw new Error(`requiredDonutFilterDefaults: ${preset.id} is not a donut-filter design`);
  }
  return preset.model.defaults.filter;
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

  if (preset.model.type === "corsi-rosenthal") {
    return {
      ...withRecommendedFilter,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      corsiMode: preset.model.defaults.mode,
      corsiFilterCount: preset.model.defaults.filterCount,
      corsiFanCount: fanCountRequestToRawSetting(preset.model.defaults.fanCount),
      splitFrames: preset.model.defaults.splitFrames,
      rim: preset.model.defaults.rim,
      materialThickness: preset.model.defaults.materialThickness,
      screwHoleDiameter: preset.model.defaults.screwHoleDiameter,
    };
  }

  if (preset.model.type === "donut-filter-adapter") {
    const donutPreset = findDonutFilterPreset(preset.model.defaults.donutFilterPreset);
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
      splitFrames: preset.model.defaults.splitFrames,
      rim: defaultSettings.rim,
      materialThickness: preset.model.defaults.materialThickness,
      screwHoleDiameter: preset.model.defaults.screwHoleDiameter,
    };
  }

  if (preset.model.type === "static-reference") {
    return {
      ...withRecommendedFilter,
      fansLeft: 0,
      fansRight: 0,
      fansTop: preset.model.defaults.fanCount,
      fansBottom: 0,
      corsiMode: defaultSettings.corsiMode,
      corsiFilterCount: defaultSettings.corsiFilterCount,
      corsiFanCount: preset.model.defaults.fanCount > 0 ? preset.model.defaults.fanCount : defaultSettings.corsiFanCount,
      donutFilterPreset: defaultSettings.donutFilterPreset,
      donutFilterOuterDiameter: defaultSettings.donutFilterOuterDiameter,
      donutFilterLength: defaultSettings.donutFilterLength,
      donutFilterHoleDiameter: defaultSettings.donutFilterHoleDiameter,
      donutAdapterInsertLength: defaultSettings.donutAdapterInsertLength,
      donutCapRim: defaultSettings.donutCapRim,
      donutCapEnabled: defaultSettings.donutCapEnabled,
      splitFrames: preset.model.defaults.splitFrames,
      rim: defaultSettings.rim,
      materialThickness: defaultSettings.materialThickness,
      screwHoleDiameter: defaultSettings.screwHoleDiameter,
    };
  }

  return {
    ...withRecommendedFilter,
    fansLeft: fanCountRequestToRawSetting(preset.model.defaults.fanBanks.left),
    fansRight: fanCountRequestToRawSetting(preset.model.defaults.fanBanks.right),
    fansTop: fanCountRequestToRawSetting(preset.model.defaults.fanBanks.top),
    fansBottom: fanCountRequestToRawSetting(preset.model.defaults.fanBanks.bottom),
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
    splitFrames: preset.model.defaults.splitFrames,
    rim: defaultSettings.rim,
    materialThickness: defaultSettings.materialThickness,
    screwHoleDiameter: defaultSettings.screwHoleDiameter,
  };
}

// #######################################
// Corsi-Rosenthal Layout Rules
// #######################################

export function resolveCorsiRosenthalFanCount(layout: LayoutResult): number {
  if (!isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
    throw new Error("resolveCorsiRosenthalFanCount: Layout is not using the Corsi-Rosenthal print design");
  }
  const mode = canonicalCorsiRosenthalMode(layout.rawSettings.corsiMode);
  const fanCount = canonicalCorsiFanCount(layout.rawSettings.corsiFanCount, layout.configuration.printDesign.id, mode);
  if (fanCount !== automaticFanCount && corsiFanCountFitsLayout(layout, mode, fanCount)) {
    return fanCount;
  }
  return resolveAutomaticCorsiFanCount(layout, mode);
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

// #######################################
// URL Settings
// #######################################

export function encodeSettings(settings: RawPurifierSettings): string {
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
  params.set("transparentWalls", String(settings.transparentWalls));
  params.set("explodedView", String(settings.explodedView));
  params.set("showDimensions", String(settings.showDimensions));
  params.set("showBananaScale", String(settings.showBananaScale));
  params.set("showPrintSeams", String(settings.showPrintSeams));
  params.set("showPrintPlateLabels", String(settings.showPrintPlateLabels));
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
    transparentWalls: readBoolean(params, "transparentWalls", defaultSettings.transparentWalls),
    explodedView: readBoolean(params, "explodedView", defaultSettings.explodedView),
    showDimensions: readBoolean(params, "showDimensions", defaultSettings.showDimensions),
    showBananaScale: readBoolean(params, "showBananaScale", defaultSettings.showBananaScale),
    showPrintSeams: readBoolean(params, "showPrintSeams", defaultSettings.showPrintSeams),
    showPrintPlateLabels: readBoolean(params, "showPrintPlateLabels", defaultSettings.showPrintPlateLabels),
    autoRotate: readBoolean(params, "autoRotate", defaultSettings.autoRotate),
    cameraPreset: readCameraPreset(params, "cameraPreset", defaultSettings.cameraPreset),
    labels: readBoolean(params, "labels", defaultSettings.labels),
    referenceScale: readNumber(params, ["referenceScale", "reference"], defaultSettings.referenceScale),
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

// #######################################
// Settings Helpers
// #######################################

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
      frameStyle: printDesign.model.frameStyle,
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
        count: printDesign.model.defaults.fanCount,
      },
    };
  }

  return {
    type: "static-reference",
    preset: printDesign,
    reference: printDesign.model.reference,
    capabilities: printDesign.model.reference.capabilities,
    filter: input.filter,
    filterCount: printDesign.model.defaults.filterCount,
    fanCount: printDesign.model.defaults.fanCount,
  };
}

function createPreviewSettings(raw: RawPurifierSettings, referenceScale: ReferenceScale): PreviewSettings {
  const cameraPreset = cameraPresets.includes(raw.cameraPreset) ? raw.cameraPreset : defaultSettings.cameraPreset;
  const enclosure: EnclosurePreviewOptions = {
    showFilterMedia: raw.showFilterMedia,
    showFans: raw.showFans,
    showFilterFrame: raw.showFilterFrame,
    transparentWalls: raw.transparentWalls,
    explodedView: raw.explodedView,
    showDimensions: raw.showDimensions,
    showBananaScale: raw.showBananaScale,
    showPrintSeams: raw.showPrintSeams,
    autoRotate: raw.autoRotate,
    cameraPreset,
  };
  const printSheets: PrintSheetPreviewOptions = {
    showPlateLabels: raw.showPrintPlateLabels,
  };
  const cutSheet: CutSheetPreviewOptions = {
    showLabels: raw.labels,
    referenceScale,
  };

  return {
    enclosure,
    printSheets,
    cutSheet,
  };
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
    cap: settings.donutCapEnabled
      ? {
          type: "printed-cap",
          rim: clamp(settings.donutCapRim, 0, 40),
        }
      : { type: "none" },
  };
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

function canonicalizePrintDesignRawSettings(settings: RawPurifierSettings): RawPurifierSettings {
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
    ? fanCountRequestToRawSetting(preset.model.defaults.fanCount)
    : defaultSettings.corsiFanCount;
}

function resolveAutomaticCorsiFanCount(layout: LayoutResult, mode: CorsiRosenthalMode): number {
  const candidates = mode === "side-exhaust" ? [6, 4, 2] : [8, 6, 4, 3, 2, 1];

  for (const candidate of candidates) {
    if (corsiFanCountFitsLayout(layout, mode, candidate)) {
      return candidate;
    }
  }

  return mode === "side-exhaust" ? 2 : 1;
}

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

function corsiFanCountFitsLayout(layout: LayoutResult, mode: CorsiRosenthalMode, fanCount: number): boolean {
  return corsiFanCountFits({
    mode,
    fanCount,
    filterDimensions: filterSelectionDimensions(layout.configuration.filter),
    fanDiameter: layout.configuration.fan.spec.diameter,
  });
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

function isPresetDonutFilterId(id: DonutFilterPresetId): id is PresetDonutFilterId {
  return id !== customDonutFilterPresetId;
}

function isPresetFanProductId(id: FanProductPresetId): id is PresetFanProductId {
  return id !== customFanProductPresetId;
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

function readNumber(params: URLSearchParams, key: string | readonly string[], fallback: number): number {
  const value = readParam(params, key);
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
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
  const recommended = defaultCorsiFanCountForPrintDesign(printDesign);
  if (params.has("corsiFanCount")) {
    return readAutomaticInteger(params, "corsiFanCount", recommended);
  }
  if (isCorsiRosenthalPrintDesignId(printDesign) && hasAnyParam(params, ["fansLeft", "fans_left"])) {
    return readInteger(params, ["fansLeft", "fans_left"], recommended);
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
