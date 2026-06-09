// Evaluates the export checks shown in the workbench output panel: base build
// diagnostics filtered for the active fabrication method, print-kit specific
// warnings, and the one-line readiness summary above the export button.

import {
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
  staticPrintReferenceForPreset,
} from "@/domain/purifier/designPresets";
import { evaluateBuildDiagnostics, summarizeBuildReadiness, type BuildDiagnostic } from "@/fabrication/buildDiagnostics";
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

  const usesGeneratedPrintKit =
    currentFabricationMethod === "print-3mf" &&
    (isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id) ||
      isTempestPrintDesignId(currentLayout.configuration.printDesign.id));
  const baseDiagnostics = usesGeneratedPrintKit
    ? evaluateBuildDiagnostics(currentLayout).filter(
        (diagnostic) =>
          ![
            "no-fans",
            "no-side-fans",
            "tight-fan-margin",
            "large-unsplit-frame",
            "large-sheet",
            "custom-filter-range",
          ].includes(diagnostic.id),
      )
    : evaluateBuildDiagnostics(currentLayout);

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
      severity: "warning",
      title: "Print part exceeds bed",
      detail: `${kit.summary.oversizedPartCount} part${kit.summary.oversizedPartCount === 1 ? "" : "s"} exceed ${kit.preset.label}.`,
    });
  }
  if (kit.summary.retainedPrintCriticalCutFeatureCount < kit.summary.sourcePrintCriticalCutFeatureCount) {
    printDiagnostics.push({
      id: "critical-print-feature-loss",
      severity: "warning",
      title: "Critical cut features lost",
      detail: "The selected split would drop fan, screw, slot, or window features from the printable parts.",
    });
  }
  return [...baseDiagnostics, ...printDiagnostics];
}

export function summarizeActiveBuildReadiness(
  currentLayout: LayoutResult,
  diagnostics: readonly BuildDiagnostic[],
  currentFabricationMethod: ExportFormat,
): BuildDiagnostic {
  if (diagnostics.length > 0) {
    return {
      id: "warnings",
      severity: "warning",
      title: `${diagnostics.length} export check${diagnostics.length === 1 ? "" : "s"}`,
      detail: "Review the fabrication checks before exporting.",
    };
  }
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
  return summarizeBuildReadiness(currentLayout);
}
