import { describe, expect, test } from "bun:test";
import {
  decodeWorkbenchState,
  encodeWorkbenchState,
  fabricationMethodForWorkbenchState,
  previewModeForWorkbenchState,
  printVolumePresetIdForWorkbenchState,
} from "@/app/workbench/workbenchState";

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
    expect(encoded.get("controlsTab")).toBe("setup");
    expect(encoded.get("printVolume")).toBe("bed-h2-safe");
    expect(encoded.has("exportFormat")).toBe(false);
  });

  test("keeps new workflow tabs stable in shared URLs", () => {
    const state = decodeWorkbenchState(new URLSearchParams("controlsTab=parts"));
    const encoded = encodeWorkbenchState(state);

    expect(encoded.get("controlsTab")).toBe("parts");
  });

  test("maps old build tab to the new design step", () => {
    const state = decodeWorkbenchState(new URLSearchParams("controlsTab=build"));
    const encoded = encodeWorkbenchState(state);

    expect(encoded.get("controlsTab")).toBe("design");
  });

  test("maps removed export tab to print setup", () => {
    const state = decodeWorkbenchState(new URLSearchParams("controlsTab=export"));
    const encoded = encodeWorkbenchState(state);

    expect(encoded.get("controlsTab")).toBe("setup");
  });

  test("omits print volume for laser fabrication", () => {
    const state = decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg&printVolume=bed-180"));
    const encoded = encodeWorkbenchState(state);

    expect(fabricationMethodForWorkbenchState(state)).toBe("laser-svg");
    expect(encoded.has("printVolume")).toBe(false);
  });
});
