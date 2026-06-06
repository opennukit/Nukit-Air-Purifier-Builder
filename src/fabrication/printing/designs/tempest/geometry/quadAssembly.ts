import type {
  TempestFanLayout,
  TempestFilterLayout,
  TempestModel,
  TempestPlanarAxis,
  TempestQuadWallRect,
  TempestWall,
  TempestWallMap,
} from "@/domain/designs/tempest/model";
import { tempestWalls } from "@/domain/designs/tempest/model";
import type { GeometryContext } from "./context";
import { CORD_CYLINDER_SEGMENTS, EPSILON_LIP } from "./context";
import {
  cuboidFromMinSize,
  cylinderAlong,
  thinExtrude,
  unionAll,
} from "./primitives";
import { fanPatternCut, towerOpening2d } from "./patterns2d";

// Box-fan top exhaust.
const BOX_FAN_TIE_RADIUS_FLOOR_MM = 0.001; // never let a zero screw-hole diameter collapse the tie hole
const BOX_FAN_TIE_PAIR_DIVISOR = 8; // tie holes sit ±(min open span / this) either side of each corner

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
  rect: TempestQuadWallRect,
): Solid {
  const z = filterLayout.bottomPlateThickness - EPSILON_LIP;
  const height = model.box.height - filterLayout.bottomPlateThickness - filterLayout.topPlateThickness + 2 * EPSILON_LIP;
  return cuboidFromMinSize(ctx, rect.xMin, rect.yMin, z, rect.xMax - rect.xMin, rect.yMax - rect.yMin, height);
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
  rect: TempestQuadWallRect,
  depthLow: number,
  depthHigh: number,
): readonly Solid[] {
  const { transforms } = ctx.modeling;
  const filter = filterLayout.filter;
  const width = filter.faceWidth - 2 * model.frame.rim;
  const height = filter.faceHeight - 2 * model.frame.rim;
  if (width <= 0 || height <= 0) {
    return [];
  }
  const depth = depthHigh - depthLow;
  const centerZ = filterLayout.bottomPlateThickness + filter.faceHeight / 2;
  // The cut's 2D shape lies in the wall plane: across the wall's inlet-normal axis
  // the in-plane width is the face's other dimension, so X-normal walls swap w/h.
  const cut = towerChamferedOpeningCut(
    ctx,
    rect.inletNormalAxis === "x" ? height : width,
    rect.inletNormalAxis === "x" ? width : height,
    depth,
    model.frame.chamferSize,
  );
  const place = quadSideOpeningPlacement[wallName];
  const intoWallPlane =
    place.rotateAxis === "x"
      ? transforms.rotateX(place.quarterTurns * (Math.PI / 2), cut)
      : transforms.rotateY(place.quarterTurns * (Math.PI / 2), cut);
  return [transforms.translate(place.center(model, depthLow, depth, centerZ), intoWallPlane)];
}

// Where each wall's inlet cut sits and how it is rotated into the wall plane. The
// near walls (front/left) measure the cut face at `depthLow + depth` from the
// origin face; the far walls (back/right) measure it back from the opposite face.
// Pure data so it carries no Solid type — the rotation is applied at the call site.
type QuadSideOpeningPlacement = {
  readonly center: (model: TempestModel, depthLow: number, depth: number, centerZ: number) => readonly [number, number, number];
  readonly rotateAxis: TempestPlanarAxis;
  readonly quarterTurns: 1 | -1;
};

const quadSideOpeningPlacement: TempestWallMap<QuadSideOpeningPlacement> = {
  front: {
    center: (model, depthLow, depth, centerZ) => [model.box.width / 2, depthLow + depth, centerZ],
    rotateAxis: "x",
    quarterTurns: 1,
  },
  back: {
    center: (model, depthLow, depth, centerZ) => [model.box.width / 2, model.box.depth - depthLow - depth, centerZ],
    rotateAxis: "x",
    quarterTurns: -1,
  },
  left: {
    center: (model, depthLow, depth, centerZ) => [depthLow + depth, model.box.depth / 2, centerZ],
    rotateAxis: "y",
    quarterTurns: -1,
  },
  right: {
    center: (model, depthLow, depth, centerZ) => [model.box.width - depthLow - depth, model.box.depth / 2, centerZ],
    rotateAxis: "y",
    quarterTurns: 1,
  },
};

export function towerFanGrid<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
): Solid[] {
  if (fanLayout.topExhaust === "single-box-fan") {
    return towerBoxExhaustCuts(ctx, model, filterLayout);
  }
  return fanLayout.positionsX.flatMap((x) =>
    fanLayout.positionsY.map((y) =>
      fanPatternCut(
        ctx,
        model,
        "z",
        [x, y, model.box.height - filterLayout.topPlateThickness / 2],
        filterLayout.topPlateThickness + 2 * EPSILON_LIP,
      ),
    ),
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
  // The slots you push the filters down through share each pocket's footprint;
  // they are the wall rects cut through the top plate.
  const z = model.box.height - filterLayout.topPlateThickness - EPSILON_LIP;
  const height = filterLayout.topPlateThickness + 2 * EPSILON_LIP;
  return tempestWalls.map((wall) => {
    const rect = filterLayout.wallRects[wall];
    return cuboidFromMinSize(ctx, rect.xMin, rect.yMin, z, rect.xMax - rect.xMin, rect.yMax - rect.yMin, height);
  });
}
