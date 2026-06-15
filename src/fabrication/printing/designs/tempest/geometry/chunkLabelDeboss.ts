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

const AXIS_INDEX: Readonly<Record<SeamAxis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };

// The 2D label outline as a single Region (union of all glyph loops), centred on
// the origin so callers position it by its midpoint.
function centredLabelRegion<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  code: string,
  capHeight: number,
): { region: Region; width: number; height: number } | null {
  const rendered = renderLabel(code, capHeight);
  if (rendered.loops.length === 0) {
    return null;
  }
  const halfW = rendered.width / 2;
  const halfH = rendered.height / 2;
  const polys = rendered.loops.map((loop) =>
    ctx.modeling.primitives.polygon({ points: loop.map(([x, y]) => [x - halfW, y - halfH]) }),
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

// Build one seam's deboss tool. The code is engraved on a chamber-facing inner
// wall near the seam: we anchor on a low alignment pin (guaranteed solid, clear
// of holes), face the model interior (so it reads from inside), and peel a 1 mm
// shell off that inward-facing surface (hole-safe — it can only cut real wall).
function seamDebossCut<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  chunk: Solid,
  seam: ChunkSeamLabel,
  pins: readonly SeamPinAnchor[],
  modelCenter: readonly [number, number, number],
  options: ChunkLabelDebossOptions,
): Solid | null {
  const seamPins = pinsOnSeam(seam, pins);
  if (seamPins.length === 0) {
    return null;
  }
  const built = centredLabelRegion(ctx, seam.code, options.capHeight);
  if (built === null) {
    return null;
  }
  const { transforms, extrusions, booleans } = ctx.modeling;

  // Engrave on a vertical wall perpendicular to `e`. Pins sit on walls, so each
  // pin's e-coordinate IS a wall plane; we anchor on the low pin nearest an outer
  // face, which lands the code on the solid bottom rail of an outer/structural
  // wall — the seam-adjacent outer wall is otherwise mostly open filter window.
  const e: SeamAxis = seam.axis === "y" ? "x" : "y";
  const extentE = 2 * modelCenter[AXIS_INDEX[e]];
  const distToOuter = (p: { x: number; y: number; z: number }) => Math.min(coord(p, e), extentE - coord(p, e));
  const anchor = [...seamPins].sort(
    (a, b) => distToOuter(a.position) + 0.5 * a.position.z - (distToOuter(b.position) + 0.5 * b.position.z),
  )[0].position;
  const chamberSign = modelCenter[AXIS_INDEX[e]] - coord(anchor, e) >= 0 ? 1 : -1;

  const band = BAND_FAR_MM - BAND_NEAR_MM;
  const prismLocal = transforms.translate([0, 0, -band / 2], extrusions.extrudeLinear({ height: band }, built.region));
  const prismOriented = orientToSeamAxis(ctx, e, prismLocal); // width->faceAxes(e)[0], height->z, depth->e

  const [wAxis, hAxis] = faceAxes(e);
  const place: [number, number, number] = [0, 0, 0];
  place[AXIS_INDEX[e]] = coord(anchor, e); // band straddles the wall at the pin
  // Width: hug the seam when the width axis is the seam normal, else sit on the pin.
  place[AXIS_INDEX[wAxis]] =
    wAxis === seam.axis ? seam.boundary - seam.towardNeighbour * (built.width / 2 + 2) : coord(anchor, wAxis);
  // Height: baseline just above the anchor (near the floor / bottom rail).
  place[AXIS_INDEX[hAxis]] = coord(anchor, "z") + options.capHeight / 2;
  const prism = transforms.translate(place, prismOriented);

  const shellShift: [number, number, number] = [0, 0, 0];
  shellShift[AXIS_INDEX[e]] = -chamberSign * options.depth;
  const shell = booleans.subtract(chunk, transforms.translate(shellShift, chunk));

  // Nudge the cut a hair into the chamber (outward) so its outer face does not
  // sit exactly on the wall surface; a coincident face there can leave a single
  // over-shared edge (non-manifold) after the subtraction.
  const outset: [number, number, number] = [0, 0, 0];
  outset[AXIS_INDEX[e]] = chamberSign * SURFACE_OUTSET_MM;
  return transforms.translate(outset, booleans.intersect(prism, shell));
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
  const localPins: SeamPinAnchor[] = pins.map((pin) => ({
    axis: pin.axis,
    position: { x: pin.position.x - origin[0], y: pin.position.y - origin[1], z: pin.position.z - origin[2] },
  }));
  const localCenter: [number, number, number] = [
    modelCenter[0] - origin[0],
    modelCenter[1] - origin[1],
    modelCenter[2] - origin[2],
  ];
  const cuts: Solid[] = [];
  for (const seam of seams) {
    const localSeam: ChunkSeamLabel = {
      ...seam,
      boundary: seam.boundary - origin[AXIS_INDEX[seam.axis]],
      faceMin: [seam.faceMin[0] - origin[AXIS_INDEX[faceAxes(seam.axis)[0]]], seam.faceMin[1] - origin[AXIS_INDEX[faceAxes(seam.axis)[1]]]],
      faceMax: [seam.faceMax[0] - origin[AXIS_INDEX[faceAxes(seam.axis)[0]]], seam.faceMax[1] - origin[AXIS_INDEX[faceAxes(seam.axis)[1]]]],
    };
    const cut = seamDebossCut(ctx, chunk, localSeam, localPins, localCenter, options);
    if (cut !== null) {
      cuts.push(cut);
    }
  }
  if (cuts.length === 0) {
    return chunk;
  }
  return ctx.modeling.booleans.subtract(chunk, unionAll(ctx, cuts));
}
