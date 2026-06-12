import { z } from "zod";

import type { FilterCount } from "@/domain/purifier/designPresets";

// #######################################
// URL Param Field Parsing
// #######################################
//
// Parse-Don't-Validate at the one untrusted boundary: URL-param decoding of
// purifier settings. The hand-rolled read* helpers used to validate each field
// inline; here every primitive field is declared once with its constraint and
// the EXACT fallback it had before, so a parsed value carries its proof.
//
// Numbers, integers, booleans, and the 1-or-2 filter count are owned here. The
// preset/enum fields whose fallback depends on OTHER params (printDesign,
// fanColor, tempestArrangement, ...) stay in decodeSettings: their resolution
// is cross-field domain reconciliation, not per-field validation, so making a
// per-field schema depend on the whole preset vocabulary would invert Parnas'
// subset criteria (the general depending on the specific).
//
// The schema takes its fallbacks (values) from the caller rather than importing
// them, so it has no runtime dependency on the airPurifier module that owns
// defaultSettings; the only link is a type-only FilterCount import (erased).

// ##############################
// Primitive Coercions
// ##############################

// Mirrors readNumber: null / empty / whitespace -> absent; non-finite -> absent.
// "absent" becomes `undefined`, which lets `.default(...)` supply the fallback.
const rawNumberInput = (value: unknown): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const zNumberField = (fallback: number) =>
  z.preprocess(rawNumberInput, z.number().default(fallback));

const zIntegerField = (fallback: number) =>
  z.preprocess((value) => {
    const parsed = rawNumberInput(value);
    return parsed === undefined ? undefined : Math.trunc(parsed);
  }, z.number().default(fallback));

// Mirrors readBoolean: "true"/"1" -> true, "false"/"0" -> false, else fallback.
const zBooleanField = (fallback: boolean) =>
  z.preprocess((value) => {
    if (value === "true" || value === "1") {
      return true;
    }
    if (value === "false" || value === "0") {
      return false;
    }
    return undefined;
  }, z.boolean().default(fallback));

// Mirrors readFilterCount: numeric 1 or 2 -> that count, else fallback.
const zFilterCountField = (fallback: FilterCount) =>
  z.preprocess((value) => {
    const parsed = Number(value);
    return parsed === 1 || parsed === 2 ? (parsed as FilterCount) : undefined;
  }, z.union([z.literal(1), z.literal(2)]).default(fallback));

// ##############################
// Schema
// ##############################

// Per-field fallbacks, supplied by the caller (defaultSettings is the single
// source of truth). Every key here is a field the schema parses.
export type PurifierSettingsFieldFallbacks = {
  readonly filterWidth: number;
  readonly filterDepth: number;
  readonly filterThickness: number;
  readonly filterFitClearance: number;
  readonly cordHoleDiameter: number;
  readonly rim: number;
  readonly filters: FilterCount;
  readonly splitFrames: boolean;
  readonly fansLeft: number;
  readonly fansRight: number;
  readonly fansTop: number;
  readonly fansBottom: number;
  readonly donutFilterOuterDiameter: number;
  readonly donutFilterLength: number;
  readonly donutFilterHoleDiameter: number;
  readonly donutAdapterInsertLength: number;
  readonly donutCapRim: number;
  readonly donutCapEnabled: boolean;
  readonly screwHoleDiameter: number;
  readonly materialThickness: number;
  readonly kerfFit: number;
  readonly fingerWidthMultiplier: number;
  readonly fingerSpaceMultiplier: number;
  readonly fingerPlayMultiplier: number;
  readonly fingerHoleWidthMultiplier: number;
  readonly fingerHoleOffsetMultiplier: number;
  readonly dovetailSizeMultiplier: number;
  readonly dovetailDepthMultiplier: number;
  readonly dovetailTaper: number;
  readonly showFilterMedia: boolean;
  readonly showFans: boolean;
  readonly showFilterFrame: boolean;
  readonly explodedView: boolean;
  readonly showDimensions: boolean;
  readonly showBananaScale: boolean;
  readonly showPreviewEdges: boolean;
  readonly autoRotate: boolean;
  readonly labels: boolean;
  readonly referenceScale: number;
};

export const createPurifierSettingsFieldsSchema = (
  fallbacks: PurifierSettingsFieldFallbacks,
) =>
  // `satisfies` proves the hand-listed shape parses EVERY field the fallbacks
  // declare (and nothing extra). Without it, adding a field to
  // PurifierSettingsFieldFallbacks but forgetting it here would compile yet
  // silently drop that URL param at the boundary.
  z.object({
    filterWidth: zNumberField(fallbacks.filterWidth),
    filterDepth: zNumberField(fallbacks.filterDepth),
    filterThickness: zNumberField(fallbacks.filterThickness),
    filterFitClearance: zNumberField(fallbacks.filterFitClearance),
    cordHoleDiameter: zNumberField(fallbacks.cordHoleDiameter),
    rim: zNumberField(fallbacks.rim),
    filters: zFilterCountField(fallbacks.filters),
    splitFrames: zBooleanField(fallbacks.splitFrames),
    fansLeft: zIntegerField(fallbacks.fansLeft),
    fansRight: zIntegerField(fallbacks.fansRight),
    fansTop: zIntegerField(fallbacks.fansTop),
    fansBottom: zIntegerField(fallbacks.fansBottom),
    donutFilterOuterDiameter: zNumberField(fallbacks.donutFilterOuterDiameter),
    donutFilterLength: zNumberField(fallbacks.donutFilterLength),
    donutFilterHoleDiameter: zNumberField(fallbacks.donutFilterHoleDiameter),
    donutAdapterInsertLength: zNumberField(fallbacks.donutAdapterInsertLength),
    donutCapRim: zNumberField(fallbacks.donutCapRim),
    donutCapEnabled: zBooleanField(fallbacks.donutCapEnabled),
    screwHoleDiameter: zNumberField(fallbacks.screwHoleDiameter),
    materialThickness: zNumberField(fallbacks.materialThickness),
    kerfFit: zNumberField(fallbacks.kerfFit),
    fingerWidthMultiplier: zNumberField(fallbacks.fingerWidthMultiplier),
    fingerSpaceMultiplier: zNumberField(fallbacks.fingerSpaceMultiplier),
    fingerPlayMultiplier: zNumberField(fallbacks.fingerPlayMultiplier),
    fingerHoleWidthMultiplier: zNumberField(
      fallbacks.fingerHoleWidthMultiplier,
    ),
    fingerHoleOffsetMultiplier: zNumberField(
      fallbacks.fingerHoleOffsetMultiplier,
    ),
    dovetailSizeMultiplier: zNumberField(fallbacks.dovetailSizeMultiplier),
    dovetailDepthMultiplier: zNumberField(fallbacks.dovetailDepthMultiplier),
    dovetailTaper: zNumberField(fallbacks.dovetailTaper),
    showFilterMedia: zBooleanField(fallbacks.showFilterMedia),
    showFans: zBooleanField(fallbacks.showFans),
    showFilterFrame: zBooleanField(fallbacks.showFilterFrame),
    explodedView: zBooleanField(fallbacks.explodedView),
    showDimensions: zBooleanField(fallbacks.showDimensions),
    showBananaScale: zBooleanField(fallbacks.showBananaScale),
    showPreviewEdges: zBooleanField(fallbacks.showPreviewEdges),
    autoRotate: zBooleanField(fallbacks.autoRotate),
    labels: zBooleanField(fallbacks.labels),
    referenceScale: zNumberField(fallbacks.referenceScale),
  } satisfies { [K in keyof PurifierSettingsFieldFallbacks]: z.ZodType });

export type ParsedPurifierSettingsFields = z.infer<
  ReturnType<typeof createPurifierSettingsFieldsSchema>
>;

// One canonical raw string per field, keyed by canonical field name. `undefined`
// means absent (no matching URL param), letting the field fall back to default.
export type PurifierSettingsFieldInputs = Partial<
  Record<keyof PurifierSettingsFieldFallbacks, string>
>;
