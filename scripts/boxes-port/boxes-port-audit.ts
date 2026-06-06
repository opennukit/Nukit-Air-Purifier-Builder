import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type SourceSnapshot =
  | {
      type: "available";
      root: string;
      commit: string;
      pythonFiles: number;
      generatorFiles: number;
      pythonLines: number;
    }
  | {
      type: "missing";
      root: string;
    };

type PortedGenerator = {
  upstream: string;
  translated: string;
  status: "usable-browser-port" | "missing";
};

const repoRoot = process.cwd();
const upstreamRoot = process.env.BOXES_PY_PATH ?? "/tmp/boxes.py";
const portedGenerators: PortedGenerator[] = [
  {
    upstream: "boxes/generators/airpurifier.py",
    translated: "src/ports/boxes/reference/airPurifierGenerator.ts",
    status: "usable-browser-port",
  },
];

const source = readSourceSnapshot(upstreamRoot);
const portFiles = [
  ...listFiles(join(repoRoot, "src", "ports", "boxes"), (path) => path.endsWith(".ts")),
].filter((path) => existsSync(path));
const nativeLaserFiles = [
  join(repoRoot, "src", "fabrication", "assemblyModel.ts"),
  join(repoRoot, "src", "fabrication", "laser", "panels.ts"),
  join(repoRoot, "src", "fabrication", "laser", "cutGeometry.ts"),
].filter((path) => existsSync(path));
const portLines = countLines(portFiles);
const nativeLaserLines = countLines(nativeLaserFiles);

console.log("Boxes.py TypeScript port audit");
console.log("==============================");
if (source.type === "available") {
  console.log(`Upstream: ${source.root} (${source.commit})`);
  console.log(`Upstream Python files: ${source.pythonFiles}`);
  console.log(`Upstream generator files: ${source.generatorFiles}`);
  console.log(`Upstream Python LOC: ${source.pythonLines}`);
} else {
  console.log(`Upstream: not found at ${source.root}`);
  console.log("Set BOXES_PY_PATH=/path/to/boxes.py for a live upstream count.");
}
console.log(`Port files: ${portFiles.map((path) => relative(repoRoot, path)).join(", ")}`);
console.log(`Port TypeScript LOC: ${portLines}`);
console.log(`Native browser laser files: ${nativeLaserFiles.map((path) => relative(repoRoot, path)).join(", ")}`);
console.log(`Native browser laser LOC: ${nativeLaserLines}`);
console.log(`Ported generators: ${portedGenerators.filter((generator) => generator.status !== "missing").length}`);

if (source.type === "available") {
  console.log(
    `Generator parity: ${portedGenerators.length}/${source.generatorFiles} tracked (${formatPercent(
      portedGenerators.length / source.generatorFiles,
    )})`,
  );
}

console.log("");
console.log("Translated generator map:");
for (const generator of portedGenerators) {
  console.log(`- ${generator.upstream} -> ${generator.translated}: ${generator.status}`);
}

console.log("");
console.log("Known non-parity areas:");
console.log("- AirPurifier now has browser-native panel outlines, finger holes, and assembly placement.");
console.log("- Exact upstream Boxes.py turtle edge math is not fully reproduced for every edge style.");
console.log("- Move/rotation/mirror behavior is layout-only; full turtle transform parity is not implemented.");
console.log("- Exporters beyond browser SVG are intentionally absent.");
console.log("- Upstream generators other than AirPurifier are not translated yet.");

function readSourceSnapshot(root: string): SourceSnapshot {
  if (!existsSync(root)) {
    return { type: "missing", root };
  }

  const boxesDir = join(root, "boxes");
  const generatorsDir = join(boxesDir, "generators");
  const pythonFiles = listFiles(boxesDir, (path) => path.endsWith(".py"));
  const generatorFiles = listFiles(generatorsDir, (path) => path.endsWith(".py"));

  return {
    type: "available",
    root,
    commit: readGitCommit(root),
    pythonFiles: pythonFiles.length,
    generatorFiles: generatorFiles.length,
    pythonLines: countLines(pythonFiles),
  };
}

function listFiles(root: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const entries = readdirSync(root)
    .map((name) => join(root, name))
    .sort((left, right) => left.localeCompare(right));

  return entries.flatMap((entry) => {
    const stat = statSync(entry);
    if (stat.isDirectory()) {
      return listFiles(entry, predicate);
    }
    return predicate(entry) ? [entry] : [];
  });
}

function countLines(files: readonly string[]): number {
  return files.reduce((total, file) => {
    const content = readFileSync(file, "utf8");
    return total + (content.length === 0 ? 0 : content.split("\n").length);
  }, 0);
}

function readGitCommit(root: string): string {
  const head = readText(join(root, ".git", "HEAD"));
  if (head === null) {
    return "unknown";
  }
  if (!head.startsWith("ref: ")) {
    return head.slice(0, 12);
  }

  const ref = head.slice("ref: ".length).trim();
  const commit = readText(join(root, ".git", ref));
  return commit?.slice(0, 12) ?? "unknown";
}

function readText(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8").trim();
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
