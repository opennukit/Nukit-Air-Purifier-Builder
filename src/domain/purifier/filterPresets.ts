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
  { id: "starkvind", label: "STARKVIND (365 x 285 x 35 mm)", width: 365, depth: 285, thickness: 35 },
  { id: "filter-16x24x1", label: '16" x 24" x 1" (394 x 597 x 19 mm)', width: 394, depth: 597, thickness: 19 },
  { id: "filter-16x25x1", label: '16" x 25" x 1" (394 x 622 x 19 mm)', width: 394, depth: 622, thickness: 19 },
  { id: "filter-20x20x1", label: '20" x 20" x 1" (501 x 501 x 19 mm)', width: 501, depth: 501, thickness: 19 },
  { id: "filter-20x20x2", label: '20" x 20" x 2" (495 x 495 x 44 mm)', width: 495, depth: 495, thickness: 44 },
  { id: "filter-20x25x1", label: '20" x 25" x 1" (500 x 622 x 19 mm)', width: 500, depth: 622, thickness: 19 },
  { id: "filter-24x24x1", label: '24" x 24" x 1" (603 x 603 x 19 mm)', width: 603, depth: 603, thickness: 19 },
  { id: "filter-20x30x1", label: '20" x 30" x 1" (495 x 749 x 19 mm)', width: 495, depth: 749, thickness: 19 },
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
