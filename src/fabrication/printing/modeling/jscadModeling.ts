import { booleans, expansions, extrusions, hulls, primitives, transforms } from "@jscad/modeling";
import type { ModelingApi } from "@/fabrication/printing/modeling/modelingApi";

// #######################################
// JSCAD backend for the design editor
// #######################################

// The JSCAD-backed implementation of the kernel-agnostic `ModelingApi`. JSCAD is
// a pure-JS CSG kernel (no WASM, no manual disposal), which makes it ideal for a
// zero-build standalone HTML editor and fast live preview. Its boolean output is
// NOT edge-conforming (T-junctions), which is fine on-screen but unfit for
// slicing — the static Builder always exports through the Manifold backend.
//
// JSCAD's geometry types come from the primitive return types so this file does
// not depend on JSCAD's internal type-export paths.
type JscadSolid = ReturnType<typeof primitives.cuboid>;
type JscadRegion = ReturnType<typeof primitives.circle>;

export const jscadModeling: ModelingApi<JscadSolid, JscadRegion> = {
  primitives: {
    cuboid: ({ center, size }) =>
      primitives.cuboid({ center: [center[0], center[1], center[2]], size: [size[0], size[1], size[2]] }),
    cylinder: ({ height, radius, segments }) => primitives.cylinder({ height, radius, segments }),
    circle: ({ radius, segments }) => primitives.circle({ radius, segments }),
    polygon: ({ points }) => primitives.polygon({ points: points.map((point) => [point[0], point[1]]) }),
    rectangle: ({ center, size }) => primitives.rectangle({ center: [center[0], center[1]], size: [size[0], size[1]] }),
    roundedRectangle: ({ center, size, roundRadius, segments }) =>
      primitives.roundedRectangle({ center: [center[0], center[1]], size: [size[0], size[1]], roundRadius, segments }),
  },
  transforms: {
    translate: (offset, solid) => transforms.translate([offset[0], offset[1], offset[2]], solid),
    rotateX: (angleRadians, solid) => transforms.rotateX(angleRadians, solid),
    rotateY: (angleRadians, solid) => transforms.rotateY(angleRadians, solid),
    rotateZ: (angleRadians, solid) => transforms.rotateZ(angleRadians, solid),
  },
  transforms2d: {
    translate: (offset, region) => transforms.translate([offset[0], offset[1]], region),
  },
  extrusions: {
    extrudeLinear: ({ height }, region) => extrusions.extrudeLinear({ height }, region),
  },
  expansions: {
    offset: ({ delta, corners, segments }, region) => expansions.offset({ delta, corners, segments }, region),
  },
  hulls: {
    hull: (first, ...rest) => hulls.hull(first, ...rest),
  },
  booleans: {
    union: (first, ...rest) => booleans.union(first, ...rest),
    subtract: (first, ...rest) => booleans.subtract(first, ...rest),
    intersect: (first, ...rest) => booleans.intersect(first, ...rest),
  },
  booleans2d: {
    union: (first, ...rest) => booleans.union(first, ...rest),
    intersect: (first, ...rest) => booleans.intersect(first, ...rest),
  },
};
