import { describe, expect, test } from "bun:test";
import { createBinaryStl } from "@/fabrication/printing/stl";
import { createPrintableStlZipFromKit, findPrintVolumePreset, type PrintableKit } from "@/fabrication/printing/printableKit";

const triangleMesh = {
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  ],
  triangles: [{ v1: 0, v2: 1, v3: 2 }],
};

function part(id: string) {
  return { id, name: `Part ${id}`, width: 1, depth: 1, height: 0, mesh: triangleMesh, kind: "donut-fan-guard" as const };
}

describe("binary STL", () => {
  test("has the 84-byte header+count plus 50 bytes per triangle", () => {
    const stl = createBinaryStl(triangleMesh.vertices, triangleMesh.triangles);
    expect(stl.byteLength).toBe(84 + 50);
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
    expect(view.getUint32(80, true)).toBe(1);
  });

  test("does not start with 'solid' (so readers treat it as binary)", () => {
    const stl = createBinaryStl(triangleMesh.vertices, triangleMesh.triangles);
    const head = String.fromCharCode(...stl.slice(0, 5));
    expect(head).not.toBe("solid");
  });
});

describe("per-chunk STL ZIP", () => {
  const kit: PrintableKit = {
    preset: findPrintVolumePreset("bed-256"),
    parts: [part("a"), part("b")],
    summary: { partCount: 2, oversizedPartCount: 0 },
  };
  const zip = createPrintableStlZipFromKit(kit, "test-kit");

  test("bundles one .stl per part into a zip", () => {
    expect(zip.filename).toBe("test-kit.zip");
    expect(zip.mimeType).toBe("application/zip");
    expect(zip.entries.length).toBe(2);
    expect(zip.entries.every((entry) => entry.filename.endsWith(".stl"))).toBe(true);
    expect(zip.bytes.byteLength).toBeGreaterThan(0);
  });
});
