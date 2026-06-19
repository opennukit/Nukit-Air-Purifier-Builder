import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

// A single mesh as a binary STL. Binary (not ASCII) keeps the files small and is
// universally accepted by slicers. The 80-byte header is left blank — it must
// not begin with "solid", which would make readers treat the file as ASCII.
export function createBinaryStl(vertices: readonly MeshVertex[], triangles: readonly MeshTriangle[]): Uint8Array {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);

  let offset = 84;
  for (const triangle of triangles) {
    const a = vertices[triangle.v1];
    const b = vertices[triangle.v2];
    const c = vertices[triangle.v3];
    const n = faceNormal(a, b, c);
    view.setFloat32(offset, n.x, true);
    view.setFloat32(offset + 4, n.y, true);
    view.setFloat32(offset + 8, n.z, true);
    writeVertex(view, offset + 12, a);
    writeVertex(view, offset + 24, b);
    writeVertex(view, offset + 36, c);
    view.setUint16(offset + 48, 0, true); // attribute byte count
    offset += 50;
  }
  return new Uint8Array(buffer);
}

function writeVertex(view: DataView, offset: number, vertex: MeshVertex): void {
  view.setFloat32(offset, vertex.x, true);
  view.setFloat32(offset + 4, vertex.y, true);
  view.setFloat32(offset + 8, vertex.z, true);
}

function faceNormal(a: MeshVertex, b: MeshVertex, c: MeshVertex): MeshVertex {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: nx / length, y: ny / length, z: nz / length };
}
