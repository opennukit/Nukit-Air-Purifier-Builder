import type { LayoutResult } from "@/fabrication/purifierLayout";

// How a diagnostic affects export:
// - "error" blocks export — the output would be broken or unprintable.
// - "warning" is an advisory — shown prominently, but export stays available.
// - "info" is the all-clear readiness state, never produced by checks.
export type BuildDiagnosticSeverity = "info" | "warning" | "error";

export type BuildDiagnostic = {
  id: string;
  severity: BuildDiagnosticSeverity;
  title: string;
  detail: string;
};

export function exportBlockingDiagnostics(diagnostics: readonly BuildDiagnostic[]): readonly BuildDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.severity === "error");
}

const normalFilterMinimum = 180;
const normalFilterMaximum = 760;
const normalFilterThicknessMinimum = 12;
const normalFilterThicknessMaximum = 80;
const smallFanMargin = 12;

export function evaluateBuildDiagnostics(layout: LayoutResult): BuildDiagnostic[] {
  const diagnostics: BuildDiagnostic[] = [];
  // The measured-dimension sanity check applies to every design that takes the
  // rectangular filter; the donut adaptor measures its own round filter.
  if (layout.configuration.design.type !== "donut-filter-adapter" && filterLooksUnusual(layout.configuration.filter)) {
    diagnostics.push({
      id: "filter-dimension-range",
      severity: "warning",
      title: "Unusual filter dimensions",
      detail: "Measured dimensions are outside the normal range used by common HVAC and purifier filters.",
    });
  }

  if (layout.summary.fans.type !== "wall-banks") {
    return diagnostics;
  }

  const { resolvedFans } = layout.summary.fans;
  const totalFans = resolvedFans.left + resolvedFans.right + resolvedFans.top + resolvedFans.bottom;

  if (totalFans === 0) {
    diagnostics.push({
      id: "no-fans",
      severity: "warning",
      title: "No fans resolved",
      detail: "At least one fan opening is needed before fabrication export is useful.",
    });
  }

  const tightFanMargins = tightFanMarginLabels(layout);
  if (tightFanMargins.length > 0) {
    diagnostics.push({
      id: "tight-fan-margin",
      severity: "warning",
      title: "Tight fan spacing",
      detail: `${tightFanMargins.join(", ")} have less than ${smallFanMargin} mm around the fan bank.`,
    });
  }

  if (
    layout.configuration.frameConstruction.type === "full-panels" &&
    layout.configuration.filter.width > 530
  ) {
    diagnostics.push({
      id: "large-unsplit-frame",
      severity: "warning",
      title: "Large unsplit frame",
      detail: "The filter frame is wider than many desktop fabrication beds.",
    });
  }

  return diagnostics;
}

export function summarizeBuildReadiness(layout: LayoutResult): BuildDiagnostic {
  return summarizeDiagnostics(evaluateBuildDiagnostics(layout), {
    id: "ready",
    severity: "info",
    title: "Ready to export",
    detail: "No fan, sheet, frame, or dimension issues were detected.",
  });
}

// The one-line readiness summary above the export button: blockers dominate
// (export is refused), advisories note that export stays available, and the
// caller supplies its method-specific all-clear diagnostic.
export function summarizeDiagnostics(diagnostics: readonly BuildDiagnostic[], ready: BuildDiagnostic): BuildDiagnostic {
  const blockers = exportBlockingDiagnostics(diagnostics);
  if (blockers.length > 0) {
    return {
      id: "export-blocked",
      severity: "error",
      title: blockers.length === 1 ? "1 issue blocks export" : `${blockers.length} issues block export`,
      detail: "Fix the blocking checks below before exporting.",
    };
  }
  if (diagnostics.length > 0) {
    return {
      id: "advisories",
      severity: "warning",
      title: diagnostics.length === 1 ? "1 advisory" : `${diagnostics.length} advisories`,
      detail: "Review the notes below — export is still available.",
    };
  }
  return ready;
}

function tightFanMarginLabels(layout: LayoutResult): string[] {
  if (layout.summary.fans.type !== "wall-banks") {
    return [];
  }

  const fanDiameter = layout.configuration.fan.spec.diameter;
  const filterWidth = layout.configuration.filter.width;
  const { resolvedFans } = layout.summary.fans;
  return [
    fanMarginLabel("Left", resolvedFans.left, layout.summary.workingDepth, fanDiameter),
    fanMarginLabel("Right", resolvedFans.right, layout.summary.workingDepth, fanDiameter),
    fanMarginLabel("Top", resolvedFans.top, filterWidth, fanDiameter),
    fanMarginLabel("Bottom", resolvedFans.bottom, filterWidth, fanDiameter),
  ].filter((label) => label !== null);
}

function fanMarginLabel(label: string, fans: number, span: number, fanDiameter: number): string | null {
  if (fans <= 0) {
    return null;
  }

  const margin = (span - fans * fanDiameter) / (fans + 1);
  return margin < smallFanMargin ? label : null;
}

function filterLooksUnusual(filter: LayoutResult["configuration"]["filter"]): boolean {
  const { width, depth, thickness } = filter;
  return (
    width < normalFilterMinimum ||
    width > normalFilterMaximum ||
    depth < normalFilterMinimum ||
    depth > normalFilterMaximum ||
    thickness < normalFilterThicknessMinimum ||
    thickness > normalFilterThicknessMaximum
  );
}
