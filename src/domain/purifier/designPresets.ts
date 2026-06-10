// Print design catalog: design identifiers, donut filter types and presets,
// print design preset types (laser-derived, donut adapter, tempest, static
// reference), the preset catalogs, public-release filtering, and lookups.

import type { Millimeters } from "@/domain/units";
import type { FilterPresetId } from "@/domain/purifier/filter";
import type {
  FanBanks,
  FanCountRequest,
  FanDiameter,
  FixedFanCount,
} from "@/domain/purifier/fanProducts";
import {
  staticPrintReferenceIds,
  staticPrintReferences,
  type StaticPrintReference,
} from "@/resources/static-print-references/references";

// ##############################
// Design Identifiers
// ##############################

export type FilterCount = 1 | 2;

export const printDesignIds = [
  "nukit-open-air",
  "nukit-tempest",
  "donut-hepa-adapter",
  ...staticPrintReferenceIds,
] as const;

export type PrintDesignId = (typeof printDesignIds)[number];

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
  readonly measurementNote: string;
  readonly settings: DonutFilterSettings;
};

export type PresetDonutFilter = DonutFilterPreset & {
  readonly id: PresetDonutFilterId;
};

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
  readonly implementation: Extract<
    PrintDesignImplementation,
    { readonly type: "laser-derived-printable-kit" }
  >;
};

export type DonutFilterAdapterPrintDesignPreset = PrintDesignPresetBase & {
  readonly implementation: Extract<
    PrintDesignImplementation,
    { readonly type: "donut-filter-adapter" }
  >;
};

export type TempestPrintDesignPreset = PrintDesignPresetBase & {
  readonly implementation: Extract<
    PrintDesignImplementation,
    { readonly type: "tempest" }
  >;
};

export type StaticReferencePrintDesignPreset = PrintDesignPresetBase & {
  readonly implementation: Extract<
    PrintDesignImplementation,
    { readonly type: "static-reference" }
  >;
};

export type PrintDesignPreset =
  | LaserDerivedPrintDesignPreset
  | DonutFilterAdapterPrintDesignPreset
  | TempestPrintDesignPreset
  | StaticReferencePrintDesignPreset;

export type CommonPrintDesignDefaults = {
  readonly filterPreset: FilterPresetId;
  readonly fanDiameter: FanDiameter;
};

export type LaserDerivedPrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly filterCount: FilterCount;
  readonly fanBanks: FanBanks<FanCountRequest>;
  readonly splitFrames: boolean;
};

export type DonutFilterAdapterPrintDesignDefaults =
  CommonPrintDesignDefaults & {
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

export type TempestArrangementPreset =
  (typeof tempestArrangementPresets)[number];

export const defaultFilterPresetByTempestArrangement = {
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

export const customDonutFilterPresetId: DonutFilterPresetId = "custom";
export const defaultDonutFilterPresetId: PresetDonutFilterId =
  "silentnight-92-reference";

// #######################################
// Donut Filter Presets
// #######################################

export const donutFilterPresets: readonly DonutFilterPreset[] = [
  {
    id: "silentnight-92-reference",
    label: "Silentnight-style 92 mm cartridge",
    detail:
      "Compact round HEPA cartridge used by the OpenSCAD reference adapter.",
    source: "OpenSCAD reference dimensions",
    measurementNote:
      "The reference script uses a 92 mm center hole; measure the cartridge before printing.",
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
    // Dimension provenance: Levoit Core Mini-RF replacement filter listing
    // (https://www.levoit.com.ph/products/levoit-core-mini-true-hepa-3-stage-original-replacement-filter-core-mini-rf-white).
    source: "Levoit Core Mini-RF listing",
    measurementNote:
      "Outer size is from published listings; center hole is a starter value and should be measured.",
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
    // Dimension provenance: Levoit Core 200S-RF listings
    // (https://device.report/levoit/core-200s-rf).
    source: "Levoit Core 200S-RF listings",
    measurementNote:
      "Outer size is from published listings; center hole is a starter value and should be measured.",
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
    // Dimension provenance: Levoit Core 300-RF listings
    // (https://cleanairadviser.com/levoit-core-300-replacement-filter-guide/).
    source: "Levoit Core 300-RF listings",
    measurementNote:
      "Outer size is from published listings; center hole is a starter value and should be measured.",
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
    detail:
      "Use calipers and enter the exact outside diameter, length, and center-hole diameter.",
    source: "User supplied measurements",
    measurementNote:
      "Measure the center hole carefully; that dimension controls whether the adaptor actually seats.",
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
export const defaultThreeDimensionalPrintDesignId: PrintDesignId =
  "nukit-tempest";

// #######################################
// Print Design Presets
// #######################################

export const printDesignPresets: readonly PrintDesignPreset[] = [
  {
    id: "nukit-open-air",
    label: "Nukit Open Air",
    detail:
      "3D-printable Nukit enclosure split into bed-sized panels with dovetail lap keys for glued seams.",
    source: "FilterBoxBuilder browser generator",
    license: "Generated from this project",
    releaseVisibility: "public",
    implementation: {
      type: "laser-derived-printable-kit",
      defaults: {
        filterPreset: "merv13-20x25x1",
        fanDiameter: 140,
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
    detail: "",
    source: "",
    license: "Generated from this project",
    releaseVisibility: "public",
    implementation: {
      type: "tempest",
      defaults: {
        arrangement: "dual-horizontal-sandwich",
        filterPreset: "merv13-20x20x2",
        fanDiameter: 140,
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
    id: "donut-hepa-adapter",
    label: "Donut HEPA fan adaptor",
    detail:
      "Self-scaling round-filter adaptor for a PC fan, with optional press-fit blanking cap and printed fan guard.",
    source: "Donut HEPA OpenSCAD reference",
    license:
      "Reference script published in the video description; generated geometry is parametric in this app",
    releaseVisibility: "internal",
    implementation: {
      type: "donut-filter-adapter",
      defaults: {
        filterPreset: "custom",
        fanDiameter: 120,
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
    detail:
      "Curated fixed Printables design for 16x20x1 filters and five 140 mm PC fans.",
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
        fanDiameter: 140,
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
    detail:
      "Curated fixed Printables design with STEP source for a Corsi-Rosenthal filter housing.",
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
        fanDiameter: 120,
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
    detail:
      "External fixed Printables reference for a modular 20x20 air-filter frame.",
    source: "Printables external reference",
    sourceUrl:
      staticPrintReferences["static-modular-20x20-reference"].sourceUrl,
    license: "CC-BY-NC-SA",
    licenseUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    releaseVisibility: "internal",
    implementation: {
      type: "static-reference",
      reference: staticPrintReferences["static-modular-20x20-reference"],
      defaults: {
        filterPreset: "merv13-20x20x1",
        fanDiameter: 140,
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

export const publicPrintDesignPresets: readonly PrintDesignPreset[] =
  printDesignPresets.filter(isPublicPrintDesignPreset);
export const publicThreeDimensionalPrintDesignPresets: readonly PrintDesignPreset[] =
  publicPrintDesignPresets.filter(isPublicThreeDimensionalPrintDesignPreset);

// #######################################
// Public Release Presets
// #######################################

export function isPublicThreeDimensionalPrintDesignId(
  id: PrintDesignId,
): boolean {
  return publicThreeDimensionalPrintDesignPresets.some(
    (preset) => preset.id === id,
  );
}

function isPublicPrintDesignPreset(preset: PrintDesignPreset): boolean {
  return preset.releaseVisibility === "public";
}

function isPublicThreeDimensionalPrintDesignPreset(
  preset: PrintDesignPreset,
): boolean {
  return !isLaserDerivedPrintDesignPreset(preset);
}

// #######################################
// Catalog Lookup Helpers
// #######################################

export function findPrintDesignPreset(
  id: PrintDesignId | string | null,
): PrintDesignPreset {
  return (
    printDesignPresets.find((preset) => preset.id === id) ??
    requiredPrintDesignPreset(defaultPrintDesignId)
  );
}

export function isDonutFilterPrintDesignId(id: PrintDesignId): boolean {
  return (
    findPrintDesignPreset(id).implementation.type === "donut-filter-adapter"
  );
}

export function isTempestPrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).implementation.type === "tempest";
}

export function isStaticReferencePrintDesignId(id: PrintDesignId): boolean {
  return findPrintDesignPreset(id).implementation.type === "static-reference";
}

export function isLaserDerivedPrintDesignPreset(
  preset: PrintDesignPreset,
): preset is LaserDerivedPrintDesignPreset {
  return preset.implementation.type === "laser-derived-printable-kit";
}

export function isDonutFilterAdapterPrintDesignPreset(
  preset: PrintDesignPreset,
): preset is DonutFilterAdapterPrintDesignPreset {
  return preset.implementation.type === "donut-filter-adapter";
}

export function isTempestPrintDesignPreset(
  preset: PrintDesignPreset,
): preset is TempestPrintDesignPreset {
  return preset.implementation.type === "tempest";
}

export function isStaticReferencePrintDesignPreset(
  preset: PrintDesignPreset,
): preset is StaticReferencePrintDesignPreset {
  return preset.implementation.type === "static-reference";
}

export function staticPrintReferenceForPreset(
  preset: PrintDesignPreset,
): StaticPrintReference | undefined {
  return preset.implementation.type === "static-reference"
    ? preset.implementation.reference
    : undefined;
}

export function defaultFilterPresetForPrintDesign(
  preset: PrintDesignPreset,
): FilterPresetId {
  return preset.implementation.defaults.filterPreset;
}

export function defaultFanDiameterForPrintDesign(
  preset: PrintDesignPreset,
): FanDiameter {
  return preset.implementation.defaults.fanDiameter;
}

export function staticReferenceDefaultsForPreset(
  preset: PrintDesignPreset,
): StaticReferencePrintDesignDefaults | undefined {
  return preset.implementation.type === "static-reference"
    ? preset.implementation.defaults
    : undefined;
}

function requiredPrintDesignPreset(id: PrintDesignId): PrintDesignPreset {
  const preset = printDesignPresets.find((entry) => entry.id === id);
  if (preset === undefined) {
    throw new Error(`requiredPrintDesignPreset: Missing print design ${id}`);
  }
  return preset;
}

export function findDonutFilterPreset(
  id: DonutFilterPresetId | string | null,
): DonutFilterPreset {
  return (
    donutFilterPresets.find((preset) => preset.id === id) ??
    findPresetDonutFilter(defaultDonutFilterPresetId)
  );
}

export function findPresetDonutFilter(
  id: PresetDonutFilterId,
): PresetDonutFilter {
  const preset = donutFilterPresets.find(
    (entry): entry is PresetDonutFilter =>
      entry.id === id && isPresetDonutFilterId(entry.id),
  );
  if (preset === undefined) {
    throw new Error(`findPresetDonutFilter: Missing preset round filter ${id}`);
  }
  return preset;
}

function isPresetDonutFilterId(
  id: DonutFilterPresetId,
): id is PresetDonutFilterId {
  return id !== customDonutFilterPresetId;
}
