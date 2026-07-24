import type { Millimeters } from "@/domain/units";
import { assertNever } from "./topology";
import {
  cordPositionAlongWall,
  fanSpacing,
  filterPocketThickness,
  finiteNonNegativeInteger,
  horizontalCordOffset,
  sandwichCordFanReach,
  sandwichCordWallLocalPos,
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
    filterCount * (filterPocketThickness(arrangement.filter.thickness, frame) + frame.wallThickness);
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
  const pocketThickness = filterPocketThickness(arrangement.filter.thickness, frame);
  const filters = Array.from({ length: filterCount }, (_, index) => {
    const zBottom = horizontalFilterZ(index, filterCount, box.height, frame.outsideFlangeThickness, pocketThickness);
    return {
      index,
      zBottom,
      zTop: zBottom + pocketThickness,
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
  pocketThickness: Millimeters,
): Millimeters {
  if (filterCount === 1) {
    return boxHeight - outsideFlangeThickness - pocketThickness;
  }
  return index === 0 ? outsideFlangeThickness : boxHeight - outsideFlangeThickness - pocketThickness;
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
    filterPocketThickness(arrangement.filter.thickness, settings.frame),
    settings.frame.wallThickness,
    settings.cordPassThrough.type === "wall" ? settings.cordPassThrough.diameter : 0,
  );
  // A shallow one-side panel can't fit a fan body in its short side walls, so the
  // wall fans are forced off there (the Back grid lies flat on the plate and is
  // unaffected). The taller wall-mount and 2-filter sandwich are never affected.
  const wallFansFit = box.wallHeight >= settings.fan.diameter;
  const wallRequest = (request: TempestFanCountRequest): TempestFanCountRequest =>
    wallFansFit ? request : { type: "fixed", count: 0 };
  // Keep a wall fan row clear of a cord that shares its wall: a front/back cord at
  // side center lands exactly where the middle fan sits. The cord never moves; the
  // row repacks (see horizontalWallFanPositions). Only engages when the cord
  // overlaps the fan row both vertically and along the wall, so ordinary corner
  // cords and cords on fan-free walls leave the even spread untouched.
  const cord = createSandwichCordPlacement(settings, box);
  const fanRowHeight = settings.frame.outsideFlangeThickness + localVerticalCenter;
  const wallCordKeepOut = (wall: TempestWall): { readonly pos: Millimeters; readonly reach: Millimeters } | null => {
    if (cord.type !== "wall-cylinder" || cord.wall !== wall) {
      return null;
    }
    const reach = sandwichCordFanReach(cord.diameter, settings.fan.diameter);
    if (Math.abs(cord.verticalCenter - fanRowHeight) >= reach) {
      return null;
    }
    return { pos: sandwichCordWallLocalPos(wall, cord.positionAlongWall, box.width, box.depth), reach };
  };
  const walls: Record<TempestWall, TempestWallFanLayout> = {
    front: createWallFanLayout("front", box.width, wallRequest(settings.fan.wallRequests.front), cornerSafeMinimum, settings.fan.diameter, wallCordKeepOut("front")),
    back: createWallFanLayout("back", box.width, wallRequest(settings.fan.wallRequests.back), cornerSafeMinimum, settings.fan.diameter, wallCordKeepOut("back")),
    left: createWallFanLayout("left", box.depth, wallRequest(settings.fan.wallRequests.left), cornerSafeMinimum, settings.fan.diameter, wallCordKeepOut("left")),
    right: createWallFanLayout("right", box.depth, wallRequest(settings.fan.wallRequests.right), cornerSafeMinimum, settings.fan.diameter, wallCordKeepOut("right")),
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
// there, so it never gets a grid. The grid mirrors the tower top plate: fans
// spaced by fanSpacing, kept a fan-radius-plus-wall in from each edge so the
// bodies clear the corner posts. A fan body that would hit a wall fan is dropped.
//
// "automatic" fills the whole grid; a fixed count places that many SYMMETRICALLY
// in a near-square arrangement (e.g. 4 -> 2x2, 3 -> a row), spread evenly across
// the whole plate rather than bunched at minimum spacing in the centre.
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
  const radius = diameter / 2;
  const flange = settings.frame.outsideFlangeThickness;
  const backZ0 = flange;
  const backZ1 = flange + tempestFanBodyDepth(diameter);
  const wallBoxes = wallFanFootprints(walls, box, settings, localVerticalCenter);
  const clearsWalls = ({ x, y }: TempestPlateFanPosition): boolean =>
    !wallBoxes.some((wallBox) =>
      aabbOverlap({ x0: x - radius, x1: x + radius, y0: y - radius, y1: y + radius, z0: backZ0, z1: backZ1 }, wallBox, BACK_FAN_WALL_CLEARANCE_MM),
    );

  return createPlateFanGrid(box.width, box.depth, minimumCenterFromEdge, diameter, requested, clearsWalls);
}

// A rectangular fan grid on a flat plate that honors an exact requested count.
// Auto (or a count at/above the maximum) fills the full grid; a smaller count is
// distributed evenly across rows so the fans sit at balanced margins and gaps for
// uniform airflow. `clearsWalls` drops any position that would collide with a
// side-wall fan (the sandwich Back plate); the tower passes none. Shared by the
// single-filter Back plate and the four-side tower's top/bottom fan plates.
export function createPlateFanGrid(
  widthMm: Millimeters,
  depthMm: Millimeters,
  minimumCenterFromEdge: Millimeters,
  diameter: Millimeters,
  requested: TempestFanCountRequest | undefined,
  clearsWalls: (position: TempestPlateFanPosition) => boolean = () => true,
): TempestPlateFanLayout {
  if (requested === undefined) {
    return { positions: [], fanCount: 0, maximumCount: 0 };
  }
  const maxCols = plateFansPerSide(widthMm, minimumCenterFromEdge, diameter);
  const maxRows = plateFansPerSide(depthMm, minimumCenterFromEdge, diameter);
  const fullXs = plateFanPositions(maxCols, widthMm, diameter);
  const fullYs = plateFanPositions(maxRows, depthMm, diameter);
  const fullGrid: TempestPlateFanPosition[] = [];
  for (const x of fullXs) {
    for (const y of fullYs) {
      if (clearsWalls({ x, y })) {
        fullGrid.push({ x, y });
      }
    }
  }
  const maximumCount = fullGrid.length;
  const target = requested.type === "automatic" ? maximumCount : Math.max(0, Math.min(requested.count, maximumCount));
  if (target <= 0) {
    return { positions: [], fanCount: 0, maximumCount };
  }
  if (target >= maximumCount) {
    return { positions: fullGrid, fanCount: maximumCount, maximumCount };
  }

  const { rows } = chooseBackGrid(target, maxCols, maxRows, widthMm, depthMm);
  const rowCounts = distributeBackRows(target, rows);
  const evenYs = evenlyDistribute(rows, depthMm, minimumCenterFromEdge);
  const evenPositions = rowCounts
    .flatMap((rowCount, rowIndex) =>
      evenlyDistribute(rowCount, widthMm, minimumCenterFromEdge).map((x) => ({ x, y: evenYs[rowIndex] })),
    )
    .filter(clearsWalls);
  if (evenPositions.length === target) {
    return { positions: evenPositions, fanCount: target, maximumCount };
  }

  const ys = plateFanPositions(rows, depthMm, diameter);
  const positions = rowCounts
    .flatMap((rowCount, rowIndex) => plateFanPositions(rowCount, widthMm, diameter).map((x) => ({ x, y: ys[rowIndex] })))
    .filter(clearsWalls);
  return { positions, fanCount: positions.length, maximumCount };
}

// Pick the cols x rows block for `count` fans: the rectangle that holds it with
// the least waste and then the most even fan SPACING for the plate's shape, so a
// deep plate gets more rows than columns (e.g. 6 on a 507x761 plate -> 2 cols x 3
// rows, not 3 x 2). Even spacing means square cells: width/cols ~= depth/rows.
function chooseBackGrid(
  count: number,
  maxCols: number,
  maxRows: number,
  width: Millimeters,
  depth: Millimeters,
): { readonly cols: number; readonly rows: number } {
  let best: { cols: number; rows: number; score: readonly number[] } | null = null;
  for (let cols = 1; cols <= maxCols; cols += 1) {
    for (let rows = 1; rows <= maxRows; rows += 1) {
      if (cols * rows < count) {
        continue;
      }
      const cellAspectDiff = Math.abs(width / cols - depth / rows);
      const score = [cols * rows - count, cellAspectDiff, -cols, -rows];
      if (best === null || lexicographicLess(score, best.score)) {
        best = { cols, rows, score };
      }
    }
  }
  return best === null ? { cols: Math.max(1, Math.min(count, maxCols)), rows: 1 } : { cols: best.cols, rows: best.rows };
}

// Split `count` fans across `rows` rows as evenly as possible, with the heavier
// rows placed symmetrically about the centre so the stack reads as a palindrome
// (e.g. 7 over 3 rows -> 2,3,2; 8 -> 3,2,3).
function distributeBackRows(count: number, rows: number): number[] {
  const base = Math.floor(count / rows);
  const counts = new Array<number>(rows).fill(base);
  let remaining = count - base * rows;
  if (remaining % 2 === 1 && rows % 2 === 1) {
    counts[(rows - 1) / 2] += 1;
    remaining -= 1;
  }
  let low = 0;
  let high = rows - 1;
  while (remaining >= 2 && low < high) {
    counts[low] += 1;
    counts[high] += 1;
    low += 1;
    high -= 1;
    remaining -= 2;
  }
  // Any leftover (even rows with an odd remainder) fills from the centre outward.
  const centreOut = [...counts.keys()].sort((a, b) => Math.abs(a - (rows - 1) / 2) - Math.abs(b - (rows - 1) / 2));
  let index = 0;
  while (remaining > 0) {
    counts[centreOut[index % rows]] += 1;
    remaining -= 1;
    index += 1;
  }
  return counts;
}

function lexicographicLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return false;
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

// Evenly distribute `count` fans along `length`: each fan sits at the centre of
// an equal 1/count division of the plate, so the spacing between fans and the
// margins to the edges are balanced and airflow is uniform. Positions are clamped
// to keep the outermost fans a `minimumCenterFromEdge` clear of the plate edge.
function evenlyDistribute(count: number, length: Millimeters, minimumCenterFromEdge: Millimeters): readonly Millimeters[] {
  if (count <= 0) {
    return [];
  }
  const low = minimumCenterFromEdge;
  const high = length - minimumCenterFromEdge;
  return Array.from({ length: count }, (_, index) => {
    const position = (length * (index + 0.5)) / count;
    return Math.min(high, Math.max(low, position));
  });
}

function createWallFanLayout(
  wall: TempestWall,
  wallLength: Millimeters,
  requested: TempestFanCountRequest,
  cornerSafeMinimum: Millimeters,
  fanDiameter: Millimeters,
  cordKeepOut: { readonly pos: Millimeters; readonly reach: Millimeters } | null = null,
): TempestWallFanLayout {
  const maximumCount = maxHorizontalWallFans(wallLength, cornerSafeMinimum, fanDiameter);
  const actualCount = actualWallFanCount(requested, maximumCount);
  return {
    wall,
    requested,
    maximumCount,
    actualCount,
    positionsAlongWall: horizontalWallFanPositions(actualCount, wallLength, cornerSafeMinimum, fanDiameter, cordKeepOut),
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
  cordKeepOut: { readonly pos: Millimeters; readonly reach: Millimeters } | null = null,
): readonly Millimeters[] {
  if (fanCount === 0) {
    return [];
  }
  const minimumSpacing = fanSpacing(fanDiameter);
  const spread = fanCount <= 1 ? minimumSpacing : (wallLength - 2 * cornerSafeMinimum) / (fanCount - 1);
  const spacing = Math.max(minimumSpacing, spread);
  const total = fanCount <= 1 ? 0 : (fanCount - 1) * spacing;
  const first = fanCount === 1 ? wallLength / 2 : (wallLength - total) / 2;
  const evenSpread = Array.from({ length: fanCount }, (_, index) => first + index * spacing);
  if (cordKeepOut === null || !evenSpread.some((center) => Math.abs(center - cordKeepOut.pos) < cordKeepOut.reach)) {
    return evenSpread;
  }
  // A cord shares this wall and the even spread would run a fan through it. Repack
  // the row at the minimum fan pitch (bodies still clear each other and the corner
  // posts, since the group stays inside cornerSafeMinimum) and slide it to the spot
  // nearest the wall center that leaves the cord untouched. This mirrors the laser
  // path (fanCenterXs); the cord itself never moves. If nothing fits, keep the even
  // spread and let the cord/fan diagnostic flag it.
  const groupWidth = (fanCount - 1) * minimumSpacing;
  const loFirst = cornerSafeMinimum;
  const hiFirst = wallLength - cornerSafeMinimum - groupWidth;
  if (hiFirst < loFirst) {
    return evenSpread;
  }
  const centeredFirst = (wallLength - groupWidth) / 2;
  const positionsFrom = (start: number): number[] => Array.from({ length: fanCount }, (_, index) => start + index * minimumSpacing);
  const clears = (start: number): boolean => !positionsFrom(start).some((center) => Math.abs(center - cordKeepOut.pos) < cordKeepOut.reach);
  const clampFirst = (value: number): number => Math.min(hiFirst, Math.max(loFirst, value));
  const chosen = [centeredFirst, cordKeepOut.pos + cordKeepOut.reach, cordKeepOut.pos - cordKeepOut.reach - groupWidth]
    .map(clampFirst)
    .filter(clears)
    .sort((a, b) => Math.abs(a - centeredFirst) - Math.abs(b - centeredFirst))[0];
  return chosen === undefined ? evenSpread : positionsFrom(chosen);
}

function horizontalFanVerticalCenter(
  filterCount: 1 | 2,
  wallHeight: Millimeters,
  fanDiameter: Millimeters,
  pocketThickness: Millimeters,
  insideFlangeThickness: Millimeters,
  cordHoleDiameter: Millimeters,
): Millimeters {
  const natural = filterCount === 2 ? wallHeight / 2 : (wallHeight - pocketThickness - insideFlangeThickness) / 2;
  const fanRadius = fanDiameter / 2;
  const maxSafe = wallHeight - 2 * cordHoleDiameter - fanRadius;
  // Floor the center at fanRadius so the bore (and its screw holes, which sit inside
  // it) never drops below the wall bottom. A thick cord (up to 25 mm) with a thin
  // filter drives maxSafe low enough to push the fan opening off the wall otherwise,
  // truncating the bore and dropping the lower screw holes. wallFansFit already
  // guarantees wallHeight >= fanDiameter, so fanRadius always leaves the top clear.
  return Math.max(fanRadius, Math.min(natural, maxSafe));
}

export function createSandwichCordPlacement(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
): TempestSandwichCord | TempestNoCord {
  if (settings.cordPassThrough.type === "none") {
    return { type: "none" };
  }
  const cord = settings.cordPassThrough;
  const offset = horizontalCordOffset(settings);
  const filterCount = horizontalFilterCount(expectSandwichArrangement(settings.arrangement));
  const isSideWall = cord.wall === "left" || cord.wall === "right";
  // The box stands upright for display/print: the front/back walls span the box
  // WIDTH (which reads horizontally), while the left/right walls span the box
  // DEPTH (which the upright pose tips up to read VERTICALLY).
  //   - front/back: "Cord position" slides along the wall width (horizontal), at
  //     the chamber-centre height.
  //   - left/right: the cord sits the Cord-corner-offset up from the floor (the
  //     box depth — vertical in the view), and "Cord position" slides it
  //     HORIZONTALLY along the box height (center = chamber midline, left/right =
  //     the chamber ends).
  const positionAlongWall = isSideWall ? offset : cordPositionAlongWall(box.width, cord.side, offset);
  const verticalCenter = isSideWall
    ? sideWallCordHeight(settings, box, cord.side, filterCount)
    : sandwichCordVerticalCenter(settings, box);
  return {
    topology: "sandwich",
    type: "wall-cylinder",
    wall: cord.wall,
    side: cord.side,
    diameter: cord.diameter,
    positionAlongWall,
    verticalCenter,
    axis: cord.wall === "front" || cord.wall === "back" ? "y" : "x",
  };
}

// For a cord on a left/right wall, the chosen side slides the hole along the box
// height, kept inside the fan chamber (between the bottom obstacle — the lower
// filter, the solid plate, or the back fan bodies — and the top filter flange).
// center sits at the chamber midline; left/right go to the chamber ends.
function sideWallCordHeight(settings: TempestSettings, box: TempestBoxEnvelope, side: "left" | "center" | "right", filterCount: 1 | 2): Millimeters {
  if (side === "center") {
    return sandwichCordVerticalCenter(settings, box);
  }
  const arrangement = expectSandwichArrangement(settings.arrangement);
  const flange = settings.frame.outsideFlangeThickness;
  const wall = settings.frame.wallThickness;
  const cordRadius = settings.cordPassThrough.type === "wall" ? settings.cordPassThrough.diameter / 2 : 0;
  const bottomFans = settings.fan.bottomPlateFans;
  const backFansOn = filterCount === 1 && bottomFans !== undefined && !(bottomFans.type === "fixed" && bottomFans.count === 0);
  const pocketThickness = filterPocketThickness(arrangement.filter.thickness, settings.frame);
  const bottomObstacleTop =
    filterCount === 2
      ? flange + pocketThickness + wall
      : backFansOn
        ? flange + tempestFanBodyDepth(settings.fan.diameter)
        : flange;
  const topObstacleBottom = box.height - flange - pocketThickness - wall;
  const low = bottomObstacleTop + cordRadius;
  const high = topObstacleBottom - cordRadius;
  return side === "left" ? Math.min(low, high) : Math.max(low, high);
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
  const insideFilterFlange =
    box.height - flange - filterPocketThickness(arrangement.filter.thickness, settings.frame) - settings.frame.wallThickness;
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
