// Print design catalog: design identifiers, donut filter types, print design
// preset types (laser-derived, donut adapter, tempest, static reference), the
// preset catalog, public-release filtering, and lookups.

import type { Millimeters } from "@/domain/units";
import {
  defaultRectangularFilterDimensions,
  type FilterDimensions,
} from "@/domain/purifier/filter";
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

export type ReleaseVisibility = "public" | "internal";

// ##############################
// Print Design Preset Types
// ##############################

export type PrintDesignPresetBase = {
  readonly id: PrintDesignId;
  readonly label: string;
  readonly detail?: string;
  readonly source?: string;
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
  readonly fanDiameter: FanDiameter;
};

export type LaserDerivedPrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly filter: FilterDimensions;
  readonly filterCount: FilterCount;
  readonly fanBanks: FanBanks<FanCountRequest>;
  readonly splitFrames: boolean;
};

export type DonutFilterAdapterPrintDesignDefaults =
  CommonPrintDesignDefaults & {
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

// Default measured filter sizes per Tempest arrangement. Horizontal
// arrangements use the shared rectangular filter default; the tower uses the
// Air Fanta compatible replacement filter pack size (29 x 29 x 2.5 cm).
export const defaultFilterDimensionsByTempestArrangement = {
  "single-horizontal-top-filter": defaultRectangularFilterDimensions,
  "dual-horizontal-sandwich": defaultRectangularFilterDimensions,
  "four-side-filter-tower": { width: 290, depth: 290, thickness: 25 },
} satisfies Record<TempestArrangementPreset, FilterDimensions>;

export type TempestPrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly arrangement: TempestArrangementPreset;
  readonly materialThickness: Millimeters;
  readonly screwHoleDiameter: Millimeters;
  readonly rim: Millimeters;
};

export type StaticReferencePrintDesignDefaults = CommonPrintDesignDefaults & {
  readonly filter: FilterDimensions;
  readonly filterNominalSize: string;
  readonly filterCount: FilterCount;
  readonly fanCount: number;
  readonly splitFrames: boolean;
};

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
        filter: defaultRectangularFilterDimensions,
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
    license: "Generated from this project",
    releaseVisibility: "public",
    implementation: {
      type: "tempest",
      defaults: {
        arrangement: "dual-horizontal-sandwich",
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
        fanDiameter: 120,
        fanCount: 1,
        // Silentnight-style 92 mm cartridge from the OpenSCAD reference; the
        // center hole is a starter value users should measure before printing.
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
        // 16x20x1 in MERV 13 actual size.
        filter: { width: 495.3, depth: 393.7, thickness: 19.1 },
        filterNominalSize: "16 x 20 x 1 in",
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
        // 14x20x1 in MERV 13 actual size.
        filter: { width: 495.3, depth: 342.9, thickness: 19.1 },
        filterNominalSize: "14 x 20 x 1 in",
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
        // 20x20x1 in MERV 13 actual size.
        filter: { width: 495.3, depth: 495.3, thickness: 19.1 },
        filterNominalSize: "20 x 20 x 1 in",
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
