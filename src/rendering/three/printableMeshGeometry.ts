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
  // Map build->scene with a PROPER rotation instead of the legacy y<->z reflection,
  // so chiral detail (engraved chunk codes) reads correctly rather than mirrored.
  // The assembled-housing preview leaves this off (it has no chiral content and the
  // reflection is consistent across its parts); the print-plate preview turns it on.
  readonly mirrorFree?: boolean;
};

export function printableMeshToBufferGeometry(
  mesh: PrintableMesh,
  placement: PrintableMeshPlacement,
  shading: PrintableMeshShading,
): BufferGeometry {
  const { scale } = placement;
  const [offsetX, offsetUp, offsetZ] = placement.offset;

  const positions: number[] = [];
  const indices: number[] = [];
  if (placement.mirrorFree === true) {
    // Proper rotation (−90° about X): build (x, y, z) -> scene (x, z, -y), with the
    // part's y-extent added so it occupies the same bed footprint as the reflected
    // map. determinant +1, so winding is preserved (no v2/v3 swap) and engraved text
    // reads the right way round.
    let yMax = -Infinity;
    for (const vertex of mesh.vertices) {
      yMax = Math.max(yMax, vertex.y);
    }
    for (const vertex of mesh.vertices) {
      positions.push(scale * vertex.x + offsetX, scale * vertex.z + offsetUp, scale * (yMax - vertex.y) + offsetZ);
    }
    for (const triangle of mesh.triangles) {
      indices.push(triangle.v1, triangle.v2, triangle.v3);
    }
  } else {
    // Legacy: build space is Z-up; the scene is Y-up, so y and z swap. That swap is a
    // reflection (determinant −1) and reverses triangle winding — the index loop
    // swaps v2/v3 back to keep the shell CCW-outward. It mirrors chiral detail, so it
    // is only used where there is none (the assembled-housing preview).
    for (const vertex of mesh.vertices) {
      positions.push(scale * vertex.x + offsetX, scale * vertex.z + offsetUp, scale * vertex.y + offsetZ);
    }
    for (const triangle of mesh.triangles) {
      indices.push(triangle.v1, triangle.v3, triangle.v2);
    }
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
