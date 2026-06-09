import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { encodeSettings } from "@/domain/purifier/settingsCodec";
import { defaultSettings } from "@/domain/purifier/settingsModel";
import { createLaserSvg, createLayout, requireCutPanelFabricationPlan } from "@/fabrication/purifierLayout";

const upstreamRoot = process.env.BOXES_PY_PATH ?? "/tmp/boxes.py";
const python = resolvePythonInterpreter();
const outputDir = mkdtempSync(join(tmpdir(), "airpurifier-oracle-"));
const upstreamOutput = join(outputDir, "upstream.svg");

try {
  const localLayout = createLayout(defaultSettings);
  const localSvg = createLaserSvg(localLayout);
  const localCutPanels = requireCutPanelFabricationPlan(localLayout, "airpurifier-oracle");
  const upstream = renderUpstreamSvg(upstreamRoot, upstreamOutput);

  console.log("AirPurifier upstream oracle");
  console.log("==========================");
  console.log(`Settings: ${encodeSettings(localLayout.rawSettings)}`);
  console.log(`Local sheet: ${formatMillimeters(localCutPanels.cutSheet.width)} x ${formatMillimeters(localCutPanels.cutSheet.height)}`);
  console.log(`Local paths: ${count(localSvg, /<path\b/g)}`);
  console.log(`Local circles: ${count(localSvg, /<circle\b/g)}`);
  console.log(`Local rects: ${count(localSvg, /<rect\b/g)}`);

  if (upstream.type === "available") {
    console.log(`Upstream sheet: ${upstream.width ?? "unknown"} x ${upstream.height ?? "unknown"}`);
    console.log(`Upstream paths: ${count(upstream.svg, /<path\b/g)}`);
    console.log(`Upstream circles: ${count(upstream.svg, /<circle\b/g)}`);
    console.log(`Upstream rects: ${count(upstream.svg, /<rect\b/g)}`);
  } else {
    console.log("Upstream render: unavailable");
    console.log(upstream.reason);
    console.log("Install the Boxes.py Python requirements or set BOXES_PY_PATH to a ready checkout, then rerun this script.");
  }
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

type UpstreamResult =
  | {
      type: "available";
      svg: string;
      width: string | null;
      height: string | null;
    }
  | {
      type: "unavailable";
      reason: string;
    };

function renderUpstreamSvg(root: string, output: string): UpstreamResult {
  if (!existsSync(root)) {
    return { type: "unavailable", reason: `Boxes.py checkout not found at ${root}` };
  }

  const result = spawnSync(
    python,
    [
      "-m",
      "boxes.scripts.boxes_main",
      "AirPurifier",
      "--x",
      String(defaultSettings.filterWidth),
      "--y",
      String(defaultSettings.filterDepth),
      "--filter_height",
      String(defaultSettings.filterThickness),
      "--rim",
      String(defaultSettings.rim),
      "--fan_diameter",
      String(defaultSettings.fanDiameter),
      "--filters",
      String(defaultSettings.filters),
      "--thickness",
      String(defaultSettings.materialThickness),
      "--burn",
      String(defaultSettings.kerfFit),
      "--output",
      output,
    ],
    { cwd: root, encoding: "utf8" },
  );

  if (result.status !== 0 || !existsSync(output)) {
    return {
      type: "unavailable",
      reason: `${result.stderr || result.stdout || "python exited without producing output"}`.trim(),
    };
  }

  const svg = readFileSync(output, "utf8");
  return {
    type: "available",
    svg,
    width: readSvgAttribute(svg, "width"),
    height: readSvgAttribute(svg, "height"),
  };
}

function resolvePythonInterpreter(): string {
  if (process.env.BOXES_PY_PYTHON !== undefined && process.env.BOXES_PY_PYTHON.trim() !== "") {
    return process.env.BOXES_PY_PYTHON;
  }

  const localPython = join(process.cwd(), ".venv-boxes", "bin", "python");
  return existsSync(localPython) ? localPython : "python3";
}

function count(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function readSvgAttribute(svg: string, attribute: "width" | "height"): string | null {
  return svg.match(new RegExp(`${attribute}="([^"]+)"`))?.[1] ?? null;
}

function formatMillimeters(value: number): string {
  return `${value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}mm`;
}
