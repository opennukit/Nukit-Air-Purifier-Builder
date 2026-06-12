// The message contract between the kit worker and its client. Requests are
// plain data (RawPurifierSettings in). Responses carry the built kit with each
// mesh packed into flat typed arrays whose buffers ride the postMessage
// transfer list, so structured clone moves them in O(1) instead of walking
// tens of thousands of vertex objects on the main thread. PrintableMesh stays
// the domain format on both sides; packing exists only on the wire.

import type { RawPurifierSettings } from "@/domain/purifier/settingsModel";
import type {
  PrintableKitSummary,
  PrintableMesh,
  PrintablePart,
  PrintablePartWithMesh,
  PrintVolumePreset,
  PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";
import type { KitBuildResult } from "@/fabrication/printing/worker/kitBuild";

export type KitWorkerRequest = {
  readonly requestId: number;
  readonly rawSettings: RawPurifierSettings;
  readonly presetId: PrintVolumePresetId;
};

export type KitWorkerResponse = {
  readonly requestId: number;
  readonly result: PackedKitBuildResult;
};

// #######################################
// Packed Kit Wire Format
// #######################################

// Float64 positions preserve the kit's 4-decimal vertex coordinates exactly.
// The explicit ArrayBuffer type argument records that these views own plain
// (transferable) buffers, which the transfer list requires.
export type PackedMesh = {
  /** x, y, z per vertex. */
  readonly positions: Float64Array<ArrayBuffer>;
  /** v1, v2, v3 per triangle. */
  readonly indices: Uint32Array<ArrayBuffer>;
};

export type PackedPrintablePart = PrintablePartWithMesh<PackedMesh>;

export type PackedPrintableKit = {
  readonly preset: PrintVolumePreset;
  readonly parts: readonly PackedPrintablePart[];
  readonly summary: PrintableKitSummary;
};

export type PackedKitBuildResult =
  | { readonly type: "built"; readonly kit: PackedPrintableKit }
  | { readonly type: "failed"; readonly message: string };

// What the worker hands to postMessage: the packed result plus the transfer
// list that moves the mesh buffers between threads instead of copying them.
export type PackedKitBuildResultWithTransfer = {
  readonly result: PackedKitBuildResult;
  readonly transfer: readonly ArrayBuffer[];
};

// #######################################
// Packing and Unpacking
// #######################################

export function packKitBuildResult(buildResult: KitBuildResult): PackedKitBuildResultWithTransfer {
  if (buildResult.type === "failed") {
    return { result: buildResult, transfer: [] };
  }
  const parts = buildResult.kit.parts.map(packPrintablePart);
  return {
    result: {
      type: "built",
      kit: { preset: buildResult.kit.preset, parts, summary: buildResult.kit.summary },
    },
    transfer: parts.flatMap((part) => [part.mesh.positions.buffer, part.mesh.indices.buffer]),
  };
}

export function unpackKitBuildResult(packedResult: PackedKitBuildResult): KitBuildResult {
  if (packedResult.type === "failed") {
    return packedResult;
  }
  return {
    type: "built",
    kit: {
      preset: packedResult.kit.preset,
      parts: packedResult.kit.parts.map(unpackPrintablePart),
      summary: packedResult.kit.summary,
    },
  };
}

// The branches are textually identical; the narrowing keeps the part union's
// kind/sourcePlacement pairing intact through the spread.
function packPrintablePart(part: PrintablePart): PackedPrintablePart {
  if (part.kind === "tempest-print-chunk") {
    return { ...part, mesh: packPrintableMesh(part.mesh) };
  }
  return { ...part, mesh: packPrintableMesh(part.mesh) };
}

function unpackPrintablePart(part: PackedPrintablePart): PrintablePart {
  if (part.kind === "tempest-print-chunk") {
    return { ...part, mesh: unpackPrintableMesh(part.mesh) };
  }
  return { ...part, mesh: unpackPrintableMesh(part.mesh) };
}

function packPrintableMesh(mesh: PrintableMesh): PackedMesh {
  const positions = new Float64Array(mesh.vertices.length * 3);
  mesh.vertices.forEach((vertex, index) => {
    positions[index * 3] = vertex.x;
    positions[index * 3 + 1] = vertex.y;
    positions[index * 3 + 2] = vertex.z;
  });
  const indices = new Uint32Array(mesh.triangles.length * 3);
  mesh.triangles.forEach((triangle, index) => {
    indices[index * 3] = triangle.v1;
    indices[index * 3 + 1] = triangle.v2;
    indices[index * 3 + 2] = triangle.v3;
  });
  return { positions, indices };
}

function unpackPrintableMesh(mesh: PackedMesh): PrintableMesh {
  const vertices: MeshVertex[] = [];
  for (let offset = 0; offset < mesh.positions.length; offset += 3) {
    vertices.push({
      x: mesh.positions[offset],
      y: mesh.positions[offset + 1],
      z: mesh.positions[offset + 2],
    });
  }
  const triangles: MeshTriangle[] = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    triangles.push({
      v1: mesh.indices[offset],
      v2: mesh.indices[offset + 1],
      v3: mesh.indices[offset + 2],
    });
  }
  return { vertices, triangles };
}
