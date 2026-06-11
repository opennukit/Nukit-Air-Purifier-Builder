import { describe, expect, test } from "bun:test";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/settingsModel";
import { createLayout } from "@/fabrication/purifierLayout";
import { createPrintableKit, type PrintablePart } from "@/fabrication/printing/printableKit";
import { createDonutFilterPrintableKit } from "@/fabrication/printing/designs/donut-filter/printableKit";
import { cleanManifold, manifoldReport, totalGenus } from "../helpers/manifoldChecks";

// three.js ExtrudeGeometry is non-indexed triangle soup, so before welding a
// plain plate exported with every edge as a boundary edge; and the donut parts
// concatenated overlapping solids into self-intersecting shells. These tests pin
// the repaired invariant: every exported part is watertight as written, with no
// boundary, over-shared, or degenerate topology left for the slicer to repair.

describe("Laser-derived print kit meshes are 2-manifold", () => {
  test("split bed-180 kit: every panel tile and dovetail glue key is watertight", () => {
    const kit = createPrintableKit(createLayout(defaultSettings), "bed-180");

    expect(kit.summary.splitPanelCount).toBeGreaterThan(0);
    expect(kit.parts.some((part) => part.kind === "panel-tile")).toBe(true);
    expect(kit.parts.some((part) => part.kind === "dovetail-glue-key")).toBe(true);
    for (const part of kit.parts) {
      expect(manifoldReport(part.mesh)).toEqual(cleanManifold);
    }
  });
});

describe("Donut filter print kit meshes are 2-manifold", () => {
  const kit = createDonutFilterPrintableKit(
    createLayout(applyPrintDesignPreset(defaultSettings, "donut-hepa-adapter")),
    "bed-256",
  );

  function requiredPart(id: string): PrintablePart {
    const part = kit.parts.find((candidate) => candidate.id === id);
    if (part === undefined) {
      throw new Error(`requiredPart: Missing donut part ${id}`);
    }
    return part;
  }

  test("fan adapter unions flange and cones into one watertight body", () => {
    const adapter = requiredPart("donut-filter-fan-adapter");
    expect(manifoldReport(adapter.mesh)).toEqual(cleanManifold);
    // One central through-passage plus four screw holes.
    expect(totalGenus(adapter.mesh)).toBe(5);
  });

  test("fan guard unions frame, rings, spokes, and bosses without losing thin features", () => {
    const guard = requiredPart("donut-filter-fan-guard");
    expect(manifoldReport(guard.mesh)).toEqual(cleanManifold);
    // The 12 spokes crossing the 6 rings create the guard's many handles; if a
    // union or repair pass dropped the thin spokes, this count would collapse.
    expect(totalGenus(guard.mesh)).toBe(121);
  });

  test("blanking cap unions disk and collar into one watertight body", () => {
    const cap = requiredPart("donut-filter-blanking-cap");
    expect(manifoldReport(cap.mesh)).toEqual(cleanManifold);
    expect(totalGenus(cap.mesh)).toBe(0);
  });
});
