import type { Millimeters } from "@/domain/units";
import { assertNever } from "./topology";
import {
  fanSpacing,
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
// clearance (thickness direction is single-sided — the filter rests against the
// outer flange, so the play goes on the chamber side) and the inner wall steps
// back with it, keeping a full wallThickness between pocket and air chamber.
function towerStructuralOffset(arrangement: QuadArrangement, frame: TempestFrameSettings): Millimeters {
  return frame.outsideFlangeThickness + towerPocketDepth(arrangement, frame) + frame.wallThickness;
}

function towerPocketDepth(arrangement: QuadArrangement, frame: TempestFrameSettings): Millimeters {
  return arrangement.filter.thickness + frame.filterFitClearance;
}

export function createQuadBox(settings: TempestSettings, frame: TempestFrameModel): TempestBoxEnvelope {
  const arrangement = expectQuadArrangement(settings.arrangement);
  const offset = towerStructuralOffset(arrangement, frame);
  const height = frame.wallThickness + arrangement.filter.faceHeight + frame.outsideFlangeThickness;
  // In-plane the pocket spans the gap between the two structural offsets, so the
  // measured face width gets one slide-in clearance per side.
  return {
    width: arrangement.filter.faceWidth + 2 * frame.filterFitClearance + 2 * offset,
    depth: arrangement.filter.faceWidth + 2 * frame.filterFitClearance + 2 * offset,
    height,
    wallHeight: height - frame.wallThickness - frame.outsideFlangeThickness,
  };
}

export function createQuadFilterLayout(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
  frame: TempestFrameModel,
): Extract<TempestFilterLayout, { readonly topology: "quad" }> {
  const arrangement = expectQuadArrangement(settings.arrangement);
  const structuralOffset = towerStructuralOffset(arrangement, frame);
  const pocketDepth = towerPocketDepth(arrangement, frame);
  const zMin = frame.wallThickness;
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
    bottomPlateThickness: frame.wallThickness,
    topPlateThickness: frame.outsideFlangeThickness,
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
      type: "top-plate-slots",
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
): TempestQuadCord | TempestNoCord {
  if (settings.cordPassThrough.type === "none") {
    return { type: "none" };
  }
  const cord = settings.cordPassThrough;
  const offset = Math.max(cord.diameter / 2 + CORD_TOWER_MIN_EDGE_MM, cord.cornerOffset);
  const corner = quadCordCorner(cord);
  return {
    topology: "quad",
    type: "top-cylinder",
    diameter: cord.diameter,
    x: corner.x === "max" ? quadFilter.airChamber.xMax - offset : quadFilter.airChamber.xMin + offset,
    y: corner.y === "max" ? quadFilter.airChamber.yMax - offset : quadFilter.airChamber.yMin + offset,
    zStart: quadFilter.airChamber.zMax,
    depth: quadFilter.topPlateThickness,
  };
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
  cordPlacement: (settings, _box, filterLayout) => createQuadCordPlacement(settings, filterLayout),
  pose: (box) => createQuadPose(box),
};
