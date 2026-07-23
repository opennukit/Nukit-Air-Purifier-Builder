// Compact share-link codec.
//
// Packs the full set of share params (everything encodeSettings + the workbench
// state emit) into a small versioned binary blob, base64url-encoded, carried in a
// single `d` query param. This keeps shared links short without any server or
// database.
//
// Design notes:
//   * Round-trip by reconstruction. decodeShareToken rebuilds the exact canonical
//     query string that encodeShareState would have produced, then the existing
//     decodeSettings / decodeWorkbenchState parsers run unchanged. The binary form
//     is purely transport, so decoding behavior is identical to a full URL and can
//     never drift from the parser.
//   * Forward-proof. Every field is stored explicitly (never "omit if default"), so
//     changing a default later cannot alter an already-shared link.
//   * Backwards compatible. Old long links have no `d` param and take the legacy
//     path untouched.
//   * Enum tables below are APPEND-ONLY: never reorder or remove entries. New enum
//     values do not require a table edit; anything not in the table is stored as a
//     length-prefixed string via the escape (index 0), so it still round-trips.
//   * Bump SHARE_TOKEN_VERSION only for an incompatible format change, and keep a
//     decoder for each old version.

import {
  isTempestPrintDesignId,
  type PrintDesignId,
} from "@/domain/purifier/designPresets";
import { defaultSettings } from "@/domain/purifier/settingsModel";

const SHARE_TOKEN_VERSION = 1;

// ##############################
// Field schema
// ##############################

type EnumTable = readonly string[];

type FieldType =
  | { readonly kind: "num" }
  | { readonly kind: "bool" }
  | { readonly kind: "str" }
  | { readonly kind: "enum"; readonly table: EnumTable };

type Field = {
  readonly key: string;
  readonly type: FieldType;
  // Only emitted to the reconstructed query string when this predicate passes,
  // mirroring the conditional writes in encodeSettings / encodeWorkbenchState.
  readonly emitWhen?: (ctx: EmitContext) => boolean;
};

type EmitContext = {
  readonly printDesign: string;
  readonly fabricationMethod: string;
};

const num = (): FieldType => ({ kind: "num" });
const bool = (): FieldType => ({ kind: "bool" });
const str = (): FieldType => ({ kind: "str" });
const enm = (table: EnumTable): FieldType => ({ kind: "enum", table });

// APPEND-ONLY enum tables (see header). Copied from the option lists; unknown
// values fall back to the string escape, so these never strictly need updating.
const FAN_COLOR: EnumTable = ["black", "beige"];
const ROOM_UNIT: EnumTable = ["ft", "m"];
const CAMERA: EnumTable = ["official", "front", "side", "top"];
const TOP_EXHAUST: EnumTable = ["fan-grid", "box-exhaust"];
const CUT_STYLE: EnumTable = ["laser", "hand"];
const CORD_WALL: EnumTable = ["none", "front", "back", "left", "right"];
const CORD_SIDE: EnumTable = ["left", "center", "right"];
const SLOT_WALL: EnumTable = ["front", "back", "left", "right"];
const ARRANGEMENT: EnumTable = [
  "single-horizontal-top-filter",
  "dual-horizontal-sandwich",
  "four-side-filter-tower",
];
const PREVIEW_MODE: EnumTable = ["enclosure", "cut-sheet", "print-sheets"];
const FAB_METHOD: EnumTable = ["laser-svg", "hand-svg", "print-3mf"];
const PRINT_DESIGN: EnumTable = [
  "nukit-open-air",
  "nukit-tempest",
  "donut-hepa-adapter",
];

const isTempest = (ctx: EmitContext): boolean =>
  isTempestPrintDesignId(ctx.printDesign as PrintDesignId);
const isPrint3mf = (ctx: EmitContext): boolean =>
  ctx.fabricationMethod === "print-3mf";

// The ordered schema. Order is positional and must stay stable within a version;
// it does not need to match the query-string order. Coverage of every emitted key
// is asserted by shareTokenSchemaKeys() + tests.
const SCHEMA: readonly Field[] = [
  { key: "printDesign", type: enm(PRINT_DESIGN) },
  { key: "filterWidth", type: num() },
  { key: "filterDepth", type: num() },
  { key: "filterThickness", type: num() },
  { key: "rim", type: num() },
  { key: "fanColor", type: enm(FAN_COLOR) },
  { key: "fanDiameter", type: num() },
  { key: "fanModel", type: str() },
  { key: "customFanAirflow", type: num() },
  { key: "customFanPressure", type: num() },
  { key: "customFanNoise", type: num() },
  { key: "customFanCurrent", type: num() },
  { key: "customFanWatts", type: num() },
  { key: "roomUnit", type: enm(ROOM_UNIT) },
  { key: "roomWidth", type: num() },
  { key: "roomLength", type: num() },
  { key: "roomHeight", type: num() },
  { key: "baselineAch", type: num() },
  { key: "electricityPrice", type: num() },
  { key: "currencySymbol", type: str() },
  { key: "filters", type: num(), emitWhen: (c) => !isTempest(c) },
  { key: "splitFrames", type: bool(), emitWhen: (c) => !isTempest(c) },
  { key: "cutStyle", type: enm(CUT_STYLE), emitWhen: (c) => !isTempest(c) },
  { key: "fansLeft", type: num() },
  { key: "fansRight", type: num() },
  { key: "fansTop", type: num() },
  { key: "fansBottom", type: num() },
  { key: "tempestArrangement", type: enm(ARRANGEMENT) },
  { key: "tempestDesign", type: str() },
  { key: "filterSlotWall", type: enm(SLOT_WALL) },
  { key: "filterFitClearance", type: num() },
  { key: "cordHoleDiameter", type: num() },
  { key: "cordHoleWall", type: enm(CORD_WALL) },
  { key: "cordHoleSide", type: enm(CORD_SIDE) },
  { key: "cordHoleCornerOffset", type: num() },
  { key: "outsideFlangeThickness", type: num() },
  { key: "chunkLabels", type: bool() },
  { key: "hexGrill", type: bool() },
  { key: "hexSize", type: num() },
  { key: "hexSpacing", type: num() },
  { key: "hexFullCellsOnly", type: bool() },
  { key: "backPlateFans", type: num() },
  { key: "boxDepth", type: num() },
  { key: "alignmentPinDiameter", type: num() },
  { key: "bottomFilter", type: bool() },
  { key: "feetLength", type: num() },
  { key: "topExhaust", type: enm(TOP_EXHAUST) },
  { key: "boxFanHoleSize", type: num() },
  { key: "boxRingOneScrewHoles", type: num() },
  { key: "boxRingOneScrewDiameter", type: num() },
  { key: "boxRingOneDiameter", type: num() },
  { key: "boxRingTwoScrewHoles", type: num() },
  { key: "boxRingTwoScrewDiameter", type: num() },
  { key: "boxRingTwoDiameter", type: num() },
  { key: "donutFilterOuterDiameter", type: num() },
  { key: "donutFilterLength", type: num() },
  { key: "donutFilterHoleDiameter", type: num() },
  { key: "donutAdapterInsertLength", type: num() },
  { key: "donutCapRim", type: num() },
  { key: "donutCapEnabled", type: bool() },
  { key: "screwHoleDiameter", type: num() },
  { key: "materialThickness", type: num() },
  { key: "kerfFit", type: num() },
  { key: "fingerWidthMultiplier", type: num() },
  { key: "fingerSpaceMultiplier", type: num() },
  { key: "fingerPlayMultiplier", type: num() },
  { key: "fingerHoleWidthMultiplier", type: num() },
  { key: "fingerHoleOffsetMultiplier", type: num() },
  { key: "dovetailSizeMultiplier", type: num() },
  { key: "dovetailDepthMultiplier", type: num() },
  { key: "dovetailTaper", type: num() },
  { key: "showFilterMedia", type: bool() },
  { key: "showFans", type: bool() },
  { key: "showFilterFrame", type: bool() },
  { key: "explodedView", type: bool() },
  { key: "showDimensions", type: bool() },
  { key: "showBananaScale", type: bool() },
  { key: "showPreviewEdges", type: bool() },
  { key: "previewMaterialColor", type: str() },
  { key: "autoRotate", type: bool() },
  { key: "cameraPreset", type: enm(CAMERA) },
  { key: "labels", type: bool() },
  { key: "referenceScale", type: num() },
  { key: "previewMode", type: enm(PREVIEW_MODE) },
  { key: "fabricationMethod", type: enm(FAB_METHOD) },
  { key: "printVolume", type: str(), emitWhen: isPrint3mf },
];

// Fallback string values for optional fields that may be absent from the source
// query (they are stored anyway so the schema stays fixed-width). The exact value
// does not matter because emitWhen suppresses them on decode for those cases.
const FALLBACKS: Record<string, string> = {
  filters: String(defaultSettings.filters),
  splitFrames: String(defaultSettings.splitFrames),
  cutStyle: defaultSettings.cutStyle,
  printVolume: "bed-256",
};

// Exposed for the schema-coverage test.
export function shareTokenSchemaKeys(): readonly string[] {
  return SCHEMA.map((field) => field.key);
}

// ##############################
// Public API
// ##############################

// Encode a canonical share query string (as produced by encodeShareState) into a
// compact base64url token.
export function encodeShareToken(query: string): string {
  const params = new URLSearchParams(query);
  const w = new ByteWriter();
  w.u8(SHARE_TOKEN_VERSION);
  for (const field of SCHEMA) {
    const raw = params.get(field.key) ?? FALLBACKS[field.key] ?? "";
    writeField(w, field.type, raw);
  }
  return bytesToBase64Url(w.done());
}

// Decode a token back into the canonical query string. Throws on a malformed or
// unknown-version token; callers should treat a throw as "fall back to defaults".
export function decodeShareToken(token: string): string {
  const r = new ByteReader(base64UrlToBytes(token));
  const version = r.u8();
  if (version !== SHARE_TOKEN_VERSION) {
    throw new Error(`Unsupported share token version: ${version}`);
  }
  const values: Record<string, string> = {};
  for (const field of SCHEMA) {
    values[field.key] = readField(r, field.type);
  }
  const ctx: EmitContext = {
    printDesign: values.printDesign ?? "",
    fabricationMethod: values.fabricationMethod ?? "",
  };
  const out = new URLSearchParams();
  for (const field of SCHEMA) {
    if (field.emitWhen && !field.emitWhen(ctx)) {
      continue;
    }
    out.set(field.key, values[field.key] ?? "");
  }
  return out.toString();
}

// ##############################
// Field codecs
// ##############################

function writeField(w: ByteWriter, type: FieldType, raw: string): void {
  switch (type.kind) {
    case "num":
      w.varint(zigzag(Math.round(toNumber(raw) * 10000)));
      return;
    case "bool":
      w.u8(raw === "true" ? 1 : 0);
      return;
    case "str":
      w.str(raw);
      return;
    case "enum": {
      const index = type.table.indexOf(raw);
      if (index >= 0 && index < 255) {
        w.u8(index + 1);
      } else {
        w.u8(0);
        w.str(raw);
      }
      return;
    }
  }
}

function readField(r: ByteReader, type: FieldType): string {
  switch (type.kind) {
    case "num":
      return formatNumber(unzigzag(r.varint()) / 10000);
    case "bool":
      return r.u8() === 1 ? "true" : "false";
    case "str":
      return r.str();
    case "enum": {
      const tag = r.u8();
      if (tag === 0) {
        return r.str();
      }
      return type.table[tag - 1] ?? "";
    }
  }
}

function toNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// Matches settingsCodec.formatNumber so a decoded token reproduces the exact
// query-string values (round-trip identity).
function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

// ##############################
// Byte / varint / base64url primitives
// ##############################

function zigzag(n: number): number {
  return n < 0 ? -n * 2 - 1 : n * 2;
}

function unzigzag(n: number): number {
  return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
}

class ByteWriter {
  private readonly bytes: number[] = [];

  u8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  // Unsigned LEB128.
  varint(value: number): void {
    let v = value;
    while (v > 0x7f) {
      this.bytes.push((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    this.bytes.push(v & 0x7f);
  }

  str(value: string): void {
    const utf8 = new TextEncoder().encode(value);
    this.varint(utf8.length);
    for (const byte of utf8) {
      this.bytes.push(byte);
    }
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

class ByteReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    if (this.offset >= this.bytes.length) {
      throw new Error("share token: unexpected end of data");
    }
    return this.bytes[this.offset++];
  }

  varint(): number {
    let result = 0;
    let shift = 1;
    for (;;) {
      const byte = this.u8();
      result += (byte & 0x7f) * shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
      shift *= 128;
    }
  }

  str(): string {
    const length = this.varint();
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    if (slice.length !== length) {
      throw new Error("share token: string overruns data");
    }
    this.offset += length;
    return new TextDecoder().decode(slice);
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(token: string): Uint8Array {
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
