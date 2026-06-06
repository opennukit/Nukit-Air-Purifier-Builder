import { BufferGeometry, Float32BufferAttribute } from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PrintableMesh } from "@/fabrication/printing/printableKit";

// #######################################
// Printable Mesh → three.js Geometry
// #######################################

// The one place a Manifold-welded printable mesh is turned into a scene-ready
// BufferGeometry, shared by the assembled-housing and print-plate previews so the
// two boundary bugs below only ever need fixing once.

// How to shade the welded mesh. `creased` splits a vertex's normal at dihedrals
// >= creaseAngleRadians; `averaged` keeps three's plain area-weighted average
// (used by the flat-shaded material, which ignores vertex normals anyway).
export type PrintableMeshShading =
  | { readonly type: "creased"; readonly creaseAngleRadians: number }
  | { readonly type: "averaged" };

// Where the part sits in the Y-up scene: a uniform millimetre→scene `scale` and a
// scene-space `offset` (x, up, z). The build→scene axis swap is NOT a caller
// concern — it lives in the placement below — so no caller can get it wrong.
export type PrintableMeshPlacement = {
  readonly scale: number;
  readonly offset: readonly [number, number, number];
};

export function printableMeshToBufferGeometry(
  mesh: PrintableMesh,
  placement: PrintableMeshPlacement,
  shading: PrintableMeshShading,
): BufferGeometry {
  const { scale } = placement;
  const [offsetX, offsetUp, offsetZ] = placement.offset;

  // Build space is Z-up; the scene is Y-up, so y and z swap. That swap is a
  // reflection (determinant −1) and reverses triangle winding — see the index
  // loop, which swaps v2/v3 back to keep the shell CCW-outward.
  const positions: number[] = [];
  for (const vertex of mesh.vertices) {
    positions.push(scale * vertex.x + offsetX, scale * vertex.z + offsetUp, scale * vertex.y + offsetZ);
  }

  // Undo the reflection's winding flip; otherwise FrontSide culling renders the
  // part inside-out (you see through near walls — phantom holes at corners/grills).
  const indices: number[] = [];
  for (const triangle of mesh.triangles) {
    indices.push(triangle.v1, triangle.v3, triangle.v2);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  // The weld shares each flat-wall vertex with the triangle fan bored around screw
  // holes/chamfers; plain averaged normals then bend the wall into a wrinkled
  // "tent" radiating from the hole. Creasing splits normals at sharp dihedrals so
  // flat walls stay flat while grills and rounded corners read smooth.
  geometry.computeVertexNormals();
  return shading.type === "creased" ? toCreasedNormals(geometry, shading.creaseAngleRadians) : geometry;
}
