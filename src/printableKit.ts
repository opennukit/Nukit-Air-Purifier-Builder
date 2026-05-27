import { BufferAttribute, ExtrudeGeometry, Path, Shape } from "three";
import type { LayoutResult } from "./airPurifier";
import type { CutFeature, CutPanel, CutPoint, RectCut } from "./cutGeometry";
import { createThreeMfPackage, type MeshObject, type MeshPlate, type MeshTriangle, type MeshVertex } from "./threeMf";

export const exportFormats = ["print-3mf", "laser-svg"] as const;

export type ExportFormat = (typeof exportFormats)[number];

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

export type PrintablePartKind = "panel-tile" | "dovetail-glue-key";

export type PrintablePart = {
  readonly id: string;
  readonly name: string;
  readonly kind: PrintablePartKind;
  readonly sourcePanelId?: string;
  readonly sourceTile?: PrintableTileSource;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly cutFeatureCount: number;
  readonly printCriticalCutFeatureCount: number;
  readonly mesh: PrintableMesh;
};

export type PrintableTileSource = {
  readonly panelId: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly columnIndex: number;
  readonly rowIndex: number;
  readonly columnCount: number;
  readonly rowCount: number;
};

export type PrintableMesh = {
  readonly vertices: readonly MeshVertex[];
  readonly triangles: readonly MeshTriangle[];
};

export type PrintableKitSummary = {
  readonly partCount: number;
  readonly panelTileCount: number;
  readonly glueKeyCount: number;
  readonly splitPanelCount: number;
  readonly oversizedPartCount: number;
  readonly sourceCutFeatureCount: number;
  readonly retainedCutFeatureCount: number;
  readonly sourcePrintCriticalCutFeatureCount: number;
  readonly retainedPrintCriticalCutFeatureCount: number;
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

export type PrintSheetPlacement = {
  readonly part: PrintablePart;
  readonly x: number;
  readonly y: number;
  readonly fits: boolean;
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

type PanelCut = {
  readonly cut: CutFeature;
  readonly bounds: Bounds2;
};

type PanelTile = {
  readonly panel: CutPanel;
  readonly id: string;
  readonly name: string;
  readonly outline: readonly CutPoint[];
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly columnIndex: number;
  readonly rowIndex: number;
  readonly columnCount: number;
  readonly rowCount: number;
  readonly cuts: readonly CutFeature[];
};

type Bounds2 = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
};

type SplitAxisResult = {
  readonly cuts: readonly number[];
};

type MutablePrintSheet = Omit<PrintSheet, "placements"> & {
  readonly placements: PrintSheetPlacement[];
};

const sheetGap = 8;
const splitSearchStep = 0.5;
const minimumTileSize = 42;
const cutSplitClearance = 4;
const glueKeyWidth = 36;
const glueKeyDepth = 18;
const glueKeyHeight = 3;
const glueKeySpacing = 95;
const unboundedPreviewWidth = 1000;

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
    description: "Exports each generated panel as one printable part.",
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

export function createPrintableKit(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableKit {
  const preset = findPrintVolumePreset(presetId);
  const parts = layout.cutPanels.flatMap((panel) =>
    createPrintablePartsForPanel(panel, layout.configuration.cutting.materialThickness, preset),
  );
  const sourceCutFeatureCount = layout.cutPanels.reduce((total, panel) => total + panel.cuts.length, 0);
  const sourcePrintCriticalCutFeatureCount = layout.cutPanels.reduce(
    (total, panel) => total + panel.cuts.filter(isPrintCriticalCut).length,
    0,
  );
  const summary = summarizePrintableKit(parts, preset, sourceCutFeatureCount, sourcePrintCriticalCutFeatureCount);

  return {
    preset,
    parts,
    summary,
  };
}

export function createPrintableThreeMfExport(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableThreeMfExport {
  const kit = createPrintableKit(layout, presetId);
  return createPrintableThreeMfExportFromKit(
    kit,
    "Nukit Open Air Purifier print kit",
    "nukit-open-air-purifier-print-kit.3mf",
  );
}

export function createPrintableThreeMfExportFromKit(
  kit: PrintableKit,
  title: string,
  filename: string,
): PrintableThreeMfExport {
  const sheetPlan = createPrintableSheetPlanFromKit(kit);

  return {
    filename,
    mimeType: "model/3mf",
    bytes: createThreeMfPackage(
      title,
      createThreeMfObjectsFromSheetPlan(sheetPlan),
      createThreeMfPlatesFromSheetPlan(sheetPlan),
    ),
    kit,
    sheetPlan,
  };
}

export function createPrintableSheetPlan(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableSheetPlan {
  const kit = createPrintableKit(layout, presetId);
  return createPrintableSheetPlanFromKit(kit);
}

export function createPrintableSheetPlanFromKit(kit: PrintableKit): PrintableSheetPlan {
  return {
    kit,
    sheets: arrangePrintSheets(kit.parts, kit.preset.bed),
  };
}

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

function arrangePrintSheets(parts: readonly PrintablePart[], bed: PrintBed): PrintSheet[] {
  const sheets: MutablePrintSheet[] = [emptyPrintSheet(1, previewSheetWidth(parts, bed), previewSheetDepth(parts, bed))];
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;

  for (const part of parts) {
    let sheet = requiredLastSheet(sheets);
    const partFits = partFitsPrintBed(part, bed);

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
      fits: partFits,
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

function createPrintablePartsForPanel(panel: CutPanel, materialThickness: number, preset: PrintVolumePreset): PrintablePart[] {
  const panelCuts = panel.cuts.map((cut) => toPanelCut(cut, panel));
  const tiles = splitPanelIntoTiles(panel, panelCuts, preset);
  const panelTileParts = tiles.map((tile) => createPanelTilePart(tile, materialThickness));
  const glueKeys = createGlueKeyParts(panel, tiles);
  return [...panelTileParts, ...glueKeys];
}

function splitPanelIntoTiles(panel: CutPanel, cuts: readonly PanelCut[], preset: PrintVolumePreset): PanelTile[] {
  const printCriticalCuts = cuts.filter((cut) => isPrintCriticalCut(cut.cut));
  const panelOutline = panelOutlineInNominalCoordinates(panel);
  const outlineBounds = pointsBounds(panelOutline);
  const outlineOverhangWidth = Math.max(0, outlineBounds.maxX - outlineBounds.minX - panel.nominalWidth);
  const outlineOverhangDepth = Math.max(0, outlineBounds.maxY - outlineBounds.minY - panel.nominalHeight);
  const xAxis = splitAxis(
    panel.nominalWidth,
    maxPrintableWidth(preset) - outlineOverhangWidth,
    printCriticalCuts.map((cut) => xBlockedRange(cut.bounds)),
  );
  const yAxis = splitAxis(
    panel.nominalHeight,
    maxPrintableDepth(preset) - outlineOverhangDepth,
    printCriticalCuts.map((cut) => yBlockedRange(cut.bounds)),
  );
  const xCuts = [0, ...xAxis.cuts, panel.nominalWidth];
  const yCuts = [0, ...yAxis.cuts, panel.nominalHeight];
  const tiles: PanelTile[] = [];

  for (let rowIndex = 0; rowIndex < yCuts.length - 1; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < xCuts.length - 1; columnIndex += 1) {
      const x0 = requiredArrayValue(xCuts, columnIndex, "splitPanelIntoTiles x0");
      const x1 = requiredArrayValue(xCuts, columnIndex + 1, "splitPanelIntoTiles x1");
      const y0 = requiredArrayValue(yCuts, rowIndex, "splitPanelIntoTiles y0");
      const y1 = requiredArrayValue(yCuts, rowIndex + 1, "splitPanelIntoTiles y1");
      const clipBounds = {
        minX: columnIndex === 0 ? outlineBounds.minX : x0,
        maxX: columnIndex === xCuts.length - 2 ? outlineBounds.maxX : x1,
        minY: rowIndex === 0 ? outlineBounds.minY : y0,
        maxY: rowIndex === yCuts.length - 2 ? outlineBounds.maxY : y1,
      };
      const clippedOutline = clipPolygonToBounds(panelOutline, clipBounds);
      const tileBounds = pointsBounds(clippedOutline);
      tiles.push({
        panel,
        id: tileId(panel.id, columnIndex, rowIndex, xCuts.length - 1, yCuts.length - 1),
        name: tileName(panel.name, columnIndex, rowIndex, xCuts.length - 1, yCuts.length - 1),
        outline: translatePoints(clippedOutline, -tileBounds.minX, -tileBounds.minY),
        x0,
        x1,
        y0,
        y1,
        columnIndex,
        rowIndex,
        columnCount: xCuts.length - 1,
        rowCount: yCuts.length - 1,
        cuts: cuts
          .filter((panelCut) =>
            boundsInsideTile(panelCut.bounds, clipBounds.minX, clipBounds.maxX, clipBounds.minY, clipBounds.maxY),
          )
          .map((panelCut) => translateCutToTile(panelCut.cut, tileBounds.minX, tileBounds.minY)),
      });
    }
  }

  return tiles;
}

function splitAxis(length: number, maxLength: number, blockedRanges: readonly Bounds1[]): SplitAxisResult {
  if (!Number.isFinite(maxLength) || length <= maxLength) {
    return { cuts: [] };
  }

  const cuts: number[] = [];
  let cursor = 0;

  while (length - cursor > maxLength) {
    const maximumCut = cursor + maxLength;
    const minimumCut = Math.min(cursor + minimumTileSize, length);
    const split = findSafeSplit(maximumCut, minimumCut, maximumCut, blockedRanges);
    cuts.push(split);
    cursor = split;
  }

  return { cuts };
}

type Bounds1 = {
  readonly min: number;
  readonly max: number;
};

function findSafeSplit(target: number, minimum: number, maximum: number, blockedRanges: readonly Bounds1[]): number {
  for (let candidate = target; candidate >= minimum; candidate -= splitSearchStep) {
    if (!blockedRanges.some((range) => candidate > range.min && candidate < range.max)) {
      return roundMillimeters(candidate);
    }
  }
  return roundMillimeters(maximum);
}

function createPanelTilePart(tile: PanelTile, materialThickness: number): PrintablePart {
  const bounds = pointsBounds(tile.outline);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxY - bounds.minY;
  return {
    id: tile.id,
    name: tile.name,
    kind: "panel-tile",
    sourcePanelId: tile.panel.id,
    sourceTile: {
      panelId: tile.panel.id,
      x0: tile.x0,
      x1: tile.x1,
      y0: tile.y0,
      y1: tile.y1,
      columnIndex: tile.columnIndex,
      rowIndex: tile.rowIndex,
      columnCount: tile.columnCount,
      rowCount: tile.rowCount,
    },
    width,
    depth,
    height: materialThickness,
    cutFeatureCount: tile.cuts.length,
    printCriticalCutFeatureCount: tile.cuts.filter(isPrintCriticalCut).length,
    mesh: createPlateMesh(tile.outline, materialThickness, tile.cuts),
  };
}

function createGlueKeyParts(panel: CutPanel, tiles: readonly PanelTile[]): PrintablePart[] {
  const splitColumnCount = Math.max(0, ...tiles.map((tile) => tile.columnCount - 1));
  const splitRowCount = Math.max(0, ...tiles.map((tile) => tile.rowCount - 1));
  if (splitColumnCount === 0 && splitRowCount === 0) {
    return [];
  }

  const parts: PrintablePart[] = [];
  for (let index = 0; index < splitColumnCount; index += 1) {
    const keyCount = glueKeyCountForLength(panel.nominalHeight);
    for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
      parts.push(createGlueKeyPart(panel, "vertical", index, keyIndex));
    }
  }
  for (let index = 0; index < splitRowCount; index += 1) {
    const keyCount = glueKeyCountForLength(panel.nominalWidth);
    for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
      parts.push(createGlueKeyPart(panel, "horizontal", index, keyIndex));
    }
  }
  return parts;
}

function createGlueKeyPart(panel: CutPanel, seam: "vertical" | "horizontal", seamIndex: number, keyIndex: number): PrintablePart {
  const width = seam === "vertical" ? glueKeyWidth : glueKeyDepth;
  const depth = seam === "vertical" ? glueKeyDepth : glueKeyWidth;
  return {
    id: `${panel.id}-${seam}-glue-key-${seamIndex + 1}-${keyIndex + 1}`,
    name: `${panel.name} ${seam} dovetail glue key ${seamIndex + 1}.${keyIndex + 1}`,
    kind: "dovetail-glue-key",
    sourcePanelId: panel.id,
    width,
    depth,
    height: glueKeyHeight,
    cutFeatureCount: 0,
    printCriticalCutFeatureCount: 0,
    mesh: createDovetailGlueKeyMesh(width, depth, glueKeyHeight),
  };
}

function glueKeyCountForLength(length: number): number {
  return Math.max(1, Math.ceil(length / glueKeySpacing));
}

function createPlateMesh(outline: readonly CutPoint[], height: number, cuts: readonly CutFeature[]): PrintableMesh {
  const shape = new Shape();
  const firstPoint = outline[0];
  if (firstPoint === undefined) {
    throw new Error("createPlateMesh: Outline is empty");
  }
  shape.moveTo(firstPoint.x, firstPoint.y);
  for (const point of outline.slice(1)) {
    shape.lineTo(point.x, point.y);
  }
  shape.closePath();

  for (const cut of cuts) {
    const hole = cutToHolePath(cut);
    if (hole !== null) {
      shape.holes.push(hole);
    }
  }

  return extrudeShape(shape, height);
}

function createDovetailGlueKeyMesh(width: number, depth: number, height: number): PrintableMesh {
  const waistInset = Math.min(width, depth) * 0.22;
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.lineTo(width - waistInset, depth / 2);
  shape.lineTo(width, depth);
  shape.lineTo(0, depth);
  shape.lineTo(waistInset, depth / 2);
  shape.closePath();
  return extrudeShape(shape, height);
}

function extrudeShape(shape: Shape, height: number): PrintableMesh {
  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 24,
    steps: 1,
  });
  const mesh = geometryToPrintableMesh(geometry);
  geometry.dispose();
  return mesh;
}

function geometryToPrintableMesh(geometry: ExtrudeGeometry): PrintableMesh {
  const position = geometry.getAttribute("position");
  if (!(position instanceof BufferAttribute)) {
    throw new Error("geometryToPrintableMesh: Missing position buffer");
  }

  const vertices: MeshVertex[] = Array.from({ length: position.count }, (_, index) => ({
    x: roundMillimeters(position.getX(index)),
    y: roundMillimeters(position.getY(index)),
    z: roundMillimeters(position.getZ(index)),
  }));

  const triangles: MeshTriangle[] = [];
  const index = geometry.index;
  if (index !== null) {
    for (let cursor = 0; cursor < index.count; cursor += 3) {
      triangles.push({
        v1: index.getX(cursor),
        v2: index.getX(cursor + 1),
        v3: index.getX(cursor + 2),
      });
    }
  } else {
    for (let cursor = 0; cursor < vertices.length; cursor += 3) {
      triangles.push({ v1: cursor, v2: cursor + 1, v3: cursor + 2 });
    }
  }

  return { vertices, triangles };
}

function cutToHolePath(cut: CutFeature): Path | null {
  if (cut.type === "circle") {
    const path = new Path();
    path.absellipse(cut.cx, cut.cy, cut.radius, cut.radius, 0, Math.PI * 2, true);
    return path;
  }
  return rectCutToHolePath(cut);
}

function rectCutToHolePath(cut: RectCut): Path | null {
  if (cut.width <= 0 || cut.height <= 0) {
    return null;
  }
  const path = new Path();
  const radius = Math.min(cut.radius, cut.width / 2, cut.height / 2);
  if (radius <= 0) {
    path.moveTo(cut.x, cut.y);
    path.lineTo(cut.x, cut.y + cut.height);
    path.lineTo(cut.x + cut.width, cut.y + cut.height);
    path.lineTo(cut.x + cut.width, cut.y);
    path.closePath();
    return path;
  }

  path.moveTo(cut.x + radius, cut.y);
  path.lineTo(cut.x + cut.width - radius, cut.y);
  path.quadraticCurveTo(cut.x + cut.width, cut.y, cut.x + cut.width, cut.y + radius);
  path.lineTo(cut.x + cut.width, cut.y + cut.height - radius);
  path.quadraticCurveTo(cut.x + cut.width, cut.y + cut.height, cut.x + cut.width - radius, cut.y + cut.height);
  path.lineTo(cut.x + radius, cut.y + cut.height);
  path.quadraticCurveTo(cut.x, cut.y + cut.height, cut.x, cut.y + cut.height - radius);
  path.lineTo(cut.x, cut.y + radius);
  path.quadraticCurveTo(cut.x, cut.y, cut.x + radius, cut.y);
  path.closePath();
  return path;
}

function toPanelCut(cut: CutFeature, panel: CutPanel): PanelCut {
  const translated = translateCut(cut, panel.nominalWidth / 2 - panel.assemblyCenter.x, panel.nominalHeight / 2 - panel.assemblyCenter.y);
  return {
    cut: translated,
    bounds: cutBounds(translated),
  };
}

function panelOutlineInNominalCoordinates(panel: CutPanel): CutPoint[] {
  return translatePoints(
    panel.outline,
    panel.nominalWidth / 2 - panel.assemblyCenter.x,
    panel.nominalHeight / 2 - panel.assemblyCenter.y,
  );
}

function translatePoints(points: readonly CutPoint[], offsetX: number, offsetY: number): CutPoint[] {
  return points.map((point) => ({
    x: roundMillimeters(point.x + offsetX),
    y: roundMillimeters(point.y + offsetY),
  }));
}

function translateCut(cut: CutFeature, offsetX: number, offsetY: number): CutFeature {
  if (cut.type === "circle") {
    return {
      ...cut,
      cx: cut.cx + offsetX,
      cy: cut.cy + offsetY,
    };
  }
  return {
    ...cut,
    x: cut.x + offsetX,
    y: cut.y + offsetY,
  };
}

function translateCutToTile(cut: CutFeature, x0: number, y0: number): CutFeature {
  return translateCut(cut, -x0, -y0);
}

function clipPolygonToBounds(points: readonly CutPoint[], bounds: Bounds2): CutPoint[] {
  return clipPolygonAgainstEdge(
    clipPolygonAgainstEdge(
      clipPolygonAgainstEdge(clipPolygonAgainstEdge(points, (point) => point.x >= bounds.minX, verticalIntersection(bounds.minX)), (point) => point.x <= bounds.maxX, verticalIntersection(bounds.maxX)),
      (point) => point.y >= bounds.minY,
      horizontalIntersection(bounds.minY),
    ),
    (point) => point.y <= bounds.maxY,
    horizontalIntersection(bounds.maxY),
  );
}

function clipPolygonAgainstEdge(
  points: readonly CutPoint[],
  isInside: (point: CutPoint) => boolean,
  intersectionAtBoundary: (from: CutPoint, to: CutPoint) => CutPoint,
): CutPoint[] {
  if (points.length === 0) {
    return [];
  }
  const clipped: CutPoint[] = [];
  let previous = points[points.length - 1]!;
  let previousInside = isInside(previous);

  for (const current of points) {
    const currentInside = isInside(current);
    if (currentInside && !previousInside) {
      clipped.push(intersectionAtBoundary(previous, current));
    }
    if (currentInside) {
      clipped.push(current);
    } else if (previousInside) {
      clipped.push(intersectionAtBoundary(previous, current));
    }
    previous = current;
    previousInside = currentInside;
  }

  return removeAdjacentDuplicatePoints(clipped);
}

function verticalIntersection(x: number): (from: CutPoint, to: CutPoint) => CutPoint {
  return (from, to) => {
    const t = (x - from.x) / (to.x - from.x || 1);
    return {
      x: roundMillimeters(x),
      y: roundMillimeters(from.y + (to.y - from.y) * t),
    };
  };
}

function horizontalIntersection(y: number): (from: CutPoint, to: CutPoint) => CutPoint {
  return (from, to) => {
    const t = (y - from.y) / (to.y - from.y || 1);
    return {
      x: roundMillimeters(from.x + (to.x - from.x) * t),
      y: roundMillimeters(y),
    };
  };
}

function removeAdjacentDuplicatePoints(points: readonly CutPoint[]): CutPoint[] {
  const unique: CutPoint[] = [];
  for (const point of points) {
    const previous = unique[unique.length - 1];
    if (previous === undefined || Math.abs(previous.x - point.x) > 0.001 || Math.abs(previous.y - point.y) > 0.001) {
      unique.push(point);
    }
  }
  const first = unique[0];
  const last = unique[unique.length - 1];
  if (
    first !== undefined &&
    last !== undefined &&
    unique.length > 1 &&
    Math.abs(first.x - last.x) <= 0.001 &&
    Math.abs(first.y - last.y) <= 0.001
  ) {
    unique.pop();
  }
  return unique;
}

function cutBounds(cut: CutFeature): Bounds2 {
  if (cut.type === "circle") {
    return {
      minX: cut.cx - cut.radius,
      maxX: cut.cx + cut.radius,
      minY: cut.cy - cut.radius,
      maxY: cut.cy + cut.radius,
    };
  }
  return {
    minX: cut.x,
    maxX: cut.x + cut.width,
    minY: cut.y,
    maxY: cut.y + cut.height,
  };
}

function pointsBounds(points: readonly CutPoint[]): Bounds2 {
  if (points.length === 0) {
    throw new Error("pointsBounds: Cannot calculate bounds for empty point set");
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function xBlockedRange(bounds: Bounds2): Bounds1 {
  return {
    min: bounds.minX - cutSplitClearance,
    max: bounds.maxX + cutSplitClearance,
  };
}

function yBlockedRange(bounds: Bounds2): Bounds1 {
  return {
    min: bounds.minY - cutSplitClearance,
    max: bounds.maxY + cutSplitClearance,
  };
}

function boundsInsideTile(bounds: Bounds2, x0: number, x1: number, y0: number, y1: number): boolean {
  const tolerance = 0.001;
  return (
    bounds.minX >= x0 - tolerance &&
    bounds.maxX <= x1 + tolerance &&
    bounds.minY >= y0 - tolerance &&
    bounds.maxY <= y1 + tolerance
  );
}

function summarizePrintableKit(
  parts: readonly PrintablePart[],
  preset: PrintVolumePreset,
  sourceCutFeatureCount: number,
  sourcePrintCriticalCutFeatureCount: number,
): PrintableKitSummary {
  const splitSourceIds = new Set<string>();
  for (const part of parts) {
    if (part.kind === "panel-tile" && part.id.includes("-tile-") && part.sourcePanelId !== undefined) {
      splitSourceIds.add(part.sourcePanelId);
    }
  }

  return {
    partCount: parts.length,
    panelTileCount: parts.filter((part) => part.kind === "panel-tile").length,
    glueKeyCount: parts.filter((part) => part.kind === "dovetail-glue-key").length,
    splitPanelCount: splitSourceIds.size,
    oversizedPartCount: parts.filter((part) => !partFitsPrintBed(part, preset.bed)).length,
    sourceCutFeatureCount,
    retainedCutFeatureCount: parts.reduce((total, part) => total + part.cutFeatureCount, 0),
    sourcePrintCriticalCutFeatureCount,
    retainedPrintCriticalCutFeatureCount: parts.reduce((total, part) => total + part.printCriticalCutFeatureCount, 0),
  };
}

function isPrintCriticalCut(cut: CutFeature): boolean {
  return cut.role !== "finger-hole";
}

export function partFitsPrintBed(part: PrintablePart, bed: PrintBed): boolean {
  if (bed.type === "unbounded") {
    return true;
  }
  return part.width <= bed.width + 0.001 && part.depth <= bed.depth + 0.001 && part.height <= bed.height + 0.001;
}

function maxPrintableWidth(preset: PrintVolumePreset): number {
  return preset.bed.type === "bounded" ? preset.bed.width : Number.POSITIVE_INFINITY;
}

function maxPrintableDepth(preset: PrintVolumePreset): number {
  return preset.bed.type === "bounded" ? preset.bed.depth : Number.POSITIVE_INFINITY;
}

function tileId(panelId: string, columnIndex: number, rowIndex: number, columnCount: number, rowCount: number): string {
  if (columnCount === 1 && rowCount === 1) {
    return `${panelId}-print`;
  }
  return `${panelId}-tile-${rowIndex + 1}-${columnIndex + 1}`;
}

function tileName(panelName: string, columnIndex: number, rowIndex: number, columnCount: number, rowCount: number): string {
  if (columnCount === 1 && rowCount === 1) {
    return `${panelName} print panel`;
  }
  return `${panelName} tile ${rowIndex + 1}.${columnIndex + 1}`;
}

function requiredArrayValue(values: readonly number[], index: number, context: string): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`${context}: Missing value at ${index}`);
  }
  return value;
}

function roundMillimeters(value: number): number {
  return Number(value.toFixed(4));
}
