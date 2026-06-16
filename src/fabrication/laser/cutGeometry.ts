import type { BoxesDocument, Shape } from "@/ports/boxes/cutDocument";
import {
  defaultCutJointSettings,
  type CutJointSettings,
  type DovetailJointSettings,
  type FingerJointSettings,
  type ReferenceScale,
} from "@/fabrication/laser/cutSettings";

// #######################################
// Cut Model
// #######################################

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
  jointSettings?: CutJointSettings;
  cuts?: CutFeature[];
  assembly?: CutPanelAssembly;
};

type EdgeDirection = {
  axis: CutPoint;
  outward: CutPoint;
};

const sheetGap = 18;
const sheetMargin = 12;

// #######################################
// Panel Construction
// #######################################

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
  const kerfFit = input.kerfFit ?? 0;
  const outline = offsetOutlineOutward(buildRectangularOutline(input), kerfFit);
  // Finger ("f"), counterpart ("F") and finger-hole ("h") edges are all drawn as
  // interlocking combs on the outline itself, so no separate edge slot rows are
  // needed. Interior finger-hole rows (filter joints) are passed in via `cuts`.
  const cuts = [...(input.cuts ?? [])];
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

// #######################################
// Sheet Layout
// #######################################

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

// #######################################
// Drawing Export
// #######################################

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

  // Round the sheet extents so equal-segment comb widths (length / oddCount)
  // don't leak floating-point noise into the canvas size and summaries.
  const width = roundToMicron(shapes.reduce((maxX, shape) => Math.max(maxX, shapeMaxX(shape)), 0) + sheetMargin);
  const height = roundToMicron(shapes.reduce((maxY, shape) => Math.max(maxY, shapeMaxY(shape)), 0) + sheetMargin);
  return { width, height, shapes };
}

// #######################################
// Finger Hole Cuts
// #######################################

// Interior finger-hole slots that a mating wall's fingers pass through. They
// must line up with the mating comb's TEETH. A finger ("f") edge is gender A,
// which carries teeth on the odd segments of the equal-width comb, so the slots
// sit on those same odd segments and share the comb's segment width.
export function fingerHoleCutsAt(
  x: number,
  y: number,
  length: number,
  angle: 0 | 90,
  thickness: number,
  kerfFit = 0,
  jointSettings: CutJointSettings = defaultCutJointSettings,
): RectCut[] {
  const { segments, segmentWidth } = fingerCombSegments(length, thickness, jointSettings.finger);
  const cuts: RectCut[] = [];
  const holeThickness = thickness * (jointSettings.finger.holeWidthMultiplier + jointSettings.finger.playMultiplier);
  for (let index = 1; index < segments; index += 2) {
    const position = index * segmentWidth;
    if (angle === 90) {
      cuts.push(
        shrinkRectCut(
          {
            type: "rect",
            x: x - holeThickness / 2,
            y: y + position,
            width: holeThickness,
            height: segmentWidth,
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
            y: y - holeThickness / 2,
            width: segmentWidth,
            height: holeThickness,
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

// #######################################
// Rectangular Joint Outlines
// #######################################

function buildRectangularOutline(input: RectangularPanelInput): CutPoint[] {
  const jointSettings = input.jointSettings ?? defaultCutJointSettings;
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
      appendEdgeSection(points, section.kind, section.length, direction, input.thickness, jointSettings);
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
  jointSettings: CutJointSettings,
): void {
  if (kind === "finger") {
    appendFingerProfile(points, length, direction, thickness, jointSettings.finger, "A");
    return;
  }
  if (kind === "finger-counter" || kind === "finger-holes") {
    // The counterpart ("F") and the finger-hole edge ("h") are both the mating
    // gender (B) of a finger ("f", gender A): they interlock as a comb rather
    // than receiving a separate row of slots.
    appendFingerProfile(points, length, direction, thickness, jointSettings.finger, "B");
    return;
  }
  if (kind === "dovetail") {
    appendDovetailProfile(points, length, direction, thickness, jointSettings.dovetail, 1);
    return;
  }
  if (kind === "dovetail-counter") {
    appendDovetailProfile(points, length, direction, thickness, jointSettings.dovetail, -1);
    return;
  }
  appendLine(points, moveBy(lastPoint(points), direction.axis, length));
}

type FingerGender = "A" | "B";

// Emit a finger comb along the edge. The comb is an odd number of equal-width
// segments; gender A carries a tooth on the odd segments, gender B on the even
// segments, so an "f" (A) edge and an "F"/"h" (B) edge are exact complements
// that interlock. Teeth always protrude OUTWARD (the gender only chooses which
// segments carry one) — matching florianfesti/boxes and tempest-builder.html.
function appendFingerProfile(
  points: CutPoint[],
  length: number,
  direction: EdgeDirection,
  thickness: number,
  settings: FingerJointSettings,
  gender: FingerGender,
): void {
  const { segments, segmentWidth } = fingerCombSegments(length, thickness, settings);
  const depth = thickness;
  const toothOnOdd = gender === "A";
  for (let index = 0; index < segments; index += 1) {
    const hasTooth = (index % 2 === 1) === toothOnOdd;
    if (hasTooth) {
      appendStep(points, direction.outward, depth);
      appendLine(points, moveBy(lastPoint(points), direction.axis, segmentWidth));
      appendStep(points, direction.outward, -depth);
    } else {
      appendLine(points, moveBy(lastPoint(points), direction.axis, segmentWidth));
    }
  }
}

function appendDovetailProfile(
  points: CutPoint[],
  length: number,
  direction: EdgeDirection,
  thickness: number,
  settings: DovetailJointSettings,
  polarity: 1 | -1,
): void {
  const size = settings.sizeMultiplier * thickness;
  const gap = size;
  const depth = settings.depthMultiplier * thickness;
  const sections = Math.floor(length / (size + gap));
  if (sections === 0) {
    appendLine(points, moveBy(lastPoint(points), direction.axis, length));
    return;
  }

  const shoulder = size * dovetailShoulderFraction(settings.taper);
  const middle = Math.max(size * 0.1, size - 2 * shoulder);
  const leftover = length - sections * (size + gap) + gap;
  appendLine(points, moveBy(lastPoint(points), direction.axis, leftover / 2));
  for (let index = 0; index < sections; index += 1) {
    appendLine(points, moveBy(moveBy(lastPoint(points), direction.axis, shoulder), direction.outward, depth * polarity));
    appendLine(points, moveBy(lastPoint(points), direction.axis, middle));
    appendLine(points, moveBy(moveBy(lastPoint(points), direction.axis, shoulder), direction.outward, -depth * polarity));
    if (index < sections - 1) {
      appendLine(points, moveBy(lastPoint(points), direction.axis, gap));
    }
  }
  appendLine(points, moveBy(lastPoint(points), direction.axis, leftover / 2));
}

// #######################################
// Outline Kerf Offset
// #######################################

// Mirrors the boxes.py burn correction: the exported outline is the tool path,
// displaced outward by the kerf so the part that survives the cut keeps its
// nominal size. Tenons widen and recesses narrow as a side effect of the
// parallel offset, matching how upstream offsets continuously while drawing.
// Holes are compensated separately when each cut feature is created.
function offsetOutlineOutward(points: readonly CutPoint[], distance: number): CutPoint[] {
  if (distance === 0 || points.length < 3) {
    return [...points];
  }
  return points.map((point, index) => {
    const incoming = outwardNormal(cyclicPoint(points, index - 1), point);
    const outgoing = outwardNormal(point, cyclicPoint(points, index + 1));
    const miterScale = 1 + incoming.x * outgoing.x + incoming.y * outgoing.y;
    if (miterScale < 1e-9) {
      throw new Error("offsetOutlineOutward: outline reverses direction");
    }
    return {
      x: point.x + ((incoming.x + outgoing.x) * distance) / miterScale,
      y: point.y + ((incoming.y + outgoing.y) * distance) / miterScale,
    };
  });
}

function outwardNormal(from: CutPoint, to: CutPoint): CutPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return { x: dy / length, y: -dx / length };
}

function cyclicPoint(points: readonly CutPoint[], index: number): CutPoint {
  const point = points[((index % points.length) + points.length) % points.length];
  if (point === undefined) {
    throw new Error("cyclicPoint: no points available");
  }
  return point;
}

// #######################################
// Panel Normalization
// #######################################

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

// #######################################
// Joint Geometry Helpers
// #######################################

// Split an edge into an ODD number of equal-width comb segments. An odd count
// guarantees both ends are the same kind of segment, which is what makes the two
// genders exact complements (see appendFingerProfile). The target segment width
// is the average of the finger and space multipliers so both controls still
// affect tooth density (defaults: (2 + 2) / 2 = 2 -> ~2 x thickness, as upstream).
function fingerCombSegments(
  length: number,
  thickness: number,
  settings: FingerJointSettings,
): { segments: number; segmentWidth: number } {
  const pitch = ((settings.widthMultiplier + settings.spaceMultiplier) / 2) * thickness;
  let segments = pitch > 0 ? Math.round(length / pitch) : 3;
  if (segments < 3) {
    segments = 3;
  }
  if (segments % 2 === 0) {
    segments += 1;
  }
  return { segments, segmentWidth: length / segments };
}

function dovetailShoulderFraction(taper: number): number {
  return 0.05 + (clampNumber(taper, 0, 80) / 80) * 0.208;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
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

// #######################################
// Shape Paths and Bounds
// #######################################

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

// #######################################
// Point Helpers
// #######################################

function roundToMicron(value: number): number {
  return Math.round(value * 1000) / 1000;
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

// #######################################
// Edge Parsing
// #######################################

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
