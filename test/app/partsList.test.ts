import { describe, expect, test } from "bun:test";
import { createPartsListItems } from "@/app/summaries";
import { createLayout } from "@/fabrication/purifierLayout";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/settingsModel";

// #######################################
// Parts List Completion
// #######################################

describe("parts list", () => {
  test("lists the required sheet for the laser path", () => {
    const laserLayout = createLayout(defaultSettings);
    const items = createPartsListItems(laserLayout, "laser-svg", laserLayout.rawSettings, "bed-256");
    const sheet = items.find((item) => item.category === "Sheet");

    if (laserLayout.summary.fabrication.type !== "cut-panel-source") {
      throw new Error("expected the laser layout to carry a cut sheet");
    }
    expect(sheet?.label).toContain(`${laserLayout.summary.fabrication.sheetWidth}`);
    expect(sheet?.detail).toContain(`${laserLayout.configuration.cutting.materialThickness} mm`);
  });

  test("lists filament, fan screws, glue, and pins for a split tempest print", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const items = createPartsListItems(tempestLayout, "print-3mf", tempestLayout.rawSettings, "bed-180");
    const categories = items.map((item) => item.category);

    expect(categories).toContain("Filament");
    expect(categories).toContain("Fasteners");
    expect(items.filter((item) => item.category === "Assembly").map((item) => item.label)).toEqual([
      "CA or epoxy glue",
      "1.75 mm filament pins",
    ]);
    expect(categories).not.toContain("Sheet");
  });

  test("drops the seam consumables when the print volume keeps the model whole", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));
    const items = createPartsListItems(tempestLayout, "print-3mf", tempestLayout.rawSettings, "unsplit");

    expect(items.some((item) => item.category === "Assembly")).toBe(false);
    expect(items.some((item) => item.category === "Filament")).toBe(true);
  });
});
