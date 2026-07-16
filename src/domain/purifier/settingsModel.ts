// Purifier settings model: the raw, structured, and draft settings types,
// camera and preview-material vocabulary, the default settings, and the
// preset-application functions that rewrite raw settings when the user picks
// a tempest arrangement or print design preset.


import type { CadrEstimate } from "@/domain/purifier/cadr";
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
      // One-side "Back" fan grid count (laser), in addition to the wall banks.
      readonly backPlateFans: number;
    }
  | {
      readonly type: "donut-filter-adapter";
      readonly fanCount: FixedFanCount;
    }
  | {
      readonly type: "tempest";
      readonly arrangement: TempestArrangementPreset;
      readonly fanCount: number;
      // A wall/top cord that still runs through a fan after the layout has tried to
      // clear it (a max-packed fan wall, or a tower corner with no gap). Surfaced as
      // a build warning.
      readonly cordThroughFan: boolean;
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
  cordHole: CuttingCordHole;
};

// Power-cord pass-through bore for the laser enclosure. diameter <= 0 (or
// wall "none") means no hole. Mirrors the 3D-print cord pass-through controls.
export type CuttingCordHole = {
  readonly diameter: Millimeters;
  readonly wall: CordHoleWall;
  readonly side: CordHoleSide;
  readonly cornerOffset: Millimeters;
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
  { id: "matte-gray", label: "Gray", color: 0x82858a },
  { id: "warm-white", label: "White", color: 0xf3f0e6 },
  { id: "natural-tan", label: "Tan", color: 0xc7965a },
  { id: "forest-green", label: "Green", color: 0x1f6f56 },
  { id: "matte-black", label: "Black", color: 0x111817 },
] as const;

export type PreviewMaterialColorPreset =
  (typeof previewMaterialColorPresets)[number];
export type PreviewMaterialColorId = PreviewMaterialColorPreset["id"];

const defaultPreviewMaterialColorId: PreviewMaterialColorId = "matte-gray";

export type CutSheetPreviewOptions = {
  readonly showLabels: boolean;
  readonly referenceScale: ReferenceScale;
};

// #######################################
// Settings Model
// #######################################

// Tempest 4-filter tower top exhaust: the PC-fan grid, or a box/exhaust fan with
// a central hole and two screw rings (mirrors tempest-builder.html).
export const topExhausts = ["fan-grid", "box-exhaust"] as const;
export type TopExhaust = (typeof topExhausts)[number];

// Cut-sheet construction style for the cut-panel (laser-cut design) family:
// "laser" is the finger-jointed, flanged laser box; "hand" is the foamcore
// hand-cut box (plain taped edges, no flanges, box depth = fan + filter).
export const cutStyles = ["laser", "hand"] as const;
export type CutStyle = (typeof cutStyles)[number];

// Tempest preset designs. "custom" is the fully user-driven build; named designs
// (e.g. Nukit Tempest Euro) apply a complete tempest configuration when chosen.
export const tempestDesigns = [
  "nukit-tempest-euro",
  "nukit-tempest-euro-cube",
  "nukit-tempest-original",
  "nukit-tempest-original-cube",
  "nukit-tempest-pro",
  "custom",
] as const;
export type TempestDesign = (typeof tempestDesigns)[number];
export const tempestDesignLabels: Readonly<Record<TempestDesign, string>> = {
  "nukit-tempest-euro": "Nukit Tempest Euro",
  "nukit-tempest-euro-cube": "Nukit Tempest Euro Cube",
  "nukit-tempest-original": "Nukit Tempest Original",
  "nukit-tempest-original-cube": "Nukit Tempest Original Cube (Big John)",
  "nukit-tempest-pro": "Nukit Tempest Pro",
  custom: "Custom",
};

// Tempest cord pass-through choices (mirrors tempest-builder.html).
export const cordHoleWalls = ["none", "front", "back", "left", "right"] as const;
export type CordHoleWall = (typeof cordHoleWalls)[number];
export const cordHoleSides = ["left", "center", "right"] as const;
export type CordHoleSide = (typeof cordHoleSides)[number];

// Which wall the filter insertion slots are cut into for the horizontal layouts
// (1-top / sandwich). "back" renders at the visual top, "front" at the bottom —
// matching the fan-placement orientation. The tower always loads from the top
// plate, so this is ignored there.
export const filterSlotWalls = ["front", "back", "left", "right"] as const;
export type FilterSlotWall = (typeof filterSlotWalls)[number];

export type RawPurifierSettings = {
  printDesign: PrintDesignId;
  filterWidth: Millimeters;
  filterDepth: Millimeters;
  filterThickness: Millimeters;
  rim: Millimeters;
  fanColor: FanColor;
  fanDiameter: FanDiameter;
  // CADR estimation: the chosen fan model id (a PC fan id for 120/140, a box-fan id
  // for Box/Exhaust, or "custom"); empty resolves to the size default. The custom*
  // fields supply specs when "custom" is selected. Display-only (no geometry).
  fanModel: string;
  customFanAirflow: number; // free-air Q0, m³/h
  customFanPressure: number; // static pressure P0, mmH₂O
  customFanNoise: number; // dBA (0 = unknown)
  customFanCurrent: number; // A @ 12 V (PC custom)
  customFanWatts: number; // W (box/exhaust custom)
  // Room sizing for the ACH (air-changes-per-hour) estimate. Display-only (no
  // geometry). Dimensions are stored in the selected roomUnit ("ft" or "m").
  roomUnit: string;
  roomWidth: number;
  roomLength: number;
  roomHeight: number;
  // The room's baseline ventilation in air changes per hour (windows, HVAC, leakage),
  // used only to estimate how much the purifier reduces long-range airborne infection
  // risk. Display-only.
  baselineAch: number;
  // Electricity cost estimate (display-only): price per kWh in the chosen currency,
  // and the currency symbol to prefix it with.
  electricityPrice: number;
  currencySymbol: string;
  filters: FilterCount;
  splitFrames: boolean;
  // Cut-sheet construction style (laser-cut design family): "laser" or "hand".
  cutStyle: CutStyle;
  fansLeft: number;
  fansRight: number;
  fansTop: number;
  fansBottom: number;
  tempestArrangement: TempestArrangementPreset;
  // Tempest-only: which preset design is selected ("custom" = user-driven).
  tempestDesign: TempestDesign;
  // Tempest horizontal layouts: which wall the filter insertion slots open on.
  filterSlotWall: FilterSlotWall;
  // Tempest-only: clearance added per side around the MEASURED filter so it
  // slides into its cavity; separate from the measurement on purpose.
  filterFitClearance: Millimeters;
  // Tempest-only: bore diameter of the power-cord hole in the right wall.
  cordHoleDiameter: Millimeters;
  // Tempest-only: which wall the cord exits ("none" disables it), the position
  // along that wall, and how far the hole sits from the corner.
  cordHoleWall: CordHoleWall;
  cordHoleSide: CordHoleSide;
  cordHoleCornerOffset: Millimeters;
  // Tempest-only: top/bottom outer frame thickness, independent of the wall
  // thickness so the frame can be beefier for filter retention.
  outsideFlangeThickness: Millimeters;
  // Tempest-only: deboss a two-letter seam code on the inner wall by each seam of
  // a split (multi-chunk) print so glued pieces are easy to match.
  chunkLabels: boolean;
  // Tempest-only: honeycomb fan grill. hexGrill off = a plain circular opening;
  // hexSize is the hex flat-to-flat, hexSpacing the rib between cells.
  hexGrill: boolean;
  hexSize: Millimeters;
  hexSpacing: Millimeters;
  // Grill cells at the bore edge: false (default) clips partial hexes to the
  // circle; true keeps only whole cells. Applies to both 3D-print and laser.
  hexFullCellsOnly: boolean;
  // Tempest one-side (single-horizontal-top-filter) only: the "Back" fan grid on
  // the solid plate opposite the filter, as a fan count: -1 = automatic (fill the
  // grid), 0 = none, N = that many fans. (Legacy URLs used true/false; the codec
  // maps those to -1/0.)
  backPlateFans: number;
  // Tempest one-side "panel" (Back on) only: the chamber depth between the inside
  // filter flange and the inside back wall, in mm.
  boxDepth: Millimeters;
  // Tempest-only: diameter of the printed alignment-pin holes along each seam, in
  // mm. 0 disables the pins entirely; values above 0 (up to 2.5) size the holes.
  alignmentPinDiameter: Millimeters;
  // Tempest 4-filter tower only: add a fifth filter on the bottom (square filters
  // only) and the length of the corner feet that lift the box for bottom airflow.
  bottomFilter: boolean;
  feetLength: Millimeters;
  // Tempest 4-filter tower only: top exhaust style and box/exhaust geometry. A
  // value of 0 for a size/radius means "auto" (derived from the filter width).
  topExhaust: TopExhaust;
  boxFanHoleSize: Millimeters;
  boxRingOneScrewHoles: number;
  boxRingOneScrewDiameter: Millimeters;
  boxRingOneDiameter: Millimeters;
  boxRingTwoScrewHoles: number;
  boxRingTwoScrewDiameter: Millimeters;
  boxRingTwoDiameter: Millimeters;
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
  // CADR fan-model selection (display-only); see RawPurifierSettings.fanModel.
  readonly model: string;
  readonly customAirflow: number;
  readonly customPressure: number;
  readonly customNoise: number;
  readonly customCurrent: number;
  readonly customWatts: number;
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
  // "laser" (finger-jointed, flanged) or "hand" (foamcore, plain taped edges).
  readonly cutStyle: CutStyle;
  readonly cordHoleDiameter: Millimeters;
  readonly cordHoleWall: CordHoleWall;
  readonly cordHoleSide: CordHoleSide;
  readonly cordHoleCornerOffset: Millimeters;
  // Honeycomb fan grill: off = plain circular bore; on = a field of hexes cut into
  // each fan opening. hexSize is the hex flat-to-flat, hexSpacing the rib between
  // cells. Mirrors the 3D-Print honeycomb grill.
  readonly hexGrill: boolean;
  readonly hexSize: Millimeters;
  readonly hexSpacing: Millimeters;
  readonly hexFullCellsOnly: boolean;
  // One-side "Back" fan grid on the closed back panel: 0 = off, -1 = automatic
  // (fill), >0 = exact count. Mirrors the 3D-Print Back fan toggle.
  readonly backPlateFans: number;
  // One-side "Back" box depth: the chamber depth between the filter and the back
  // plate, used in place of the fan-diameter chamber. Mirrors 3D Print.
  readonly boxDepth: Millimeters;
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
  readonly design: TempestDesign;
  readonly filterSlotWall: FilterSlotWall;
  readonly filter: FilterDimensions;
  // Per-wall fan banks for the horizontal (1-top / 2-sandwich) layouts; ignored by
  // the four-side tower (which exhausts through the top).
  readonly fanBanks: FanBanks<FanCountRequest>;
  readonly filterFitClearance: Millimeters;
  readonly cordHoleDiameter: Millimeters;
  readonly cordHoleWall: CordHoleWall;
  readonly cordHoleSide: CordHoleSide;
  readonly cordHoleCornerOffset: Millimeters;
  readonly outsideFlangeThickness: Millimeters;
  readonly chunkLabels: boolean;
  readonly hexGrill: boolean;
  readonly hexSize: Millimeters;
  readonly hexSpacing: Millimeters;
  readonly hexFullCellsOnly: boolean;
  readonly backPlateFans: number;
  readonly boxDepth: Millimeters;
  readonly alignmentPinDiameter: Millimeters;
  readonly bottomFilter: boolean;
  readonly feetLength: Millimeters;
  readonly topExhaust: TopExhaust;
  readonly boxFanHoleSize: Millimeters;
  readonly boxRingOneScrewHoles: number;
  readonly boxRingOneScrewDiameter: Millimeters;
  readonly boxRingOneDiameter: Millimeters;
  readonly boxRingTwoScrewHoles: number;
  readonly boxRingTwoScrewDiameter: Millimeters;
  readonly boxRingTwoDiameter: Millimeters;
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

// Room dimensions for the ACH estimate (display-only). unit is "ft" or "m";
// width/length/height are expressed in that unit.
export type PurifierRoomDraft = {
  readonly unit: string;
  readonly width: number;
  readonly length: number;
  readonly height: number;
  // Baseline room ventilation (ACH) used for the infection-risk estimate.
  readonly baselineAch: number;
};

// Electricity cost inputs for the operating-cost estimate (display-only).
export type PurifierCostDraft = {
  readonly electricityPrice: number;
  readonly currencySymbol: string;
};

export type PurifierDraft = {
  readonly design: PurifierDesignDraft;
  readonly fan: PurifierFanDraft;
  readonly cutting: PurifierCuttingDraft;
  readonly preview: PreviewSettings;
  readonly room: PurifierRoomDraft;
  readonly cost: PurifierCostDraft;
};

export type ConfiguredPrintDesign =
  | {
      readonly type: "laser-cut";
      readonly preset: LaserCutDesignPreset;
      readonly filter: FilterDimensions;
      readonly filterCount: FilterCount;
      readonly fanBanks: FanBanks<FanCountRequest>;
      readonly frameConstruction: FilterFrameConstruction;
      readonly cutStyle: CutStyle;
      readonly cordHoleDiameter: Millimeters;
      readonly cordHoleWall: CordHoleWall;
      readonly cordHoleSide: CordHoleSide;
      readonly cordHoleCornerOffset: Millimeters;
      readonly hexGrill: boolean;
      readonly hexSize: Millimeters;
      readonly hexSpacing: Millimeters;
      readonly hexFullCellsOnly: boolean;
      readonly backPlateFans: number;
      readonly boxDepth: Millimeters;
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
      readonly design: TempestDesign;
      readonly filterSlotWall: FilterSlotWall;
      readonly filter: FilterDimensions;
      readonly filterFitClearance: Millimeters;
      readonly cordHoleDiameter: Millimeters;
      readonly cordHoleWall: CordHoleWall;
      readonly cordHoleSide: CordHoleSide;
      readonly cordHoleCornerOffset: Millimeters;
      readonly outsideFlangeThickness: Millimeters;
      readonly chunkLabels: boolean;
      readonly hexGrill: boolean;
      readonly hexSize: Millimeters;
      readonly hexSpacing: Millimeters;
      readonly hexFullCellsOnly: boolean;
      readonly backPlateFans: number;
      readonly boxDepth: Millimeters;
      readonly alignmentPinDiameter: Millimeters;
      readonly bottomFilter: boolean;
      readonly feetLength: Millimeters;
      readonly topExhaust: TopExhaust;
      readonly boxFanHoleSize: Millimeters;
      readonly boxRingOneScrewHoles: number;
      readonly boxRingOneScrewDiameter: Millimeters;
      readonly boxRingOneDiameter: Millimeters;
      readonly boxRingTwoScrewHoles: number;
      readonly boxRingTwoScrewDiameter: Millimeters;
      readonly boxRingTwoDiameter: Millimeters;
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
  cadr: CadrEstimate;
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
  // Laser Cut is the default fabrication method; default it to the Nukit Tempest
  // Euro design (STARKVIND filter, top fans).
  filterWidth: 365,
  filterDepth: 285,
  filterThickness: 35,
  rim: 30,
  fanColor: defaultFanColor,
  fanDiameter: 140,
  filters: 2,
  splitFrames: true,
  cutStyle: "laser",
  fanModel: "",
  customFanAirflow: 0,
  customFanPressure: 0,
  customFanNoise: 0,
  customFanCurrent: 0,
  customFanWatts: 0,
  roomUnit: "ft",
  roomWidth: 12,
  roomLength: 12,
  roomHeight: 8,
  baselineAch: 1,
  electricityPrice: 0.1765,
  currencySymbol: "$",
  fansLeft: 0,
  fansRight: 0,
  fansTop: automaticFanCount,
  fansBottom: 0,
  tempestArrangement: "dual-horizontal-sandwich",
  tempestDesign: "custom",
  filterSlotWall: "back",
  filterFitClearance: 1,
  cordHoleDiameter: defaultTempestCordPassThrough.diameter,
  cordHoleWall: defaultTempestCordPassThrough.wall,
  cordHoleSide: defaultTempestCordPassThrough.side,
  cordHoleCornerOffset: defaultTempestCordPassThrough.cornerOffset,
  outsideFlangeThickness: 10,
  chunkLabels: true,
  hexGrill: true,
  hexSize: 10,
  hexSpacing: 1.6,
  hexFullCellsOnly: false,
  backPlateFans: 0,
  boxDepth: 70,
  alignmentPinDiameter: 2,
  bottomFilter: false,
  feetLength: 0,
  topExhaust: "fan-grid",
  // Box/exhaust sizes are concrete diameters, auto-populated from the filter
  // width (fan hole 70%, ring 1 80%, ring 2 90%) — here for the default width.
  ...boxExhaustDiametersForWidth(defaultRectangularFilterDimensions.width),
  boxRingOneScrewHoles: 4,
  boxRingOneScrewDiameter: 6,
  boxRingTwoScrewHoles: 4,
  boxRingTwoScrewDiameter: 6,
  donutFilterOuterDiameter: 125,
  donutFilterLength: 150,
  donutFilterHoleDiameter: 92,
  donutAdapterInsertLength: 10,
  donutCapRim: 10,
  donutCapEnabled: true,
  screwHoleDiameter: 5,
  materialThickness: 3,
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

// The "Nukit Tempest Euro" preset: a 2-filter sandwich around a 365x285x35
// STARKVIND filter, fans on the left/right/back walls (Arctic P14 Max), honeycomb
// grill, right-wall cord, forest-green preview. These are the design's defining
// fields; the fabrication mode (3D print / laser / hand) is chosen by the user.
export const nukitTempestEuroDesignOverrides = {
  filterWidth: 365,
  filterDepth: 285,
  filterThickness: 35,
  rim: 30,
  fanColor: "black",
  fanDiameter: 140,
  fanModel: "arctic-p14-max",
  filters: 2,
  fansLeft: automaticFanCount,
  fansRight: automaticFanCount,
  fansTop: automaticFanCount,
  fansBottom: 0,
  backPlateFans: automaticFanCount,
  boxDepth: 50,
  tempestArrangement: "dual-horizontal-sandwich",
  filterSlotWall: "back",
  filterFitClearance: 1,
  cordHoleDiameter: 10,
  cordHoleWall: "right",
  cordHoleSide: "center",
  cordHoleCornerOffset: 17,
  outsideFlangeThickness: 10,
  hexGrill: true,
  hexSize: 10,
  hexSpacing: 1.6,
  hexFullCellsOnly: false,
  topExhaust: "fan-grid",
  alignmentPinDiameter: 2,
  screwHoleDiameter: 5,
  materialThickness: 5,
  // No previewMaterialColor here: applyTempestDesign forces the gray preview for
  // the 3D-print euro, so listing a color as a defining field made the design
  // reconcile straight back to Custom.
  ...boxExhaustDiametersForWidth(365),
} satisfies Partial<RawPurifierSettings>;

// The "Nukit Tempest Euro Cube": the Euro preset (same 365x285x35 STARKVIND
// filter, fan model, grill, colour) rebuilt as a 4-side-filter tower. The tower
// exhausts through the top only, so the side fan banks are off.
export const nukitTempestEuroCubeDesignOverrides = {
  ...nukitTempestEuroDesignOverrides,
  tempestArrangement: "four-side-filter-tower",
  fansLeft: 0,
  fansRight: 0,
  fansTop: automaticFanCount,
  fansBottom: 0,
} satisfies Partial<RawPurifierSettings>;

// The "Nukit Tempest Original": a 2-filter sandwich around a 495x495x44 filter
// with side (left/right) fans, honeycomb grill, right-wall cord.
export const nukitTempestOriginalDesignOverrides = {
  filterWidth: 495,
  filterDepth: 495,
  filterThickness: 44,
  rim: 30,
  fanColor: "black",
  fanDiameter: 140,
  fanModel: "arctic-p14-pwm-pst",
  filters: 2,
  fansLeft: automaticFanCount,
  fansRight: 0,
  fansTop: automaticFanCount,
  fansBottom: 0,
  tempestArrangement: "dual-horizontal-sandwich",
  filterSlotWall: "back",
  filterFitClearance: 1,
  cordHoleDiameter: 10,
  cordHoleWall: "right",
  cordHoleSide: "center",
  cordHoleCornerOffset: 17,
  outsideFlangeThickness: 10,
  hexGrill: true,
  hexSize: 10,
  hexSpacing: 1.6,
  hexFullCellsOnly: false,
  topExhaust: "fan-grid",
  alignmentPinDiameter: 2,
  screwHoleDiameter: 5,
  materialThickness: 5,
  ...boxExhaustDiametersForWidth(495),
} satisfies Partial<RawPurifierSettings>;

// The "Nukit Tempest Original Cube": the Original rebuilt as a 4-side-filter
// tower with top fans (same 495x495x44 filter).
export const nukitTempestOriginalCubeDesignOverrides = {
  ...nukitTempestOriginalDesignOverrides,
  fansLeft: 0,
  fansRight: 0,
  fansTop: automaticFanCount,
  tempestArrangement: "four-side-filter-tower",
  // Plain circular fan opening (no honeycomb grill), and a bottom filter lifted
  // on 100 mm feet so air can reach its underside.
  hexGrill: false,
  bottomFilter: true,
  feetLength: 100,
} satisfies Partial<RawPurifierSettings>;

// The "Nukit Tempest Pro": a 2-filter sandwich around a 500x622x19 filter with
// left/right fans, matching 500mm box-exhaust rings.
export const nukitTempestProDesignOverrides = {
  ...nukitTempestOriginalDesignOverrides,
  filterWidth: 500,
  filterDepth: 622,
  filterThickness: 19,
  fansLeft: automaticFanCount,
  fansRight: automaticFanCount,
  fansTop: 0,
  fansBottom: 0,
  tempestArrangement: "dual-horizontal-sandwich",
  ...boxExhaustDiametersForWidth(500),
} satisfies Partial<RawPurifierSettings>;

// Apply a named tempest design. "custom" just records the choice; a named design
// applies its full configuration so the build matches the preset.
export function applyTempestDesign(settings: RawPurifierSettings, design: TempestDesign): RawPurifierSettings {
  if (design === "nukit-tempest-euro") {
    // 3D print uses the grey preview; the green preview is the laser-cut look.
    return { ...settings, ...nukitTempestEuroDesignOverrides, previewMaterialColor: "matte-gray", tempestDesign: "nukit-tempest-euro" };
  }
  if (design === "nukit-tempest-euro-cube") {
    return { ...settings, ...nukitTempestEuroCubeDesignOverrides, previewMaterialColor: "matte-gray", tempestDesign: "nukit-tempest-euro-cube" };
  }
  if (design === "nukit-tempest-original") {
    return { ...settings, ...nukitTempestOriginalDesignOverrides, tempestDesign: "nukit-tempest-original" };
  }
  if (design === "nukit-tempest-original-cube") {
    return { ...settings, ...nukitTempestOriginalCubeDesignOverrides, tempestDesign: "nukit-tempest-original-cube" };
  }
  if (design === "nukit-tempest-pro") {
    return { ...settings, ...nukitTempestProDesignOverrides, tempestDesign: "nukit-tempest-pro" };
  }
  return { ...settings, tempestDesign: canonicalTempestDesign(design) };
}

// The override set that defines each named tempest design. A design is "matched"
// only while every one of its overridden fields still equals the preset value.
const tempestDesignOverridesByName: Readonly<Record<Exclude<TempestDesign, "custom">, Partial<RawPurifierSettings>>> = {
  "nukit-tempest-euro": nukitTempestEuroDesignOverrides,
  "nukit-tempest-euro-cube": nukitTempestEuroCubeDesignOverrides,
  "nukit-tempest-original": nukitTempestOriginalDesignOverrides,
  "nukit-tempest-original-cube": nukitTempestOriginalCubeDesignOverrides,
  "nukit-tempest-pro": nukitTempestProDesignOverrides,
};

// Switch the design selection to "Custom" once any of the selected preset's
// defining fields has been edited away from the preset value. A no-op for
// "custom" and for settings that still match their named design exactly.
export function reconcileTempestDesign(settings: RawPurifierSettings): RawPurifierSettings {
  if (settings.tempestDesign === "custom") {
    return settings;
  }
  const overrides = tempestDesignOverridesByName[settings.tempestDesign];
  const matchesPreset = (Object.keys(overrides) as (keyof RawPurifierSettings)[]).every(
    (key) => settings[key] === overrides[key],
  );
  return matchesPreset ? settings : { ...settings, tempestDesign: "custom" };
}

// ##############################
// Laser Cut "Design" presets
// ##############################

// The Laser Cut Layout "Design" selector. Each named design is just a filter
// size + fan placement; everything else (rim, cord, joints, split frames) is the
// shared laser default. The selection is derived from the settings — editing any
// of a design's fields makes it read as "Custom" — so there is no stored field.
export const nukitLaserDesigns = ["nukit-tempest-euro", "nukit-tempest-original", "nukit-tempest-pro", "custom"] as const;
export type NukitLaserDesign = (typeof nukitLaserDesigns)[number];

export const nukitLaserDesignLabels: Readonly<Record<NukitLaserDesign, string>> = {
  "nukit-tempest-euro": "Nukit Tempest Euro",
  "nukit-tempest-original": "Nukit Tempest Original",
  "nukit-tempest-pro": "Nukit Tempest Pro",
  custom: "Custom",
};

const nukitLaserDesignFields = {
  // STARKVIND, left/right/back fans (match fields; the full preset is applied below).
  "nukit-tempest-euro": { filterWidth: 365, filterDepth: 285, filterThickness: 35, fansLeft: automaticFanCount, fansRight: automaticFanCount, fansTop: automaticFanCount, fansBottom: 0 },
  // Original 495 cube, right + top fans.
  "nukit-tempest-original": { filterWidth: 495, filterDepth: 495, filterThickness: 44, fansLeft: 0, fansRight: automaticFanCount, fansTop: automaticFanCount, fansBottom: 0 },
  // Pro 500x622, side fans.
  "nukit-tempest-pro": { filterWidth: 500, filterDepth: 622, filterThickness: 19, fansLeft: automaticFanCount, fansRight: automaticFanCount, fansTop: 0, fansBottom: 0 },
} satisfies Readonly<Record<Exclude<NukitLaserDesign, "custom">, Partial<RawPurifierSettings>>>;

export function applyNukitLaserDesign(settings: RawPurifierSettings, design: NukitLaserDesign): RawPurifierSettings {
  if (design === "custom") {
    return settings;
  }
  // The Euro shares its full spec (fan model, preview colour, rim, cord, flange,
  // grill, material) with the 3D-print Euro, so laser/hand match it exactly; the
  // tower-only fields it carries are inert here. The print design (nukit-open-air)
  // and cut style are left untouched.
  if (design === "nukit-tempest-euro") {
    // Laser cut keeps the green preview; hand cut (foamcore) uses grey.
    return {
      ...settings,
      ...nukitTempestEuroDesignOverrides,
      previewMaterialColor: settings.cutStyle === "hand" ? "matte-gray" : "forest-green",
    };
  }
  // Original / Pro: their geometry plus the standard ARCTIC P14 PWM PST fan model
  // (the fan model is not a match field, so changing it won't drop the preset).
  return { ...settings, ...nukitLaserDesignFields[design], fanModel: "arctic-p14-pwm-pst" };
}

// The design whose filter size and fan placement match the current settings, or
// "custom" if none do.
export function matchedNukitLaserDesign(settings: RawPurifierSettings): NukitLaserDesign {
  const match = (Object.keys(nukitLaserDesignFields) as Exclude<NukitLaserDesign, "custom">[]).find((id) => {
    const fields = nukitLaserDesignFields[id] as Partial<Record<keyof RawPurifierSettings, number>>;
    return (Object.keys(fields) as (keyof RawPurifierSettings)[]).every(
      (key) => Math.round(settings[key] as number) === fields[key],
    );
  });
  return match ?? "custom";
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

export function canonicalTempestDesign(
  value: TempestDesign | string | null | undefined,
): TempestDesign {
  return tempestDesigns.find((design) => design === value) ?? defaultSettings.tempestDesign;
}

export function canonicalFilterSlotWall(
  value: FilterSlotWall | string | null | undefined,
): FilterSlotWall {
  return filterSlotWalls.find((wall) => wall === value) ?? defaultSettings.filterSlotWall;
}

// Box/exhaust sizes auto-populate from the filter width: the central fan hole is
// 75% of the width, and the two screw-ring radii are 50% / 60% of the width (so
// the ring diameters are 100% / 120% of the width). These are concrete numbers
// the UI shows and only refreshes when the width changes.
export function boxExhaustDiametersForWidth(width: Millimeters): {
  readonly boxFanHoleSize: Millimeters;
  readonly boxRingOneDiameter: Millimeters;
  readonly boxRingTwoDiameter: Millimeters;
} {
  return {
    boxFanHoleSize: Math.round(0.75 * width),
    boxRingOneDiameter: Math.round(1.0 * width),
    boxRingTwoDiameter: Math.round(1.2 * width),
  };
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
    // The tower has no side-wall fans; "top" toggles the top-panel fan grid
    // (automatic = grid on, 0 = no top fans).
    return {
      left: 0,
      right: 0,
      top: automaticFanCount,
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
