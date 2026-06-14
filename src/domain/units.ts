// Flavored millimetre type: the optional `__unit` tag never exists at runtime,
// but it documents intent while still accepting plain number literals and
// arithmetic results. So `width: Millimeters = 622` and `mm + mm` both work.
// Everything in the app is millimetres — there is deliberately no inch unit (see
// the measured-filter controls in App.svelte for why).
export type Millimeters = number & { readonly __unit?: "mm" };
