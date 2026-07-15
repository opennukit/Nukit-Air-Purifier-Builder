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

// #######################################
// Detached-Flake Removal
// #######################################

// The faceted chamfer lips around fan bores and filter openings mean that on a
// small bed, a chunk seam forced to thread close to one can shed a wafer-thin
// shaving that clips free of the chunk body. Because the mesh is welded (coincident
// points share an index), each such shaving is its OWN connected run of triangles,
// sharing no vertex with the body, a detached, unprintable flake that would just
// fall off the plate. This splits the welded mesh into its connected pieces by
// shared vertex index (the exact connectivity that prints) and drops any piece that
// is not the main body and is thinner than a real wall on its smallest axis. A
// genuine part (a wall panel, a plate segment) is at least a full material thickness
// thick, well above the threshold, so only shavings are ever removed.
const FLAKE_MIN_THICKNESS_MM = 2.5;

export function dropMeshFlakes(mesh: WeldedMesh): WeldedMesh {
  const vertexCount = mesh.vertices.length;
  if (vertexCount === 0 || mesh.triangles.length === 0) {
    return mesh;
  }
  const parent = Array.from({ length: vertexCount }, (_, index) => index);
  const find = (node: number): number => {
    let root = node;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[node] !== root) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
    }
  };
  for (const triangle of mesh.triangles) {
    union(triangle.v1, triangle.v2);
    union(triangle.v2, triangle.v3);
  }

  type PieceBox = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; count: number };
  const pieces = new Map<number, PieceBox>();
  for (let index = 0; index < vertexCount; index += 1) {
    const root = find(index);
    const vertex = mesh.vertices[index];
    const box = pieces.get(root);
    if (box === undefined) {
      pieces.set(root, { minX: vertex.x, minY: vertex.y, minZ: vertex.z, maxX: vertex.x, maxY: vertex.y, maxZ: vertex.z, count: 1 });
    } else {
      box.minX = Math.min(box.minX, vertex.x);
      box.minY = Math.min(box.minY, vertex.y);
      box.minZ = Math.min(box.minZ, vertex.z);
      box.maxX = Math.max(box.maxX, vertex.x);
      box.maxY = Math.max(box.maxY, vertex.y);
      box.maxZ = Math.max(box.maxZ, vertex.z);
      box.count += 1;
    }
  }
  if (pieces.size <= 1) {
    return mesh; // a single connected body has nothing detached to shed
  }

  // The body is the piece with the most vertices; it is always kept, so the mesh
  // can never be emptied. Every other piece is kept unless it is a wafer-thin flake.
  let bodyRoot = -1;
  let bodyCount = -1;
  for (const [root, box] of pieces) {
    if (box.count > bodyCount) {
      bodyCount = box.count;
      bodyRoot = root;
    }
  }
  const keepRoot = (root: number): boolean => {
    if (root === bodyRoot) {
      return true;
    }
    const box = pieces.get(root)!;
    const thinnest = Math.min(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
    return thinnest >= FLAKE_MIN_THICKNESS_MM;
  };
  let droppedAny = false;
  for (const root of pieces.keys()) {
    if (!keepRoot(root)) {
      droppedAny = true;
      break;
    }
  }
  if (!droppedAny) {
    return mesh;
  }

  const remap = new Map<number, number>();
  const vertices: MeshVertex[] = [];
  const triangles: MeshTriangle[] = [];
  const keepVertex = (index: number): number => {
    const existing = remap.get(index);
    if (existing !== undefined) {
      return existing;
    }
    const newIndex = vertices.length;
    vertices.push(mesh.vertices[index]);
    remap.set(index, newIndex);
    return newIndex;
  };
  for (const triangle of mesh.triangles) {
    if (keepRoot(find(triangle.v1))) {
      triangles.push({ v1: keepVertex(triangle.v1), v2: keepVertex(triangle.v2), v3: keepVertex(triangle.v3) });
    }
  }
  return { vertices, triangles };
}

// #######################################
// Fragility Inspection
// #######################################

// A read-only look at a finished part mesh for the fragility validator. `bodyCount`
// is how many separate connected bodies the part has; `thinnestBodyMm` is the
// smallest bounding-box extent of any body (for a flat panel this is its thickness,
// so it flags anything thinner than a wall); `smallestBodyMaxDimMm` is the smallest
// LARGEST extent of any body (a tiny nub is small on every axis, including this one).
export type MeshFragility = {
  readonly bodyCount: number;
  readonly thinnestBodyMm: number;
  readonly smallestBodyMaxDimMm: number;
};

export function inspectMeshFragility(mesh: WeldedMesh): MeshFragility {
  const vertexCount = mesh.vertices.length;
  if (vertexCount === 0 || mesh.triangles.length === 0) {
    return { bodyCount: 0, thinnestBodyMm: Infinity, smallestBodyMaxDimMm: Infinity };
  }
  const parent = Array.from({ length: vertexCount }, (_, index) => index);
  const find = (node: number): number => {
    let root = node;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[node] !== root) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
    }
  };
  for (const triangle of mesh.triangles) {
    union(triangle.v1, triangle.v2);
    union(triangle.v2, triangle.v3);
  }
  type Box = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
  const boxes = new Map<number, Box>();
  for (let index = 0; index < vertexCount; index += 1) {
    const root = find(index);
    const v = mesh.vertices[index];
    const box = boxes.get(root);
    if (box === undefined) {
      boxes.set(root, { minX: v.x, minY: v.y, minZ: v.z, maxX: v.x, maxY: v.y, maxZ: v.z });
    } else {
      box.minX = Math.min(box.minX, v.x); box.minY = Math.min(box.minY, v.y); box.minZ = Math.min(box.minZ, v.z);
      box.maxX = Math.max(box.maxX, v.x); box.maxY = Math.max(box.maxY, v.y); box.maxZ = Math.max(box.maxZ, v.z);
    }
  }
  let thinnestBodyMm = Infinity;
  let smallestBodyMaxDimMm = Infinity;
  for (const box of boxes.values()) {
    const dims = [box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ];
    thinnestBodyMm = Math.min(thinnestBodyMm, Math.min(...dims));
    smallestBodyMaxDimMm = Math.min(smallestBodyMaxDimMm, Math.max(...dims));
  }
  return { bodyCount: boxes.size, thinnestBodyMm, smallestBodyMaxDimMm };
}
