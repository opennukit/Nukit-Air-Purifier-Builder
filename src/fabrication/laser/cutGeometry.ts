import type { BoxesDocument } from "@/ports/boxes/kernel";
import type { Shape } from "@/ports/boxes/drawing";
import type { ReferenceScale } from "@/fabrication/laser/cutSettings";

export type CutPoint = {
  x: number;
  y: number;
};

export type SheetPlacement = {
  x: number;
  y: number;
};

export type CircleCut = {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
  role: "fan" | "screw" | "reference";
};

export type RectCut = {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  role: "finger-hole" | "slot" | "window";
};

export type CutFeature = CircleCut | RectCut;

export type AssemblyPlacement = {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
};

export type StructuralAssemblyRole =
  | "front-fan-wall"
  | "rear-fan-wall"
  | "left-side-wall"
  | "right-side-wall"
  | "closed-back";

export const filterRailKeys = [
  "front-long",
  "rear-long",
  "left-short",
  "right-short",
  "inner-long",
  "outer-long",
  "inner-short",
  "outer-short",
] as const;

export type FilterRailKey = (typeof filterRailKeys)[number];

export type CutPanelAssembly =
  | {
      type: "placed";
      role: StructuralAssemblyRole | "filter-frame-panel";
      placement: AssemblyPlacement;
    }
  | {
      type: "filter-rail";
      filterIndex: number;
      railKey: FilterRailKey;
    };

export type CutPanelDraft = {
  id: string;
  name: string;
  nominalWidth: number;
  nominalHeight: number;
  width: number;
  height: number;
  assemblyCenter: CutPoint;
  outline: CutPoint[];
  cuts: CutFeature[];
  assembly?: CutPanelAssembly;
};

export type LaidOutCutPanel = CutPanelDraft & {
  sheet: SheetPlacement;
};

export type CutPanel = LaidOutCutPanel;

export type EdgeKind = "plain" | "finger" | "finger-counter" | "finger-holes" | "dovetail" | "dovetail-counter";

export type EdgeSection = {
  kind: EdgeKind;
  length: number;
};

export type RectangularPanelInput = {
  id: string;
  name: string;
  width: number;
  height: number;
  edges: readonly [readonly EdgeSection[], readonly EdgeSection[], readonly EdgeSection[], readonly EdgeSection[]];
  thickness: number;
  kerfFit?: number;
  cuts?: CutFeature[];
  assembly?: CutPanelAssembly;
};

type EdgeDirection = {
  axis: CutPoint;
  outward: CutPoint;
};

const sheetGap = 18;
const sheetMargin = 12;
const maxSheetRowWidth = 1040;

export function edgeSections(pattern: string, lengths?: readonly number[]): EdgeSection[] {
  if (lengths !== undefined && pattern.length !== lengths.length) {
    throw new Error("edgeSections: pattern and length counts must match");
  }
  return Array.from(pattern).map((char, index) => ({
    kind: edgeKindFromChar(char),
    length: lengths?.[index] ?? 0,
  }));
}

export function rectangularPanel(input: RectangularPanelInput): CutPanelDraft {
  const outline = buildRectangularOutline(input);
  const kerfFit = input.kerfFit ?? 0;
  const cuts = [
    ...(input.cuts ?? []),
    ...createFingerHoleCutsForEdges(input.width, input.height, input.edges, input.thickness, kerfFit),
  ];
  return normalizePanel({
    id: input.id,
    name: input.name,
    nominalWidth: input.width,
    nominalHeight: input.height,
    width: input.width,
    height: input.height,
    assemblyCenter: {
      x: input.width / 2,
      y: input.height / 2,
    },
    outline,
    cuts,
    assembly: input.assembly,
  });
}

export function layoutCutPanels(panels: readonly CutPanelDraft[]): LaidOutCutPanel[] {
  let cursorX = sheetMargin;
  let cursorY = sheetMargin;
  let rowHeight = 0;

  return panels.map((panel) => {
    if (cursorX > sheetMargin && cursorX + panel.width > maxSheetRowWidth) {
      cursorX = sheetMargin;
      cursorY += rowHeight + sheetGap;
      rowHeight = 0;
    }

    const laidOut = {
      ...panel,
      sheet: {
        x: cursorX,
        y: cursorY,
      },
    };

    cursorX += panel.width + sheetGap;
    rowHeight = Math.max(rowHeight, panel.height);
    return laidOut;
  });
}

export function layoutCutPanelsInColumn(panels: readonly CutPanelDraft[], gap: number): LaidOutCutPanel[] {
  let cursorY = sheetMargin;

  return panels.map((panel) => {
    const laidOut = {
      ...panel,
      sheet: {
        x: sheetMargin,
        y: cursorY,
      },
    };

    cursorY += panel.height + gap;
    return laidOut;
  });
}

export function cutPanelsToDocument(
  panels: readonly LaidOutCutPanel[],
  referenceScale: ReferenceScale,
  labels: boolean,
  kerfFit = 0,
): BoxesDocument {
  const shapes: Shape[] = [];
  for (const panel of panels) {
    const offset = panel.sheet;
    shapes.push({
      type: "path",
      points: translatePoints(panel.outline, offset.x, offset.y),
      closed: true,
      color: "cut",
    });

    for (const cut of panel.cuts) {
      shapes.push({
        type: "path",
        points: translatePoints(cutFeaturePath(cut), offset.x, offset.y),
        closed: true,
        color: "inner-cut",
      });
    }

    if (labels) {
      shapes.push({
        type: "text",
        x: offset.x + panel.width / 2,
        y: offset.y + panel.height / 2,
        text: panel.name,
        color: "annotation",
        fontSize: 6,
      });
    }
  }

  if (referenceScale.type === "enabled") {
    const y = panels.reduce((bottom, panel) => Math.max(bottom, panel.sheet.y + panel.height), sheetMargin) + sheetGap;
    shapes.push({
      type: "path",
      points: rectPath(sheetMargin, y, referenceScale.length, 10),
      closed: true,
      color: "reference",
    });
    shapes.push({
      type: "text",
      x: sheetMargin + referenceScale.length / 2,
      y: y + 5,
      text: `${referenceScale.length.toFixed(1)}mm, burn:${kerfFit.toFixed(2)}mm`,
      color: "annotation",
      fontSize: 6,
    });
  }

  const width = shapes.reduce((maxX, shape) => Math.max(maxX, shapeMaxX(shape)), 0) + sheetMargin;
  const height = shapes.reduce((maxY, shape) => Math.max(maxY, shapeMaxY(shape)), 0) + sheetMargin;
  return { width, height, shapes };
}

export function fingerHoleCutsAt(
  x: number,
  y: number,
  length: number,
  angle: 0 | 90,
  thickness: number,
  kerfFit = 0,
): RectCut[] {
  const { fingers, leftover, finger } = calculateFingerPattern(length, thickness);
  if (fingers === 0) {
    return [];
  }

  const cuts: RectCut[] = [];
  const holeWidth = thickness;
  for (let index = 0; index < fingers; index += 1) {
    const position = leftover / 2 + index * (finger + 2 * thickness);
    if (angle === 90) {
      cuts.push(
        shrinkRectCut(
          {
            type: "rect",
            x: x - holeWidth / 2,
            y: y + position,
            width: holeWidth,
            height: finger,
            radius: 0,
            role: "finger-hole",
          },
          kerfFit,
        ),
      );
    } else {
      cuts.push(
        shrinkRectCut(
          {
            type: "rect",
            x: x + position,
            y: y - holeWidth / 2,
            width: finger,
            height: holeWidth,
            radius: 0,
            role: "finger-hole",
          },
          kerfFit,
        ),
      );
    }
  }
  return cuts;
}

function buildRectangularOutline(input: RectangularPanelInput): CutPoint[] {
  const directions: readonly EdgeDirection[] = [
    { axis: { x: 1, y: 0 }, outward: { x: 0, y: -1 } },
    { axis: { x: 0, y: 1 }, outward: { x: 1, y: 0 } },
    { axis: { x: -1, y: 0 }, outward: { x: 0, y: 1 } },
    { axis: { x: 0, y: -1 }, outward: { x: -1, y: 0 } },
  ];
  const fallbackLengths = [input.width, input.height, input.width, input.height];
  const points: CutPoint[] = [{ x: 0, y: 0 }];

  input.edges.forEach((sections, edgeIndex) => {
    const direction = directions[edgeIndex];
    const totalSpecifiedLength = sections.reduce((sum, section) => sum + section.length, 0);
    const normalizedSections =
      totalSpecifiedLength > 0
        ? sections
        : sections.map((section) => ({ ...section, length: fallbackLengths[edgeIndex] }));

    for (const section of normalizedSections) {
      appendEdgeSection(points, section.kind, section.length, direction, input.thickness);
    }
  });

  removeClosingDuplicate(points);
  return points;
}

function appendEdgeSection(
  points: CutPoint[],
  kind: EdgeKind,
  length: number,
  direction: EdgeDirection,
  thickness: number,
): void {
  if (kind === "finger") {
    appendFingerProfile(points, length, direction, thickness, 1);
    return;
  }
  if (kind === "finger-counter") {
    appendFingerProfile(points, length, direction, thickness, -1);
    return;
  }
  if (kind === "dovetail") {
    appendDovetailProfile(points, length, direction, thickness, 1);
    return;
  }
  if (kind === "dovetail-counter") {
    appendDovetailProfile(points, length, direction, thickness, -1);
    return;
  }
  appendLine(points, moveBy(lastPoint(points), direction.axis, length));
}

function appendFingerProfile(
  points: CutPoint[],
  length: number,
  direction: EdgeDirection,
  thickness: number,
  polarity: 1 | -1,
): void {
  const { fingers, leftover, finger, space } = calculateFingerPattern(length, thickness);
  const depth = thickness;
  appendLine(points, moveBy(lastPoint(points), direction.axis, leftover / 2));
  for (let index = 0; index < fingers; index += 1) {
    appendStep(points, direction.outward, depth * polarity);
    appendLine(points, moveBy(lastPoint(points), direction.axis, finger));
    appendStep(points, direction.outward, -depth * polarity);
    if (index < fingers - 1) {
      appendLine(points, moveBy(lastPoint(points), direction.axis, space));
    }
  }
  appendLine(points, moveBy(lastPoint(points), direction.axis, leftover / 2));
}

function appendDovetailProfile(
  points: CutPoint[],
  length: number,
  direction: EdgeDirection,
  thickness: number,
  polarity: 1 | -1,
): void {
  const size = 2 * thickness;
  const gap = size;
  const depth = thickness;
  const sections = Math.floor(length / (size + gap));
  if (sections === 0) {
    appendLine(points, moveBy(lastPoint(points), direction.axis, length));
    return;
  }

  const leftover = length - sections * (size + gap) + gap;
  appendLine(points, moveBy(lastPoint(points), direction.axis, leftover / 2));
  for (let index = 0; index < sections; index += 1) {
    appendLine(points, moveBy(moveBy(lastPoint(points), direction.axis, size * 0.18), direction.outward, depth * polarity));
    appendLine(points, moveBy(lastPoint(points), direction.axis, size * 0.64));
    appendLine(points, moveBy(moveBy(lastPoint(points), direction.axis, size * 0.18), direction.outward, -depth * polarity));
    if (index < sections - 1) {
      appendLine(points, moveBy(lastPoint(points), direction.axis, gap));
    }
  }
  appendLine(points, moveBy(lastPoint(points), direction.axis, leftover / 2));
}

function createFingerHoleCutsForEdges(
  width: number,
  height: number,
  edges: RectangularPanelInput["edges"],
  thickness: number,
  kerfFit: number,
): CutFeature[] {
  const cuts: RectCut[] = [];
  const edgeHoleOffset = thickness * 1.5 + kerfFit;
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const sections = edges[edgeIndex];
    const hasFingerHoleEdge = sections.some((section) => section.kind === "finger-holes");
    if (!hasFingerHoleEdge) {
      continue;
    }

    if (edgeIndex === 0) {
      cuts.push(...fingerHoleCutsAt(0, edgeHoleOffset, width, 0, thickness, kerfFit));
    } else if (edgeIndex === 1) {
      cuts.push(...fingerHoleCutsAt(width - edgeHoleOffset, 0, height, 90, thickness, kerfFit));
    } else if (edgeIndex === 2) {
      cuts.push(...fingerHoleCutsAt(0, height - edgeHoleOffset, width, 0, thickness, kerfFit));
    } else {
      cuts.push(...fingerHoleCutsAt(edgeHoleOffset, 0, height, 90, thickness, kerfFit));
    }
  }
  return cuts;
}

function normalizePanel(panel: CutPanelDraft): CutPanelDraft {
  const allPoints = [
    ...panel.outline,
    ...panel.cuts.flatMap(cutBoundsPoints),
  ];
  const minX = Math.min(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const assemblyCenter = {
    x: panel.nominalWidth / 2 - minX,
    y: panel.nominalHeight / 2 - minY,
  };
  const translatedOutline = translatePoints(panel.outline, -minX, -minY);
  const translatedCuts = panel.cuts.map((cut) => translateCut(cut, -minX, -minY));
  const maxX = Math.max(...translatedOutline.map((point) => point.x), ...translatedCuts.flatMap(cutBoundsPoints).map((point) => point.x));
  const maxY = Math.max(...translatedOutline.map((point) => point.y), ...translatedCuts.flatMap(cutBoundsPoints).map((point) => point.y));
  return {
    ...panel,
    width: maxX,
    height: maxY,
    assemblyCenter,
    outline: translatedOutline,
    cuts: translatedCuts,
  };
}

function calculateFingerPattern(length: number, thickness: number): { fingers: number; leftover: number; finger: number; space: number } {
  const space = 2 * thickness;
  let finger = 2 * thickness;
  let fingers = Math.floor((length - space) / (space + finger));
  if (fingers <= 0) {
    if (finger > 0 && length > 0.75 * thickness) {
      finger = length / 2;
      return { fingers: 1, leftover: finger, finger, space };
    }
    return { fingers: 0, leftover: length, finger, space };
  }
  return {
    fingers,
    leftover: length - fingers * (space + finger) + space,
    finger,
    space,
  };
}

function shrinkRectCut(cut: RectCut, kerfFit: number): RectCut {
  const maxInset = Math.max(0, Math.min(cut.width, cut.height) / 2 - 0.001);
  const inset = Math.min(Math.max(0, kerfFit), maxInset);
  return {
    ...cut,
    x: cut.x + inset,
    y: cut.y + inset,
    width: cut.width - 2 * inset,
    height: cut.height - 2 * inset,
    radius: Math.max(0, cut.radius - inset),
  };
}

function cutFeaturePath(cut: CutFeature): CutPoint[] {
  if (cut.type === "circle") {
    return circlePath(cut.cx, cut.cy, cut.radius);
  }
  if (cut.radius > 0) {
    return roundedRectPath(cut.x, cut.y, cut.width, cut.height, cut.radius);
  }
  return rectPath(cut.x, cut.y, cut.width, cut.height);
}

function circlePath(cx: number, cy: number, radius: number): CutPoint[] {
  const segments = 64;
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

function rectPath(x: number, y: number, width: number, height: number): CutPoint[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number): CutPoint[] {
  const normalizedRadius = Math.min(radius, width / 2, height / 2);
  if (normalizedRadius <= 0) {
    return rectPath(x, y, width, height);
  }

  const points: CutPoint[] = [
    { x: x + normalizedRadius, y },
    { x: x + width - normalizedRadius, y },
  ];
  appendArc(points, x + width - normalizedRadius, y + normalizedRadius, normalizedRadius, -90, 0);
  points.push({ x: x + width, y: y + height - normalizedRadius });
  appendArc(points, x + width - normalizedRadius, y + height - normalizedRadius, normalizedRadius, 0, 90);
  points.push({ x: x + normalizedRadius, y: y + height });
  appendArc(points, x + normalizedRadius, y + height - normalizedRadius, normalizedRadius, 90, 180);
  points.push({ x, y: y + normalizedRadius });
  appendArc(points, x + normalizedRadius, y + normalizedRadius, normalizedRadius, 180, 270);
  return points;
}

function appendArc(
  points: CutPoint[],
  centerX: number,
  centerY: number,
  radius: number,
  startDegrees: number,
  endDegrees: number,
): void {
  const segments = Math.max(4, Math.ceil(radius / 2));
  for (let index = 1; index <= segments; index += 1) {
    const degrees = startDegrees + ((endDegrees - startDegrees) * index) / segments;
    const radians = (degrees / 180) * Math.PI;
    points.push({
      x: centerX + Math.cos(radians) * radius,
      y: centerY + Math.sin(radians) * radius,
    });
  }
}

function translateCut(cut: CutFeature, offsetX: number, offsetY: number): CutFeature {
  if (cut.type === "circle") {
    return { ...cut, cx: cut.cx + offsetX, cy: cut.cy + offsetY };
  }
  return { ...cut, x: cut.x + offsetX, y: cut.y + offsetY };
}

function cutBoundsPoints(cut: CutFeature): CutPoint[] {
  if (cut.type === "circle") {
    return [
      { x: cut.cx - cut.radius, y: cut.cy - cut.radius },
      { x: cut.cx + cut.radius, y: cut.cy + cut.radius },
    ];
  }
  return [
    { x: cut.x, y: cut.y },
    { x: cut.x + cut.width, y: cut.y + cut.height },
  ];
}

function shapeMaxX(shape: Shape): number {
  if (shape.type === "circle") {
    return shape.cx + shape.radius;
  }
  if (shape.type === "text") {
    return shape.x;
  }
  if (shape.type === "path") {
    return Math.max(...shape.points.map((point) => point.x));
  }
  return shape.x + shape.width;
}

function shapeMaxY(shape: Shape): number {
  if (shape.type === "circle") {
    return shape.cy + shape.radius;
  }
  if (shape.type === "text") {
    return shape.y;
  }
  if (shape.type === "path") {
    return Math.max(...shape.points.map((point) => point.y));
  }
  return shape.y + shape.height;
}

function translatePoints(points: readonly CutPoint[], offsetX: number, offsetY: number): CutPoint[] {
  return points.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }));
}

function moveBy(point: CutPoint, vector: CutPoint, distance: number): CutPoint {
  return {
    x: point.x + vector.x * distance,
    y: point.y + vector.y * distance,
  };
}

function appendStep(points: CutPoint[], vector: CutPoint, distance: number): void {
  appendLine(points, moveBy(lastPoint(points), vector, distance));
}

function appendLine(points: CutPoint[], point: CutPoint): void {
  const current = lastPoint(points);
  if (Math.abs(current.x - point.x) < 0.001 && Math.abs(current.y - point.y) < 0.001) {
    return;
  }
  points.push(point);
}

function lastPoint(points: readonly CutPoint[]): CutPoint {
  const point = points[points.length - 1];
  if (point === undefined) {
    throw new Error("lastPoint: no points available");
  }
  return point;
}

function removeClosingDuplicate(points: CutPoint[]): void {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return;
  }
  if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
    points.pop();
  }
}

function edgeKindFromChar(char: string): EdgeKind {
  if (char === "e" || char === "E") {
    return "plain";
  }
  if (char === "f") {
    return "finger";
  }
  if (char === "F") {
    return "finger-counter";
  }
  if (char === "h" || char === "H") {
    return "finger-holes";
  }
  if (char === "d") {
    return "dovetail";
  }
  if (char === "D") {
    return "dovetail-counter";
  }
  throw new Error(`edgeKindFromChar: Unknown edge '${char}'`);
}
