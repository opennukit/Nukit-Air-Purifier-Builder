import type { ModelingApi } from "@/fabrication/printing/modeling/modelingApi";

// #######################################
// Parametric Tempest Geometry (kernel-agnostic)
// #######################################

// The single source of truth for the Tempest purifier shape. It is written
// against the abstract `ModelingApi`, never a concrete CSG kernel, so it makes
// no kernel-specific assumptions; Manifold drives both the in-browser preview
// and the STL/3MF export. Function names and construction order follow the
// original model so it stays auditable feature-by-feature.

// The geometry was originally one big generic function whose helpers closed over
// the destructured modeling ops and a per-build fan-pattern cache. They are now
// top-level generic functions that take this context as their first argument, so
// the closure state becomes explicit data threaded through the call tree.
export type GeometryContext<Solid, Region> = {
  readonly modeling: ModelingApi<Solid, Region>;
  // Per-build memo of fan-pattern cross-sections. Local to the build so it can
  // never outlive it: under Manifold the arena wrapping the build owns and frees
  // the handles it holds, and there is no cross-build state to dangle.
  readonly fanPatternCache: Map<string, Region>;
};

// A tiny lip subtracted/added so coincident cut faces never share a plane with
// the solid they pierce, which would leave a zero-thickness sliver.
export const EPSILON_LIP = 0.05;
// Each through-wall cut is grown by this on both ends so it fully clears the
// wall it pierces. (Named for the shell it overlaps; the old "scad" prefix
// referred to a kernel no longer used.)
export const SHELL_OVERLAP_MM = 0.5;
// The geometry's own tessellation resolution, passed explicitly to every
// circular primitive so it does not depend on any backend's global default.
export const CSG_SEGMENTS = 48;
// Facet count for the small cord/zip-tie pass-through cylinders, kept coarser
// than CSG_SEGMENTS since these holes are tiny and never silhouette-critical.
export const CORD_CYLINDER_SEGMENTS = 24;
