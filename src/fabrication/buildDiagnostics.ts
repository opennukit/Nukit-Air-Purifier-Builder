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
  // Optional "More" link (e.g. to a help-page section) shown after the detail.
  moreUrl?: string;
};

// Above this estimated noise level we advise against building (except for
// emergency use); see the Noise section of the help page.
const noiseAdvisoryDbA = 45;

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

  // Applies to every build (PC-fan grid or box fan), so it runs before the
  // wall-banks-only checks below.
  const noiseDbA = layout.summary.cadr.noiseDbA;
  if (noiseDbA !== null && noiseDbA > noiseAdvisoryDbA) {
    diagnostics.push({
      id: "high-noise",
      severity: "warning",
      title: "High noise level",
      detail: "We strongly advise against building air purifiers that exceed 45dBA @ 1 m on maximum power unless for emergency use.",
      moreUrl: "help.html#noise",
    });
  }

  // The bottom filter only works if the tower is lifted on feet so air can reach
  // its underside. Removing the feet is allowed, but then it does nothing. The
  // bottom filter itself only exists on a square tower filter, so skip the advisory
  // otherwise (a stale bottomFilter flag on a non-square filter builds nothing).
  const design = layout.configuration.design;
  const filter = layout.configuration.filter;
  const squareFilter = Math.abs(filter.width - filter.depth) <= 1;
  if (
    design.type === "tempest" &&
    design.arrangement === "four-side-filter-tower" &&
    design.bottomFilter &&
    squareFilter &&
    design.feetLength <= 0
  ) {
    diagnostics.push({
      id: "bottom-filter-no-feet",
      severity: "warning",
      title: "Bottom filter is blocked",
      detail: "The bottom filter needs feet to lift the tower so air can reach its underside. With the feet removed it sits flat on the surface and will not move air. Set a foot length, or turn the bottom filter off.",
      moreUrl: "help.html#bottomFilter",
    });
  }

  if (layout.summary.fans.type !== "wall-banks") {
    return diagnostics;
  }

  const { resolvedFans, backPlateFans } = layout.summary.fans;
  const totalFans = resolvedFans.left + resolvedFans.right + resolvedFans.top + resolvedFans.bottom + backPlateFans;

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
      detail: "Review the notes below. Export is still available.",
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
