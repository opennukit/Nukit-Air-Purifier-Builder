import { clampRimForGeometry } from "@/domain/purifier/geometry";
import {
  createFanProductSelection,
  customFanProductPresetId,
  fanDiameters,
  fanProductPresetIds,
  findFanProductPreset,
  findFanSpec,
  type FanConfiguration,
  type FanDiameter,
  type FanProductPresetId,
} from "@/domain/purifier/fanProducts";
import {
  customDonutFilterPresetId,
  donutFilterPresetIds,
  findDonutFilterPreset,
  findPrintDesignPreset,
  isDonutFilterAdapterPrintDesignPreset,
  isLaserDerivedPrintDesignPreset,
  isTempestPrintDesignId,
  isTempestPrintDesignPreset,
  printDesignIds,
  type DonutFilterPresetId,
  type DonutFilterSettings,
  type FilterCount,
  type PrintDesignId,
  type PrintDesignPreset,
  type TempestArrangementPreset,
} from "@/domain/purifier/designPresets";
import {
  applyDonutFilterPreset,
  applyPrintDesignPreset,
  applyTempestArrangement,
  applyTempestArrangementDefaults,
  cameraPresets,
  canonicalTempestArrangement,
  clamp,
  defaultSettings,
  donutCapRawRim,
  fanCountRequestFromRawSetting,
  fanCountRequestToRawSetting,
  findPreviewMaterialColorPreset,
  tempestRawFanBanksForArrangement,
  type CameraPreset,
  type ConfiguredPrintDesign,
  type CutSheetPreviewOptions,
  type CuttingSettings,
  type EnclosurePreviewOptions,
  type FilterFrameConstruction,
  type JointSettings,
  type PreviewMaterialColorId,
  type PreviewSettings,
  type PurifierDesignDraft,
  type PurifierDraft,
  type PurifierInput,
  type PurifierSettings,
  type RawPurifierSettings,
} from "@/domain/purifier/settingsModel";
import {
  createPurifierSettingsFieldsSchema,
  type ParsedPurifierSettingsFields,
  type PurifierSettingsFieldInputs,
} from "@/domain/purifier/settingsSchema";
import type { Millimeters } from "@/domain/units";
import {
  customFilterPresetId,
  filterPresetIds,
  filterSelectionDimensions,
  findFilterPreset,
  findPresetFilter,
  isPresetFilterId,
  type FilterDimensions,
  type FilterPresetId,
  type FilterSelection,
} from "@/domain/purifier/filter";
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
  const preset = findFilterPreset(raw.filterPreset);
  const dimensions = normalizeFilterDimensions(
    preset.id === customFilterPresetId
      ? rawFilterDimensions(raw)
      : preset.dimensions,
  );
  const materialThickness = clamp(raw.materialThickness, 1.5, 9);
  const fanProductPreset = findFanProductPreset(raw.fanPreset);
  const fanDiameter =
    fanProductPreset.id === customFanProductPresetId
      ? raw.fanDiameter
      : fanProductPreset.diameter;
  const fanSpec = findFanSpec(fanDiameter);
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
  const filter = createFilterSelection(preset.id, dimensions);
  const fan: FanConfiguration = {
    spec: fanSpec,
    productSelection: createFanProductSelection(fanProductPreset.id),
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
  const donutFilterPreset = findDonutFilterPreset(input.donutFilterPreset);
  return canonicalizePrintDesignRawSettings({
    ...normalized,
    tempestArrangement,
    donutFilterPreset: donutFilterPreset.id,
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
    design: createPurifierDesignDraft(configuration, raw),
    fan: {
      presetId: findFanProductPreset(raw.fanPreset).id,
      diameter: configuration.fan.spec.diameter,
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
    fanPreset: draft.fan.presetId,
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
    showPrintSeams: draft.preview.enclosure.showPrintSeams,
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

  if (draft.design.type === "laser-derived-printable-kit") {
    return normalizeRawSettings({
      ...base,
      ...serializedFilterFields(draft.design.filter),
      filters: draft.design.filterCount,
      splitFrames: draft.design.frameConstruction.type === "split-rails",
      fansLeft: fanCountRequestToRawSetting(draft.design.fanBanks.left),
      fansRight: fanCountRequestToRawSetting(draft.design.fanBanks.right),
      fansTop: fanCountRequestToRawSetting(draft.design.fanBanks.top),
      fansBottom: fanCountRequestToRawSetting(draft.design.fanBanks.bottom),
    });
  }

  if (draft.design.type === "donut-filter-adapter") {
    return normalizeRawSettings({
      ...base,
      filterPreset: customFilterPresetId,
      filterWidth: draft.design.filter.outerDiameter,
      filterDepth: draft.design.filter.length,
      filterThickness: draft.design.filter.holeDiameter,
      filters: 1,
      splitFrames: draft.design.preset.implementation.defaults.splitFrames,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      donutFilterPreset: draft.design.donutFilterPreset,
      donutFilterOuterDiameter: draft.design.filter.outerDiameter,
      donutFilterLength: draft.design.filter.length,
      donutFilterHoleDiameter: draft.design.filter.holeDiameter,
      donutAdapterInsertLength: draft.design.filter.insertLength,
      donutCapRim: donutCapRawRim(draft.design.filter.cap),
      donutCapEnabled: draft.design.filter.cap.type === "printed-cap",
    });
  }

  if (draft.design.type === "tempest") {
    const fanBanks = tempestRawFanBanksForArrangement(draft.design.arrangement);
    return normalizeRawSettings({
      ...base,
      ...serializedFilterFields(draft.design.filter),
      tempestArrangement: draft.design.arrangement,
      filters:
        draft.design.arrangement === "single-horizontal-top-filter" ? 1 : 2,
      splitFrames: true,
      fansLeft: fanBanks.left,
      fansRight: fanBanks.right,
      fansTop: fanBanks.top,
      fansBottom: fanBanks.bottom,
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

  const filterDimensions = filterSelectionDimensions(input.filter);
  const base: RawPurifierSettings = {
    printDesign: input.printDesign.id,
    filterPreset:
      input.filter.type === "preset"
        ? input.filter.presetId
        : customFilterPresetId,
    filterWidth: filterDimensions.width,
    filterDepth: filterDimensions.depth,
    filterThickness: filterDimensions.thickness,
    rim: input.cutting.rim,
    fanPreset:
      input.fan.productSelection.type === "preset"
        ? input.fan.productSelection.presetId
        : customFanProductPresetId,
    fanDiameter: input.fan.spec.diameter,
    filters: input.filterCount,
    splitFrames: input.frameConstruction.type === "split-rails",
    fansLeft: fanCountRequestToRawSetting(input.fan.banks.left),
    fansRight: fanCountRequestToRawSetting(input.fan.banks.right),
    fansTop: fanCountRequestToRawSetting(input.fan.banks.top),
    fansBottom: fanCountRequestToRawSetting(input.fan.banks.bottom),
    tempestArrangement: defaultSettings.tempestArrangement,
    donutFilterPreset: defaultSettings.donutFilterPreset,
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
    showPrintSeams: input.preview.enclosure.showPrintSeams,
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

  if (input.design.type === "laser-derived-printable-kit") {
    return {
      ...base,
      filters: input.design.filterCount,
      splitFrames: input.design.frameConstruction.type === "split-rails",
      fansLeft: fanCountRequestToRawSetting(input.design.fanBanks.left),
      fansRight: fanCountRequestToRawSetting(input.design.fanBanks.right),
      fansTop: fanCountRequestToRawSetting(input.design.fanBanks.top),
      fansBottom: fanCountRequestToRawSetting(input.design.fanBanks.bottom),
    };
  }

  if (input.design.type === "donut-filter-adapter") {
    return {
      ...base,
      filterPreset: customFilterPresetId,
      filterWidth: input.design.filter.outerDiameter,
      filterDepth: input.design.filter.length,
      filterThickness: input.design.filter.holeDiameter,
      filters: 1,
      splitFrames: input.design.preset.implementation.defaults.splitFrames,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
      donutFilterPreset: input.design.donutFilterPreset,
      donutFilterOuterDiameter: input.design.filter.outerDiameter,
      donutFilterLength: input.design.filter.length,
      donutFilterHoleDiameter: input.design.filter.holeDiameter,
      donutAdapterInsertLength: input.design.filter.insertLength,
      donutCapRim: donutCapRawRim(input.design.filter.cap),
      donutCapEnabled: input.design.filter.cap.type === "printed-cap",
    };
  }

  if (input.design.type === "tempest") {
    const fanBanks = tempestRawFanBanksForArrangement(input.design.arrangement);
    return {
      ...base,
      ...serializedFilterFields(input.design.filter),
      tempestArrangement: input.design.arrangement,
      filters:
        input.design.arrangement === "single-horizontal-top-filter" ? 1 : 2,
      splitFrames: true,
      fansLeft: fanBanks.left,
      fansRight: fanBanks.right,
      fansTop: fanBanks.top,
      fansBottom: fanBanks.bottom,
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
// URL Settings
// #######################################

export function encodeSettings(
  input: RawPurifierSettings | PurifierDraft,
): string {
  const settings = isPurifierDraft(input)
    ? serializePurifierDraft(input)
    : input;
  const params = new URLSearchParams();
  params.set("printDesign", settings.printDesign);
  params.set("filterPreset", settings.filterPreset);
  params.set("filterWidth", formatNumber(settings.filterWidth));
  params.set("filterDepth", formatNumber(settings.filterDepth));
  params.set("filterThickness", formatNumber(settings.filterThickness));
  params.set("rim", formatNumber(settings.rim));
  params.set("fanPreset", settings.fanPreset);
  params.set("fanDiameter", String(settings.fanDiameter));
  if (!isTempestPrintDesignId(settings.printDesign)) {
    params.set("filters", String(settings.filters));
    params.set("splitFrames", String(settings.splitFrames));
    params.set("fansLeft", String(settings.fansLeft));
    params.set("fansRight", String(settings.fansRight));
    params.set("fansTop", String(settings.fansTop));
    params.set("fansBottom", String(settings.fansBottom));
  }
  params.set("tempestArrangement", settings.tempestArrangement);
  params.set("donutFilterPreset", settings.donutFilterPreset);
  params.set(
    "donutFilterOuterDiameter",
    formatNumber(settings.donutFilterOuterDiameter),
  );
  params.set("donutFilterLength", formatNumber(settings.donutFilterLength));
  params.set(
    "donutFilterHoleDiameter",
    formatNumber(settings.donutFilterHoleDiameter),
  );
  params.set(
    "donutAdapterInsertLength",
    formatNumber(settings.donutAdapterInsertLength),
  );
  params.set("donutCapRim", formatNumber(settings.donutCapRim));
  params.set("donutCapEnabled", String(settings.donutCapEnabled));
  params.set("screwHoleDiameter", formatNumber(settings.screwHoleDiameter));
  params.set("materialThickness", formatNumber(settings.materialThickness));
  params.set("kerfFit", formatNumber(settings.kerfFit));
  params.set(
    "fingerWidthMultiplier",
    formatNumber(settings.fingerWidthMultiplier),
  );
  params.set(
    "fingerSpaceMultiplier",
    formatNumber(settings.fingerSpaceMultiplier),
  );
  params.set(
    "fingerPlayMultiplier",
    formatNumber(settings.fingerPlayMultiplier),
  );
  params.set(
    "fingerHoleWidthMultiplier",
    formatNumber(settings.fingerHoleWidthMultiplier),
  );
  params.set(
    "fingerHoleOffsetMultiplier",
    formatNumber(settings.fingerHoleOffsetMultiplier),
  );
  params.set(
    "dovetailSizeMultiplier",
    formatNumber(settings.dovetailSizeMultiplier),
  );
  params.set(
    "dovetailDepthMultiplier",
    formatNumber(settings.dovetailDepthMultiplier),
  );
  params.set("dovetailTaper", formatNumber(settings.dovetailTaper));
  params.set("showFilterMedia", String(settings.showFilterMedia));
  params.set("showFans", String(settings.showFans));
  params.set("showFilterFrame", String(settings.showFilterFrame));
  params.set("explodedView", String(settings.explodedView));
  params.set("showDimensions", String(settings.showDimensions));
  params.set("showBananaScale", String(settings.showBananaScale));
  params.set("showPrintSeams", String(settings.showPrintSeams));
  params.set("showPreviewEdges", String(settings.showPreviewEdges));
  params.set("previewMaterialColor", settings.previewMaterialColor);
  params.set("autoRotate", String(settings.autoRotate));
  params.set("cameraPreset", settings.cameraPreset);
  params.set("labels", String(settings.labels));
  params.set("referenceScale", formatNumber(settings.referenceScale));
  return params.toString();
}

export function decodeSettings(search: string): RawPurifierSettings {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const printDesign = readPrintDesign(params);
  const filterPreset = readFilterPreset(params);
  const fanDiameter = readFanDiameter(
    params,
    ["fanDiameter", "fan_diameter"],
    defaultSettings.fanDiameter,
  );
  const fanPreset = readFanProductPreset(params, fanDiameter);
  const fields = parsePurifierSettingsFields(params);
  const parsed: RawPurifierSettings = {
    ...defaultSettings,
    ...fields,
    printDesign,
    filterPreset,
    fanPreset,
    fanDiameter,
    tempestArrangement: readTempestArrangement(params),
    donutFilterPreset: readDonutFilterPreset(params),
    previewMaterialColor: readPreviewMaterialColor(params),
    cameraPreset: readCameraPreset(
      params,
      "cameraPreset",
      defaultSettings.cameraPreset,
    ),
  };
  const parsedWithDonutPreset = applyDonutUrlPresetAndMeasurements(
    params,
    parsed,
  );
  return normalizeRawSettings(
    applyPrintDesignUrlDefaults(params, parsedWithDonutPreset, printDesign),
  );
}

export function decodePurifierDraftSettings(search: string): PurifierDraft {
  return createPurifierDraft(decodeSettings(search));
}

export function formatMillimeters(value: number): string {
  return `${formatNumber(value)} mm`;
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
  readonly filter: FilterSelection;
  readonly filterCount: FilterCount;
  readonly fan: FanConfiguration;
  readonly frameConstruction: FilterFrameConstruction;
}): ConfiguredPrintDesign {
  const { printDesign } = input;
  if (isLaserDerivedPrintDesignPreset(printDesign)) {
    return {
      type: "laser-derived-printable-kit",
      preset: printDesign,
      filter: input.filter,
      filterCount: input.filterCount,
      fanBanks: input.fan.banks,
      frameConstruction: input.frameConstruction,
    };
  }

  if (isDonutFilterAdapterPrintDesignPreset(printDesign)) {
    return {
      type: "donut-filter-adapter",
      preset: printDesign,
      donutFilterPreset: findDonutFilterPreset(input.raw.donutFilterPreset).id,
      filter: normalizeDonutFilterSettings(input.raw),
      fan: {
        spec: input.fan.spec,
        productSelection: input.fan.productSelection,
        count: printDesign.implementation.defaults.fanCount,
      },
    };
  }

  if (isTempestPrintDesignPreset(printDesign)) {
    return {
      type: "tempest",
      preset: printDesign,
      arrangement: canonicalTempestArrangement(input.raw.tempestArrangement),
      filter: input.filter,
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
    showPrintSeams: raw.showPrintSeams,
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

function isPurifierDraft(
  input: PurifierInput | RawPurifierSettings | PurifierDraft,
): input is PurifierDraft {
  return "fan" in input && "presetId" in input.fan;
}

function createPurifierDesignDraft(
  configuration: PurifierSettings,
  raw: RawPurifierSettings,
): PurifierDesignDraft {
  if (configuration.design.type === "laser-derived-printable-kit") {
    return {
      type: "laser-derived-printable-kit",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      filter: configuration.design.filter,
      filterCount: configuration.design.filterCount,
      fanBanks: configuration.design.fanBanks,
      frameConstruction: configuration.design.frameConstruction,
    };
  }

  if (configuration.design.type === "donut-filter-adapter") {
    return {
      type: "donut-filter-adapter",
      printDesign: configuration.design.preset.id,
      preset: configuration.design.preset,
      donutFilterPreset: findDonutFilterPreset(raw.donutFilterPreset).id,
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
      filter: configuration.design.filter,
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
  filter: FilterSelection,
): Pick<
  RawPurifierSettings,
  "filterPreset" | "filterWidth" | "filterDepth" | "filterThickness"
> {
  if (filter.type === "preset") {
    const preset = findPresetFilter(filter.presetId);
    return {
      filterPreset: preset.id,
      filterWidth: preset.dimensions.width,
      filterDepth: preset.dimensions.depth,
      filterThickness: preset.dimensions.thickness,
    };
  }

  return {
    filterPreset: customFilterPresetId,
    filterWidth: filter.dimensions.width,
    filterDepth: filter.dimensions.depth,
    filterThickness: filter.dimensions.thickness,
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

// ##############################
// Selection Helpers
// ##############################

function createFilterSelection(
  presetId: FilterPresetId,
  dimensions: FilterDimensions,
): FilterSelection {
  if (isPresetFilterId(presetId)) {
    return {
      type: "preset",
      presetId,
    };
  }
  return {
    type: "custom",
    dimensions,
  };
}

// #######################################
// Print Design Canonicalization
// #######################################

function canonicalizePrintDesignRawSettings(
  settings: RawPurifierSettings,
): RawPurifierSettings {
  if (isTempestPrintDesignId(settings.printDesign)) {
    return applyTempestArrangement(settings, settings.tempestArrangement);
  }
  return settings;
}

// ##############################
// Shared Type Guards and Converters
// ##############################

function referenceScaleFromNumber(value: number): ReferenceScale {
  const length = clamp(value, 0, 300);
  return length > 0 ? { type: "enabled", length } : { type: "disabled" };
}

// #######################################
// URL Parsing Helpers
// #######################################

// ##############################
// Primitive Readers
// ##############################

function readFanDiameter(
  params: URLSearchParams,
  key: string | readonly string[],
  fallback: FanDiameter,
): FanDiameter {
  const parsed = Number(readParam(params, key));
  const found = fanDiameters.find((diameter) => diameter === parsed);
  return found ?? fallback;
}

// ##############################
// Preset Readers
// ##############################

function readFanProductPreset(
  params: URLSearchParams,
  fanDiameter: FanDiameter,
): FanProductPresetId {
  const value = params.get("fanPreset");
  const found = fanProductPresetIds.find((preset) => preset === value);
  if (found !== undefined) {
    return found;
  }
  return fanDiameter ===
    findFanProductPreset(defaultSettings.fanPreset).diameter
    ? defaultSettings.fanPreset
    : customFanProductPresetId;
}

function readFilterPreset(params: URLSearchParams): FilterPresetId {
  const value = params.get("filterPreset");
  const found = filterPresetIds.find((preset) => preset === value);
  if (found !== undefined) {
    return found;
  }
  if (
    hasAnyParam(params, ["filterWidth", "x"]) ||
    hasAnyParam(params, ["filterDepth", "y"]) ||
    hasAnyParam(params, ["filterThickness", "filter_height"])
  ) {
    return customFilterPresetId;
  }
  return defaultSettings.filterPreset;
}

function readDonutFilterPreset(params: URLSearchParams): DonutFilterPresetId {
  const value = params.get("donutFilterPreset");
  const found = donutFilterPresetIds.find((preset) => preset === value);
  if (found !== undefined) {
    return found;
  }
  if (hasDonutFilterMeasurementParams(params)) {
    return customDonutFilterPresetId;
  }
  return defaultSettings.donutFilterPreset;
}

function readPreviewMaterialColor(
  params: URLSearchParams,
): PreviewMaterialColorId {
  return findPreviewMaterialColorPreset(params.get("previewMaterialColor")).id;
}

function hasDonutFilterMeasurementParams(params: URLSearchParams): boolean {
  return (
    params.has("donutFilterOuterDiameter") ||
    params.has("donutFilterLength") ||
    params.has("donutFilterHoleDiameter") ||
    params.has("donutAdapterInsertLength") ||
    params.has("donutCapRim") ||
    params.has("donutCapEnabled")
  );
}

// ##############################
// Donut URL Defaults
// ##############################

function applyDonutUrlPresetAndMeasurements(
  params: URLSearchParams,
  parsed: RawPurifierSettings,
): RawPurifierSettings {
  const presetValue = params.get("donutFilterPreset");
  const presetId = donutFilterPresetIds.find((id) => id === presetValue);
  if (presetId === undefined) {
    return parsed;
  }

  const presetSettings = applyDonutFilterPreset(parsed, presetId);
  if (!hasDonutFilterMeasurementParams(params)) {
    return presetSettings;
  }

  return {
    ...presetSettings,
    donutFilterPreset: customDonutFilterPresetId,
    donutFilterOuterDiameter: params.has("donutFilterOuterDiameter")
      ? parsed.donutFilterOuterDiameter
      : presetSettings.donutFilterOuterDiameter,
    donutFilterLength: params.has("donutFilterLength")
      ? parsed.donutFilterLength
      : presetSettings.donutFilterLength,
    donutFilterHoleDiameter: params.has("donutFilterHoleDiameter")
      ? parsed.donutFilterHoleDiameter
      : presetSettings.donutFilterHoleDiameter,
    donutAdapterInsertLength: params.has("donutAdapterInsertLength")
      ? parsed.donutAdapterInsertLength
      : presetSettings.donutAdapterInsertLength,
    donutCapRim: params.has("donutCapRim")
      ? parsed.donutCapRim
      : presetSettings.donutCapRim,
    donutCapEnabled: params.has("donutCapEnabled")
      ? parsed.donutCapEnabled
      : presetSettings.donutCapEnabled,
  };
}

function readTempestArrangement(
  params: URLSearchParams,
): TempestArrangementPreset {
  return canonicalTempestArrangement(params.get("tempestArrangement"));
}

// ##############################
// Design URL Defaults
// ##############################

function applyPrintDesignUrlDefaults(
  params: URLSearchParams,
  parsed: RawPurifierSettings,
  printDesign: PrintDesignId,
): RawPurifierSettings {
  if (!params.has("printDesign")) {
    return parsed;
  }

  const baseDefaults = applyPrintDesignPreset(defaultSettings, printDesign);
  const defaults =
    isTempestPrintDesignId(printDesign) && params.has("tempestArrangement")
      ? applyTempestArrangementDefaults(baseDefaults, parsed.tempestArrangement)
      : baseDefaults;
  const hasFilterInputs =
    params.has("filterPreset") ||
    hasAnyParam(params, ["filterWidth", "x"]) ||
    hasAnyParam(params, ["filterDepth", "y"]) ||
    hasAnyParam(params, ["filterThickness", "filter_height"]);
  const hasFanInputs =
    params.has("fanPreset") ||
    hasAnyParam(params, ["fanDiameter", "fan_diameter"]);
  const hasDonutFilterInputs =
    params.has("donutFilterPreset") || hasDonutFilterMeasurementParams(params);

  return {
    ...parsed,
    filterPreset: hasFilterInputs ? parsed.filterPreset : defaults.filterPreset,
    filterWidth: hasFilterInputs ? parsed.filterWidth : defaults.filterWidth,
    filterDepth: hasFilterInputs ? parsed.filterDepth : defaults.filterDepth,
    filterThickness: hasFilterInputs
      ? parsed.filterThickness
      : defaults.filterThickness,
    fanPreset: hasFanInputs ? parsed.fanPreset : defaults.fanPreset,
    fanDiameter: hasFanInputs ? parsed.fanDiameter : defaults.fanDiameter,
    filters: params.has("filters") ? parsed.filters : defaults.filters,
    splitFrames: hasAnyParam(params, ["splitFrames", "split_frames"])
      ? parsed.splitFrames
      : defaults.splitFrames,
    fansLeft: hasAnyParam(params, ["fansLeft", "fans_left"])
      ? parsed.fansLeft
      : defaults.fansLeft,
    fansRight: hasAnyParam(params, ["fansRight", "fans_right"])
      ? parsed.fansRight
      : defaults.fansRight,
    fansTop: hasAnyParam(params, ["fansTop", "fans_top"])
      ? parsed.fansTop
      : defaults.fansTop,
    fansBottom: hasAnyParam(params, ["fansBottom", "fans_bottom"])
      ? parsed.fansBottom
      : defaults.fansBottom,
    tempestArrangement: params.has("tempestArrangement")
      ? parsed.tempestArrangement
      : defaults.tempestArrangement,
    donutFilterPreset: hasDonutFilterInputs
      ? parsed.donutFilterPreset
      : defaults.donutFilterPreset,
    donutFilterOuterDiameter:
      hasDonutFilterInputs || params.has("donutFilterOuterDiameter")
        ? parsed.donutFilterOuterDiameter
        : defaults.donutFilterOuterDiameter,
    donutFilterLength:
      hasDonutFilterInputs || params.has("donutFilterLength")
        ? parsed.donutFilterLength
        : defaults.donutFilterLength,
    donutFilterHoleDiameter:
      hasDonutFilterInputs || params.has("donutFilterHoleDiameter")
        ? parsed.donutFilterHoleDiameter
        : defaults.donutFilterHoleDiameter,
    donutAdapterInsertLength:
      hasDonutFilterInputs || params.has("donutAdapterInsertLength")
        ? parsed.donutAdapterInsertLength
        : defaults.donutAdapterInsertLength,
    donutCapRim:
      hasDonutFilterInputs || params.has("donutCapRim")
        ? parsed.donutCapRim
        : defaults.donutCapRim,
    donutCapEnabled:
      hasDonutFilterInputs || params.has("donutCapEnabled")
        ? parsed.donutCapEnabled
        : defaults.donutCapEnabled,
    rim: params.has("rim") ? parsed.rim : defaults.rim,
    materialThickness: hasAnyParam(params, ["materialThickness", "thickness"])
      ? parsed.materialThickness
      : defaults.materialThickness,
    screwHoleDiameter: hasAnyParam(params, ["screwHoleDiameter", "screw_holes"])
      ? parsed.screwHoleDiameter
      : defaults.screwHoleDiameter,
  };
}

// ##############################
// Fallback Readers
// ##############################

function readCameraPreset(
  params: URLSearchParams,
  key: string,
  fallback: CameraPreset,
): CameraPreset {
  const value = params.get(key);
  const found = cameraPresets.find((preset) => preset === value);
  return found ?? fallback;
}

function readPrintDesign(params: URLSearchParams): PrintDesignId {
  const value = params.get("printDesign");
  const found = printDesignIds.find((design) => design === value);
  return found ?? defaultSettings.printDesign;
}

function readParam(
  params: URLSearchParams,
  key: string | readonly string[],
): string | null {
  const keys = Array.isArray(key) ? key : [key];
  for (const entry of keys) {
    const values = params.getAll(entry);
    const value = values[values.length - 1];
    if (value !== undefined) {
      return value;
    }
  }
  return null;
}

// ##############################
// Schema-Parsed Field Inputs
// ##############################

// Canonical field name -> the URL param key(s) it reads, newest-name first then
// legacy aliases. readParam already collapses multi-key + last-value, mirroring
// the per-field reads decodeSettings used to do by hand.
const purifierSettingsFieldKeys: Record<
  keyof PurifierSettingsFieldInputs,
  string | readonly string[]
> = {
  filterWidth: ["filterWidth", "x"],
  filterDepth: ["filterDepth", "y"],
  filterThickness: ["filterThickness", "filter_height"],
  rim: "rim",
  filters: "filters",
  splitFrames: ["splitFrames", "split_frames"],
  fansLeft: ["fansLeft", "fans_left"],
  fansRight: ["fansRight", "fans_right"],
  fansTop: ["fansTop", "fans_top"],
  fansBottom: ["fansBottom", "fans_bottom"],
  donutFilterOuterDiameter: "donutFilterOuterDiameter",
  donutFilterLength: "donutFilterLength",
  donutFilterHoleDiameter: "donutFilterHoleDiameter",
  donutAdapterInsertLength: "donutAdapterInsertLength",
  donutCapRim: "donutCapRim",
  donutCapEnabled: "donutCapEnabled",
  screwHoleDiameter: ["screwHoleDiameter", "screw_holes"],
  materialThickness: ["materialThickness", "thickness"],
  kerfFit: ["kerfFit", "burn"],
  fingerWidthMultiplier: ["fingerWidthMultiplier", "FingerJoint_finger"],
  fingerSpaceMultiplier: ["fingerSpaceMultiplier", "FingerJoint_space"],
  fingerPlayMultiplier: ["fingerPlayMultiplier", "FingerJoint_play"],
  fingerHoleWidthMultiplier: ["fingerHoleWidthMultiplier", "FingerJoint_width"],
  fingerHoleOffsetMultiplier: [
    "fingerHoleOffsetMultiplier",
    "FingerJoint_edge_width",
  ],
  dovetailSizeMultiplier: ["dovetailSizeMultiplier", "DoveTail_size"],
  dovetailDepthMultiplier: ["dovetailDepthMultiplier", "DoveTail_depth"],
  dovetailTaper: ["dovetailTaper", "DoveTail_angle"],
  showFilterMedia: "showFilterMedia",
  showFans: "showFans",
  showFilterFrame: "showFilterFrame",
  explodedView: "explodedView",
  showDimensions: "showDimensions",
  showBananaScale: "showBananaScale",
  showPrintSeams: "showPrintSeams",
  showPreviewEdges: "showPreviewEdges",
  autoRotate: "autoRotate",
  labels: "labels",
  referenceScale: ["referenceScale", "reference"],
};

const purifierSettingsFieldsSchema =
  createPurifierSettingsFieldsSchema(defaultSettings);

function parsePurifierSettingsFields(
  params: URLSearchParams,
): ParsedPurifierSettingsFields {
  const inputs: PurifierSettingsFieldInputs = {};
  for (const [field, key] of Object.entries(purifierSettingsFieldKeys) as [
    keyof PurifierSettingsFieldInputs,
    string | readonly string[],
  ][]) {
    // readFilterCount historically read the first value via params.get; every
    // other field used readParam's last-value semantics. Preserve that split.
    const value =
      field === "filters"
        ? params.get("filters")
        : readParam(params, key);
    if (value !== null) {
      inputs[field] = value;
    }
  }
  return purifierSettingsFieldsSchema.parse(inputs);
}

function hasAnyParam(
  params: URLSearchParams,
  keys: readonly string[],
): boolean {
  return keys.some((key) => params.has(key));
}

// #######################################
// Primitive Helpers
// #######################################

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
