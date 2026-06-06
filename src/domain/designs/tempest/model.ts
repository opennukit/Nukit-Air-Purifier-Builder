import type { Millimeters } from "@/domain/units";
import { assertNever, type TempestTopology } from "./topology";
import { sandwichPlan } from "./sandwich";
import { quadPlan } from "./quad";

// #######################################
// Tempest Input Model
// #######################################

// ##############################
// Filter Arrangements
// ##############################

export type TempestHorizontalFilterSize = {
  readonly footprintWidth: Millimeters;
  readonly footprintDepth: Millimeters;
  readonly thickness: Millimeters;
};

export type TempestTowerFilterSize = {
  readonly faceWidth: Millimeters;
  readonly faceHeight: Millimeters;
  readonly thickness: Millimeters;
};

export type TempestFilterArrangement =
  | {
      readonly type: "single-horizontal-top-filter";
      readonly filter: TempestHorizontalFilterSize;
    }
  | {
      readonly type: "dual-horizontal-sandwich";
      readonly filter: TempestHorizontalFilterSize;
    }
  | {
      readonly type: "four-side-filter-tower";
      readonly filter: TempestTowerFilterSize;
    };

// ##############################
// Fan and Opening Settings
// ##############################

export type TempestWall = "front" | "back" | "left" | "right";

export type TempestWallMap<T> = {
  readonly front: T;
  readonly back: T;
  readonly left: T;
  readonly right: T;
};

// Wall normals, the sandwich cord, and the quad wall rect all run in-plane.
// Primitives and fanPatternCut genuinely need the full set of three.
export type TempestPlanarAxis = "x" | "y";
export type TempestExtrudeAxis = "x" | "y" | "z";

export type TempestFanCountRequest =
  | {
      readonly type: "automatic";
    }
  | {
      readonly type: "fixed";
      readonly count: number;
    };

export type TempestFanOpening =
  | {
      readonly type: "plain";
    }
  | {
      readonly type: "honeycomb";
      readonly hexFlatToFlat: Millimeters;
      readonly ribThickness: Millimeters;
    };

// The 4-filter tower's top exhaust style: the default N×N grid of PC-fan cutouts,
// or a single large opening for a box/exhaust fan zip-tied through corner holes.
export type TempestTowerTopExhaust = "fan-grid" | "single-box-fan";

export type TempestFanSettings = {
  readonly diameter: Millimeters;
  readonly screwHoleDiameter: Millimeters;
  readonly wallRequests: TempestWallMap<TempestFanCountRequest>;
  readonly opening: TempestFanOpening;
  // Tower-only; defaults to "fan-grid" when omitted, and ignored by horizontal layouts.
  readonly topExhaust?: TempestTowerTopExhaust;
};

// ##############################
// Print Structure Settings
// ##############################

export type TempestFrameSettings = {
  readonly wallThickness: Millimeters;
  readonly outsideFlangeThickness: Millimeters;
  readonly rim: Millimeters;
  readonly chamferSize: Millimeters;
  readonly towerCornerPostChamfer: Millimeters;
};

export type TempestFilterSlotSettings = {
  readonly wall: TempestWall;
  readonly clearance: Millimeters;
  readonly endMargin: Millimeters;
};

export type TempestCordPassThrough =
  | {
      readonly type: "none";
    }
  | {
      readonly type: "wall";
      readonly diameter: Millimeters;
      readonly wall: TempestWall;
      readonly side: "left" | "center" | "right";
      readonly cornerOffset: Millimeters;
    };

export type TempestAlignmentPinSettings =
  | {
      readonly type: "disabled";
    }
  | {
      readonly type: "enabled";
      readonly diameter: Millimeters;
      readonly holeDepth: Millimeters;
      readonly spacing: Millimeters;
    };

export type TempestPrintBedVolume = {
  readonly width: Millimeters;
  readonly depth: Millimeters;
  readonly height: Millimeters;
};

export type TempestChunkIndex = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type TempestRenderTarget =
  | {
      readonly type: "assembly";
    }
  | {
      readonly type: "chunk";
      readonly chunkIndex: TempestChunkIndex;
      readonly moveToOrigin: boolean;
    };

export type TempestSettings = {
  readonly arrangement: TempestFilterArrangement;
  readonly fan: TempestFanSettings;
  readonly frame: TempestFrameSettings;
  readonly filterSlot: TempestFilterSlotSettings;
  readonly cordPassThrough: TempestCordPassThrough;
  readonly alignmentPins: TempestAlignmentPinSettings;
  readonly printBed: TempestPrintBedVolume;
  readonly renderTarget: TempestRenderTarget;
};

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
        readonly type: "top-plate-slots";
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

export type TempestFanLayout =
  | {
      readonly topology: "sandwich";
      readonly bodyDepth: Millimeters;
      readonly screwPitch: Millimeters;
      readonly cornerSafeMinimum: Millimeters;
      readonly localVerticalCenter: Millimeters;
      readonly walls: TempestWallMap<TempestWallFanLayout>;
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

export type TempestModel = {
  readonly settings: TempestSettings;
  readonly topology: TempestTopology;
  readonly box: TempestBoxEnvelope;
  readonly frame: TempestFrameModel;
  readonly filterLayout: TempestFilterLayout;
  readonly fanLayout: TempestFanLayout;
  readonly cordPassThrough: TempestCordPassThroughPlacement;
  readonly printablePose: TempestPrintablePose;
  readonly chunkGrid: TempestChunkGrid;
  readonly renderTarget: TempestResolvedRenderTarget;
};

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
  },
  frame: {
    wallThickness: 5,
    outsideFlangeThickness: 10,
    rim: 30,
    chamferSize: 2,
    towerCornerPostChamfer: 55,
  },
  filterSlot: {
    wall: "back",
    clearance: 1,
    endMargin: 4,
  },
  cordPassThrough: {
    type: "wall",
    diameter: 8,
    wall: "right",
    side: "right",
    cornerOffset: 17,
  },
  alignmentPins: {
    type: "enabled",
    diameter: 1.8,
    holeDepth: 10,
    spacing: 30,
  },
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
  const box = plan.box(safeSettings, frame);
  const filterLayout = plan.filterLayout(safeSettings, box, frame);
  const fanLayout = plan.fanLayout(safeSettings, box, filterLayout);
  const cordPassThrough = plan.cordPlacement(safeSettings, box, filterLayout);
  const chunkGrid = createChunkGrid(box, safeSettings.printBed);

  return {
    settings: safeSettings,
    topology: plan.topology,
    box,
    frame,
    filterLayout,
    fanLayout,
    cordPassThrough,
    printablePose: plan.pose(box, filterLayout),
    chunkGrid,
    renderTarget: resolveRenderTarget(safeSettings.renderTarget, chunkGrid),
  };
}

// The family of derived-model builders for one topology. createTempestModel runs
// its steps in order; the spine (topology.ts) guarantees the steps' tags agree.
export type TempestModelPlan = {
  readonly topology: TempestTopology;
  readonly box: (settings: TempestSettings, frame: TempestFrameModel) => TempestBoxEnvelope;
  readonly filterLayout: (settings: TempestSettings, box: TempestBoxEnvelope, frame: TempestFrameModel) => TempestFilterLayout;
  readonly fanLayout: (settings: TempestSettings, box: TempestBoxEnvelope, filterLayout: TempestFilterLayout) => TempestFanLayout;
  readonly cordPlacement: (
    settings: TempestSettings,
    box: TempestBoxEnvelope,
    filterLayout: TempestFilterLayout,
  ) => TempestCordPassThroughPlacement;
  readonly pose: (box: TempestBoxEnvelope, filterLayout: TempestFilterLayout) => TempestPrintablePose;
};

// The ONLY place an arrangement preset maps to a topology after the settings
// boundary. Three presets collapse to two topologies.
function planForArrangement(arrangement: TempestFilterArrangement): TempestModelPlan {
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
// Shared Fan Sizing
// ##############################

export function tempestFanBodyDepth(fanDiameter: Millimeters): Millimeters {
  if (fanDiameter === 120) {
    return 25;
  }
  if (fanDiameter === 140) {
    return 27;
  }
  return fanDiameter * FAN_BODY_DEPTH_RATIO;
}

export function tempestFanScrewPitch(fanDiameter: Millimeters): Millimeters {
  if (fanDiameter === 120) {
    return 105;
  }
  if (fanDiameter === 140) {
    return 125;
  }
  return fanDiameter * FAN_SCREW_PITCH_RATIO;
}

export function fanSpacing(fanDiameter: Millimeters): Millimeters {
  return fanDiameter + FAN_TO_FAN_GAP_MM;
}

// ##############################
// Shared Cord Helpers
// ##############################

export function horizontalCordOffset(settings: TempestSettings): Millimeters {
  if (settings.cordPassThrough.type === "none") {
    return 0;
  }
  return Math.max(settings.cordPassThrough.diameter / 2 + settings.frame.wallThickness + CORD_WALL_MARGIN_MM, settings.cordPassThrough.cornerOffset);
}

export function cordPositionAlongWall(wallLength: Millimeters, side: "left" | "center" | "right", offset: Millimeters): Millimeters {
  if (side === "center") {
    return wallLength / 2;
  }
  return side === "left" ? offset : wallLength - offset;
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

export function finiteNonNegativeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

// #######################################
// Constants
// #######################################

// Shared fan sizing (family-specific spacing lives in sandwich.ts / quad.ts).
const FAN_TO_FAN_GAP_MM = 10; // minimum gap between adjacent fans (center spacing = diameter + this)
const FAN_BODY_DEPTH_RATIO = 0.19; // fallback body depth = diameter * this (off the 120/140 lookup)
const FAN_SCREW_PITCH_RATIO = 0.85; // fallback screw pitch = diameter * this (off the 120/140 lookup)

// Cord hole placement.
const CORD_WALL_MARGIN_MM = 1; // extra clearance past the wall when offsetting the cord hole from a corner

export const tempestWalls: readonly TempestWall[] = ["front", "back", "left", "right"];

// Builds a TempestWallMap by applying `build` to each wall. The key IS the wall,
// so consumers index by wall name rather than searching a positional array.
export function mapTempestWalls<T>(build: (wall: TempestWall) => T): TempestWallMap<T> {
  return {
    front: build("front"),
    back: build("back"),
    left: build("left"),
    right: build("right"),
  };
}
