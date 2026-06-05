import { describe, expect, test } from "bun:test";
import { defaultTempestSettings, defaultTempestTowerFilter } from "@/domain/designs/tempest/model";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
import { towerCornerChamfer } from "@/fabrication/printing/designs/tempest/tempestGeometry";
import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

type Mesh = { readonly vertices: readonly MeshVertex[]; readonly triangles: readonly MeshTriangle[] };

type ManifoldReport = {
  readonly boundaryEdges: number;
  readonly overSharedEdges: number;
  readonly degenerateTriangles: number;
};

// A closed, printable solid must be 2-manifold: every edge is shared by exactly
// two triangles, and no triangle is degenerate. Slicers (Bambu Studio) report
// any other edge as a non-manifold edge and refuse to slice without repair.
function manifoldReport(mesh: Mesh): ManifoldReport {
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

const cleanManifold: ManifoldReport = { boundaryEdges: 0, overSharedEdges: 0, degenerateTriangles: 0 };

// Total handle count (genus): chi = V - E + F = 2C - 2g for C closed shells. A
// corner pinching through adds a tunnel (genus +1) while staying watertight, so
// manifoldReport can't see it — this can.
function totalGenus(mesh: Mesh): number {
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

describe("Tempest meshes are 2-manifold", () => {
  test("two-filter housing exports a watertight single body", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    expect(manifoldReport(kit.parts[0].mesh)).toEqual(cleanManifold);
  });

  test("every split bed-256 chunk is watertight", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "bed-256");
    expect(kit.parts.length).toBeGreaterThan(1);
    for (const part of kit.parts) {
      expect(manifoldReport(part.mesh)).toEqual(cleanManifold);
    }
  });

  test("honeycomb fan grills stay manifold", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    // The honeycomb grill was the dominant source of T-junctions under the prior
    // CSG backend; guard that the manifold kernel keeps it clean.
    expect(defaultTempestSettings.fan.opening.type).toBe("honeycomb");
    expect(manifoldReport(kit.parts[0].mesh)).toEqual(cleanManifold);
  });

  test("four-filter tower exports a watertight single body", () => {
    const kit = createTempestPrintableKit(
      { ...defaultTempestSettings, arrangement: { type: "four-side-filter-tower", filter: defaultTempestTowerFilter } },
      "unsplit",
    );
    expect(manifoldReport(kit.parts[0].mesh)).toEqual(cleanManifold);
  });

  const flange = defaultTempestSettings.frame.outsideFlangeThickness;
  const wall = defaultTempestSettings.frame.wallThickness;
  const fullChamfer = defaultTempestSettings.frame.towerCornerPostChamfer;

  test("thin filter: bevel shrinks below the max and never reaches the filter", () => {
    // ~2mm filter -> structuralOffset 17, pocket corner at x+y = 27. The 55mm max
    // would carve past the filter; the derived bevel must shrink and stay short of
    // the pocket corner (leaving the safe clearance to the filter).
    const structuralOffset = flange + 2 + wall;
    const bevel = towerCornerChamfer(fullChamfer, structuralOffset, flange);
    expect(bevel).toBeLessThan(fullChamfer);
    expect(bevel).toBeLessThan(structuralOffset + flange);
  });

  test("bevel never reaches the filter-pocket corner, so the corner stays tunnel-free", () => {
    // The pocket near corner is x+y = structuralOffset + outsideFlange. At defaults a
    // ~30mm filter put the old fixed 55mm bevel exactly on it -> a corner tunnel.
    const structuralOffset = flange + 30 + wall; // 45; pocket corner = 55
    const bevel = towerCornerChamfer(fullChamfer, structuralOffset, flange);
    expect(bevel).toBeLessThan(structuralOffset + flange);

    // And the real build at that thickness must stay tunnel-free. The corner is
    // independent of the grill, so use plain openings to keep this fast.
    const towerAt = (thickness: number) =>
      createTempestPrintableKit(
        {
          ...defaultTempestSettings,
          fan: { ...defaultTempestSettings.fan, opening: { type: "plain" } },
          arrangement: { type: "four-side-filter-tower", filter: { ...defaultTempestTowerFilter, thickness } },
        },
        "unsplit",
      ).parts[0].mesh;
    expect(totalGenus(towerAt(30))).toBe(totalGenus(towerAt(33)));
  });

  test("thick filters keep the full corner chamfer (the max cap)", () => {
    // structuralOffset 65 (~50mm filter): pocket corner far away, so the max applies.
    expect(towerCornerChamfer(fullChamfer, 65, flange)).toBe(fullChamfer);
  });

  test("four-filter tower with single box-exhaust stays manifold and differs from the fan grid", () => {
    const tower = { type: "four-side-filter-tower" as const, filter: defaultTempestTowerFilter };
    const grid = createTempestPrintableKit({ ...defaultTempestSettings, arrangement: tower }, "unsplit");
    const boxExhaust = createTempestPrintableKit(
      { ...defaultTempestSettings, arrangement: tower, fan: { ...defaultTempestSettings.fan, topExhaust: "single-box-fan" } },
      "unsplit",
    );
    expect(manifoldReport(boxExhaust.parts[0].mesh)).toEqual(cleanManifold);
    // A single opening + corner ties is far simpler than the honeycomb fan grid.
    expect(boxExhaust.parts[0].mesh.triangles.length).toBeLessThan(grid.parts[0].mesh.triangles.length);
  });
});
