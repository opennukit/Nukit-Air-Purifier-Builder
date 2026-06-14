import type {
  TempestFanLayout,
  TempestFilterLayout,
  TempestModel,
  TempestQuadWallRect,
} from "@/domain/designs/tempest/model";
import {
  tempestWalls,
  type TempestBoxExhaustRing,
  type TempestPlanarAxis,
  type TempestWall,
  type TempestWallMap,
} from "@/domain/designs/tempest/shared";
import type { GeometryContext } from "./context";
import { CORD_CYLINDER_SEGMENTS, CSG_SEGMENTS, EPSILON_LIP } from "./context";
import {
  cuboidFromMinSize,
  cylinderAlong,
  thinExtrude,
  unionAll,
} from "./primitives";
import { fanPatternCut, towerOpening2d } from "./patterns2d";

// Internal fillets are deliberate strength features: the air chamber's vertical
// corners are rounded so the wall junctions meet in a fillet instead of a sharp
// stress riser. Only vertical-axis fillets (rounded in XY, swept along Z) are
// used — they print support-free. Exterior edges stay CHAMFERED on purpose:
// fillets print poorly on outside edges with thick layers and would need support.
const INTERNAL_FILLET_RADIUS_MM = 3;

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

// The central air-chamber void, its four vertical corners rounded so the inner
// wall junctions carry an internal fillet (see INTERNAL_FILLET_RADIUS_MM). The
// radius is clamped to the side openings' corner clearance: each outlet cut's
// chamfer flare ends `rim - chamferSize` from the chamber corner, so a radius at
// or below that can never touch an opening.
export function towerAirChamber<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): Solid {
  const { primitives, transforms, extrusions } = ctx.modeling;
  const chamber = filterLayout.airChamber;
  const width = chamber.xMax - chamber.xMin;
  const depth = chamber.yMax - chamber.yMin;
  const openingCornerClearance = model.frame.rim - model.frame.chamferSize;
  const filletRadius = Math.max(0, Math.min(INTERNAL_FILLET_RADIUS_MM, openingCornerClearance, width / 2, depth / 2));
  return transforms.translate(
    [chamber.xMin, chamber.yMin, chamber.zMin - EPSILON_LIP],
    extrusions.extrudeLinear(
      { height: chamber.zMax - chamber.zMin + 2 * EPSILON_LIP },
      primitives.roundedRectangle({
        center: [width / 2, depth / 2],
        size: [Math.max(0.001, width), Math.max(0.001, depth)],
        roundRadius: filletRadius,
        segments: CSG_SEGMENTS,
      }),
    ),
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

export function quadTopExhaust<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
): Solid[] {
  if (fanLayout.topExhaust === "box-exhaust") {
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

// A single central box/exhaust-fan hole over the air chamber, plus up to two
// evenly-spaced rings of screw holes around it (matches tempest-builder.html's
// tower_box_exhaust). All sizes come pre-resolved from settings.fan.boxExhaust.
export function towerBoxExhaustCuts<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): Solid[] {
  const boxExhaust = model.settings.fan.boxExhaust;
  const cutHeight = filterLayout.topPlateThickness + 2 * EPSILON_LIP;
  const centerX = model.box.width / 2;
  const centerY = model.box.depth / 2;
  const holeCenterZ = model.box.height - filterLayout.topPlateThickness / 2;
  const cuts: Solid[] = [];

  const drill = (diameter: number, x: number, y: number): void => {
    if (diameter <= 0) {
      return;
    }
    cuts.push(cylinderAlong(ctx, "z", [x, y, holeCenterZ], cutHeight, diameter / 2, CORD_CYLINDER_SEGMENTS));
  };

  drill(boxExhaust.fanHoleSize, centerX, centerY);

  const drillRing = (ring: TempestBoxExhaustRing): void => {
    if (ring.screwHoles <= 0 || ring.screwDiameter <= 0 || ring.radius <= 0) {
      return;
    }
    // offset = PI/n puts a 4-hole ring at the corners (45°), matching the reference.
    const angleOffset = Math.PI / ring.screwHoles;
    for (let index = 0; index < ring.screwHoles; index += 1) {
      const angle = angleOffset + (index * 2 * Math.PI) / ring.screwHoles;
      drill(ring.screwDiameter, centerX + ring.radius * Math.cos(angle), centerY + ring.radius * Math.sin(angle));
    }
  };

  drillRing(boxExhaust.ringOne);
  drillRing(boxExhaust.ringTwo);

  return cuts;
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
