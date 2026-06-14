import { inchesToMillimeters, millimetersToInches, type Inches, type Millimeters } from "@/domain/units";

// Display units for the measured-dimension inputs. Settings and share URLs
// always store millimeters; the selected unit only changes how the inputs
// render their values and how typed values are interpreted. The Millimeters /
// Inches flavors make crossing the two without a conversion a compile error.

export const dimensionUnits = ["mm", "in"] as const;

export type DimensionUnit = (typeof dimensionUnits)[number];

export function millimetersToDisplayValue(
  millimeters: Millimeters,
  unit: DimensionUnit,
): number {
  if (unit === "mm") {
    return millimeters;
  }
  return roundTo(millimetersToInches(millimeters), 2);
}

// The rectangular filter measurements (width / length / thickness) are shown as
// whole millimetres — no decimals, so the values stay legible in their narrow
// inputs. Inches keep two decimals, where the precision actually matters.
export function filterDimensionDisplayValue(
  millimeters: Millimeters,
  unit: DimensionUnit,
): number {
  return unit === "mm" ? Math.round(millimeters) : roundTo(millimetersToInches(millimeters), 2);
}

// The input's raw value is in whichever unit the toggle selects; the cast to
// Inches is the one sanctioned entry point for inch-flavored values.
export function displayValueToMillimeters(
  value: number,
  unit: DimensionUnit,
): Millimeters {
  return unit === "mm" ? value : inchesToMillimeters(value as Inches);
}

export function dimensionInputStep(
  millimeterStep: string,
  unit: DimensionUnit,
): string {
  return unit === "mm" ? millimeterStep : "0.01";
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
