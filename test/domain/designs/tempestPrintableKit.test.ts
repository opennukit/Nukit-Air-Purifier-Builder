import { describe, expect, test } from "bun:test";
import {
  defaultTempestSettings,
  defaultTempestTowerFilter,
} from "@/domain/designs/tempest/model";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/settingsModel";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
import { createPrintDesignKit, createPrintDesignThreeMfExport } from "@/fabrication/printing/printDesignKit";
import { createPrintableThreeMfExportFromKit } from "@/fabrication/printing/printableKit";

const openScadTowerCornerPostChamfer = 55;

describe("Tempest CSG printable kit", () => {
  test("generates bed-sized CSG chunks for the default two-filter housing", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "bed-256");

    // Feature-aware slicing threads seams between the 140 mm fan grills, which
    // needs a third chunk on the fan-dense axis (2×2×3) rather than a uniform 2×2×2.
    expect(kit.parts).toHaveLength(12);
    expect(kit.summary).toMatchObject({
      partCount: 12,
      splitPanelCount: 1,
      oversizedPartCount: 0,
      sourceCutFeatureCount: 31,
      retainedCutFeatureCount: 31,
    });
    expect(kit.parts.every((part) => part.kind === "tempest-print-chunk")).toBe(true);
    expect(kit.parts.every((part) => part.width <= 256 && part.depth <= 256 && part.height <= 256)).toBe(true);
    expect(kit.parts.every((part) => part.mesh.vertices.length > 0 && part.mesh.triangles.length > 0)).toBe(true);
    expect(kit.parts.every((part) => meshFitsDeclaredBounds(part))).toBe(true);
    // Chunks are no longer uniform — the boundaries are snapped off the grills.
    expect(new Set(kit.parts.map((part) => part.height)).size).toBeGreaterThan(1);
  });

  test("orients the default two-filter housing upright for preview and 3MF export", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    const part = kit.parts[0];

    expect(kit.parts).toHaveLength(1);
    expect(part).toMatchObject({
      width: 507,
      depth: 262,
      height: 507,
    });
    expect(meshBounds(part.mesh)).toEqual({
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 507,
      maxY: 262,
      maxZ: 507,
    });
  });

  test("keeps the OpenSCAD-style horizontal housing corner chamfers", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    const part = kit.parts[0];

    expect(meshCoordinateValues(part.mesh, "x")).toEqual(expect.arrayContaining([2, 505]));
    expect(meshCoordinateValues(part.mesh, "z")).toEqual(expect.arrayContaining([2, 505]));
  });

  test("does not add alignment pin holes when the posed printable output is unsplit", () => {
    const withDefaultPins = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    const withPinsDisabled = createTempestPrintableKit(
      {
        ...defaultTempestSettings,
        alignmentPins: { type: "disabled" },
      },
      "unsplit",
    );

    expect(withDefaultPins.parts).toHaveLength(1);
    expect(withPinsDisabled.parts).toHaveLength(1);
    expect(meshSignature(withDefaultPins.parts[0].mesh)).toEqual(meshSignature(withPinsDisabled.parts[0].mesh));
  });

  test("generates chunked CSG geometry for the four-filter tower", () => {
    const kit = createTempestPrintableKit(
      {
        ...defaultTempestSettings,
        arrangement: {
          type: "four-side-filter-tower",
          filter: defaultTempestTowerFilter,
        },
      },
      "bed-256",
    );

    expect(kit.parts).toHaveLength(18);
    expect(kit.summary).toMatchObject({
      partCount: 18,
      splitPanelCount: 1,
      oversizedPartCount: 0,
      sourceCutFeatureCount: 54,
      retainedPrintCriticalCutFeatureCount: 54,
    });
    expect(kit.parts.every((part) => part.width <= 256 && part.depth <= 256 && part.height <= 256)).toBe(true);
    expect(kit.parts.every((part) => part.mesh.vertices.length > 0 && part.mesh.triangles.length > 0)).toBe(true);
    expect(kit.parts.every((part) => meshFitsDeclaredBounds(part))).toBe(true);
  }, 30000);

  test("keeps the four-filter tower as one large-chamfered solid body", () => {
    const kit = createTempestPrintableKit(
      {
        ...defaultTempestSettings,
        arrangement: {
          type: "four-side-filter-tower",
          filter: defaultTempestTowerFilter,
        },
      },
      "unsplit",
    );
    const part = kit.parts[0];

    expect(kit.parts).toHaveLength(1);
    expect(part).toMatchObject({
      width: 619,
      depth: 619,
      height: 510,
    });
    expect(meshCoordinateValues(part.mesh, "x")).toEqual(
      expect.arrayContaining([openScadTowerCornerPostChamfer, part.width - openScadTowerCornerPostChamfer]),
    );
    expect(meshCoordinateValues(part.mesh, "y")).toEqual(
      expect.arrayContaining([openScadTowerCornerPostChamfer, part.depth - openScadTowerCornerPostChamfer]),
    );
    const chamferFaceSpans = towerCornerChamferFaceSpans(part.mesh, part.width, part.depth);
    expect(rectangularCornerVertexNames(part.mesh, part.width, part.depth)).toEqual([]);
    expect(chamferFaceSpans).toEqual([
      { corner: "front-left", triangleCount: expect.any(Number), minZ: 0, maxZ: part.height },
      { corner: "front-right", triangleCount: expect.any(Number), minZ: 0, maxZ: part.height },
      { corner: "back-left", triangleCount: expect.any(Number), minZ: 0, maxZ: part.height },
      { corner: "back-right", triangleCount: expect.any(Number), minZ: 0, maxZ: part.height },
    ]);
    expect(chamferFaceSpans.every((span) => span.triangleCount >= 2)).toBe(true);
  }, 15000);

  test("exports generated Tempest chunks through the existing 3MF package path", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "bed-256");
    const exported = createPrintableThreeMfExportFromKit(kit, "Tempest print kit", "tempest-print-kit.3mf");

    expect(exported.filename).toBe("tempest-print-kit.3mf");
    expect(exported.mimeType).toBe("model/3mf");
    expect(exported.sheetPlan.sheets.length).toBeGreaterThan(0);
    expect(exported.bytes.length).toBeGreaterThan(1000);
  });

  test("turns the fan opening mode into different CSG geometry", () => {
    const plainKit = createTempestPrintableKit(
      {
        ...defaultTempestSettings,
        fan: {
          ...defaultTempestSettings.fan,
          opening: { type: "plain" },
        },
      },
      "unsplit",
    );
    const honeycombKit = createTempestPrintableKit(defaultTempestSettings, "unsplit");

    expect(totalTriangleCount(honeycombKit)).toBeGreaterThan(totalTriangleCount(plainKit));
  });

  test("routes Tempest print designs through the app-level generated kit exporter", () => {
    const layout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const kit = createPrintDesignKit(layout, "bed-256");
    const exported = createPrintDesignThreeMfExport(layout, "bed-256");

    expect(layout.configuration.design.type).toBe("tempest");
    expect(kit.parts).toHaveLength(8);
    expect(kit.parts.every((part) => part.kind === "tempest-print-chunk")).toBe(true);
    expect(exported.filename).toBe("nukit-tempest-print-kit.3mf");
    expect(exported.bytes.length).toBeGreaterThan(1000);
  }, 15000);
});

function totalTriangleCount(kit: ReturnType<typeof createTempestPrintableKit>): number {
  return kit.parts.reduce((total, part) => total + part.mesh.triangles.length, 0);
}

function meshSignature(mesh: TempestPrintableMesh): {
  readonly bounds: ReturnType<typeof meshBounds>;
  readonly vertexCount: number;
  readonly triangleCount: number;
} {
  return {
    bounds: meshBounds(mesh),
    vertexCount: mesh.vertices.length,
    triangleCount: mesh.triangles.length,
  };
}

function meshBounds(mesh: ReturnType<typeof createTempestPrintableKit>["parts"][number]["mesh"]): {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
} {
  const xValues = mesh.vertices.map((vertex) => round(vertex.x));
  const yValues = mesh.vertices.map((vertex) => round(vertex.y));
  const zValues = mesh.vertices.map((vertex) => round(vertex.z));
  return {
    minX: Math.min(...xValues),
    minY: Math.min(...yValues),
    minZ: Math.min(...zValues),
    maxX: Math.max(...xValues),
    maxY: Math.max(...yValues),
    maxZ: Math.max(...zValues),
  };
}

function meshFitsDeclaredBounds(part: ReturnType<typeof createTempestPrintableKit>["parts"][number]): boolean {
  const bounds = meshBounds(part.mesh);
  return (
    bounds.minX >= 0 &&
    bounds.minY >= 0 &&
    bounds.minZ >= 0 &&
    bounds.maxX <= part.width &&
    bounds.maxY <= part.depth &&
    bounds.maxZ <= part.height
  );
}

type TempestPrintableMesh = ReturnType<typeof createTempestPrintableKit>["parts"][number]["mesh"];

type TowerCornerName = "front-left" | "front-right" | "back-left" | "back-right";

type TowerCornerChamferFaceSpan = {
  readonly corner: TowerCornerName;
  readonly triangleCount: number;
  readonly minZ: number;
  readonly maxZ: number;
};

function rectangularCornerVertexNames(mesh: TempestPrintableMesh, width: number, depth: number): readonly TowerCornerName[] {
  return towerRectangleCorners(width, depth)
    .filter((corner) =>
      mesh.vertices.some((vertex) => closeTo(vertex.x, corner.x) && closeTo(vertex.y, corner.y)),
    )
    .map((corner) => corner.name);
}

function towerCornerChamferFaceSpans(mesh: TempestPrintableMesh, width: number, depth: number): readonly TowerCornerChamferFaceSpan[] {
  return towerCornerChamferPlanes(width, depth).map((plane) => {
    const zValues: number[] = [];
    let triangleCount = 0;
    for (const triangle of mesh.triangles) {
      const vertices = [mesh.vertices[triangle.v1], mesh.vertices[triangle.v2], mesh.vertices[triangle.v3]];
      if (vertices.every((vertex) => plane.contains(vertex))) {
        triangleCount += 1;
        zValues.push(...vertices.map((vertex) => round(vertex.z)));
      }
    }

    return {
      corner: plane.corner,
      triangleCount,
      minZ: zValues.length === 0 ? Number.NaN : Math.min(...zValues),
      maxZ: zValues.length === 0 ? Number.NaN : Math.max(...zValues),
    };
  });
}

function towerRectangleCorners(
  width: number,
  depth: number,
): readonly { readonly name: TowerCornerName; readonly x: number; readonly y: number }[] {
  return [
    { name: "front-left", x: 0, y: 0 },
    { name: "front-right", x: width, y: 0 },
    { name: "back-left", x: 0, y: depth },
    { name: "back-right", x: width, y: depth },
  ];
}

function towerCornerChamferPlanes(
  width: number,
  depth: number,
): readonly { readonly corner: TowerCornerName; readonly contains: (vertex: { readonly x: number; readonly y: number }) => boolean }[] {
  return [
    {
      corner: "front-left",
      contains: (vertex) => closeTo(vertex.x + vertex.y, openScadTowerCornerPostChamfer) && vertex.x <= openScadTowerCornerPostChamfer && vertex.y <= openScadTowerCornerPostChamfer,
    },
    {
      corner: "front-right",
      contains: (vertex) =>
        closeTo(width - vertex.x + vertex.y, openScadTowerCornerPostChamfer) &&
        vertex.x >= width - openScadTowerCornerPostChamfer &&
        vertex.y <= openScadTowerCornerPostChamfer,
    },
    {
      corner: "back-left",
      contains: (vertex) =>
        closeTo(vertex.x + depth - vertex.y, openScadTowerCornerPostChamfer) &&
        vertex.x <= openScadTowerCornerPostChamfer &&
        vertex.y >= depth - openScadTowerCornerPostChamfer,
    },
    {
      corner: "back-right",
      contains: (vertex) =>
        closeTo(width - vertex.x + depth - vertex.y, openScadTowerCornerPostChamfer) &&
        vertex.x >= width - openScadTowerCornerPostChamfer &&
        vertex.y >= depth - openScadTowerCornerPostChamfer,
    },
  ];
}

function meshCoordinateValues(
  mesh: ReturnType<typeof createTempestPrintableKit>["parts"][number]["mesh"],
  axis: "x" | "y" | "z",
): readonly number[] {
  return [...new Set(mesh.vertices.map((vertex) => round(vertex[axis])))].sort((a, b) => a - b);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function closeTo(actual: number, expected: number): boolean {
  return Math.abs(round(actual) - round(expected)) <= 0.001;
}
