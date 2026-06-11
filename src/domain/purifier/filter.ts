import type { Millimeters } from "@/domain/units";

export type FilterDimensions = {
  readonly width: Millimeters;
  readonly depth: Millimeters;
  readonly thickness: Millimeters;
};

// Best-effort default: the common actual size of a 20x25x2 in nominal MERV 13
// filter (1.75 in thick). Users are expected to measure their own filter; this
// only seeds the inputs.
export const defaultRectangularFilterDimensions: FilterDimensions = {
  width: 622.3,
  depth: 495.3,
  thickness: 44.45,
};
