// Display units for the measured-dimension inputs. Settings and share URLs
// always store millimeters; the selected unit only changes how the inputs
// render their values and how typed values are interpreted.

export const dimensionUnits = ["mm", "in"] as const;

export type DimensionUnit = (typeof dimensionUnits)[number];

const millimetersPerInch = 25.4;

export function millimetersToDisplayValue(
  millimeters: number,
  unit: DimensionUnit,
): number {
  if (unit === "mm") {
    return millimeters;
  }
  return roundTo(millimeters / millimetersPerInch, 2);
}

export function displayValueToMillimeters(
  value: number,
  unit: DimensionUnit,
): number {
  return unit === "mm" ? value : value * millimetersPerInch;
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
