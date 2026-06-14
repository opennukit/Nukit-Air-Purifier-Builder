import { defaultTempestSettings } from "@/domain/designs/tempest/model";
import {
  type TempestBoxExhaust,
  type TempestFanCountRequest,
  type TempestSettings,
} from "@/domain/designs/tempest/shared";
import type { PurifierSettings } from "@/domain/purifier/settingsModel";
import type { FanCountRequest as PurifierFanCountRequest } from "@/domain/purifier/fans";
import type { FilterDimensions } from "@/domain/purifier/filter";
import type { LayoutResult } from "@/fabrication/purifierLayout";

export function createTempestSettingsFromLayout(layout: LayoutResult): TempestSettings {
  return createTempestSettingsFromConfiguration(layout.configuration);
}

export function createTempestSettingsFromConfiguration(configuration: PurifierSettings): TempestSettings {
  const design = requireTempestDesign(configuration);
  return {
    ...defaultTempestSettings,
    arrangement: tempestArrangementFromConfiguration(configuration),
    fan: {
      ...defaultTempestSettings.fan,
      diameter: configuration.fan.spec.diameter,
      screwHoleDiameter: configuration.cutting.screwHoleDiameter,
      opening: design.hexGrill
        ? { type: "honeycomb", hexFlatToFlat: design.hexSize, ribThickness: design.hexSpacing }
        : { type: "plain" },
      wallRequests:
        design.arrangement === "four-side-filter-tower"
          ? defaultTempestSettings.fan.wallRequests
          : {
              // The preview renders the back wall (y=Y) at the visual top and the
              // front wall (y=0) at the visual bottom, so map the "Top" control to
              // the back wall and "Bottom" to the front wall to match what the user
              // sees.
              front: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.bottom),
              back: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.top),
              left: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.left),
              right: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.right),
            },
      topExhaust: design.topExhaust,
      boxExhaust: resolveBoxExhaust(design),
    },
    frame: {
      ...defaultTempestSettings.frame,
      wallThickness: configuration.cutting.materialThickness,
      rim: configuration.cutting.rim,
      filterFitClearance: design.filterFitClearance,
    },
    cordPassThrough:
      design.cordHoleWall === "none"
        ? { type: "none" }
        : {
            type: "wall",
            diameter: design.cordHoleDiameter,
            wall: design.cordHoleWall,
            side: design.cordHoleSide,
            cornerOffset: design.cordHoleCornerOffset,
          },
  };
}

function requireTempestDesign(configuration: PurifierSettings): Extract<PurifierSettings["design"], { readonly type: "tempest" }> {
  if (configuration.design.type !== "tempest") {
    throw new Error("requireTempestDesign: Expected Tempest print design");
  }
  return configuration.design;
}

// Expand the box/exhaust auto defaults: a 0 fan-hole size means ⅚ of the filter
// face width, and a 0 ring radius means 120% / 140% of the fan-hole radius —
// matching tempest-builder.html's derived defaults.
function resolveBoxExhaust(
  design: Extract<PurifierSettings["design"], { readonly type: "tempest" }>,
): TempestBoxExhaust {
  const faceWidth = Math.min(design.filter.width, design.filter.depth);
  const fanHoleSize = design.boxFanHoleSize > 0 ? design.boxFanHoleSize : (5 / 6) * faceWidth;
  const fanHoleRadius = fanHoleSize / 2;
  const ringRadius = (raw: number, factor: number) => (raw > 0 ? raw : factor * fanHoleRadius);
  return {
    fanHoleSize,
    ringOne: {
      screwHoles: design.boxRingOneScrewHoles,
      screwDiameter: design.boxRingOneScrewDiameter,
      radius: ringRadius(design.boxRingOneRadius, 1.2),
    },
    ringTwo: {
      screwHoles: design.boxRingTwoScrewHoles,
      screwDiameter: design.boxRingTwoScrewDiameter,
      radius: ringRadius(design.boxRingTwoRadius, 1.4),
    },
  };
}

function tempestArrangementFromConfiguration(configuration: PurifierSettings): TempestSettings["arrangement"] {
  const design = requireTempestDesign(configuration);
  const filter = design.filter;
  if (design.arrangement === "four-side-filter-tower") {
    const uprightFace = uprightTowerFilterFace(filter);
    return {
      type: "four-side-filter-tower",
      filter: {
        faceWidth: uprightFace.width,
        faceHeight: uprightFace.height,
        thickness: filter.thickness,
      },
    };
  }
  return {
    type: design.arrangement,
    filter: {
      footprintWidth: filter.width,
      footprintDepth: filter.depth,
      thickness: filter.thickness,
    },
  };
}

function uprightTowerFilterFace(filter: FilterDimensions): { readonly width: number; readonly height: number } {
  return {
    width: Math.min(filter.width, filter.depth),
    height: Math.max(filter.width, filter.depth),
  };
}

function tempestFanCountRequestFromPurifierRequest(request: PurifierFanCountRequest): TempestFanCountRequest {
  if (request.type === "auto") {
    return { type: "automatic" };
  }
  return {
    type: "fixed",
    count: request.count,
  };
}
