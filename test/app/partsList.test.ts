import { describe, expect, test } from "bun:test";
import { createPartsListItems } from "@/app/summaries";
import { createLayout } from "@/fabrication/purifierLayout";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/settingsModel";
import { createPrintableSheetPlanFromKit } from "@/fabrication/printing/printableKit";
import { createTempestPrintableKitFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";

// #######################################
// Parts List Completion
// #######################################

describe("parts list", () => {
  test("lists the required sheet for the laser path", () => {
    const laserLayout = createLayout(defaultSettings);
    const items = createPartsListItems(laserLayout, "laser-svg", laserLayout.rawSettings, "bed-256", null, "mm");
    const sheet = items.find((item) => item.category === "Sheet");

    if (laserLayout.summary.fabrication.type !== "cut-panel-source") {
      throw new Error("expected the laser layout to carry a cut sheet");
    }
    expect(sheet?.label).toContain(`${laserLayout.summary.fabrication.sheetWidth}`);
    expect(sheet?.detail).toContain(`${laserLayout.configuration.cutting.materialThickness} mm`);
  });

  test("lists filament, fan screws, glue, and pins for a split tempest print", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const items = createPartsListItems(tempestLayout, "print-3mf", tempestLayout.rawSettings, "bed-180", null, "mm");
    const categories = items.map((item) => item.category);

    expect(categories).toContain("Filament");
    expect(categories).toContain("Fasteners");
    expect(items.filter((item) => item.category === "Assembly").map((item) => item.label)).toEqual([
      "Super glue or epoxy",
      "Filament alignment pins",
    ]);
    // 2 x 10 mm hole depth minus the 2 mm glue room.
    expect(items.find((item) => item.label === "Filament alignment pins")?.detail).toContain("18 mm");
    expect(categories).not.toContain("Sheet");
  });

  test("falls back to the generic filament line before the print plan is built", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const items = createPartsListItems(tempestLayout, "print-3mf", tempestLayout.rawSettings, "bed-256", null, "mm");
    const filament = items.find((item) => item.category === "Filament");

    expect(filament?.detail).toBe("Prints the housing on the selected bed");
  });

  test("estimates filament grams from the built tempest plan", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const kit = createTempestPrintableKitFromLayout(tempestLayout, "bed-256");
    const plan = createPrintableSheetPlanFromKit(kit);

    expect(plan.kit.summary.materialVolumeMm3).toBeGreaterThan(0);

    const items = createPartsListItems(tempestLayout, "print-3mf", tempestLayout.rawSettings, "bed-256", plan, "mm");
    const filament = items.find((item) => item.category === "Filament");

    // "about 740 g" / "about 1.2 kg" — the figure carries a g or kg unit,
    // discounted for sparse infill rather than the solid-model upper bound.
    expect(filament?.detail).toMatch(/about [\d.]+ (g|kg)/);
    expect(filament?.detail).toContain("infill");
  });

  test("lists curated source files, filters, fans, and license for a static reference", () => {
    const staticLayout = createLayout(applyPrintDesignPreset(defaultSettings, "static-modular-20x20-reference"));
    const items = createPartsListItems(staticLayout, "print-3mf", staticLayout.rawSettings, "bed-256", null, "mm");
    const categories = items.map((item) => item.category);

    expect(categories).toContain("Source files");
    expect(categories).toContain("Filters");
    expect(categories).toContain("Fans");
    expect(categories).toContain("License");
    expect(items.find((item) => item.category === "Source files")?.url).toBeDefined();
    expect(items.find((item) => item.category === "License")?.url).toBeDefined();
    expect(categories).not.toContain("Sheet");
    expect(categories).not.toContain("Assembly");
  });

  test("drops the seam consumables when the print volume keeps the model whole", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const items = createPartsListItems(tempestLayout, "print-3mf", tempestLayout.rawSettings, "unsplit", null, "mm");

    expect(items.some((item) => item.category === "Assembly")).toBe(false);
    expect(items.some((item) => item.category === "Filament")).toBe(true);
  });
});
