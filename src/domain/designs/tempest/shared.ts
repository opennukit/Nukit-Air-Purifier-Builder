import type { Millimeters } from "@/domain/units";

// #######################################
// Tempest Shared Leaf
// #######################################

// Topology-agnostic foundation: the input-model types, the wall vocabulary, and
// the family-independent sizing/cord/normalization helpers. This module imports
// NOTHING from model/sandwich/quad — it is the leaf both plan modules and the
// derived model build on top of, so there is no runtime import cycle between
// model.ts and the per-topology plans (sandwich.ts / quad.ts).

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
  // Clearance added per side around the MEASURED filter so it slides into its
  // cavity instead of press-fitting; deliberately separate from the measurement
  // so users enter the filter's real size and the box adds the play itself.
  readonly filterFitClearance: Millimeters;
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

// The shipped cord hole: an 8 mm bore hugging the right corner of the right
// wall. The raw purifier settings expose only the diameter as a user choice;
// the placement is fixed.
export const defaultTempestCordPassThrough = {
  type: "wall",
  diameter: 8,
  wall: "right",
  side: "right",
  cornerOffset: 17,
} as const satisfies TempestCordPassThrough;

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

// The cut filament piece is shorter than the combined hole depth so the seam
// can close fully with glue in the holes; the holes themselves stay holeDepth
// deep on each side.
export const PIN_GLUE_ROOM_MM: Millimeters = 2;

export function alignmentPinPieceLength(holeDepth: Millimeters): Millimeters {
  return 2 * holeDepth - PIN_GLUE_ROOM_MM;
}

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
// Shared Fan Sizing
// #######################################

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

// #######################################
// Shared Cord Helpers
// #######################################

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

// #######################################
// Shared Numeric Normalization
// #######################################

export function finiteNonNegativeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

// #######################################
// Wall Vocabulary
// #######################################

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

// #######################################
// Constants
// #######################################

// Shared fan sizing (family-specific spacing lives in sandwich.ts / quad.ts).
const FAN_TO_FAN_GAP_MM = 10; // minimum gap between adjacent fans (center spacing = diameter + this)
const FAN_BODY_DEPTH_RATIO = 0.19; // fallback body depth = diameter * this (off the 120/140 lookup)
const FAN_SCREW_PITCH_RATIO = 0.85; // fallback screw pitch = diameter * this (off the 120/140 lookup)

// Cord hole placement.
const CORD_WALL_MARGIN_MM = 1; // extra clearance past the wall when offsetting the cord hole from a corner
