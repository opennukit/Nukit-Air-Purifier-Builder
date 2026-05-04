import type { LayoutResult } from "./airPurifier";
import {
  createPrintableSheetPlan as createPrintableSheetPlanFromLayout,
  createPrintableSheetPlanFromKit,
  type PrintSheet,
  type PrintSheetPlacement,
  type PrintableSheetPlan,
  type PrintVolumePresetId,
} from "./printableKit";

export { createPrintableSheetPlanFromKit };
export type { PrintSheet, PrintSheetPlacement, PrintableSheetPlan };

const svgPadding = 18;
const sheetLabelHeight = 18;
const sheetSpacing = 26;

export function createPrintableSheetPlan(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableSheetPlan {
  return createPrintableSheetPlanFromLayout(layout, presetId);
}

export function renderPrintableSheetsSvg(layout: LayoutResult, presetId: PrintVolumePresetId): string {
  const plan = createPrintableSheetPlan(layout, presetId);
  const width = Math.max(...plan.sheets.map((sheet) => sheet.width), 1) + svgPadding * 2;
  const height =
    plan.sheets.reduce((total, sheet) => total + sheetLabelHeight + sheet.depth + sheetSpacing, svgPadding) +
    svgPadding -
    sheetSpacing;

  let cursorY = svgPadding;
  const sheetGroups = plan.sheets.map((sheet) => {
    const labelY = cursorY + 4;
    const bedY = cursorY + sheetLabelHeight;
    const group = renderSheet(sheet, svgPadding, bedY, labelY);
    cursorY += sheetLabelHeight + sheet.depth + sheetSpacing;
    return group;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${roundSvg(width)}mm" height="${roundSvg(height)}mm" viewBox="0 0 ${roundSvg(
    width,
  )} ${roundSvg(height)}">
  <title>Nukit Open Air Purifier 3D Print Sheets</title>
  <desc>Generated printable bed layouts for ${escapeXml(plan.kit.preset.label)}.</desc>
  <style>
    .bed { fill: #fbfaf6; stroke: #b9ae99; stroke-width: 0.35; stroke-dasharray: 4 3; }
    .panel-part { fill: #d2a66b; stroke: #604322; stroke-width: 0.35; }
    .glue-key { fill: #7e997f; stroke: #334f39; stroke-width: 0.3; }
    .oversized { fill: #ead0c8; stroke: #b23322; stroke-width: 0.55; }
    .label { fill: #17201c; font-family: Arial, sans-serif; font-size: 7px; font-weight: 700; }
    .part-label { fill: #17201c; font-family: Arial, sans-serif; font-size: 5px; text-anchor: middle; dominant-baseline: middle; }
    .meta { fill: #667169; font-family: Arial, sans-serif; font-size: 5px; }
  </style>
${sheetGroups.join("\n")}
</svg>`;
}

function renderSheet(sheet: PrintSheet, x: number, y: number, labelY: number): string {
  const partCount = sheet.placements.length;
  return `  <g>
    <text class="label" x="${roundSvg(x)}" y="${roundSvg(labelY)}">Print sheet ${sheet.index}</text>
    <text class="meta" x="${roundSvg(x + 88)}" y="${roundSvg(labelY)}">${roundSvg(sheet.width)} x ${roundSvg(
      sheet.depth,
    )} mm, ${partCount} part${partCount === 1 ? "" : "s"}</text>
    <rect class="bed" x="${roundSvg(x)}" y="${roundSvg(y)}" width="${roundSvg(sheet.width)}" height="${roundSvg(
      sheet.depth,
    )}" />
${sheet.placements.map((placement) => renderPlacement(placement, x, y)).join("\n")}
  </g>`;
}

function renderPlacement(placement: PrintSheetPlacement, sheetX: number, sheetY: number): string {
  const x = sheetX + placement.x;
  const y = sheetY + placement.y;
  const className = placement.fits
    ? placement.part.kind === "dovetail-glue-key"
      ? "glue-key"
      : "panel-part"
    : "oversized";
  const label = compactPartLabel(placement.part.name);
  return `    <g>
      <rect class="${className}" x="${roundSvg(x)}" y="${roundSvg(y)}" width="${roundSvg(
        placement.part.width,
      )}" height="${roundSvg(placement.part.depth)}" />
      <text class="part-label" x="${roundSvg(x + placement.part.width / 2)}" y="${roundSvg(
        y + placement.part.depth / 2,
      )}">${escapeXml(label)}</text>
    </g>`;
}

function compactPartLabel(name: string): string {
  return name
    .replace(" print panel", "")
    .replace(" dovetail glue key", " key")
    .replace(" tile ", " ")
    .slice(0, 32);
}

function roundSvg(value: number): string {
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
