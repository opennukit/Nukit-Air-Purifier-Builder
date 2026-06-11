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
