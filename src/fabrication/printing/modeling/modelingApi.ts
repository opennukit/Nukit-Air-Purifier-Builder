// #######################################
// Kernel-Agnostic Modeling API (the seam)
// #######################################

// The parametric purifier geometry is written ONCE against this interface and
// never against a concrete CSG kernel. Manifold (`manifoldModeling` in
// manifoldOps.ts) is the implementation — it produces the watertight,
// T-junction-free meshes the in-browser preview and the STL/3MF export both
// rely on. Keeping the geometry behind this abstraction (Parnas: the general
// must not depend on the specific) means it makes no Manifold-specific
// assumptions, so a different kernel could be dropped in without touching the
// model — the property is enforced by the type system, not by convention.
//
// Operation names and option shapes follow the JSCAD modeling conventions, which
// keeps each op small and explicit. The 2D ops are split out (transforms2d /
// booleans2d) so the backend never has to dispatch on a runtime dimension.

// Offsets and sizes are immutable coordinate data, taken as readonly tuples so
// callers can pass their own readonly tuples directly and a missing component
// is a type error rather than a silent NaN.
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

// JSCAD's `offset` corner styles. A total set so every backend maps all of them.
export type JoinCorners = "round" | "chamfer" | "edge";

// `Solid` is a 3D body, `Region` a planar 2D area. The geometry stays generic
// over both so it type-checks identically whichever kernel instantiates them.
export interface ModelingApi<Solid, Region> {
  readonly primitives: {
    cuboid(spec: { center: Vec3; size: Vec3 }): Solid;
    cylinder(spec: { height: number; radius: number; segments?: number }): Solid;
    circle(spec: { radius: number; segments?: number }): Region;
    polygon(spec: { points: ReadonlyArray<readonly number[]> }): Region;
    rectangle(spec: { center: Vec2; size: Vec2 }): Region;
    roundedRectangle(spec: { center: Vec2; size: Vec2; roundRadius: number; segments?: number }): Region;
  };
  readonly transforms: {
    translate(offset: Vec3, solid: Solid): Solid;
    rotateX(angleRadians: number, solid: Solid): Solid;
    rotateY(angleRadians: number, solid: Solid): Solid;
    rotateZ(angleRadians: number, solid: Solid): Solid;
  };
  readonly transforms2d: {
    translate(offset: Vec2, region: Region): Region;
  };
  readonly extrusions: {
    extrudeLinear(spec: { height: number }, region: Region): Solid;
  };
  readonly expansions: {
    offset(spec: { delta: number; corners: JoinCorners; segments?: number }, region: Region): Region;
  };
  readonly hulls: {
    hull(first: Solid, ...rest: Solid[]): Solid;
  };
  readonly booleans: {
    union(first: Solid, ...rest: Solid[]): Solid;
    subtract(first: Solid, ...rest: Solid[]): Solid;
    intersect(first: Solid, ...rest: Solid[]): Solid;
  };
  readonly booleans2d: {
    union(first: Region, ...rest: Region[]): Region;
    intersect(first: Region, ...rest: Region[]): Region;
  };
}
