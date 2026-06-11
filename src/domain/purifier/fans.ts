// Fan vocabulary: fan diameters and mounting specs, fan-count request types
// and wall banks, the fan color palette with preview appearance data, and
// fan configuration types.

import type { Millimeters } from "@/domain/units";

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
// Fan Count Types
// ##############################

export const fixedFanCountOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export const automaticFanCount = -1;

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

// ##############################
// Fan Spec and Appearance Types
// ##############################

export type FanSpec = {
  diameter: FanDiameter;
  screwSpacing: Millimeters;
  cutClearance: Millimeters;
};

export const fanColors = ["black", "beige"] as const;

export type FanColor = (typeof fanColors)[number];

export const defaultFanColor: FanColor = "black";

export type FanAppearance = {
  readonly frameColor: number;
  readonly ringColor: number;
  readonly bladeColor: number;
  readonly hubColor: number;
  readonly accentColor: number;
  readonly previewCadModel?: FanPreviewCadModel;
};

export type FanPreviewCadModel = {
  readonly type: "noctua-nf-a14-public-cad";
  readonly sourceUrl: "https://www.noctua.at/en/3d-cad-models";
  readonly assetUrl: "/vendor/fan-preview/noctua/nf-a14-public-cad-preview.json";
  readonly usage: "preview-only";
};

// #######################################
// Fan Appearances
// #######################################

// Appearance is keyed by color alone and drives preview visuals only
// (frame/blade/hub colors, CAD silhouette); the preview scales the fan
// visual to whatever diameter is configured. Neither color is a product
// recommendation.
const fanAppearanceByColor: Record<FanColor, FanAppearance> = {
  black: {
    frameColor: 0x111817,
    ringColor: 0x050807,
    bladeColor: 0x49525a,
    hubColor: 0x919a96,
    accentColor: 0x253a38,
  },
  // Preview colors and silhouette come from the bundled NF-A14 public CAD
  // model; sourceUrl below is asset attribution, not a recommendation.
  beige: {
    frameColor: 0xd6bd8d,
    ringColor: 0xb79a67,
    bladeColor: 0x6b3b25,
    hubColor: 0xe2cda4,
    accentColor: 0x8f5b35,
    previewCadModel: {
      type: "noctua-nf-a14-public-cad",
      sourceUrl: "https://www.noctua.at/en/3d-cad-models",
      assetUrl: "/vendor/fan-preview/noctua/nf-a14-public-cad-preview.json",
      usage: "preview-only",
    },
  },
};

export function fanAppearanceForColor(color: FanColor): FanAppearance {
  return fanAppearanceByColor[color];
}

export type FanConfiguration = {
  spec: FanSpec;
  color: FanColor;
  banks: FanBanks<FanCountRequest>;
};

export type SingleFanConfiguration = {
  spec: FanSpec;
  color: FanColor;
  count: FixedFanCount;
};

// #######################################
// Catalog Lookup Helpers
// #######################################

// Snaps any measured or URL-provided diameter to the nearest catalog size;
// ties round down to the smaller fan.
export function nearestFanDiameter(value: number): FanDiameter {
  let nearest: FanDiameter = fanDiameters[0];
  for (const diameter of fanDiameters) {
    if (Math.abs(diameter - value) < Math.abs(nearest - value)) {
      nearest = diameter;
    }
  }
  return nearest;
}

export function findFanSpec(diameter: number): FanSpec {
  const nearest = nearestFanDiameter(diameter);
  const spec = fanSpecs.find((entry) => entry.diameter === nearest);
  if (spec === undefined) {
    throw new Error(`findFanSpec: Missing fan spec for diameter ${nearest}`);
  }
  return spec;
}
