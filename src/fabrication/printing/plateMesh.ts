import type { Path } from "three";
import { withGeometryArena } from "@/fabrication/printing/modeling/manifoldKernel";
import { booleans, extrusions, primitives, type Geom3 } from "@/fabrication/printing/modeling/manifoldOps";
import { extractWeldedMesh } from "@/fabrication/printing/modeling/meshConversion";
import type { WeldedMesh } from "@/fabrication/printing/meshWelding";

// #######################################
// Plate with Through-Holes
// #######################################

export type PlatePoint = {
  readonly x: number;
  readonly y: number;
};

// The same per-curve sampling ExtrudeGeometry applied to these paths
// (curveSegments), so hole contours keep their previous vertex positions.
const holeCurveSegments = 24;

// A flat plate with through-holes, built directly in the Manifold kernel:
// extrude the outline, extrude each hole, subtract. Extruding the holed shape
// with three.js instead triangulates the caps with earcut, which emits
// T-junction edges when several hole corners are exactly collinear (a row of
// finger-joint slots) — boundary edges no vertex welding can close. Solid
// subtraction is manifold by construction.
export function extrudePlateWithHoles(outline: readonly PlatePoint[], holes: readonly Path[], height: number): WeldedMesh {
  return withGeometryArena(() => {
    const plate = extrudeContour(
      outline.map((point) => [point.x, point.y]),
      height,
    );
    const holeSolids = holes.map((hole) => extrudeContour(holeContourPoints(hole), height));
    const [firstHole, ...restHoles] = holeSolids;
    return extractWeldedMesh(firstHole === undefined ? plate : booleans.subtract(plate, firstHole, ...restHoles));
  });
}

function extrudeContour(points: ReadonlyArray<readonly number[]>, height: number): Geom3 {
  return extrusions.extrudeLinear({ height }, primitives.polygon({ points }));
}

// Sampled hole contour without the closing duplicate point a closed Path emits.
function holeContourPoints(hole: Path): ReadonlyArray<readonly number[]> {
  const points = hole.getPoints(holeCurveSegments);
  const first = points[0];
  const last = points[points.length - 1];
  const closed = points.length > 1 && first !== undefined && last !== undefined && first.equals(last);
  return (closed ? points.slice(0, -1) : points).map((point) => [point.x, point.y]);
}
