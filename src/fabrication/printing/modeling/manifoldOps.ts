import type { CrossSection, Manifold } from "manifold-3d";
import { manifoldKernel, requireGeometryArena, track } from "@/fabrication/printing/modeling/manifoldKernel";
import type { JoinCorners, ModelingApi, Vec2, Vec3 } from "@/fabrication/printing/modeling/modelingApi";

// #######################################
// JSCAD-Shaped Facade over Manifold
// #######################################

// The Manifold-backed implementation of the kernel-agnostic `ModelingApi` (see
// modelingApi.ts). The parametric geometry (`buildTempestGeometry`) is written
// against that interface and this backend is injected into it, for watertight,
// manifold-by-construction output. The op shapes follow the JSCAD modeling
// conventions — small, explicit ops — which is the "JSCAD-shaped" in the header.
// Every value a facade op produces is tracked for disposal by the active
// geometry arena.

// `Geom3` is a solid (Manifold) and `Geom2` a planar region (CrossSection). They
// are kept as plain aliases of the kernel classes rather than opaque branded
// types. Branding to forbid consumers from calling `.delete()` / `.getMesh()`
// directly was considered (review R4) but rejected: a brand the kernel classes
// don't carry would force a wrap/unwrap cast at every op in this facade, scattering
// casts across the very module whose remaining casts R3 removed. The arena, not
// the type, owns disposal; this module is the sole brand boundary by convention.
// NOTE Nils 2026.06.02: revisit if a cast-free opaque encoding becomes practical.
export type Geom3 = Manifold;
export type Geom2 = CrossSection;

// Vec2/Vec3/JoinCorners are the kernel-agnostic coordinate and corner types from
// the ModelingApi seam, so this backend and the geometry speak the same shapes.
// JSCAD's offset "corners" vocabulary maps totally onto Manifold join types, so
// every variant resolves explicitly rather than falling through to a default.
const joinTypeByCorner: Record<JoinCorners, "Round" | "Square" | "Miter"> = {
  round: "Round",
  chamfer: "Square",
  edge: "Miter",
};

const radiansToDegrees = (radians: number): number => (radians * 180) / Math.PI;

// ##############################
// Primitives
// ##############################

export const primitives = {
  cuboid({ center, size }: { center: Vec3; size: Vec3 }): Geom3 {
    const { Manifold } = manifoldKernel();
    const cube = track(Manifold.cube(size, true));
    return track(cube.translate(center));
  },

  circle({ radius, segments }: { radius: number; segments?: number }): Geom2 {
    const { CrossSection } = manifoldKernel();
    return track(CrossSection.circle(radius, segments));
  },

  polygon({ points }: { points: ReadonlyArray<readonly number[]> }): Geom2 {
    const { CrossSection } = manifoldKernel();
    const contour: [number, number][] = points.map((point) => [point[0], point[1]]);
    return track(CrossSection.ofPolygons(contour, "NonZero"));
  },

  rectangle({ center, size }: { center: Vec2; size: Vec2 }): Geom2 {
    const { CrossSection } = manifoldKernel();
    const region = track(CrossSection.square([size[0], size[1]], true));
    return track(region.translate(center));
  },

  cylinder({ height, radius, segments }: { height: number; radius: number; segments?: number }): Geom3 {
    const { Manifold } = manifoldKernel();
    return track(Manifold.cylinder(height, radius, radius, segments, true));
  },

  roundedRectangle({
    center,
    size,
    roundRadius,
    segments,
  }: {
    center: Vec2;
    size: Vec2;
    roundRadius: number;
    segments?: number;
  }): Geom2 {
    const { CrossSection } = manifoldKernel();
    const innerWidth = Math.max(0.001, size[0] - 2 * roundRadius);
    const innerHeight = Math.max(0.001, size[1] - 2 * roundRadius);
    const innerSize: Vec2 = [innerWidth, innerHeight];
    const inner = track(CrossSection.square(innerSize, true));
    const rounded = roundRadius > 0 ? track(inner.offset(roundRadius, "Round", undefined, segments)) : inner;
    return track(rounded.translate(center));
  },
};

// ##############################
// Transforms
// ##############################

// Solid (3D) transforms. Vec3 offsets/rotations are taken as concrete tuples, so
// a missing third component can never silently become NaN.
export const transforms = {
  translate(offset: Vec3, geometry: Geom3): Geom3 {
    return track(geometry.translate(offset));
  },

  rotateX(angleRadians: number, geometry: Geom3): Geom3 {
    const rotation: Vec3 = [radiansToDegrees(angleRadians), 0, 0];
    return track(geometry.rotate(rotation));
  },

  rotateY(angleRadians: number, geometry: Geom3): Geom3 {
    const rotation: Vec3 = [0, radiansToDegrees(angleRadians), 0];
    return track(geometry.rotate(rotation));
  },

  rotateZ(angleRadians: number, geometry: Geom3): Geom3 {
    const rotation: Vec3 = [0, 0, radiansToDegrees(angleRadians)];
    return track(geometry.rotate(rotation));
  },
};

// Planar (2D) transforms on a cross-section. A separate facade from the 3D one so
// neither has to dispatch on a runtime dimension, which is what required casts.
export const transforms2d = {
  translate(offset: Vec2, crossSection: Geom2): Geom2 {
    return track(crossSection.translate(offset));
  },
};

// ##############################
// Extrusions and Offsets
// ##############################

export const extrusions = {
  extrudeLinear({ height }: { height: number }, crossSection: Geom2): Geom3 {
    return track(crossSection.extrude(height));
  },
};

export const expansions = {
  offset(
    { delta, corners, segments }: { delta: number; corners: JoinCorners; segments?: number },
    crossSection: Geom2,
  ): Geom2 {
    return track(crossSection.offset(delta, joinTypeByCorner[corners], undefined, segments));
  },
};

// ##############################
// Hull
// ##############################

export const hulls = {
  hull(...geometries: Geom3[]): Geom3 {
    const { Manifold } = manifoldKernel();
    return track(Manifold.hull(geometries));
  },
};

// ##############################
// Booleans (2D and 3D)
// ##############################

// Solid (3D) booleans on Manifolds.
export const booleans = {
  union(first: Geom3, ...rest: Geom3[]): Geom3 {
    const { Manifold } = manifoldKernel();
    return track(Manifold.union([first, ...rest]));
  },

  subtract(first: Geom3, ...rest: Geom3[]): Geom3 {
    const { Manifold } = manifoldKernel();
    return track(Manifold.difference([first, ...rest]));
  },

  intersect(first: Geom3, ...rest: Geom3[]): Geom3 {
    const { Manifold } = manifoldKernel();
    return track(Manifold.intersection([first, ...rest]));
  },
};

// Planar (2D) booleans on CrossSections. Separate from the 3D facade so neither
// dispatches on a runtime dimension; only the variants the SCAD port uses in 2D
// (union and intersect) exist here.
export const booleans2d = {
  union(first: Geom2, ...rest: Geom2[]): Geom2 {
    const { CrossSection } = manifoldKernel();
    return track(CrossSection.union([first, ...rest]));
  },

  intersect(first: Geom2, ...rest: Geom2[]): Geom2 {
    const { CrossSection } = manifoldKernel();
    return track(CrossSection.intersection([first, ...rest]));
  },
};

// ##############################
// Modeling API Conformance
// ##############################

// The Manifold-backed implementation of the kernel-agnostic ModelingApi. The
// `satisfies` check is the compile-time proof that this backend covers exactly
// the operation surface the shared geometry is written against. The geometry
// module depends on that interface, never on this object — so swapping in a
// different kernel later can't silently drift from what the model expects.
// Read-only geometry inspectors. `decompose` splits a solid into its separate
// connected bodies (each tracked for disposal); `boundingBox` and `isEmpty`
// report a body's extent / presence. Used by the post-build pin-coverage check.
const analysis = {
  isEmpty(solid: Geom3): boolean {
    return solid.isEmpty();
  },
  decompose(solid: Geom3): Geom3[] {
    return solid.decompose().map((piece) => track(piece));
  },
  boundingBox(solid: Geom3): { readonly min: Vec3; readonly max: Vec3 } {
    const box = solid.boundingBox();
    return { min: box.min, max: box.max };
  },
};

export const manifoldModeling = {
  primitives,
  transforms,
  transforms2d,
  extrusions,
  expansions,
  hulls,
  booleans,
  booleans2d,
  analysis,
} satisfies ModelingApi<Geom3, Geom2>;

// ##############################
// Mesh Extraction
// ##############################

// Manifold guarantees numProp >= 3 and lays the position x, y, z in the first
// three property channels of every vertex (the rest are user properties this
// pipeline does not use). Naming that count lets readers see the position layout
// in the base+1 / base+2 strides instead of inferring it from bare offsets.
export const POSITION_PROP_COUNT = 3;

export type ManifoldMeshData = {
  // Properties per vertex (the stride into vertProperties); always >= POSITION_PROP_COUNT.
  readonly numProp: number;
  readonly vertProperties: Float32Array;
  readonly triVerts: Uint32Array;
};

// ARENA_LIFETIME: meshData calls getMesh() on a live WASM handle, so it is only
// sound while that handle's owning arena is open — i.e. INSIDE the
// `withGeometryArena` call that built `geometry` (see manifoldKernel.ts). Calling
// it after the arena exits is a use-after-free of a freed handle. The
// requireGeometryArena guard makes that coupling a checked precondition rather
// than a convention: extract meshes inside the arena, never after it closes.
export function meshData(geometry: Geom3): ManifoldMeshData {
  requireGeometryArena("meshData");
  const mesh = geometry.getMesh();
  return {
    numProp: mesh.numProp,
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
  };
}
