import { describe, expect, test } from "bun:test";
import { createLayout } from "@/fabrication/purifierLayout";
import { applyPrintDesignPreset, applyTempestArrangementDefaults, defaultSettings } from "@/domain/purifier/settingsModel";
import {
  createTempestAssemblyPinDiagram,
  createTempestChunkPlan,
  createTempestSettingsFromLayout,
} from "@/fabrication/printing/designs/tempest/printableKit";
import {
  tempestAlignmentPinPlacements,
  tempestPinPlacementsClearOfFans,
} from "@/fabrication/printing/designs/tempest/geometry/pins";

// #######################################
// Tempest Assembly Pin Diagram
// #######################################

const tempestSettings = createTempestSettingsFromLayout(createLayout(applyPrintDesignPreset(defaultSettings, "nukit-tempest")));
const towerSettings = createTempestSettingsFromLayout(
  createLayout(applyTempestArrangementDefaults(applyPrintDesignPreset(defaultSettings, "nukit-tempest"), "four-side-filter-tower")),
);

function axisIndex(axis: "x" | "y" | "z"): 0 | 1 | 2 {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}

describe("tempest assembly pin diagram", () => {
  test("places every pin candidate on a source chunk seam plane", () => {
    const plan = createTempestChunkPlan(tempestSettings, "bed-180");
    expect(plan.printableChunkGrid.totalCount).toBeGreaterThan(1);

    const placements = tempestAlignmentPinPlacements(plan.model, plan.sourceChunkGrid);
    expect(placements.length).toBeGreaterThan(0);

    const interiorBoundaries = {
      x: plan.sourceChunkGrid.boundariesX.slice(1, -1),
      y: plan.sourceChunkGrid.boundariesY.slice(1, -1),
      z: plan.sourceChunkGrid.boundariesZ.slice(1, -1),
    };
    for (const placement of placements) {
      const seamCoordinate = placement.position[axisIndex(placement.axis)];
      const matchesSeam = interiorBoundaries[placement.axis].some((boundary) => Math.abs(boundary - seamCoordinate) < 1e-6);
      expect(matchesSeam).toBe(true);
    }
  });

  test("fan-cleared placements are a subset of the candidates", () => {
    const plan = createTempestChunkPlan(tempestSettings, "bed-180");
    const candidates = tempestAlignmentPinPlacements(plan.model, plan.sourceChunkGrid);
    const cleared = tempestPinPlacementsClearOfFans(plan.model, plan.sourceChunkGrid);

    expect(cleared.length).toBeGreaterThan(0);
    expect(cleared.length).toBeLessThanOrEqual(candidates.length);
    for (const placement of cleared) {
      expect(candidates).toContainEqual(placement);
    }
  });

  test("maps the diagram into the posed frame the chunks are cut in", () => {
    const plan = createTempestChunkPlan(tempestSettings, "bed-180");
    const diagram = createTempestAssemblyPinDiagram(tempestSettings, "bed-180");
    if (diagram === null) {
      throw new Error("expected a pin diagram for a split tempest model");
    }

    expect(diagram.pinDiameter).toBeGreaterThan(0);
    // 2 x 10 mm hole depth minus the 2 mm glue room.
    expect(diagram.pinLength).toBe(18);

    const posedInteriorBoundaries = {
      x: plan.printableChunkGrid.boundariesX.slice(1, -1),
      y: plan.printableChunkGrid.boundariesY.slice(1, -1),
      z: plan.printableChunkGrid.boundariesZ.slice(1, -1),
    };
    for (const placement of diagram.placements) {
      const position = [placement.position.x, placement.position.y, placement.position.z] as const;
      const seamCoordinate = position[axisIndex(placement.axis)];
      const matchesSeam = posedInteriorBoundaries[placement.axis].some((boundary) => Math.abs(boundary - seamCoordinate) < 1e-6);
      expect(matchesSeam).toBe(true);
    }
  });

  test("covers the tower (quad) topology too", () => {
    const diagram = createTempestAssemblyPinDiagram(towerSettings, "bed-180");
    if (diagram === null) {
      throw new Error("expected a pin diagram for a split tempest tower");
    }
    expect(diagram.placements.length).toBeGreaterThan(0);
  });

  test("shortens central top-plate tower pins to clear the fan grills and screws", () => {
    const plan = createTempestChunkPlan(towerSettings, "bed-180");
    const pin = plan.model.settings.alignmentPins;
    if (pin.type !== "enabled") {
      throw new Error("expected enabled alignment pins for the default tower");
    }
    const placements = tempestAlignmentPinPlacements(plan.model, plan.sourceChunkGrid);
    const clamped = placements.filter((placement) => placement.holeDepth !== undefined);

    // The central top-plate pins are the ones that needed shortening.
    expect(clamped.length).toBeGreaterThan(0);
    for (const placement of clamped) {
      expect(placement.holeDepth!).toBeGreaterThanOrEqual(3);
      expect(placement.holeDepth!).toBeLessThanOrEqual(pin.holeDepth);
    }

    // The diagram carries a matching per-pin length, so the preview is no longer
    // one length for every pin.
    const diagram = createTempestAssemblyPinDiagram(towerSettings, "bed-180");
    const lengths = new Set(diagram?.placements.map((placement) => placement.length));
    expect(lengths.size).toBeGreaterThan(1);

    // No central pin sits near a perpendicular grid corner, where it would collide
    // with the perpendicular pin (they are dropped — other pins still align).
    const interiorSeamsX = plan.sourceChunkGrid.boundariesX.slice(1, -1);
    const interiorSeamsY = plan.sourceChunkGrid.boundariesY.slice(1, -1);
    const cornerClearance = pin.holeDepth + pin.diameter;
    for (const placement of clamped) {
      const perpendicularSeams = placement.axis === "x" ? interiorSeamsY : interiorSeamsX;
      const acrossCoordinate = placement.axis === "x" ? placement.position[1] : placement.position[0];
      for (const seam of perpendicularSeams) {
        expect(Math.abs(acrossCoordinate - seam)).toBeGreaterThanOrEqual(cornerClearance);
      }
    }
  });

  test("returns no diagram when the print volume keeps the model whole", () => {
    expect(createTempestAssemblyPinDiagram(tempestSettings, "unsplit")).toBeNull();
  });
});
