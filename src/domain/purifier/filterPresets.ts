import type { Millimeters } from "@/domain/units";

// Stock filters offered by the "Filter size" selector. "Custom" is represented
// by the absence of a match. A preset matches in either orientation so swapping
// width/length keeps it selected.
export type FilterSizePreset = {
  readonly id: string;
  readonly label: string;
  readonly width: Millimeters;
  readonly depth: Millimeters;
  readonly thickness: Millimeters;
};

export const filterSizePresets: readonly FilterSizePreset[] = [
  { id: "starkvind", label: "STARKVIND (370 x 290 x 40 mm)", width: 370, depth: 290, thickness: 40 },
  { id: "fornuftig", label: "FORNUFTIG (390 x 250 x 20 mm)", width: 390, depth: 250, thickness: 20 },
];

// The preset whose dimensions match the measured filter (either orientation), or
// undefined for a custom size.
export function matchedFilterSizePreset(
  width: Millimeters,
  depth: Millimeters,
  thickness: Millimeters,
): FilterSizePreset | undefined {
  const w = Math.round(width);
  const d = Math.round(depth);
  const t = Math.round(thickness);
  return filterSizePresets.find(
    (preset) =>
      t === preset.thickness &&
      ((w === preset.width && d === preset.depth) || (w === preset.depth && d === preset.width)),
  );
}
