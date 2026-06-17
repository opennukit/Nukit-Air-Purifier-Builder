import type { Millimeters } from "@/domain/units";
import { assertNever } from "./topology";
import {
  cordPositionAlongWall,
  fanSpacing,
  finiteNonNegativeInteger,
  horizontalCordOffset,
  tempestFanBodyDepth,
  tempestFanScrewPitch,
  type TempestFanCountRequest,
  type TempestFilterArrangement,
  type TempestSettings,
  type TempestWall,
} from "./shared";
import type {
  TempestBoxEnvelope,
  TempestFanLayout,
  TempestFilterLayout,
  TempestFrameModel,
  TempestHorizontalFilterLayer,
  TempestHorizontalFlangeLayer,
  TempestModelPlan,
  TempestNoCord,
  TempestPlateFanLayout,
  TempestPlateFanPosition,
  TempestPrintablePose,
  TempestSandwichCord,
  TempestWallFanLayout,
} from "./model";

// #######################################
// Sandwich (1 / 2-filter horizontal) Plan
// #######################################

// Headroom added above the fan in the sandwich box height.
const HORIZONTAL_FAN_VERTICAL_PADDING_MM = 2;

type SandwichArrangement = Exclude<TempestFilterArrangement, { readonly type: "four-side-filter-tower" }>;

function expectSandwichArrangement(arrangement: TempestFilterArrangement): SandwichArrangement {
  switch (arrangement.type) {
    case "single-horizontal-top-filter":
    case "dual-horizontal-sandwich":
      return arrangement;
    case "four-side-filter-tower":
      throw new Error("expectSandwichArrangement: quad arrangement reached the sandwich plan");
    default:
      return assertNever(arrangement);
  }
}

// A single-filter top arrangement has one filter; the dual sandwich has two. This
// is the sandwich family's sub-variant count, not a topology decision.
function horizontalFilterCount(arrangement: SandwichArrangement): 1 | 2 {
  return arrangement.type === "single-horizontal-top-filter" ? 1 : 2;
}

export function createSandwichBox(settings: TempestSettings, frame: TempestFrameModel): TempestBoxEnvelope {
  const arrangement = expectSandwichArrangement(settings.arrangement);
  const filterCount = horizontalFilterCount(arrangement);
  // The chamber between the inside filter flange and the inside back wall. The
  // one-side "panel" (Back fans on) takes it straight from oneSidePanelDepth so a
  // shallow panel is possible; otherwise it's sized to clear a fan body, as the
  // original wall-mount and the 2-filter sandwich both are.
  const chamberDepth =
    filterCount === 1 && settings.oneSidePanelDepth !== undefined
      ? settings.oneSidePanelDepth
      : settings.fan.diameter + HORIZONTAL_FAN_VERTICAL_PADDING_MM;
  const height =
    chamberDepth +
    2 * frame.outsideFlangeThickness +
    filterCount * (arrangement.filter.thickness + frame.wallThickness);
  // The interior is the measured footprint plus the slide-in clearance per side,
  // so the filter drops in without press-fitting against the walls.
  return {
    width: arrangement.filter.footprintWidth + 2 * frame.filterFitClearance + 2 * frame.wallThickness,
    depth: arrangement.filter.footprintDepth + 2 * frame.filterFitClearance + 2 * frame.wallThickness,
    height,
    wallHeight: height - 2 * frame.outsideFlangeThickness,
  };
}

export function createSandwichFilterLayout(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
  frame: TempestFrameModel,
): Extract<TempestFilterLayout, { readonly topology: "sandwich" }> {
  const arrangement = expectSandwichArrangement(settings.arrangement);
  const filterSlot = settings.filterSlot;
  const filterCount = horizontalFilterCount(arrangement);
  const filters = Array.from({ length: filterCount }, (_, index) => {
    const zBottom = horizontalFilterZ(index, filterCount, box.height, frame.outsideFlangeThickness, arrangement.filter.thickness);
    return {
      index,
      zBottom,
      zTop: zBottom + arrangement.filter.thickness,
    };
  });
  const flanges =
    filterCount === 1
      ? [createHorizontalFlange("below-filter", filters[0], frame.insideFlangeThickness)]
      : [
          createHorizontalFlange("above-filter", filters[0], frame.insideFlangeThickness),
          createHorizontalFlange("below-filter", filters[1], frame.insideFlangeThickness),
        ];

  return {
    topology: "sandwich",
    filterCount,
    bottomPanel: filterCount === 1 ? "solid-plate" : "open-frame",
    filters,
    flanges,
    loading: {
      type: "wall-slots",
      slots: filters.map((filter) => ({
        filterIndex: filter.index,
        wall: filterSlot.wall,
        localZBottom: Math.max(0, filter.zBottom - filterSlot.clearance - frame.outsideFlangeThickness),
        localZTop: Math.min(box.wallHeight, filter.zTop + filterSlot.clearance - frame.outsideFlangeThickness),
      })),
    },
  };
}

function horizontalFilterZ(
  index: number,
  filterCount: 1 | 2,
  boxHeight: Millimeters,
  outsideFlangeThickness: Millimeters,
  filterThickness: Millimeters,
): Millimeters {
  if (filterCount === 1) {
    return boxHeight - outsideFlangeThickness - filterThickness;
  }
  return index === 0 ? outsideFlangeThickness : boxHeight - outsideFlangeThickness - filterThickness;
}

function createHorizontalFlange(
  type: TempestHorizontalFlangeLayer["type"],
  filter: TempestHorizontalFilterLayer,
  thickness: Millimeters,
): TempestHorizontalFlangeLayer {
  const zBottom = type === "below-filter" ? filter.zBottom - thickness : filter.zTop;
  return {
    type,
    filterIndex: filter.index,
    zBottom,
    zTop: zBottom + thickness,
  };
}

export function createSandwichFanLayout(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): Extract<TempestFanLayout, { readonly topology: "sandwich" }> {
  const arrangement = expectSandwichArrangement(settings.arrangement);
  const filterCount = filterLayout.filterCount;
  const bodyDepth = tempestFanBodyDepth(settings.fan.diameter);
  const screwPitch = tempestFanScrewPitch(settings.fan.diameter);
  const cornerSafeMinimum = settings.frame.wallThickness + bodyDepth + settings.fan.diameter / 2;
  const localVerticalCenter = horizontalFanVerticalCenter(
    filterCount,
    box.wallHeight,
    settings.fan.diameter,
    arrangement.filter.thickness,
    settings.frame.wallThickness,
    settings.cordPassThrough.type === "wall" ? settings.cordPassThrough.diameter : 0,
  );
  // A shallow one-side panel can't fit a fan body in its short side walls, so the
  // wall fans are forced off there (the Back grid lies flat on the plate and is
  // unaffected). The taller wall-mount and 2-filter sandwich are never affected.
  const wallFansFit = box.wallHeight >= settings.fan.diameter;
  const wallRequest = (request: TempestFanCountRequest): TempestFanCountRequest =>
    wallFansFit ? request : { type: "fixed", count: 0 };
  const walls: Record<TempestWall, TempestWallFanLayout> = {
    front: createWallFanLayout("front", box.width, wallRequest(settings.fan.wallRequests.front), cornerSafeMinimum, settings.fan.diameter),
    back: createWallFanLayout("back", box.width, wallRequest(settings.fan.wallRequests.back), cornerSafeMinimum, settings.fan.diameter),
    left: createWallFanLayout("left", box.depth, wallRequest(settings.fan.wallRequests.left), cornerSafeMinimum, settings.fan.diameter),
    right: createWallFanLayout("right", box.depth, wallRequest(settings.fan.wallRequests.right), cornerSafeMinimum, settings.fan.diameter),
  };
  return {
    topology: "sandwich",
    bodyDepth,
    screwPitch,
    cornerSafeMinimum,
    localVerticalCenter,
    walls,
    bottomPlate: createBottomPlateFanLayout(settings, box, filterCount, walls, localVerticalCenter),
  };
}

// Clearance kept between a back-plate fan body and a wall fan body before they are
// treated as colliding (mm).
const BACK_FAN_WALL_CLEARANCE_MM = 1;

type Aabb = {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
};

// The "Back" fan grid lives on the solid bottom plate that the single-filter
// layout puts opposite its one (top) filter. The dual sandwich has no solid plate
// there, so it never gets a grid. The grid mirrors the tower top plate: a centred
// row/column array spaced by fanSpacing, kept a fan-radius-plus-wall in from each
// edge so the bodies clear the corner posts. Any cell whose fan body would hit a
// wall fan (left/right/top/bottom) is then dropped, so the two never intersect.
function createBottomPlateFanLayout(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
  filterCount: 1 | 2,
  walls: Record<TempestWall, TempestWallFanLayout>,
  localVerticalCenter: number,
): TempestPlateFanLayout {
  const requested = settings.fan.bottomPlateFans;
  if (filterCount !== 1 || requested === undefined) {
    return { positions: [], fanCount: 0, maximumCount: 0 };
  }
  const diameter = settings.fan.diameter;
  const minimumCenterFromEdge = settings.frame.wallThickness + diameter / 2;
  const xs = plateFanPositions(plateFansPerSide(box.width, minimumCenterFromEdge, diameter), box.width, diameter);
  const ys = plateFanPositions(plateFansPerSide(box.depth, minimumCenterFromEdge, diameter), box.depth, diameter);

  const radius = diameter / 2;
  const bodyDepth = tempestFanBodyDepth(diameter);
  const flange = settings.frame.outsideFlangeThickness;
  // The back fan sits on the inside back wall (z = flange) and its body reaches up
  // into the chamber by one body depth.
  const backZ0 = flange;
  const backZ1 = flange + bodyDepth;
  const wallBoxes = wallFanFootprints(walls, box, settings, localVerticalCenter);

  // Every grid cell that clears the wall fans, in row-major order. "automatic"
  // takes them all; a fixed count keeps the first N.
  const clear: TempestPlateFanPosition[] = [];
  for (const x of xs) {
    for (const y of ys) {
      const back: Aabb = { x0: x - radius, x1: x + radius, y0: y - radius, y1: y + radius, z0: backZ0, z1: backZ1 };
      if (!wallBoxes.some((wallBox) => aabbOverlap(back, wallBox, BACK_FAN_WALL_CLEARANCE_MM))) {
        clear.push({ x, y });
      }
    }
  }
  const maximumCount = clear.length;
  const count = requested.type === "automatic" ? maximumCount : Math.max(0, Math.min(requested.count, maximumCount));
  return { positions: clear.slice(0, count), fanCount: count, maximumCount };
}

// The chamber-side body footprints of every wall fan, in model coordinates, so a
// back-plate fan can be tested against them. Each wall fan is a square frame on
// its wall plane whose body reaches one body depth into the chamber; vertically it
// is centred on the wall fan centre.
function wallFanFootprints(
  walls: Record<TempestWall, TempestWallFanLayout>,
  box: TempestBoxEnvelope,
  settings: TempestSettings,
  localVerticalCenter: number,
): Aabb[] {
  const radius = settings.fan.diameter / 2;
  const bodyReach = settings.frame.wallThickness + tempestFanBodyDepth(settings.fan.diameter);
  const z0 = settings.frame.outsideFlangeThickness + localVerticalCenter - radius;
  const z1 = settings.frame.outsideFlangeThickness + localVerticalCenter + radius;
  const boxes: Aabb[] = [];
  for (const p of walls.front.positionsAlongWall) {
    boxes.push({ x0: p - radius, x1: p + radius, y0: 0, y1: bodyReach, z0, z1 });
  }
  for (const p of walls.back.positionsAlongWall) {
    const cx = box.width - p;
    boxes.push({ x0: cx - radius, x1: cx + radius, y0: box.depth - bodyReach, y1: box.depth, z0, z1 });
  }
  for (const p of walls.left.positionsAlongWall) {
    const cy = box.depth - p;
    boxes.push({ x0: 0, x1: bodyReach, y0: cy - radius, y1: cy + radius, z0, z1 });
  }
  for (const p of walls.right.positionsAlongWall) {
    boxes.push({ x0: box.width - bodyReach, x1: box.width, y0: p - radius, y1: p + radius, z0, z1 });
  }
  return boxes;
}

function aabbOverlap(a: Aabb, b: Aabb, clearance: number): boolean {
  return (
    a.x0 - clearance < b.x1 &&
    b.x0 - clearance < a.x1 &&
    a.y0 - clearance < b.y1 &&
    b.y0 - clearance < a.y1 &&
    a.z0 - clearance < b.z1 &&
    b.z0 - clearance < a.z1
  );
}

function plateFansPerSide(length: Millimeters, minimumCenterFromEdge: Millimeters, fanDiameter: Millimeters): number {
  const span = length - 2 * minimumCenterFromEdge;
  if (span < 0) {
    return 0;
  }
  return Math.max(0, Math.floor(1 + span / fanSpacing(fanDiameter)));
}

function plateFanPositions(fanCount: number, length: Millimeters, fanDiameter: Millimeters): readonly Millimeters[] {
  if (fanCount === 0) {
    return [];
  }
  const total = fanCount <= 1 ? 0 : (fanCount - 1) * fanSpacing(fanDiameter);
  const first = fanCount === 1 ? length / 2 : (length - total) / 2;
  return Array.from({ length: fanCount }, (_, index) => first + index * fanSpacing(fanDiameter));
}

function createWallFanLayout(
  wall: TempestWall,
  wallLength: Millimeters,
  requested: TempestFanCountRequest,
  cornerSafeMinimum: Millimeters,
  fanDiameter: Millimeters,
): TempestWallFanLayout {
  const maximumCount = maxHorizontalWallFans(wallLength, cornerSafeMinimum, fanDiameter);
  const actualCount = actualWallFanCount(requested, maximumCount);
  return {
    wall,
    requested,
    maximumCount,
    actualCount,
    positionsAlongWall: horizontalWallFanPositions(actualCount, wallLength, cornerSafeMinimum, fanDiameter),
  };
}

function maxHorizontalWallFans(wallLength: Millimeters, cornerSafeMinimum: Millimeters, fanDiameter: Millimeters): number {
  const span = wallLength - 2 * cornerSafeMinimum;
  if (span < 0) {
    return 0;
  }
  return Math.max(0, Math.floor(1 + span / fanSpacing(fanDiameter)));
}

function actualWallFanCount(requested: TempestFanCountRequest, maximumCount: number): number {
  if (requested.type === "automatic") {
    return maximumCount;
  }
  const count = finiteNonNegativeInteger(requested.count, 0);
  return count > maximumCount ? maximumCount : count;
}

function horizontalWallFanPositions(
  fanCount: number,
  wallLength: Millimeters,
  cornerSafeMinimum: Millimeters,
  fanDiameter: Millimeters,
): readonly Millimeters[] {
  if (fanCount === 0) {
    return [];
  }
  const minimumSpacing = fanSpacing(fanDiameter);
  const spread = fanCount <= 1 ? minimumSpacing : (wallLength - 2 * cornerSafeMinimum) / (fanCount - 1);
  const spacing = Math.max(minimumSpacing, spread);
  const total = fanCount <= 1 ? 0 : (fanCount - 1) * spacing;
  const first = fanCount === 1 ? wallLength / 2 : (wallLength - total) / 2;
  return Array.from({ length: fanCount }, (_, index) => first + index * spacing);
}

function horizontalFanVerticalCenter(
  filterCount: 1 | 2,
  wallHeight: Millimeters,
  fanDiameter: Millimeters,
  filterThickness: Millimeters,
  insideFlangeThickness: Millimeters,
  cordHoleDiameter: Millimeters,
): Millimeters {
  const natural = filterCount === 2 ? wallHeight / 2 : (wallHeight - filterThickness - insideFlangeThickness) / 2;
  const fanRadius = fanDiameter / 2;
  const maxSafe = wallHeight - 2 * cordHoleDiameter - fanRadius;
  return Math.min(natural, maxSafe);
}

export function createSandwichCordPlacement(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
): TempestSandwichCord | TempestNoCord {
  if (settings.cordPassThrough.type === "none") {
    return { type: "none" };
  }
  const cord = settings.cordPassThrough;
  const wallLength = cord.wall === "front" || cord.wall === "back" ? box.width : box.depth;
  const offset = horizontalCordOffset(settings);
  // Both horizontal layouts stand upright for printing and display
  // (createSandwichPose: build +y becomes the standing UP axis, so the front wall
  // y=0 becomes the floor). A power cord should exit near the standing floor, so
  // on the left and right walls — which stay vertical in that pose — the hole sits
  // one corner-safe cord offset above the wall's floor end instead of following
  // the side setting (offset = cord radius + wall + margin, so the bore clears the
  // floor wall it stands next to). A hole through the front wall already exits at
  // the floor; the back wall is the user's explicit choice of the standing top.
  const positionAlongWall =
    cord.wall === "left" || cord.wall === "right"
      ? offset
      : cordPositionAlongWall(wallLength, cord.side, offset);
  return {
    topology: "sandwich",
    type: "wall-cylinder",
    wall: cord.wall,
    side: cord.side,
    diameter: cord.diameter,
    positionAlongWall,
    verticalCenter: sandwichCordVerticalCenter(settings, box),
    axis: cord.wall === "front" || cord.wall === "back" ? "y" : "x",
  };
}

// Where the side-wall cord bore sits across the box height. The dual sandwich
// centres it on the box (the standing depth midline — inside the fan chamber,
// clear of both filter layers). The one-side "Back" panel instead auto-places it
// midway between the top of the back fan body and the inside filter flange, so the
// cord clears both the flat Back fan grid and the filter it sits opposite.
function sandwichCordVerticalCenter(settings: TempestSettings, box: TempestBoxEnvelope): Millimeters {
  const arrangement = settings.arrangement;
  const bottomFans = settings.fan.bottomPlateFans;
  const backFansOn =
    arrangement.type === "single-horizontal-top-filter" &&
    bottomFans !== undefined &&
    !(bottomFans.type === "fixed" && bottomFans.count === 0);
  if (!backFansOn) {
    return box.height / 2;
  }
  const flange = settings.frame.outsideFlangeThickness;
  // insideFlangeThickness === wallThickness (see createFrameModel).
  const fanBodyTop = flange + tempestFanBodyDepth(settings.fan.diameter);
  const insideFilterFlange = box.height - flange - arrangement.filter.thickness - settings.frame.wallThickness;
  return (fanBodyTop + insideFilterFlange) / 2;
}

// Both horizontal layouts — the single-filter wall mount and the 2-filter
// sandwich — stand upright for printing and display.
export function createSandwichPose(
  box: TempestBoxEnvelope,
  _filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): TempestPrintablePose {
  return {
    type: "upright-dual-filter",
    envelope: { width: box.width, depth: box.height, height: box.depth },
  };
}

export const sandwichPlan: TempestModelPlan<"sandwich"> = {
  topology: "sandwich",
  box: createSandwichBox,
  filterLayout: createSandwichFilterLayout,
  fanLayout: createSandwichFanLayout,
  cordPlacement: (settings, box) => createSandwichCordPlacement(settings, box),
  pose: createSandwichPose,
};
