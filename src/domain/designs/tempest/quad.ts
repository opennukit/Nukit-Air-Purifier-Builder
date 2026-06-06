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
  TempestCordPassThroughPlacement,
  TempestFanLayout,
  TempestFilterLayout,
  TempestFrameModel,
  TempestModelPlan,
  TempestPrintablePose,
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
  if (arrangement.type !== "four-side-filter-tower") {
    return assertNever(arrangement.type as never);
  }
  return arrangement;
}

function expectQuadFilterLayout(
  filterLayout: TempestFilterLayout,
): Extract<TempestFilterLayout, { readonly topology: "quad" }> {
  if (filterLayout.topology !== "quad") {
    return assertNever(filterLayout.topology as never);
  }
  return filterLayout;
}

function towerStructuralOffset(arrangement: QuadArrangement, frame: TempestFrameSettings): Millimeters {
  return frame.outsideFlangeThickness + arrangement.filter.thickness + frame.wallThickness;
}

export function createQuadBox(settings: TempestSettings, frame: TempestFrameModel): TempestBoxEnvelope {
  const arrangement = expectQuadArrangement(settings.arrangement);
  const offset = towerStructuralOffset(arrangement, frame);
  const height = frame.wallThickness + arrangement.filter.faceHeight + frame.outsideFlangeThickness;
  return {
    width: arrangement.filter.faceWidth + 2 * offset,
    depth: arrangement.filter.faceWidth + 2 * offset,
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
  const zMin = frame.wallThickness;
  const zMax = box.height - frame.outsideFlangeThickness;
  const pocket: TempestTowerFilterPocket = {
    width: arrangement.filter.faceWidth,
    height: arrangement.filter.faceHeight,
    depth: arrangement.filter.thickness,
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
      quadWallRect(wall, box, structuralOffset, frame.outsideFlangeThickness, arrangement.filter.thickness),
    ),
    filterPockets: mapTempestWalls(() => pocket),
    loading: {
      type: "top-plate-slots",
      slotCount: 4,
    },
  };
}

// The filter-pocket rect for one wall, in model coordinates. The pocket is a thin
// slab one filter-thickness deep, set one outer-wall in from the outer face and
// running between the two structural offsets on the in-plane span.
function quadWallRect(
  wall: TempestWall,
  box: TempestBoxEnvelope,
  structuralOffset: Millimeters,
  outsideFlange: Millimeters,
  filterThickness: Millimeters,
): TempestQuadWallRect {
  const planes = { innerPlaneOffset: structuralOffset, outerPlaneOffset: outsideFlange };
  if (wall === "front") {
    return {
      xMin: structuralOffset,
      xMax: box.width - structuralOffset,
      yMin: outsideFlange,
      yMax: outsideFlange + filterThickness,
      inletNormalAxis: "y",
      ...planes,
    };
  }
  if (wall === "back") {
    return {
      xMin: structuralOffset,
      xMax: box.width - structuralOffset,
      yMin: box.depth - outsideFlange - filterThickness,
      yMax: box.depth - outsideFlange,
      inletNormalAxis: "y",
      ...planes,
    };
  }
  if (wall === "left") {
    return {
      xMin: outsideFlange,
      xMax: outsideFlange + filterThickness,
      yMin: structuralOffset,
      yMax: box.depth - structuralOffset,
      inletNormalAxis: "x",
      ...planes,
    };
  }
  return {
    xMin: box.width - outsideFlange - filterThickness,
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
  filterLayout: TempestFilterLayout,
): Extract<TempestFanLayout, { readonly topology: "quad" }> {
  const quadFilter = expectQuadFilterLayout(filterLayout);
  const bodyDepth = tempestFanBodyDepth(settings.fan.diameter);
  const screwPitch = tempestFanScrewPitch(settings.fan.diameter);
  const minimumCenterFromEdge = quadFilter.structuralOffset + settings.fan.diameter / 2;
  const positionsX = towerFanPositions(towerFansPerSide(box.width, minimumCenterFromEdge, settings.fan.diameter), box.width, settings.fan.diameter);
  const positionsY = towerFanPositions(towerFansPerSide(box.depth, minimumCenterFromEdge, settings.fan.diameter), box.depth, settings.fan.diameter);
  return {
    topology: "quad",
    bodyDepth,
    screwPitch,
    minimumCenterFromEdge,
    topExhaust: settings.fan.topExhaust ?? "fan-grid",
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
  filterLayout: TempestFilterLayout,
): TempestCordPassThroughPlacement {
  if (settings.cordPassThrough.type === "none") {
    return { type: "none" };
  }
  const cord = settings.cordPassThrough;
  const quadFilter = expectQuadFilterLayout(filterLayout);
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

export const quadPlan: TempestModelPlan = {
  topology: "quad",
  box: createQuadBox,
  filterLayout: createQuadFilterLayout,
  fanLayout: createQuadFanLayout,
  cordPlacement: (settings, _box, filterLayout) => createQuadCordPlacement(settings, filterLayout),
  pose: (box) => createQuadPose(box),
};
