import { describe, expect, test } from "bun:test";
import { createTempestModel, defaultTempestSettings, type TempestModel, type TempestPrintablePose } from "@/domain/designs/tempest/model";
import { createTempestPrintablePose } from "@/fabrication/printing/designs/tempest/printableKit";
import { featureAwarePrintableChunkGrid } from "@/fabrication/printing/designs/tempest/chunkSlicing";
import { decodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";

const bed = { width: 256, depth: 256, height: 256 };

// Independently re-derive the fan-grill centres in the cut (pose) frame, so this
// test catches a regression in the slicing module's own derivation rather than
// just mirroring it.
function poseGrillCentres(model: TempestModel, pose: TempestPrintablePose): Array<readonly [number, number, number]> {
  const fan = model.fanLayout;
  if (fan.topology !== "sandwich") {
    return [];
  }
  const z = model.frame.outsideFlangeThickness + fan.localVerticalCenter;
  const w = model.frame.wallThickness / 2;
  const source: Array<readonly [number, number, number]> = [
    ...fan.walls.front.positionsAlongWall.map((p): readonly [number, number, number] => [p, w, z]),
    ...fan.walls.back.positionsAlongWall.map((p): readonly [number, number, number] => [model.box.width - p, model.box.depth - w, z]),
    ...fan.walls.left.positionsAlongWall.map((p): readonly [number, number, number] => [w, model.box.depth - p, z]),
    ...fan.walls.right.positionsAlongWall.map((p): readonly [number, number, number] => [model.box.width - w, p, z]),
  ];
  return source.map((c) => (pose.type === "upright-dual-filter" ? [c[0], pose.envelope.depth - c[2], c[1]] : c));
}

describe("feature-aware chunk slicing", () => {
  const model = createTempestModel(defaultTempestSettings);
  const pose = createTempestPrintablePose(model);
  const radius = model.settings.fan.diameter / 2 + 2;
  const centres = poseGrillCentres(model, pose);

  test("no chunk seam cuts a fan grill (default two-filter, bed-256)", () => {
    const grid = featureAwarePrintableChunkGrid(model, pose, bed);
    const interior = (boundaries: readonly number[]) => boundaries.slice(1, -1);
    const axes = [
      [interior(grid.boundariesX), 0],
      [interior(grid.boundariesY), 1],
      [interior(grid.boundariesZ), 2],
    ] as const;
    for (const [seams, axis] of axes) {
      for (const seam of seams) {
        for (const centre of centres) {
          expect(Math.abs(seam - centre[axis])).toBeGreaterThanOrEqual(radius);
        }
      }
    }
    expect(grid.chunkWidth).toBeLessThanOrEqual(bed.width + 0.5);
    expect(grid.chunkDepth).toBeLessThanOrEqual(bed.depth + 0.5);
    expect(grid.chunkHeight).toBeLessThanOrEqual(bed.height + 0.5);
  });

  test("the feature is load-bearing: a uniform mid-split would have cut a grill", () => {
    const uniformDepthSeam = pose.envelope.depth / 2;
    const hitsGrill = centres.some((centre) => Math.abs(uniformDepthSeam - centre[1]) < radius);
    expect(hitsGrill).toBe(true);
  });

  test("no chunk seam splits an inside filter flange (two-filter sandwich, 44 mm filter)", () => {
    // Reproduces the reported design: the depth seam previously landed inside the
    // below-filter flange, splitting that 5 mm wall into a weak sliver.
    const url =
      "printDesign=nukit-tempest&filterWidth=495&filterDepth=495&filterThickness=44" +
      "&tempestArrangement=dual-horizontal-sandwich&fanDiameter=140&fansLeft=-1&fansRight=0" +
      "&fansTop=-1&fansBottom=0&hexGrill=true&materialThickness=5&printVolume=bed-256&fabricationMethod=print-3mf";
    const flangeModel = createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(url))));
    const flangePose = flangeModel.printablePose;
    const grid = featureAwarePrintableChunkGrid(flangeModel, flangePose, bed);
    const filterLayout = flangeModel.filterLayout;

    expect(filterLayout.topology).toBe("sandwich");
    expect(flangePose.type).toBe("upright-dual-filter");
    if (filterLayout.topology !== "sandwich" || flangePose.type !== "upright-dual-filter") {
      return;
    }

    const interiorDepthSeams = grid.boundariesY.slice(1, -1);
    expect(interiorDepthSeams.length).toBeGreaterThan(0);
    for (const flange of filterLayout.flanges) {
      // Source Z maps to pose Y as (envelope.depth - z); the range flips.
      const low = flangePose.envelope.depth - flange.zTop;
      const high = flangePose.envelope.depth - flange.zBottom;
      for (const seam of interiorDepthSeams) {
        expect(seam > low && seam < high).toBe(false);
      }
    }
  });
});
