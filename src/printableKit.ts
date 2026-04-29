import { BufferAttribute, ExtrudeGeometry, Path, Shape } from "three";
import type { LayoutResult } from "./airPurifier";
import type { CutFeature, CutPanel, RectCut } from "./cutGeometry";
import { createThreeMfPackage, type MeshObject, type MeshTriangle, type MeshVertex } from "./threeMf";

export const exportFormats = ["laser-svg", "print-3mf"] as const;

export type ExportFormat = (typeof exportFormats)[number];

export const printVolumePresetIds = ["bed-256", "bed-320", "unsplit"] as const;

export type PrintVolumePresetId = (typeof printVolumePresetIds)[number];

export type PrintVolumePreset = {
  readonly id: PrintVolumePresetId;
  readonly label: string;
  readonly description: string;
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
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly cutFeatureCount: number;
  readonly printCriticalCutFeatureCount: number;
  readonly mesh: PrintableMesh;
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
};

type PanelCut = {
  readonly cut: CutFeature;
  readonly bounds: Bounds2;
};

type PanelTile = {
  readonly panel: CutPanel;
  readonly id: string;
  readonly name: string;
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

type PackedPart = {
  readonly part: PrintablePart;
  readonly position: MeshVertex;
};

const printPartGap = 8;
const splitSearchStep = 0.5;
const minimumTileSize = 42;
const cutSplitClearance = 4;
const glueKeyWidth = 36;
const glueKeyDepth = 18;
const glueKeyHeight = 3;
const glueKeySpacing = 95;

export const printVolumePresets: readonly PrintVolumePreset[] = [
  {
    id: "bed-256",
    label: "256 x 256 mm printer",
    description: "Splits panels for common compact printers.",
    bed: { type: "bounded", width: 256, depth: 256, height: 256 },
  },
  {
    id: "bed-320",
    label: "320 x 320 mm printer",
    description: "Fewer splits for larger desktop printers.",
    bed: { type: "bounded", width: 320, depth: 320, height: 320 },
  },
  {
    id: "unsplit",
    label: "Cut myself / unsplit",
    description: "Exports each generated panel as one printable part.",
    bed: { type: "unbounded" },
  },
];

export function findPrintVolumePreset(id: string | null): PrintVolumePreset {
  return printVolumePresets.find((preset) => preset.id === id) ?? printVolumePresets[0];
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
  const packedParts = packPrintableParts(kit.parts, kit.preset.bed);
  const objects: MeshObject[] = packedParts.map(({ part, position }) => ({
    name: part.name,
    vertices: part.mesh.vertices,
    triangles: part.mesh.triangles,
    position,
  }));

  return {
    filename: "nukit-open-air-purifier-print-kit.3mf",
    mimeType: "model/3mf",
    bytes: createThreeMfPackage("Nukit Open Air Purifier print kit", objects),
    kit,
  };
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
  const xAxis = splitAxis(panel.nominalWidth, maxPrintableWidth(preset), printCriticalCuts.map((cut) => xBlockedRange(cut.bounds)));
  const yAxis = splitAxis(panel.nominalHeight, maxPrintableDepth(preset), printCriticalCuts.map((cut) => yBlockedRange(cut.bounds)));
  const xCuts = [0, ...xAxis.cuts, panel.nominalWidth];
  const yCuts = [0, ...yAxis.cuts, panel.nominalHeight];
  const tiles: PanelTile[] = [];

  for (let rowIndex = 0; rowIndex < yCuts.length - 1; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < xCuts.length - 1; columnIndex += 1) {
      const x0 = requiredArrayValue(xCuts, columnIndex, "splitPanelIntoTiles x0");
      const x1 = requiredArrayValue(xCuts, columnIndex + 1, "splitPanelIntoTiles x1");
      const y0 = requiredArrayValue(yCuts, rowIndex, "splitPanelIntoTiles y0");
      const y1 = requiredArrayValue(yCuts, rowIndex + 1, "splitPanelIntoTiles y1");
      tiles.push({
        panel,
        id: tileId(panel.id, columnIndex, rowIndex, xCuts.length - 1, yCuts.length - 1),
        name: tileName(panel.name, columnIndex, rowIndex, xCuts.length - 1, yCuts.length - 1),
        x0,
        x1,
        y0,
        y1,
        columnIndex,
        rowIndex,
        columnCount: xCuts.length - 1,
        rowCount: yCuts.length - 1,
        cuts: cuts
          .filter((panelCut) => boundsInsideTile(panelCut.bounds, x0, x1, y0, y1))
          .map((panelCut) => translateCutToTile(panelCut.cut, x0, y0)),
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
  const width = tile.x1 - tile.x0;
  const depth = tile.y1 - tile.y0;
  return {
    id: tile.id,
    name: tile.name,
    kind: "panel-tile",
    sourcePanelId: tile.panel.id,
    width,
    depth,
    height: materialThickness,
    cutFeatureCount: tile.cuts.length,
    printCriticalCutFeatureCount: tile.cuts.filter(isPrintCriticalCut).length,
    mesh: createPlateMesh(width, depth, materialThickness, tile.cuts),
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

function createPlateMesh(width: number, depth: number, height: number, cuts: readonly CutFeature[]): PrintableMesh {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.lineTo(width, depth);
  shape.lineTo(0, depth);
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

function packPrintableParts(parts: readonly PrintablePart[], bed: PrintBed): PackedPart[] {
  const rowWidth = bed.type === "bounded" ? bed.width : 1000;
  const packed: PackedPart[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;

  for (const part of parts) {
    if (cursorX > 0 && cursorX + part.width > rowWidth) {
      cursorX = 0;
      cursorY += rowDepth + printPartGap;
      rowDepth = 0;
    }
    packed.push({
      part,
      position: { x: cursorX, y: cursorY, z: 0 },
    });
    cursorX += part.width + printPartGap;
    rowDepth = Math.max(rowDepth, part.depth);
  }

  return packed;
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
