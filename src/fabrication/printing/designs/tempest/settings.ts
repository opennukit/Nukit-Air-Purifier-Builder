import { createTempestModel, defaultTempestSettings } from "@/domain/designs/tempest/model";
import {
  type TempestBoxExhaust,
  type TempestFanCountRequest,
  type TempestSettings,
} from "@/domain/designs/tempest/shared";
import { recommendedTowerFeetLengthMm } from "@/domain/purifier/cadr";
import type { PurifierSettings } from "@/domain/purifier/settingsModel";

// Sentinel: feetLength === -1 means "Auto" (resolve from the bottom fan/filter flow).
const AUTO_FEET_LENGTH = -1;
import type { FanCountRequest as PurifierFanCountRequest } from "@/domain/purifier/fans";
import type { FilterDimensions } from "@/domain/purifier/filter";
import type { LayoutResult } from "@/fabrication/purifierLayout";

export function createTempestSettingsFromLayout(layout: LayoutResult): TempestSettings {
  return createTempestSettingsFromConfiguration(layout.configuration);
}

export function createTempestSettingsFromConfiguration(configuration: PurifierSettings): TempestSettings {
  const settings = buildTempestSettings(configuration);
  if (
    settings.arrangement.type !== "four-side-filter-tower" ||
    settings.arrangement.feetLength !== AUTO_FEET_LENGTH
  ) {
    return settings;
  }
  // Auto feet: probe the model (feet at 0; footprint and fan grid are feet-
  // independent) to read the box footprint and bottom fan count, then size the
  // legs so the perimeter intake curtain does not choke the bottom flow.
  const probe = createTempestModel({
    ...settings,
    arrangement: { ...settings.arrangement, feetLength: 0 },
  });
  const feetLength =
    probe.fanLayout.topology === "quad" && probe.filterLayout.topology === "quad"
      ? recommendedTowerFeetLengthMm({
          boxWidthMm: probe.box.width,
          boxDepthMm: probe.box.depth,
          structuralOffsetMm: probe.filterLayout.structuralOffset,
          fanCount:
            probe.fanLayout.bottom.fanCount > 0
              ? probe.fanLayout.bottom.fanCount
              : probe.fanLayout.top.fanCount,
          fanFreeAirM3h: configuration.fan.freeAirM3h,
          active: probe.fanLayout.bottom.fanCount > 0 || probe.filterLayout.bottomFilter,
        })
      : 100;
  return { ...settings, arrangement: { ...settings.arrangement, feetLength } };
}

function buildTempestSettings(configuration: PurifierSettings): TempestSettings {
  const design = requireTempestDesign(configuration);
  // Hole depth and spacing keep their built-in defaults; only the pin diameter is
  // user-adjustable (0 disables the pins). Fall back to fixed values if the
  // default ever ships disabled.
  const defaultAlignmentPins =
    defaultTempestSettings.alignmentPins.type === "enabled"
      ? defaultTempestSettings.alignmentPins
      : { holeDepth: 10, spacing: 30 };
  return {
    ...defaultTempestSettings,
    // v3: chunk-label deboss is being reworked. The setting flows through again so
    // the (now visible) control toggles it; reworked placement puts one code per
    // seam on the interior face beside it with an up-arrow.
    chunkLabels: design.chunkLabels,
    // Alignment-pin hole size comes from the design setting: 0 disables the pins,
    // any positive diameter keeps the default hole depth and spacing.
    alignmentPins:
      design.alignmentPinDiameter > 0
        ? {
            type: "enabled",
            diameter: design.alignmentPinDiameter,
            holeDepth: defaultAlignmentPins.holeDepth,
            spacing: defaultAlignmentPins.spacing,
          }
        : { type: "disabled" },
    arrangement: tempestArrangementFromConfiguration(configuration),
    // The one-side "panel" depth applies only when this is a single-filter layout
    // with the Back fan grid on AND no side-wall fans (a flat panel). With any
    // wall fan engaged the fan diameter drives the height so those fans still fit.
    oneSidePanelDepth:
      design.arrangement === "single-horizontal-top-filter" && design.backPlateFans && !hasAnyWallFan(configuration)
        ? design.boxDepth
        : undefined,
    fan: {
      ...defaultTempestSettings.fan,
      diameter: configuration.fan.spec.diameter,
      screwHoleDiameter: configuration.cutting.screwHoleDiameter,
      opening: design.hexGrill
        ? { type: "honeycomb", hexFlatToFlat: design.hexSize, ribThickness: design.hexSpacing, fullCellsOnly: design.hexFullCellsOnly }
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
      // Tower bottom-panel fan grid (bottom bank), mirroring the top. Box/Exhaust
      // and the bottom filter force the bottom bank to 0 upstream
      // (normalizeRawSettings), so this is a live grid only on a plain-bottom tower.
      bottomFans:
        design.arrangement === "four-side-filter-tower"
          ? tempestFanCountRequestFromPurifierRequest(configuration.fan.banks.bottom)
          : undefined,
      // "Back" fan grid on the single-filter solid plate (opposite the filter).
      // -1 = automatic (fill the grid), 0 = none, N = that many fans.
      bottomPlateFans: design.backPlateFans < 0 ? { type: "automatic" } : { type: "fixed", count: design.backPlateFans },
      topExhaust: design.topExhaust,
      boxExhaust: resolveBoxExhaust(design),
    },
    frame: {
      ...defaultTempestSettings.frame,
      wallThickness: configuration.cutting.materialThickness,
      rim: configuration.cutting.rim,
      filterFitClearance: design.filterFitClearance,
      outsideFlangeThickness: design.outsideFlangeThickness,
    },
    filterSlot: {
      ...defaultTempestSettings.filterSlot,
      // Which wall the horizontal-layout filter slots open on (the tower loads
      // from the top plate regardless).
      wall: design.filterSlotWall,
    },
    cordPassThrough:
      // A 0 (or less) cord-hole diameter means "no cord".
      design.cordHoleWall === "none" || design.cordHoleDiameter <= 0
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

// A wall fan bank is "engaged" when it asks for automatic placement or a fixed
// count above zero; an explicit 0 is off. The one-side panel needs all four off.
function hasAnyWallFan(configuration: PurifierSettings): boolean {
  const banks = configuration.fan.banks;
  const engaged = (request: PurifierFanCountRequest): boolean =>
    request.type === "auto" || request.count > 0;
  return engaged(banks.left) || engaged(banks.right) || engaged(banks.top) || engaged(banks.bottom);
}

function requireTempestDesign(configuration: PurifierSettings): Extract<PurifierSettings["design"], { readonly type: "tempest" }> {
  if (configuration.design.type !== "tempest") {
    throw new Error("requireTempestDesign: Expected Tempest print design");
  }
  return configuration.design;
}

// The box/exhaust sizes are concrete diameters that the UI auto-populates from
// the filter width (fan hole 75%; ring radii 50% / 60% of the width) and that
// only change when the width changes. The fields hold diameters; the geometry
// needs radii, so the rings are halved. A non-positive value falls back to the
// width-derived default so the geometry never breaks.
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
      radius: ringRadius(design.boxRingOneDiameter, 0.5),
    },
    ringTwo: {
      screwHoles: design.boxRingTwoScrewHoles,
      screwDiameter: design.boxRingTwoScrewDiameter,
      radius: ringRadius(design.boxRingTwoDiameter, 0.6),
    },
  };
}

function tempestArrangementFromConfiguration(configuration: PurifierSettings): TempestSettings["arrangement"] {
  const design = requireTempestDesign(configuration);
  const filter = design.filter;
  if (design.arrangement === "four-side-filter-tower") {
    const uprightFace = uprightTowerFilterFace(filter);
    // The bottom filter is only offered for square filters (its footprint is the
    // filter face laid flat, so width and height must match).
    const bottomFilter = design.bottomFilter && isSquareTowerFace(uprightFace);
    return {
      type: "four-side-filter-tower",
      filter: {
        faceWidth: uprightFace.width,
        faceHeight: uprightFace.height,
        thickness: filter.thickness,
      },
      bottomFilter,
      // Feet are an independent four-side-tower control (the UI defaults them to
      // 100 mm when the bottom filter is switched on, 0 otherwise), so the foot
      // length flows straight through.
      feetLength: design.feetLength,
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

// A tower face is "square" (so the bottom filter footprint fits) when its width
// and height are within 1 mm of each other.
function isSquareTowerFace(face: { readonly width: number; readonly height: number }): boolean {
  return Math.abs(face.width - face.height) <= 1;
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
