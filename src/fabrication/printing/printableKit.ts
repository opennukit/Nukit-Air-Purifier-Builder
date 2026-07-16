import { orientChunkVerticesForPrinting } from "@/fabrication/printing/partOrientation";
import { inspectMeshFragility } from "@/fabrication/printing/meshWelding";
import { createBinaryStl } from "@/fabrication/printing/stl";
import {
  createStoredZipPackage,
  createThreeMfPackage,
  meshVolumeMm3,
  type MeshObject,
  type MeshPlate,
  type MeshTriangle,
  type MeshVertex,
  type StoredZipFile,
} from "@/fabrication/printing/threeMf";

// #######################################
// Print Volume Model
// #######################################

// "hand-svg" is the hand-cut (foamcore) mode: the same cut-sheet output family as
// the laser, so it routes through the cut-sheet preview, but the panels are built
// plain (taped, no finger joints / flanges) and the box depth follows the
// fan + filter rule. Its cut style lives in the design settings (cutStyle).
export const exportFormats = ["print-3mf", "laser-svg", "hand-svg"] as const;

export type ExportFormat = (typeof exportFormats)[number];

// The cut-sheet export formats (everything that is not 3D printing).
export function isCutSheetExportFormat(format: ExportFormat): boolean {
  return format === "laser-svg" || format === "hand-svg";
}

// ##############################
// Print Volume Identifiers
// ##############################

export const printVolumePresetIds = [
  "bed-180",
  "bed-220",
  "bed-225",
  "bed-prusa-mk",
  "bed-250-220-270",
  "bed-256",
  "bed-300",
  "bed-300-300-330",
  "bed-h2-safe",
  "bed-350",
  "bed-prusa-xl",
  "bed-420",
  "unsplit",
] as const;

export type PrintVolumePresetId = (typeof printVolumePresetIds)[number];

export const defaultPrintVolumePresetId: PrintVolumePresetId = "bed-256";

// ##############################
// Print Beds
// ##############################

export type PrintVolumePreset = {
  readonly id: PrintVolumePresetId;
  readonly label: string;
  readonly bed: PrintBed;
};

export type PrintBed =
  | {
      readonly type: "bounded";
      readonly width: number;
      readonly depth: number;
      readonly height: number;
    }
  | {
      readonly type: "unbounded";
    };

// ##############################
// Printable Parts
// ##############################

export type PrintablePartKind =
  | "donut-filter-adapter"
  | "donut-fan-guard"
  | "donut-filter-cap"
  | "tempest-print-chunk";

type PrintablePartBase<Mesh> = {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly mesh: Mesh;
};

// A part's identity, dimensions, and placement are independent of how its mesh
// is represented; the worker protocol reuses this shape with meshes packed
// into transferable typed arrays.
export type PrintablePartWithMesh<Mesh> =
  | (PrintablePartBase<Mesh> & {
      readonly kind: "tempest-print-chunk";
      readonly sourcePlacement: TempestChunkPlacement;
    })
  | (PrintablePartBase<Mesh> & {
      readonly kind: Exclude<PrintablePartKind, "tempest-print-chunk">;
      readonly sourcePlacement?: never;
    });

export type PrintablePart = PrintablePartWithMesh<PrintableMesh>;

// Where a tempest chunk's local origin (the chunk grid cell's origin; the mesh is cell-relative and may start inside it) sits inside the
// posed assembly, in millimeters. Plain data so kits survive the worker's
// structured clone; the assembled preview uses it to reassemble the chunks and
// open the seams in exploded view.
export type TempestChunkPlacement = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type PrintableMesh = {
  readonly vertices: readonly MeshVertex[];
  readonly triangles: readonly MeshTriangle[];
};

// ##############################
// Kit Summary and Export
// ##############################

export type PrintableKitSummary = {
  readonly partCount: number;
  readonly oversizedPartCount: number;
  // The kit's true solid material volume, summed over every part's mesh. The
  // parts list turns this into an approximate filament-weight estimate.
  readonly materialVolumeMm3: number;
  // Names of parts the fragility validator flagged as likely too delicate to print
  // or handle cleanly (a wafer-thin panel or a tiny nub); an advisory, not a
  // blocker. Empty for a clean kit. See `flagFragileParts`.
  readonly fragilePartNames: readonly string[];
};

export type PrintableKit = {
  readonly preset: PrintVolumePreset;
  readonly parts: readonly PrintablePart[];
  readonly summary: PrintableKitSummary;
};

// The kit's true solid material volume: each part's signed mesh volume taken as
// a magnitude (winding may vary per part) and summed. Every design's kit
// builder feeds the same number into its summary.
export function kitMaterialVolumeMm3(parts: readonly PrintablePart[]): number {
  return parts.reduce((sum, part) => sum + Math.abs(meshVolumeMm3(part.mesh)), 0);
}

// A part is at or above a full material thickness on every axis of every body when
// it is sound; below this on a body's thinnest axis it is a wafer that warps or
// snaps, and a body small on ALL axes is a loose nub. These catch a genuinely
// delicate part while leaving normal wall panels (a wall's own thickness, ~4-5 mm)
// and every larger part unflagged. The flake drop already removes fully detached
// shavings, so this is the residual "is anything that shipped still too delicate"
// guard, surfaced to the user as an advisory rather than silently exported.
const FRAGILE_MIN_THICKNESS_MM = 2.5;
const FRAGILE_NUB_MAX_DIM_MM = 8;

// Names of the parts the fragility validator flags. Attached wafer-thin spikes on
// an otherwise solid body cannot be told apart from a legitimate thin wall by
// bounding box alone, so this deliberately does NOT try to; it flags whole bodies
// that are themselves too thin or too tiny, which is reliable and low-noise.
export function flagFragileParts(parts: readonly PrintablePart[]): string[] {
  const flagged: string[] = [];
  for (const part of parts) {
    const { thinnestBodyMm, smallestBodyMaxDimMm } = inspectMeshFragility(part.mesh);
    if (thinnestBodyMm < FRAGILE_MIN_THICKNESS_MM || smallestBodyMaxDimMm < FRAGILE_NUB_MAX_DIM_MM) {
      flagged.push(part.name);
    }
  }
  return flagged;
}

export type PrintableThreeMfExport = {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly kit: PrintableKit;
  readonly sheetPlan: PrintableSheetPlan;
};

// One printable part rendered to its own standalone single-object 3MF, named
// for the file it becomes inside the kit ZIP.
export type PrintablePartThreeMf = {
  readonly part: PrintablePart;
  readonly filename: string;
  readonly bytes: Uint8Array;
};

// A kit delivered as one 3MF per part, bundled into a single ZIP. Every slicer
// reliably loads a single-object 3MF, so splitting the kit this way avoids
// slicers that ignore Bambu/Orca plate metadata and stack every chunk on one
// bed.
export type PrintablePartStl = {
  readonly part: PrintablePart;
  readonly filename: string;
  readonly bytes: Uint8Array;
};

export type PrintableStlZip = {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly kit: PrintableKit;
  readonly entries: readonly PrintablePartStl[];
};

export type PrintableThreeMfZip = {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly kit: PrintableKit;
  readonly entries: readonly PrintablePartThreeMf[];
};

// ##############################
// Print Sheet Planning
// ##############################

export type PrintBedFitAxis = "width" | "depth" | "height";

export type OversizedPrintBedAxis = {
  readonly axis: PrintBedFitAxis;
  readonly required: number;
  readonly available: number;
};

export type PrintBedFit =
  | {
      readonly type: "fits";
    }
  | {
      readonly type: "oversized";
      readonly oversizedAxes: readonly [OversizedPrintBedAxis, ...OversizedPrintBedAxis[]];
    };

export type PrintableFootprint = {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
};

export type PrintSheetPlacement = {
  readonly part: PrintablePart;
  readonly x: number;
  readonly y: number;
  readonly fit: PrintBedFit;
};

export type PrintSheet = {
  readonly index: number;
  readonly width: number;
  readonly depth: number;
  readonly placements: readonly PrintSheetPlacement[];
};

export type PrintableSheetPlan = {
  readonly kit: PrintableKit;
  readonly sheets: readonly PrintSheet[];
};

// ##############################
// Sheet Planning Internals
// ##############################

type MutablePrintSheet = Omit<PrintSheet, "placements"> & {
  readonly placements: PrintSheetPlacement[];
};

// ##############################
// Constants
// ##############################

const sheetGap = 8;
const unboundedPreviewWidth = 1000;

// #######################################
// Print Volume Presets
// #######################################

export const printVolumePresets: readonly PrintVolumePreset[] = [
  {
    id: "bed-180",
    label: "180 x 180 x 180 mm",
    bed: { type: "bounded", width: 180, depth: 180, height: 180 },
  },
  {
    id: "bed-220",
    label: "220 x 220 x 240 mm",
    bed: { type: "bounded", width: 220, depth: 220, height: 240 },
  },
  {
    id: "bed-225",
    label: "225 x 225 x 265 mm",
    bed: { type: "bounded", width: 225, depth: 225, height: 265 },
  },
  {
    id: "bed-prusa-mk",
    label: "250 x 210 x 220 mm",
    bed: { type: "bounded", width: 250, depth: 210, height: 220 },
  },
  {
    id: "bed-250-220-270",
    label: "250 x 220 x 270 mm",
    bed: { type: "bounded", width: 250, depth: 220, height: 270 },
  },
  {
    id: "bed-256",
    label: "256 x 256 x 256 mm",
    bed: { type: "bounded", width: 256, depth: 256, height: 256 },
  },
  {
    id: "bed-300",
    label: "300 x 300 x 300 mm",
    bed: { type: "bounded", width: 300, depth: 300, height: 300 },
  },
  {
    id: "bed-300-300-330",
    label: "300 x 300 x 330 mm",
    bed: { type: "bounded", width: 300, depth: 300, height: 330 },
  },
  {
    id: "bed-h2-safe",
    label: "320 x 320 x 325 mm",
    bed: { type: "bounded", width: 320, depth: 320, height: 325 },
  },
  {
    id: "bed-350",
    label: "350 x 350 x 345 mm",
    bed: { type: "bounded", width: 350, depth: 350, height: 345 },
  },
  {
    id: "bed-prusa-xl",
    label: "360 x 360 x 360 mm",
    bed: { type: "bounded", width: 360, depth: 360, height: 360 },
  },
  {
    id: "bed-420",
    label: "420 x 420 x 480 mm",
    bed: { type: "bounded", width: 420, depth: 420, height: 480 },
  },
  {
    id: "unsplit",
    label: "Cut myself / unsplit",
    bed: { type: "unbounded" },
  },
];

export function findPrintVolumePreset(id: string | null): PrintVolumePreset {
  const normalizedId = id === "bed-320" ? "bed-h2-safe" : id;
  return (
    printVolumePresets.find((preset) => preset.id === normalizedId) ??
    requiredPrintVolumePreset(defaultPrintVolumePresetId)
  );
}

function requiredPrintVolumePreset(id: PrintVolumePresetId): PrintVolumePreset {
  const preset = printVolumePresets.find((entry) => entry.id === id);
  if (preset === undefined) {
    throw new Error(`requiredPrintVolumePreset: Missing preset ${id}`);
  }
  return preset;
}

export function readExportFormat(value: string | null): ExportFormat {
  if (value === "print-3mf" || value === "hand-svg") {
    return value;
  }
  return "laser-svg";
}

// #######################################
// Public Export API
// #######################################

export function createPrintableThreeMfExportFromKit(
  kit: PrintableKit,
  title: string,
  filename: string,
  displayColor?: string,
): PrintableThreeMfExport {
  const sheetPlan = createPrintableSheetPlanFromKit(kit);

  return {
    filename,
    mimeType: "model/3mf",
    bytes: createThreeMfPackage(
      title,
      createThreeMfObjectsFromSheetPlan(sheetPlan),
      createThreeMfPlatesFromSheetPlan(sheetPlan),
      displayColor,
    ),
    kit,
    sheetPlan,
  };
}

// Build one standalone 3MF per part, each a single object centered on the bed,
// and bundle them into a single (stored, uncompressed) ZIP. `baseName` is the
// kit slug used for entry filenames; the returned `filename` is `${baseName}.zip`.
export function createPrintableThreeMfZipFromKit(
  kit: PrintableKit,
  title: string,
  baseName: string,
  displayColor?: string,
): PrintableThreeMfZip {
  const usedNames = new Set<string>();
  const entries: PrintablePartThreeMf[] = kit.parts.map((part, index) => {
    const filename = uniquePartFileName(usedNames, baseName, part, index);
    return {
      part,
      filename,
      bytes: createPrintablePartThreeMf(part, `${title} – ${part.name}`, kit.preset.bed, displayColor),
    };
  });

  const zipFiles: StoredZipFile[] = entries.map((entry) => ({ name: entry.filename, content: entry.bytes }));

  return {
    filename: `${baseName}.zip`,
    mimeType: "application/zip",
    bytes: createStoredZipPackage(zipFiles),
    kit,
    entries,
  };
}

// The STL counterpart of the per-chunk ZIP: one binary STL per print chunk,
// each auto-oriented for printing and seated at the origin, bundled into a
// stored ZIP. STL carries no plate/units metadata, so slicers auto-place each
// part (STL is conventionally millimetres, matching the kit).
export function createPrintableStlZipFromKit(kit: PrintableKit, baseName: string): PrintableStlZip {
  const usedNames = new Set<string>();
  const entries: PrintablePartStl[] = kit.parts.map((part, index) => {
    const oriented = orientPrintablePart(part, kit.preset.bed);
    return {
      part,
      filename: uniquePartFileName(usedNames, baseName, part, index, "stl"),
      bytes: createBinaryStl(oriented.mesh.vertices, oriented.mesh.triangles),
    };
  });

  const zipFiles: StoredZipFile[] = entries.map((entry) => ({ name: entry.filename, content: entry.bytes }));

  return {
    filename: `${baseName}.zip`,
    mimeType: "application/zip",
    bytes: createStoredZipPackage(zipFiles),
    kit,
    entries,
  };
}

// A single part as its own 3MF: one object, no plate metadata (every slicer
// auto-places a lone object), translated so its footprint sits centered on the
// bed with its base on z=0.
export function createPrintablePartThreeMf(
  part: PrintablePart,
  title: string,
  bed: PrintBed,
  displayColor?: string,
): Uint8Array {
  const oriented = orientPrintablePart(part, bed);
  const bounds = meshBounds(oriented.mesh.vertices);
  const object: MeshObject = {
    name: oriented.name,
    vertices: oriented.mesh.vertices,
    triangles: oriented.mesh.triangles,
    position: bedCenteredPosition(bounds, bed),
  };
  return createThreeMfPackage(title, [object], [], displayColor);
}

// ##############################
// Part Auto-Orientation
// ##############################

// Rotate a chunk into its lowest-support print orientation and re-seat its mesh
// at the origin, so the same orientation drives the print-plate preview, the
// per-chunk ZIP, and the legacy multi-plate 3MF. Parts that are not Tempest
// chunks (e.g. the donut adaptor) are already authored print-ready and pass
// through untouched. The kit itself is never mutated — only the export and
// preview paths call this — so the assembled-box view keeps its assembly pose.
export function orientPrintablePart(part: PrintablePart, bed?: PrintBed): PrintablePart {
  if (part.kind !== "tempest-print-chunk") {
    return part;
  }

  const bedDimensions = bed !== undefined && bed.type !== "unbounded" ? { width: bed.width, depth: bed.depth, height: bed.height } : undefined;
  const rotated = orientChunkVerticesForPrinting(part.mesh.vertices, part.mesh.triangles, bedDimensions);
  const bounds = meshBounds(rotated);
  // Re-seat the rotated mesh's min corner at the origin: sheet packing and the
  // preview both place a part by its (0,0,0) corner, and bed-centering expects
  // it too.
  const vertices = rotated.map((vertex) => ({
    x: vertex.x - bounds.minX,
    y: vertex.y - bounds.minY,
    z: vertex.z - bounds.minZ,
  }));

  return {
    ...part,
    mesh: { vertices, triangles: part.mesh.triangles },
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxY - bounds.minY,
    height: bounds.maxZ - bounds.minZ,
  };
}

// ##############################
// Per-Part Placement
// ##############################

type MeshBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

function meshBounds(vertices: readonly MeshVertex[]): MeshBounds {
  if (vertices.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxY = Math.max(maxY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

// Translation that drops the part onto z=0 and centers its footprint on the
// bed. An unbounded bed has no center, so the part's near corner goes to the
// origin instead.
function bedCenteredPosition(bounds: MeshBounds, bed: PrintBed): MeshVertex {
  if (bed.type === "unbounded") {
    return { x: -bounds.minX, y: -bounds.minY, z: -bounds.minZ };
  }
  return {
    x: (bed.width - (bounds.maxX - bounds.minX)) / 2 - bounds.minX,
    y: (bed.depth - (bounds.maxY - bounds.minY)) / 2 - bounds.minY,
    z: -bounds.minZ,
  };
}

// ##############################
// Per-Part Filenames
// ##############################

function uniquePartFileName(used: Set<string>, baseName: string, part: PrintablePart, index: number, extension = "3mf"): string {
  const ordinal = String(index + 1).padStart(2, "0");
  const slug = fileNameSlug(part.name);
  let candidate = `${baseName}-${ordinal}-${slug}.${extension}`;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${baseName}-${ordinal}-${slug}-${suffix}.${extension}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function fileNameSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug.length > 0 ? slug : "part";
}

// #######################################
// Sheet Planning and 3MF Objects
// #######################################

export function createPrintableSheetPlanFromKit(kit: PrintableKit): PrintableSheetPlan {
  // Pack the print-ready (auto-oriented) parts so the plate preview and the
  // legacy multi-plate 3MF show each chunk in the same orientation as the
  // per-chunk ZIP download. `kit` keeps the original parts for the assembled view.
  const orientedParts = kit.parts.map((part) => orientPrintablePart(part, kit.preset.bed));
  return {
    kit,
    sheets: arrangePrintSheets(orientedParts, kit.preset.bed),
  };
}

// ##############################
// 3MF Object Conversion
// ##############################

function createThreeMfObjectsFromSheetPlan(sheetPlan: PrintableSheetPlan): MeshObject[] {
  return sheetPlan.sheets.flatMap(createThreeMfObjectsFromSheet);
}

function createThreeMfObjectsFromSheet(sheet: PrintSheet): MeshObject[] {
  return sheet.placements.map((placement) => ({
    name: placement.part.name,
    vertices: placement.part.mesh.vertices,
    triangles: placement.part.mesh.triangles,
    position: { x: placement.x, y: placement.y, z: 0 },
  }));
}

function createThreeMfPlatesFromSheetPlan(sheetPlan: PrintableSheetPlan): MeshPlate[] {
  let objectIndex = 0;
  return sheetPlan.sheets.map((sheet) => {
    const objectIndices = sheet.placements.map(() => {
      const index = objectIndex;
      objectIndex += 1;
      return index;
    });
    return {
      name: `Print plate ${sheet.index}`,
      objectIndices,
    };
  });
}

// ##############################
// Shelf Packing
// ##############################

function arrangePrintSheets(parts: readonly PrintablePart[], bed: PrintBed): PrintSheet[] {
  const sheets: MutablePrintSheet[] = [emptyPrintSheet(1, previewSheetWidth(parts, bed), previewSheetDepth(parts, bed))];
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;

  for (const part of parts) {
    let sheet = requiredLastSheet(sheets);
    const fit = printBedFitForPart(part, bed);

    if (cursorX > 0 && cursorX + part.width > sheet.width) {
      cursorX = 0;
      cursorY += rowDepth + sheetGap;
      rowDepth = 0;
    }

    if (bed.type === "bounded" && cursorY > 0 && cursorY + part.depth > sheet.depth) {
      sheet = emptyPrintSheet(sheets.length + 1, previewSheetWidth(parts, bed), previewSheetDepth(parts, bed));
      sheets.push(sheet);
      cursorX = 0;
      cursorY = 0;
      rowDepth = 0;
    }

    sheet.placements.push({
      part,
      x: cursorX,
      y: cursorY,
      fit,
    });
    cursorX += part.width + sheetGap;
    rowDepth = Math.max(rowDepth, part.depth);
  }

  return sheets.filter((sheet) => sheet.placements.length > 0);
}

function emptyPrintSheet(index: number, width: number, depth: number): MutablePrintSheet {
  return {
    index,
    width,
    depth,
    placements: [],
  };
}

function previewSheetWidth(parts: readonly PrintablePart[], bed: PrintBed): number {
  if (bed.type === "bounded") {
    return bed.width;
  }
  const widestPart = Math.max(...parts.map((part) => part.width), 1);
  return Math.max(unboundedPreviewWidth, widestPart);
}

function previewSheetDepth(parts: readonly PrintablePart[], bed: PrintBed): number {
  if (bed.type === "bounded") {
    return bed.depth;
  }
  return Math.max(
    parts.reduce((total, part) => total + part.depth + sheetGap, 0),
    320,
  );
}

function requiredLastSheet(sheets: readonly MutablePrintSheet[]): MutablePrintSheet {
  const sheet = sheets[sheets.length - 1];
  if (sheet === undefined) {
    throw new Error("requiredLastSheet: Missing print sheet");
  }
  return sheet;
}

// ##############################
// Fit Helpers
// ##############################

export function partFitsPrintBed(part: PrintablePart, bed: PrintBed): boolean {
  return printBedFitForPart(part, bed).type === "fits";
}

export function printBedFitForPart(part: PrintablePart, bed: PrintBed): PrintBedFit {
  return printBedFitForDimensions(part, bed);
}

export function printBedFitForDimensions(dimensions: PrintableFootprint, bed: PrintBed): PrintBedFit {
  if (bed.type === "unbounded") {
    return { type: "fits" };
  }

  const oversizedAxes: OversizedPrintBedAxis[] = [];
  appendOversizedAxis(oversizedAxes, "width", dimensions.width, bed.width);
  appendOversizedAxis(oversizedAxes, "depth", dimensions.depth, bed.depth);
  appendOversizedAxis(oversizedAxes, "height", dimensions.height, bed.height);

  const [firstAxis, ...remainingAxes] = oversizedAxes;
  if (firstAxis === undefined) {
    return { type: "fits" };
  }
  return {
    type: "oversized",
    oversizedAxes: [firstAxis, ...remainingAxes],
  };
}

function appendOversizedAxis(
  axes: OversizedPrintBedAxis[],
  axis: PrintBedFitAxis,
  required: number,
  available: number,
): void {
  if (required > available + 0.001) {
    axes.push({
      axis,
      required,
      available,
    });
  }
}
