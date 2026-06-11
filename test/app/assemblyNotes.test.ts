import { describe, expect, test } from "bun:test";
import { createAssemblyNotes } from "@/app/summaries";
import { createLayout } from "@/fabrication/purifierLayout";
import { applyPrintDesignPreset, defaultSettings } from "@/domain/purifier/settingsModel";

// #######################################
// Assembly Guidance
// #######################################

describe("assembly guidance notes", () => {
  test("shows the active design's preset notes", () => {
    const laserLayout = createLayout(defaultSettings);
    const notes = createAssemblyNotes(laserLayout, "laser-svg", "bed-256");

    expect(notes).toEqual(laserLayout.configuration.printDesign.assemblyNotes);
    expect(notes.length).toBeGreaterThan(0);
  });

  test("adds seam glue and filament pin steps only when the print volume splits the model", () => {
    const tempestLayout = createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest"));

    const splitNotes = createAssemblyNotes(tempestLayout, "print-3mf", "bed-180");
    expect(splitNotes.some((note) => note.includes("Glue the printed chunks"))).toBe(true);
    expect(splitNotes.some((note) => note.includes("1.75 mm filament as alignment pins"))).toBe(true);

    const unsplitNotes = createAssemblyNotes(tempestLayout, "print-3mf", "unsplit");
    expect(unsplitNotes).toEqual(tempestLayout.configuration.printDesign.assemblyNotes);
  });
});
