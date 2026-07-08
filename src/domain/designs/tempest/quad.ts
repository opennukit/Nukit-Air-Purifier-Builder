import type { Millimeters } from "@/domain/units";
import { assertNever } from "./topology";
import {
  fanSpacing,
  filterPocketThickness,
  mapTempestWalls,
  tempestFanBodyDepth,
  tempestFanScrewPitch,
  type TempestCordPassThrough,
  type TempestFilterArrangement,
  type TempestFrameSettings,
  type TempestSettings,
  type TempestWall,
} from "./shared";
import type {
  TempestBoxEnvelope,
  TempestFanLayout,
  TempestFilterLayout,
  TempestFrameModel,
  TempestModelPlan,
  TempestNoCord,
  TempestPrintablePose,
  TempestQuadCord,
  TempestQuadWallRect,
  TempestTowerFilterPocket,
} from "./model";

// #######################################
// Quad (4-filter side-filter tower) Plan
// #######################################

// Minimum gap from the air-chamber edge to the tower cord hole.
const CORD_TOWER_MIN_EDGE_MM = 2;
// Clearance kept between the cord hole and a fan body when auto-shifting.
const CORD_FAN_CLEARANCE_MM = 1;

type QuadArrangement = Extract<TempestFilterArrangement, { readonly type: "four-side-filter-tower" }>;

function expectQuadArrangement(arrangement: TempestFilterArrangement): QuadArrangement {
  switch (arrangement.type) {
    case "four-side-filter-tower":
      return arrangement;
    case "single-horizontal-top-filter":
    case "dual-horizontal-sandwich":
      throw new Error("expectQuadArrangement: sandwich arrangement reached the quad plan");
    default:
      return assertNever(arrangement);
  }
}

// The fit clearance sits inside the structural offset: the pocket deepens by one
// clearance (see filterPocketThickness — the play goes on the chamber side) and
// the inner wall steps back with it, keeping a full wallThickness between pocket
// and air chamber.
function towerStructuralOffset(arrangement: QuadArrangement, frame: TempestFrameSettings): Millimeters {
  return frame.outsideFlangeThickness + filterPocketThickness(arrangement.filter.thickness, frame) + frame.wallThickness;
}

// The corner feet length (>= 0).
function towerFeetLength(arrangement: QuadArrangement): Millimeters {
  return Math.max(0, arrangement.feetLength);
}

// Extra body height added below the air chamber when the bottom filter is on: an
// outer retaining flange plus the filter pocket. The grid plate (wallThickness)
// that separates that pocket from the chamber is counted as the normal bottom
// plate, so it is NOT included here. Zero when there is no bottom filter.
function towerBottomFilterStack(arrangement: QuadArrangement, frame: TempestFrameSettings): Millimeters {
  return arrangement.bottomFilter ? frame.outsideFlangeThickness + filterPocketThickness(arrangement.filter.thickness, frame) : 0;
}

// The z of the air-chamber floor: feet + bottom-filter stack + the bottom plate.
function towerChamberFloorZ(arrangement: QuadArrangement, frame: TempestFrameSettings): Millimeters {
  return towerFeetLength(arrangement) + towerBottomFilterStack(arrangement, frame) + frame.wallThickness;
}

export function createQuadBox(settings: TempestSettings, frame: TempestFrameModel): TempestBoxEnvelope {
  const arrangement = expectQuadArrangement(settings.arrangement);
  const offset = towerStructuralOffset(arrangement, frame);
  const chamberFloorZ = towerChamberFloorZ(arrangement, frame);
  const height = chamberFloorZ + arrangement.filter.faceHeight + frame.outsideFlangeThickness;
  // In-plane the pocket spans the gap between the two structural offsets, so the
  // measured face width gets one slide-in clearance per side.
  return {
    width: arrangement.filter.faceWidth + 2 * frame.filterFitClearance + 2 * offset,
    depth: arrangement.filter.faceWidth + 2 * frame.filterFitClearance + 2 * offset,
    height,
    wallHeight: arrangement.filter.faceHeight,
  };
}

export function createQuadFilterLayout(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
  frame: TempestFrameModel,
): Extract<TempestFilterLayout, { readonly topology: "quad" }> {
  const arrangement = expectQuadArrangement(settings.arrangement);
  const structuralOffset = towerStructuralOffset(arrangement, frame);
  const pocketDepth = filterPocketThickness(arrangement.filter.thickness, frame);
  const zMin = towerChamberFloorZ(arrangement, frame);
  const zMax = box.height - frame.outsideFlangeThickness;
  // Width gets the per-side clearance; depth gets the single-sided clearance
  // (see towerStructuralOffset). Height stays measured: the filter loads from the
  // top, so the vertical fit never has to slide past anything.
  const pocket: TempestTowerFilterPocket = {
    width: arrangement.filter.faceWidth + 2 * frame.filterFitClearance,
    height: arrangement.filter.faceHeight,
    depth: pocketDepth,
  };
  return {
    topology: "quad",
    filterCount: 4,
    filter: arrangement.filter,
    structuralOffset,
    bottomPlateThickness: zMin,
    topPlateThickness: frame.outsideFlangeThickness,
    feetLength: towerFeetLength(arrangement),
    bottomFilter: arrangement.bottomFilter,
    airChamber: {
      xMin: structuralOffset,
      xMax: box.width - structuralOffset,
      yMin: structuralOffset,
      yMax: box.depth - structuralOffset,
      zMin,
      zMax,
    },
    wallRects: mapTempestWalls((wall) =>
      quadWallRect(wall, box, structuralOffset, frame.outsideFlangeThickness, pocketDepth),
    ),
    filterPockets: mapTempestWalls(() => pocket),
    loading: {
      // The tower loads the filters through one cap plate. "front" (the visual
      // bottom) loads from the bottom plate; everything else from the top plate.
      type: settings.filterSlot.wall === "front" ? "bottom-plate-slots" : "top-plate-slots",
      slotCount: 4,
    },
  };
}

// The filter-pocket rect for one wall, in model coordinates. The pocket is a thin
// slab one pocket-depth (filter thickness + fit clearance) deep, set one outer-wall
// in from the outer face and running between the two structural offsets on the
// in-plane span.
function quadWallRect(
  wall: TempestWall,
  box: TempestBoxEnvelope,
  structuralOffset: Millimeters,
  outsideFlange: Millimeters,
  pocketDepth: Millimeters,
): TempestQuadWallRect {
  const planes = { innerPlaneOffset: structuralOffset, outerPlaneOffset: outsideFlange };
  if (wall === "front") {
    return {
      xMin: structuralOffset,
      xMax: box.width - structuralOffset,
      yMin: outsideFlange,
      yMax: outsideFlange + pocketDepth,
      inletNormalAxis: "y",
      ...planes,
    };
  }
  if (wall === "back") {
    return {
      xMin: structuralOffset,
      xMax: box.width - structuralOffset,
      yMin: box.depth - outsideFlange - pocketDepth,
      yMax: box.depth - outsideFlange,
      inletNormalAxis: "y",
      ...planes,
    };
  }
  if (wall === "left") {
    return {
      xMin: outsideFlange,
      xMax: outsideFlange + pocketDepth,
      yMin: structuralOffset,
      yMax: box.depth - structuralOffset,
      inletNormalAxis: "x",
      ...planes,
    };
  }
  return {
    xMin: box.width - outsideFlange - pocketDepth,
    xMax: box.width - outsideFlange,
    yMin: structuralOffset,
    yMax: box.depth - structuralOffset,
    inletNormalAxis: "x",
    ...planes,
  };
}

export function createQuadFanLayout(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
  quadFilter: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): Extract<TempestFanLayout, { readonly topology: "quad" }> {
  const bodyDepth = tempestFanBodyDepth(settings.fan.diameter);
  const screwPitch = tempestFanScrewPitch(settings.fan.diameter);
  const topExhaust = settings.fan.topExhaust ?? "fan-grid";
  const minimumCenterFromEdge = quadFilter.structuralOffset + settings.fan.diameter / 2;
  // No grid of PC fans when: Box/Exhaust feeds the tower from an external box fan
  // over the central hole, or the user turned the top fans off (top bank = 0).
  const topFans = settings.fan.topFans;
  const topFansOff =
    topExhaust === "box-exhaust" || (topFans?.type === "fixed" && topFans.count === 0);
  const positionsX = topFansOff
    ? []
    : towerFanPositions(towerFansPerSide(box.width, minimumCenterFromEdge, settings.fan.diameter), box.width, settings.fan.diameter);
  const positionsY = topFansOff
    ? []
    : towerFanPositions(towerFansPerSide(box.depth, minimumCenterFromEdge, settings.fan.diameter), box.depth, settings.fan.diameter);
  return {
    topology: "quad",
    bodyDepth,
    screwPitch,
    minimumCenterFromEdge,
    topExhaust,
    columns: positionsX.length,
    rows: positionsY.length,
    positionsX,
    positionsY,
    fanCount: positionsX.length * positionsY.length,
  };
}

function towerFansPerSide(length: Millimeters, minimumCenterFromEdge: Millimeters, fanDiameter: Millimeters): number {
  const span = length - 2 * minimumCenterFromEdge;
  if (span < 0) {
    return 0;
  }
  return Math.max(0, Math.floor(1 + span / fanSpacing(fanDiameter)));
}

function towerFanPositions(fanCount: number, length: Millimeters, fanDiameter: Millimeters): readonly Millimeters[] {
  if (fanCount === 0) {
    return [];
  }
  const total = fanCount <= 1 ? 0 : (fanCount - 1) * fanSpacing(fanDiameter);
  const first = fanCount === 1 ? length / 2 : (length - total) / 2;
  return Array.from({ length: fanCount }, (_, index) => first + index * fanSpacing(fanDiameter));
}

export function createQuadCordPlacement(
  settings: TempestSettings,
  quadFilter: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
): TempestQuadCord | TempestNoCord {
  if (settings.cordPassThrough.type === "none") {
    return { type: "none" };
  }
  const cord = settings.cordPassThrough;
  const chamber = quadFilter.airChamber;
  const offset = Math.max(cord.diameter / 2 + CORD_TOWER_MIN_EDGE_MM, cord.cornerOffset);
  const corner = quadCordCorner(cord);
  const desiredX = corner.x === "max" ? chamber.xMax - offset : chamber.xMin + offset;
  const desiredY = corner.y === "max" ? chamber.yMax - offset : chamber.yMin + offset;
  // The tower routes the cord up through the top plate where the fan grid lives,
  // so auto-shift it to the nearest fan-free spot over the air chamber.
  const placement = avoidTowerFans(desiredX, desiredY, cord.diameter, settings.fan.diameter, chamber, fanLayout);
  return {
    topology: "quad",
    type: "top-cylinder",
    diameter: cord.diameter,
    x: placement.x,
    y: placement.y,
    zStart: chamber.zMax,
    depth: quadFilter.topPlateThickness,
  };
}

// Nudge the cord centre to the nearest point that keeps its hole clear of every
// fan's square footprint while staying inset over the air chamber. PC fans are
// square frames, so the cord clears a fan when it is far enough on EITHER axis.
function avoidTowerFans(
  desiredX: Millimeters,
  desiredY: Millimeters,
  cordDiameter: Millimeters,
  fanDiameter: Millimeters,
  chamber: { readonly xMin: Millimeters; readonly xMax: Millimeters; readonly yMin: Millimeters; readonly yMax: Millimeters },
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
): { readonly x: Millimeters; readonly y: Millimeters } {
  const reach = cordDiameter / 2 + fanDiameter / 2 + CORD_FAN_CLEARANCE_MM;
  const inset = cordDiameter / 2 + CORD_TOWER_MIN_EDGE_MM;
  const xMin = chamber.xMin + inset;
  const xMax = chamber.xMax - inset;
  const yMin = chamber.yMin + inset;
  const yMax = chamber.yMax - inset;
  const { positionsX, positionsY } = fanLayout;
  const clear = (x: number, y: number): boolean =>
    positionsX.every((fx) => positionsY.every((fy) => Math.abs(x - fx) >= reach || Math.abs(y - fy) >= reach));
  if (positionsX.length === 0 || positionsY.length === 0 || clear(desiredX, desiredY)) {
    return { x: desiredX, y: desiredY };
  }
  const clampX = (value: number): number => Math.min(xMax, Math.max(xMin, value));
  const clampY = (value: number): number => Math.min(yMax, Math.max(yMin, value));
  // Candidate coordinates: the desired value, the bounds, and the points just
  // clear of each fan row/column. The nearest valid (x, y) pair wins.
  const xs = [desiredX, xMin, xMax, ...positionsX.flatMap((fx) => [fx - reach, fx + reach])].map(clampX);
  const ys = [desiredY, yMin, yMax, ...positionsY.flatMap((fy) => [fy - reach, fy + reach])].map(clampY);
  let best: { x: number; y: number; distance: number } | null = null;
  for (const x of xs) {
    for (const y of ys) {
      if (!clear(x, y)) {
        continue;
      }
      const distance = Math.hypot(x - desiredX, y - desiredY);
      if (best === null || distance < best.distance) {
        best = { x, y, distance };
      }
    }
  }
  return best === null ? { x: desiredX, y: desiredY } : { x: best.x, y: best.y };
}

// Which corner of the air chamber the tower cord exits through, as min/max on
// each axis. The chosen wall+side maps to a corner: the cord hugs the high edge
// when the wall is back/right, or when a front/back/left/right wall's "right"
// side points to the high edge.
type QuadCordCorner = { readonly x: "min" | "max"; readonly y: "min" | "max" };

function quadCordCorner(cord: Extract<TempestCordPassThrough, { readonly type: "wall" }>): QuadCordCorner {
  const usesHighX = cord.wall === "right" || ((cord.wall === "front" || cord.wall === "back") && cord.side === "right");
  const usesHighY = cord.wall === "back" || ((cord.wall === "left" || cord.wall === "right") && cord.side === "right");
  return { x: usesHighX ? "max" : "min", y: usesHighY ? "max" : "min" };
}

// The tower always prints as-modelled.
export function createQuadPose(box: TempestBoxEnvelope): TempestPrintablePose {
  return {
    type: "source",
    envelope: { width: box.width, depth: box.depth, height: box.height },
  };
}

export const quadPlan: TempestModelPlan<"quad"> = {
  topology: "quad",
  box: createQuadBox,
  filterLayout: createQuadFilterLayout,
  fanLayout: createQuadFanLayout,
  cordPlacement: (settings, _box, filterLayout, fanLayout) => createQuadCordPlacement(settings, filterLayout, fanLayout),
  pose: (box) => createQuadPose(box),
};
