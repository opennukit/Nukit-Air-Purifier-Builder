import type { GeometryContext } from "./context";
import { unionAll, unionAll2d } from "./primitives";
import { renderLabel } from "./labelFont";

// #######################################
// Chunk/Seam Code Deboss (CSG)
// #######################################

// Engraves a chunk's seam codes into one large flat face of the part — the base
// it prints on for most pieces, or its biggest flat wall otherwise — laid out in
// a centred, spread-apart row so glued pieces are easy to match. The target face
// is found by analysing the chunk mesh (see dominantFlatFace), which guarantees a
// solid surface on every piece regardless of layout or pose. The cut is a shallow
// pocket from that face inward; subtraction only removes existing material (hole-
// safe) and the tool pokes slightly past the face so the rim stays manifold.

export type ChunkLabelDebossOptions = {
  readonly capHeight: number; // text height, mm
  readonly depth: number; // deboss depth, mm
};

// The flat face to engrave, in the chunk's local frame. axis/sign give the
// outward normal; offset is the face plane; uIdx/vIdx are the in-plane axes
// (width, height) and uCenter/vCenter the solid centroid to centre the row on.
export type DebossFace = {
  readonly axis: 0 | 1 | 2;
  readonly sign: 1 | -1;
  readonly offset: number;
  readonly uIdx: 0 | 1 | 2;
  readonly vIdx: 0 | 1 | 2;
  readonly uCenter: number;
  readonly vCenter: number;
};

const SURFACE_OUTSET_MM = 0.2;
const CODE_GAP_FRACTION = 0.6;

// Whether the glyphs must be flipped left-right so the code reads correctly when
// looking at this outward face (look = -normal, up = +z for vertical faces, +y
// for horizontal faces; width must run along the viewer's right = look x up).
function faceNeedsMirror(face: DebossFace): boolean {
  if (face.axis === 2) {
    return face.sign < 0; // top/bottom face, read with +y up
  }
  if (face.axis === 0) {
    return face.sign < 0; // x wall
  }
  return face.sign > 0; // y wall
}

// Orient a glyph extruded along +z (width=x, height=y, depth=z) so depth runs
// along the face axis and width/height fall on the in-plane axes.
function orientToAxis<Solid, Region>(ctx: GeometryContext<Solid, Region>, axis: 0 | 1 | 2, solid: Solid): Solid {
  const { transforms } = ctx.modeling;
  if (axis === 2) {
    return solid; // width->x, height->y, depth->z
  }
  if (axis === 1) {
    return transforms.rotateX(-Math.PI / 2, solid); // width->x, height->z, depth->-y
  }
  return transforms.rotateZ(Math.PI / 2, transforms.rotateX(-Math.PI / 2, solid)); // width->y, height->z, depth->x
}

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
  const sx = mirror ? -1 : 1;
  const polys = rendered.loops.map((loop) =>
    ctx.modeling.primitives.polygon({ points: loop.map(([x, y]) => [sx * (x - halfW), y - halfH]) }),
  );
  return { region: unionAll2d(ctx, polys), width: rendered.width, height: rendered.height };
}

// Engrave the chunk's seam codes into the chosen flat face.
export function debossChunkSeamLabels<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  chunk: Solid,
  codes: readonly string[],
  face: DebossFace,
  options: ChunkLabelDebossOptions,
): Solid {
  if (codes.length === 0) {
    return chunk;
  }
  const { transforms, extrusions, booleans } = ctx.modeling;
  const mirror = faceNeedsMirror(face);
  const built = codes
    .map((code) => centredLabelRegion(ctx, code, options.capHeight, mirror))
    .filter((b): b is NonNullable<typeof b> => b !== null);
  if (built.length === 0) {
    return chunk;
  }

  const gap = options.capHeight * CODE_GAP_FRACTION;
  const totalWidth = built.reduce((sum, b) => sum + b.width, 0) + gap * (built.length - 1);
  const length = options.depth + SURFACE_OUTSET_MM;
  // Centre the pocket prism on the face plane so it recesses `depth` inward and
  // pokes `outset` outward, whichever way the face points.
  const axisCenter = face.offset + face.sign * ((SURFACE_OUTSET_MM - options.depth) / 2);

  const tools: Solid[] = [];
  let cursor = face.uCenter - totalWidth / 2;
  for (const b of built) {
    const uPos = cursor + b.width / 2;
    cursor += b.width + gap;

    const prismLocal = transforms.translate([0, 0, -length / 2], extrusions.extrudeLinear({ height: length }, b.region));
    const oriented = orientToAxis(ctx, face.axis, prismLocal);
    const place: [number, number, number] = [0, 0, 0];
    place[face.axis] = axisCenter;
    place[face.uIdx] = uPos;
    place[face.vIdx] = face.vCenter;
    tools.push(transforms.translate(place, oriented));
  }
  return booleans.subtract(chunk, unionAll(ctx, tools));
}
