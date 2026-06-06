import Module from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";

// #######################################
// Manifold WASM Lifecycle
// #######################################

// Manifold is a C++ CSG kernel compiled to WebAssembly. Unlike a pure-JS CSG
// library it guarantees watertight, 2-manifold, T-junction-free output by
// construction, which is what 3MF slicers require. Its objects live in the WASM
// heap and are not garbage collected, so every geometry value must be explicitly
// freed; see `withGeometryArena`.

export type WasmDisposable = {
  delete(): void;
};

// The build callback of `withGeometryArena` must hand back plain extracted data,
// never a live WASM handle: any handle it returned would be freed the moment the
// arena exits, leaving the caller with a use-after-free. A WASM handle is exactly
// what `WasmDisposable` describes, so a build whose result is one collapses to
// `never` here, making it un-callable. This encodes the contract in the type
// rather than relying on a comment.
type ArenaResult<T> = T extends WasmDisposable ? never : T;

// The exact segment count Manifold's circle/cylinder/sphere constructors use
// when given no explicit count (via setCircularSegments, which overrides the
// angle/edge-length defaults). The geometry passes its own counts explicitly.
export const defaultCircularSegments = 48;

let toplevel: ManifoldToplevel | null = null;
let activeArena: WasmDisposable[] | null = null;

export async function initManifoldKernel(locateFile?: () => string): Promise<void> {
  if (toplevel !== null) {
    return;
  }
  const loaded = await Module(locateFile ? { locateFile } : undefined);
  // setup() binds the Manifold/CrossSection class implementations.
  loaded.setup();
  loaded.setCircularSegments(defaultCircularSegments);
  toplevel = loaded;
}

export function manifoldKernel(): ManifoldToplevel {
  if (toplevel === null) {
    throw new Error("manifoldKernel: Manifold WASM not initialized; call initManifoldKernel() first");
  }
  return toplevel;
}

// #######################################
// Geometry Disposal Arena
// #######################################

// Records a freshly created WASM geometry value so the enclosing arena can free
// it. Building geometry outside an arena is a programming error: the value would
// leak the WASM heap, so this surfaces it loudly rather than failing silently.
export function track<T extends WasmDisposable>(value: T): T {
  if (activeArena === null) {
    throw new Error("track: no active geometry arena; build geometry inside withGeometryArena()");
  }
  activeArena.push(value);
  return value;
}

// Runs `build`, then frees every geometry value tracked during it. The kernel
// must be initialized first, so this single gate every build passes through
// asserts readiness up front rather than leaving the precondition to each
// caller. `build` may return only plain data (e.g. extracted meshes), never a
// live WASM handle; see `ArenaResult`.
export function withGeometryArena<T>(build: () => ArenaResult<T>): T {
  manifoldKernel();
  const previousArena = activeArena;
  const arena: WasmDisposable[] = [];
  activeArena = arena;
  try {
    return build();
  } finally {
    activeArena = previousArena;
    for (let index = arena.length - 1; index >= 0; index -= 1) {
      arena[index].delete();
    }
  }
}
