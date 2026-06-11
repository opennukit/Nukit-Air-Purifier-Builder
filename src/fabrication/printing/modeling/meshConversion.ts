import { manifoldKernel, track } from "@/fabrication/printing/modeling/manifoldKernel";
import { type Geom3, meshData, POSITION_PROP_COUNT } from "@/fabrication/printing/modeling/manifoldOps";
import { createMeshWelder, type WeldedMesh } from "@/fabrication/printing/meshWelding";
import type { MeshVertex } from "@/fabrication/printing/threeMf";

// #######################################
// Manifold Solid to Welded Mesh
// #######################################

// Manifold guarantees the solid's topology is watertight and T-junction-free,
// but `getMesh()` may still duplicate a position across its internal face runs.
// Welding coincident vertices (snapped to export precision) into one index
// collapses those duplicates, yielding a compact, fully edge-shared mesh.
// ARENA_LIFETIME: reads the solid's live WASM handle via meshData, so this must
// run inside the `withGeometryArena` call that built `solid`.
export function extractWeldedMesh(solid: Geom3): WeldedMesh {
  const mesh = meshData(solid);
  const welder = createMeshWelder();

  // Position occupies the first POSITION_PROP_COUNT channels of the vertex; the
  // stride between vertices is the full per-vertex property count (numProp).
  const vertexAt = (sourceIndex: number): MeshVertex => readPosition(mesh.vertProperties, sourceIndex * mesh.numProp);

  for (let cursor = 0; cursor < mesh.triVerts.length; cursor += 3) {
    welder.addTriangle(vertexAt(mesh.triVerts[cursor]), vertexAt(mesh.triVerts[cursor + 1]), vertexAt(mesh.triVerts[cursor + 2]));
  }
  return welder.build();
}

// Reads the x, y, z position from the first POSITION_PROP_COUNT channels of a
// vertex's interleaved properties. The xyz field names of `MeshVertex` are the
// canonical naming of that layout, so this maps the channels onto them.
function readPosition(vertProperties: Float32Array, positionBase: number): MeshVertex {
  const [xChannel, yChannel, zChannel] = positionChannelsFrom(positionBase);
  return {
    x: vertProperties[xChannel],
    y: vertProperties[yChannel],
    z: vertProperties[zChannel],
  };
}

function positionChannelsFrom(positionBase: number): readonly number[] {
  return Array.from({ length: POSITION_PROP_COUNT }, (_, channel) => positionBase + channel);
}

// #######################################
// Welded Mesh to Manifold Solid
// #######################################

// The inverse direction: lifts an already-closed welded mesh into the kernel so
// it can participate in boolean ops. `Manifold.ofMesh` throws unless the input
// is an oriented 2-manifold, so a soup that slipped past the welder fails loudly
// here instead of exporting self-intersecting shells. `merge()` only rebuilds
// the merge vectors for positions that still coincide at the kernel's tolerance
// (a no-op for an already-welded mesh); it never moves or drops geometry.
// ARENA_LIFETIME: the returned solid is tracked, so this must run inside the
// `withGeometryArena` call that will consume it.
export function solidFromWeldedMesh(mesh: WeldedMesh): Geom3 {
  const { Manifold, Mesh } = manifoldKernel();
  const vertProperties = new Float32Array(mesh.vertices.length * POSITION_PROP_COUNT);
  for (const [vertexIndex, vertex] of mesh.vertices.entries()) {
    const [xChannel, yChannel, zChannel] = positionChannelsFrom(vertexIndex * POSITION_PROP_COUNT);
    vertProperties[xChannel] = vertex.x;
    vertProperties[yChannel] = vertex.y;
    vertProperties[zChannel] = vertex.z;
  }
  const triVerts = new Uint32Array(mesh.triangles.length * 3);
  for (const [triangleIndex, triangle] of mesh.triangles.entries()) {
    triVerts[triangleIndex * 3] = triangle.v1;
    triVerts[triangleIndex * 3 + 1] = triangle.v2;
    triVerts[triangleIndex * 3 + 2] = triangle.v3;
  }
  const meshGl = new Mesh({ numProp: POSITION_PROP_COUNT, vertProperties, triVerts });
  meshGl.merge();
  return track(Manifold.ofMesh(meshGl));
}
