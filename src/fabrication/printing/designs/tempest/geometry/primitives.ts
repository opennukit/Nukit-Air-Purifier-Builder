import type { TempestExtrudeAxis } from "@/domain/designs/tempest/shared";
import type { GeometryContext } from "./context";
import { CSG_SEGMENTS, EPSILON_LIP } from "./context";

// #######################################
// 3D Primitives
// #######################################

export function chamferedPrism<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  chamfer: number,
): Solid {
  const { transforms, extrusions } = ctx.modeling;
  return transforms.translate(
    [x, y, z],
    extrusions.extrudeLinear(
      { height: Math.max(0.001, height) },
      chamferedRectangle2d(ctx, Math.max(0.001, width), Math.max(0.001, depth), chamfer),
    ),
  );
}

export function chamferedRectangle2d<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  width: number,
  depth: number,
  chamfer: number,
): Region {
  const { primitives } = ctx.modeling;
  const safeChamfer = Math.max(0, Math.min(chamfer, width / 2 - 0.01, depth / 2 - 0.01));
  if (safeChamfer <= 0) {
    return rectangle2d(ctx, 0, 0, width, depth);
  }
  return primitives.polygon({
    points: [
      [safeChamfer, 0],
      [width - safeChamfer, 0],
      [width, safeChamfer],
      [width, depth - safeChamfer],
      [width - safeChamfer, depth],
      [safeChamfer, depth],
      [0, depth - safeChamfer],
      [0, safeChamfer],
    ],
  });
}

// A sandwich wall body: a length x thickness footprint extruded to height, with
// chamfers only down the two OUTER-face corners (y = 0); together with the
// adjacent wall's outer chamfer they form the box's exterior corner bevel. The
// INNER-face corners stay square on purpose: at a box corner they are buried
// inside the adjacent wall, and chamfering them opens a thin through-slit
// wherever a through-cut that reaches the wall end (the filter loading slot)
// removes the adjacent wall material that covered the chamfer triangle.
export function outerChamferedWallPrism<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  length: number,
  thickness: number,
  height: number,
  chamfer: number,
): Solid {
  const { primitives, extrusions } = ctx.modeling;
  const safeLength = Math.max(0.001, length);
  const safeThickness = Math.max(0.001, thickness);
  const safeChamfer = Math.max(0, Math.min(chamfer, safeLength / 2 - 0.01, safeThickness - 0.01));
  const footprint =
    safeChamfer <= 0
      ? rectangle2d(ctx, 0, 0, safeLength, safeThickness)
      : primitives.polygon({
          points: [
            [safeChamfer, 0],
            [safeLength - safeChamfer, 0],
            [safeLength, safeChamfer],
            [safeLength, safeThickness],
            [0, safeThickness],
            [0, safeChamfer],
          ],
        });
  return extrusions.extrudeLinear({ height: Math.max(0.001, height) }, footprint);
}

// Extrudes `footprint` to `height` but bevels its TOP and BOTTOM faces inward by
// `chamfer` at 45° — a horizontal-edge chamfer that follows EVERY edge of the
// footprint outline. Passing a corner-chamfered (octagonal) footprint therefore
// chamfers the top and bottom of the corner posts' diagonal faces too, not just
// the four main faces. Built like chamferedOpeningCutAlongZ: two end hulls
// (inset -> full) bracket a straight middle. The inset is a uniform inward
// offset of the footprint, so it stays concentric whatever the outline.
export function topBottomEdgeChamferSolid<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  footprint: Region,
  height: number,
  chamfer: number,
): Solid {
  return edgeChamferSolid(ctx, footprint, height, chamfer, { bottom: true, top: true });
}

// Like topBottomEdgeChamferSolid, but each of the top and bottom edge bevels can be
// turned off independently. A face with its bevel off stays square (full footprint
// flush to that plane). Used so the tower body meets its feet with a square join —
// the box keeps its top bevel, the feet keep their bottom bevel, and the shared
// face between them carries no chamfer.
export function edgeChamferSolid<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  footprint: Region,
  height: number,
  chamfer: number,
  edges: { readonly bottom: boolean; readonly top: boolean },
): Solid {
  const { transforms, extrusions, hulls, expansions } = ctx.modeling;
  const safeHeight = Math.max(0.001, height);
  const maxChamfer = (edges.bottom && edges.top ? safeHeight / 2 : safeHeight) - 0.01;
  const safeChamfer = Math.max(0, Math.min(chamfer, maxChamfer));
  if (safeChamfer <= 0 || (!edges.bottom && !edges.top)) {
    return extrusions.extrudeLinear({ height: safeHeight }, footprint);
  }
  const inset = expansions.offset({ delta: -safeChamfer, corners: "edge", segments: CSG_SEGMENTS }, footprint);
  const straightStart = edges.bottom ? safeChamfer : 0;
  const straightEnd = edges.top ? safeHeight - safeChamfer : safeHeight;
  const parts: Solid[] = [];
  if (edges.bottom) {
    parts.push(hulls.hull(thinExtrude(ctx, inset, 0), thinExtrude(ctx, footprint, safeChamfer)));
  }
  parts.push(transforms.translate([0, 0, straightStart], extrusions.extrudeLinear({ height: Math.max(0.001, straightEnd - straightStart) }, footprint)));
  // thinExtrude lays a 0.01 mm slab UP from its z, so the top hull's slabs start
  // 0.01 below their target planes — that keeps the box top exactly at safeHeight
  // and the upper bevel's straight-face edge exactly at safeHeight - safeChamfer.
  if (edges.top) {
    parts.push(hulls.hull(thinExtrude(ctx, footprint, safeHeight - safeChamfer - 0.01), thinExtrude(ctx, inset, safeHeight - 0.01)));
  }
  return unionAll(ctx, parts);
}

export function rectangle2d<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  x: number,
  y: number,
  width: number,
  depth: number,
): Region {
  const { primitives } = ctx.modeling;
  return primitives.polygon({
    points: [
      [x, y],
      [x + Math.max(0.001, width), y],
      [x + Math.max(0.001, width), y + Math.max(0.001, depth)],
      [x, y + Math.max(0.001, depth)],
    ],
  });
}

export function chamferedOpeningCutAlongZ<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  shape: Region,
  depth: number,
  chamfer: number,
): Solid {
  const { transforms, extrusions, expansions, hulls } = ctx.modeling;
  if (chamfer > 0 && depth > 2 * chamfer) {
    const expanded = expansions.offset({ delta: chamfer, corners: "round", segments: CSG_SEGMENTS }, shape);
    return unionAll(ctx, [
      hulls.hull(
        transforms.translate([0, 0, -EPSILON_LIP], thinExtrude(ctx, expanded, 0)),
        transforms.translate([0, 0, chamfer], thinExtrude(ctx, shape, 0)),
      ),
      transforms.translate([0, 0, chamfer], extrusions.extrudeLinear({ height: depth - 2 * chamfer }, shape)),
      hulls.hull(
        transforms.translate([0, 0, depth - chamfer], thinExtrude(ctx, shape, 0)),
        transforms.translate([0, 0, depth + EPSILON_LIP], thinExtrude(ctx, expanded, 0)),
      ),
    ]);
  }
  return transforms.translate([0, 0, -EPSILON_LIP], extrusions.extrudeLinear({ height: depth + 2 * EPSILON_LIP }, shape));
}

export function thinExtrude<Solid, Region>(ctx: GeometryContext<Solid, Region>, shape: Region, z: number): Solid {
  const { transforms, extrusions } = ctx.modeling;
  return transforms.translate([0, 0, z], extrusions.extrudeLinear({ height: 0.01 }, shape));
}

export function orientZExtrusion<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  axis: TempestExtrudeAxis,
  geometry: Solid,
): Solid {
  const { transforms } = ctx.modeling;
  if (axis === "x") {
    return transforms.rotateY(Math.PI / 2, geometry);
  }
  if (axis === "y") {
    return transforms.rotateX(Math.PI / 2, geometry);
  }
  return geometry;
}

export function cylinderAlong<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  axis: TempestExtrudeAxis,
  center: readonly [number, number, number],
  length: number,
  radius: number,
  segments: number,
): Solid {
  const { primitives, transforms } = ctx.modeling;
  const cylinder = primitives.cylinder({
    height: Math.max(0.001, length),
    radius: Math.max(0.001, radius),
    segments,
  });
  return transforms.translate(center, orientZExtrusion(ctx, axis, cylinder));
}

export function cylinderAlongFromStart<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  axis: TempestExtrudeAxis,
  start: readonly [number, number, number],
  length: number,
  radius: number,
): Solid {
  if (axis === "x") {
    return cylinderAlong(ctx, axis, [start[0] + length / 2, start[1], start[2]], length, radius, CSG_SEGMENTS);
  }
  if (axis === "y") {
    return cylinderAlong(ctx, axis, [start[0], start[1] + length / 2, start[2]], length, radius, CSG_SEGMENTS);
  }
  return cylinderAlong(ctx, axis, [start[0], start[1], start[2] + length / 2], length, radius, CSG_SEGMENTS);
}

export function cuboidFromMinSize<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
): Solid {
  const { primitives } = ctx.modeling;
  return primitives.cuboid({
    center: [x + width / 2, y + depth / 2, z + height / 2],
    size: [Math.max(0.001, width), Math.max(0.001, depth), Math.max(0.001, height)],
  });
}

// #######################################
// Boolean Helpers
// #######################################

export function unionAll<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  geometriesToUnion: readonly Solid[],
): Solid {
  const { booleans } = ctx.modeling;
  const first = geometriesToUnion[0];
  if (first === undefined) {
    throw new Error("unionAll: Missing geometry");
  }
  return geometriesToUnion.length === 1 ? first : booleans.union(first, ...geometriesToUnion.slice(1));
}

export function unionAll2d<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  geometriesToUnion: readonly Region[],
): Region {
  const { booleans2d } = ctx.modeling;
  const first = geometriesToUnion[0];
  if (first === undefined) {
    throw new Error("unionAll2d: Missing geometry");
  }
  return geometriesToUnion.length === 1 ? first : booleans2d.union(first, ...geometriesToUnion.slice(1));
}

export function subtractAll<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  base: Solid,
  holes: readonly Solid[],
): Solid {
  const { booleans } = ctx.modeling;
  return holes.length === 0 ? base : booleans.subtract(base, ...holes);
}
