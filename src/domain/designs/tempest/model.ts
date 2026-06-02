import type { Millimeters } from "@/domain/units";

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

export type TempestTowerFilterPocket = {
  readonly wall: TempestWall;
  readonly width: Millimeters;
  readonly height: Millimeters;
  readonly depth: Millimeters;
};

export type TempestFilterLayout =
  | {
      readonly type: "horizontal-stack";
      readonly filterCount: 1 | 2;
      readonly bottomPanel: "solid-plate" | "open-frame";
      readonly filters: readonly TempestHorizontalFilterLayer[];
      readonly flanges: readonly TempestHorizontalFlangeLayer[];
      readonly loading: {
        readonly type: "wall-slots";
        readonly slots: readonly TempestHorizontalFilterSlot[];
      };
    }
  | {
      readonly type: "side-filter-tower";
      readonly filterCount: 4;
      readonly structuralOffset: Millimeters;
      readonly bottomPlateThickness: Millimeters;
      readonly topPlateThickness: Millimeters;
      readonly airChamber: TempestTowerAirChamber;
      readonly filterPockets: readonly TempestTowerFilterPocket[];
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
      readonly type: "horizontal-wall-fans";
      readonly bodyDepth: Millimeters;
      readonly screwPitch: Millimeters;
      readonly cornerSafeMinimum: Millimeters;
      readonly localVerticalCenter: Millimeters;
      readonly walls: TempestWallMap<TempestWallFanLayout>;
    }
  | {
      readonly type: "tower-top-grid";
      readonly bodyDepth: Millimeters;
      readonly screwPitch: Millimeters;
      readonly minimumCenterFromEdge: Millimeters;
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
      readonly type: "horizontal-wall-cylinder";
      readonly wall: TempestWall;
      readonly side: "left" | "center" | "right";
      readonly diameter: Millimeters;
      readonly positionAlongWall: Millimeters;
      readonly verticalCenter: Millimeters;
      readonly axis: "x" | "y";
    }
  | {
      readonly type: "tower-top-cylinder";
      readonly wall: TempestWall;
      readonly side: "left" | "center" | "right";
      readonly diameter: Millimeters;
      readonly x: Millimeters;
      readonly y: Millimeters;
      readonly zStart: Millimeters;
      readonly depth: Millimeters;
      readonly axis: "z";
    };

export type TempestChunkGrid = {
  readonly countX: number;
  readonly countY: number;
  readonly countZ: number;
  readonly totalCount: number;
  readonly chunkWidth: Millimeters;
  readonly chunkDepth: Millimeters;
  readonly chunkHeight: Millimeters;
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

export type TempestModel = {
  readonly settings: TempestSettings;
  readonly box: TempestBoxEnvelope;
  readonly frame: TempestFrameModel;
  readonly filterLayout: TempestFilterLayout;
  readonly fanLayout: TempestFanLayout;
  readonly cordPassThrough: TempestCordPassThroughPlacement;
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
  const box = createBoxEnvelope(safeSettings);
  const frame = createFrameModel(safeSettings.frame);
  const filterLayout = createFilterLayout(safeSettings, box, frame);
  const fanLayout = createFanLayout(safeSettings, box, filterLayout);
  const chunkGrid = createChunkGrid(box, safeSettings.printBed);

  return {
    settings: safeSettings,
    box,
    frame,
    filterLayout,
    fanLayout,
    cordPassThrough: createCordPassThroughPlacement(safeSettings, box, filterLayout),
    chunkGrid,
    renderTarget: resolveRenderTarget(safeSettings.renderTarget, chunkGrid),
  };
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
// Derived Box
// ##############################

function createBoxEnvelope(settings: TempestSettings): TempestBoxEnvelope {
  const frame = settings.frame;
  if (settings.arrangement.type === "four-side-filter-tower") {
    const offset = towerStructuralOffset(settings.arrangement, frame);
    const height = frame.wallThickness + settings.arrangement.filter.faceHeight + frame.outsideFlangeThickness;
    return {
      width: settings.arrangement.filter.faceWidth + 2 * offset,
      depth: settings.arrangement.filter.faceWidth + 2 * offset,
      height,
      wallHeight: height - frame.wallThickness - frame.outsideFlangeThickness,
    };
  }

  const filterCount = horizontalFilterCount(settings.arrangement);
  const height =
    settings.fan.diameter +
    2 +
    2 * frame.outsideFlangeThickness +
    filterCount * (settings.arrangement.filter.thickness + frame.wallThickness);
  return {
    width: settings.arrangement.filter.footprintWidth + 2 * frame.wallThickness,
    depth: settings.arrangement.filter.footprintDepth + 2 * frame.wallThickness,
    height,
    wallHeight: height - 2 * frame.outsideFlangeThickness,
  };
}

function createFrameModel(frame: TempestFrameSettings): TempestFrameModel {
  return {
    ...frame,
    insideFlangeThickness: frame.wallThickness,
  };
}

function towerStructuralOffset(arrangement: Extract<TempestFilterArrangement, { readonly type: "four-side-filter-tower" }>, frame: TempestFrameSettings): Millimeters {
  return frame.outsideFlangeThickness + arrangement.filter.thickness + frame.wallThickness;
}

function horizontalFilterCount(arrangement: Exclude<TempestFilterArrangement, { readonly type: "four-side-filter-tower" }>): 1 | 2 {
  return arrangement.type === "single-horizontal-top-filter" ? 1 : 2;
}

// ##############################
// Derived Filters
// ##############################

function createFilterLayout(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
  frame: TempestFrameModel,
): TempestFilterLayout {
  if (settings.arrangement.type === "four-side-filter-tower") {
    return createTowerFilterLayout(settings.arrangement, box, frame);
  }
  return createHorizontalFilterLayout(settings.arrangement, settings.filterSlot, box, frame);
}

function createHorizontalFilterLayout(
  arrangement: Exclude<TempestFilterArrangement, { readonly type: "four-side-filter-tower" }>,
  filterSlot: TempestFilterSlotSettings,
  box: TempestBoxEnvelope,
  frame: TempestFrameModel,
): Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }> {
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
    type: "horizontal-stack",
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

function createTowerFilterLayout(
  arrangement: Extract<TempestFilterArrangement, { readonly type: "four-side-filter-tower" }>,
  box: TempestBoxEnvelope,
  frame: TempestFrameModel,
): Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }> {
  const structuralOffset = towerStructuralOffset(arrangement, frame);
  const zMin = frame.wallThickness;
  const zMax = box.height - frame.outsideFlangeThickness;
  return {
    type: "side-filter-tower",
    filterCount: 4,
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
    filterPockets: tempestWalls.map((wall) => ({
      wall,
      width: arrangement.filter.faceWidth,
      height: arrangement.filter.faceHeight,
      depth: arrangement.filter.thickness,
    })),
    loading: {
      type: "top-plate-slots",
      slotCount: 4,
    },
  };
}

// ##############################
// Derived Fans
// ##############################

function createFanLayout(settings: TempestSettings, box: TempestBoxEnvelope, filterLayout: TempestFilterLayout): TempestFanLayout {
  const bodyDepth = tempestFanBodyDepth(settings.fan.diameter);
  const screwPitch = tempestFanScrewPitch(settings.fan.diameter);
  if (filterLayout.type === "side-filter-tower") {
    const minimumCenterFromEdge = filterLayout.structuralOffset + settings.fan.diameter / 2;
    const positionsX = towerFanPositions(towerFansPerSide(box.width, minimumCenterFromEdge, settings.fan.diameter), box.width, settings.fan.diameter);
    const positionsY = towerFanPositions(towerFansPerSide(box.depth, minimumCenterFromEdge, settings.fan.diameter), box.depth, settings.fan.diameter);
    return {
      type: "tower-top-grid",
      bodyDepth,
      screwPitch,
      minimumCenterFromEdge,
      columns: positionsX.length,
      rows: positionsY.length,
      positionsX,
      positionsY,
      fanCount: positionsX.length * positionsY.length,
    };
  }

  const cornerSafeMinimum = settings.frame.wallThickness + bodyDepth + settings.fan.diameter / 2;
  const localVerticalCenter = horizontalFanVerticalCenter(
    filterLayout.filterCount,
    box.wallHeight,
    settings.fan.diameter,
    settings.arrangement.filter.thickness,
    settings.frame.wallThickness,
    settings.cordPassThrough.type === "wall" ? settings.cordPassThrough.diameter : 0,
  );
  return {
    type: "horizontal-wall-fans",
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

export function tempestFanBodyDepth(fanDiameter: Millimeters): Millimeters {
  if (fanDiameter === 120) {
    return 25;
  }
  if (fanDiameter === 140) {
    return 27;
  }
  return fanDiameter * 0.19;
}

export function tempestFanScrewPitch(fanDiameter: Millimeters): Millimeters {
  if (fanDiameter === 120) {
    return 105;
  }
  if (fanDiameter === 140) {
    return 125;
  }
  return fanDiameter * 0.85;
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

function towerFansPerSide(length: Millimeters, minimumCenterFromEdge: Millimeters, fanDiameter: Millimeters): number {
  const span = length - 2 * minimumCenterFromEdge;
  if (span < 0) {
    return 0;
  }
  return Math.max(0, Math.floor(1 + span / fanSpacing(fanDiameter)));
}

function towerFanPositions(
  fanCount: number,
  length: Millimeters,
  fanDiameter: Millimeters,
): readonly Millimeters[] {
  if (fanCount === 0) {
    return [];
  }
  const total = fanCount <= 1 ? 0 : (fanCount - 1) * fanSpacing(fanDiameter);
  const first = fanCount === 1 ? length / 2 : (length - total) / 2;
  return Array.from({ length: fanCount }, (_, index) => first + index * fanSpacing(fanDiameter));
}

function fanSpacing(fanDiameter: Millimeters): Millimeters {
  return fanDiameter + 10;
}

// ##############################
// Derived Cord Hole
// ##############################

function createCordPassThroughPlacement(
  settings: TempestSettings,
  box: TempestBoxEnvelope,
  filterLayout: TempestFilterLayout,
): TempestCordPassThroughPlacement {
  if (settings.cordPassThrough.type === "none") {
    return { type: "none" };
  }
  if (filterLayout.type === "side-filter-tower") {
    return createTowerCordPassThroughPlacement(settings.cordPassThrough, filterLayout);
  }
  const wallLength = settings.cordPassThrough.wall === "front" || settings.cordPassThrough.wall === "back" ? box.width : box.depth;
  return {
    type: "horizontal-wall-cylinder",
    wall: settings.cordPassThrough.wall,
    side: settings.cordPassThrough.side,
    diameter: settings.cordPassThrough.diameter,
    positionAlongWall: cordPositionAlongWall(wallLength, settings.cordPassThrough.side, horizontalCordOffset(settings)),
    verticalCenter: box.height / 2,
    axis: settings.cordPassThrough.wall === "front" || settings.cordPassThrough.wall === "back" ? "y" : "x",
  };
}

function createTowerCordPassThroughPlacement(
  cord: Extract<TempestCordPassThrough, { readonly type: "wall" }>,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): TempestCordPassThroughPlacement {
  const offset = Math.max(cord.diameter / 2 + 2, cord.cornerOffset);
  return {
    type: "tower-top-cylinder",
    wall: cord.wall,
    side: cord.side,
    diameter: cord.diameter,
    x: towerCordUsesHighX(cord) ? filterLayout.airChamber.xMax - offset : filterLayout.airChamber.xMin + offset,
    y: towerCordUsesHighY(cord) ? filterLayout.airChamber.yMax - offset : filterLayout.airChamber.yMin + offset,
    zStart: filterLayout.airChamber.zMax,
    depth: filterLayout.topPlateThickness,
    axis: "z",
  };
}

function horizontalCordOffset(settings: TempestSettings): Millimeters {
  if (settings.cordPassThrough.type === "none") {
    return 0;
  }
  return Math.max(settings.cordPassThrough.diameter / 2 + settings.frame.wallThickness + 1, settings.cordPassThrough.cornerOffset);
}

function cordPositionAlongWall(wallLength: Millimeters, side: "left" | "center" | "right", offset: Millimeters): Millimeters {
  if (side === "center") {
    return wallLength / 2;
  }
  return side === "left" ? offset : wallLength - offset;
}

function towerCordUsesHighX(cord: Extract<TempestCordPassThrough, { readonly type: "wall" }>): boolean {
  return cord.wall === "right" || ((cord.wall === "front" || cord.wall === "back") && cord.side === "right");
}

function towerCordUsesHighY(cord: Extract<TempestCordPassThrough, { readonly type: "wall" }>): boolean {
  return cord.wall === "back" || ((cord.wall === "left" || cord.wall === "right") && cord.side === "right");
}

// ##############################
// Derived Chunking and Pins
// ##############################

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
      x: chunkIndex.x * chunkGrid.chunkWidth,
      y: chunkIndex.y * chunkGrid.chunkDepth,
      z: chunkIndex.z * chunkGrid.chunkHeight,
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

function finiteNonNegativeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

// #######################################
// Constants
// #######################################

const tempestWalls: readonly TempestWall[] = ["front", "back", "left", "right"];
