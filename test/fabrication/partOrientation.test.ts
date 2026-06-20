import { describe, expect, test } from "bun:test";
import { orientChunkVerticesForPrinting } from "@/fabrication/printing/partOrientation";
import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

// A closed axis-aligned box with outward-facing winding, so the orientation
// scorer sees correct facet normals (bottom faces down, top faces up, etc.).
function makeBox(width: number, depth: number, height: number): {
  vertices: MeshVertex[];
  triangles: MeshTriangle[];
} {
  const vertices: MeshVertex[] = [
    { x: 0, y: 0, z: 0 },
    { x: width, y: 0, z: 0 },
    { x: width, y: depth, z: 0 },
    { x: 0, y: depth, z: 0 },
    { x: 0, y: 0, z: height },
    { x: width, y: 0, z: height },
    { x: width, y: depth, z: height },
    { x: 0, y: depth, z: height },
  ];
  const center = { x: width / 2, y: depth / 2, z: height / 2 };
  const faces: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 2], [0, 2, 3], // bottom
    [4, 5, 6], [4, 6, 7], // top
    [0, 1, 5], [0, 5, 4], // front
    [3, 2, 6], [3, 6, 7], // back
    [0, 3, 7], [0, 7, 4], // left
    [1, 2, 6], [1, 6, 5], // right
  ];
  // Force each triangle's winding so its normal points away from the box
  // center, guaranteeing outward normals regardless of the listing above.
  const triangles = faces.map(([a, b, c]) => {
    const va = vertices[a]!;
    const vb = vertices[b]!;
    const vc = vertices[c]!;
    const ux = vb.x - va.x, uy = vb.y - va.y, uz = vb.z - va.z;
    const vx = vc.x - va.x, vy = vc.y - va.y, vz = vc.z - va.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (va.x + vb.x + vc.x) / 3 - center.x;
    const cy = (va.y + vb.y + vc.y) / 3 - center.y;
    const cz = (va.z + vb.z + vc.z) / 3 - center.z;
    const outward = nx * cx + ny * cy + nz * cz >= 0;
    return outward ? { v1: a, v2: b, v3: c } : { v1: a, v2: c, v3: b };
  });
  return { vertices, triangles };
}

const extent = (vs: readonly MeshVertex[], axis: "x" | "y" | "z"): number =>
  Math.max(...vs.map((v) => v[axis])) - Math.min(...vs.map((v) => v[axis]));
const zExtent = (vs: readonly MeshVertex[]): number => extent(vs, "z");
// The two bed-plane extents, sorted, so we can assert which face rests on the
// plate without depending on which way the part spun about the vertical axis.
const footprint = (vs: readonly MeshVertex[]): readonly number[] =>
  [extent(vs, "x"), extent(vs, "y")].sort((a, b) => a - b);

describe("orientChunkVerticesForPrinting", () => {
  test("rests a tall thin part on its largest face (thinnest dimension becomes the height)", () => {
    const { vertices, triangles } = makeBox(4, 6, 40);

    const oriented = orientChunkVerticesForPrinting(vertices, triangles);

    // The 4 mm dimension becomes the height; the large 6 x 40 face lies on the bed.
    expect(zExtent(oriented)).toBeCloseTo(4, 6);
    expect(footprint(oriented)).toEqual([6, 40]);
  });

  test("leaves an already-flat part on its large face (identity wins ties)", () => {
    const { vertices, triangles } = makeBox(40, 40, 4);

    const oriented = orientChunkVerticesForPrinting(vertices, triangles);

    expect(oriented).toEqual(vertices);
    expect(zExtent(oriented)).toBeCloseTo(4, 6);
  });

  test("lays a plate that is thin along the depth axis flat instead of on edge", () => {
    // A panel only 4 mm deep (Y) but tall in Z. The previous depth-axis-only
    // orienter could not tip this down, so it printed standing on edge. It must
    // now rest on its large 40 x 30 face with the 4 mm dimension as the height.
    const { vertices, triangles } = makeBox(40, 4, 30);

    const oriented = orientChunkVerticesForPrinting(vertices, triangles);

    expect(zExtent(oriented)).toBeCloseTo(4, 6);
    expect(footprint(oriented)).toEqual([30, 40]);
  });
});
