import type { TempestModel } from "@/domain/designs/tempest/model";
import type { TempestExtrudeAxis } from "@/domain/designs/tempest/shared";
import type { GeometryContext } from "./context";
import { CSG_SEGMENTS } from "./context";
import { orientZExtrusion, unionAll2d } from "./primitives";

// The honeycomb grill is drawn this far inside the fan opening so the grill ring
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

export function hex2d<Solid, Region>(ctx: GeometryContext<Solid, Region>, flatToFlat: number): Region {
  const { primitives } = ctx.modeling;
  const radius = flatToFlat / Math.sqrt(3);
  return primitives.polygon({
    points: Array.from({ length: 6 }, (_, index) => {
      const angle = (Math.PI / 180) * (60 * index + 30);
      return [radius * Math.cos(angle), radius * Math.sin(angle)];
    }),
  });
}

export function hexGrill2d<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  outerDiameter: number,
): Region {
  const { primitives, transforms2d, booleans2d } = ctx.modeling;
  const opening = model.settings.fan.opening;
  if (opening.type !== "honeycomb") {
    return primitives.circle({ radius: Math.max(0.001, outerDiameter / 2), segments: CSG_SEGMENTS });
  }

  const pitchX = opening.hexFlatToFlat + opening.ribThickness;
  const pitchY = pitchX * Math.sqrt(3) / 2;
  const columnCount = Math.ceil(outerDiameter / pitchX) + 2;
  const rowCount = Math.ceil(outerDiameter / pitchY) + 2;
  const clipRadius = Math.max(0, (outerDiameter - 2 * opening.ribThickness) / 2);
  const hexRadius = opening.hexFlatToFlat / Math.sqrt(3);
  const holes: Region[] = [];

  for (let row = -rowCount; row <= rowCount; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : pitchX / 2;
    for (let column = -columnCount; column <= columnCount; column += 1) {
      const x = column * pitchX + rowOffset;
      const y = row * pitchY;
      if (Math.hypot(x, y) - hexRadius > clipRadius) {
        continue;
      }
      holes.push(transforms2d.translate([x, y], hex2d(ctx, opening.hexFlatToFlat)));
    }
  }

  return booleans2d.intersect(
    primitives.circle({ radius: Math.max(0.001, (outerDiameter - 2 * opening.ribThickness) / 2), segments: CSG_SEGMENTS }),
    unionAll2d(ctx, holes),
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
      ? hexGrill2d(ctx, model, model.settings.fan.diameter - FAN_GRILL_DRAW_INSET_MM)
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
