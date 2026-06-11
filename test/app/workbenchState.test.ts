import { describe, expect, test } from "bun:test";
import {
  decodeWorkbenchState,
  encodeWorkbenchState,
  fabricationMethodForWorkbenchState,
  previewModeForWorkbenchState,
  printVolumePresetIdForWorkbenchState,
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

  test("normalizes laser sessions back to the laser-capable Nukit design", () => {
    const session = normalizeWorkbenchSession(
      applyPrintDesignPreset(defaultSettings, "static-cr-14x20-base"),
      decodeWorkbenchState(new URLSearchParams("fabricationMethod=laser-svg&previewMode=print-sheets&printDesign=static-cr-14x20-base")),
    );

    expect(session.settings.design.printDesign).toBe("nukit-open-air");
    expect(fabricationMethodForWorkbenchState(session.workbenchState)).toBe("laser-svg");
    expect(previewModeForWorkbenchState(session.workbenchState)).toBe("cut-sheet");
  });

  test("keeps the active preset aligned with the laser design context before session normalization", () => {
    const viewModel = createWorkbenchViewModel(
      applyPrintDesignPreset(defaultSettings, "static-cr-14x20-base"),
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

  test("models static references with local plates as static print-sheet previews", () => {
    const viewModel = createWorkbenchViewModel(
      applyPrintDesignPreset(defaultSettings, "static-cr-14x20-base"),
      decodeWorkbenchState(new URLSearchParams("fabricationMethod=print-3mf&previewMode=print-sheets")),
    );

    expect(viewModel.design.type).toBe("static-reference");
    if (viewModel.design.type !== "static-reference" || viewModel.fabricationPreview.type !== "print-sheets") {
      throw new Error("expected a static reference with print-sheet preview");
    }

    expect(viewModel.design.preset.id).toBe("static-cr-14x20-base");
    expect(viewModel.design.reference.printablesId).toBe("955827");
    expect(viewModel.design.platePreview).toEqual({ type: "available" });
    expect(viewModel.fabricationPreview.source).toBe("static-reference");
    if (viewModel.fabricationPreview.source !== "static-reference") {
      throw new Error("expected a static reference print-sheet source");
    }
    expect(viewModel.fabricationPreview.reference.printablesId).toBe("955827");
    expect(viewModel.controlPanels.setup).toEqual({ type: "available" });
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
