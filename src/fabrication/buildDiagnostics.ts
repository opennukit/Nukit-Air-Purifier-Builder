import type { LayoutResult } from "@/fabrication/purifierLayout";

export type BuildDiagnosticSeverity = "info" | "warning";

export type BuildDiagnostic = {
  id: string;
  severity: BuildDiagnosticSeverity;
  title: string;
  detail: string;
};

const normalCustomFilterMinimum = 180;
const normalCustomFilterMaximum = 760;
const normalFilterThicknessMinimum = 12;
const normalFilterThicknessMaximum = 80;
const smallFanMargin = 12;
const largeSheetDimension = 1500;

export function evaluateBuildDiagnostics(layout: LayoutResult): BuildDiagnostic[] {
  const diagnostics: BuildDiagnostic[] = [];
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

  if (resolvedFans.left + resolvedFans.right === 0) {
    diagnostics.push({
      id: "no-side-fans",
      severity: "warning",
      title: "No side fan bank",
      detail: "The current enclosure has no fans on the left or right filter run.",
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
      detail: "The filter frame is wider than many desktop fabrication beds. Split frames are safer for this size.",
    });
  }

  if (
    layout.summary.fabrication.type === "cut-panel-source" &&
    Math.max(layout.summary.fabrication.sheetWidth, layout.summary.fabrication.sheetHeight) > largeSheetDimension
  ) {
    diagnostics.push({
      id: "large-sheet",
      severity: "warning",
      title: "Large sheet layout",
      detail: "The arranged laser drawing exceeds 1500 mm on one side and may need manual nesting.",
    });
  }

  if (filterLooksUnusual(layout.configuration.filter)) {
    diagnostics.push({
      id: "custom-filter-range",
      severity: "warning",
      title: "Unusual custom filter",
      detail: "Custom dimensions are outside the normal range used by common HVAC and purifier filters.",
    });
  }

  return diagnostics;
}

export function summarizeBuildReadiness(layout: LayoutResult): BuildDiagnostic {
  const warnings = evaluateBuildDiagnostics(layout);
  if (warnings.length > 0) {
    return {
      id: "warnings",
      severity: "warning",
      title: `${warnings.length} export check${warnings.length === 1 ? "" : "s"}`,
      detail: "Review the fabrication checks before exporting.",
    };
  }

  return {
    id: "ready",
    severity: "info",
    title: "Ready to export",
    detail: "No fan, sheet, frame, or custom-dimension issues were detected.",
  };
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
    width < normalCustomFilterMinimum ||
    width > normalCustomFilterMaximum ||
    depth < normalCustomFilterMinimum ||
    depth > normalCustomFilterMaximum ||
    thickness < normalFilterThicknessMinimum ||
    thickness > normalFilterThicknessMaximum
  );
}
