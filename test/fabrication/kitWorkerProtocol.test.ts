import { describe, expect, test } from "bun:test";
import {
  findPrintVolumePreset,
  type PrintableKit,
  type PrintableMesh,
} from "@/fabrication/printing/printableKit";
import type { KitBuildResult } from "@/fabrication/printing/worker/kitBuild";
import { packKitBuildResult, unpackKitBuildResult } from "@/fabrication/printing/worker/kitWorkerProtocol";

// Kit vertices are rounded to 4 decimals before export, so Float64 positions
// must reproduce them exactly: the round trip is equality, not approximation.
const chunkMesh: PrintableMesh = {
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 123.4567, y: -0.0001, z: 480.25 },
    { x: -42.5, y: 7.75, z: 0.0003 },
  ],
  triangles: [{ v1: 0, v2: 1, v3: 2 }],
};

const capMesh: PrintableMesh = {
  vertices: [
    { x: 1, y: 2, z: 3 },
    { x: 4, y: 5, z: 6 },
    { x: 7, y: 8, z: 9 },
    { x: 10, y: 11, z: 12 },
  ],
  triangles: [
    { v1: 0, v2: 1, v3: 2 },
    { v1: 0, v2: 2, v3: 3 },
  ],
};

const kit: PrintableKit = {
  preset: findPrintVolumePreset("bed-256"),
  parts: [
    {
      kind: "tempest-print-chunk",
      id: "chunk-0-0-0",
      name: "Chunk 1",
      width: 123.4567,
      depth: 7.75,
      height: 480.25,
      mesh: chunkMesh,
      sourcePlacement: { x: 10, y: 20, z: 30 },
    },
    {
      kind: "donut-filter-cap",
      id: "cap",
      name: "Filter cap",
      width: 9,
      depth: 9,
      height: 9,
      mesh: capMesh,
    },
  ],
  summary: { partCount: 2, oversizedPartCount: 0, materialVolumeMm3: 1234.5 },
};

describe("kit worker wire format", () => {
  test("a built kit survives the pack/unpack round trip exactly", () => {
    const built: KitBuildResult = { type: "built", kit };
    const { result } = packKitBuildResult(built);
    expect(unpackKitBuildResult(result)).toEqual(built);
  });

  test("the transfer list carries every mesh buffer exactly once", () => {
    const { result, transfer } = packKitBuildResult({ type: "built", kit });
    if (result.type !== "built") {
      throw new Error("expected a built result");
    }
    const meshBuffers = result.kit.parts.flatMap((part) => [part.mesh.positions.buffer, part.mesh.indices.buffer]);
    expect(transfer).toEqual(meshBuffers);
    expect(new Set(transfer).size).toBe(kit.parts.length * 2);
  });

  test("a failure passes through with nothing to transfer", () => {
    const failed: KitBuildResult = { type: "failed", message: "kernel exploded" };
    const { result, transfer } = packKitBuildResult(failed);
    expect(transfer).toEqual([]);
    expect(unpackKitBuildResult(result)).toEqual(failed);
  });

  test("a zero-part kit round trips with an empty transfer list", () => {
    const emptyKit: PrintableKit = {
      preset: findPrintVolumePreset("bed-256"),
      parts: [],
      summary: { partCount: 0, oversizedPartCount: 0, materialVolumeMm3: 0 },
    };
    const built: KitBuildResult = { type: "built", kit: emptyKit };
    const { result, transfer } = packKitBuildResult(built);
    expect(transfer).toEqual([]);
    expect(unpackKitBuildResult(result)).toEqual(built);
  });

  test("an empty mesh round trips and still transfers its (zero-length) buffers", () => {
    const emptyMesh: PrintableMesh = { vertices: [], triangles: [] };
    const kitWithEmptyMesh: PrintableKit = {
      preset: findPrintVolumePreset("bed-256"),
      parts: [
        {
          kind: "donut-filter-cap",
          id: "cap-empty",
          name: "Degenerate cap",
          width: 0,
          depth: 0,
          height: 0,
          mesh: emptyMesh,
        },
      ],
      summary: { partCount: 1, oversizedPartCount: 0, materialVolumeMm3: 0 },
    };
    const built: KitBuildResult = { type: "built", kit: kitWithEmptyMesh };
    const { result, transfer } = packKitBuildResult(built);
    expect(transfer.length).toBe(2);
    expect(unpackKitBuildResult(result)).toEqual(built);
  });
});
