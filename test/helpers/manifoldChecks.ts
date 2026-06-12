import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

// #######################################
// Mesh Manifoldness Checks
// #######################################

export type Mesh = { readonly vertices: readonly MeshVertex[]; readonly triangles: readonly MeshTriangle[] };

export type ManifoldReport = {
  readonly boundaryEdges: number;
  readonly overSharedEdges: number;
  readonly degenerateTriangles: number;
};

// A closed, printable solid must be 2-manifold: every edge is shared by exactly
// two triangles, and no triangle is degenerate. Slicers (Bambu Studio) report
// any other edge as a non-manifold edge and refuse to slice without repair.
export function manifoldReport(mesh: Mesh): ManifoldReport {
  const edgeUse = new Map<string, number>();
  let degenerateTriangles = 0;
  for (const triangle of mesh.triangles) {
    const corners = [triangle.v1, triangle.v2, triangle.v3];
    if (corners[0] === corners[1] || corners[1] === corners[2] || corners[0] === corners[2]) {
      degenerateTriangles += 1;
    }
    for (let edge = 0; edge < 3; edge += 1) {
      const a = corners[edge];
      const b = corners[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  const counts = [...edgeUse.values()];
  return {
    boundaryEdges: counts.filter((count) => count === 1).length,
    overSharedEdges: counts.filter((count) => count > 2).length,
    degenerateTriangles,
  };
}

export const cleanManifold: ManifoldReport = { boundaryEdges: 0, overSharedEdges: 0, degenerateTriangles: 0 };

// Total handle count (genus): chi = V - E + F = 2C - 2g for C closed shells. A
// corner pinching through adds a tunnel (genus +1) while staying watertight, so
// manifoldReport can't see it — this can.
export function totalGenus(mesh: Mesh): number {
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r) as number;
    return r;
  };
  const edges = new Set<string>();
  const used = new Set<number>();
  for (const t of mesh.triangles) {
    for (const v of [t.v1, t.v2, t.v3]) {
      if (!parent.has(v)) parent.set(v, v);
      used.add(v);
    }
    for (const [a, b] of [
      [t.v1, t.v2],
      [t.v2, t.v3],
      [t.v3, t.v1],
    ] as const) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
      edges.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    }
  }
  const roots = new Set<number>();
  for (const v of used) roots.add(find(v));
  return (2 * roots.size - (used.size - edges.size + mesh.triangles.length)) / 2;
}

// Signed enclosed volume of a watertight mesh via the divergence theorem.
// Lets a test assert a region is solid (or open) by intersecting and comparing.
export function meshVolume(mesh: Mesh): number {
  let volume = 0;
  for (const t of mesh.triangles) {
    const a = mesh.vertices[t.v1];
    const b = mesh.vertices[t.v2];
    const c = mesh.vertices[t.v3];
    volume +=
      (a.x * (b.y * c.z - c.y * b.z) - a.y * (b.x * c.z - c.x * b.z) + a.z * (b.x * c.y - c.x * b.y)) / 6;
  }
  return volume;
}

// Number of connected shells. A part meant to print as one body must report 1 —
// a watertight mesh can still be several disjoint pieces (e.g. a grill that
// never touches its frame), which prints as loose parts.
export function shellCount(mesh: Mesh): number {
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r) as number;
    return r;
  };
  const used = new Set<number>();
  for (const t of mesh.triangles) {
    for (const v of [t.v1, t.v2, t.v3]) {
      if (!parent.has(v)) parent.set(v, v);
      used.add(v);
    }
    for (const [a, b] of [
      [t.v1, t.v2],
      [t.v2, t.v3],
    ] as const) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }
  }
  const roots = new Set<number>();
  for (const v of used) roots.add(find(v));
  return roots.size;
}
