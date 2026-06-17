import type { Millimeters } from "@/domain/units";
import { assertNever, type TempestTopology } from "./topology";
import { sandwichPlan } from "./sandwich";
import { quadPlan } from "./quad";
import {
  defaultTempestCordPassThrough,
  finiteNonNegativeInteger,
  type TempestAlignmentPinSettings,
  type TempestChunkIndex,
  type TempestCordPassThrough,
  type TempestFanCountRequest,
  type TempestFanSettings,
  type TempestFilterArrangement,
  type TempestFrameSettings,
  type TempestHorizontalFilterSize,
  type TempestPlanarAxis,
  type TempestPrintBedVolume,
  type TempestRenderTarget,
  type TempestSettings,
  type TempestTowerFilterSize,
  type TempestTowerTopExhaust,
  type TempestWall,
  type TempestWallMap,
} from "./shared";

// #######################################
// Tempest Derived Model
// #######################################

// ##############################
// Box and Frame
// ##############################

export type TempestBoxEnvelope = {
  readonly width: Millimeters;
  readonly depth: Millimeters;
  readonly height: Millimeters;
  readonly wallHeight: Millimeters;
};

export type TempestFrameModel = TempestFrameSettings & {
  readonly insideFlangeThickness: Millimeters;
};

// ##############################
// Filter Layout
// ##############################

export type TempestHorizontalFilterLayer = {
  readonly index: number;
  readonly zBottom: Millimeters;
  readonly zTop: Millimeters;
};

export type TempestHorizontalFlangeLayer = {
  readonly type: "below-filter" | "above-filter";
  readonly filterIndex: number;
  readonly zBottom: Millimeters;
  readonly zTop: Millimeters;
};

export type TempestHorizontalFilterSlot = {
  readonly filterIndex: number;
  readonly wall: TempestWall;
  readonly localZBottom: Millimeters;
  readonly localZTop: Millimeters;
};

export type TempestTowerAirChamber = {
  readonly xMin: Millimeters;
  readonly xMax: Millimeters;
  readonly yMin: Millimeters;
  readonly yMax: Millimeters;
  readonly zMin: Millimeters;
  readonly zMax: Millimeters;
};

export type TempestBottomPanel = "solid-plate" | "open-frame";

export type TempestTowerFilterPocket = {
  // The `wall` field is gone — the TempestWallMap key IS the wall.
  readonly width: Millimeters;
  readonly height: Millimeters;
  readonly depth: Millimeters;
};

// One filter-pocket rect per wall, in model coordinates, derived ONCE in
// createTowerFilterLayout. Every quad consumer reads these instead of recomputing
// structuralOffset/outsideFlange/thickness math with `if (wall === ...)` chains.
export type TempestQuadWallRect = {
  readonly xMin: Millimeters;
  readonly xMax: Millimeters;
  readonly yMin: Millimeters;
  readonly yMax: Millimeters;
  readonly inletNormalAxis: TempestPlanarAxis; // "y" for front/back, "x" for left/right
  readonly innerPlaneOffset: Millimeters; // structuralOffset — the chamber face plane
  readonly outerPlaneOffset: Millimeters; // outsideFlange — the outer face plane
};

export type TempestFilterLayout =
  | {
      readonly topology: "sandwich";
      readonly filterCount: 1 | 2;
      readonly bottomPanel: TempestBottomPanel;
      readonly filters: readonly TempestHorizontalFilterLayer[];
      readonly flanges: readonly TempestHorizontalFlangeLayer[];
      readonly loading: {
        readonly type: "wall-slots";
        readonly slots: readonly TempestHorizontalFilterSlot[];
      };
    }
  | {
      readonly topology: "quad";
      readonly filterCount: 4;
      readonly filter: TempestTowerFilterSize;
      readonly structuralOffset: Millimeters;
      readonly bottomPlateThickness: Millimeters;
      readonly topPlateThickness: Millimeters;
      readonly airChamber: TempestTowerAirChamber;
      readonly wallRects: TempestWallMap<TempestQuadWallRect>;
      readonly filterPockets: TempestWallMap<TempestTowerFilterPocket>;
      readonly loading: {
        readonly type: "top-plate-slots" | "bottom-plate-slots";
        readonly slotCount: 4;
      };
    };

// ##############################
// Fan Layout
// ##############################

export type TempestWallFanLayout = {
  readonly wall: TempestWall;
  readonly requested: TempestFanCountRequest;
  readonly maximumCount: number;
  readonly actualCount: number;
  readonly positionsAlongWall: readonly Millimeters[];
};

// The fan grid on the single-filter sandwich's solid bottom plate (the "Back"
// placement), as explicit (x, y) centres in model coordinates. It starts as a
// centred row/column grid; cells that would collide with a wall fan are dropped,
// so the final set is a plain point list. fanCount === 0 means the plate stays
// solid.
export type TempestPlateFanPosition = {
  readonly x: Millimeters;
  readonly y: Millimeters;
};

export type TempestPlateFanLayout = {
  readonly positions: readonly TempestPlateFanPosition[];
  readonly fanCount: number;
  // The most fans that fit clear of the walls (what "automatic" places); the UI
  // offers 0..maximumCount so a user can pick fewer.
  readonly maximumCount: number;
};

export type TempestFanLayout =
  | {
      readonly topology: "sandwich";
      readonly bodyDepth: Millimeters;
      readonly screwPitch: Millimeters;
      readonly cornerSafeMinimum: Millimeters;
      readonly localVerticalCenter: Millimeters;
      readonly walls: TempestWallMap<TempestWallFanLayout>;
      // The "Back" fan grid on the solid bottom plate; single-filter layout only.
      // fanCount === 0 for the dual sandwich (no solid plate) and whenever the
      // grid is off.
      readonly bottomPlate: TempestPlateFanLayout;
    }
  | {
      readonly topology: "quad";
      readonly bodyDepth: Millimeters;
      readonly screwPitch: Millimeters;
      readonly minimumCenterFromEdge: Millimeters;
      readonly topExhaust: TempestTowerTopExhaust; // resolved from the optional fan setting, total here
      readonly columns: number;
      readonly rows: number;
      readonly positionsX: readonly Millimeters[];
      readonly positionsY: readonly Millimeters[];
      readonly fanCount: number;
    };

// ##############################
// Cord, Chunking, and Pins
// ##############################

export type TempestCordPassThroughPlacement =
  | {
      readonly type: "none";
    }
  | {
      readonly topology: "sandwich";
      readonly type: "wall-cylinder";
      readonly wall: TempestWall;
      readonly side: "left" | "center" | "right";
      readonly diameter: Millimeters;
      readonly positionAlongWall: Millimeters;
      readonly verticalCenter: Millimeters;
      readonly axis: TempestPlanarAxis;
    }
  | {
      readonly topology: "quad";
      readonly type: "top-cylinder";
      readonly diameter: Millimeters;
      readonly x: Millimeters; // corner resolved — kills the towerCordUsesHigh* booleans
      readonly y: Millimeters;
      readonly zStart: Millimeters;
      readonly depth: Millimeters;
    };

// The three arms of TempestCordPassThroughPlacement, named so the per-topology
// model can pair "no cord" with either topology's present-cord arm.
export type TempestNoCord = Extract<TempestCordPassThroughPlacement, { readonly type: "none" }>;
export type TempestSandwichCord = Extract<TempestCordPassThroughPlacement, { readonly topology: "sandwich" }>;
export type TempestQuadCord = Extract<TempestCordPassThroughPlacement, { readonly topology: "quad" }>;

export type TempestChunkGrid = {
  readonly countX: number;
  readonly countY: number;
  readonly countZ: number;
  readonly totalCount: number;
  readonly chunkWidth: Millimeters;
  readonly chunkDepth: Millimeters;
  readonly chunkHeight: Millimeters;
  // Per-axis cut boundaries, length count+1 (0 … extent). Uniform for the model's
  // own grid; the printable kit produces feature-aware boundaries that avoid
  // slicing through fan grills. chunkWidth/Depth/Height report the largest gap.
  readonly boundariesX: readonly Millimeters[];
  readonly boundariesY: readonly Millimeters[];
  readonly boundariesZ: readonly Millimeters[];
};

export type TempestResolvedRenderTarget =
  | {
      readonly type: "assembly";
    }
  | {
      readonly type: "chunk";
      readonly chunkIndex: TempestChunkIndex;
      readonly origin: {
        readonly x: Millimeters;
        readonly y: Millimeters;
        readonly z: Millimeters;
      };
      readonly moveToOrigin: boolean;
    };

// How the printable output is oriented on the bed: kept as-modelled, or stood
// upright (the dual-filter sandwich prints best on its side).
export type TempestPrintableEnvelope = {
  readonly width: Millimeters;
  readonly depth: Millimeters;
  readonly height: Millimeters;
};

export type TempestPrintablePose =
  | {
      readonly type: "source";
      readonly envelope: TempestPrintableEnvelope;
    }
  | {
      readonly type: "upright-dual-filter";
      readonly envelope: TempestPrintableEnvelope;
    };

// Everything that is the same shape whatever the topology. The topology tag and
// the three correlated layout fields live on the per-topology arms below, so an
// illegal cross-combo (e.g. a "sandwich" model carrying a quad filter layout) is
// simply unrepresentable.
type TempestModelCommon = {
  readonly settings: TempestSettings;
  readonly box: TempestBoxEnvelope;
  readonly frame: TempestFrameModel;
  readonly chunkGrid: TempestChunkGrid;
  readonly renderTarget: TempestResolvedRenderTarget;
  readonly printablePose: TempestPrintablePose;
};

export type TempestSandwichModel = TempestModelCommon & {
  readonly topology: "sandwich";
  readonly filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>;
  readonly fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>;
  readonly cordPassThrough: TempestSandwichCord | TempestNoCord;
};

export type TempestQuadModel = TempestModelCommon & {
  readonly topology: "quad";
  readonly filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>;
  readonly fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>;
  readonly cordPassThrough: TempestQuadCord | TempestNoCord;
};

export type TempestModel = TempestSandwichModel | TempestQuadModel;

// #######################################
// Defaults
// #######################################

// ##############################
// Default Settings
// ##############################

export const defaultTempestHorizontalFilter: TempestHorizontalFilterSize = {
  footprintWidth: 495,
  footprintDepth: 495,
  thickness: 45,
};

export const defaultTempestTowerFilter: TempestTowerFilterSize = {
  faceWidth: 495,
  faceHeight: 495,
  thickness: 45,
};

const defaultTempestHoneycombHexFlatToFlat = 10;
const defaultTempestHoneycombRibThickness = 1.6;

export const defaultTempestSettings: TempestSettings = {
  arrangement: {
    type: "dual-horizontal-sandwich",
    filter: defaultTempestHorizontalFilter,
  },
  fan: {
    diameter: 140,
    screwHoleDiameter: 5,
    wallRequests: {
      front: { type: "fixed", count: 0 },
      back: { type: "fixed", count: 0 },
      left: { type: "automatic" },
      right: { type: "automatic" },
    },
    opening: {
      type: "honeycomb",
      hexFlatToFlat: defaultTempestHoneycombHexFlatToFlat,
      ribThickness: defaultTempestHoneycombRibThickness,
    },
    boxExhaust: {
      fanHoleSize: 0,
      ringOne: { screwHoles: 4, screwDiameter: 6, radius: 0 },
      ringTwo: { screwHoles: 4, screwDiameter: 6, radius: 0 },
    },
  },
  frame: {
    wallThickness: 5,
    outsideFlangeThickness: 10,
    rim: 30,
    chamferSize: 2,
    towerCornerPostChamfer: 55,
    filterFitClearance: 1,
  },
  filterSlot: {
    wall: "back",
    clearance: 1,
    endMargin: 4,
  },
  cordPassThrough: defaultTempestCordPassThrough,
  alignmentPins: {
    type: "enabled",
    diameter: 1.8,
    holeDepth: 10,
    spacing: 30,
  },
  // Off for now — the deboss feature is parked (UI hidden); the geometry code
  // stays and still runs whenever chunkLabels is explicitly enabled.
  chunkLabels: false,
  printBed: {
    width: 256,
    depth: 256,
    height: 256,
  },
  renderTarget: {
    type: "assembly",
  },
};

// #######################################
// Model Creation
// #######################################

// ##############################
// Public Factory
// ##############################

export function createTempestModel(settings: TempestSettings = defaultTempestSettings): TempestModel {
  const safeSettings = normalizeTempestSettings(settings);
  const plan = planForArrangement(safeSettings.arrangement); // the ONE topology decision
  const frame = createFrameModel(safeSettings.frame);
  // plan.box has the same signature in both arms, so it calls on the union plan.
  const box = plan.box(safeSettings, frame);
  const chunkGrid = createChunkGrid(box, safeSettings.printBed);
  // The topology-independent fields; printablePose joins per branch since it is
  // derived from that branch's filter layout.
  const common: Omit<TempestModelCommon, "printablePose"> = {
    settings: safeSettings,
    box,
    frame,
    chunkGrid,
    renderTarget: resolveRenderTarget(safeSettings.renderTarget, chunkGrid),
  };

  // Dispatch on the plan's concrete topology, then build the variant from a plan
  // whose filter/fan/cord/pose arms are already that topology. Nothing is generic
  // at the point of construction, so each literal type-checks against
  // TempestSandwichModel / TempestQuadModel and is assignable to TempestModel with
  // no cast — the generic TempestModelPlan<T> keeps every step's tag in lockstep.
  if (plan.topology === "sandwich") {
    const filterLayout = plan.filterLayout(safeSettings, box, frame);
    const fanLayout = plan.fanLayout(safeSettings, box, filterLayout);
    return {
      ...common,
      topology: "sandwich",
      filterLayout,
      fanLayout,
      cordPassThrough: plan.cordPlacement(safeSettings, box, filterLayout, fanLayout),
      printablePose: plan.pose(box, filterLayout),
    };
  }
  const filterLayout = plan.filterLayout(safeSettings, box, frame);
  const fanLayout = plan.fanLayout(safeSettings, box, filterLayout);
  return {
    ...common,
    topology: "quad",
    filterLayout,
    fanLayout,
    cordPassThrough: plan.cordPlacement(safeSettings, box, filterLayout, fanLayout),
    printablePose: plan.pose(box, filterLayout),
  };
}

// The family of derived-model builders for one topology. createTempestModel runs
// its steps in order; the generic T keeps every step's tag in lockstep so the
// filter, fan, and cord arms a plan produces all share its topology.
export type TempestModelPlan<T extends TempestTopology> = {
  readonly topology: T;
  readonly box: (settings: TempestSettings, frame: TempestFrameModel) => TempestBoxEnvelope;
  readonly filterLayout: (
    settings: TempestSettings,
    box: TempestBoxEnvelope,
    frame: TempestFrameModel,
  ) => Extract<TempestFilterLayout, { readonly topology: T }>;
  readonly fanLayout: (
    settings: TempestSettings,
    box: TempestBoxEnvelope,
    filterLayout: Extract<TempestFilterLayout, { readonly topology: T }>,
  ) => Extract<TempestFanLayout, { readonly topology: T }>;
  readonly cordPlacement: (
    settings: TempestSettings,
    box: TempestBoxEnvelope,
    filterLayout: Extract<TempestFilterLayout, { readonly topology: T }>,
    fanLayout: Extract<TempestFanLayout, { readonly topology: T }>,
  ) => Extract<TempestCordPassThroughPlacement, { readonly topology: T }> | TempestNoCord;
  readonly pose: (
    box: TempestBoxEnvelope,
    filterLayout: Extract<TempestFilterLayout, { readonly topology: T }>,
  ) => TempestPrintablePose;
};

// The ONLY place an arrangement preset maps to a topology after the settings
// boundary. Three presets collapse to two topologies.
function planForArrangement(arrangement: TempestFilterArrangement): TempestModelPlan<"sandwich"> | TempestModelPlan<"quad"> {
  switch (arrangement.type) {
    case "single-horizontal-top-filter":
    case "dual-horizontal-sandwich":
      return sandwichPlan;
    case "four-side-filter-tower":
      return quadPlan;
    default:
      return assertNever(arrangement);
  }
}

// ##############################
// Boundary Normalization
// ##############################

function normalizeTempestSettings(settings: TempestSettings): TempestSettings {
  return {
    ...settings,
    arrangement: normalizeTempestArrangement(settings.arrangement),
    fan: normalizeTempestFanSettings(settings.fan),
    frame: normalizeTempestFrameSettings(settings.frame),
    filterSlot: {
      ...settings.filterSlot,
      clearance: finiteNonNegative(settings.filterSlot.clearance, defaultTempestSettings.filterSlot.clearance),
      endMargin: finiteNonNegative(settings.filterSlot.endMargin, defaultTempestSettings.filterSlot.endMargin),
    },
    cordPassThrough: normalizeTempestCordPassThrough(settings.cordPassThrough),
    alignmentPins: normalizeTempestAlignmentPins(settings.alignmentPins),
    chunkLabels: settings.chunkLabels === true,
    printBed: {
      width: finitePositive(settings.printBed.width, defaultTempestSettings.printBed.width),
      depth: finitePositive(settings.printBed.depth, defaultTempestSettings.printBed.depth),
      height: finitePositive(settings.printBed.height, defaultTempestSettings.printBed.height),
    },
    renderTarget: normalizeTempestRenderTarget(settings.renderTarget),
  };
}

function normalizeTempestArrangement(arrangement: TempestFilterArrangement): TempestFilterArrangement {
  if (arrangement.type === "four-side-filter-tower") {
    return {
      type: "four-side-filter-tower",
      filter: {
        faceWidth: finitePositive(arrangement.filter.faceWidth, defaultTempestTowerFilter.faceWidth),
        faceHeight: finitePositive(arrangement.filter.faceHeight, defaultTempestTowerFilter.faceHeight),
        thickness: finitePositive(arrangement.filter.thickness, defaultTempestTowerFilter.thickness),
      },
    };
  }

  return {
    type: arrangement.type,
    filter: {
      footprintWidth: finitePositive(arrangement.filter.footprintWidth, defaultTempestHorizontalFilter.footprintWidth),
      footprintDepth: finitePositive(arrangement.filter.footprintDepth, defaultTempestHorizontalFilter.footprintDepth),
      thickness: finitePositive(arrangement.filter.thickness, defaultTempestHorizontalFilter.thickness),
    },
  };
}

function normalizeTempestFanSettings(fan: TempestFanSettings): TempestFanSettings {
  return {
    ...fan,
    diameter: finitePositive(fan.diameter, defaultTempestSettings.fan.diameter),
    screwHoleDiameter: finiteNonNegative(fan.screwHoleDiameter, defaultTempestSettings.fan.screwHoleDiameter),
    wallRequests: {
      front: normalizeTempestFanCountRequest(fan.wallRequests.front),
      back: normalizeTempestFanCountRequest(fan.wallRequests.back),
      left: normalizeTempestFanCountRequest(fan.wallRequests.left),
      right: normalizeTempestFanCountRequest(fan.wallRequests.right),
    },
    opening:
      fan.opening.type === "honeycomb"
        ? {
            type: "honeycomb",
            hexFlatToFlat: finitePositive(fan.opening.hexFlatToFlat, defaultTempestHoneycombHexFlatToFlat),
            ribThickness: finitePositive(fan.opening.ribThickness, defaultTempestHoneycombRibThickness),
          }
        : { type: "plain" },
  };
}

function normalizeTempestFanCountRequest(request: TempestFanCountRequest): TempestFanCountRequest {
  if (request.type === "automatic") {
    return request;
  }
  return {
    type: "fixed",
    count: finiteNonNegativeInteger(request.count, 0),
  };
}

function normalizeTempestFrameSettings(frame: TempestFrameSettings): TempestFrameSettings {
  return {
    wallThickness: finitePositive(frame.wallThickness, defaultTempestSettings.frame.wallThickness),
    outsideFlangeThickness: finitePositive(frame.outsideFlangeThickness, defaultTempestSettings.frame.outsideFlangeThickness),
    rim: finiteNonNegative(frame.rim, defaultTempestSettings.frame.rim),
    chamferSize: finiteNonNegative(frame.chamferSize, defaultTempestSettings.frame.chamferSize),
    towerCornerPostChamfer: finiteNonNegative(frame.towerCornerPostChamfer, defaultTempestSettings.frame.towerCornerPostChamfer),
    filterFitClearance: finiteNonNegative(frame.filterFitClearance, defaultTempestSettings.frame.filterFitClearance),
  };
}

function normalizeTempestCordPassThrough(cord: TempestCordPassThrough): TempestCordPassThrough {
  if (cord.type === "none") {
    return cord;
  }
  const fallback = defaultTempestSettings.cordPassThrough.type === "wall" ? defaultTempestSettings.cordPassThrough : cord;
  return {
    ...cord,
    diameter: finitePositive(cord.diameter, fallback.diameter),
    cornerOffset: finiteNonNegative(cord.cornerOffset, fallback.cornerOffset),
  };
}

function normalizeTempestAlignmentPins(alignmentPins: TempestAlignmentPinSettings): TempestAlignmentPinSettings {
  if (alignmentPins.type === "disabled") {
    return alignmentPins;
  }
  const fallback = defaultTempestSettings.alignmentPins.type === "enabled" ? defaultTempestSettings.alignmentPins : alignmentPins;
  return {
    type: "enabled",
    diameter: finiteNonNegative(alignmentPins.diameter, fallback.diameter),
    holeDepth: finiteNonNegative(alignmentPins.holeDepth, fallback.holeDepth),
    spacing: finiteNonNegative(alignmentPins.spacing, fallback.spacing),
  };
}

function normalizeTempestRenderTarget(renderTarget: TempestRenderTarget): TempestRenderTarget {
  if (renderTarget.type === "assembly") {
    return renderTarget;
  }
  return {
    type: "chunk",
    chunkIndex: {
      x: finiteInteger(renderTarget.chunkIndex.x, 0),
      y: finiteInteger(renderTarget.chunkIndex.y, 0),
      z: finiteInteger(renderTarget.chunkIndex.z, 0),
    },
    moveToOrigin: renderTarget.moveToOrigin,
  };
}

// ##############################
// Derived Frame
// ##############################

function createFrameModel(frame: TempestFrameSettings): TempestFrameModel {
  return {
    ...frame,
    insideFlangeThickness: frame.wallThickness,
  };
}

// ##############################
// Derived Chunking and Pins
// ##############################

function uniformBoundaries(extent: Millimeters, count: number): Millimeters[] {
  return Array.from({ length: count + 1 }, (_, index) => (extent * index) / count);
}

function createChunkGrid(box: TempestBoxEnvelope, bed: TempestPrintBedVolume): TempestChunkGrid {
  const countX = Math.max(1, Math.ceil(box.width / bed.width));
  const countY = Math.max(1, Math.ceil(box.depth / bed.depth));
  const countZ = Math.max(1, Math.ceil(box.height / bed.height));
  return {
    countX,
    countY,
    countZ,
    totalCount: countX * countY * countZ,
    chunkWidth: box.width / countX,
    chunkDepth: box.depth / countY,
    chunkHeight: box.height / countZ,
    boundariesX: uniformBoundaries(box.width, countX),
    boundariesY: uniformBoundaries(box.depth, countY),
    boundariesZ: uniformBoundaries(box.height, countZ),
  };
}

function resolveRenderTarget(renderTarget: TempestRenderTarget, chunkGrid: TempestChunkGrid): TempestResolvedRenderTarget {
  if (renderTarget.type === "assembly") {
    return { type: "assembly" };
  }
  const chunkIndex = {
    x: clampInteger(renderTarget.chunkIndex.x, 0, chunkGrid.countX - 1),
    y: clampInteger(renderTarget.chunkIndex.y, 0, chunkGrid.countY - 1),
    z: clampInteger(renderTarget.chunkIndex.z, 0, chunkGrid.countZ - 1),
  };
  return {
    type: "chunk",
    chunkIndex,
    origin: {
      x: chunkGrid.boundariesX[chunkIndex.x],
      y: chunkGrid.boundariesY[chunkIndex.y],
      z: chunkGrid.boundariesZ[chunkIndex.z],
    },
    moveToOrigin: renderTarget.moveToOrigin,
  };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function finiteInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}
