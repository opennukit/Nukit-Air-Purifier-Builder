import type { Millimeters } from "@/domain/units";

export type FilterDimensions = {
  readonly width: Millimeters;
  readonly depth: Millimeters;
  readonly thickness: Millimeters;
};
