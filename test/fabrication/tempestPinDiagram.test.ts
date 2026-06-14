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
import { towerCornerChamfer } from "@/fabrication/printing/designs/tempest/geometry";

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

  test("clears tower pins out of the open side filter windows", () => {
    const plan = createTempestChunkPlan(towerSettings, "bed-180");
    const candidates = tempestAlignmentPinPlacements(plan.model, plan.sourceChunkGrid);
    const cleared = tempestPinPlacementsClearOfFans(plan.model, plan.sourceChunkGrid);

    // Some candidates fall in the open windows and are dropped; the rest survive.
    expect(cleared.length).toBeLessThan(candidates.length);
    expect(cleared.length).toBeGreaterThan(0);
    for (const placement of cleared) {
      expect(candidates).toContainEqual(placement);
    }

    // No surviving pin sits inside a side window (where it would float with no hole).
    const fl = plan.model.filterLayout;
    if (fl.topology !== "quad") {
      throw new Error("expected a quad tower layout");
    }
    const openWidth = fl.filter.faceWidth - 2 * plan.model.frame.rim;
    const openHeight = fl.filter.faceHeight - 2 * plan.model.frame.rim;
    const centerZ = fl.bottomPlateThickness + fl.filter.faceHeight / 2;
    const zMin = centerZ - openHeight / 2;
    const zMax = centerZ + openHeight / 2;
    const off = fl.structuralOffset;
    const { width, depth } = plan.model.box;
    const windows = [
      { lengthAxis: "x" as const, center: width / 2, normalAxis: "y" as const, n0: 0, n1: off },
      { lengthAxis: "x" as const, center: width / 2, normalAxis: "y" as const, n0: depth - off, n1: depth },
      { lengthAxis: "y" as const, center: depth / 2, normalAxis: "x" as const, n0: 0, n1: off },
      { lengthAxis: "y" as const, center: depth / 2, normalAxis: "x" as const, n0: width - off, n1: width },
    ];
    for (const placement of cleared) {
      const [x, y, z] = placement.position;
      for (const w of windows) {
        const length = w.lengthAxis === "x" ? x : y;
        const normal = w.normalAxis === "x" ? x : y;
        const inside =
          z > zMin && z < zMax &&
          length > w.center - openWidth / 2 && length < w.center + openWidth / 2 &&
          normal > w.n0 && normal < w.n1;
        expect(inside).toBe(false);
      }
      // No pin over an open filter pocket/slot column.
      for (const rect of Object.values(fl.wallRects)) {
        const inPocket = x > rect.xMin && x < rect.xMax && y > rect.yMin && y < rect.yMax && z > fl.bottomPlateThickness && z < plan.model.box.height;
        expect(inPocket).toBe(false);
      }
      // No pin inside the bevelled outer corner.
      const chamfer = towerCornerChamfer(plan.model.frame.towerCornerPostChamfer, off, plan.model.frame.outsideFlangeThickness);
      const cornerDistance = Math.min(x, width - x) + Math.min(y, depth - y);
      expect(cornerDistance < chamfer).toBe(false);
    }
  });

  test("returns no diagram when the print volume keeps the model whole", () => {
    expect(createTempestAssemblyPinDiagram(tempestSettings, "unsplit")).toBeNull();
  });
});
