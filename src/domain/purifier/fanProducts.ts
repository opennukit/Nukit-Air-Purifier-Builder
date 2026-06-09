// Fan product vocabulary: fan diameters and mounting specs, fan-count
// request types and wall banks, the fan product preset catalog with
// preview appearance data, and fan product selection/configuration types.

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
  readonly previewCadModel?: FanPreviewCadModel;
};

export type FanPreviewCadModel = {
  readonly type: "noctua-nf-a14-public-cad";
  readonly sourceUrl: "https://www.noctua.at/en/3d-cad-models";
  readonly assetUrl: "/vendor/fan-preview/noctua/nf-a14-public-cad-preview.json";
  readonly usage: "preview-only";
};

// Preset ids are persisted in share URLs (settingsCodec round-trips them),
// so they must stay stable even though the display labels are generic
// visual descriptors rather than product names.
export const fanProductPresetIds = [
  "nukit-arctic-p14",
  "arctic-p12-pwm-pst",
  "noctua-nf-a14",
  "custom",
] as const;

export type FanProductPresetId = (typeof fanProductPresetIds)[number];

export type PresetFanProductId = Exclude<FanProductPresetId, "custom">;

export type FanProductPreset = {
  readonly id: FanProductPresetId;
  readonly label: string;
  readonly diameter: FanDiameter;
  readonly powerNote: string;
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

// Each preset drives preview appearance only (frame/blade/hub colors, body
// depth, CAD silhouette); none of them is a product recommendation.
export const fanProductPresets: readonly FanProductPreset[] = [
  {
    id: "nukit-arctic-p14",
    label: "140 mm — black, 4-pin PWM",
    diameter: 140,
    powerNote: "4-pin PWM, 12 V",
    appearance: {
      frameColor: 0x111817,
      ringColor: 0x050807,
      bladeColor: 0x49525a,
      hubColor: 0x919a96,
      accentColor: 0x253a38,    },
  },
  {
    id: "arctic-p12-pwm-pst",
    label: "120 mm — black, 4-pin PWM",
    diameter: 120,
    powerNote: "4-pin PWM, 12 V",
    appearance: {
      frameColor: 0x111817,
      ringColor: 0x050807,
      bladeColor: 0x49525a,
      hubColor: 0x919a96,
      accentColor: 0x253a38,    },
  },
  {
    id: "noctua-nf-a14",
    label: "140 mm — beige/brown",
    diameter: 140,
    powerNote: "4-pin PWM, 12 V",
    // Preview colors and silhouette come from the bundled NF-A14 public CAD
    // model; sourceUrl below is asset attribution, not a recommendation.
    appearance: {
      frameColor: 0xd6bd8d,
      ringColor: 0xb79a67,
      bladeColor: 0x6b3b25,
      hubColor: 0xe2cda4,
      accentColor: 0x8f5b35,      previewCadModel: {
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
    diameter: 140,
    powerNote: "Check the fan datasheet",
    appearance: {
      frameColor: 0x111817,
      ringColor: 0x060a09,
      bladeColor: 0x657179,
      hubColor: 0x9aa39f,
      accentColor: 0x3c6f61,    },
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
// Catalog Lookup Helpers
// #######################################

export function findFanSpec(diameter: FanDiameter): FanSpec {
  return (
    fanSpecs.find((spec) => spec.diameter === diameter) ??
    fanSpecs[fanSpecs.length - 1]
  );
}

export function findFanProductPreset(id: FanProductPresetId): FanProductPreset {
  return (
    fanProductPresets.find((preset) => preset.id === id) ??
    findPresetFanProduct(defaultFanProductPresetId)
  );
}

export function findPresetFanProduct(id: PresetFanProductId): PresetFanProduct {
  const preset = fanProductPresets.find(
    (entry): entry is PresetFanProduct =>
      entry.id === id && isPresetFanProductId(entry.id),
  );
  if (preset === undefined) {
    throw new Error(`findPresetFanProduct: Missing fan product ${id}`);
  }
  return preset;
}

// ##############################
// Selection Helpers
// ##############################

export function createFanProductSelection(
  presetId: FanProductPresetId,
): FanProductSelection {
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

function isPresetFanProductId(
  id: FanProductPresetId,
): id is PresetFanProductId {
  return id !== customFanProductPresetId;
}
