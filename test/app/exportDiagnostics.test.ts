import { describe, expect, test } from "bun:test";
import { evaluateActiveExportDiagnostics, summarizeActiveBuildReadiness } from "@/app/diagnostics";
import { exportBlockingDiagnostics } from "@/fabrication/buildDiagnostics";
import { createLayout } from "@/fabrication/purifierLayout";
import {
  createPrintableSheetPlanFromKit,
  findPrintVolumePreset,
  type PrintableKit,
  type PrintableKitSummary,
} from "@/fabrication/printing/printableKit";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/settingsModel";

// #######################################
// Export Diagnostics Severity
// #######################################

const cleanKitSummary: PrintableKitSummary = {
  partCount: 4,
  oversizedPartCount: 0,
};

function kitWithSummary(summary: PrintableKitSummary): PrintableKit {
  return { preset: findPrintVolumePreset("bed-256"), parts: [], summary };
}

describe("export diagnostics severity", () => {
  test("advisories warn but do not block export", () => {
    const noSideFanLayout = createLayout({ ...defaultSettings, fansLeft: 0, fansRight: 0, fansTop: 2, fansBottom: 2 });
    const diagnostics = evaluateActiveExportDiagnostics(noSideFanLayout, "laser-svg", null);

    expect(diagnostics.map((diagnostic) => diagnostic.id)).toContain("no-side-fans");
    expect(diagnostics.every((diagnostic) => diagnostic.severity === "warning")).toBe(true);
    expect(exportBlockingDiagnostics(diagnostics)).toEqual([]);

    const summary = summarizeActiveBuildReadiness(noSideFanLayout, diagnostics, "laser-svg");
    expect(summary.severity).toBe("warning");
    expect(summary.title).toBe(`${diagnostics.length} advisor${diagnostics.length === 1 ? "y" : "ies"}`);
  });

  test("oversized print parts block export", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const plan = createPrintableSheetPlanFromKit(kitWithSummary({ ...cleanKitSummary, oversizedPartCount: 1 }));
    const diagnostics = evaluateActiveExportDiagnostics(tempestLayout, "print-3mf", plan);
    const oversized = diagnostics.find((diagnostic) => diagnostic.id === "oversized-print-part");

    expect(oversized?.severity).toBe("error");
    expect(exportBlockingDiagnostics(diagnostics).map((diagnostic) => diagnostic.id)).toEqual(["oversized-print-part"]);

    const summary = summarizeActiveBuildReadiness(tempestLayout, diagnostics, "print-3mf");
    expect(summary.severity).toBe("error");
    expect(summary.title).toBe("1 issue blocks export");
  });

  test("a clean layout summarizes as ready to export", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const plan = createPrintableSheetPlanFromKit(kitWithSummary(cleanKitSummary));
    const diagnostics = evaluateActiveExportDiagnostics(tempestLayout, "print-3mf", plan);

    expect(diagnostics).toEqual([]);

    const summary = summarizeActiveBuildReadiness(tempestLayout, diagnostics, "print-3mf");
    expect(summary.severity).toBe("info");
    expect(summary.title).toBe("Ready to export");
  });

  test("static reference designs skip generated-build diagnostics and read as ready to open files", () => {
    const staticLayout = createLayout(applyPrintDesignPreset(defaultSettings, "static-cr-14x20-base"));
    const diagnostics = evaluateActiveExportDiagnostics(staticLayout, "print-3mf", null);

    expect(diagnostics).toEqual([]);

    const summary = summarizeActiveBuildReadiness(staticLayout, diagnostics, "print-3mf");
    expect(summary.severity).toBe("info");
    expect(summary.title).toBe("Ready to open files");
  });

  test("a still-building plan adds no print blockers", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const withoutPlan = evaluateActiveExportDiagnostics(tempestLayout, "print-3mf", null);
    const withCleanPlan = evaluateActiveExportDiagnostics(
      tempestLayout,
      "print-3mf",
      createPrintableSheetPlanFromKit(kitWithSummary(cleanKitSummary)),
    );

    expect(withoutPlan).toEqual(withCleanPlan);
    expect(withoutPlan.some((diagnostic) => diagnostic.id === "oversized-print-part")).toBe(false);
  });

  test("surfaces the filter dimension advisory for generated print designs", () => {
    const unusualTempestLayout = createLayout({
      ...applyPrintDesignPreset(defaultSettings, "nukit-tempest"),
      filterWidth: 130,
      filterDepth: 130,
      filterThickness: 10,
    });
    const diagnostics = evaluateActiveExportDiagnostics(unusualTempestLayout, "print-3mf", null);
    const dimensionAdvisory = diagnostics.find((diagnostic) => diagnostic.id === "filter-dimension-range");

    expect(dimensionAdvisory?.severity).toBe("warning");
    expect(exportBlockingDiagnostics(diagnostics)).toEqual([]);
    expect(summarizeActiveBuildReadiness(unusualTempestLayout, diagnostics, "print-3mf").severity).toBe("warning");
  });
});
