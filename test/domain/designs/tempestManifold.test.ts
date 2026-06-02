import { describe, expect, test } from "bun:test";
import { defaultTempestSettings, defaultTempestTowerFilter } from "@/domain/designs/tempest/model";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
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
