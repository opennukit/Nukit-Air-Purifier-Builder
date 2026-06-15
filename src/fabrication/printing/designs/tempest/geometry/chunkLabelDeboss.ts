import type { GeometryContext } from "./context";
import { unionAll, unionAll2d } from "./primitives";
import { renderLabel } from "./labelFont";
import type { ChunkSeamLabel, SeamAxis } from "./chunkLabels";

// #######################################
// Chunk/Seam Code Deboss (CSG)
// #######################################

// Engraves each seam's two-letter code into the chunk's inner wall surface near
// that seam, so glued pieces are easy to match. Works on the posed, per-chunk
// solid (so "up" is +z). The engraving is hole-safe by construction: it is the
// intersection of a glyph prism with a 1 mm "shell" peeled off the chamber-facing
// surfaces of the actual chunk, then subtracted — it can only cut where solid
// material exists, never bridging a window or gap.

export type ChunkLabelDebossOptions = {
  readonly capHeight: number; // text height, mm
  readonly depth: number; // deboss depth, mm
};

// A posed alignment-pin site (printableKit frame). Pins sit on solid material
// clear of holes, so they are reliable anchors for "where is there a wall to
// engrave near this seam" — far more robust than the geometric cell centre,
// which often lands in an open filter window.
export type SeamPinAnchor = {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly axis: SeamAxis;
};

function coord(p: { x: number; y: number; z: number }, axis: SeamAxis): number {
  return axis === "x" ? p.x : axis === "y" ? p.y : p.z;
}

// The pins lying on this seam, in the chunk's face rectangle.
function pinsOnSeam(seam: ChunkSeamLabel, pins: readonly SeamPinAnchor[]): SeamPinAnchor[] {
  const [uAxis, vAxis] = faceAxes(seam.axis);
  return pins.filter(
    (pin) =>
      pin.axis === seam.axis &&
      Math.abs(coord(pin.position, seam.axis) - seam.boundary) < 1.0 &&
      coord(pin.position, uAxis) >= seam.faceMin[0] - 1 &&
      coord(pin.position, uAxis) <= seam.faceMax[0] + 1 &&
      coord(pin.position, vAxis) >= seam.faceMin[1] - 1 &&
      coord(pin.position, vAxis) <= seam.faceMax[1] + 1,
  );
}


// How far inside the seam the engraving band reaches. The near limit clears the
// seam (mating) face so the code never lands on the glued joint; the far limit
// stays short of the opposite wall of a normal-sized chunk so only the wall by
// the seam is engraved.
const BAND_NEAR_MM = 1.2;
const BAND_FAR_MM = 16;
// The cut pokes this far past the wall surface into the chamber so its outer face
// is never coincident with the wall (which would be non-manifold).
const SURFACE_OUTSET_MM = 0.1;
// Where up the wall the code sits, as a fraction of the wall's pin span. Low
// enough to stay in the solid band above the filter flange and below the fan
// holes (which cluster around the wall's vertical centre).
const CODE_BAND_FRACTION = 0.3;

const AXIS_INDEX: Readonly<Record<SeamAxis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };

// The 2D label outline as a single Region (union of all glyph loops), centred on
// the origin so callers position it by its midpoint.
function centredLabelRegion<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  code: string,
  capHeight: number,
  mirror: boolean,
): { region: Region; width: number; height: number } | null {
  const rendered = renderLabel(code, capHeight);
  if (rendered.loops.length === 0) {
    return null;
  }
  const halfW = rendered.width / 2;
  const halfH = rendered.height / 2;
  // `mirror` flips the glyphs left-right so the code reads correctly when viewed
  // from inside the chamber (the engraved face points at the viewer, so without
  // this the text comes out backwards for half the wall orientations).
  const sx = mirror ? -1 : 1;
  const polys = rendered.loops.map((loop) =>
    ctx.modeling.primitives.polygon({ points: loop.map(([x, y]) => [sx * (x - halfW), y - halfH]) }),
  );
  return { region: unionAll2d(ctx, polys), width: rendered.width, height: rendered.height };
}

// Orient a glyph solid that was extruded along +z (width = x, height = y, depth =
// z) so its depth runs along the seam axis and its height stays world-up (+z).
function orientToSeamAxis<Solid, Region>(ctx: GeometryContext<Solid, Region>, axis: SeamAxis, solid: Solid): Solid {
  const { transforms } = ctx.modeling;
  if (axis === "z") {
    return solid; // width->x, height->y, depth->z
  }
  if (axis === "y") {
    return transforms.rotateX(-Math.PI / 2, solid); // height y->z, depth z->-y
  }
  // axis === "x": depth z->x, height y->z, width x->y
  return transforms.rotateZ(Math.PI / 2, transforms.rotateX(-Math.PI / 2, solid));
}

// The chamber-facing wall a seam's code is engraved on, plus the pins lying on it
// (which mark its solid, hole-free regions).
type WallTarget = {
  readonly e: SeamAxis; // wall normal axis
  readonly wallPlane: number; // wall position along e (assembly frame)
  readonly chamberSign: 1 | -1; // direction from wall toward the chamber
  readonly wAxis: SeamAxis; // in-wall horizontal axis
  readonly hAxis: SeamAxis; // in-wall vertical axis (z)
  readonly wallPins: readonly SeamPinAnchor[];
};

// Pick the chamber-facing wall for a seam: a vertical wall perpendicular to `e`.
// Pins sit on walls, so each pin's e-coordinate IS a wall plane; two side walls
// cross the seam — the OUTER wall (inner face looks into a filter slot) and the
// inner STRUCTURAL wall bounding the air chamber. We want the latter, i.e. the
// side-region pin farthest from the outer face.
function wallTargetForSeam(
  seam: ChunkSeamLabel,
  pins: readonly SeamPinAnchor[],
  modelCenter: readonly [number, number, number],
): WallTarget | null {
  const seamPins = pinsOnSeam(seam, pins);
  if (seamPins.length === 0) {
    return null;
  }
  const e: SeamAxis = seam.axis === "y" ? "x" : "y";
  const extentE = 2 * modelCenter[AXIS_INDEX[e]];
  const distToOuter = (p: { x: number; y: number; z: number }) => Math.min(coord(p, e), extentE - coord(p, e));
  const sideBand = 0.3 * extentE;
  const sidePins = seamPins.filter((p) => distToOuter(p.position) <= sideBand);
  const candidates = sidePins.length > 0 ? sidePins : seamPins;
  const wallPlane = [...candidates].sort((a, b) => distToOuter(b.position) - distToOuter(a.position))[0].position;
  const plane = coord(wallPlane, e);
  const chamberSign: 1 | -1 = modelCenter[AXIS_INDEX[e]] - plane >= 0 ? 1 : -1;
  const [wAxis, hAxis] = faceAxes(e);
  const wallPins = candidates.filter((p) => Math.abs(coord(p.position, e) - plane) < 3);
  return { e, wallPlane: plane, chamberSign, wAxis, hAxis, wallPins };
}

function wallKey(t: WallTarget): string {
  return `${t.e}:${Math.round(t.wallPlane)}:${t.chamberSign}`;
}

// Mirror the glyphs when the wall's width axis runs opposite the viewer's right
// (viewer inside the chamber, look = -chamberNormal, up = +z, right = look × up).
function wallNeedsMirror(t: WallTarget): boolean {
  const look: [number, number, number] = [0, 0, 0];
  look[AXIS_INDEX[t.e]] = -t.chamberSign;
  const right: [number, number, number] = [look[1], -look[0], 0]; // cross(look, +z)
  return right[AXIS_INDEX[t.wAxis]] < 0;
}

function faceAxes(axis: SeamAxis): readonly [SeamAxis, SeamAxis] {
  if (axis === "x") {
    return ["y", "z"];
  }
  if (axis === "y") {
    return ["x", "z"];
  }
  return ["x", "y"];
}

// Engrave every supplied seam code into the chunk and return the engraved solid.
// The clipped chunk solid is positioned at the origin (moved off its assembly
// cell), so the seam/pin/centre coordinates — which are in the assembly frame —
// are shifted into the chunk's local frame by `origin` (the cell's assembly
// min-corner) before any tool is built.
export function debossChunkSeamLabels<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  chunk: Solid,
  seams: readonly ChunkSeamLabel[],
  pins: readonly SeamPinAnchor[],
  modelCenter: readonly [number, number, number],
  origin: readonly [number, number, number],
  options: ChunkLabelDebossOptions,
): Solid {
  // Group the chunk's seams by the chamber wall they target so several codes on
  // one wall can be laid out side by side instead of stacking on top of each other.
  const groups = new Map<string, { target: WallTarget; seams: ChunkSeamLabel[] }>();
  for (const seam of seams) {
    const target = wallTargetForSeam(seam, pins, modelCenter);
    if (target === null) {
      continue;
    }
    const key = wallKey(target);
    const group = groups.get(key) ?? { target, seams: [] };
    group.seams.push(seam);
    groups.set(key, group);
  }

  const cuts: Solid[] = [];
  for (const { target, seams: wallSeams } of groups.values()) {
    cuts.push(...wallDebossCuts(ctx, chunk, target, wallSeams, origin, options));
  }
  if (cuts.length === 0) {
    return chunk;
  }
  return ctx.modeling.booleans.subtract(chunk, unionAll(ctx, cuts));
}

// Lay one wall's codes out centred horizontally on the wall and spread apart so
// they never overlap, sitting in the solid band above the filter flange / below
// the fan holes (the pins on the wall mark that band).
function wallDebossCuts<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  chunk: Solid,
  target: WallTarget,
  wallSeams: readonly ChunkSeamLabel[],
  origin: readonly [number, number, number],
  options: ChunkLabelDebossOptions,
): Solid[] {
  const { transforms, extrusions, booleans } = ctx.modeling;
  const mirror = wallNeedsMirror(target);
  const built = wallSeams
    .map((seam) => centredLabelRegion(ctx, seam.code, options.capHeight, mirror))
    .filter((b): b is NonNullable<typeof b> => b !== null);
  if (built.length === 0) {
    return [];
  }

  // Wall span from its pins: horizontal centre, and the solid band height (low on
  // the wall, clear of the fan holes that sit around the wall's vertical centre).
  const ws = target.wallPins.map((p) => coord(p.position, target.wAxis));
  const zs = target.wallPins.map((p) => p.position.z);
  const wMid = (Math.min(...ws) + Math.max(...ws)) / 2;
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const vCenter = zMin + (zMax - zMin) * CODE_BAND_FRACTION;

  const gap = options.capHeight * 0.6;
  const totalWidth = built.reduce((sum, b) => sum + b.width, 0) + gap * (built.length - 1);

  // One shell per wall (shared by every code on it).
  const worldChunk = transforms.translate([origin[0], origin[1], origin[2]], chunk);
  const shellShift: [number, number, number] = [0, 0, 0];
  shellShift[AXIS_INDEX[target.e]] = -target.chamberSign * options.depth;
  const shell = booleans.subtract(worldChunk, transforms.translate(shellShift, worldChunk));

  const band = BAND_FAR_MM - BAND_NEAR_MM;
  const cuts: Solid[] = [];
  let cursor = wMid - totalWidth / 2;
  for (const b of built) {
    const wPos = cursor + b.width / 2;
    cursor += b.width + gap;

    const prismLocal = transforms.translate([0, 0, -band / 2], extrusions.extrudeLinear({ height: band }, b.region));
    const prismOriented = orientToSeamAxis(ctx, target.e, prismLocal);
    const place: [number, number, number] = [0, 0, 0];
    place[AXIS_INDEX[target.e]] = target.wallPlane;
    place[AXIS_INDEX[target.wAxis]] = wPos;
    place[AXIS_INDEX[target.hAxis]] = vCenter;
    const prism = transforms.translate(place, prismOriented);

    const outset: [number, number, number] = [0, 0, 0];
    outset[AXIS_INDEX[target.e]] = target.chamberSign * SURFACE_OUTSET_MM;
    const worldCut = transforms.translate(outset, booleans.intersect(prism, shell));
    cuts.push(transforms.translate([-origin[0], -origin[1], -origin[2]], worldCut));
  }
  return cuts;
}
