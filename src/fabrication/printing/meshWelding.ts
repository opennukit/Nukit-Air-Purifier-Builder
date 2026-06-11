import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

// #######################################
// Export-Precision Vertex Welding
// #######################################

// 3MF coordinates are written at four-decimal millimeter precision (threeMf.ts),
// so two vertices that agree at that precision are the same physical point in
// the exported file. The welder snaps every vertex to that precision and merges
// coincident positions into a single index, so triangles that meet at the same
// physical point share it in index space too — every interior edge becomes a
// genuinely shared (2-manifold) edge instead of a pair of private boundary
// edges in a triangle soup. Triangles the snap collapses are dropped as
// degenerate.

const exportPrecisionDecimals = 4;

export function roundMillimeters(value: number): number {
  return Number(value.toFixed(exportPrecisionDecimals));
}

export function roundVertex(vertex: MeshVertex): MeshVertex {
  return {
    x: roundMillimeters(vertex.x),
    y: roundMillimeters(vertex.y),
    z: roundMillimeters(vertex.z),
  };
}

export type WeldedMesh = {
  readonly vertices: readonly MeshVertex[];
  readonly triangles: readonly MeshTriangle[];
};

export type MeshWelder = {
  addTriangle(first: MeshVertex, second: MeshVertex, third: MeshVertex): void;
  build(): WeldedMesh;
};

export function createMeshWelder(): MeshWelder {
  const vertices: MeshVertex[] = [];
  const triangles: MeshTriangle[] = [];
  const indexByPosition = new Map<string, number>();

  const weldVertex = (vertex: MeshVertex): number => {
    const snapped = roundVertex(vertex);
    const positionKey = `${snapped.x},${snapped.y},${snapped.z}`;
    const existingIndex = indexByPosition.get(positionKey);
    if (existingIndex !== undefined) {
      return existingIndex;
    }
    const newIndex = vertices.length;
    vertices.push(snapped);
    indexByPosition.set(positionKey, newIndex);
    return newIndex;
  };

  return {
    addTriangle(first, second, third) {
      const v1 = weldVertex(first);
      const v2 = weldVertex(second);
      const v3 = weldVertex(third);
      if (v1 === v2 || v2 === v3 || v1 === v3) {
        return;
      }
      triangles.push({ v1, v2, v3 });
    },
    build: () => ({ vertices, triangles }),
  };
}
