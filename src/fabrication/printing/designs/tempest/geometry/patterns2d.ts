import type { TempestModel } from "@/domain/designs/tempest/model";
import type { TempestExtrudeAxis } from "@/domain/designs/tempest/shared";
import type { GeometryContext } from "./context";
import { CSG_SEGMENTS } from "./context";
import { orientZExtrusion, unionAll2d } from "./primitives";

// The grill is drawn this far inside the fan opening so the grill ring
// sits within the bore; a plain opening is inset half this so its edge clears.
const FAN_GRILL_DRAW_INSET_MM = 4;
const FAN_PLAIN_OPENING_INSET_MM = 2;
// Rounded openings cap their corner radius here so a small opening never rounds
// itself away (also used by towerOpening2d).
const OPENING_CORNER_RADIUS_CAP_MM = 10;
// Screw holes are tiny; this is enough facets to read as round without bloating
// the mesh.
const SCREW_HOLE_SEGMENTS = 16;

// #######################################
// 2D Primitives
// #######################################

// One diamond grill cell: a square rotated 45°, `width` across its diagonals.
// The printed grills draw diamonds instead of the original honeycomb
// (DIAMOND_GRILL_TAG) after real test prints of both:
// - every edge slopes at 45° on the bed no matter how the printed wall is
//   posed (the cell is 90°-rotation symmetric), so grills print support-free
//   in any orientation — honeycomb cell roofs collapsed into spaghetti on
//   standing walls in every hex orientation tried;
// - the diagonal lattice braces each rib at both ends, so the half-printed
//   grill stays stiff instead of wobbling like the hex's long straight ribs;
// - the tapered opening keeps a small child's finger away from the fan blades,
//   unlike a honeycomb cell of the same width.
// The laser path keeps its honeycomb — flat cuts have no overhangs. The
// settings still travel as "honeycomb"/hex* (URL and settings-model names are
// shared with the laser grill and Naomi's in-flight branches); for diamonds
// hexFlatToFlat reads as the hole width across and ribThickness stays the rib.
export function diamond2d<Solid, Region>(ctx: GeometryContext<Solid, Region>, width: number): Region {
  const { primitives } = ctx.modeling;
  const half = width / 2;
  return primitives.polygon({
    points: [
      [half, 0],
      [0, half],
      [-half, 0],
      [0, -half],
    ],
  });
}

export function diamondGrill2d<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  outerDiameter: number,
): Region {
  const { primitives, transforms2d, booleans2d } = ctx.modeling;
  const opening = model.settings.fan.opening;
  if (opening.type !== "honeycomb") {
    return primitives.circle({ radius: Math.max(0.001, outerDiameter / 2), segments: CSG_SEGMENTS });
  }

  const width = opening.hexFlatToFlat;
  // Checkerboard lattice: cells at every (i, j) plus every half-offset center.
  // Neighbouring cells face each other along the 45° diagonals, so the pitch
  // carries the rib thickness scaled by sqrt(2) to keep the perpendicular rib
  // exactly ribThickness wide.
  const pitch = width + opening.ribThickness * Math.SQRT2;
  const count = Math.ceil(outerDiameter / pitch) + 2;
  const clipRadius = Math.max(0, (outerDiameter - 2 * opening.ribThickness) / 2);
  const cellReach = width / 2;
  const holes: Region[] = [];

  for (let i = -count; i <= count; i += 1) {
    for (let j = -count; j <= count; j += 1) {
      for (const [x, y] of [
        [i * pitch, j * pitch],
        [i * pitch + pitch / 2, j * pitch + pitch / 2],
      ]) {
        // Full-cells mode keeps only cells wholly inside the clip circle; the
        // default keeps any that overlap it and trims them with the intersect
        // below.
        const reach = opening.fullCellsOnly ? cellReach : -cellReach;
        if (Math.hypot(x, y) + reach > clipRadius) {
          continue;
        }
        holes.push(transforms2d.translate([x, y], diamond2d(ctx, width)));
      }
    }
  }

  const union = unionAll2d(ctx, holes);
  if (opening.fullCellsOnly) {
    return union;
  }
  return booleans2d.intersect(
    primitives.circle({ radius: Math.max(0.001, (outerDiameter - 2 * opening.ribThickness) / 2), segments: CSG_SEGMENTS }),
    union,
  );
}

export function fanPattern2d<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Region {
  const { primitives, transforms2d } = ctx.modeling;
  const cacheKey = fanPatternCacheKey(model);
  const cached = ctx.fanPatternCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const opening =
    model.settings.fan.opening.type === "honeycomb"
      ? diamondGrill2d(ctx, model, model.settings.fan.diameter - FAN_GRILL_DRAW_INSET_MM)
      : primitives.circle({ radius: Math.max(0.001, model.settings.fan.diameter / 2 - FAN_PLAIN_OPENING_INSET_MM), segments: CSG_SEGMENTS });
  const screwDelta = model.fanLayout.screwPitch / 2;
  const screwRadius = model.settings.fan.screwHoleDiameter / 2;
  const screwHoles = [-screwDelta, screwDelta].flatMap((x) =>
    [-screwDelta, screwDelta].map((y) =>
      transforms2d.translate([x, y], primitives.circle({ radius: Math.max(0.001, screwRadius), segments: SCREW_HOLE_SEGMENTS })),
    ),
  );
  const pattern = unionAll2d(ctx, [opening, ...screwHoles]);
  ctx.fanPatternCache.set(cacheKey, pattern);
  return pattern;
}

export function fanPatternCacheKey(model: TempestModel): string {
  const opening = model.settings.fan.opening;
  return opening.type === "honeycomb"
    ? [
        model.settings.fan.diameter,
        model.settings.fan.screwHoleDiameter,
        opening.type,
        opening.hexFlatToFlat,
        opening.ribThickness,
        opening.fullCellsOnly,
        CSG_SEGMENTS,
      ].join(":")
    : [model.settings.fan.diameter, model.settings.fan.screwHoleDiameter, opening.type, CSG_SEGMENTS].join(":");
}

export function filterOpening2d<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Region | null {
  const { primitives } = ctx.modeling;
  const width = model.box.width - 2 * model.frame.rim;
  const depth = model.box.depth - 2 * model.frame.rim;
  if (width <= 0 || depth <= 0) {
    return null;
  }
  const radius = Math.min(OPENING_CORNER_RADIUS_CAP_MM, width / 2, depth / 2);
  return primitives.roundedRectangle({
    center: [model.frame.rim + width / 2, model.frame.rim + depth / 2],
    size: [width, depth],
    roundRadius: radius,
    segments: CSG_SEGMENTS,
  });
}

export function towerOpening2d<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  width: number,
  height: number,
  expand = 0,
): Region {
  const { primitives, expansions } = ctx.modeling;
  const radius = Math.min(OPENING_CORNER_RADIUS_CAP_MM, width / 2, height / 2);
  const opening = primitives.roundedRectangle({
    center: [0, 0],
    size: [Math.max(0.001, width), Math.max(0.001, height)],
    roundRadius: Math.max(0.001, radius),
    segments: CSG_SEGMENTS,
  });
  return expand <= 0 ? opening : expansions.offset({ delta: expand, corners: "round", segments: CSG_SEGMENTS }, opening);
}

// Extrudes the fan grill/opening pattern along an axis, ready to subtract from a
// wall — a 2D profile lifted into a cutting solid, so it lives with the patterns.
export function fanPatternCut<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  axis: TempestExtrudeAxis,
  center: readonly [number, number, number],
  length: number,
): Solid {
  const { transforms, extrusions } = ctx.modeling;
  const pattern = transforms.translate(
    [0, 0, -length / 2],
    extrusions.extrudeLinear({ height: Math.max(0.001, length) }, fanPattern2d(ctx, model)),
  );
  return transforms.translate(center, orientZExtrusion(ctx, axis, pattern));
}
