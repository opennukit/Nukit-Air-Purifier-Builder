import type { TempestChunkGrid, TempestFanLayout, TempestFilterLayout, TempestModel } from "@/domain/designs/tempest/model";
import type { TempestExtrudeAxis } from "@/domain/designs/tempest/shared";
import { matchTopology } from "@/domain/designs/tempest/topology";
import type { GeometryContext } from "./context";
import { CORD_CYLINDER_SEGMENTS, EPSILON_LIP, SHELL_OVERLAP_MM } from "./context";
import { cylinderAlong, cylinderAlongFromStart, unionAll } from "./primitives";

type AlignmentPinSpec = { readonly diameter: number; readonly holeDepth: number; readonly spacing: number };

// #######################################
// Cord Pass-Through
// #######################################

export function cordHoleCylinders<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid[] {
  const cord = model.cordPassThrough;
  if (cord.type === "none") {
    return [];
  }
  if (cord.type === "top-cylinder") {
    return [cylinderAlong(ctx, "z", [cord.x, cord.y, cord.zStart + cord.depth / 2], cord.depth + 2 * EPSILON_LIP, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }

  const wallCenter = model.frame.wallThickness / 2;
  const oppositeWallCenter = cord.wall === "front" || cord.wall === "back" ? model.box.depth - wallCenter : model.box.width - wallCenter;
  const length = model.frame.wallThickness + 2 * SHELL_OVERLAP_MM;
  if (cord.wall === "front") {
    return [cylinderAlong(ctx, "y", [cord.positionAlongWall, wallCenter, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  if (cord.wall === "back") {
    return [cylinderAlong(ctx, "y", [cord.positionAlongWall, oppositeWallCenter, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  if (cord.wall === "left") {
    return [cylinderAlong(ctx, "x", [wallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  return [cylinderAlong(ctx, "x", [oppositeWallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
}

// #######################################
// Alignment Pin Placements (pure)
// #######################################

// One alignment-pin site in source (as-modelled) millimeters: the pin's center
// point on the seam plane; the pin hole runs holeDepth into each chunk from
// here along `axis`. This is the single source of the pin-candidate math —
// pinHoles turns these into CSG cylinders, and the exploded preview renders
// them as filament pins.
export type TempestAlignmentPinPlacement = {
  readonly position: readonly [number, number, number];
  readonly axis: TempestExtrudeAxis;
  // Optional shallower half-depth into each chunk (millimeters). Absent means the
  // full pin.holeDepth. Set for top-plate pins that must stop short of a
  // perpendicular hole (fan-grid opening or screw hole).
  readonly holeDepth?: number;
};

export function tempestAlignmentPinPlacements(model: TempestModel, chunkGrid: TempestChunkGrid): readonly TempestAlignmentPinPlacement[] {
  if (model.settings.alignmentPins.type === "disabled") {
    return [];
  }
  const pin = model.settings.alignmentPins;
  if (
    pin.diameter <= 0 ||
    pin.holeDepth <= 0 ||
    pin.spacing <= 0 ||
    (chunkGrid.countX <= 1 && chunkGrid.countY <= 1 && chunkGrid.countZ <= 1)
  ) {
    return [];
  }

  return matchTopology(model, {
    sandwich: (m) => pinPlacementsSandwich(m, m.filterLayout, chunkGrid, pin),
    quad: (m) => pinPlacementsQuad(m, m.filterLayout, m.fanLayout, chunkGrid, pin),
  });
}

// The placements that survive the CSG build, as pure data: the sandwich build
// subtracts the wall fan bores from the pin candidates, so a placement whose
// center sits inside a bore is dropped here too. A pin that merely grazes a
// bore keeps its (still usable) hole in both views.
export function tempestPinPlacementsClearOfFans(model: TempestModel, chunkGrid: TempestChunkGrid): readonly TempestAlignmentPinPlacement[] {
  const placements = tempestAlignmentPinPlacements(model, chunkGrid);
  return matchTopology(model, {
    sandwich: (m) => {
      const bores = sandwichFanBores(m, m.fanLayout);
      return placements.filter((placement) => !bores.some((bore) => boreSwallowsPin(bore, placement, m.frame.wallThickness)));
    },
    quad: () => placements,
  });
}

// #######################################
// Alignment Pin Holes (CSG)
// #######################################

export function pinHoles<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  chunkGrid: TempestChunkGrid,
): Solid[] {
  if (model.settings.alignmentPins.type === "disabled") {
    return [];
  }
  const pin = model.settings.alignmentPins;
  const placements = tempestAlignmentPinPlacements(model, chunkGrid);
  if (placements.length === 0) {
    return [];
  }
  const candidates = placements.map((placement) => pinHoleCylinder(ctx, placement, pin));

  return matchTopology(model, {
    sandwich: (m) => {
      // Keep pins clear of the fan bodies so a seam pin never lands in a fan bore.
      const fanZones = fanBodyZones(ctx, m, m.fanLayout);
      const candidateGeometry = unionAll(ctx, candidates);
      return [fanZones.length === 0 ? candidateGeometry : ctx.modeling.booleans.subtract(candidateGeometry, unionAll(ctx, fanZones))];
    },
    quad: () => [unionAll(ctx, candidates)],
  });
}

function pinHoleCylinder<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  placement: TempestAlignmentPinPlacement,
  pin: AlignmentPinSpec,
): Solid {
  const [x, y, z] = placement.position;
  const depth = placement.holeDepth ?? pin.holeDepth;
  const start: readonly [number, number, number] =
    placement.axis === "x" ? [x - depth, y, z] : placement.axis === "y" ? [x, y - depth, z] : [x, y, z - depth];
  return cylinderAlongFromStart(ctx, placement.axis, start, 2 * depth, pin.diameter / 2);
}

function pinPlacementsSandwich(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
  chunkGrid: TempestChunkGrid,
  pin: AlignmentPinSpec,
): TempestAlignmentPinPlacement[] {
  const placements: TempestAlignmentPinPlacement[] = [];

  if (chunkGrid.countX > 1) {
    for (let index = 1; index < chunkGrid.countX; index += 1) {
      const seamX = chunkGrid.boundariesX[index];
      for (const wallY of [model.frame.wallThickness / 2, model.box.depth - model.frame.wallThickness / 2]) {
        for (const gridZ of rimPositions(model.frame.outsideFlangeThickness, model.box.height - model.frame.outsideFlangeThickness, pin.spacing)) {
          placements.push({ position: [seamX, wallY, gridZ], axis: "x" });
        }
      }
      for (const frameZ of horizontalFrameMidlinesWithOpening(model, filterLayout)) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.frame.rim, pin.spacing)) {
          placements.push({ position: [seamX, gridY, frameZ], axis: "x" });
        }
        for (const gridY of rimPositions(model.box.depth - model.frame.rim, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          placements.push({ position: [seamX, gridY, frameZ], axis: "x" });
        }
      }
      for (const frameZ of horizontalSolidPlateMidlines(model, filterLayout)) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          placements.push({ position: [seamX, gridY, frameZ], axis: "x" });
        }
      }
    }
  }

  if (chunkGrid.countY > 1) {
    for (let index = 1; index < chunkGrid.countY; index += 1) {
      const seamY = chunkGrid.boundariesY[index];
      for (const wallX of [model.frame.wallThickness / 2, model.box.width - model.frame.wallThickness / 2]) {
        for (const gridZ of rimPositions(model.frame.outsideFlangeThickness, model.box.height - model.frame.outsideFlangeThickness, pin.spacing)) {
          placements.push({ position: [wallX, seamY, gridZ], axis: "y" });
        }
      }
      for (const frameZ of horizontalFrameMidlinesWithOpening(model, filterLayout)) {
        for (const gridX of rimPositions(model.frame.wallThickness, model.frame.rim, pin.spacing)) {
          placements.push({ position: [gridX, seamY, frameZ], axis: "y" });
        }
        for (const gridX of rimPositions(model.box.width - model.frame.rim, model.box.width - model.frame.wallThickness, pin.spacing)) {
          placements.push({ position: [gridX, seamY, frameZ], axis: "y" });
        }
      }
      for (const frameZ of horizontalSolidPlateMidlines(model, filterLayout)) {
        for (const gridX of rimPositions(model.frame.wallThickness, model.box.width - model.frame.wallThickness, pin.spacing)) {
          placements.push({ position: [gridX, seamY, frameZ], axis: "y" });
        }
      }
    }
  }

  if (chunkGrid.countZ > 1) {
    for (let index = 1; index < chunkGrid.countZ; index += 1) {
      const seamZ = chunkGrid.boundariesZ[index];
      for (const wallY of [model.frame.wallThickness / 2, model.box.depth - model.frame.wallThickness / 2]) {
        for (const gridX of rimPositions(0, model.box.width, pin.spacing)) {
          placements.push({ position: [gridX, wallY, seamZ], axis: "z" });
        }
      }
      for (const wallX of [model.frame.wallThickness / 2, model.box.width - model.frame.wallThickness / 2]) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          placements.push({ position: [wallX, gridY, seamZ], axis: "z" });
        }
      }
    }
  }

  return placements;
}

function pinPlacementsQuad(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
  chunkGrid: TempestChunkGrid,
  pin: AlignmentPinSpec,
): TempestAlignmentPinPlacement[] {
  const placements: TempestAlignmentPinPlacement[] = [];
  const wallZLow = filterLayout.bottomPlateThickness;
  const wallZHigh = model.box.height - filterLayout.topPlateThickness;
  const topPlateMidZ = model.box.height - filterLayout.topPlateThickness / 2;
  // Holes a top-plate pin must not pierce (fan-grid grills + their screw holes).
  const topHoles = quadTopPlateHoles(model, fanLayout);
  // A central top-plate pin this close to a perpendicular seam would collide with
  // the perpendicular pin at that grid corner; drop it (other pins still align the
  // pieces). Clearance covers the perpendicular pin's reach plus its width.
  const cornerClearance = pin.holeDepth + pin.diameter;
  const interiorSeamsX = chunkGrid.boundariesX.slice(1, -1);
  const interiorSeamsY = chunkGrid.boundariesY.slice(1, -1);
  const nearSeam = (coordinate: number, seams: readonly number[]): boolean =>
    seams.some((seam) => Math.abs(coordinate - seam) < cornerClearance);
  // The structural wall between each filter pocket and the air chamber: its inner
  // face is the carried chamber-face plane, so its midline sits half a wall in.
  // (All four rects share innerPlaneOffset === structuralOffset.)
  const innerWallMidlineLow = filterLayout.wallRects.front.innerPlaneOffset - model.frame.wallThickness / 2;
  const innerWallMidlineHighX = model.box.width - innerWallMidlineLow;
  const innerWallMidlineHighY = model.box.depth - innerWallMidlineLow;

  if (chunkGrid.countX > 1) {
    for (let index = 1; index < chunkGrid.countX; index += 1) {
      const seamX = chunkGrid.boundariesX[index];
      for (const wallY of [model.frame.outsideFlangeThickness / 2, model.box.depth - model.frame.outsideFlangeThickness / 2]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          placements.push({ position: [seamX, wallY, gridZ], axis: "x" });
        }
      }
      for (const wallY of [innerWallMidlineLow, innerWallMidlineHighY]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          placements.push({ position: [seamX, wallY, gridZ], axis: "x" });
        }
      }
      for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
        placements.push({ position: [seamX, gridY, filterLayout.bottomPlateThickness / 2], axis: "x" });
      }
      for (const gridY of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        placements.push({ position: [seamX, gridY, model.box.height - filterLayout.topPlateThickness / 2], axis: "x" });
      }
      for (const gridY of rimPositions(model.box.depth - filterLayout.structuralOffset, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
        placements.push({ position: [seamX, gridY, model.box.height - filterLayout.topPlateThickness / 2], axis: "x" });
      }
      // Central top plate (over the air chamber): pin between fan grills/screws,
      // each shortened to stop short of the holes it would otherwise pierce.
      for (const gridY of rimPositions(filterLayout.structuralOffset, model.box.depth - filterLayout.structuralOffset, pin.spacing)) {
        if (nearSeam(gridY, interiorSeamsY)) {
          continue;
        }
        const depth = clampedTopPinDepth(topHoles, seamX, gridY, "x", pin.holeDepth);
        if (depth !== null) {
          placements.push({ position: [seamX, gridY, topPlateMidZ], axis: "x", holeDepth: depth });
        }
      }
    }
  }

  if (chunkGrid.countY > 1) {
    for (let index = 1; index < chunkGrid.countY; index += 1) {
      const seamY = chunkGrid.boundariesY[index];
      for (const wallX of [model.frame.outsideFlangeThickness / 2, model.box.width - model.frame.outsideFlangeThickness / 2]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          placements.push({ position: [wallX, seamY, gridZ], axis: "y" });
        }
      }
      for (const wallX of [innerWallMidlineLow, innerWallMidlineHighX]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          placements.push({ position: [wallX, seamY, gridZ], axis: "y" });
        }
      }
      for (const gridX of rimPositions(model.frame.wallThickness, model.box.width - model.frame.wallThickness, pin.spacing)) {
        placements.push({ position: [gridX, seamY, filterLayout.bottomPlateThickness / 2], axis: "y" });
      }
      for (const gridX of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        placements.push({ position: [gridX, seamY, model.box.height - filterLayout.topPlateThickness / 2], axis: "y" });
      }
      for (const gridX of rimPositions(model.box.width - filterLayout.structuralOffset, model.box.width - model.frame.outsideFlangeThickness, pin.spacing)) {
        placements.push({ position: [gridX, seamY, model.box.height - filterLayout.topPlateThickness / 2], axis: "y" });
      }
      for (const gridX of rimPositions(filterLayout.structuralOffset, model.box.width - filterLayout.structuralOffset, pin.spacing)) {
        if (nearSeam(gridX, interiorSeamsX)) {
          continue;
        }
        const depth = clampedTopPinDepth(topHoles, gridX, seamY, "y", pin.holeDepth);
        if (depth !== null) {
          placements.push({ position: [gridX, seamY, topPlateMidZ], axis: "y", holeDepth: depth });
        }
      }
    }
  }

  if (chunkGrid.countZ > 1) {
    for (let index = 1; index < chunkGrid.countZ; index += 1) {
      const seamZ = chunkGrid.boundariesZ[index];
      for (const wallY of [model.frame.outsideFlangeThickness / 2, model.box.depth - model.frame.outsideFlangeThickness / 2]) {
        for (const gridX of rimPositions(0, model.box.width, pin.spacing)) {
          placements.push({ position: [gridX, wallY, seamZ], axis: "z" });
        }
      }
      for (const wallX of [model.frame.outsideFlangeThickness / 2, model.box.width - model.frame.outsideFlangeThickness / 2]) {
        for (const gridY of rimPositions(model.frame.outsideFlangeThickness, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
          placements.push({ position: [wallX, gridY, seamZ], axis: "z" });
        }
      }
      for (const wallY of [innerWallMidlineLow, innerWallMidlineHighY]) {
        for (const gridX of rimPositions(filterLayout.structuralOffset, model.box.width - filterLayout.structuralOffset, pin.spacing)) {
          placements.push({ position: [gridX, wallY, seamZ], axis: "z" });
        }
      }
      for (const wallX of [innerWallMidlineLow, innerWallMidlineHighX]) {
        for (const gridY of rimPositions(filterLayout.structuralOffset, model.box.depth - filterLayout.structuralOffset, pin.spacing)) {
          placements.push({ position: [wallX, gridY, seamZ], axis: "z" });
        }
      }
      const pinXY = filterLayout.structuralOffset - model.frame.wallThickness;
      for (const centerX of [pinXY, model.box.width - pinXY]) {
        for (const centerY of [pinXY, model.box.depth - pinXY]) {
          placements.push({ position: [centerX, centerY, seamZ], axis: "z" });
        }
      }
    }
  }

  return placements;
}

// #######################################
// Top-Plate Pin Hole Clamping
// #######################################

// How far a shortened top-plate pin hole stops before a perpendicular hole.
const TOP_PIN_HOLE_STANDOFF_MM = 1;
// The shallowest hole still worth a pin; anything less is dropped.
const TOP_PIN_MIN_DEPTH_MM = 3;

type TopPlateHoleCircle = { readonly cx: number; readonly cy: number; readonly r: number };

// The perpendicular holes a top-plate pin must avoid: each fan's grill opening
// and its four screw holes. `single-box-fan` clears the whole centre, so it gets
// no central pins (returns null).
function quadTopPlateHoles(
  model: TempestModel,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
): readonly TopPlateHoleCircle[] | null {
  if (fanLayout.topExhaust !== "fan-grid") {
    return null;
  }
  const grillRadius = model.settings.fan.diameter / 2;
  const screwRadius = model.settings.fan.screwHoleDiameter / 2;
  const screwDelta = fanLayout.screwPitch / 2;
  const circles: TopPlateHoleCircle[] = [];
  for (const fx of fanLayout.positionsX) {
    for (const fy of fanLayout.positionsY) {
      circles.push({ cx: fx, cy: fy, r: grillRadius });
      for (const sx of [fx - screwDelta, fx + screwDelta]) {
        for (const sy of [fy - screwDelta, fy + screwDelta]) {
          circles.push({ cx: sx, cy: sy, r: screwRadius });
        }
      }
    }
  }
  return circles;
}

// The deepest (symmetric) half-depth a top-plate pin at (sx, sy) running along
// `axis` can reach before coming within the standoff of any hole, on either
// side of the seam. Returns null when the pin would start inside a hole or can't
// reach the minimum useful depth.
function clampedTopPinDepth(
  holes: readonly TopPlateHoleCircle[] | null,
  sx: number,
  sy: number,
  axis: "x" | "y",
  fullDepth: number,
): number | null {
  if (holes === null) {
    return null;
  }
  let depth = fullDepth;
  for (const direction of [1, -1] as const) {
    for (const hole of holes) {
      const perpendicularOffset = axis === "x" ? sy - hole.cy : sx - hole.cx;
      if (Math.abs(perpendicularOffset) >= hole.r) {
        continue;
      }
      const halfChord = Math.sqrt(hole.r * hole.r - perpendicularOffset * perpendicularOffset);
      const center = axis === "x" ? hole.cx : hole.cy;
      const start = axis === "x" ? sx : sy;
      const low = center - halfChord;
      const high = center + halfChord;
      if (start > low && start < high) {
        return null;
      }
      const nearEdge = direction > 0 ? low : high;
      const aheadDistance = (nearEdge - start) * direction;
      if (aheadDistance >= 0) {
        depth = Math.min(depth, aheadDistance - TOP_PIN_HOLE_STANDOFF_MM);
      }
    }
  }
  return depth >= TOP_PIN_MIN_DEPTH_MM ? depth : null;
}

// #######################################
// Wall Fan Bores
// #######################################

// FAN_BORE_PLACEMENT: fanBodyZones (CSG) and sandwichFanBores (pure) describe
// the same wall fan bores — keep their placement math in lockstep.

function fanBodyZones<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>,
): Solid[] {
  const { transforms } = ctx.modeling;
  const oneWall = (positions: readonly number[]) =>
    positions.map((position) =>
      cylinderAlongFromStart(ctx, "y", [position, -1, fanLayout.localVerticalCenter], model.frame.wallThickness + 2, model.settings.fan.diameter / 2),
    );

  return [
    ...oneWall(fanLayout.walls.front.positionsAlongWall).map((geometry) =>
      transforms.translate([0, 0, model.frame.outsideFlangeThickness], geometry),
    ),
    ...oneWall(fanLayout.walls.back.positionsAlongWall).map((geometry) =>
      transforms.translate([model.box.width, model.box.depth, model.frame.outsideFlangeThickness], transforms.rotateZ(Math.PI, geometry)),
    ),
    ...oneWall(fanLayout.walls.left.positionsAlongWall).map((geometry) =>
      transforms.translate([0, model.box.depth, model.frame.outsideFlangeThickness], transforms.rotateZ(-Math.PI / 2, geometry)),
    ),
    ...oneWall(fanLayout.walls.right.positionsAlongWall).map((geometry) =>
      transforms.translate([model.box.width, 0, model.frame.outsideFlangeThickness], transforms.rotateZ(Math.PI / 2, geometry)),
    ),
  ];
}

// A wall fan bore as data: its center in source millimeters, the wall-normal
// axis it runs along, and the fan radius.
type SandwichFanBore = {
  readonly normalAxis: "x" | "y";
  readonly center: readonly [number, number, number];
  readonly radius: number;
};

function sandwichFanBores(
  model: TempestModel,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>,
): SandwichFanBore[] {
  const radius = model.settings.fan.diameter / 2;
  const z = model.frame.outsideFlangeThickness + fanLayout.localVerticalCenter;
  const wallMid = model.frame.wallThickness / 2;
  const { width, depth } = model.box;
  return [
    ...fanLayout.walls.front.positionsAlongWall.map((position): SandwichFanBore => ({ normalAxis: "y", center: [position, wallMid, z], radius })),
    ...fanLayout.walls.back.positionsAlongWall.map((position): SandwichFanBore => ({ normalAxis: "y", center: [width - position, depth - wallMid, z], radius })),
    ...fanLayout.walls.left.positionsAlongWall.map((position): SandwichFanBore => ({ normalAxis: "x", center: [wallMid, depth - position, z], radius })),
    ...fanLayout.walls.right.positionsAlongWall.map((position): SandwichFanBore => ({ normalAxis: "x", center: [width - wallMid, position, z], radius })),
  ];
}

function boreSwallowsPin(bore: SandwichFanBore, placement: TempestAlignmentPinPlacement, wallThickness: number): boolean {
  const [pinX, pinY, pinZ] = placement.position;
  const [boreX, boreY, boreZ] = bore.center;
  const alongNormal = bore.normalAxis === "x" ? pinX - boreX : pinY - boreY;
  if (Math.abs(alongNormal) > wallThickness / 2 + 1) {
    return false;
  }
  const planarDistance = bore.normalAxis === "x" ? Math.hypot(pinY - boreY, pinZ - boreZ) : Math.hypot(pinX - boreX, pinZ - boreZ);
  return planarDistance < bore.radius;
}

// #######################################
// Seam Frame Midlines
// #######################################

function horizontalFrameMidlinesWithOpening(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): readonly number[] {
  return [
    model.box.height - model.frame.outsideFlangeThickness / 2,
    ...(filterLayout.bottomPanel === "open-frame" ? [model.frame.outsideFlangeThickness / 2] : []),
    ...filterLayout.flanges.map((flange) => (flange.zBottom + flange.zTop) / 2),
  ];
}

function horizontalSolidPlateMidlines(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): readonly number[] {
  return filterLayout.bottomPanel === "solid-plate" ? [model.frame.outsideFlangeThickness / 2] : [];
}

function rimPositions(low: number, high: number, spacing: number): readonly number[] {
  const width = high - low;
  const count = width <= 0 ? 0 : Math.max(1, Math.floor(width / spacing));
  const step = count > 0 ? width / count : 0;
  return count === 0 ? [] : Array.from({ length: count }, (_, index) => low + (index + 0.5) * step);
}
