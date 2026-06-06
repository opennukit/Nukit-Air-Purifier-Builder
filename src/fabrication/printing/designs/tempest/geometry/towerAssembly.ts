import type {
  TempestFilterLayout,
  TempestModel,
  TempestWall,
} from "@/domain/designs/tempest/model";
import type { GeometryContext } from "./context";
import { EPSILON_LIP } from "./context";
import {
  cuboidFromMinSize,
  cylinderAlong,
  thinExtrude,
  unionAll,
} from "./primitives";
import { fanPatternCut, towerOpening2d } from "./patterns2d";
import { towerFilter } from "./layout";

// Box-fan top exhaust.
const BOX_FAN_TIE_RADIUS_FLOOR_MM = 0.001; // never let a zero screw-hole diameter collapse the tie hole
const BOX_FAN_TIE_PAIR_DIVISOR = 8; // tie holes sit ±(min open span / this) either side of each corner
const CORD_CYLINDER_SEGMENTS = 24; // facets on the cord/tie cylinders

// Places the 45° corner bevel one outer-wall thickness clear of the nearest air.
// The closest void to the corner is the filter pocket, whose near-corner edge sits
// at `x+y = structuralOffset + outsideFlange` (the air chamber is always farther,
// at `2*structuralOffset`). Stepping back along the corner bisector by one outer
// wall (`outsideFlange`) puts the bevel face a full wall from that pocket — so the
// chamfer is just the outer shell wrapped around the corner at 45°, leaving the
// same wall thickness whatever the filter. Capped at `maxChamfer` so a deep pocket
// can't produce an enormous bevel.
export function towerCornerChamfer(maxChamfer: number, structuralOffset: number, outsideFlange: number): number {
  const closestAirEdge = structuralOffset + outsideFlange;
  const bevelFace = closestAirEdge - outsideFlange * Math.SQRT2;
  return Math.max(0, Math.min(maxChamfer, bevelFace));
}

// #######################################
// 4 Filter Tower Assembly
// #######################################

export function towerAirChamber<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): Solid {
  return cuboidFromMinSize(
    ctx,
    filterLayout.airChamber.xMin,
    filterLayout.airChamber.yMin,
    filterLayout.airChamber.zMin - EPSILON_LIP,
    filterLayout.airChamber.xMax - filterLayout.airChamber.xMin,
    filterLayout.airChamber.yMax - filterLayout.airChamber.yMin,
    filterLayout.airChamber.zMax - filterLayout.airChamber.zMin + 2 * EPSILON_LIP,
  );
}

export function towerFilterPocket<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  wallName: TempestWall,
): Solid {
  const filter = towerFilter(model);
  const z = filterLayout.bottomPlateThickness - EPSILON_LIP;
  const height = model.box.height - filterLayout.bottomPlateThickness - filterLayout.topPlateThickness + 2 * EPSILON_LIP;
  const offset = filterLayout.structuralOffset;
  const outsideFlange = model.frame.outsideFlangeThickness;

  if (wallName === "front") {
    return cuboidFromMinSize(ctx, offset, outsideFlange, z, model.box.width - 2 * offset, filter.thickness, height);
  }
  if (wallName === "back") {
    return cuboidFromMinSize(
      ctx,
      offset,
      model.box.depth - outsideFlange - filter.thickness,
      z,
      model.box.width - 2 * offset,
      filter.thickness,
      height,
    );
  }
  if (wallName === "left") {
    return cuboidFromMinSize(ctx, outsideFlange, offset, z, filter.thickness, model.box.depth - 2 * offset, height);
  }
  return cuboidFromMinSize(
    ctx,
    model.box.width - outsideFlange - filter.thickness,
    offset,
    z,
    filter.thickness,
    model.box.depth - 2 * offset,
    height,
  );
}

// The tower's rounded wall opening, beveled (45°) on entry and exit faces so the
// hole flares slightly at both surfaces. A short hull from the flat opening to a
// chamfer-expanded copy makes each lip; the middle is a straight extrusion.
function towerChamferedOpeningCut<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  width: number,
  height: number,
  depth: number,
  chamfer: number,
): Solid {
  const { transforms, extrusions, hulls } = ctx.modeling;
  if (chamfer > 0 && depth > 2 * chamfer) {
    return unionAll(ctx, [
      hulls.hull(
        thinExtrude(ctx, towerOpening2d(ctx, width, height, chamfer), 0),
        transforms.translate([0, 0, chamfer], thinExtrude(ctx, towerOpening2d(ctx, width, height), 0)),
      ),
      transforms.translate([0, 0, chamfer], extrusions.extrudeLinear({ height: depth - 2 * chamfer }, towerOpening2d(ctx, width, height))),
      hulls.hull(
        transforms.translate([0, 0, depth - chamfer], thinExtrude(ctx, towerOpening2d(ctx, width, height), 0)),
        transforms.translate([0, 0, depth - 0.01], thinExtrude(ctx, towerOpening2d(ctx, width, height, chamfer), 0)),
      ),
    ]);
  }
  return extrusions.extrudeLinear({ height: Math.max(0.001, depth) }, towerOpening2d(ctx, width, height));
}

export function towerSideOpening<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  wallName: TempestWall,
  depthLow: number,
  depthHigh: number,
): readonly Solid[] {
  const { transforms } = ctx.modeling;
  const filter = towerFilter(model);
  const width = filter.faceWidth - 2 * model.frame.rim;
  const height = filter.faceHeight - 2 * model.frame.rim;
  if (width <= 0 || height <= 0) {
    return [];
  }
  const depth = depthHigh - depthLow;
  const centerZ = filterLayout.bottomPlateThickness + filter.faceHeight / 2;
  const cut = towerChamferedOpeningCut(
    ctx,
    wallName === "left" || wallName === "right" ? height : width,
    wallName === "left" || wallName === "right" ? width : height,
    depth,
    model.frame.chamferSize,
  );

  if (wallName === "front") {
    return [transforms.translate([model.box.width / 2, depthLow + depth, centerZ], transforms.rotateX(Math.PI / 2, cut))];
  }
  if (wallName === "back") {
    return [
      transforms.translate(
        [model.box.width / 2, model.box.depth - depthLow - depth, centerZ],
        transforms.rotateX(-Math.PI / 2, cut),
      ),
    ];
  }
  if (wallName === "left") {
    return [transforms.translate([depthLow + depth, model.box.depth / 2, centerZ], transforms.rotateY(-Math.PI / 2, cut))];
  }
  return [
    transforms.translate(
      [model.box.width - depthLow - depth, model.box.depth / 2, centerZ],
      transforms.rotateY(Math.PI / 2, cut),
    ),
  ];
}

export function towerFanGrid<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): Solid[] {
  if ((model.settings.fan.topExhaust ?? "fan-grid") === "single-box-fan") {
    return towerBoxExhaustCuts(ctx, model, filterLayout);
  }
  if (model.fanLayout.topology !== "quad") {
    return [];
  }
  return model.fanLayout.positionsX.flatMap((x) =>
    model.fanLayout.topology === "quad"
      ? model.fanLayout.positionsY.map((y) =>
          fanPatternCut(
            ctx,
            model,
            "z",
            [x, y, model.box.height - filterLayout.topPlateThickness / 2],
            filterLayout.topPlateThickness + 2 * EPSILON_LIP,
          ),
        )
      : [],
  );
}

// A single large box/exhaust-fan opening over the air chamber, plus paired
// corner holes for zip-tying a box fan in place (the traditional CR-Box top).
export function towerBoxExhaustCuts<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): Solid[] {
  const { transforms, extrusions } = ctx.modeling;
  const chamber = filterLayout.airChamber;
  const cutHeight = filterLayout.topPlateThickness + 2 * EPSILON_LIP;
  const seatRim = model.frame.outsideFlangeThickness;
  const openWidth = Math.max(0.001, chamber.xMax - chamber.xMin - 2 * seatRim);
  const openDepth = Math.max(0.001, chamber.yMax - chamber.yMin - 2 * seatRim);
  const centerX = (chamber.xMin + chamber.xMax) / 2;
  const centerY = (chamber.yMin + chamber.yMax) / 2;
  const holeCenterZ = model.box.height - filterLayout.topPlateThickness / 2;

  const opening = transforms.translate(
    [centerX, centerY, model.box.height - filterLayout.topPlateThickness - EPSILON_LIP],
    extrusions.extrudeLinear({ height: cutHeight }, towerOpening2d(ctx, openWidth, openDepth)),
  );

  const tieRadius = Math.max(BOX_FAN_TIE_RADIUS_FLOOR_MM, model.settings.fan.screwHoleDiameter / 2);
  const tieOutset = seatRim / 2;
  const tiePairOffset = Math.min(openWidth, openDepth) / BOX_FAN_TIE_PAIR_DIVISOR;
  const cornerX = openWidth / 2 + tieOutset;
  const cornerY = openDepth / 2 + tieOutset;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [centerX - cornerX, centerY - cornerY],
    [centerX + cornerX, centerY - cornerY],
    [centerX - cornerX, centerY + cornerY],
    [centerX + cornerX, centerY + cornerY],
  ];
  const zipTieHoles = corners.flatMap(([cx, cy]) =>
    [-tiePairOffset, tiePairOffset].map((dy) => cylinderAlong(ctx, "z", [cx, cy + dy, holeCenterZ], cutHeight, tieRadius, CORD_CYLINDER_SEGMENTS)),
  );

  return [opening, ...zipTieHoles];
}

export function towerFilterSlots<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): Solid[] {
  const filter = towerFilter(model);
  const z = model.box.height - filterLayout.topPlateThickness - EPSILON_LIP;
  const height = filterLayout.topPlateThickness + 2 * EPSILON_LIP;
  return [
    cuboidFromMinSize(ctx, filterLayout.structuralOffset, model.frame.outsideFlangeThickness, z, filter.faceWidth, filter.thickness, height),
    cuboidFromMinSize(
      ctx,
      filterLayout.structuralOffset,
      model.box.depth - model.frame.outsideFlangeThickness - filter.thickness,
      z,
      filter.faceWidth,
      filter.thickness,
      height,
    ),
    cuboidFromMinSize(ctx, model.frame.outsideFlangeThickness, filterLayout.structuralOffset, z, filter.thickness, filter.faceWidth, height),
    cuboidFromMinSize(
      ctx,
      model.box.width - model.frame.outsideFlangeThickness - filter.thickness,
      filterLayout.structuralOffset,
      z,
      filter.thickness,
      filter.faceWidth,
      height,
    ),
  ];
}
