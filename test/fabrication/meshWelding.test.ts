import { describe, expect, test } from "bun:test";
import { dropMeshFlakes } from "@/fabrication/printing/meshWelding";
import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

// A closed box (8 local vertices, 12 triangles) at an offset. Indices are local
// (0-7); `combine` offsets them so each part is its own connected component.
function box(ox: number, oy: number, oz: number, w: number, d: number, h: number): { vertices: MeshVertex[]; triangles: MeshTriangle[] } {
  const vertices: MeshVertex[] = [
    { x: ox, y: oy, z: oz }, { x: ox + w, y: oy, z: oz }, { x: ox + w, y: oy + d, z: oz }, { x: ox, y: oy + d, z: oz },
    { x: ox, y: oy, z: oz + h }, { x: ox + w, y: oy, z: oz + h }, { x: ox + w, y: oy + d, z: oz + h }, { x: ox, y: oy + d, z: oz + h },
  ];
  const faces: ReadonlyArray<readonly [number, number, number]> = [
    [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 5, 1], [0, 4, 5],
    [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2],
  ];
  return { vertices, triangles: faces.map(([v1, v2, v3]) => ({ v1, v2, v3 })) };
}

// A thin tetrahedron (4 local vertices) whose smallest bounding-box extent is
// `thickness`, used as a detached flake distinct from the main body's 8 vertices.
function thinTetra(ox: number, thickness: number): { vertices: MeshVertex[]; triangles: MeshTriangle[] } {
  const vertices: MeshVertex[] = [
    { x: ox, y: 0, z: 0 }, { x: ox + 10, y: 0, z: 0 }, { x: ox, y: 10, z: 0 }, { x: ox + 3, y: 3, z: thickness },
  ];
  const triangles: MeshTriangle[] = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]].map(([v1, v2, v3]) => ({ v1, v2, v3 }));
  return { vertices, triangles };
}

function combine(parts: ReadonlyArray<{ vertices: MeshVertex[]; triangles: MeshTriangle[] }>) {
  const vertices: MeshVertex[] = [];
  const triangles: MeshTriangle[] = [];
  for (const part of parts) {
    const base = vertices.length;
    vertices.push(...part.vertices);
    for (const t of part.triangles) triangles.push({ v1: t.v1 + base, v2: t.v2 + base, v3: t.v3 + base });
  }
  return { vertices, triangles };
}

describe("dropMeshFlakes", () => {
  test("drops a detached wafer-thin flake and keeps the main body", () => {
    const mesh = combine([box(0, 0, 0, 20, 20, 20), thinTetra(100, 0.8)]);
    const result = dropMeshFlakes(mesh);
    expect(result.vertices.length).toBe(8); // only the body survives
  });

  test("keeps a single connected body untouched", () => {
    const mesh = box(0, 0, 0, 20, 20, 20);
    expect(dropMeshFlakes(mesh).vertices.length).toBe(8);
  });

  test("the wall-thickness cap keeps a fragment as thick as a thin wall", () => {
    // A 2 mm fragment is a flake at the default 2.5 mm threshold, but a real wall
    // when the model wall is 2 mm thick (cap = min(2.5, 0.6*2) = 1.2 mm).
    const mesh = combine([box(0, 0, 0, 20, 20, 20), thinTetra(100, 2)]);
    expect(dropMeshFlakes(mesh).vertices.length).toBe(8); // default 2.5 mm: dropped
    expect(dropMeshFlakes(mesh, 2).vertices.length).toBe(12); // 2 mm wall: kept
  });
});
