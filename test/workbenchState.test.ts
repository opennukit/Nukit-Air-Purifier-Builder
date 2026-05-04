import { describe, expect, test } from "bun:test";
import {
  decodeWorkbenchState,
  encodeWorkbenchState,
  fabricationMethodForWorkbenchState,
  previewModeForWorkbenchState,
  printVolumePresetIdForWorkbenchState,
} from "../src/workbenchState";

describe("Workbench state", () => {
  test("decodes print-sheet preview as print fabrication", () => {
    const state = decodeWorkbenchState(new URLSearchParams("previewMode=print-sheets"));

    expect(previewModeForWorkbenchState(state)).toBe("print-sheets");
    expect(fabricationMethodForWorkbenchState(state)).toBe("print-3mf");
    expect(printVolumePresetIdForWorkbenchState(state)).toBe("bed-256");
  });

  test("lets explicit fabrication method win over conflicting preview params", () => {
    const state = decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg&previewMode=print-sheets"));

    expect(previewModeForWorkbenchState(state)).toBe("cut-sheet");
    expect(fabricationMethodForWorkbenchState(state)).toBe("laser-svg");
  });

  test("canonicalizes legacy URL params when encoding", () => {
    const state = decodeWorkbenchState(
      new URLSearchParams("exportFormat=print-3mf&controlsTab=cutting&printVolume=bed-320"),
    );
    const encoded = encodeWorkbenchState(state);

    expect(encoded.get("fabricationMethod")).toBe("print-3mf");
    expect(encoded.get("controlsTab")).toBe("fabrication");
    expect(encoded.get("printVolume")).toBe("bed-h2-safe");
    expect(encoded.has("exportFormat")).toBe(false);
  });

  test("omits print volume for laser fabrication", () => {
    const state = decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg&printVolume=bed-180"));
    const encoded = encodeWorkbenchState(state);

    expect(fabricationMethodForWorkbenchState(state)).toBe("laser-svg");
    expect(encoded.has("printVolume")).toBe(false);
  });
});
