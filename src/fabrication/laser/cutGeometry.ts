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

// A honeycomb fan grill: the bore is cut as a field of hexagonal holes (clipped
// inside the bore) instead of one plain circle. hexFlatToFlat is the hex width
// across the flats; ribThickness is the solid web left between adjacent cells.
export type GrillSpec = {
  hexFlatToFlat: number;
  ribThickness: number;
  // false: clip partial hexes to the bore circle; true: keep only whole cells.
  fullCellsOnly: boolean;
};

export type CircleCut = {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
  role: "fan" | "screw" | "reference" | "cord";
  // Only set on fan bores. When present, the opening is rendered as a honeycomb
  // of hexes filling this circle rather than as the circle itself. The circle is
  // still the marker used for fan counting and 3D fan placement.
  grill?: GrillSpec;
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
  // Preview only: reflect the rendered mesh across its local X axis so an
  // asymmetric part can be shown as a true mirror of its opposite-side twin
  // (rotation alone can't mirror). Does not affect the flat cut part.
  mirrored?: boolean;
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

// True when a wall panel carries a cord bore that overlaps one of its fan openings.
// The fan row is repacked clear of the cord where there is room (fanCenterXs), but a
// wall packed to its maximum fan count leaves no clear spot, so a center cord can
// still land in a fan opening. This scans the built panels (cord and fan circles
// share the panel frame) so the same "cord runs through a fan" build warning the
// 3D-print path emits also covers the laser cut sheet.
const CORD_FAN_PANEL_CLEARANCE_MM = 1;
export function cutPanelsCordThroughFan(panels: readonly CutPanel[]): boolean {
  for (const panel of panels) {
    const circles = panel.cuts.filter((cut): cut is CircleCut => cut.type === "circle");
    const cord = circles.find((circle) => circle.role === "cord");
    if (cord === undefined) {
      continue;
    }
    for (const fan of circles) {
      if (fan.role !== "fan") {
        continue;
      }
      const distance = Math.hypot(fan.cx - cord.cx, fan.cy - cord.cy);
      if (distance < fan.radius + cord.radius + CORD_FAN_PANEL_CLEARANCE_MM) {
        return true;
      }
    }
  }
  return false;
}

export type EdgeKind = "plain" | "plain-outset" | "finger" | "finger-counter" | "finger-holes" | "dovetail" | "dovetail-counter";

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
  const jointSettings = input.jointSettings ?? defaultCutJointSettings;
  // "finger-holes" ("h") edges are drawn as a plain straight edge; the holes the
  // mating fingers pass through are rectangular cuts added here (boxes.py
  // FingerHoleEdge), set in from the edge by edge_width + thickness/2.
  const edgeHoles = createFingerHoleCutsForEdges(input.width, input.height, input.edges, input.thickness, kerfFit, jointSettings, [0, 1, 2, 3].map((i) => edgeOutset(input.edges[i], input.thickness)));
  // Near a corner, finger-hole rows/columns from different joints can run into
  // each other (an interior filter-rail row into an edge wall-joint column, or
  // two edge columns where they meet). boxes.py keeps a clear gap there; we do
  // the same by dropping the minimum number of holes so every remaining pair
  // keeps at least one material thickness of bridge between them, preferring to
  // keep the structural edge-column holes over interior rows. This drops only the
  // one or two filter-row holes that crowd the wall-joint column at a corner.
  const minBridge = Math.max(0.75, input.thickness);
  const allCuts: CutFeature[] = [...(input.cuts ?? []), ...edgeHoles];
  const edgeHoleSet = new Set<CutFeature>(edgeHoles);
  const fingerHoles = allCuts
    .filter((cut): cut is RectCut => cut.type === "rect" && cut.role === "finger-hole")
    .sort((a, b) => (edgeHoleSet.has(b) ? 1 : 0) - (edgeHoleSet.has(a) ? 1 : 0));
  const dropped = new Set<CutFeature>();
  const keptHoles: RectCut[] = [];
  for (const hole of fingerHoles) {
    if (keptHoles.some((kept) => rectGap(hole, kept) < minBridge)) {
      dropped.add(hole);
    } else {
      keptHoles.push(hole);
    }
  }
  const cuts = allCuts.filter((cut) => !dropped.has(cut));
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

export function layoutCutPanelsInColumn(
  panels: readonly CutPanelDraft[],
  gap: number,
  leftPad = 0,
  topPad = 0,
): LaidOutCutPanel[] {
  // leftPad / topPad reserve clear space to the left of and above every panel so
  // external (engineering-style) dimensions have room to sit outside the outline.
  let cursorY = sheetMargin + topPad;

  return panels.map((panel) => {
    const laidOut = {
      ...panel,
      sheet: {
        x: sheetMargin + leftPad,
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
  dimensioned = false,
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
      if (cut.type === "circle" && cut.grill !== undefined) {
        // A honeycomb fan grill: cut the hex field, not the bore circle.
        for (const hole of hexGrillHoles(cut.cx, cut.cy, cut.radius, cut.grill)) {
          shapes.push({
            type: "path",
            points: translatePoints(hole, offset.x, offset.y),
            closed: true,
            color: "inner-cut",
          });
        }
        continue;
      }
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

    if (dimensioned) {
      shapes.push(...panelDimensionShapes(panel, offset));
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
// Panel Dimensions (hand-cut annotations)
// #######################################

// Reference dimensions drawn OUTSIDE each panel in engineering-drawing style:
// extension lines projecting off the part, an offset dimension line carrying
// arrowheads that touch the extension lines, the value clear of the line, plus a
// centre crosshair on every fan bore and one leadered Ø callout. All on the
// annotation layer (printed/exported, never cut). The laid-out sheet reserves a
// left + top margin per panel (layoutCutPanelsInColumn padding) for this.
const DIM_OFFSET_MM = 16; // part edge -> dimension line
const DIM_EXT_GAP_MM = 1.5; // part edge -> start of extension line
const DIM_EXT_OVER_MM = 5; // extension line past the dimension line
const DIM_ARROW_MM = 2.6;
const DIM_TEXT_MM = 6;

function annPath(points: CutPoint[]): Shape {
  return { type: "path", points, closed: false, color: "annotation" };
}

function annText(x: number, y: number, text: string, fontSize = DIM_TEXT_MM): Shape {
  return { type: "text", x, y, text, color: "annotation", fontSize };
}

const DIM_STEP_MM = 16; // spacing between stacked coordinate dimensions (room for "nnn mm")
const DIM_COORD_TEXT_MM = 5;

function panelDimensionShapes(panel: LaidOutCutPanel, offset: SheetPlacement): Shape[] {
  const out: Shape[] = [];
  const x0 = offset.x;
  const y0 = offset.y;
  const w = panel.width;
  const h = panel.height;
  const num = (value: number): string => `${Math.round(value)} mm`;
  const circles = panel.cuts.filter((cut): cut is CircleCut => cut.type === "circle");
  const fans = circles.filter((cut) => cut.role === "fan");
  const screws = circles.filter((cut) => cut.role === "screw");
  const cords = circles.filter((cut) => cut.role === "cord");

  // Centre crosshair on every fan and cord bore.
  for (const c of [...fans, ...cords]) {
    const cx = x0 + c.cx;
    const cy = y0 + c.cy;
    const reach = c.radius + 4;
    out.push(annPath([{ x: cx - reach, y: cy }, { x: cx + reach, y: cy }]));
    out.push(annPath([{ x: cx, y: cy - reach }, { x: cx, y: cy + reach }]));
  }

  // Coordinate grid: locate fan/cord centres from the panel's top-left datum with
  // stacked dimensions (shortest nearest the part), overall size outermost.
  const located = [...fans, ...cords];
  const xs = uniqueRounded(located.map((c) => c.cx));
  const ys = uniqueRounded(located.map((c) => c.cy));
  xs.forEach((vx, index) => coordDimAbove(out, x0, x0 + vx, y0, index + 1, num(vx), DIM_COORD_TEXT_MM));
  coordDimAbove(out, x0, x0 + w, y0, xs.length + 1, num(w), DIM_TEXT_MM);
  ys.forEach((vy, index) => coordDimLeft(out, y0, y0 + vy, x0, index + 1, num(vy), DIM_COORD_TEXT_MM));
  coordDimLeft(out, y0, y0 + h, x0, ys.length + 1, num(h), DIM_TEXT_MM);

  // Screw pattern: dimension one corner screw from its fan centre with arrowed
  // offset dims (the grid repeats at every fan), placed at the fan's bottom-right
  // corner. The diameter callouts are routed to the bottom margin (below), so the
  // offset dims and the callouts never share space.
  if (fans.length > 0 && screws.length > 0) {
    const fan = fans[0];
    const corner = screws
      .filter((s) => Math.hypot(s.cx - fan.cx, s.cy - fan.cy) < fan.radius * 2.2 && s.cx >= fan.cx && s.cy >= fan.cy)
      .at(0);
    if (corner !== undefined) {
      simpleDimH(out, x0 + fan.cx, x0 + corner.cx, y0 + corner.cy, num(Math.abs(corner.cx - fan.cx)));
      simpleDimV(out, y0 + fan.cy, y0 + corner.cy, x0 + corner.cx, num(Math.abs(corner.cy - fan.cy)));
    }
  }

  // Diameter callouts: a leader down from each bore type to a label in the bottom
  // margin, spaced across the panel so they never overlap the position dims or
  // each other.
  const labelY = y0 + h + DIM_OFFSET_MM;
  if (fans[0] !== undefined) {
    diameterLeaderDown(out, x0 + fans[0].cx, y0 + fans[0].cy + fans[0].radius, labelY, `${countPrefix(fans.length)}Ø${num(fans[0].radius * 2)} fan`);
  }
  const screwBore = bottomLeftScrew(screws, fans[0]);
  if (screwBore !== undefined) {
    diameterLeaderDown(out, x0 + screwBore.cx, y0 + screwBore.cy + screwBore.radius, labelY, `${countPrefix(screws.length)}Ø${num(screwBore.radius * 2)} screw`);
  }
  if (cords[0] !== undefined) {
    diameterLeaderDown(out, x0 + cords[0].cx, y0 + cords[0].cy + cords[0].radius, labelY, `Ø${num(cords[0].radius * 2)} cord`);
  }
  return out;
}

// The bottom-left screw of a fan (its leader drops clear of the bottom-right
// offset dims); falls back to any screw.
function bottomLeftScrew(screws: readonly CircleCut[], fan: CircleCut | undefined): CircleCut | undefined {
  if (fan === undefined) {
    return screws[0];
  }
  const near = screws.filter((s) => Math.hypot(s.cx - fan.cx, s.cy - fan.cy) < fan.radius * 2.2);
  return near.find((s) => s.cx <= fan.cx && s.cy >= fan.cy) ?? near[0] ?? screws[0];
}

// A short interior horizontal dimension between two x positions at a given y.
function simpleDimH(out: Shape[], xA: number, xB: number, y: number, label: string): void {
  out.push(annPath([{ x: xA, y }, { x: xB, y }]));
  arrowHead(out, xA, y, xB >= xA ? DIM_ARROW_MM : -DIM_ARROW_MM, 0);
  arrowHead(out, xB, y, xB >= xA ? -DIM_ARROW_MM : DIM_ARROW_MM, 0);
  out.push(annText((xA + xB) / 2, y - DIM_COORD_TEXT_MM * 0.7, label, DIM_COORD_TEXT_MM));
}

// A short interior vertical dimension between two y positions at a given x.
function simpleDimV(out: Shape[], yA: number, yB: number, x: number, label: string): void {
  out.push(annPath([{ x, y: yA }, { x, y: yB }]));
  arrowHead(out, x, yA, 0, yB >= yA ? DIM_ARROW_MM : -DIM_ARROW_MM);
  arrowHead(out, x, yB, 0, yB >= yA ? -DIM_ARROW_MM : DIM_ARROW_MM);
  out.push(annText(x + DIM_COORD_TEXT_MM * 1.6, (yA + yB) / 2, label, DIM_COORD_TEXT_MM));
}

// A diameter callout: a vertical leader from the bore's bottom edge down to a label
// in the bottom margin, with an arrowhead pointing back up to the bore.
function diameterLeaderDown(out: Shape[], x: number, boreBottomY: number, labelY: number, label: string): void {
  out.push(annPath([{ x, y: boreBottomY }, { x, y: labelY }]));
  arrowHead(out, x, boreBottomY, 0, DIM_ARROW_MM);
  out.push(annText(x, labelY + DIM_COORD_TEXT_MM, label, DIM_COORD_TEXT_MM));
}

function countPrefix(count: number): string {
  return count > 1 ? `${count}× ` : "";
}

function uniqueRounded(values: readonly number[]): number[] {
  const seen: number[] = [];
  for (const value of values) {
    const r = Math.round(value);
    if (!seen.some((existing) => Math.abs(existing - r) <= 1)) {
      seen.push(r);
    }
  }
  return seen.sort((a, b) => a - b);
}

// A coordinate dimension above the panel: from the left datum (xDatum) to xTarget,
// stacked at `level` (1 = nearest the part). Extension lines drop to the part.
function coordDimAbove(out: Shape[], xDatum: number, xTarget: number, yTop: number, level: number, label: string, textSize: number): void {
  const yd = yTop - DIM_OFFSET_MM - (level - 1) * DIM_STEP_MM;
  out.push(annPath([{ x: xDatum, y: yTop - DIM_EXT_GAP_MM }, { x: xDatum, y: yd - DIM_EXT_OVER_MM }]));
  out.push(annPath([{ x: xTarget, y: yTop - DIM_EXT_GAP_MM }, { x: xTarget, y: yd - DIM_EXT_OVER_MM }]));
  out.push(annPath([{ x: xDatum, y: yd }, { x: xTarget, y: yd }]));
  arrowHead(out, xDatum, yd, DIM_ARROW_MM, 0);
  arrowHead(out, xTarget, yd, -DIM_ARROW_MM, 0);
  out.push(annText((xDatum + xTarget) / 2, yd - textSize * 0.7, label, textSize));
}

// A coordinate dimension to the left of the panel: from the top datum (yDatum) to
// yTarget, stacked at `level`. The value sits just left of the dimension line.
function coordDimLeft(out: Shape[], yDatum: number, yTarget: number, xLeft: number, level: number, label: string, textSize: number): void {
  const xd = xLeft - DIM_OFFSET_MM - (level - 1) * DIM_STEP_MM;
  out.push(annPath([{ x: xLeft - DIM_EXT_GAP_MM, y: yDatum }, { x: xd - DIM_EXT_OVER_MM, y: yDatum }]));
  out.push(annPath([{ x: xLeft - DIM_EXT_GAP_MM, y: yTarget }, { x: xd - DIM_EXT_OVER_MM, y: yTarget }]));
  out.push(annPath([{ x: xd, y: yDatum }, { x: xd, y: yTarget }]));
  arrowHead(out, xd, yDatum, 0, DIM_ARROW_MM);
  arrowHead(out, xd, yTarget, 0, -DIM_ARROW_MM);
  out.push(annText(xd - DIM_STEP_MM * 0.5, (yDatum + yTarget) / 2, label, textSize));
}

// An arrowhead whose tip is at (xTip, yTip); (bx, by) is the barb offset back from
// the tip along the dimension line (one axis zero). Drawn as a small open V.
function arrowHead(out: Shape[], xTip: number, yTip: number, bx: number, by: number): void {
  if (bx !== 0) {
    out.push(annPath([{ x: xTip + bx, y: yTip - DIM_ARROW_MM }, { x: xTip, y: yTip }, { x: xTip + bx, y: yTip + DIM_ARROW_MM }]));
  } else {
    out.push(annPath([{ x: xTip - DIM_ARROW_MM, y: yTip + by }, { x: xTip, y: yTip }, { x: xTip + DIM_ARROW_MM, y: yTip + by }]));
  }
}

// #######################################
// Finger Hole Cuts
// #######################################

// Faithful port of boxes.py FingerHoles.__call__: rectangular holes a mating
// "f" edge's fingers pass through. One hole per finger, at the same leftover-
// centred positions (leftover/2 + i*(space+finger)), sized finger x thickness
// (plus play). (x, y) is the start of the hole row; angle 90 runs the row along
// +y, angle 0 along +x.
export function fingerHoleCutsAt(
  x: number,
  y: number,
  length: number,
  angle: 0 | 90,
  thickness: number,
  kerfFit = 0,
  jointSettings: CutJointSettings = defaultCutJointSettings,
): RectCut[] {
  const settings = jointSettings.finger;
  const { fingers, leftover } = calcFingers(length, thickness, settings);
  const space = settings.spaceMultiplier * thickness;
  const finger = settings.widthMultiplier * thickness;
  const play = settings.playMultiplier * thickness;
  const alongHole = finger + play; // hole size along the edge
  const acrossHole = settings.holeWidthMultiplier * thickness + play; // perpendicular depth
  const cuts: RectCut[] = [];
  for (let index = 0; index < fingers; index += 1) {
    const center = leftover / 2 + index * (space + finger) + finger / 2;
    if (angle === 90) {
      cuts.push(
        shrinkRectCut(
          { type: "rect", x: x - acrossHole / 2, y: y + center - alongHole / 2, width: acrossHole, height: alongHole, radius: 0, role: "finger-hole" },
          kerfFit,
        ),
      );
    } else {
      cuts.push(
        shrinkRectCut(
          { type: "rect", x: x + center - alongHole / 2, y: y - acrossHole / 2, width: alongHole, height: acrossHole, radius: 0, role: "finger-hole" },
          kerfFit,
        ),
      );
    }
  }
  return cuts;
}

// Minimum distance between two axis-aligned rectangles; negative when they
// overlap. Used to detect (and remove) finger-hole rows that would collide with
// an edge's finger-hole column.
function rectGap(a: RectCut, b: RectCut): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  return overlap ? -1 : Math.hypot(dx, dy);
}

// boxes.py FingerHoleEdge: for every "finger-holes" ("h") section on an edge,
// cut the rectangular holes the mating "f" fingers pass through, set in from the
// edge by edge_width + thickness/2. Holes run along that edge section so they
// line up with the perpendicular wall's fingers over the same length.
function createFingerHoleCutsForEdges(
  width: number,
  height: number,
  edges: RectangularPanelInput["edges"],
  thickness: number,
  kerfFit: number,
  jointSettings: CutJointSettings,
  outsets: readonly number[] = [0, 0, 0, 0],
): CutFeature[] {
  const cuts: CutFeature[] = [];
  const offset = (jointSettings.finger.holeOffsetMultiplier + 0.5) * thickness;
  const edgeLengths = [width, height, width, height];
  // boxes.py drills the FingerHoleEdge holes edge_width+t/2 in from the *drawn*
  // edge, which sits `outset` beyond the nominal rectangle, so push the holes out
  // by the edge's outset to keep them aligned with the mating wall's fingers.
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const sections = edges[edgeIndex];
    const o = outsets[edgeIndex] ?? 0;
    const totalSpecified = sections.reduce((sum, section) => sum + section.length, 0);
    const normalized =
      totalSpecified > 0 ? sections : sections.map((section) => ({ ...section, length: edgeLengths[edgeIndex] }));
    let cursor = 0;
    for (const section of normalized) {
      const length = section.length;
      if (section.kind === "finger-holes") {
        if (edgeIndex === 0) {
          cuts.push(...fingerHoleCutsAt(cursor, offset - o, length, 0, thickness, kerfFit, jointSettings));
        } else if (edgeIndex === 1) {
          cuts.push(...fingerHoleCutsAt(width - offset + o, cursor, length, 90, thickness, kerfFit, jointSettings));
        } else if (edgeIndex === 2) {
          cuts.push(...fingerHoleCutsAt(width - cursor - length, height - offset + o, length, 0, thickness, kerfFit, jointSettings));
        } else {
          cuts.push(...fingerHoleCutsAt(offset - o, height - cursor - length, length, 90, thickness, kerfFit, jointSettings));
        }
      }
      cursor += length;
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
  // boxes.py rectangularWall reserves edges[i].spacing() = startWidth()+margin()
  // outside the inner rectangle on each edge, so the part grows perpendicular to
  // every non-plain edge: OutSetEdge "E" and FingerJoint counterpart "F" by one
  // thickness, FingerHoleEdge "h" by edge_width(=t)+t = 2t. Finger "f" and
  // dovetail "d" already reach outward via their drawn profiles, so their extra
  // perpendicular reach is 0 here (counted by the profile). Order: [bottom,right,top,left].
  const outsets = [0, 1, 2, 3].map((i) => edgeOutset(input.edges[i], input.thickness));
  const points: CutPoint[] = [{ x: -outsets[3], y: -outsets[0] }];

  input.edges.forEach((sections, edgeIndex) => {
    const direction = directions[edgeIndex];
    const totalSpecifiedLength = sections.reduce((sum, section) => sum + section.length, 0);
    const normalizedSections =
      totalSpecifiedLength > 0
        ? sections
        : sections.map((section) => ({ ...section, length: fallbackLengths[edgeIndex] }));

    // Plain corner runs of the neighbouring edges' outsets, so the four edges
    // meet at the outset-expanded corners (boxes.py's spacing() straight bits).
    const startSpacer = outsets[(edgeIndex + 3) % 4];
    const endSpacer = outsets[(edgeIndex + 1) % 4];
    if (startSpacer > 0) appendLine(points, moveBy(lastPoint(points), direction.axis, startSpacer));
    for (const section of normalizedSections) {
      appendEdgeSection(points, section.kind, section.length, direction, input.thickness, jointSettings);
    }
    if (endSpacer > 0) appendLine(points, moveBy(lastPoint(points), direction.axis, endSpacer));
  });

  removeClosingDuplicate(points);
  return points;
}

// Perpendicular outset (boxes.py edge.startWidth()) the part gains on the side of
// this edge. Taken as the max across the edge's sections so a CompoundEdge uses
// its outset-bearing parts (e.g. "EFE" -> t). Finger/dovetail/plain add nothing.
function edgeOutset(sections: readonly EdgeSection[], thickness: number): number {
  let outset = 0;
  for (const section of sections) {
    if (section.kind === "finger-holes") outset = Math.max(outset, 2 * thickness);
    else if (section.kind === "finger-counter" || section.kind === "plain-outset") outset = Math.max(outset, thickness);
  }
  return outset;
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
    // boxes.py FingerJointEdge "f": fingers protrude outward.
    appendFingerProfile(points, length, direction, thickness, jointSettings.finger, true);
    return;
  }
  if (kind === "finger-counter") {
    // boxes.py FingerJointEdgeCounterPart "F": the same fingers cut INWARD, with
    // play added, so an "f" finger seats into this "F" notch.
    appendFingerProfile(points, length, direction, thickness, jointSettings.finger, false);
    return;
  }
  if (kind === "finger-holes") {
    // boxes.py FingerHoleEdge "h": a plain straight edge; the mating "f" fingers
    // pass through rectangular holes cut into the panel face (added in
    // createFingerHoleCutsForEdges), which is what removes material at the joint.
    appendLine(points, moveBy(lastPoint(points), direction.axis, length));
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

// Faithful port of boxes.py FingerJointEdge.__call__ (florianfesti/boxes).
// `positive` true = the "f" edge (fingers protrude outward); false = the "F"
// counterpart (the same fingers cut inward, with play). The edge runs:
//   leftover/2, [finger, space, finger, space, ..., finger], leftover/2
// with fingers protruding (or recessed) by one material thickness.
function appendFingerProfile(
  points: CutPoint[],
  length: number,
  direction: EdgeDirection,
  thickness: number,
  settings: FingerJointSettings,
  positive: boolean,
): void {
  let { fingers, leftover } = calcFingers(length, thickness, settings);
  let space = settings.spaceMultiplier * thickness;
  let finger = settings.widthMultiplier * thickness;
  const play = settings.playMultiplier * thickness;
  const depth = thickness; // finger length at a 90deg corner (extra_length = 0)

  // boxes.py: too small for normal fingers -> one centred rectangular finger.
  if (fingers === 0 && finger > 0 && leftover > 0.75 * thickness && leftover > 4 * play) {
    fingers = 1;
    finger = leftover = leftover / 2;
  }
  // boxes.py: the counterpart grows the finger / shrinks the space by the play.
  if (!positive) {
    finger += play;
    space -= play;
    leftover -= play;
  }
  const step = positive ? depth : -depth;

  appendLine(points, moveBy(lastPoint(points), direction.axis, leftover / 2));
  for (let index = 0; index < fingers; index += 1) {
    if (index !== 0) {
      appendLine(points, moveBy(lastPoint(points), direction.axis, space));
    }
    appendStep(points, direction.outward, step);
    appendLine(points, moveBy(lastPoint(points), direction.axis, finger));
    appendStep(points, direction.outward, -step);
  }
  appendLine(points, moveBy(lastPoint(points), direction.axis, leftover / 2));
}

// Faithful port of boxes.py DoveTailJoint.__call__ (florianfesti/boxes). The
// path is turtle graphics: edge(d) goes forward d; corner(deg, r) rounds the
// turn with radius r. We run it in a local (u = along axis, v = outward) frame
// using boxes.py's exact math, then map each vertex through the edge basis so
// the handedness of our outline is absorbed automatically. polarity +1 = "d"
// (tails stick out), -1 = "D" counterpart (sockets cut in). radius is boxes.py's
// DoveTailSettings default (0.2 * thickness); kerf is applied to the whole
// outline separately, mirroring boxes.py's burn offset.
function appendDovetailProfile(
  points: CutPoint[],
  length: number,
  direction: EdgeDirection,
  thickness: number,
  settings: DovetailJointSettings,
  polarity: 1 | -1,
): void {
  const size = settings.sizeMultiplier * thickness;
  const depth = settings.depthMultiplier * thickness;
  const radius = Math.max(0.2 * thickness, 1e-4);
  const angle = settings.taper;
  const a = angle + 90;
  const alpha = Math.PI / 2 - (Math.PI * angle) / 180;
  const l1 = radius / Math.tan(alpha / 2);
  const diffx = (0.5 * depth) / Math.tan(alpha);
  const l2 = (0.5 * depth) / Math.sin(alpha);
  const sections = Math.floor(length / (size * 2));
  const leftover = length - sections * size * 2;

  const start = lastPoint(points);
  if (sections === 0) {
    appendLine(points, moveBy(start, direction.axis, length));
    return;
  }

  const p = polarity === 1 ? 1 : -1;
  let u = 0;
  let v = 0;
  let phi = 0; // heading in the local frame; 0 = along the edge axis
  const emit = (): void => {
    // Our (axis, outward) basis is left-handed (outward is 90deg CW of axis),
    // while boxes.py's turtle math is right-handed (outward 90deg CCW). Map the
    // local outward coordinate through -outward so a positive "d" tail protrudes
    // OUT of the part and the "D" counterpart recesses IN, as boxes.py intends.
    points.push({
      x: start.x + u * direction.axis.x - v * direction.outward.x,
      y: start.y + u * direction.axis.y - v * direction.outward.y,
    });
  };
  const edge = (distance: number): void => {
    u += distance * Math.cos(phi);
    v += distance * Math.sin(phi);
    emit();
  };
  const corner = (degrees: number, r: number): void => {
    const rad = (degrees * Math.PI) / 180;
    if (r > 1e-9 && Math.abs(rad) > 1e-9) {
      const side = Math.sign(rad);
      const cx = u + r * Math.cos(phi + (side * Math.PI) / 2);
      const cy = v + r * Math.sin(phi + (side * Math.PI) / 2);
      const a0 = Math.atan2(v - cy, u - cx);
      const steps = Math.max(2, Math.ceil(Math.abs(rad) / (Math.PI / 16)));
      for (let k = 1; k <= steps; k += 1) {
        const ang = a0 + rad * (k / steps);
        u = cx + r * Math.cos(ang);
        v = cy + r * Math.sin(ang);
        emit();
      }
    }
    phi += rad;
  };

  edge((size + leftover) / 2 + diffx - l1);
  for (let i = 0; i < sections; i += 1) {
    corner(-p * a, radius);
    edge(2 * (l2 - l1));
    corner(p * a, radius);
    edge(2 * (diffx - l1) + size);
    corner(p * a, radius);
    edge(2 * (l2 - l1));
    corner(-p * a, radius);
    if (i < sections - 1) {
      edge(2 * (diffx - l1) + size);
    }
  }
  edge((size + leftover) / 2 + diffx - l1);
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

// Faithful port of boxes.py FingerJointBase.calcFingers: how many fingers fit on
// an edge of the given length, and the leftover space split evenly at both ends.
// Uses fixed finger/space widths (multiples of thickness) with surroundingspaces
// = 2, so an edge of length L1 and a matching hole row of the same length always
// land on the same positions — which is what makes the joints actually mesh.
function calcFingers(
  length: number,
  thickness: number,
  settings: FingerJointSettings,
): { fingers: number; leftover: number } {
  const space = settings.spaceMultiplier * thickness;
  const finger = settings.widthMultiplier * thickness;
  const surroundingSpaces = 2;
  let fingers = finger > 0 ? Math.floor((length - (surroundingSpaces - 1) * space) / (space + finger)) : 0;
  if (fingers === 0 && finger > 0 && length > finger + thickness) {
    fingers = 1;
  }
  let leftover = length - fingers * (space + finger) + space;
  if (fingers <= 0) {
    fingers = 0;
    leftover = length;
  }
  return { fingers, leftover };
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

// A honeycomb of hex holes filling the fan bore — the laser equivalent of the
// 3D-print hexGrill2d. With fullCellsOnly the bore keeps only whole hexes (no
// rim slivers); otherwise straddling hexes are clipped to the bore circle so the
// honeycomb reaches the edge, matching the 3D-print grill.
export function hexGrillHoles(cx: number, cy: number, boreRadius: number, spec: GrillSpec): CutPoint[][] {
  const hexFlatToFlat = Math.max(0.5, spec.hexFlatToFlat);
  const rib = Math.max(0.1, spec.ribThickness);
  const hexRadius = hexFlatToFlat / Math.sqrt(3); // centre-to-vertex
  const pitchX = hexFlatToFlat + rib;
  const pitchY = (pitchX * Math.sqrt(3)) / 2;
  if (boreRadius <= 0) {
    return [];
  }
  const columnCount = Math.ceil((boreRadius * 2) / pitchX) + 2;
  const rowCount = Math.ceil((boreRadius * 2) / pitchY) + 2;
  const holes: CutPoint[][] = [];
  for (let row = -rowCount; row <= rowCount; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : pitchX / 2;
    for (let column = -columnCount; column <= columnCount; column += 1) {
      const x = column * pitchX + rowOffset;
      const y = row * pitchY;
      const distance = Math.hypot(x, y);
      const hex = hexPolygon(cx + x, cy + y, hexRadius);
      if (distance + hexRadius <= boreRadius) {
        holes.push(hex); // wholly inside
        continue;
      }
      if (spec.fullCellsOnly || distance - hexRadius >= boreRadius) {
        continue; // full-cells mode drops straddlers; either mode drops outside
      }
      const clipped = clipPolygonToCircle(hex, cx, cy, boreRadius);
      if (clipped.length >= 3) {
        holes.push(clipped);
      }
    }
  }
  return holes;
}

function hexPolygon(cx: number, cy: number, radius: number): CutPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index + 30);
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
}

// Sutherland–Hodgman clip of a convex polygon against a circle, approximating the
// circle as a 48-gon (the same order the SVG uses for round bores). Used to trim
// hexes that straddle the bore edge into partial cells.
function clipPolygonToCircle(poly: CutPoint[], cx: number, cy: number, radius: number): CutPoint[] {
  const segments = 48;
  let output = poly;
  for (let index = 0; index < segments && output.length > 0; index += 1) {
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = ((index + 1) / segments) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * radius;
    const y0 = cy + Math.sin(a0) * radius;
    const x1 = cx + Math.cos(a1) * radius;
    const y1 = cy + Math.sin(a1) * radius;
    output = clipAgainstEdge(output, x0, y0, x1, y1);
  }
  return output;
}

// Keep the part of `poly` on the inside (left) of the directed edge (x0,y0)->(x1,y1).
function clipAgainstEdge(poly: CutPoint[], x0: number, y0: number, x1: number, y1: number): CutPoint[] {
  const inside = (p: CutPoint) => (x1 - x0) * (p.y - y0) - (y1 - y0) * (p.x - x0) >= 0;
  const intersect = (a: CutPoint, b: CutPoint): CutPoint => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denom = (x1 - x0) * dy - (y1 - y0) * dx;
    const t = denom === 0 ? 0 : ((x1 - x0) * (a.y - y0) - (y1 - y0) * (a.x - x0)) / -denom;
    return { x: a.x + t * dx, y: a.y + t * dy };
  };
  const out: CutPoint[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const current = poly[i];
    const previous = poly[(i + poly.length - 1) % poly.length];
    const currentIn = inside(current);
    const previousIn = inside(previous);
    if (currentIn) {
      if (!previousIn) {
        out.push(intersect(previous, current));
      }
      out.push(current);
    } else if (previousIn) {
      out.push(intersect(previous, current));
    }
  }
  return out;
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
  if (char === "e") {
    return "plain";
  }
  // boxes.py OutSetEdge: a straight edge set out by one thickness (startWidth = t).
  if (char === "E") {
    return "plain-outset";
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
