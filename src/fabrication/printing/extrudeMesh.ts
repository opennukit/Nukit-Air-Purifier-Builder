import { BufferAttribute, ExtrudeGeometry, type Shape } from "three";
import { createMeshWelder, type WeldedMesh } from "@/fabrication/printing/meshWelding";
import type { MeshVertex } from "@/fabrication/printing/threeMf";

// #######################################
// Shape Extrusion to Welded Mesh
// #######################################

// three.js ExtrudeGeometry emits non-indexed triangle soup: every triangle owns
// private copies of its corner vertices, so converting it position-by-position
// exports every edge as a boundary edge and slicers flag the part as
// non-manifold. The cap and wall triangles are generated from the same shape
// points, so welding the soup at export precision reconstructs the closed solid
// the extrusion describes.
export function extrudeShapeToMesh(shape: Shape, height: number, curveSegments = 24): WeldedMesh {
  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments,
    steps: 1,
  });
  try {
    return weldExtrudeGeometry(geometry);
  } finally {
    geometry.dispose();
  }
}

function weldExtrudeGeometry(geometry: ExtrudeGeometry): WeldedMesh {
  const position = geometry.getAttribute("position");
  if (!(position instanceof BufferAttribute)) {
    throw new Error("weldExtrudeGeometry: Missing position buffer");
  }

  const vertexAt = (vertexIndex: number): MeshVertex => ({
    x: position.getX(vertexIndex),
    y: position.getY(vertexIndex),
    z: position.getZ(vertexIndex),
  });
  const index = geometry.index;
  const cornerAt = (cursor: number): number => (index === null ? cursor : index.getX(cursor));
  const cornerCount = index === null ? position.count : index.count;

  const welder = createMeshWelder();
  for (let cursor = 0; cursor + 2 < cornerCount; cursor += 3) {
    welder.addTriangle(vertexAt(cornerAt(cursor)), vertexAt(cornerAt(cursor + 1)), vertexAt(cornerAt(cursor + 2)));
  }
  return welder.build();
}
