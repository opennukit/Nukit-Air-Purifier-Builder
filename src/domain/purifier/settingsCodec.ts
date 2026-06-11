// URL settings codec: encodes raw purifier settings to URL query params and
// decodes params back into normalized raw settings, including legacy boxes.py
// param aliases, per-design URL defaults, and schema-parsed field inputs.


import {
  createPurifierDraft,
  isPurifierDraft,
  normalizeRawSettings,
  serializePurifierDraft,
} from "@/domain/purifier/airPurifier";
import {
  isTempestPrintDesignId,
  printDesignIds,
  type PrintDesignId,
  type TempestArrangementPreset,
} from "@/domain/purifier/designPresets";
import {
  fanColors,
  nearestFanDiameter,
  type FanColor,
  type FanDiameter,
} from "@/domain/purifier/fanProducts";
import {
  applyPrintDesignPreset,
  applyTempestArrangementDefaults,
  cameraPresets,
  canonicalTempestArrangement,
  defaultSettings,
  findPreviewMaterialColorPreset,
  type CameraPreset,
  type PreviewMaterialColorId,
  type PurifierDraft,
  type RawPurifierSettings,
} from "@/domain/purifier/settingsModel";
import {
  createPurifierSettingsFieldsSchema,
  type ParsedPurifierSettingsFields,
  type PurifierSettingsFieldInputs,
} from "@/domain/purifier/settingsSchema";

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
  params.set("filterWidth", formatNumber(settings.filterWidth));
  params.set("filterDepth", formatNumber(settings.filterDepth));
  params.set("filterThickness", formatNumber(settings.filterThickness));
  params.set("rim", formatNumber(settings.rim));
  params.set("fanColor", settings.fanColor);
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
  const fanDiameter = readFanDiameter(
    params,
    ["fanDiameter", "fan_diameter"],
    defaultSettings.fanDiameter,
  );
  const fields = parsePurifierSettingsFields(params);
  const parsed: RawPurifierSettings = {
    ...defaultSettings,
    ...fields,
    printDesign,
    fanColor: readFanColor(params),
    fanDiameter,
    tempestArrangement: readTempestArrangement(params),
    previewMaterialColor: readPreviewMaterialColor(params),
    cameraPreset: readCameraPreset(
      params,
      "cameraPreset",
      defaultSettings.cameraPreset,
    ),
  };
  return normalizeRawSettings(
    applyPrintDesignUrlDefaults(params, parsed, printDesign),
  );
}

export function decodePurifierDraftSettings(search: string): PurifierDraft {
  return createPurifierDraft(decodeSettings(search));
}

export function formatMillimeters(value: number): string {
  return `${formatNumber(value)} mm`;
}

// #######################################
// URL Parsing Helpers
// #######################################

// ##############################
// Primitive Readers
// ##############################

// Non-catalog diameters snap to the nearest supported size so the decoded
// settings match what the build actually uses.
function readFanDiameter(
  params: URLSearchParams,
  key: string | readonly string[],
  fallback: FanDiameter,
): FanDiameter {
  const raw = readParam(params, key);
  if (raw === null || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? nearestFanDiameter(parsed) : fallback;
}

// ##############################
// Preset Readers
// ##############################

function readFanColor(params: URLSearchParams): FanColor {
  const value = params.get("fanColor");
  return fanColors.find((color) => color === value) ?? defaultSettings.fanColor;
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
  const hasFanInputs = hasAnyParam(params, ["fanDiameter", "fan_diameter"]);
  const hasDonutFilterInputs = hasDonutFilterMeasurementParams(params);

  // Each measured filter field falls back to the active design's default on
  // its own, so a partial measurement URL keeps the design defaults for the
  // fields it does not mention.
  return {
    ...parsed,
    filterWidth: hasAnyParam(params, ["filterWidth", "x"])
      ? parsed.filterWidth
      : defaults.filterWidth,
    filterDepth: hasAnyParam(params, ["filterDepth", "y"])
      ? parsed.filterDepth
      : defaults.filterDepth,
    filterThickness: hasAnyParam(params, ["filterThickness", "filter_height"])
      ? parsed.filterThickness
      : defaults.filterThickness,
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
