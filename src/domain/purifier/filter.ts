import type { Millimeters } from "@/domain/units";

export const filterPresetIds = [
  "merv13-20x20x2",
  "merv13-20x25x1",
  "merv13-16x16x1",
  "merv13-14x20x1",
  "merv13-16x20x1",
  "merv13-16x25x1",
  "merv13-20x20x1",
  "ikea-fornuftig",
  "ikea-starkvind",
  "ikea-uppatvind",
  "air-fanta-compatible",
  "custom",
] as const;

export type FilterPresetId = (typeof filterPresetIds)[number];

export type PresetFilterId = Exclude<FilterPresetId, "custom">;

export type FilterDimensions = {
  readonly width: Millimeters;
  readonly depth: Millimeters;
  readonly thickness: Millimeters;
};

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
    nominalSize: "20 x 20 x 2 in",
    source: "Nukit / standard HVAC actual size",
    dimensions: { width: 498, depth: 496, thickness: 46.77 },
  },
  {
    id: "merv13-20x25x1",
    label: "20x25x1 MERV 13",
    detail: "20x25x1 MERV 13",
    nominalSize: "20 x 25 x 1 in",
    source: "Standard HVAC actual size",
    dimensions: { width: 622.3, depth: 495.3, thickness: 19.1 },
  },
  {
    id: "merv13-16x16x1",
    label: "16x16x1 MERV 13",
    detail: "16x16x1 MERV 13",
    nominalSize: "16 x 16 x 1 in",
    source: "Standard HVAC actual size",
    dimensions: { width: 393.7, depth: 393.7, thickness: 19.1 },
  },
  {
    id: "merv13-14x20x1",
    label: "14x20x1 MERV 13",
    detail: "14x20x1 MERV 13",
    nominalSize: "14 x 20 x 1 in",
    source: "Standard HVAC actual size / Filtrete 14x20x1",
    dimensions: { width: 495.3, depth: 342.9, thickness: 19.1 },
  },
  {
    id: "merv13-16x20x1",
    label: "16x20x1 MERV 13",
    detail: "16x20x1 MERV 13",
    nominalSize: "16 x 20 x 1 in",
    source: "Standard HVAC actual size",
    dimensions: { width: 495.3, depth: 393.7, thickness: 19.1 },
  },
  {
    id: "merv13-16x25x1",
    label: "16x25x1 MERV 13",
    detail: "16x25x1 MERV 13",
    nominalSize: "16 x 25 x 1 in",
    source: "Standard HVAC actual size",
    dimensions: { width: 622.3, depth: 393.7, thickness: 19.1 },
  },
  {
    id: "merv13-20x20x1",
    label: "20x20x1 MERV 13",
    detail: "20x20x1 MERV 13",
    nominalSize: "20 x 20 x 1 in",
    source: "Standard HVAC actual size",
    dimensions: { width: 495.3, depth: 495.3, thickness: 19.1 },
  },
  {
    id: "ikea-fornuftig",
    label: "IKEA FORNUFTIG",
    detail: "IKEA FORNUFTIG",
    nominalSize: "15.25 x 9.75 x 0.75 in",
    source: "IKEA published replacement filter size",
    dimensions: { width: 387.4, depth: 247.7, thickness: 19.1 },
  },
  {
    id: "ikea-starkvind",
    label: "IKEA STARKVIND",
    detail: "IKEA STARKVIND",
    nominalSize: "14.5 x 11.5 x 1.5 in",
    source: "IKEA published replacement filter size",
    dimensions: { width: 368.3, depth: 292.1, thickness: 38.1 },
  },
  {
    id: "ikea-uppatvind",
    label: "IKEA UPPATVIND",
    detail: "IKEA UPPATVIND",
    nominalSize: "9.875 x 7.875 x 1 in",
    source: "IKEA published replacement filter size",
    dimensions: { width: 250.8, depth: 200, thickness: 25.4 },
  },
  {
    id: "air-fanta-compatible",
    label: "Air Fanta compatible",
    detail: "Air Fanta compatible replacement filter",
    nominalSize: "29 x 29 x 2.5 cm",
    source: "Supplied Air Fanta compatible filter pack dimensions",
    dimensions: { width: 290, depth: 290, thickness: 25 },
  },
  {
    id: "custom",
    label: "Custom measured filter",
    detail: "Enter exact dimensions",
    nominalSize: "Measured",
    source: "User supplied dimensions",
    dimensions: { width: 498, depth: 496, thickness: 46.77 },
  },
];

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

export function isPresetFilterId(id: FilterPresetId): id is PresetFilterId {
  return id !== customFilterPresetId;
}
