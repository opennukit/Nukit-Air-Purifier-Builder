// #######################################
// Tempest Topology Discriminator
// #######################################

// The one decision that drives the whole derived model. Two solid-building
// recipes exist: a 1/2-filter sandwich box and a 4-filter side-filter quad
// tower. `planForArrangement` resolves it once from the input arrangement; every
// later stage reads this tag (or a field carried beside it).
export type TempestTopology = "sandwich" | "quad";

export function assertNever(value: never): never {
  throw new Error(`assertNever: unreachable topology variant ${JSON.stringify(value)}`);
}

// Exhaustive, total dispatch that ALSO narrows the value. The handlers object
// (not a bare switch) is mandatory: adding a third topology makes the object
// literal incomplete -> a COMPILE ERROR at EVERY call site. Each handler receives
// the SAME value narrowed to its topology arm, so callers read variant-specific
// fields straight off the parameter — no second `if`/`assertNever` re-narrow.
export function matchTopology<V extends { readonly topology: TempestTopology }, R>(
  value: V,
  handlers: {
    readonly sandwich: (value: Extract<V, { readonly topology: "sandwich" }>) => R;
    readonly quad: (value: Extract<V, { readonly topology: "quad" }>) => R;
  },
): R {
  switch (value.topology) {
    // The two `as Extract<...>` here are the single controlled narrowing point:
    // the switch on `value.topology` proves each cast holds. This is the only
    // place a cast is sanctioned; every call site stays cast-free as a result.
    case "sandwich":
      return handlers.sandwich(value as Extract<V, { readonly topology: "sandwich" }>);
    case "quad":
      return handlers.quad(value as Extract<V, { readonly topology: "quad" }>);
    default:
      return assertNever(value.topology);
  }
}
