// Evaluates the export checks shown in the workbench output panel: base build
// diagnostics, print-kit specific blockers, and the one-line readiness summary
// above the export button. Severity carries the export rule: "error"
// diagnostics block export, while "warning" diagnostics are advisories that
// leave export available.

import {
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
  staticPrintReferenceForPreset,
} from "@/domain/purifier/designPresets";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { tempestCordFanCollision } from "@/domain/designs/tempest/cordFanCollision";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import { evaluateBuildDiagnostics, summarizeDiagnostics, type BuildDiagnostic } from "@/fabrication/buildDiagnostics";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import type { ExportFormat, PrintableSheetPlan } from "@/fabrication/printing/printableKit";

export function evaluateActiveExportDiagnostics(
  currentLayout: LayoutResult,
  currentFabricationMethod: ExportFormat,
  currentGeneratedPlan: PrintableSheetPlan | null,
): BuildDiagnostic[] {
  if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
    return [];
  }

  const baseDiagnostics = [...evaluateBuildDiagnostics(currentLayout), ...tempestGeometryDiagnostics(currentLayout)];

  if (currentFabricationMethod !== "print-3mf") {
    return baseDiagnostics;
  }

  const kit = currentGeneratedPlan?.kit;
  if (kit === undefined) {
    return baseDiagnostics;
  }
  const printDiagnostics: BuildDiagnostic[] = [];
  if (kit.summary.oversizedPartCount > 0) {
    printDiagnostics.push({
      id: "oversized-print-part",
      severity: "error",
      title: "Print part exceeds bed",
      detail: `${kit.summary.oversizedPartCount} part${kit.summary.oversizedPartCount === 1 ? "" : "s"} exceed ${kit.preset.label}.`,
    });
  }
  return [...baseDiagnostics, ...printDiagnostics];
}

// Geometry advisories specific to the Tempest model (built from the layout).
function tempestGeometryDiagnostics(currentLayout: LayoutResult): BuildDiagnostic[] {
  if (!isTempestPrintDesignId(currentLayout.configuration.printDesign.id)) {
    return [];
  }
  const model = createTempestModel(createTempestSettingsFromLayout(currentLayout));
  if (!tempestCordFanCollision(model)) {
    return [];
  }
  return [
    {
      id: "cord-fan-collision",
      severity: "warning",
      title: "Cord hole hits a fan",
      detail:
        "The power-cord hole overlaps a fan. Move it with the cord wall, position, or corner offset (under Advanced) to a clear spot.",
    },
  ];
}

export function summarizeActiveBuildReadiness(
  currentLayout: LayoutResult,
  diagnostics: readonly BuildDiagnostic[],
  currentFabricationMethod: ExportFormat,
): BuildDiagnostic {
  return summarizeDiagnostics(diagnostics, readyDiagnostic(currentLayout, currentFabricationMethod));
}

function readyDiagnostic(currentLayout: LayoutResult, currentFabricationMethod: ExportFormat): BuildDiagnostic {
  if (currentFabricationMethod === "print-3mf") {
    if (isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
      return {
        id: "ready",
        severity: "info",
        title: "Ready to open files",
        detail: reference === undefined ? "Open the original source files." : reference.fileSummary,
      };
    }
    return {
      id: "ready",
      severity: "info",
      title: "Ready to export",
      detail: "No print-bed or printable-geometry issues were detected.",
    };
  }
  return {
    id: "ready",
    severity: "info",
    title: "Ready to export",
    detail: "No fan, sheet, frame, or dimension issues were detected.",
  };
}
