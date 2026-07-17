// #######################################
// CADR / Noise / Power Estimation
// #######################################
//
// A direct TypeScript port of the standalone diy-cadr-calculator physics, used to
// estimate the performance of the box the user is configuring. Two paths:
//   - PC-fan builds (120/140 mm fans): a fan-curve x filter-resistance intersection
//     solved by bisection (estimatePcCadr).
//   - Box/Exhaust builds (20" box fan): an empirical cube model (estimateBoxCadr).
// Trademark rule from the source: the box-fan build is a "filter cube"; never the
// other name. Numbers are estimates (brand/leakage/assembly dependent).

// ##############################
// Units / constants
// ##############################

export const CFM_PER_M3H = 0.588578;
export const M3H_PER_CFM = 1.699011;
const MMH2O_PER_INH2O = 25.4;
const MM_PER_IN = 25.4;
const MM_PER_FT = 304.8;
const PA_PER_INH2O = 249.0889;
const VOLTAGE_PC = 12;
const VOLTAGE_MAINS = 120;

// A filter media resistance curve: dP[inH2O] = A*V^2 + B*V, V = face velocity in FPM.
export type FilterResistanceCurve = { readonly A: number; readonly B: number };

// Resistance curves fit from 3M Filtrete lab data (the community "Filters and Fans"
// spreadsheet), keyed by media grade (3M MPR label in the comment). MERV-13 / MPR-1900
// is the baseline the geometry model scales; the others let a filter with a different
// media grade use its own curve instead of a multiplier on the MERV-13 one.
export const FILTER_CURVES = {
  "merv-11": { A: 1.5617e-7, B: 2.2639e-4 }, // MPR-1085
  "merv-12": { A: 2.0662e-7, B: 2.0764e-4 }, // MPR-1500
  "merv-13": { A: 4.7302e-7, B: 3.3752e-4 }, // MPR-1900 (baseline)
  "merv-13-hi": { A: 5.9773e-7, B: 3.4182e-4 }, // MPR-2200
  "merv-14": { A: 6.094e-7, B: 4.2826e-4 }, // MPR-2500
  "merv-14-hi": { A: 6.5569e-7, B: 4.571e-4 }, // MPR-2800
} as const satisfies Record<string, FilterResistanceCurve>;

const FILTER: FilterResistanceCurve = FILTER_CURVES["merv-13"];

// Measured DIY CADR datasets to sanity-check the model and pin future filters against:
// the NIOSH/Derk 2023 wildfire-smoke chamber study (a single MERV-13 box fan about
// 111 CFM; shroud +40%, 4 inch filter +123%, two-filter wedge +137%, CR box +261%) and
// the IIT 2021 CR-box test report. Fan/noise anchors stay the HouseFresh boxes above.

// MERV-13 particle-size efficiency (published @ ~2.5 m/s). The plain mean of the three
// bands (about 0.813) is the single headline single-pass efficiency for the low-velocity
// PC case. These are high-velocity lab figures, so real fine-particle capture at DIY
// velocity is usually better, which makes this the conservative side.
const PSE = { fine: 0.62, mid: 0.87, coarse: 0.95 };
const MERV13_EFF = (PSE.fine + PSE.mid + PSE.coarse) / 3;
const MERV13_BREAKDOWN: readonly { readonly label: string; readonly value: number }[] = [
  { label: "0.3–1 µm", value: PSE.fine },
  { label: "1–3 µm", value: PSE.mid },
  { label: "3–10 µm", value: PSE.coarse },
];

const FPM_TO_MS = 0.00508; // 1 ft/min = 0.3048 m / 60 s

// Normalised fan PQ-curve shapes [p/Pmax, q/Qmax], scaled to each fan's Q0/P0.
const FAN_SHAPE: Record<"120" | "140", readonly (readonly [number, number])[]> = {
  "120": [[0.0, 1.0], [0.0455, 0.9626], [0.0909, 0.922], [0.1364, 0.8869], [0.1818, 0.8505], [0.2273, 0.7916], [0.2727, 0.7416], [0.3182, 0.7024], [0.3636, 0.6658], [0.4091, 0.6164], [0.4545, 0.5916], [0.5, 0.5447], [0.5455, 0.5066], [0.5909, 0.4619], [0.6364, 0.4082], [0.6818, 0.3697], [0.7273, 0.3651], [0.7727, 0.3606], [0.8182, 0.3317], [0.8636, 0.2887], [0.9091, 0.2449], [0.9545, 0.2236], [1.0, 0.0]],
  "140": [[0.0, 1.0], [0.0417, 0.988], [0.0833, 0.9625], [0.125, 0.9352], [0.1667, 0.8893], [0.2083, 0.8516], [0.25, 0.8046], [0.2917, 0.7808], [0.3333, 0.7495], [0.375, 0.6986], [0.4167, 0.659], [0.4583, 0.6391], [0.5, 0.5854], [0.5417, 0.5467], [0.5833, 0.505], [0.625, 0.4702], [0.6667, 0.4304], [0.7083, 0.4281], [0.75, 0.4091], [0.7917, 0.4066], [0.8333, 0.3942], [0.875, 0.3708], [0.9167, 0.3428], [0.9583, 0.2141], [1.0, 0.0]],
};

// Noise calibration (HouseFresh in-room measurements). Arctic specs are offset AND
// compressed (linear fit); other brands read ~spec + enclosure offset. Reported @ 1 m.
const ENCLOSURE_OFFSET = 3.4;
const DIST_3FT_TO_1M = 20 * Math.log10(0.9144 / 1.0); // ≈ -0.78 dB
const ARCTIC_SLOPE = 0.461;
const ARCTIC_INTERCEPT = 26.4;
const SHROUD_PENALTY = 0.92; // ~8% airflow loss without the cardboard shroud
const DEFAULT_BUILD_EFFICIENCY = 0.85; // leakage / fan guards / fan interaction (PC mode)

// ##############################
// Fan databases
// ##############################

export type FanGroup = "120" | "140";

export type PcFanModel = {
  readonly id: string;
  readonly name: string;
  readonly group: FanGroup;
  readonly q0: number; // free-air airflow, m³/h
  readonly p0: number; // static pressure, mmH₂O
  readonly db: number; // spec noise, dBA
  readonly a: number; // current draw, A @ 12 V
  readonly arctic: boolean; // uses the Arctic spec-scale noise calibration
};

const pc = (id: string, name: string, group: FanGroup, q0: number, p0: number, db: number, a: number): PcFanModel => ({
  id,
  name,
  group,
  q0,
  p0,
  db,
  a,
  arctic: /^arctic/i.test(name),
});

// Airflow (q0, m³/h) and static pressure (p0, mmH₂O) are third-party Cybenetics
// LW-9266 measurements, not manufacturer specs. Noise (db) and current (a) are not
// published by Cybenetics, so they retain their prior values (noise is separately
// calibrated).
export const PC_FAN_MODELS: readonly PcFanModel[] = [
  pc("arctic-p12-pwm-pst", "ARCTIC P12 PWM PST", "120", 88.6, 1.76, 16.5, 0.08),
  pc("arctic-p12-max", "ARCTIC P12 Max", "120", 144.4, 5.12, 22.5, 0.29),
  pc("noctua-nf-a12x25-pwm", "Noctua NF-A12x25 PWM", "120", 95.3, 2.26, 22.6, 0.14),
  pc("noctua-nf-a12x25-g2", "Noctua NF-A12x25 G2", "120", 104.1, 2.79, 29.8, 0.15),
  pc("bequiet-silent-wings-4-hs-120", "be quiet! Silent Wings 4 High Speed", "120", 123.6, 3.07, 31.2, 0.22),
  pc("cm-masterfan-sf120m", "Cooler Master MasterFan SF120M (High)", "120", 92.9, 1.88, 22.0, 0.12),
  pc("cm-masterfan-mf120-halo2", "Cooler Master MasterFan MF120 HALO²", "120", 89.1, 2.17, 27.0, 0.14),
  pc("cm-mobius-120", "Cooler Master Mobius 120", "120", 98.7, 1.98, 22.6, 0.12),
  pc("cm-mobius-120-oc", "Cooler Master Mobius 120 OC (High Speed)", "120", 153.4, 4.36, 31.1, 0.2),
  pc("cm-mobius-120p-argb", "Cooler Master Mobius 120P ARGB 30th", "120", 123.6, 3.05, 30.0, 0.18),
  pc("arctic-p14-pwm-pst", "ARCTIC P14 PWM PST", "140", 122.2, 1.96, 16.5, 0.12),
  pc("arctic-p14-max", "ARCTIC P14 Max", "140", 193.2, 4.11, 30.6, 0.35),
  pc("noctua-nf-a14x25-g2", "Noctua NF-A14x25 G2", "140", 160.7, 2.51, 32.4, 0.19),
  pc("bequiet-silent-wings-4-hs-140", "be quiet! Silent Wings 4 High Speed", "140", 136.9, 2.03, 29.3, 0.4),
  pc("corsair-rs140-max", "Corsair RS140 MAX", "140", 170.4, 2.2, 31.0, 0.35),
  pc("cm-masterfan-mf140-halo2", "Cooler Master MasterFan MF140 HALO²", "140", 99.0, 1.73, 27.0, 0.13),
];

export const DEFAULT_PC_FAN_ID: Record<FanGroup, string> = {
  "120": "arctic-p12-pwm-pst",
  "140": "arctic-p14-pwm-pst",
};

export type BoxFanModel = {
  readonly id: string;
  readonly name: string;
  readonly cfm1: readonly [number, number, number]; // 4× 20×20×1 cube airflow [low,med,high]
  readonly cfm2: readonly [number, number, number]; // 4× 20×20×2 cube airflow
  readonly shroud: readonly [number, number, number]; // no-filter airflow cap
  readonly noise: readonly [number, number, number]; // dBA, whole unit @ ~3 ft
  readonly watts: readonly [number, number, number];
  readonly noiseSrc: string;
};

export const BOX_FAN_MODELS: readonly BoxFanModel[] = [
  { id: "lasko-b20200", name: "Lasko B20200 / B20201 (Classic 20\")", cfm1: [264, 391, 518], cfm2: [335, 506, 676], shroud: [503, 683, 863], noise: [49, 55, 60], watts: [50, 70, 89], noiseSrc: "est." },
  { id: "lasko-3723", name: "Lasko 3723 (Premium, Wind Ring)", cfm1: [358, 487, 616], cfm2: [448, 593, 737], shroud: [622, 771, 920], noise: [49, 55, 60], watts: [38, 58, 78], noiseSrc: "est." },
  { id: "air-king-9723", name: "Air King 9723 / 4CH71G", cfm1: [395, 480, 564], cfm2: [560, 645, 730], shroud: [712, 836, 959], noise: [55.8, 59, 62.2], watts: [87, 117, 165], noiseSrc: "NIOSH" },
  { id: "hurricane-hgc736501", name: "Hurricane HGC736501 (Classic)", cfm1: [314, 388, 462], cfm2: [412, 483, 553], shroud: [478, 564, 650], noise: [49, 55.1, 60.7], watts: [40.5, 44.5, 46.7], noiseSrc: "HouseFresh" },
];

export const DEFAULT_BOX_FAN_ID = "lasko-b20200";
// The default box fan only fits over a filter at least this wide (a 20" face).
export const BOX_FAN_MIN_FILTER_WIDTH_MM = 485;

export const CUSTOM_FAN_ID = "custom";

export function pcFanModelsForGroup(group: FanGroup): readonly PcFanModel[] {
  return PC_FAN_MODELS.filter((model) => model.group === group);
}

export function findPcFanModel(id: string): PcFanModel | undefined {
  return PC_FAN_MODELS.find((model) => model.id === id);
}

export function findBoxFanModel(id: string): BoxFanModel | undefined {
  return BOX_FAN_MODELS.find((model) => model.id === id);
}

// ##############################
// Filter / fan physics
// ##############################

type FilterDims = { readonly w: number; readonly l: number; readonly t: number };

// How a filter's effective media area is derived: "furnace" pleated media (frame
// and depth math) or "direct" packaged particle filter (plain frontal face area).
export type FilterAreaModel = "direct" | "furnace";

// Per-filter CADR calibration. A stock filter with its own measured data pins its
// single-pass efficiency (eff), resistance multiplier vs the MERV-13 baseline curve
// (res, below 1 flows easier), area model (area), and class label (cls). Anything
// omitted falls back to the MERV-13 furnace defaults, so custom sizes are unchanged.
export type FilterCadrCalibration = {
  readonly cls?: string;
  readonly eff?: number;
  readonly res?: number;
  readonly area?: FilterAreaModel;
  // The media resistance curve (e.g. a FILTER_CURVES entry) when the filter is not the
  // MERV-13 baseline. Omitted means the MERV-13 curve, optionally scaled by res.
  readonly curve?: FilterResistanceCurve;
};

// Effective MERV-13 furnace media area (ft²) from outer dimensions (mm). Deeper
// media pleats more, so resistance eases up to a 1.8× depth factor. A packaged
// particle filter (area "direct") has no furnace frame or pleats, so it uses its
// plain frontal face area and leans on its own resistance multiplier instead.
function effAreaFt2(f: FilterDims, area: FilterAreaModel = "furnace"): number {
  if (area === "direct") {
    return (f.w / MM_PER_FT) * (f.l / MM_PER_FT);
  }
  const wIn = f.w / MM_PER_IN;
  const lIn = f.l / MM_PER_IN;
  const a = (Math.max(0, wIn - 2.3) * Math.max(0, lIn - 1.15)) / 144;
  const depthFactor = Math.min(1.8, f.t / 19);
  return a * depthFactor;
}

// The efficiency badge/breakdown for a filter: the published MERV-13 particle-size
// split by default, or a single calibrated figure for a pinned non-MERV filter.
function efficiencyBreakdownFor(
  calibration: FilterCadrCalibration | undefined,
): readonly { readonly label: string; readonly value: number }[] {
  if (calibration?.eff === undefined && calibration?.cls === undefined) {
    return MERV13_BREAKDOWN;
  }
  return [{ label: calibration.cls ?? "Single-pass", value: calibration.eff ?? MERV13_EFF }];
}

function faceVelFPM(dpIn: number, res = 1, curve: FilterResistanceCurve = FILTER): number {
  const { A, B } = curve;
  const x = dpIn / res;
  if (x <= 0) {
    return 0;
  }
  return (-B + Math.sqrt(B * B + 4 * A * x)) / (2 * A);
}

function filterCFM(dpIn: number, totalAreaFt2: number, res = 1, curve: FilterResistanceCurve = FILTER): number {
  return faceVelFPM(dpIn, res, curve) * totalAreaFt2;
}

function fanCFMperFan(dpIn: number, q0cfm: number, p0mm: number, shape: readonly (readonly [number, number])[]): number {
  const pn = (dpIn * MMH2O_PER_INH2O) / p0mm;
  if (pn >= 1) {
    return 0;
  }
  if (pn <= 0) {
    return q0cfm;
  }
  for (let i = 0; i < shape.length - 1; i += 1) {
    const [p1, q1] = shape[i];
    const [p2, q2] = shape[i + 1];
    if (pn >= p1 && pn <= p2) {
      const f = (pn - p1) / (p2 - p1);
      return (q1 + f * (q2 - q1)) * q0cfm;
    }
  }
  return 0;
}

// Honeycomb fan grill, a flow restriction in series with each fan. openFraction is
// the open-area ratio of the bore; boreAreaFt2 is one fan's opening area. The data
// behind the fan/CADR model was gathered with NO grill, so this is added on top.
export type GrillLoss = {
  readonly openFraction: number;
  readonly boreAreaFt2: number;
};

// Pressure drop (inH2O) across the grill for one fan's flow. Idel'chik thin
// perforated-plate loss referenced to the bore approach velocity — the most
// conservative case (a real, thick printed grill flows easier, so this never
// over-states CADR). Velocity pressure: VP[inH2O] = (V_fpm / 4005)^2.
function grillPressureDropInH2O(qPerFanCfm: number, grill: GrillLoss): number {
  const beta = Math.min(0.98, Math.max(0.05, grill.openFraction));
  if (!(qPerFanCfm > 0) || !(grill.boreAreaFt2 > 0)) {
    return 0;
  }
  const vBoreFpm = qPerFanCfm / grill.boreAreaFt2;
  const oneMinusBeta = 1 - beta;
  const k = Math.pow(0.707 * Math.pow(oneMinusBeta, 0.375) + oneMinusBeta, 2) / (beta * beta);
  return k * Math.pow(vBoreFpm / 4005, 2);
}

type SolveParams = {
  readonly q0cfm: number;
  readonly p0mm: number;
  readonly shape: readonly (readonly [number, number])[];
  readonly nFans: number;
  readonly totalAreaFt2: number;
  readonly res: number;
  readonly grill?: GrillLoss;
  readonly curve?: FilterResistanceCurve;
};

// Operating point: the ΔP where N·fan(Q) = filter(Q), found by bisection. With a
// grill the fan must overcome the filter ΔP plus the per-fan grill ΔP, so the fan
// is evaluated at the higher pressure while the filter still sees only its own ΔP.
function solve(params: SolveParams): { dpIn: number; cfm: number } {
  const { q0cfm, p0mm, shape, nFans, totalAreaFt2, res, grill, curve } = params;
  const diff = (dp: number): number => {
    const totalFlow = filterCFM(dp, totalAreaFt2, res, curve);
    const fanPressure = grill === undefined ? dp : dp + grillPressureDropInH2O(totalFlow / nFans, grill);
    return nFans * fanCFMperFan(fanPressure, q0cfm, p0mm, shape) - totalFlow;
  };
  let lo = 1e-9;
  let hi = p0mm / MMH2O_PER_INH2O;
  if (diff(lo) <= 0) {
    return { dpIn: 0, cfm: 0 };
  }
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (diff(mid) > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const dpIn = (lo + hi) / 2;
  return { dpIn, cfm: filterCFM(dpIn, totalAreaFt2, res, curve) };
}

function realPerFanSPL(spec: number, isArctic: boolean): number {
  return isArctic ? ARCTIC_SLOPE * spec + ARCTIC_INTERCEPT : spec + ENCLOSURE_OFFSET;
}

// ##############################
// Filter-cube (box fan) model
// ##############################

// Reference 4-filter cubes the box-fan power-law is fit through.
const CUBE_REF_1IN: FilterDims = { w: 501, l: 501, t: 19 };
const CUBE_REF_2IN: FilterDims = { w: 495, l: 495, t: 44 };

// Single-pass efficiency at box-fan face velocity (PM1/smoke basis): MERV-13 eases to
// ~0.43 (1") / ~0.50 (2") at that high velocity, but a calibrated high-grade filter
// keeps its own measured rating.
function cubeEff(f: FilterDims, calibration?: FilterCadrCalibration): number {
  if (calibration?.eff !== undefined) {
    return calibration.eff;
  }
  return f.t >= 30 ? 0.5 : 0.43;
}

// Cube hydraulic area (ft²): total effective media area, enlarged for low-resistance
// media (res below 1) and using the filter's own area model. The reference cubes are
// plain MERV-13, so they keep the furnace area at res 1.
function cubeArea(f: FilterDims, n: number, calibration?: FilterCadrCalibration): number {
  return (effAreaFt2(f, calibration?.area ?? "furnace") / (calibration?.res ?? 1)) * n;
}

function cubeAirflow(fan: BoxFanModel, speed: number, area: number, shroud: boolean): number {
  const a1 = cubeArea(CUBE_REF_1IN, 4);
  const a2 = cubeArea(CUBE_REF_2IN, 4);
  const q1 = fan.cfm1[speed];
  const q2 = fan.cfm2[speed];
  const power = Math.log(q2 / q1) / Math.log(a2 / a1);
  const c = q1 / Math.pow(a1, power);
  let q = c * Math.pow(area, power);
  q = Math.min(q, fan.shroud[speed]);
  return q * (shroud ? 1 : SHROUD_PENALTY);
}

// ##############################
// Public estimation API
// ##############################

export type CadrEstimate = {
  readonly cadrCfm: number;
  readonly cadrM3h: number;
  readonly flowM3h: number;
  readonly fanCount: number;
  // null when there are no fans / no figure available (e.g. custom fan with no noise).
  readonly noiseDbA: number | null;
  readonly currentA: number | null;
  readonly powerW: number | null;
  readonly voltage: number;
  // Air changes per hour for the configured room (null when there's no airflow or
  // no valid room), and a short room-size label (e.g. "12 × 12 × 8 ft") for display.
  readonly ach: number | null;
  readonly roomLabel: string;
  // The resolved fan-model id used for the estimate (a PC id, a box-fan id, or
  // "custom"). Lets the preview decide whether to show the box-fan 3D model.
  readonly fanModelId: string;
  // Operating-point detail for the Performance view.
  readonly faceVelocityMs: number; // air speed across the filter media, m/s
  readonly pressureDropPa: number; // system pressure drop at the operating point, Pa
  readonly filterEfficiency: number; // single-figure filter efficiency, 0-1
  readonly efficiencyBreakdown: readonly { readonly label: string; readonly value: number }[];
  // Efficiency class label for the badge (e.g. "MERV-13", "EPA12"); absent means the
  // MERV-13 baseline.
  readonly filterClass?: string;
  readonly noiseRawDbA: number | null; // raw spec sum before real-world calibration
};

const EMPTY_PC: Omit<CadrEstimate, "fanCount"> = {
  cadrCfm: 0,
  cadrM3h: 0,
  flowM3h: 0,
  noiseDbA: null,
  currentA: 0,
  powerW: 0,
  voltage: VOLTAGE_PC,
  ach: null,
  roomLabel: "",
  fanModelId: "",
  faceVelocityMs: 0,
  pressureDropPa: 0,
  filterEfficiency: MERV13_EFF,
  efficiencyBreakdown: MERV13_BREAKDOWN,
  noiseRawDbA: null,
};

export type PcCadrInput = {
  readonly group: FanGroup;
  readonly nFans: number;
  readonly nFilters: number;
  readonly filter: FilterDims;
  readonly q0_m3h: number;
  readonly p0_mm: number;
  readonly noiseDb: number;
  readonly currentA: number;
  readonly arctic: boolean;
  readonly buildEfficiency?: number;
  readonly grill?: GrillLoss;
  readonly calibration?: FilterCadrCalibration;
};

export function estimatePcCadr(input: PcCadrInput): CadrEstimate {
  const { group, nFans, nFilters, filter, q0_m3h, p0_mm, noiseDb, currentA, arctic } = input;
  const buildEff = input.buildEfficiency ?? DEFAULT_BUILD_EFFICIENCY;
  // A matched stock filter can pin its own resistance, efficiency and area model; an
  // unknown/custom size falls back to the MERV-13 furnace baseline (res 1).
  const res = input.calibration?.res ?? 1;
  const eff = input.calibration?.eff ?? MERV13_EFF;
  const curve = input.calibration?.curve ?? FILTER;
  const totalAreaFt2 = effAreaFt2(filter, input.calibration?.area ?? "furnace") * nFilters;
  const currentTotal = nFans * currentA;
  const noiseDbA = nFans > 0 && Number.isFinite(noiseDb) ? realPerFanSPL(noiseDb, arctic) + 10 * Math.log10(nFans) + DIST_3FT_TO_1M : null;

  const noiseRawDbA = nFans > 0 && Number.isFinite(noiseDb) ? noiseDb + 10 * Math.log10(nFans) : null;

  if (nFans <= 0 || nFilters <= 0 || totalAreaFt2 <= 0 || !(q0_m3h > 0) || !(p0_mm > 0)) {
    return { ...EMPTY_PC, fanCount: nFans, noiseDbA, currentA: currentTotal, powerW: currentTotal * VOLTAGE_PC, noiseRawDbA };
  }

  const q0cfm = q0_m3h * CFM_PER_M3H;
  const op = solve({ q0cfm, p0mm: p0_mm, shape: FAN_SHAPE[group], nFans, totalAreaFt2, res, grill: input.grill, curve });
  const flowCfm = op.cfm * buildEff;
  const cadrCfm = flowCfm * eff;
  return {
    cadrCfm,
    cadrM3h: cadrCfm * M3H_PER_CFM,
    flowM3h: flowCfm * M3H_PER_CFM,
    fanCount: nFans,
    noiseDbA,
    currentA: currentTotal,
    powerW: currentTotal * VOLTAGE_PC,
    voltage: VOLTAGE_PC,
    ach: null,
    roomLabel: "",
    fanModelId: "",
    faceVelocityMs: faceVelFPM(op.dpIn, res, curve) * FPM_TO_MS,
    pressureDropPa: op.dpIn * PA_PER_INH2O,
    filterEfficiency: eff,
    efficiencyBreakdown: efficiencyBreakdownFor(input.calibration),
    filterClass: input.calibration?.cls ?? "MERV-13",
    noiseRawDbA,
  };
}

export type BoxCadrCustom = {
  readonly q0_m3h: number;
  readonly p0_mm: number;
  readonly noiseDb: number; // 0 / non-finite => unknown
  readonly watts: number; // 0 / non-finite => unknown
};

export type BoxCadrInput = {
  readonly nFilters: number;
  readonly filter: FilterDims;
  readonly speed: 0 | 1 | 2;
  readonly shroud: boolean;
  // Exactly one of preset / custom is used.
  readonly preset?: BoxFanModel;
  readonly custom?: BoxCadrCustom;
  readonly calibration?: FilterCadrCalibration;
};

export function estimateBoxCadr(input: BoxCadrInput): CadrEstimate {
  const { nFilters, filter, speed, shroud, preset, custom, calibration } = input;
  const effW = cubeEff(filter, calibration);
  const res = calibration?.res ?? 1;
  const curve = calibration?.curve ?? FILTER;
  // Physical frontal media area (for face velocity and the custom-fan solve); the
  // preset power-law uses the resistance-eased hydraulic area (cubeArea) instead.
  const area = effAreaFt2(filter, calibration?.area ?? "furnace") * nFilters;
  let airflowCfm = 0;
  let noiseDbA: number | null = null;
  let noiseRawDbA: number | null = null;
  let powerW: number | null = null;
  let currentA: number | null = null;

  if (preset !== undefined) {
    airflowCfm = cubeAirflow(preset, speed, cubeArea(filter, nFilters, calibration), shroud);
    noiseRawDbA = preset.noise[speed];
    noiseDbA = preset.noise[speed] + DIST_3FT_TO_1M;
    powerW = preset.watts[speed];
    currentA = powerW / VOLTAGE_MAINS;
  } else if (custom !== undefined && custom.q0_m3h > 0 && custom.p0_mm > 0) {
    const op = solve({ q0cfm: custom.q0_m3h * CFM_PER_M3H, p0mm: custom.p0_mm, shape: FAN_SHAPE["140"], nFans: 1, totalAreaFt2: area, res, curve });
    airflowCfm = op.cfm;
    const hasNoise = Number.isFinite(custom.noiseDb) && custom.noiseDb > 0;
    noiseRawDbA = hasNoise ? custom.noiseDb : null;
    noiseDbA = hasNoise ? custom.noiseDb + DIST_3FT_TO_1M : null;
    powerW = Number.isFinite(custom.watts) && custom.watts > 0 ? custom.watts : null;
    currentA = powerW === null ? null : powerW / VOLTAGE_MAINS;
  }

  const faceVelFpm = area > 0 ? airflowCfm / area : 0;
  const cadrCfm = airflowCfm * effW;
  return {
    cadrCfm,
    cadrM3h: cadrCfm * M3H_PER_CFM,
    flowM3h: airflowCfm * M3H_PER_CFM,
    fanCount: 1,
    noiseDbA,
    currentA,
    powerW,
    voltage: VOLTAGE_MAINS,
    ach: null,
    roomLabel: "",
    fanModelId: "",
    faceVelocityMs: faceVelFpm * FPM_TO_MS,
    pressureDropPa: res * (curve.A * faceVelFpm * faceVelFpm + curve.B * faceVelFpm) * PA_PER_INH2O,
    filterEfficiency: effW,
    efficiencyBreakdown: calibration?.cls !== undefined ? [{ label: calibration.cls, value: effW }] : [],
    filterClass: calibration?.cls ?? "MERV-13",
    noiseRawDbA,
  };
}

export const cadrInternals = { effAreaFt2, solve, cubeAirflow, MERV13_EFF, PA_PER_INH2O };
