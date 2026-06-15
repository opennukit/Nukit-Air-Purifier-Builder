// #######################################
// Stroke Vector Font (chunk/seam labels)
// #######################################

// The modeling kernel has no text primitive, so chunk/seam codes are drawn with
// a tiny built-in stroke font: every glyph is a set of polylines, and each
// polyline segment becomes a thickened quad (with a square at every joint so the
// strokes weld into one connected shape). Output is plain polygon loops — closed
// CCW point rings — that the geometry layer turns into Regions, unions, and
// extrudes into a deboss tool. Only the glyphs that appear in labels are needed:
// A-Z and 0-9 (labels are letters plus an optional group digit, e.g. "AB", "A1B1").

export type Point2 = readonly [number, number];
// A closed polygon ring in glyph-local units (cap height 1, baseline at y = 0).
export type GlyphLoop = readonly Point2[];

// Skeleton stroke thickness as a fraction of cap height, and the horizontal gap
// between glyphs. Tuned so 7 mm caps stay legible after a 1 mm deboss.
const STROKE_THICKNESS = 0.16;
const GLYPH_SPACING = 0.22;
const DEFAULT_WIDTH = 0.78;

// Each glyph: its advance width and the polylines (in [0..width] x [0..1]) that
// form its skeleton. Curves are approximated by short polylines — at print scale
// the facets read as smooth strokes.
type Glyph = { readonly width: number; readonly strokes: readonly (readonly Point2[])[] };

const W = DEFAULT_WIDTH;
const glyphs: Readonly<Record<string, Glyph>> = {
  A: { width: W, strokes: [[[0, 0], [W / 2, 1], [W, 0]], [[0.16 * W, 0.4], [0.84 * W, 0.4]]] },
  B: {
    width: W,
    strokes: [
      [[0, 0], [0, 1]],
      [[0, 1], [0.62 * W, 1], [0.86 * W, 0.86], [0.86 * W, 0.64], [0.62 * W, 0.5], [0, 0.5]],
      [[0, 0.5], [0.66 * W, 0.5], [0.92 * W, 0.36], [0.92 * W, 0.14], [0.66 * W, 0], [0, 0]],
    ],
  },
  C: { width: W, strokes: [[[W, 0.82], [0.7 * W, 1], [0.3 * W, 1], [0, 0.7], [0, 0.3], [0.3 * W, 0], [0.7 * W, 0], [W, 0.18]]] },
  D: { width: W, strokes: [[[0, 0], [0, 1], [0.55 * W, 1], [0.9 * W, 0.72], [0.9 * W, 0.28], [0.55 * W, 0], [0, 0]]] },
  E: { width: W, strokes: [[[W, 1], [0, 1], [0, 0], [W, 0]], [[0, 0.5], [0.78 * W, 0.5]]] },
  F: { width: W, strokes: [[[W, 1], [0, 1], [0, 0]], [[0, 0.5], [0.74 * W, 0.5]]] },
  G: { width: W, strokes: [[[W, 0.82], [0.7 * W, 1], [0.3 * W, 1], [0, 0.7], [0, 0.3], [0.3 * W, 0], [0.7 * W, 0], [W, 0.2], [W, 0.46], [0.6 * W, 0.46]]] },
  H: { width: W, strokes: [[[0, 0], [0, 1]], [[W, 0], [W, 1]], [[0, 0.5], [W, 0.5]]] },
  I: { width: 0.34, strokes: [[[0.17, 0], [0.17, 1]]] },
  J: { width: W, strokes: [[[W, 1], [W, 0.25], [0.7 * W, 0], [0.3 * W, 0], [0, 0.22]]] },
  K: { width: W, strokes: [[[0, 0], [0, 1]], [[W, 1], [0, 0.5], [W, 0]]] },
  L: { width: W, strokes: [[[0, 1], [0, 0], [W, 0]]] },
  M: { width: 0.92, strokes: [[[0, 0], [0, 1], [0.46, 0.42], [0.92, 1], [0.92, 0]]] },
  N: { width: W, strokes: [[[0, 0], [0, 1], [W, 0], [W, 1]]] },
  O: { width: W, strokes: [[[0.3 * W, 1], [0.7 * W, 1], [W, 0.7], [W, 0.3], [0.7 * W, 0], [0.3 * W, 0], [0, 0.3], [0, 0.7], [0.3 * W, 1]]] },
  P: { width: W, strokes: [[[0, 0], [0, 1], [0.62 * W, 1], [0.9 * W, 0.84], [0.9 * W, 0.66], [0.62 * W, 0.5], [0, 0.5]]] },
  Q: { width: W, strokes: [[[0.3 * W, 1], [0.7 * W, 1], [W, 0.7], [W, 0.3], [0.7 * W, 0], [0.3 * W, 0], [0, 0.3], [0, 0.7], [0.3 * W, 1]], [[0.6 * W, 0.28], [W, 0]]] },
  R: { width: W, strokes: [[[0, 0], [0, 1], [0.62 * W, 1], [0.9 * W, 0.84], [0.9 * W, 0.66], [0.62 * W, 0.5], [0, 0.5]], [[0.5 * W, 0.5], [W, 0]]] },
  S: { width: W, strokes: [[[W, 0.86], [0.66 * W, 1], [0.3 * W, 1], [0, 0.78], [0.2 * W, 0.54], [0.8 * W, 0.46], [W, 0.22], [0.7 * W, 0], [0.34 * W, 0], [0, 0.14]]] },
  T: { width: W, strokes: [[[0, 1], [W, 1]], [[W / 2, 1], [W / 2, 0]]] },
  U: { width: W, strokes: [[[0, 1], [0, 0.3], [0.3 * W, 0], [0.7 * W, 0], [W, 0.3], [W, 1]]] },
  V: { width: W, strokes: [[[0, 1], [W / 2, 0], [W, 1]]] },
  W: { width: 0.98, strokes: [[[0, 1], [0.24, 0], [0.49, 0.7], [0.74, 0], [0.98, 1]]] },
  X: { width: W, strokes: [[[0, 0], [W, 1]], [[0, 1], [W, 0]]] },
  Y: { width: W, strokes: [[[0, 1], [W / 2, 0.5], [W, 1]], [[W / 2, 0.5], [W / 2, 0]]] },
  Z: { width: W, strokes: [[[0, 1], [W, 1], [0, 0], [W, 0]]] },
  "0": { width: W, strokes: [[[0.3 * W, 1], [0.7 * W, 1], [W, 0.7], [W, 0.3], [0.7 * W, 0], [0.3 * W, 0], [0, 0.3], [0, 0.7], [0.3 * W, 1]], [[0.18 * W, 0.2], [0.82 * W, 0.8]]] },
  "1": { width: 0.5, strokes: [[[0.08, 0.74], [0.3, 1], [0.3, 0]], [[0.04, 0], [0.5, 0]]] },
  "2": { width: W, strokes: [[[0, 0.8], [0.3 * W, 1], [0.7 * W, 1], [W, 0.74], [W, 0.55], [0, 0], [W, 0]]] },
  "3": { width: W, strokes: [[[0, 0.85], [0.4 * W, 1], [0.78 * W, 1], [W, 0.78], [0.55 * W, 0.55], [W, 0.3], [0.78 * W, 0.04], [0.35 * W, 0.04], [0, 0.18]]] },
  "4": { width: W, strokes: [[[0.74 * W, 0], [0.74 * W, 1], [0, 0.32], [W, 0.32]]] },
  "5": { width: W, strokes: [[[W, 1], [0.1 * W, 1], [0.05 * W, 0.56], [0.6 * W, 0.62], [W, 0.4], [0.82 * W, 0.06], [0.4 * W, 0], [0, 0.16]]] },
  "6": { width: W, strokes: [[[0.85 * W, 0.92], [0.5 * W, 1], [0.18 * W, 0.82], [0, 0.4], [0.2 * W, 0.08], [0.6 * W, 0], [0.92 * W, 0.2], [0.92 * W, 0.4], [0.6 * W, 0.56], [0.2 * W, 0.46], [0, 0.34]]] },
  "7": { width: W, strokes: [[[0, 1], [W, 1], [0.36 * W, 0]]] },
  "8": { width: W, strokes: [[[0.5 * W, 0.5], [0.16 * W, 0.62], [0.16 * W, 0.86], [0.5 * W, 1], [0.84 * W, 0.86], [0.84 * W, 0.62], [0.5 * W, 0.5], [0.12 * W, 0.34], [0.12 * W, 0.14], [0.5 * W, 0], [0.88 * W, 0.14], [0.88 * W, 0.34], [0.5 * W, 0.5]]] },
  "9": { width: W, strokes: [[[0.15 * W, 0.08], [0.5 * W, 0], [0.82 * W, 0.18], [W, 0.6], [0.8 * W, 0.92], [0.4 * W, 1], [0.08 * W, 0.8], [0.08 * W, 0.6], [0.4 * W, 0.44], [0.8 * W, 0.6], [W, 0.66]]] },
};

function squareAround(p: Point2, half: number): GlyphLoop {
  const [x, y] = p;
  return [
    [x - half, y - half],
    [x + half, y - half],
    [x + half, y + half],
    [x - half, y + half],
  ];
}

// One stroke segment as a thickened, square-capped quad. The cap extension makes
// neighbouring segments overlap so their union has no seam.
function segmentQuad(a: Point2, b: Point2, half: number): GlyphLoop {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy * half;
  const ny = ux * half;
  const ax = a[0] - ux * half;
  const ay = a[1] - uy * half;
  const bx = b[0] + ux * half;
  const by = b[1] + uy * half;
  return [
    [ax - nx, ay - ny],
    [bx - nx, by - ny],
    [bx + nx, by + ny],
    [ax + nx, ay + ny],
  ];
}

// Every closed loop for one character, scaled to capHeight, offset by originX.
function glyphLoops(glyph: Glyph, capHeight: number, originX: number): GlyphLoop[] {
  const half = (STROKE_THICKNESS * capHeight) / 2;
  const scale = (p: Point2): Point2 => [originX + p[0] * capHeight, p[1] * capHeight];
  const loops: GlyphLoop[] = [];
  for (const stroke of glyph.strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      loops.push(segmentQuad(scale(stroke[i - 1]), scale(stroke[i]), half));
    }
    // Fill only interior joints (not the open ends) so corners stay solid while
    // stroke ends keep their clean square cap from the segment extension.
    for (let i = 1; i < stroke.length - 1; i += 1) {
      loops.push(squareAround(scale(stroke[i]), half * 0.95));
    }
    // A closed stroke (first point == last) needs its shared joint filled too.
    const first = stroke[0];
    const last = stroke[stroke.length - 1];
    if (stroke.length > 2 && first[0] === last[0] && first[1] === last[1]) {
      loops.push(squareAround(scale(first), half * 0.95));
    }
  }
  return loops;
}

export type RenderedLabel = {
  // All polygon loops making up the string, in millimetres, baseline at y = 0,
  // left edge at x = 0.
  readonly loops: readonly GlyphLoop[];
  readonly width: number;
  readonly height: number;
};

// Lay a label string out left to right at the given cap height (mm). Unknown
// characters advance a space. Throughout, x grows right and y grows up.
export function renderLabel(text: string, capHeight: number): RenderedLabel {
  const loops: GlyphLoop[] = [];
  let cursor = 0;
  const spacing = GLYPH_SPACING * capHeight;
  for (const char of text.toUpperCase()) {
    const glyph = glyphs[char];
    if (glyph === undefined) {
      cursor += DEFAULT_WIDTH * capHeight + spacing;
      continue;
    }
    loops.push(...glyphLoops(glyph, capHeight, cursor));
    cursor += glyph.width * capHeight + spacing;
  }
  return {
    loops,
    width: Math.max(0, cursor - spacing),
    height: capHeight,
  };
}

export function labelSupportsAllChars(text: string): boolean {
  return [...text.toUpperCase()].every((char) => char in glyphs);
}
