import type { GeometryContext } from "./context";
import { unionAll, unionAll2d } from "./primitives";
import { renderLabel } from "./labelFont";

// #######################################
// Chunk/Seam Code Deboss (CSG)
// #######################################

// Engraves seam codes into a chunk so glued pieces are easy to match. The caller
// (printableKit) decides WHICH face each seam's code sits on and where, by
// analysing the chunk mesh and the seam's planning anchor; this module turns each
// of those placements into a debossed, correctly oriented set of glyphs.
//
// Earlier versions lumped every code onto one "dominant" face chosen on its own,
// decoupled from the seam, with a mirror flag that only sometimes matched the
// face the glyphs landed on, so codes appeared mirrored, repeated, or on hidden
// surfaces. Each placement now carries the exact face plane, the in-plane centre,
// and the assembly "up" vector; the orientation (in-plane quarter turn + mirror)
// is solved from those so the code always reads correctly when you look at that
// interior face from inside the box. An optional up-arrow is debossed above the
// code pointing toward the top of the assembly, so two matching parts can be
// rotated the same way before gluing.

// One concrete code to engrave: the target face plane (outward normal = sign
// along axis), the point on that plane to centre the code on, and the text "up"
// direction as a world vector. Up runs across the seam (into this chunk), so the
// code's reading direction lands parallel to the seam line, sitting beside it.
export type SeamDebossPlacement = {
  readonly code: string;
  readonly faceAxis: 0 | 1 | 2;
  readonly faceSign: 1 | -1;
  readonly faceOffset: number;
  readonly center: readonly [number, number, number];
  readonly up: readonly [number, number, number];
};

export type ChunkLabelDebossOptions = {
  readonly capHeight: number; // text height, mm
  readonly depth: number; // deboss depth, mm
  readonly withArrow: boolean; // add an up-arrow above each code
};

const SURFACE_OUTSET_MM = 0.2;
const ARROW_GAP_FRACTION = 0.45; // gap between code top and arrow base, x capHeight
const ARROW_HEIGHT_FRACTION = 0.7;
const ARROW_WIDTH_FRACTION = 0.62;

type Vec3 = readonly [number, number, number];

function unitAxis(axis: 0 | 1 | 2, sign: 1 | -1): Vec3 {
  const v: [number, number, number] = [0, 0, 0];
  v[axis] = sign;
  return v;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecEqual(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

// Snap an (already near-axis-aligned) vector to its dominant signed unit axis.
function snapToAxis(v: Vec3): Vec3 {
  let axis: 0 | 1 | 2 = 0;
  let best = Math.abs(v[0]);
  for (const a of [1, 2] as const) {
    if (Math.abs(v[a]) > best) {
      best = Math.abs(v[a]);
      axis = a;
    }
  }
  return unitAxis(axis, v[axis] >= 0 ? 1 : -1);
}

// The two axes that span the plane whose normal is `axis`.
function inPlaneAxes(axis: 0 | 1 | 2): readonly [0 | 1 | 2, 0 | 1 | 2] {
  return axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
}

// Integer quarter-turn (CCW about +z) of a vector, mirroring rotateZ on a Solid.
function rotateZQuarter(v: Vec3, quarterTurns: number): Vec3 {
  let x = v[0];
  let y = v[1];
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < turns; i += 1) {
    const nx = -y;
    const ny = x;
    x = nx;
    y = ny;
  }
  return [x, y, v[2]];
}

// Vector image of orientToAxis: must match the Solid transform below exactly so
// the predicted glyph orientation equals the built one.
function orientToAxisVec(axis: 0 | 1 | 2, v: Vec3): Vec3 {
  if (axis === 2) {
    return v; // identity
  }
  if (axis === 1) {
    return [v[0], v[2], -v[1]]; // rotateX(-90): (x, y, z) -> (x, z, -y)
  }
  // rotateZ(90) . rotateX(-90)
  const t: Vec3 = [v[0], v[2], -v[1]];
  return [-t[1], t[0], t[2]];
}

// Orient a glyph extruded along +z so its depth runs along the face axis. Mirror
// of orientToAxisVec above.
function orientToAxis<Solid, Region>(ctx: GeometryContext<Solid, Region>, axis: 0 | 1 | 2, solid: Solid): Solid {
  const { transforms } = ctx.modeling;
  if (axis === 2) {
    return solid;
  }
  if (axis === 1) {
    return transforms.rotateX(-Math.PI / 2, solid);
  }
  return transforms.rotateZ(Math.PI / 2, transforms.rotateX(-Math.PI / 2, solid));
}

// Solve the in-plane orientation: how many quarter turns to spin the glyph in its
// own plane, and whether to mirror it, so that after orientToAxis the glyph's
// local +y points along the assembly "up" (projected onto this face) and the
// glyph reads the right way round when viewed from inside the box.
type GlyphOrientation = { readonly quarterTurns: 0 | 1 | 2 | 3; readonly mirror: boolean; readonly up: Vec3 };

function solveGlyphOrientation(faceAxis: 0 | 1 | 2, faceSign: 1 | -1, desiredUp: Vec3): GlyphOrientation {
  const normal = unitAxis(faceAxis, faceSign); // outward normal: points into the cavity for an interior face
  // Project the desired up onto the face plane; fall back to the first in-plane
  // axis if it is perpendicular to the face. Deterministic, so both halves of a
  // seam pick the same reference.
  const dotUp = dot(desiredUp, normal);
  const projected: Vec3 = [
    desiredUp[0] - dotUp * normal[0],
    desiredUp[1] - dotUp * normal[1],
    desiredUp[2] - dotUp * normal[2],
  ];
  const [firstInPlane] = inPlaneAxes(faceAxis);
  const up =
    Math.hypot(projected[0], projected[1], projected[2]) < 1e-6 ? unitAxis(firstInPlane, 1) : snapToAxis(projected);

  // The reader views the engraved code from the cavity side (the interior face's
  // outward normal points into the cavity, toward the reader). For a camera looking
  // along -normal with `up` up, screen-right is up x normal; the glyph's reading
  // direction (local +x) must map there for the code to read correctly.
  const desiredRight = cross(up, normal);

  for (const quarterTurns of [0, 1, 2, 3] as const) {
    if (!vecEqual(orientToAxisVec(faceAxis, rotateZQuarter([0, 1, 0], quarterTurns)), up)) {
      continue;
    }
    // imgX with no mirror is +/- desiredRight (both lie on the same in-plane axis);
    // mirror (flip local x) when it points the wrong way.
    const imgX = orientToAxisVec(faceAxis, rotateZQuarter([1, 0, 0], quarterTurns));
    return { quarterTurns, mirror: !vecEqual(imgX, desiredRight), up };
  }
  // No quarter turn aligns up (degenerate): keep glyph upright without mirroring.
  return { quarterTurns: 0, mirror: false, up };
}

// The glyph loops for a code, centred on the origin (x = width, y = height), with
// an optional up-arrow sitting just above the text. Mirror flips x so the code
// reads correctly on the chosen face.
function labelRegion<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  code: string,
  capHeight: number,
  mirror: boolean,
  withArrow: boolean,
): Region | null {
  const rendered = renderLabel(code, capHeight);
  if (rendered.loops.length === 0) {
    return null;
  }
  const halfW = rendered.width / 2;
  const halfH = rendered.height / 2;
  const sx = mirror ? -1 : 1;
  const polys = rendered.loops.map((loop) =>
    ctx.modeling.primitives.polygon({ points: loop.map(([x, y]) => [sx * (x - halfW), y - halfH]) }),
  );
  if (withArrow) {
    const gap = capHeight * ARROW_GAP_FRACTION;
    const arrowHeight = capHeight * ARROW_HEIGHT_FRACTION;
    const halfArrow = (capHeight * ARROW_WIDTH_FRACTION) / 2;
    const baseY = halfH + gap;
    // CCW triangle pointing up (+y). Symmetric about x = 0, so the mirror is a
    // no-op on it and it always points toward assembly-up after orientation.
    polys.push(
      ctx.modeling.primitives.polygon({
        points: [
          [-halfArrow, baseY],
          [halfArrow, baseY],
          [0, baseY + arrowHeight],
        ],
      }),
    );
  }
  return unionAll2d(ctx, polys);
}

// Engrave each placement's code (and optional arrow) into the chunk.
export function debossChunkSeamLabels<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  chunk: Solid,
  placements: readonly SeamDebossPlacement[],
  options: ChunkLabelDebossOptions,
): Solid {
  if (placements.length === 0) {
    return chunk;
  }
  const { transforms, extrusions, booleans } = ctx.modeling;
  const length = options.depth + SURFACE_OUTSET_MM;

  const tools: Solid[] = [];
  for (const placement of placements) {
    const { quarterTurns, mirror } = solveGlyphOrientation(placement.faceAxis, placement.faceSign, placement.up);
    const region = labelRegion(ctx, placement.code, options.capHeight, mirror, options.withArrow);
    if (region === null) {
      continue;
    }
    // Build the glyph prism in its local frame (depth along z, centred on z = 0),
    // spin it in-plane, then lay it onto the face axis.
    const prismLocal = transforms.translate([0, 0, -length / 2], extrusions.extrudeLinear({ height: length }, region));
    const spun = quarterTurns === 0 ? prismLocal : transforms.rotateZ((quarterTurns * Math.PI) / 2, prismLocal);
    const oriented = orientToAxis(ctx, placement.faceAxis, spun);

    // Recess `depth` inward from the face plane and poke `outset` proud so the rim
    // stays manifold.
    const axisCenter = placement.faceOffset + placement.faceSign * ((SURFACE_OUTSET_MM - options.depth) / 2);
    const place: [number, number, number] = [placement.center[0], placement.center[1], placement.center[2]];
    place[placement.faceAxis] = axisCenter;
    tools.push(transforms.translate(place, oriented));
  }
  if (tools.length === 0) {
    return chunk;
  }
  return booleans.subtract(chunk, unionAll(ctx, tools));
}
