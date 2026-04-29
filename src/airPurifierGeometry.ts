import { filterSelectionDimensions, type FilterCount, type FilterDimensions, type PurifierSettings } from "./airPurifier";

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

export function createAirPurifierGeometry(settings: PurifierSettings): AirPurifierGeometry {
  const dimensions = filterSelectionDimensions(settings.filter);
  const materialThickness = settings.cutting.materialThickness;
  const fanDiameter = settings.fan.spec.diameter;
  const workingDepth = dimensions.depth - materialThickness;
  const chamberHeight =
    fanDiameter +
    2 +
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
): number {
  return filters === 2 ? wallHeight / 2 : (wallHeight + materialThickness + filterHeight) / 2;
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
