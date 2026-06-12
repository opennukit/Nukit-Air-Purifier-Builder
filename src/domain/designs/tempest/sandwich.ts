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
  const height =
    settings.fan.diameter +
    HORIZONTAL_FAN_VERTICAL_PADDING_MM +
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
  return {
    topology: "sandwich",
    bodyDepth,
    screwPitch,
    cornerSafeMinimum,
    localVerticalCenter,
    walls: {
      front: createWallFanLayout("front", box.width, settings.fan.wallRequests.front, cornerSafeMinimum, settings.fan.diameter),
      back: createWallFanLayout("back", box.width, settings.fan.wallRequests.back, cornerSafeMinimum, settings.fan.diameter),
      left: createWallFanLayout("left", box.depth, settings.fan.wallRequests.left, cornerSafeMinimum, settings.fan.diameter),
      right: createWallFanLayout("right", box.depth, settings.fan.wallRequests.right, cornerSafeMinimum, settings.fan.diameter),
    },
  };
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
  const arrangement = expectSandwichArrangement(settings.arrangement);
  const wallLength = cord.wall === "front" || cord.wall === "back" ? box.width : box.depth;
  const offset = horizontalCordOffset(settings);
  // The dual sandwich stands upright for printing and display (createSandwichPose:
  // build +y becomes the standing UP axis, so the front wall y=0 becomes the
  // floor). A power cord should exit near the standing floor, so on the left and
  // right walls — which stay vertical in that pose — the hole sits one corner-safe
  // cord offset above the wall's floor end instead of following the side setting
  // (offset = cord radius + wall + margin, so the bore clears the floor wall it
  // stands next to). A hole through the front wall already exits at the floor; the
  // back wall is the user's explicit choice of the standing top. The single-filter
  // sandwich keeps its as-modelled orientation, so its cord keeps side placement.
  const standsUpright = horizontalFilterCount(arrangement) === 2;
  const positionAlongWall =
    standsUpright && (cord.wall === "left" || cord.wall === "right")
      ? offset
      : cordPositionAlongWall(wallLength, cord.side, offset);
  return {
    topology: "sandwich",
    type: "wall-cylinder",
    wall: cord.wall,
    side: cord.side,
    diameter: cord.diameter,
    positionAlongWall,
    // Centered across the box height: for the standing dual sandwich this is the
    // standing depth midline — inside the fan chamber, clear of both filter
    // layers and their flanges.
    verticalCenter: box.height / 2,
    axis: cord.wall === "front" || cord.wall === "back" ? "y" : "x",
  };
}

// A two-filter sandwich prints best stood upright; a single-filter sandwich
// stays as-modelled. Count-based, not tag-based — both are sandwich topology.
export function createSandwichPose(
  box: TempestBoxEnvelope,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): TempestPrintablePose {
  if (filterLayout.filterCount === 2) {
    return {
      type: "upright-dual-filter",
      envelope: { width: box.width, depth: box.height, height: box.depth },
    };
  }
  return {
    type: "source",
    envelope: { width: box.width, depth: box.depth, height: box.height },
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
