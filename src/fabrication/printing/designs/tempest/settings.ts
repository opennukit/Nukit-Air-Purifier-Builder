import { defaultTempestSettings } from "@/domain/designs/tempest/model";
import {
  defaultTempestCordPassThrough,
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
      wallRequests:
        design.arrangement === "four-side-filter-tower"
          ? defaultTempestSettings.fan.wallRequests
          : {
              front: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.top),
              back: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.bottom),
              left: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.left),
              right: tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.right),
            },
    },
    frame: {
      ...defaultTempestSettings.frame,
      wallThickness: configuration.cutting.materialThickness,
      rim: configuration.cutting.rim,
      filterFitClearance: design.filterFitClearance,
    },
    // The user picks the bore; the placement keeps the shipped default.
    cordPassThrough: {
      ...defaultTempestCordPassThrough,
      diameter: design.cordHoleDiameter,
    },
  };
}

function requireTempestDesign(configuration: PurifierSettings): Extract<PurifierSettings["design"], { readonly type: "tempest" }> {
  if (configuration.design.type !== "tempest") {
    throw new Error("requireTempestDesign: Expected Tempest print design");
  }
  return configuration.design;
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
