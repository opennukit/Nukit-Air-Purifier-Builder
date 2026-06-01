import { describe, expect, test } from "bun:test";
import {
  defaultTempestSettings,
  defaultTempestTowerFilter,
} from "@/domain/designs/tempest/model";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/airPurifier";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
import { createPrintDesignKit, createPrintDesignThreeMfExport } from "@/fabrication/printing/printDesignKit";
import { createPrintableThreeMfExportFromKit } from "@/fabrication/printing/printableKit";

describe("Tempest CSG printable kit", () => {
  test("generates bed-sized CSG chunks for the default two-filter housing", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "bed-256");

    expect(kit.parts).toHaveLength(8);
    expect(kit.summary).toMatchObject({
      partCount: 8,
      splitPanelCount: 1,
      oversizedPartCount: 0,
      sourceCutFeatureCount: 31,
      retainedCutFeatureCount: 31,
    });
    expect(kit.parts.every((part) => part.kind === "tempest-print-chunk")).toBe(true);
    expect(kit.parts.every((part) => part.width <= 256 && part.depth <= 256 && part.height <= 256)).toBe(true);
    expect(kit.parts.every((part) => part.mesh.vertices.length > 0 && part.mesh.triangles.length > 0)).toBe(true);
    expect(kit.parts.every((part) => meshFitsDeclaredBounds(part))).toBe(true);
    expect(kit.parts.map((part) => [part.width, part.depth, part.height])).toEqual(
      Array.from({ length: 8 }, () => [252.5, 131, 252.5]),
    );
  });

  test("orients the default two-filter housing upright for preview and 3MF export", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    const part = kit.parts[0];

    expect(kit.parts).toHaveLength(1);
    expect(part).toMatchObject({
      width: 505,
      depth: 262,
      height: 505,
    });
    expect(meshBounds(part.mesh)).toEqual({
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 505,
      maxY: 262,
      maxZ: 505,
    });
  });

  test("keeps the OpenSCAD-style horizontal housing corner chamfers", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    const part = kit.parts[0];

    expect(meshCoordinateValues(part.mesh, "x")).toEqual(expect.arrayContaining([2, 503]));
    expect(meshCoordinateValues(part.mesh, "z")).toEqual(expect.arrayContaining([2, 503]));
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
    expect(kit.parts.every((part) => part.width === 205 && part.depth === 205 && part.height === 255)).toBe(true);
    expect(kit.parts.every((part) => part.mesh.vertices.length > 0 && part.mesh.triangles.length > 0)).toBe(true);
    expect(kit.parts.every((part) => meshFitsDeclaredBounds(part))).toBe(true);
  });

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
  });
});

function totalTriangleCount(kit: ReturnType<typeof createTempestPrintableKit>): number {
  return kit.parts.reduce((total, part) => total + part.mesh.triangles.length, 0);
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

function meshCoordinateValues(
  mesh: ReturnType<typeof createTempestPrintableKit>["parts"][number]["mesh"],
  axis: "x" | "y" | "z",
): readonly number[] {
  return [...new Set(mesh.vertices.map((vertex) => round(vertex[axis])))].sort((a, b) => a - b);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
