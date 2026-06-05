import { describe, expect, test } from "bun:test";
import { measurements } from "@jscad/modeling";
import { createTempestModel, defaultTempestSettings } from "@/domain/designs/tempest/model";
import { buildTempestGeometry } from "@/fabrication/printing/designs/tempest/geometry";
import { jscadModeling } from "@/fabrication/printing/modeling/jscadModeling";
import { manifoldModeling } from "@/fabrication/printing/modeling/manifoldOps";
import { withGeometryArena } from "@/fabrication/printing/modeling/manifoldKernel";

type Bounds = { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };

function jscadBounds(model: ReturnType<typeof createTempestModel>): Bounds {
  const [min, max] = measurements.measureBoundingBox(buildTempestGeometry(jscadModeling, model));
  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
}

function manifoldBounds(model: ReturnType<typeof createTempestModel>): Bounds {
  return withGeometryArena(() => {
    const box = buildTempestGeometry(manifoldModeling, model).boundingBox();
    return { min: [box.min[0], box.min[1], box.min[2]], max: [box.max[0], box.max[1], box.max[2]] };
  });
}

// The whole point of the ModelingApi seam: one geometry, many kernels. Both
// backends must describe the SAME shape. The outer envelope is built from linear
// chamfered prisms, so its bounds are tessellation-independent and should agree
// to well under a millimetre.
describe("kernel-agnostic geometry: JSCAD and Manifold agree", () => {
  const tolerance = 0.1;

  function expectSameBounds(model: ReturnType<typeof createTempestModel>): void {
    const jscad = jscadBounds(model);
    const manifold = manifoldBounds(model);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(Math.abs(jscad.min[axis] - manifold.min[axis])).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(jscad.max[axis] - manifold.max[axis])).toBeLessThanOrEqual(tolerance);
    }
  }

  test("two-filter housing has identical bounds on both backends", () => {
    expectSameBounds(createTempestModel(defaultTempestSettings));
  });

  // The four-filter tower is intentionally NOT cross-checked here: JSCAD's pure-JS
  // booleans take ~12s to build it (vs. milliseconds on Manifold), which is why
  // the editor preview favours Manifold and JSCAD is reserved for the zero-build
  // standalone. The tower's correctness is covered by tempestManifold.test.ts.
});
