import { describe, expect, test } from "bun:test";
import { createPartsListItems } from "@/app/summaries";
import { createLayout } from "@/fabrication/purifierLayout";
import { decodeSettings } from "@/domain/purifier/settingsCodec";
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
      "Super glue or epoxy",
      "Filament alignment pins",
    ]);
    // 2 x 10 mm hole depth minus the 2 mm glue room.
    expect(items.find((item) => item.label === "Filament alignment pins")?.detail).toContain("18 mm");
    expect(categories).not.toContain("Sheet");
  });

  test("the Filter row shows the stock filter name when a preset matches, else the measured size", () => {
    const starkvind = createLayout(
      decodeSettings("printDesign=nukit-tempest&filterWidth=370&filterDepth=290&filterThickness=40"),
    );
    expect(
      createPartsListItems(starkvind, "print-3mf", starkvind.rawSettings, "bed-256").find((item) => item.category === "Filter")?.label,
    ).toBe("STARKVIND (370 x 290 x 40 mm)");

    // swapped orientation still reads as STARKVIND
    const swapped = createLayout(
      decodeSettings("printDesign=nukit-tempest&filterWidth=290&filterDepth=370&filterThickness=40"),
    );
    expect(
      createPartsListItems(swapped, "print-3mf", swapped.rawSettings, "bed-256").find((item) => item.category === "Filter")?.label,
    ).toBe("STARKVIND (370 x 290 x 40 mm)");

    // a custom size falls back to the measured dimensions
    const custom = createLayout(
      decodeSettings("printDesign=nukit-tempest&filterWidth=300&filterDepth=300&filterThickness=25"),
    );
    expect(
      createPartsListItems(custom, "print-3mf", custom.rawSettings, "bed-256").find((item) => item.category === "Filter")?.label,
    ).toBe("300 mm x 300 mm x 25 mm");
  });

  test("lists curated source files, filters, fans, and license for a static reference", () => {
    const staticLayout = createLayout(applyPrintDesignPreset(defaultSettings, "static-modular-20x20-reference"));
    const items = createPartsListItems(staticLayout, "print-3mf", staticLayout.rawSettings, "bed-256");
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
    const items = createPartsListItems(tempestLayout, "print-3mf", tempestLayout.rawSettings, "unsplit");

    expect(items.some((item) => item.category === "Assembly")).toBe(false);
    expect(items.some((item) => item.category === "Filament")).toBe(true);
  });
});
