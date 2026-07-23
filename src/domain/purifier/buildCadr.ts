// #######################################
// Build CADR resolver
// #######################################
//
// Maps the filterboxbuilder configuration + raw settings onto the CADR model
// inputs (cadr.ts): picks PC vs box/exhaust mode, resolves the chosen fan model
// (with the size defaults and the <485 mm box-fan fallback), and derives the
// filter count and fan count for the build. Display-only — no geometry impact.

import type { PurifierSettings, RawPurifierSettings } from "@/domain/purifier/settingsModel";
import {
  estimateBoxCadr,
  estimatePcCadr,
  findBoxFanModel,
  findPcFanModel,
  BOX_FAN_MIN_FILTER_WIDTH_MM,
  CUSTOM_FAN_ID,
  DEFAULT_BOX_FAN_ID,
  DEFAULT_PC_FAN_ID,
  type CadrEstimate,
  type FanGroup,
  type GrillLoss,
} from "@/domain/purifier/cadr";
import { matchedStockCadrPreset } from "@/domain/purifier/filterPresets";

// Whether the build runs a 20" box/exhaust fan (tower with box-exhaust top) rather
// than a grid of PC fans.
export function isBoxExhaustBuild(config: PurifierSettings): boolean {
  return (
    config.design.type === "tempest" &&
    config.design.arrangement === "four-side-filter-tower" &&
    config.design.topExhaust === "box-exhaust"
  );
}

// The PC-fan size group the build's fans belong to (the only PC sizes modelled).
export function fanGroupForBuild(config: PurifierSettings): FanGroup {
  return config.fan.spec.diameter >= 135 ? "140" : "120";
}

export type CadrFanMode = "pc" | "box";

// The concrete fan-model id to use/display for a build: the stored selection when
// it fits the current mode/size, otherwise the size default — and "custom" when the
// default box fan can't cover a sub-485 mm filter. Shared by the resolver and UI so
// the dropdown and the estimate always agree.
export function resolveFanModelId(
  fanModel: string,
  mode: CadrFanMode,
  group: FanGroup,
  filterWidth: number,
): string {
  if (mode === "box") {
    if (fanModel === CUSTOM_FAN_ID) {
      return CUSTOM_FAN_ID;
    }
    if (findBoxFanModel(fanModel) !== undefined) {
      return fanModel;
    }
    return filterWidth < BOX_FAN_MIN_FILTER_WIDTH_MM ? CUSTOM_FAN_ID : DEFAULT_BOX_FAN_ID;
  }
  if (fanModel === CUSTOM_FAN_ID) {
    return CUSTOM_FAN_ID;
  }
  const model = findPcFanModel(fanModel);
  return model !== undefined && model.group === group ? fanModel : DEFAULT_PC_FAN_ID[group];
}

// Resolved free-air airflow (m³/h) of the selected PC fan: the model's rating, the
// entered custom airflow, or the size default as a fallback. Used for flow-based
// sizing such as the tower's Auto foot length so it tracks the chosen fan.
export function pcFanFreeAirM3h(
  fanModel: string,
  group: FanGroup,
  customAirflowM3h: number,
  filterWidthMm: number,
): number {
  const groupDefault = findPcFanModel(DEFAULT_PC_FAN_ID[group])?.q0 ?? 0;
  const id = resolveFanModelId(fanModel, "pc", group, filterWidthMm);
  if (id === CUSTOM_FAN_ID) {
    return customAirflowM3h > 0 ? customAirflowM3h : groupDefault;
  }
  return findPcFanModel(id)?.q0 ?? groupDefault;
}

// Number of filters in the air path (parallel area), by arrangement.
function buildFilterCount(config: PurifierSettings): number {
  if (config.design.type === "tempest") {
    const arrangement = config.design.arrangement;
    if (arrangement === "four-side-filter-tower") {
      return 4 + (config.design.bottomFilter ? 1 : 0);
    }
    if (arrangement === "dual-horizontal-sandwich") {
      return 2;
    }
    return 1;
  }
  return config.filterCount;
}

export type BuildCadrInput = {
  readonly configuration: PurifierSettings;
  readonly rawSettings: RawPurifierSettings;
  readonly fanCount: number; // resolved PC fan count (ignored in box mode)
};

const M_PER_FT = 0.3048;

// Strip a trailing ".0" so whole numbers read cleanly (12 not 12.0).
function trimDim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// Air changes per hour and a short room-size label, derived from the room
// dimensions on the raw settings. ACH = clean-air delivery (m³/h) ÷ room volume.
function roomAch(cadrM3h: number, raw: RawPurifierSettings): { ach: number | null; roomLabel: string } {
  const unit = raw.roomUnit === "m" ? "m" : "ft";
  const w = raw.roomWidth;
  const l = raw.roomLength;
  const h = raw.roomHeight;
  if (!(w > 0) || !(l > 0) || !(h > 0)) {
    return { ach: null, roomLabel: "" };
  }
  const roomLabel = `${trimDim(w)} × ${trimDim(l)} × ${trimDim(h)} ${unit}`;
  const factor = unit === "ft" ? M_PER_FT : 1;
  const volumeM3 = w * factor * (l * factor) * (h * factor);
  const ach = volumeM3 > 0 && cadrM3h > 0 ? cadrM3h / volumeM3 : null;
  return { ach, roomLabel };
}

// The honeycomb fan grill, present only when enabled and actually cut (it is hidden
// for hand cut, which uses plain bores). Open-area ratio from the hex geometry
// (cell flat-to-flat vs rib), squared because area scales with the linear ratio;
// "full cells only" leaves gaps at the rim, so it's a touch less open. Conservative.
function grillForBuild(config: PurifierSettings, raw: RawPurifierSettings): GrillLoss | undefined {
  const handCut = config.design.type === "laser-cut" && config.design.cutStyle === "hand";
  if (!raw.hexGrill || handCut || !(raw.hexSize > 0) || raw.hexSpacing < 0) {
    return undefined;
  }
  let openFraction = Math.pow(raw.hexSize / (raw.hexSize + raw.hexSpacing), 2);
  if (raw.hexFullCellsOnly) {
    openFraction *= 0.9;
  }
  const boreDiameterFt = config.fan.spec.diameter / 304.8;
  return { openFraction, boreAreaFt2: Math.PI * Math.pow(boreDiameterFt / 2, 2) };
}

export function estimateBuildCadr(input: BuildCadrInput): CadrEstimate {
  const { configuration: config, rawSettings: raw, fanCount } = input;
  const filter = { w: config.filter.width, l: config.filter.depth, t: config.filter.thickness };
  // A matched stock filter pins its own resistance/efficiency/area (PC mode); custom
  // sizes leave this undefined and fall back to the MERV-13 furnace baseline.
  const calibration = matchedStockCadrPreset(config.filter.width, config.filter.depth, config.filter.thickness)?.cadr;
  const nFilters = buildFilterCount(config);
  const group = fanGroupForBuild(config);
  const mode: CadrFanMode = isBoxExhaustBuild(config) ? "box" : "pc";
  const id = resolveFanModelId(raw.fanModel, mode, group, config.filter.width);
  const grill = mode === "pc" ? grillForBuild(config, raw) : undefined;

  const base = ((): CadrEstimate => {
    if (mode === "box") {
      // The Box/Exhaust top panel rings the fan with a hole sized to the blade, so
      // it forms a shroud — credit the shroud airflow bonus (no SHROUD_PENALTY).
      if (id === CUSTOM_FAN_ID) {
        return estimateBoxCadr({
          nFilters,
          filter,
          speed: 2,
          shroud: true,
          custom: { q0_m3h: raw.customFanAirflow, p0_mm: raw.customFanPressure, noiseDb: raw.customFanNoise, watts: raw.customFanWatts },
          calibration,
        });
      }
      return estimateBoxCadr({ nFilters, filter, speed: 2, shroud: true, preset: findBoxFanModel(id), calibration });
    }

    if (id === CUSTOM_FAN_ID) {
      return estimatePcCadr({
        group,
        nFans: fanCount,
        nFilters,
        filter,
        q0_m3h: raw.customFanAirflow,
        p0_mm: raw.customFanPressure,
        noiseDb: raw.customFanNoise,
        currentA: raw.customFanCurrent,
        arctic: false,
        grill,
        calibration,
      });
    }
    // resolveFanModelId guarantees a known PC id here.
    const m = findPcFanModel(id) ?? findPcFanModel(DEFAULT_PC_FAN_ID[group])!;
    return estimatePcCadr({ group, nFans: fanCount, nFilters, filter, q0_m3h: m.q0, p0_mm: m.p0, noiseDb: m.db, currentA: m.a, arctic: m.arctic, grill, calibration });
  })();

  return { ...base, ...roomAch(base.cadrM3h, raw), fanModelId: id };
}
