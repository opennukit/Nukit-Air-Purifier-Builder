// Flavored unit types: the optional `__unit` tag never exists at runtime, but
// it makes the two units mutually un-assignable while still accepting plain
// number literals and arithmetic results. So `width: Millimeters = 622.3` and
// `mm + mm` both work unchanged, yet passing an Inches value into a Millimeters
// slot (or vice versa) is a compile error — the exact bug a unit toggle invites.
export type Millimeters = number & { readonly __unit?: "mm" };
export type Inches = number & { readonly __unit?: "in" };

const millimetersPerInch = 25.4;

export function inchesToMillimeters(value: Inches): Millimeters {
  return value * millimetersPerInch;
}

export function millimetersToInches(value: Millimeters): Inches {
  return value / millimetersPerInch;
}
