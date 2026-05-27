import type { Millimeters } from "@/domain/units";
import type { LayoutResult } from "@/fabrication/purifierLayout";

export type DonutFilterModel = {
  readonly fanSize: Millimeters;
  readonly fanScrewSpacing: Millimeters;
  readonly screwHoleDiameter: Millimeters;
  readonly wallThickness: Millimeters;
  readonly filter: DonutFilterBody;
  readonly adapter: DonutFanAdapter;
  readonly cap: DonutFilterCap;
  readonly fanGuard: DonutFanGuard;
};

export type DonutFilterBody = {
  readonly outerDiameter: Millimeters;
  readonly length: Millimeters;
  readonly holeDiameter: Millimeters;
};

export type DonutFanAdapter = {
  readonly flangeSize: Millimeters;
  readonly flangeThickness: Millimeters;
  readonly coneLength: Millimeters;
  readonly insertLength: Millimeters;
  readonly fanOpeningDiameter: Millimeters;
  readonly filterHoleDiameter: Millimeters;
  readonly wallThickness: Millimeters;
  readonly screwCenters: readonly DonutPoint[];
};

export type DonutFilterCap = {
  readonly enabled: boolean;
  readonly outerDiameter: Millimeters;
  readonly holeDiameter: Millimeters;
  readonly rim: Millimeters;
  readonly insertLength: Millimeters;
  readonly thickness: Millimeters;
};

export type DonutFanGuard = {
  readonly outerSize: Millimeters;
  readonly thickness: Millimeters;
  readonly ringWidth: Millimeters;
  readonly spokeWidth: Millimeters;
  readonly screwBossDiameter: Millimeters;
  readonly screwCenters: readonly DonutPoint[];
};

export type DonutPoint = {
  readonly x: Millimeters;
  readonly y: Millimeters;
};

export function createDonutFilterModel(layout: LayoutResult): DonutFilterModel {
  const fanSpec = layout.configuration.fan.spec;
  const wallThickness = layout.configuration.cutting.materialThickness;
  const filter: DonutFilterBody = {
    outerDiameter: layout.rawSettings.donutFilterOuterDiameter,
    length: layout.rawSettings.donutFilterLength,
    holeDiameter: layout.rawSettings.donutFilterHoleDiameter,
  };
  const coneLength = Math.max(6, Math.abs(fanSpec.diameter - filter.holeDiameter) / 1.5);
  const screwMargin = (fanSpec.diameter - fanSpec.screwSpacing) / 2;
  const screwCenters = [
    { x: screwMargin, y: screwMargin },
    { x: fanSpec.diameter - screwMargin, y: screwMargin },
    { x: fanSpec.diameter - screwMargin, y: fanSpec.diameter - screwMargin },
    { x: screwMargin, y: fanSpec.diameter - screwMargin },
  ];

  return {
    fanSize: fanSpec.diameter,
    fanScrewSpacing: fanSpec.screwSpacing,
    screwHoleDiameter: layout.configuration.cutting.screwHoleDiameter,
    wallThickness,
    filter,
    adapter: {
      flangeSize: fanSpec.diameter,
      flangeThickness: wallThickness,
      coneLength,
      insertLength: layout.rawSettings.donutAdapterInsertLength,
      fanOpeningDiameter: fanSpec.diameter,
      filterHoleDiameter: filter.holeDiameter,
      wallThickness,
      screwCenters,
    },
    cap: {
      enabled: layout.rawSettings.donutCapEnabled,
      outerDiameter: filter.holeDiameter + layout.rawSettings.donutCapRim * 2,
      holeDiameter: filter.holeDiameter,
      rim: layout.rawSettings.donutCapRim,
      insertLength: layout.rawSettings.donutAdapterInsertLength,
      thickness: wallThickness,
    },
    fanGuard: {
      outerSize: fanSpec.diameter,
      thickness: Math.max(1.6, wallThickness),
      ringWidth: Math.max(2.2, fanSpec.diameter * 0.018),
      spokeWidth: Math.max(2.4, fanSpec.diameter * 0.02),
      screwBossDiameter: Math.max(13, fanSpec.diameter * 0.12),
      screwCenters,
    },
  };
}

export function donutAdapterTotalHeight(model: DonutFilterModel): Millimeters {
  return model.adapter.coneLength + model.adapter.insertLength;
}

export function donutCapTotalHeight(model: DonutFilterModel): Millimeters {
  return model.cap.thickness + model.cap.insertLength;
}
