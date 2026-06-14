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
      // Tower top-panel fan grid toggle (top bank: automatic = grid on, 0 = off).
      topFans: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.top),
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

// The box/exhaust sizes are concrete diameters that the UI auto-populates from
// the filter width (fan hole 75%, ring 1 70%, ring 2 80%) and that only change
// when the width changes. The fields hold diameters; the geometry needs radii,
// so the rings are halved. A non-positive value falls back to the width-derived
// default so the geometry never breaks.
function resolveBoxExhaust(
  design: Extract<PurifierSettings["design"], { readonly type: "tempest" }>,
): TempestBoxExhaust {
  const width = design.filter.width;
  const fanHoleSize = design.boxFanHoleSize > 0 ? design.boxFanHoleSize : 0.75 * width;
  const ringRadius = (diameter: number, widthFraction: number) =>
    diameter > 0 ? diameter / 2 : widthFraction * width;
  return {
    fanHoleSize,
    ringOne: {
      screwHoles: design.boxRingOneScrewHoles,
      screwDiameter: design.boxRingOneScrewDiameter,
      radius: ringRadius(design.boxRingOneDiameter, 0.35),
    },
    ringTwo: {
      screwHoles: design.boxRingTwoScrewHoles,
      screwDiameter: design.boxRingTwoScrewDiameter,
      radius: ringRadius(design.boxRingTwoDiameter, 0.4),
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

// Each tower wall is one filter standing upright: its measured width runs
// horizontally (so it sets the square footprint) and its measured length runs
// vertically (so it sets the tower height). The orientation follows the entered
// dimensions — a wide filter makes a wide, squat box; a long one makes a tall
// box — rather than always standing the filter on its short edge.
function uprightTowerFilterFace(filter: FilterDimensions): { readonly width: number; readonly height: number } {
  return {
    width: filter.width,
    height: filter.depth,
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
