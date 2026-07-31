import type { PurifierSettings } from "@/domain/purifier/settingsModel";
import type { FilterCount } from "@/domain/purifier/designPresets";
import type { FilterDimensions } from "@/domain/purifier/filter";
import type { FanCountRequest } from "@/domain/purifier/fans";

export type FilterFrameFace = "inner" | "outer";

export type FilterLayerGeometry = {
  index: number;
  mediaCenterY: number;
  outerFrameY: number;
  innerFrameY: number;
  explodeDirectionY: -1 | 1;
};

export type AirPurifierGeometry = {
  filterDimensions: FilterDimensions;
  fanDiameter: number;
  filterCount: FilterCount;
  materialThickness: number;
  workingDepth: number;
  chamberHeight: number;
  rim: number;
  filterLayers: FilterLayerGeometry[];
  filterFingerHoleYs: number[];
};

const minimumRim = 12;
const maximumRim = 90;
const minimumFrameOpening = 1;

// The fan-placement clamp keeps a fan this far (its frame radius plus 4 mm) from
// each panel edge (createFanCuts). The hand-cut chamber must give the fan that
// margin on both sides of its clear zone, or a thick filter squeezes the zone and
// the fan is clamped down into the filter. 2 x 4 mm = 8 mm of clearance beyond the
// fan frame does it. The laser chamber keeps its own +2 (matched to the Boxes.py
// oracle) and adds a material flange, so it is not touched here.
const HAND_CUT_FAN_CHAMBER_CLEARANCE_MM = 8;

// Clearance the hand-cut fan-clear zone keeps beyond the fan frame. Foamcore walls
// are thick, and the perpendicular walls capping the fan zone eat into it, so the
// clearance scales with the wall thickness (one thickness of breathing room on each
// side of the fan) and never drops below the base 8 mm for thin stock.
function handCutFanChamberClearance(materialThickness: number): number {
  return Math.max(HAND_CUT_FAN_CHAMBER_CLEARANCE_MM, 2 * materialThickness);
}

export function createAirPurifierGeometry(settings: PurifierSettings): AirPurifierGeometry {
  const dimensions = settings.filter;
  const materialThickness = settings.cutting.materialThickness;
  const fanDiameter = settings.fan.spec.diameter;
  // Hand cut (foamcore) sizes the box snugly to the filter with no joinery overlap:
  // the inner depth equals the filter depth, and the chamber (the side panel's
  // "width") is the fan frame plus the filter thickness — the filter rests against
  // the fans and is taped in, so there are no flange layers to add.
  const handCut = settings.design.type === "laser-cut" && settings.design.cutStyle === "hand";
  const workingDepth = handCut ? dimensions.depth : dimensions.depth - materialThickness;
  // The one-side "Back" box uses the user's Box depth as the chamber instead of
  // the fan-diameter chamber (fans live on the back plate, not the walls).
  const backFanChamberDepth = oneSideBackFanBoxDepth(settings);
  // Two-filter sandwich only: a manual override for the fan-chamber gap (the space
  // between the two inside filter flanges where the fans sit), so builders can open
  // it up for oversized fan gaskets. Undefined = Auto (fan-diameter driven).
  const fanChamberOverride = twoFilterFanChamberOverride(settings);
  // Hand-cut depth is the airflow gap plus one filter thickness (the filter taped
  // against the fans). The gap is the user's Box depth when the back-plate fan box
  // is active, otherwise the manual override or just the fan frame, so the Box depth
  // control drives the depth exactly like it does for the laser box.
  const chamberHeight = handCut
    ? (backFanChamberDepth ?? fanChamberOverride ?? fanDiameter + handCutFanChamberClearance(materialThickness)) +
      settings.filterCount * dimensions.thickness
    : (backFanChamberDepth ?? fanChamberOverride ?? fanDiameter + 2) +
      settings.filterCount * (dimensions.thickness + materialThickness);
  const rim = clampRimForGeometry(settings.cutting.rim, dimensions.width, workingDepth, chamberHeight);

  return {
    filterDimensions: dimensions,
    fanDiameter,
    filterCount: settings.filterCount,
    materialThickness,
    workingDepth,
    chamberHeight,
    rim,
    filterLayers: createFilterLayers(settings.filterCount, chamberHeight, dimensions.thickness, materialThickness),
    filterFingerHoleYs: createFilterFingerHoleYs(settings.filterCount, chamberHeight, dimensions.thickness, materialThickness),
  };
}

// The manual fan-chamber gap override for a two-filter sandwich (any fabrication
// style). Returns the user's inside-flange-to-inside-flange width when set, or
// undefined for Auto (the -1 sentinel) or any non-two-filter build.
export function twoFilterFanChamberOverride(settings: PurifierSettings): number | undefined {
  if (settings.filterCount !== 2) {
    return undefined;
  }
  const value = settings.cutting.fanChamberDepth;
  return value > 0 ? value : undefined;
}

// The one-side "Back" box (laser cut, single filter, Back fan grid on, no wall
// fans) takes its chamber depth from the user's Box depth instead of the fan
// diameter. Returns that depth, or undefined when the regular fan chamber applies.
export function oneSideBackFanBoxDepth(settings: PurifierSettings): number | undefined {
  if (settings.design.type !== "laser-cut" || settings.filterCount !== 1 || settings.design.backPlateFans === 0) {
    return undefined;
  }
  const banks = settings.fan.banks;
  const off = (bank: FanCountRequest): boolean => bank.type === "fixed" && bank.count === 0;
  if (!(off(banks.left) && off(banks.right) && off(banks.top) && off(banks.bottom))) {
    return undefined;
  }
  return settings.design.boxDepth;
}

export function clampRimForGeometry(requestedRim: number, filterWidth: number, workingDepth: number, chamberHeight: number): number {
  const maxRim = Math.max(
    minimumRim,
    Math.min(maximumRim, (filterWidth - minimumFrameOpening) / 2, (workingDepth - minimumFrameOpening) / 2, chamberHeight * 0.28),
  );
  return clamp(requestedRim, minimumRim, maxRim);
}

export function filterLayerY(index: number, filters: FilterCount, chamberHeight: number, filterHeight: number): number {
  if (filters === 1) {
    return -chamberHeight / 2 + filterHeight / 2;
  }
  return index === 0 ? -chamberHeight / 2 + filterHeight / 2 : chamberHeight / 2 - filterHeight / 2;
}

export function filterFrameFaceY(
  index: number,
  filters: FilterCount,
  chamberHeight: number,
  filterHeight: number,
  materialThickness: number,
  face: FilterFrameFace,
): number {
  const isLowerFilter = filters === 1 || index === 0;
  if (face === "outer") {
    return isLowerFilter
      ? -chamberHeight / 2 + materialThickness / 2
      : chamberHeight / 2 - materialThickness / 2;
  }
  return isLowerFilter
    ? -chamberHeight / 2 + filterHeight + materialThickness / 2
    : chamberHeight / 2 - filterHeight - materialThickness / 2;
}

export function fanCenterYForWall(
  filters: FilterCount,
  wallHeight: number,
  materialThickness: number,
  filterHeight: number,
  fanDiameter: number,
  handCut: boolean,
): number {
  if (filters === 2) {
    return wallHeight / 2;
  }
  // Single filter, hand cut: the filter rests directly against the fan frames (they
  // support it), so seat the fan with its frame edge flush at the filter's inner
  // face. All the deepened chamber's extra depth then sits BEHIND the fan (the
  // closed-back / panel side). Laser keeps its tight chamber centered.
  if (handCut) {
    return filterHeight + fanDiameter / 2;
  }
  return (wallHeight + materialThickness + filterHeight) / 2;
}

function createFilterLayers(
  filters: FilterCount,
  chamberHeight: number,
  filterHeight: number,
  materialThickness: number,
): FilterLayerGeometry[] {
  return Array.from({ length: filters }, (_, index) => {
    const mediaCenterY = filterLayerY(index, filters, chamberHeight, filterHeight);
    return {
      index,
      mediaCenterY,
      outerFrameY: filterFrameFaceY(index, filters, chamberHeight, filterHeight, materialThickness, "outer"),
      innerFrameY: filterFrameFaceY(index, filters, chamberHeight, filterHeight, materialThickness, "inner"),
      explodeDirectionY: mediaCenterY < 0 ? -1 : 1,
    };
  });
}

function createFilterFingerHoleYs(
  filters: FilterCount,
  chamberHeight: number,
  filterHeight: number,
  materialThickness: number,
): number[] {
  const holeYs = [filterHeight + materialThickness / 2];
  if (filters > 1) {
    holeYs.push(chamberHeight - filterHeight - materialThickness / 2);
  }
  return holeYs;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
