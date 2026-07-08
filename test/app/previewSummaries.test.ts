import { describe, expect, test } from "bun:test";
import { createPreviewSummaryItems } from "@/app/summaries";
import { createLayout } from "@/fabrication/purifierLayout";
import {
  createPrintableSheetPlanFromKit,
  findPrintVolumePreset,
  type PrintableKit,
} from "@/fabrication/printing/printableKit";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/settingsModel";

// #######################################
// Preview Summary Branches
// #######################################

const emptyTempestKit: PrintableKit = {
  preset: findPrintVolumePreset("bed-256"),
  parts: [],
  summary: { partCount: 0, oversizedPartCount: 0, materialVolumeMm3: 0 },
};

function valueFor(items: readonly { label: string; value: string }[], label: string): string | undefined {
  return items.find((item) => item.label === label)?.value;
}

describe("createPreviewSummaryItems", () => {
  test("print-sheets for a generated tempest reads plates, chunks, and bed off the plan", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const plan = createPrintableSheetPlanFromKit(emptyTempestKit);
    const items = createPreviewSummaryItems(tempestLayout, "print-sheets", "print-3mf", "bed-256", plan);

    expect(valueFor(items, "Print plates")).toBe(String(plan.sheets.length));
    expect(valueFor(items, "Print chunks")).toBe(String(emptyTempestKit.summary.partCount));
    expect(valueFor(items, "Bed")).toBe(findPrintVolumePreset("bed-256").label);
  });

  test("print-sheets without a plan yet shows pending placeholders", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const items = createPreviewSummaryItems(tempestLayout, "print-sheets", "print-3mf", "bed-256", null);

    expect(valueFor(items, "Print plates")).toBe("…");
    expect(valueFor(items, "Print chunks")).toBe("…");
    expect(valueFor(items, "Bed")).toBe("…");
  });

  test("print-sheets for a static reference describes the curated files, not a generated plan", () => {
    const staticLayout = createLayout(applyPrintDesignPreset(defaultSettings, "static-modular-20x20-reference"));
    const items = createPreviewSummaryItems(staticLayout, "print-sheets", "print-3mf", "bed-350", null);
    const labels = items.map((item) => item.label);

    expect(valueFor(items, "Bed")).toBe(findPrintVolumePreset("bed-350").label);
    expect(labels).toContain("Source STLs");
    expect(labels).toContain("License");
    expect(labels).not.toContain("Print plates");
  });

  test("the enclosure view of a tempest print shows the estimated-performance summary, Fans last", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const items = createPreviewSummaryItems(tempestLayout, "enclosure", "print-3mf", "bed-256", null);
    const labels = items.map((item) => item.label);

    expect(labels).toContain("CADR");
    expect(labels).toContain("ACH");
    expect(labels).toContain("Infection risk");
    expect(labels).toContain("Fans");
    // Fans moved to the end; the build-part count was dropped from this view.
    expect(labels[labels.length - 1]).toBe("Fans");
    expect(labels).not.toContain("Print chunks");
  });

  test("the cut-sheet drawing summarizes panels and the required sheet", () => {
    const laserLayout = createLayout(defaultSettings);
    const items = createPreviewSummaryItems(laserLayout, "cut-sheet", "laser-svg", "bed-256", null);

    if (laserLayout.summary.fabrication.type !== "cut-panel-source") {
      throw new Error("expected the laser layout to carry a cut sheet");
    }
    expect(valueFor(items, "Panels")).toBe(String(laserLayout.summary.fabrication.panelCount));
    expect(valueFor(items, "Sheet")).toBeDefined();
    expect(valueFor(items, "Fans")).toBeDefined();
  });
});
