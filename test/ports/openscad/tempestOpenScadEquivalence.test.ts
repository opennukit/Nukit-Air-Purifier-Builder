import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createTempestModel,
  defaultTempestSettings,
  defaultTempestTowerFilter,
  type TempestFanCountRequest,
  type TempestSettings,
  type TempestWall,
  type TempestWallMap,
} from "@/domain/designs/tempest/model";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
import type { PrintableMesh } from "@/fabrication/printing/printableKit";

// #######################################
// OpenSCAD Oracle Contract
// #######################################

// ##############################
// Test Cases
// ##############################

type OpenScadDefine = {
  readonly name: string;
  readonly value: string | number | boolean;
};

type OpenScadTempestCase = {
  readonly name: string;
  readonly settings: TempestSettings;
};

type Size3 = {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
};

type Bounds3 = {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
};

type MeshMetrics = {
  readonly bounds: Bounds3;
  readonly vertexCount: number;
  readonly triangleCount: number;
};

type OpenScadTempestEcho = {
  readonly filterOuter: Size3;
  readonly boxOuter: Size3;
  readonly bed: Size3;
  readonly chunkGrid: {
    readonly countX: number;
    readonly countY: number;
    readonly countZ: number;
    readonly totalCount: number;
  };
  readonly chunkSize: Size3;
  readonly fanCornerMinimum: number;
  readonly fanBodyDepth: number;
  readonly maxFans: {
    readonly frontBack: number;
    readonly leftRight: number;
  };
  readonly fanPositions: TempestWallMap<readonly number[]>;
};

const openScadReferencePath = "references/tempest-openscad-reference/Nukit Tempest Air Purifier Builder.scad";
const openScadBinary = resolveOpenScadBinary();

if (openScadBinary === null && process.env.REQUIRE_OPENSCAD === "1") {
  throw new Error("tempestOpenScadEquivalence: openscad CLI not found. Set OPENSCAD_BIN=/path/to/OpenSCAD.");
}

const openScadTest = openScadBinary === null ? test.skip : test;

const defaultTwoFilterCase: OpenScadTempestCase = {
  name: "default two-filter housing",
  settings: defaultTempestSettings,
};

const fourFilterTowerCase: OpenScadTempestCase = {
  name: "four-filter tower",
  settings: {
    ...defaultTempestSettings,
    arrangement: {
      type: "four-side-filter-tower",
      filter: defaultTempestTowerFilter,
    },
  },
};

// #######################################
// Equivalence Tests
// #######################################

describe("Tempest OpenSCAD oracle equivalence", () => {
  openScadTest("matches OpenSCAD derived dimensions and fan placement for the default two-filter housing", () => {
    const model = createTempestModel(defaultTwoFilterCase.settings);
    const oracle = renderOpenScadTempestEcho(defaultTwoFilterCase);
    const arrangement = defaultTwoFilterCase.settings.arrangement;
    if (arrangement.type === "four-side-filter-tower") {
      throw new Error("Expected horizontal arrangement");
    }

    expectSizeClose(oracle.filterOuter, {
      width: arrangement.filter.footprintWidth,
      depth: arrangement.filter.footprintDepth,
      height: arrangement.filter.thickness,
    });
    expectSizeClose(oracle.boxOuter, model.box);
    expectSizeClose(oracle.bed, model.settings.printBed);
    expect(oracle.chunkGrid).toEqual({
      countX: model.chunkGrid.countX,
      countY: model.chunkGrid.countY,
      countZ: model.chunkGrid.countZ,
      totalCount: model.chunkGrid.totalCount,
    });
    expectSizeClose(oracle.chunkSize, {
      width: model.chunkGrid.chunkWidth,
      depth: model.chunkGrid.chunkDepth,
      height: model.chunkGrid.chunkHeight,
    });

    if (model.fanLayout.type !== "horizontal-wall-fans") {
      throw new Error("Expected horizontal fan layout");
    }
    expect(oracle.fanCornerMinimum).toBeCloseTo(model.fanLayout.cornerSafeMinimum);
    expect(oracle.fanBodyDepth).toBeCloseTo(model.fanLayout.bodyDepth);
    expect(oracle.maxFans).toEqual({
      frontBack: model.fanLayout.walls.front.maximumCount,
      leftRight: model.fanLayout.walls.left.maximumCount,
    });
    expectNumberArrayClose(oracle.fanPositions.front, model.fanLayout.walls.front.positionsAlongWall);
    expectNumberArrayClose(oracle.fanPositions.back, model.fanLayout.walls.back.positionsAlongWall);
    expectNumberArrayClose(oracle.fanPositions.left, model.fanLayout.walls.left.positionsAlongWall);
    expectNumberArrayClose(oracle.fanPositions.right, model.fanLayout.walls.right.positionsAlongWall);
  });

  openScadTest("matches OpenSCAD derived dimensions for the four-filter tower", () => {
    const model = createTempestModel(fourFilterTowerCase.settings);
    const oracle = renderOpenScadTempestEcho(fourFilterTowerCase);

    if (fourFilterTowerCase.settings.arrangement.type !== "four-side-filter-tower") {
      throw new Error("Expected tower arrangement");
    }
    expectSizeClose(oracle.filterOuter, {
      width: fourFilterTowerCase.settings.arrangement.filter.faceWidth,
      depth: fourFilterTowerCase.settings.arrangement.filter.faceHeight,
      height: fourFilterTowerCase.settings.arrangement.filter.thickness,
    });
    expectSizeClose(oracle.boxOuter, model.box);
    expectSizeClose(oracle.bed, model.settings.printBed);
    expect(oracle.chunkGrid).toEqual({
      countX: model.chunkGrid.countX,
      countY: model.chunkGrid.countY,
      countZ: model.chunkGrid.countZ,
      totalCount: model.chunkGrid.totalCount,
    });
    expectSizeClose(oracle.chunkSize, {
      width: model.chunkGrid.chunkWidth,
      depth: model.chunkGrid.chunkDepth,
      height: model.chunkGrid.chunkHeight,
    });

    if (model.fanLayout.type !== "tower-top-grid") {
      throw new Error("Expected tower fan grid");
    }
    expect(oracle.fanBodyDepth).toBeCloseTo(model.fanLayout.bodyDepth);
  });

  for (const testCase of [defaultTwoFilterCase, fourFilterTowerCase]) {
    openScadTest(`keeps the printable mesh inside the same outside envelope as OpenSCAD for ${testCase.name}`, () => {
      const oracleMesh = renderOpenScadTempestMesh(testCase);
      const localKit = createTempestPrintableKit(testCase.settings, "unsplit");
      const localPart = localKit.parts[0];
      if (localPart === undefined || localKit.parts.length !== 1) {
        throw new Error("Expected unsplit Tempest kit to produce one printable part");
      }

      expect(oracleMesh.vertexCount).toBeGreaterThan(0);
      expect(oracleMesh.triangleCount).toBeGreaterThan(0);
      expectNumberArrayClose(
        sortedSize(boundsSize(oracleMesh.bounds)),
        sortedSize(boundsSize(printableMeshMetrics(localPart.mesh).bounds)),
        0.01,
      );
    });
  }
});

// #######################################
// OpenSCAD Rendering
// #######################################

function renderOpenScadTempestEcho(testCase: OpenScadTempestCase): OpenScadTempestEcho {
  const outputDir = mkdtempSync(join(tmpdir(), "tempest-openscad-"));
  const outputPath = join(outputDir, "tempest.echo");
  try {
    runOpenScad([
      "--backend=Manifold",
      ...openScadDefinitionArgs(testCase.settings),
      "-o",
      outputPath,
      openScadReferencePath,
    ]);
    return parseOpenScadTempestEcho(readFileSync(outputPath, "utf8"));
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

function renderOpenScadTempestMesh(testCase: OpenScadTempestCase): MeshMetrics {
  const outputDir = mkdtempSync(join(tmpdir(), "tempest-openscad-"));
  const outputPath = join(outputDir, "tempest.stl");
  try {
    runOpenScad([
      "--backend=Manifold",
      "--export-format",
      "asciistl",
      ...openScadDefinitionArgs(testCase.settings),
      "-D",
      "$fn=16",
      "-o",
      outputPath,
      openScadReferencePath,
    ]);
    return asciiStlMetrics(readFileSync(outputPath, "utf8"));
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

function runOpenScad(args: readonly string[]): void {
  if (openScadBinary === null) {
    throw new Error("runOpenScad: openscad CLI not found");
  }

  const result = spawnSync(openScadBinary, [...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`runOpenScad: OpenSCAD exited with ${result.status}\n${result.stderr}${result.stdout}`);
  }
}

function resolveOpenScadBinary(): string | null {
  const configured = process.env.OPENSCAD_BIN;
  if (configured !== undefined && configured.trim() !== "") {
    return configured;
  }
  const pathEntries = (process.env.PATH ?? "").split(":").filter((entry) => entry.trim() !== "");
  for (const entry of pathEntries) {
    const candidate = join(entry, "openscad");
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const macApplicationBinary = "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD";
  return existsSync(macApplicationBinary) ? macApplicationBinary : null;
}

// #######################################
// OpenSCAD Boundary Mapping
// #######################################

function openScadDefinitionArgs(settings: TempestSettings): string[] {
  return openScadDefinitionsForSettings(settings).flatMap((entry) => ["-D", `${entry.name}=${formatOpenScadValue(entry.value)}`]);
}

function openScadDefinitionsForSettings(settings: TempestSettings): readonly OpenScadDefine[] {
  return [
    ...openScadFilterDefinitions(settings),
    { name: "Fan_diameter", value: settings.fan.diameter },
    { name: "Screw_holes", value: settings.fan.screwHoleDiameter },
    { name: "Fans_top", value: openScadFanCount(settings.fan.wallRequests.front) },
    { name: "Fans_bottom", value: openScadFanCount(settings.fan.wallRequests.back) },
    { name: "Fans_left", value: openScadFanCount(settings.fan.wallRequests.left) },
    { name: "Fans_right", value: openScadFanCount(settings.fan.wallRequests.right) },
    { name: "Hex_grill", value: settings.fan.opening.type === "honeycomb" },
    ...(settings.fan.opening.type === "honeycomb"
      ? [
          { name: "Hex_size", value: settings.fan.opening.hexFlatToFlat },
          { name: "Hex_spacing", value: settings.fan.opening.ribThickness },
        ]
      : []),
    { name: "Rim", value: settings.frame.rim },
    { name: "Wall_thickness", value: settings.frame.wallThickness },
    { name: "Outside_flange_thickness", value: settings.frame.outsideFlangeThickness },
    { name: "Slot_wall", value: openScadSlotWall(settings.filterSlot.wall) },
    { name: "Slot_clearance", value: settings.filterSlot.clearance },
    { name: "Slot_end_margin", value: settings.filterSlot.endMargin },
    { name: "Bed_x", value: settings.printBed.width },
    { name: "Bed_y", value: settings.printBed.depth },
    { name: "Bed_z", value: settings.printBed.height },
    { name: "Render_part", value: settings.renderTarget.type },
    ...(settings.renderTarget.type === "chunk"
      ? [
          { name: "Chunk_ix", value: settings.renderTarget.chunkIndex.x },
          { name: "Chunk_iy", value: settings.renderTarget.chunkIndex.y },
          { name: "Chunk_iz", value: settings.renderTarget.chunkIndex.z },
          { name: "Chunk_to_origin", value: settings.renderTarget.moveToOrigin },
        ]
      : []),
    ...(settings.cordPassThrough.type === "wall"
      ? [
          { name: "Cord_hole_diameter", value: settings.cordPassThrough.diameter },
          { name: "Cord_hole_wall", value: settings.cordPassThrough.wall },
          { name: "Cord_hole_side", value: settings.cordPassThrough.side },
          { name: "Cord_hole_corner_offset", value: settings.cordPassThrough.cornerOffset },
        ]
      : [{ name: "Cord_hole_wall", value: "none" }]),
  ];
}

function openScadFilterDefinitions(settings: TempestSettings): readonly OpenScadDefine[] {
  const arrangement = settings.arrangement;
  if (arrangement.type === "four-side-filter-tower") {
    return [
      { name: "Filters", value: 4 },
      { name: "X", value: arrangement.filter.faceWidth },
      { name: "Y", value: arrangement.filter.faceHeight },
      { name: "Filter_height", value: arrangement.filter.thickness },
    ];
  }
  return [
    { name: "Filters", value: arrangement.type === "single-horizontal-top-filter" ? 1 : 2 },
    { name: "X", value: arrangement.filter.footprintWidth },
    { name: "Y", value: arrangement.filter.footprintDepth },
    { name: "Filter_height", value: arrangement.filter.thickness },
  ];
}

function openScadFanCount(request: TempestFanCountRequest): number {
  return request.type === "automatic" ? -1 : request.count;
}

function openScadSlotWall(wall: TempestWall): string {
  if (wall === "front") {
    return "top";
  }
  if (wall === "back") {
    return "bottom";
  }
  return wall;
}

function formatOpenScadValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return typeof value === "boolean" ? String(value) : String(value);
}

// #######################################
// Oracle Parsing
// #######################################

function parseOpenScadTempestEcho(echo: string): OpenScadTempestEcho {
  const lines = echo.split(/\r?\n/);
  const filterOuter = sizeFromLine(requiredLine(lines, "FILTER outer"));
  const boxOuter = sizeFromLine(requiredLine(lines, "BOX outer"));
  const bed = sizeFromLine(requiredLine(lines, "Bed:"));
  const chunkGridNumbers = numbersFromLine(requiredLine(lines, "Chunk grid"));
  const fanCornerNumbers = numbersFromLine(requiredLine(lines, "Fan corner min"));
  const maxFanNumbers = numbersFromLine(requiredLine(lines, "Max fans / wall"));

  return {
    filterOuter,
    boxOuter,
    bed,
    chunkGrid: {
      countX: requiredNumberAt(chunkGridNumbers, 0, "chunk count x"),
      countY: requiredNumberAt(chunkGridNumbers, 1, "chunk count y"),
      countZ: requiredNumberAt(chunkGridNumbers, 2, "chunk count z"),
      totalCount: requiredNumberAt(chunkGridNumbers, 3, "chunk total"),
    },
    chunkSize: sizeFromLine(requiredLine(lines, "Chunk size")),
    fanCornerMinimum: requiredNumberAt(fanCornerNumbers, 0, "fan corner minimum"),
    fanBodyDepth: requiredNumberAt(fanCornerNumbers, 2, "fan body depth"),
    maxFans: {
      frontBack: requiredNumberAt(maxFanNumbers, 0, "front/back max fans"),
      leftRight: requiredNumberAt(maxFanNumbers, 1, "left/right max fans"),
    },
    fanPositions: fanPositionsFromLine(requiredLine(lines, "Fan positions")),
  };
}

function requiredLine(lines: readonly string[], label: string): string {
  const line = lines.find((entry) => entry.includes(label));
  if (line === undefined) {
    throw new Error(`requiredLine: Missing OpenSCAD echo line containing ${label}`);
  }
  return line;
}

function sizeFromLine(line: string): Size3 {
  const numbers = numbersFromLine(line);
  return {
    width: requiredNumberAt(numbers, 0, "width"),
    depth: requiredNumberAt(numbers, 1, "depth"),
    height: requiredNumberAt(numbers, 2, "height"),
  };
}

function fanPositionsFromLine(line: string): TempestWallMap<readonly number[]> {
  const vectors = Array.from(line.matchAll(/\[([^\]]*)\]/g), (match) => numberArrayFromVector(match[1] ?? ""));
  const [front, back, left, right] = vectors;
  if (front === undefined || back === undefined || left === undefined || right === undefined) {
    throw new Error("fanPositionsFromLine: Expected front, back, left, and right fan vectors");
  }
  return { front, back, left, right };
}

function numberArrayFromVector(value: string): readonly number[] {
  if (value.trim() === "") {
    return [];
  }
  return value.split(",").map((entry) => Number(entry.trim()));
}

function numbersFromLine(line: string): readonly number[] {
  return Array.from(line.matchAll(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi), (match) => Number(match[0]));
}

function requiredNumberAt(numbers: readonly number[], index: number, label: string): number {
  const value = numbers[index];
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`requiredNumberAt: Missing finite ${label}`);
  }
  return value;
}

// #######################################
// Mesh Metrics
// #######################################

function asciiStlMetrics(stl: string): MeshMetrics {
  const vertices: Array<{ readonly x: number; readonly y: number; readonly z: number }> = [];
  for (const match of stl.matchAll(/vertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/gi)) {
    vertices.push({
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    });
  }
  if (vertices.length === 0) {
    throw new Error("asciiStlMetrics: No STL vertices found");
  }
  return {
    bounds: boundsForVertices(vertices),
    vertexCount: vertices.length,
    triangleCount: vertices.length / 3,
  };
}

function printableMeshMetrics(mesh: PrintableMesh): MeshMetrics {
  return {
    bounds: boundsForVertices(mesh.vertices),
    vertexCount: mesh.vertices.length,
    triangleCount: mesh.triangles.length,
  };
}

function boundsForVertices(vertices: readonly { readonly x: number; readonly y: number; readonly z: number }[]): Bounds3 {
  return {
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    minY: Math.min(...vertices.map((vertex) => vertex.y)),
    minZ: Math.min(...vertices.map((vertex) => vertex.z)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    maxY: Math.max(...vertices.map((vertex) => vertex.y)),
    maxZ: Math.max(...vertices.map((vertex) => vertex.z)),
  };
}

function boundsSize(bounds: Bounds3): Size3 {
  return {
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxY - bounds.minY,
    height: bounds.maxZ - bounds.minZ,
  };
}

function sortedSize(size: Size3): readonly number[] {
  return [size.width, size.depth, size.height].sort((left, right) => left - right);
}

// #######################################
// Assertions
// #######################################

function expectSizeClose(actual: Size3, expected: Size3, tolerance = 0.001): void {
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.depth - expected.depth)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance);
}

function expectNumberArrayClose(actual: readonly number[], expected: readonly number[], tolerance = 0.001): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    const expectedValue = expected[index];
    if (expectedValue === undefined) {
      throw new Error("expectNumberArrayClose: Expected array length check to catch missing entries");
    }
    expect(Math.abs(value - expectedValue)).toBeLessThanOrEqual(tolerance);
  });
}
