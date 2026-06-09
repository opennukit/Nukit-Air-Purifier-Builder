// Readers that parse DOM change events from workbench form controls into
// domain values (preset ids, numbers, booleans), falling back to defaults
// when the raw input is not a valid value.

import {
  defaultThreeDimensionalPrintDesignId,
  publicThreeDimensionalPrintDesignPresets,
  type PrintDesignId,
} from "@/domain/purifier/designPresets";
import { automaticFanCount, fanProductPresets, type FanProductPresetId } from "@/domain/purifier/fanProducts";
import { defaultSettings } from "@/domain/purifier/settingsModel";

export function readFanProductPresetControlValue(event: Event): FanProductPresetId {
  const preset = fanProductPresets.find((entry) => entry.id === requireSelect(event, "readFanProductPresetControlValue").value);
  return preset?.id ?? defaultSettings.fanPreset;
}

export function readPrintDesignControlValue(event: Event): PrintDesignId {
  const preset = publicThreeDimensionalPrintDesignPresets.find(
    (entry) => entry.id === requireSelect(event, "readPrintDesignControlValue").value,
  );
  return preset?.id ?? defaultThreeDimensionalPrintDesignId;
}

export function readFanCountControlValue(event: Event): number {
  const parsed = Number(requireSelect(event, "readFanCountControlValue").value);
  return Number.isFinite(parsed) ? parsed : automaticFanCount;
}

export function readNumberInput(event: Event, fallback: number): number {
  const value = requireInputOrSelect(event, "readNumberInput").value.trim();
  if (value.length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readCheckboxInput(event: Event): boolean {
  const input = requireInput(event, "readCheckboxInput");
  return input.checked;
}

export function requireSelect(event: Event, context: string): HTMLSelectElement {
  const target = event.currentTarget;
  if (!(target instanceof HTMLSelectElement)) {
    throw new Error(`${context}: Expected select event target`);
  }
  return target;
}

function requireInput(event: Event, context: string): HTMLInputElement {
  const target = event.currentTarget;
  if (!(target instanceof HTMLInputElement)) {
    throw new Error(`${context}: Expected input event target`);
  }
  return target;
}

function requireInputOrSelect(event: Event, context: string): HTMLInputElement | HTMLSelectElement {
  const target = event.currentTarget;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    throw new Error(`${context}: Expected input or select event target`);
  }
  return target;
}
