import { clampRimForGeometry } from "@/domain/purifier/geometry";
import { findFanSpec, type FanConfiguration } from "@/domain/purifier/fans";
import {
  findPrintDesignPreset,
  isDonutFilterAdapterPrintDesignPreset,
  isLaserCutDesignPreset,
  isTempestPrintDesignId,
  isTempestPrintDesignPreset,
  type DonutFilterSettings,
  type FilterCount,
  type PrintDesignId,
  type PrintDesignPreset,
} from "@/domain/purifier/designPresets";
import {
  cameraPresets,
  canonicalFilterSlotWall,
  canonicalTempestArrangement,
  canonicalTempestDesign,
  clamp,
  defaultSettings,
  donutCapRawRim,
  fanCountRequestFromRawSetting,
  fanCountRequestToRawSetting,
  findPreviewMaterialColorPreset,
  type ConfiguredPrintDesign,
  type CutSheetPreviewOptions,
  type CuttingSettings,
  type EnclosurePreviewOptions,
  type FilterFrameConstruction,
  type JointSettings,
  type PreviewSettings,
  type PurifierDesignDraft,
  type PurifierDraft,
  type PurifierInput,
  type PurifierSettings,
  type RawPurifierSettings,
} from "@/domain/purifier/settingsModel";
import type { Millimeters } from "@/domain/units";
import type { FilterDimensions } from "@/domain/purifier/filter";
import type { ReferenceScale } from "@/fabrication/laser/cutSettings";

// #######################################
// Settings Normalization
// #######################################

// ##############################
// Structured Settings
// ##############################

export function normalizeSettings(input: PurifierInput): PurifierSettings {
  const raw = isStructuredSettings(input)
    ? toRawSettings(input)
    : isPurifierDraft(input)
      ? serializePurifierDraft(input)
      : input;
  const printDesign = findPrintDesignPreset(raw.printDesign);
  const dimensions = normalizeFilterDimensions(rawFilterDimensions(raw));
  const materialThickness = clamp(raw.materialThickness, 1.5, 9);
  const fanSpec = findFanSpec(raw.fanDiameter);
  const filterCount = raw.filters === 1 ? 1 : 2;
  const workingDepth = dimensions.depth - materialThickness;
  const chamberHeight =
    fanSpec.diameter +
    2 +
    filterCount * (dimensions.thickness + materialThickness);
  const rim = clampRimForGeometry(
    raw.rim,
    dimensions.width,
    workingDepth,
    chamberHeight,
  );
  const filter = dimensions;
  const fan: FanConfiguration = {
    spec: fanSpec,
    color: raw.fanColor,
    banks: {
      left: fanCountRequestFromRawSetting(raw.fansLeft),
      right: fanCountRequestFromRawSetting(raw.fansRight),
      top: fanCountRequestFromRawSetting(raw.fansTop),
      bottom: fanCountRequestFromRawSetting(raw.fansBottom),
    },
  };
  const frameConstruction: FilterFrameConstruction = raw.splitFrames
    ? { type: "split-rails" }
    : { type: "full-panels" };
  const cutting: CuttingSettings = {
    materialThickness,
    rim,
    screwHoleDiameter: clamp(raw.screwHoleDiameter, 2, 10),
    kerfFit: clamp(raw.kerfFit, 0, 1),
    labels: raw.labels,
    referenceScale: referenceScaleFromNumber(raw.referenceScale),
    joints: normalizeJointSettings(raw),
    cordHole: {
      diameter: normalizeCordHoleDiameter(raw.cordHoleDiameter),
      wall: raw.cordHoleWall,
      side: raw.cordHoleSide,
      cornerOffset: normalizeCordHoleCornerOffset(raw.cordHoleCornerOffset),
    },
  };

  return {
    printDesign,
    design: createConfiguredPrintDesign({
      raw,
      printDesign,
      filter,
      filterCount,
      fan,
      frameConstruction,
    }),
    filter,
    filterCount,
    fan,
    frameConstruction,
    cutting,
    preview: createPreviewSettings(raw, cutting.referenceScale),
  };
}

// ##############################
// Raw Settings
// ##############################

export function normalizeRawSettings(
  input: RawPurifierSettings,
): RawPurifierSettings {
  const normalized = toRawSettings(normalizeSettings(input));
  const tempestArrangement = canonicalTempestArrangement(
    input.tempestArrangement,
  );
  const donutFilter = normalizeDonutFilterSettings(input);
  const donutCapRim = normalizeDonutCapRim(
    input,
    donutFilter.outerDiameter,
    donutFilter.holeDiameter,
  );
  return canonicalizePrintDesignRawSettings({
    ...normalized,
    tempestArrangement,
    tempestDesign: canonicalTempestDesign(input.tempestDesign),
    filterSlotWall: canonicalFilterSlotWall(input.filterSlotWall),
    // Preserved like tempestArrangement: the value survives even while a
    // non-tempest design is active, so switching back keeps the user's fit.
    filterFitClearance: normalizeFilterFitClearance(input.filterFitClearance),
    cordHoleDiameter: normalizeCordHoleDiameter(input.cordHoleDiameter),
    cordHoleWall: input.cordHoleWall,
    cordHoleSide: input.cordHoleSide,
    cordHoleCornerOffset: normalizeCordHoleCornerOffset(input.cordHoleCornerOffset),
    outsideFlangeThickness: normalizeOutsideFlangeThickness(input.outsideFlangeThickness),
    chunkLabels: input.chunkLabels,
    hexGrill: input.hexGrill,
    hexSize: normalizeHexSize(input.hexSize),
    hexSpacing: normalizeHexSpacing(input.hexSpacing),
    // Preserved like hexGrill: toRawSettings re-emits the default, so restore the
    // user's "Back" fan toggle from the raw input here.
    backPlateFans: normalizeBackFanCount(input.backPlateFans),
    boxDepth: normalizeBoxDepth(input.boxDepth),
    ...normalizeTempestExhaustFields(input),
    donutFilterOuterDiameter: donutFilter.outerDiameter,
    donutFilterLength: donutFilter.length,
    donutFilterHoleDiameter: donutFilter.holeDiameter,
    donutAdapterInsertLength: donutFilter.insertLength,
    donutCapRim,
    donutCapEnabled: donutFilter.cap.type === "printed-cap",
  });
}

// ##############################
// Draft Settings
// ##############################

export function normalizePurifierDraft(
  input: RawPurifierSettings | PurifierDraft,
): PurifierDraft {
  if (!isPurifierDraft(input)) {
    return createPurifierDraft(input);
  }
  return createPurifierDraft(serializePurifierDraft(input));
}

export function createPurifierDraft(
  input: RawPurifierSettings | PurifierDraft,
): PurifierDraft {
  if (isPurifierDraft(input)) {
    return input;
  }

  const raw = normalizeRawSettings(input);
  const configuration = normalizeSettings(raw);
  return {
    design: createPurifierDesignDraft(configuration),
    fan: {
      diameter: configuration.fan.spec.diameter,
      color: configuration.fan.color,
    },
    cutting: {
      materialThickness: configuration.cutting.materialThickness,
      rim: configuration.cutting.rim,
      screwHoleDiameter: configuration.cutting.screwHoleDiameter,
      kerfFit: configuration.cutting.kerfFit,
      joints: configuration.cutting.joints,
    },
    preview: configuration.preview,
  };
}

export function serializePurifierDraft(
  draft: PurifierDraft,
): RawPurifierSettings {
  const base: RawPurifierSettings = {
    ...defaultSettings,
    printDesign: printDesignIdForPurifierDraft(draft),
    fanColor: draft.fan.color,
    fanDiameter: draft.fan.diameter,
    rim: draft.cutting.rim,
    screwHoleDiameter: draft.cutting.screwHoleDiameter,
    materialThickness: draft.cutting.materialThickness,
    kerfFit: draft.cutting.kerfFit,
    fingerWidthMultiplier: draft.cutting.joints.finger.widthMultiplier,
    fingerSpaceMultiplier: draft.cutting.joints.finger.spaceMultiplier,
    fingerPlayMultiplier: draft.cutting.joints.finger.playMultiplier,
    fingerHoleWidthMultiplier: draft.cutting.joints.finger.holeWidthMultiplier,
    fingerHoleOffsetMultiplier:
      draft.cutting.joints.finger.holeOffsetMultiplier,
    dovetailSizeMultiplier: draft.cutting.joints.dovetail.sizeMultiplier,
    dovetailDepthMultiplier: draft.cutting.joints.dovetail.depthMultiplier,
    dovetailTaper: draft.cutting.joints.dovetail.taper,
    showFilterMedia: draft.preview.enclosure.showFilterMedia,
    showFans: draft.preview.enclosure.showFans,
    showFilterFrame: draft.preview.enclosure.showFilterFrame,
    explodedView: draft.preview.enclosure.explodedView,
    showDimensions: draft.preview.enclosure.showDimensions,
    showBananaScale: draft.preview.enclosure.showBananaScale,
    showPreviewEdges: draft.preview.enclosure.showPreviewEdges,
    previewMaterialColor: draft.preview.enclosure.materialColor,
    autoRotate: draft.preview.enclosure.autoRotate,
    cameraPreset: draft.preview.enclosure.cameraPreset,
    labels: draft.preview.cutSheet.showLabels,
    referenceScale:
      draft.preview.cutSheet.referenceScale.type === "enabled"
        ? draft.preview.cutSheet.referenceScale.length
        : 0,
  };

  if (draft.design.type === "laser-cut") {
    return normalizeRawSettings({
      ...base,
      ...serializedFilterFields(draft.design.filter),
      filters: draft.design.filterCount,
      splitFrames: draft.design.frameConstruction.type === "split-rails",
      fansLeft: fanCountRequestToRawSetting(draft.design.fanBanks.left),
      fansRight: fanCountRequestToRawSetting(draft.design.fanBanks.right),
      fansTop: fanCountRequestToRawSetting(draft.design.fanBanks.top),
      fansBottom: fanCountRequestToRawSetting(draft.design.fanBanks.bottom),
      cordHoleDiameter: draft.design.cordHoleDiameter,
      cordHoleWall: draft.design.cordHoleWall,
      cordHoleSide: draft.design.cordHoleSide,
      cordHoleCornerOffset: draft.design.cordHoleCornerOffset,
    });
  }

  if (draft.design.type === "donut-filter-adapter") {
    return normalizeRawSettings({
      ...base,
      filterWidth: draft.design.filter.outerDiameter,
      filterDepth: draft.design.filter.length,
      filterThickness: draft.design.filter.holeDiameter,
      filters: 1,
      splitFrames: draft.design.preset.implementation.defaults.splitFrames,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      donutFilterOuterDiameter: draft.design.filter.outerDiameter,
      donutFilterLength: draft.design.filter.length,
      donutFilterHoleDiameter: draft.design.filter.holeDiameter,
      donutAdapterInsertLength: draft.design.filter.insertLength,
      donutCapRim: donutCapRawRim(draft.design.filter.cap),
      donutCapEnabled: draft.design.filter.cap.type === "printed-cap",
    });
  }

  if (draft.design.type === "tempest") {
    return normalizeRawSettings({
      ...base,
      ...serializedFilterFields(draft.design.filter),
      tempestArrangement: draft.design.arrangement,
      tempestDesign: draft.design.design,
      filterSlotWall: draft.design.filterSlotWall,
      filterFitClearance: draft.design.filterFitClearance,
      cordHoleDiameter: draft.design.cordHoleDiameter,
      cordHoleWall: draft.design.cordHoleWall,
      cordHoleSide: draft.design.cordHoleSide,
      cordHoleCornerOffset: draft.design.cordHoleCornerOffset,
      outsideFlangeThickness: draft.design.outsideFlangeThickness,
      chunkLabels: draft.design.chunkLabels,
      hexGrill: draft.design.hexGrill,
      hexSize: draft.design.hexSize,
      hexSpacing: draft.design.hexSpacing,
      backPlateFans: draft.design.backPlateFans,
      boxDepth: draft.design.boxDepth,
      ...copyTempestExhaustFields(draft.design),
      filters:
        draft.design.arrangement === "single-horizontal-top-filter" ? 1 : 2,
      splitFrames: true,
      // Persisted per-wall banks (editable for 1-top / 2-sandwich); the tower
      // resets these to its own defaults on arrangement switch.
      fansLeft: fanCountRequestToRawSetting(draft.design.fanBanks.left),
      fansRight: fanCountRequestToRawSetting(draft.design.fanBanks.right),
      fansTop: fanCountRequestToRawSetting(draft.design.fanBanks.top),
      fansBottom: fanCountRequestToRawSetting(draft.design.fanBanks.bottom),
    });
  }

  return normalizeRawSettings({
    ...base,
    ...serializedFilterFields(draft.design.filter),
    filters: draft.design.filterCount,
    splitFrames: draft.design.preset.implementation.defaults.splitFrames,
    fansLeft: 0,
    fansRight: 0,
    fansTop: draft.design.fanCount,
    fansBottom: 0,
  });
}

export function printDesignIdForPurifierDraft(
  draft: PurifierDraft,
): PrintDesignId {
  return draft.design.printDesign;
}

// ##############################
// Raw Conversion
// ##############################

function toRawSettings(input: PurifierInput): RawPurifierSettings {
  if (isPurifierDraft(input)) {
    return serializePurifierDraft(input);
  }
  if (!isStructuredSettings(input)) {
    return input;
  }

  const base: RawPurifierSettings = {
    printDesign: input.printDesign.id,
    filterWidth: input.filter.width,
    filterDepth: input.filter.depth,
    filterThickness: input.filter.thickness,
    rim: input.cutting.rim,
    fanColor: input.fan.color,
    fanDiameter: input.fan.spec.diameter,
    filters: input.filterCount,
    splitFrames: input.frameConstruction.type === "split-rails",
    fansLeft: fanCountRequestToRawSetting(input.fan.banks.left),
    fansRight: fanCountRequestToRawSetting(input.fan.banks.right),
    fansTop: fanCountRequestToRawSetting(input.fan.banks.top),
    fansBottom: fanCountRequestToRawSetting(input.fan.banks.bottom),
    tempestArrangement: defaultSettings.tempestArrangement,
    tempestDesign: defaultSettings.tempestDesign,
    filterSlotWall: defaultSettings.filterSlotWall,
    filterFitClearance: defaultSettings.filterFitClearance,
    cordHoleDiameter: input.cutting.cordHole.diameter,
    cordHoleWall: input.cutting.cordHole.wall,
    cordHoleSide: input.cutting.cordHole.side,
    cordHoleCornerOffset: input.cutting.cordHole.cornerOffset,
    outsideFlangeThickness: defaultSettings.outsideFlangeThickness,
    chunkLabels: defaultSettings.chunkLabels,
    hexGrill: defaultSettings.hexGrill,
    hexSize: defaultSettings.hexSize,
    hexSpacing: defaultSettings.hexSpacing,
    backPlateFans: defaultSettings.backPlateFans,
    boxDepth: defaultSettings.boxDepth,
    ...copyTempestExhaustFields(defaultSettings),
    donutFilterOuterDiameter: defaultSettings.donutFilterOuterDiameter,
    donutFilterLength: defaultSettings.donutFilterLength,
    donutFilterHoleDiameter: defaultSettings.donutFilterHoleDiameter,
    donutAdapterInsertLength: defaultSettings.donutAdapterInsertLength,
    donutCapRim: defaultSettings.donutCapRim,
    donutCapEnabled: defaultSettings.donutCapEnabled,
    screwHoleDiameter: input.cutting.screwHoleDiameter,
    materialThickness: input.cutting.materialThickness,
    kerfFit: input.cutting.kerfFit,
    fingerWidthMultiplier: input.cutting.joints.finger.widthMultiplier,
    fingerSpaceMultiplier: input.cutting.joints.finger.spaceMultiplier,
    fingerPlayMultiplier: input.cutting.joints.finger.playMultiplier,
    fingerHoleWidthMultiplier: input.cutting.joints.finger.holeWidthMultiplier,
    fingerHoleOffsetMultiplier:
      input.cutting.joints.finger.holeOffsetMultiplier,
    dovetailSizeMultiplier: input.cutting.joints.dovetail.sizeMultiplier,
    dovetailDepthMultiplier: input.cutting.joints.dovetail.depthMultiplier,
    dovetailTaper: input.cutting.joints.dovetail.taper,
    showFilterMedia: input.preview.enclosure.showFilterMedia,
    showFans: input.preview.enclosure.showFans,
    showFilterFrame: input.preview.enclosure.showFilterFrame,
    explodedView: input.preview.enclosure.explodedView,
    showDimensions: input.preview.enclosure.showDimensions,
    showBananaScale: input.preview.enclosure.showBananaScale,
    showPreviewEdges: input.preview.enclosure.showPreviewEdges,
    previewMaterialColor: input.preview.enclosure.materialColor,
    autoRotate: input.preview.enclosure.autoRotate,
    cameraPreset: input.preview.enclosure.cameraPreset,
    labels: input.preview.cutSheet.showLabels,
    referenceScale:
      input.preview.cutSheet.referenceScale.type === "enabled"
        ? input.preview.cutSheet.referenceScale.length
        : 0,
  };

  if (input.design.type === "laser-cut") {
    return {
      ...base,
      filters: input.design.filterCount,
      splitFrames: input.design.frameConstruction.type === "split-rails",
      fansLeft: fanCountRequestToRawSetting(input.design.fanBanks.left),
      fansRight: fanCountRequestToRawSetting(input.design.fanBanks.right),
      fansTop: fanCountRequestToRawSetting(input.design.fanBanks.top),
      fansBottom: fanCountRequestToRawSetting(input.design.fanBanks.bottom),
      cordHoleDiameter: input.design.cordHoleDiameter,
      cordHoleWall: input.design.cordHoleWall,
      cordHoleSide: input.design.cordHoleSide,
      cordHoleCornerOffset: input.design.cordHoleCornerOffset,
    };
  }

  if (input.design.type === "donut-filter-adapter") {
    return {
      ...base,
      filterWidth: input.design.filter.outerDiameter,
      filterDepth: input.design.filter.length,
      filterThickness: input.design.filter.holeDiameter,
      filters: 1,
      splitFrames: input.design.preset.implementation.defaults.splitFrames,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      donutFilterOuterDiameter: input.design.filter.outerDiameter,
      donutFilterLength: input.design.filter.length,
      donutFilterHoleDiameter: input.design.filter.holeDiameter,
      donutAdapterInsertLength: input.design.filter.insertLength,
      donutCapRim: donutCapRawRim(input.design.filter.cap),
      donutCapEnabled: input.design.filter.cap.type === "printed-cap",
    };
  }

  if (input.design.type === "tempest") {
    return {
      ...base,
      ...serializedFilterFields(input.design.filter),
      tempestArrangement: input.design.arrangement,
      tempestDesign: input.design.design,
      filterSlotWall: input.design.filterSlotWall,
      filterFitClearance: input.design.filterFitClearance,
      cordHoleDiameter: input.design.cordHoleDiameter,
      cordHoleWall: input.design.cordHoleWall,
      cordHoleSide: input.design.cordHoleSide,
      cordHoleCornerOffset: input.design.cordHoleCornerOffset,
      outsideFlangeThickness: input.design.outsideFlangeThickness,
      chunkLabels: input.design.chunkLabels,
      hexGrill: input.design.hexGrill,
      hexSize: input.design.hexSize,
      hexSpacing: input.design.hexSpacing,
      ...copyTempestExhaustFields(input.design),
      filters:
        input.design.arrangement === "single-horizontal-top-filter" ? 1 : 2,
      splitFrames: true,
      // Editable per-wall banks flow from the base (input.fan.banks).
      fansLeft: fanCountRequestToRawSetting(input.fan.banks.left),
      fansRight: fanCountRequestToRawSetting(input.fan.banks.right),
      fansTop: fanCountRequestToRawSetting(input.fan.banks.top),
      fansBottom: fanCountRequestToRawSetting(input.fan.banks.bottom),
    };
  }

  return {
    ...base,
    filters: input.design.filterCount,
    splitFrames: input.design.preset.implementation.defaults.splitFrames,
    fansLeft: 0,
    fansRight: 0,
    fansTop: input.design.fanCount,
    fansBottom: 0,
  };
}

// #######################################
// Settings Helpers
// #######################################

// ##############################
// Design Construction
// ##############################

function createConfiguredPrintDesign(input: {
  readonly raw: RawPurifierSettings;
  readonly printDesign: PrintDesignPreset;
  readonly filter: FilterDimensions;
  readonly filterCount: FilterCount;
  readonly fan: FanConfiguration;
  readonly frameConstruction: FilterFrameConstruction;
}): ConfiguredPrintDesign {
  const { printDesign } = input;
  if (isLaserCutDesignPreset(printDesign)) {
    return {
      type: "laser-cut",
      preset: printDesign,
      filter: input.filter,
      filterCount: input.filterCount,
      fanBanks: input.fan.banks,
      frameConstruction: input.frameConstruction,
      cordHoleDiameter: normalizeCordHoleDiameter(input.raw.cordHoleDiameter),
      cordHoleWall: input.raw.cordHoleWall,
      cordHoleSide: input.raw.cordHoleSide,
      cordHoleCornerOffset: normalizeCordHoleCornerOffset(input.raw.cordHoleCornerOffset),
    };
  }

  if (isDonutFilterAdapterPrintDesignPreset(printDesign)) {
    return {
      type: "donut-filter-adapter",
      preset: printDesign,
      filter: normalizeDonutFilterSettings(input.raw),
      fan: {
        spec: input.fan.spec,
        color: input.fan.color,
        count: printDesign.implementation.defaults.fanCount,
      },
    };
  }

  if (isTempestPrintDesignPreset(printDesign)) {
    return {
      type: "tempest",
      preset: printDesign,
      arrangement: canonicalTempestArrangement(input.raw.tempestArrangement),
      design: canonicalTempestDesign(input.raw.tempestDesign),
      filterSlotWall: canonicalFilterSlotWall(input.raw.filterSlotWall),
      filter: input.filter,
      filterFitClearance: normalizeFilterFitClearance(input.raw.filterFitClearance),
      cordHoleDiameter: normalizeCordHoleDiameter(input.raw.cordHoleDiameter),
      cordHoleWall: input.raw.cordHoleWall,
      cordHoleSide: input.raw.cordHoleSide,
      cordHoleCornerOffset: normalizeCordHoleCornerOffset(input.raw.cordHoleCornerOffset),
      outsideFlangeThickness: normalizeOutsideFlangeThickness(input.raw.outsideFlangeThickness),
      chunkLabels: input.raw.chunkLabels,
      hexGrill: input.raw.hexGrill,
      hexSize: normalizeHexSize(input.raw.hexSize),
      hexSpacing: normalizeHexSpacing(input.raw.hexSpacing),
      backPlateFans: normalizeBackFanCount(input.raw.backPlateFans),
      boxDepth: normalizeBoxDepth(input.raw.boxDepth),
      ...normalizeTempestExhaustFields(input.raw),
    };
  }

  return {
    type: "static-reference",
    preset: printDesign,
    reference: printDesign.implementation.reference,
    capabilities: printDesign.implementation.reference.capabilities,
    filter: input.filter,
    filterCount: printDesign.implementation.defaults.filterCount,
    fanCount: printDesign.implementation.defaults.fanCount,
  };
}

// ##############################
// Preview Construction
// ##############################

function createPreviewSettings(
  raw: RawPurifierSettings,
  referenceScale: ReferenceScale,
): PreviewSettings {
  const cameraPreset = cameraPresets.includes(raw.cameraPreset)
    ? raw.cameraPreset
    : defaultSettings.cameraPreset;
  const enclosure: EnclosurePreviewOptions = {
    showFilterMedia: raw.showFilterMedia,
    showFans: raw.showFans,
    showFilterFrame: raw.showFilterFrame,
    explodedView: raw.explodedView,
    showDimensions: raw.showDimensions,
    showBananaScale: raw.showBananaScale,
    showPreviewEdges: raw.showPreviewEdges,
    materialColor: findPreviewMaterialColorPreset(raw.previewMaterialColor).id,
    autoRotate: raw.autoRotate,
    cameraPreset,
  };
  const cutSheet: CutSheetPreviewOptions = {
    showLabels: raw.labels,
    referenceScale,
  };

  return {
    enclosure,
    cutSheet,
  };
}

// ##############################
// Normalization Helpers
// ##############################

function isStructuredSettings(input: PurifierInput): input is PurifierSettings {
  return "filter" in input && "fan" in input && "cutting" in input;
}

export function isPurifierDraft(
  input: PurifierInput | RawPurifierSettings | PurifierDraft,
): input is PurifierDraft {
  return "fan" in input && "diameter" in input.fan;
}

function createPurifierDesignDraft(
  configuration: PurifierSettings,
): PurifierDesignDraft {
  if (configuration.design.type === "laser-cut") {
    return {
      type: "laser-cut",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      filter: configuration.design.filter,
      filterCount: configuration.design.filterCount,
      fanBanks: configuration.design.fanBanks,
      frameConstruction: configuration.design.frameConstruction,
      cordHoleDiameter: configuration.design.cordHoleDiameter,
      cordHoleWall: configuration.design.cordHoleWall,
      cordHoleSide: configuration.design.cordHoleSide,
      cordHoleCornerOffset: configuration.design.cordHoleCornerOffset,
    };
  }

  if (configuration.design.type === "donut-filter-adapter") {
    return {
      type: "donut-filter-adapter",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      filter: configuration.design.filter,
      fanCount: configuration.design.fan.count,
    };
  }

  if (configuration.design.type === "tempest") {
    return {
      type: "tempest",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      arrangement: configuration.design.arrangement,
      design: configuration.design.design,
      filterSlotWall: configuration.design.filterSlotWall,
      filter: configuration.design.filter,
      fanBanks: configuration.fan.banks,
      filterFitClearance: configuration.design.filterFitClearance,
      cordHoleDiameter: configuration.design.cordHoleDiameter,
      cordHoleWall: configuration.design.cordHoleWall,
      cordHoleSide: configuration.design.cordHoleSide,
      cordHoleCornerOffset: configuration.design.cordHoleCornerOffset,
      outsideFlangeThickness: configuration.design.outsideFlangeThickness,
      chunkLabels: configuration.design.chunkLabels,
      hexGrill: configuration.design.hexGrill,
      hexSize: configuration.design.hexSize,
      hexSpacing: configuration.design.hexSpacing,
      backPlateFans: configuration.design.backPlateFans,
      boxDepth: configuration.design.boxDepth,
      ...copyTempestExhaustFields(configuration.design),
    };
  }

  return {
    type: "static-reference",
    printDesign: configuration.design.preset.id,
    preset: configuration.design.preset,
    reference: configuration.design.reference,
    capabilities: configuration.design.capabilities,
    filter: configuration.design.filter,
    filterCount: configuration.design.filterCount,
    fanCount: configuration.design.fanCount,
  };
}

function serializedFilterFields(
  filter: FilterDimensions,
): Pick<RawPurifierSettings, "filterWidth" | "filterDepth" | "filterThickness"> {
  return {
    filterWidth: filter.width,
    filterDepth: filter.depth,
    filterThickness: filter.thickness,
  };
}

function rawFilterDimensions(settings: RawPurifierSettings): FilterDimensions {
  return {
    width: settings.filterWidth,
    depth: settings.filterDepth,
    thickness: settings.filterThickness,
  };
}

function normalizeFilterDimensions(
  dimensions: FilterDimensions,
): FilterDimensions {
  return {
    width: clamp(dimensions.width, 120, 900),
    depth: clamp(dimensions.depth, 120, 900),
    thickness: clamp(dimensions.thickness, 10, 300),
  };
}

function normalizeDonutFilterSettings(
  settings: RawPurifierSettings,
): DonutFilterSettings {
  const outerDiameter = clamp(settings.donutFilterOuterDiameter, 70, 420);
  const length = clamp(settings.donutFilterLength, 35, 520);
  const holeDiameter = clamp(
    settings.donutFilterHoleDiameter,
    18,
    Math.max(20, outerDiameter - 8),
  );
  const capRim = normalizeDonutCapRim(settings, outerDiameter, holeDiameter);
  return {
    outerDiameter,
    length,
    holeDiameter,
    insertLength: clamp(
      settings.donutAdapterInsertLength,
      2,
      Math.min(60, length),
    ),
    cap: settings.donutCapEnabled
      ? {
          type: "printed-cap",
          rim: capRim,
        }
      : { type: "none" },
  };
}

function normalizeDonutCapRim(
  settings: RawPurifierSettings,
  outerDiameter: Millimeters,
  holeDiameter: Millimeters,
): Millimeters {
  return clamp(
    settings.donutCapRim,
    0,
    Math.max(0, (outerDiameter - holeDiameter) / 2),
  );
}

function normalizeFilterFitClearance(value: Millimeters): Millimeters {
  return clamp(value, 0, 5);
}

function normalizeCordHoleDiameter(value: Millimeters): Millimeters {
  // 0 (or less) means "no cord"; any real hole clamps to a printable 3–25 mm.
  return value <= 0 ? 0 : clamp(value, 3, 25);
}

function normalizeCordHoleCornerOffset(value: Millimeters): Millimeters {
  return clamp(value, 0, 200);
}

function normalizeOutsideFlangeThickness(value: Millimeters): Millimeters {
  return clamp(value, 1, 50);
}

type TempestExhaustFields = Pick<
  RawPurifierSettings,
  | "topExhaust"
  | "boxFanHoleSize"
  | "boxRingOneScrewHoles"
  | "boxRingOneScrewDiameter"
  | "boxRingOneDiameter"
  | "boxRingTwoScrewHoles"
  | "boxRingTwoScrewDiameter"
  | "boxRingTwoDiameter"
>;

function copyTempestExhaustFields(source: TempestExhaustFields): TempestExhaustFields {
  return {
    topExhaust: source.topExhaust,
    boxFanHoleSize: source.boxFanHoleSize,
    boxRingOneScrewHoles: source.boxRingOneScrewHoles,
    boxRingOneScrewDiameter: source.boxRingOneScrewDiameter,
    boxRingOneDiameter: source.boxRingOneDiameter,
    boxRingTwoScrewHoles: source.boxRingTwoScrewHoles,
    boxRingTwoScrewDiameter: source.boxRingTwoScrewDiameter,
    boxRingTwoDiameter: source.boxRingTwoDiameter,
  };
}

function normalizeTempestExhaustFields(source: TempestExhaustFields): TempestExhaustFields {
  return {
    topExhaust: source.topExhaust,
    boxFanHoleSize: clamp(source.boxFanHoleSize, 0, 500),
    boxRingOneScrewHoles: Math.max(0, Math.round(source.boxRingOneScrewHoles)),
    boxRingOneScrewDiameter: clamp(source.boxRingOneScrewDiameter, 0, 50),
    boxRingOneDiameter: clamp(source.boxRingOneDiameter, 0, 1000),
    boxRingTwoScrewHoles: Math.max(0, Math.round(source.boxRingTwoScrewHoles)),
    boxRingTwoScrewDiameter: clamp(source.boxRingTwoScrewDiameter, 0, 50),
    boxRingTwoDiameter: clamp(source.boxRingTwoDiameter, 0, 1000),
  };
}

function normalizeHexSize(value: Millimeters): Millimeters {
  return clamp(value, 1, 50);
}

function normalizeHexSpacing(value: Millimeters): Millimeters {
  return clamp(value, 0.1, 20);
}

function normalizeBoxDepth(value: Millimeters): Millimeters {
  return Number.isFinite(value) && value > 0 ? clamp(value, 1, 1000) : defaultSettings.boxDepth;
}

// The "Back" fan count: -1 = automatic, 0 = none, N = that many. Any other value
// snaps to the nearest valid integer (negatives collapse to automatic).
function normalizeBackFanCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const truncated = Math.trunc(value);
  return truncated < 0 ? -1 : truncated;
}

function normalizeJointSettings(settings: RawPurifierSettings): JointSettings {
  return {
    finger: {
      widthMultiplier: clamp(settings.fingerWidthMultiplier, 0.5, 8),
      spaceMultiplier: clamp(settings.fingerSpaceMultiplier, 0.5, 8),
      playMultiplier: clamp(settings.fingerPlayMultiplier, 0, 1),
      holeWidthMultiplier: clamp(settings.fingerHoleWidthMultiplier, 0.5, 2),
      holeOffsetMultiplier: clamp(settings.fingerHoleOffsetMultiplier, 0.75, 4),
    },
    dovetail: {
      sizeMultiplier: clamp(settings.dovetailSizeMultiplier, 0.75, 8),
      depthMultiplier: clamp(settings.dovetailDepthMultiplier, 0.5, 2),
      taper: clamp(settings.dovetailTaper, 0, 80),
    },
  };
}

// #######################################
// Print Design Canonicalization
// #######################################

function canonicalizePrintDesignRawSettings(
  settings: RawPurifierSettings,
): RawPurifierSettings {
  if (!isTempestPrintDesignId(settings.printDesign)) {
    return settings;
  }
  const arrangement = canonicalTempestArrangement(settings.tempestArrangement);
  // The tower has no side-wall fans (those faces are filters), so left/right/
  // bottom are always 0; "top" is kept so the top-panel fan grid can be toggled
  // on/off. The 1-top and 2-filter sandwich modes keep all of the user's
  // per-wall fan counts. A true arrangement switch resets them explicitly via
  // applyTempestArrangementDefaults in the UI / URL defaults.
  if (arrangement === "four-side-filter-tower") {
    return {
      ...settings,
      tempestArrangement: arrangement,
      filters: 2,
      fansLeft: 0,
      fansRight: 0,
      fansBottom: 0,
    };
  }
  return {
    ...settings,
    tempestArrangement: arrangement,
    filters: arrangement === "single-horizontal-top-filter" ? 1 : 2,
  };
}

// ##############################
// Shared Type Guards and Converters
// ##############################

function referenceScaleFromNumber(value: number): ReferenceScale {
  const length = clamp(value, 0, 300);
  return length > 0 ? { type: "enabled", length } : { type: "disabled" };
}
