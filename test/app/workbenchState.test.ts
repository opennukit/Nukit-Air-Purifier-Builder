import { describe, expect, test } from "bun:test";
import {
  decodeWorkbenchState,
  encodeWorkbenchState,
  fabricationMethodForWorkbenchState,
  previewModeForWorkbenchState,
  printVolumePresetIdForWorkbenchState,
  withFabricationMethod,
  withPreviewMode,
  withPrintVolumePreset,
} from "@/app/workbench/workbenchState";
import {
  createWorkbenchViewModel,
  normalizeWorkbenchSession,
  normalizeWorkbenchStateForSettings,
} from "@/app/workbench/workbenchViewModel";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/settingsModel";

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
      new URLSearchParams("exportFormat=print-3mf&printVolume=bed-320"),
    );
    const encoded = encodeWorkbenchState(state);

    expect(encoded.get("fabricationMethod")).toBe("print-3mf");
    expect(encoded.get("printVolume")).toBe("bed-h2-safe");
    expect(encoded.has("exportFormat")).toBe(false);
  });

  test("drops the removed controls tab URL param", () => {
    const state = decodeWorkbenchState(new URLSearchParams("controlsTab=advanced"));
    const encoded = encodeWorkbenchState(state);

    expect(encoded.has("controlsTab")).toBe(false);
  });

  test("omits print volume for laser fabrication", () => {
    const state = decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg&printVolume=bed-180"));
    const encoded = encodeWorkbenchState(state);

    expect(fabricationMethodForWorkbenchState(state)).toBe("laser-svg");
    expect(encoded.has("printVolume")).toBe(false);
  });

  test("switching to the enclosure preview keeps the fabrication choice intact", () => {
    const printState = decodeWorkbenchState(new URLSearchParams("fabricationMethod=print-3mf&printVolume=bed-180&previewMode=print-sheets"));
    const enclosureState = withPreviewMode(printState, "enclosure");

    expect(previewModeForWorkbenchState(enclosureState)).toBe("enclosure");
    expect(fabricationMethodForWorkbenchState(enclosureState)).toBe("print-3mf");
    expect(printVolumePresetIdForWorkbenchState(enclosureState)).toBe("bed-180");
  });

  test("switching to a fabrication preview adopts that preview's method", () => {
    const printState = decodeWorkbenchState(new URLSearchParams("fabricationMethod=print-3mf&printVolume=bed-180"));
    const cutSheetState = withPreviewMode(printState, "cut-sheet");

    expect(previewModeForWorkbenchState(cutSheetState)).toBe("cut-sheet");
    expect(fabricationMethodForWorkbenchState(cutSheetState)).toBe("laser-svg");

    const backToPrint = withPreviewMode(cutSheetState, "print-sheets");
    expect(previewModeForWorkbenchState(backToPrint)).toBe("print-sheets");
    expect(fabricationMethodForWorkbenchState(backToPrint)).toBe("print-3mf");
  });

  test("changing the fabrication method keeps the current print volume preset", () => {
    const printState = decodeWorkbenchState(new URLSearchParams("fabricationMethod=print-3mf&printVolume=bed-180&previewMode=print-sheets"));
    const samePresetState = withFabricationMethod(printState, "print-3mf");

    expect(printVolumePresetIdForWorkbenchState(samePresetState)).toBe("bed-180");

    const laserState = withFabricationMethod(printState, "laser-svg");
    expect(fabricationMethodForWorkbenchState(laserState)).toBe("laser-svg");
    expect(previewModeForWorkbenchState(laserState)).toBe("cut-sheet");
  });

  test("choosing a print volume switches laser fabrication over to printing", () => {
    const laserState = decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg&previewMode=cut-sheet"));
    const printState = withPrintVolumePreset(laserState, "bed-350");

    expect(fabricationMethodForWorkbenchState(printState)).toBe("print-3mf");
    expect(printVolumePresetIdForWorkbenchState(printState)).toBe("bed-350");

    const repicked = withPrintVolumePreset(printState, "unsplit");
    expect(printVolumePresetIdForWorkbenchState(repicked)).toBe("unsplit");
  });

  test("encode and decode round-trip every reachable state", () => {
    const states = [
      decodeWorkbenchState(new URLSearchParams("")),
      decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg&previewMode=cut-sheet")),
      withPrintVolumePreset(
        withPreviewMode(decodeWorkbenchState(new URLSearchParams("")), "print-sheets"),
        "bed-420",
      ),
    ];

    for (const state of states) {
      const roundTripped = decodeWorkbenchState(encodeWorkbenchState(state));
      expect(roundTripped).toEqual(state);
    }
  });

  test("normalizes laser sessions back to the laser-capable Nukit design", () => {
    const session = normalizeWorkbenchSession(
      applyPrintDesignPreset(defaultSettings, "static-modular-20x20-reference"),
      decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg&previewMode=print-sheets&printDesign=static-modular-20x20-reference")),
    );

    expect(session.settings.design.printDesign).toBe("nukit-open-air");
    expect(fabricationMethodForWorkbenchState(session.workbenchState)).toBe("laser-svg");
    expect(previewModeForWorkbenchState(session.workbenchState)).toBe("cut-sheet");
  });

  test("keeps the active preset aligned with the laser design context before session normalization", () => {
    const viewModel = createWorkbenchViewModel(
      applyPrintDesignPreset(defaultSettings, "static-modular-20x20-reference"),
      decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg")),
    );

    expect(viewModel.design.type).toBe("nukit");
    expect(viewModel.printDesignPreset.id).toBe("nukit-open-air");
    expect(viewModel.printDesignPreset.id).toBe(viewModel.design.preset.id);
  });

  test("normalizes 3D print sessions away from the laser-cut Nukit design", () => {
    const session = normalizeWorkbenchSession(
      applyPrintDesignPreset(defaultSettings, "nukit-open-air"),
      decodeWorkbenchState(new URLSearchParams("fabricationMethod=print-3mf&printDesign=nukit-open-air")),
    );

    expect(session.settings.design.printDesign).toBe("nukit-tempest");
    expect(session.settings.design.type).toBe("tempest");
    expect(fabricationMethodForWorkbenchState(session.workbenchState)).toBe("print-3mf");
  });

  test("models generated 3D print designs as generated print-sheet previews", () => {
    const viewModel = createWorkbenchViewModel(
      applyPrintDesignPreset(defaultSettings, "nukit-tempest"),
      decodeWorkbenchState(new URLSearchParams("fabricationMethod=print-3mf&previewMode=print-sheets")),
    );

    expect(viewModel.design.type).toBe("tempest");
    expect(viewModel.fabricationPreview).toEqual({ type: "print-sheets", source: "generated" });
    expect(viewModel.controlPanels.setup).toEqual({ type: "available" });
    expect(viewModel.controlPanels.advanced).toEqual({ type: "hidden", reason: "not-supported-by-design" });
  });

  test("models static references without local plates as source-only", () => {
    const settings = applyPrintDesignPreset(defaultSettings, "static-modular-20x20-reference");
    const state = decodeWorkbenchState(
      new URLSearchParams("fabricationMethod=print-3mf&previewMode=print-sheets"),
    );
    const viewModel = createWorkbenchViewModel(settings, state);
    const normalizedState = normalizeWorkbenchStateForSettings(state, settings);

    expect(viewModel.design.type).toBe("static-reference");
    if (viewModel.design.type !== "static-reference" || viewModel.fabricationPreview.type !== "unavailable") {
      throw new Error("expected a source-only static reference");
    }

    expect(viewModel.design.preset.id).toBe("static-modular-20x20-reference");
    expect(viewModel.design.reference.printablesId).toBe("610219");
    expect(viewModel.design.platePreview).toEqual({
      type: "unavailable",
      reason: "no-local-print-plate-preview",
    });
    expect(viewModel.fabricationPreview.reason).toBe("static-reference-without-plate-preview");
    expect(viewModel.controlPanels.setup).toEqual({
      type: "hidden",
      reason: "static-reference-without-plate-preview",
    });
    expect(previewModeForWorkbenchState(normalizedState)).toBe("enclosure");
  });
});
