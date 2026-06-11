import { createThreeMfPackage, type MeshObject, type MeshPlate, type MeshTriangle, type MeshVertex } from "@/fabrication/printing/threeMf";

// #######################################
// Print Volume Model
// #######################################

export const exportFormats = ["print-3mf", "laser-svg"] as const;

export type ExportFormat = (typeof exportFormats)[number];

// ##############################
// Print Volume Identifiers
// ##############################

export const printVolumePresetIds = [
  "bed-180",
  "bed-220",
  "bed-225",
  "bed-prusa-mk",
  "bed-256",
  "bed-300",
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
  readonly description: string;
  readonly examples: readonly string[];
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

type PrintablePartBase = {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly mesh: PrintableMesh;
};

export type PrintablePart =
  | (PrintablePartBase & {
      readonly kind: "tempest-print-chunk";
      readonly sourcePlacement: TempestChunkPlacement;
    })
  | (PrintablePartBase & {
      readonly kind: Exclude<PrintablePartKind, "tempest-print-chunk">;
      readonly sourcePlacement?: never;
    });

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
  readonly splitPanelCount: number;
  readonly oversizedPartCount: number;
};

export type PrintableKit = {
  readonly preset: PrintVolumePreset;
  readonly parts: readonly PrintablePart[];
  readonly summary: PrintableKitSummary;
};

export type PrintableThreeMfExport = {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly kit: PrintableKit;
  readonly sheetPlan: PrintableSheetPlan;
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
    description: "Aggressive splitting for mini printers.",
    examples: ["Bambu Lab A1 mini", "Original Prusa MINI+"],
    bed: { type: "bounded", width: 180, depth: 180, height: 180 },
  },
  {
    id: "bed-220",
    label: "220 x 220 x 240 mm",
    description: "Safe Ender-class bed with the shorter KE Z height.",
    examples: ["Creality Ender-3 V3 KE", "Sovol SV06"],
    bed: { type: "bounded", width: 220, depth: 220, height: 240 },
  },
  {
    id: "bed-225",
    label: "225 x 225 x 265 mm",
    description: "Slightly larger square bed used by common Elegoo printers.",
    examples: ["Elegoo Neptune 4 Pro"],
    bed: { type: "bounded", width: 225, depth: 225, height: 265 },
  },
  {
    id: "bed-prusa-mk",
    label: "250 x 210 x 220 mm",
    description: "Prusa MK bed where Y is the limiting axis.",
    examples: ["Original Prusa MK4S"],
    bed: { type: "bounded", width: 250, depth: 210, height: 220 },
  },
  {
    id: "bed-256",
    label: "256 x 256 x 256 mm",
    description: "Default Bambu A/P/X-series bed.",
    examples: ["Bambu Lab A1", "P1S", "X1 Carbon"],
    bed: { type: "bounded", width: 256, depth: 256, height: 256 },
  },
  {
    id: "bed-300",
    label: "300 x 300 x 300 mm",
    description: "Large desktop bed with fewer seams.",
    examples: ["Creality K1 Max"],
    bed: { type: "bounded", width: 300, depth: 300, height: 300 },
  },
  {
    id: "bed-h2-safe",
    label: "320 x 320 x 325 mm",
    description: "Conservative H2-family single-nozzle preset.",
    examples: ["Bambu Lab H2D", "H2S"],
    bed: { type: "bounded", width: 320, depth: 320, height: 325 },
  },
  {
    id: "bed-350",
    label: "350 x 350 x 345 mm",
    description: "Large enclosed-printer bed.",
    examples: ["Creality K2 Plus", "Sovol SV08"],
    bed: { type: "bounded", width: 350, depth: 350, height: 345 },
  },
  {
    id: "bed-prusa-xl",
    label: "360 x 360 x 360 mm",
    description: "Prusa XL bed for large fewer-piece kits.",
    examples: ["Original Prusa XL"],
    bed: { type: "bounded", width: 360, depth: 360, height: 360 },
  },
  {
    id: "bed-420",
    label: "420 x 420 x 480 mm",
    description: "Large-format bed for maximum-size parts.",
    examples: ["Elegoo Neptune 4 Max", "Anycubic Kobra 3 Max"],
    bed: { type: "bounded", width: 420, depth: 420, height: 480 },
  },
  {
    id: "unsplit",
    label: "Cut myself / unsplit",
    description: "Exports the generated model without splitting it for a bed.",
    examples: ["Custom cutting"],
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
  return value === "print-3mf" ? "print-3mf" : "laser-svg";
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

// #######################################
// Sheet Planning and 3MF Objects
// #######################################

export function createPrintableSheetPlanFromKit(kit: PrintableKit): PrintableSheetPlan {
  return {
    kit,
    sheets: arrangePrintSheets(kit.parts, kit.preset.bed),
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
