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

// Exhaustive, total dispatch. The handlers object (not a bare switch) is
// mandatory: adding a third topology makes the object literal incomplete -> a
// COMPILE ERROR at EVERY call site. Reserved for the genuine fork where two
// different solid-building recipes run; field reads after one narrow do NOT use
// this.
export function matchTopology<R>(
  topology: TempestTopology,
  handlers: {
    readonly sandwich: () => R;
    readonly quad: () => R;
  },
): R {
  switch (topology) {
    case "sandwich":
      return handlers.sandwich();
    case "quad":
      return handlers.quad();
    default:
      return assertNever(topology);
  }
}
