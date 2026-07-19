import { describe, expect, test } from "bun:test";
import { createTempestModel, defaultTempestSettings, type TempestModel, type TempestPrintablePose } from "@/domain/designs/tempest/model";
import { createTempestPrintablePose } from "@/fabrication/printing/designs/tempest/printableKit";
import { axisCuts, featureAwarePrintableChunkGrid, grillDownNormalForChunk, grillFacesInPose } from "@/fabrication/printing/designs/tempest/chunkSlicing";
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

describe("axisCuts: balanced, sliver-free, feature-avoiding boundaries", () => {
  const MIN_CHUNK = 40;
  const sizesOf = (boundaries: number[]): number[] => boundaries.slice(1).map((v, i) => v - boundaries[i]);
  const insideAnyBand = (seam: number, bands: ReadonlyArray<readonly [number, number]>): boolean =>
    bands.some(([low, high]) => seam > low + 1e-6 && seam < high - 1e-6);

  const cases: Array<{ name: string; length: number; bed: number; bands: Array<readonly [number, number]> }> = [
    { name: "even split when there are no features", length: 555, bed: 250, bands: [] },
    { name: "fan-grid gaps (the reported sliver failure)", length: 555, bed: 250, bands: [[68, 212], [343, 487]] },
    { name: "a grill hugging the edge does not strand a sliver", length: 555, bed: 250, bands: [[10, 154], [401, 545]] },
    { name: "a tall axis with a single top grill band", length: 650, bed: 270, bands: [[576, 720]] },
    { name: "tight gaps between two features", length: 500, bed: 250, bands: [[60, 200], [300, 440]] },
  ];

  for (const { name, length, bed, bands } of cases) {
    test(name, () => {
      const boundaries = axisCuts(length, bed, bands);
      expect(boundaries[0]).toBe(0);
      expect(boundaries[boundaries.length - 1]).toBeCloseTo(length, 3);
      const chunks = sizesOf(boundaries);
      for (const size of chunks) {
        expect(size).toBeGreaterThanOrEqual(MIN_CHUNK - 1e-6); // no sliver
        expect(size).toBeLessThanOrEqual(bed + 1e-6); // still fits the bed
      }
      for (const seam of boundaries.slice(1, -1)) {
        expect(insideAnyBand(seam, bands)).toBe(false); // never cuts a fragile feature
      }
    });
  }

  test("a part that already fits the bed is never cut", () => {
    expect(axisCuts(200, 250, [])).toEqual([0, 200]);
  });
});

describe("grill-face-down chunking", () => {
  const model = createTempestModel(defaultTempestSettings);
  const pose = createTempestPrintablePose(model);
  const faces = grillFacesInPose(model, pose);

  test("the default sandwich's grills carry opposite left/right pose normals", () => {
    expect(faces.length).toBeGreaterThan(0);
    const normals = [...new Set(faces.map((face) => face.normal.join(",")))].sort();
    expect(normals).toEqual(["-1,0,0", "1,0,0"]);
  });

  test("one wall's chunk takes that wall's normal; a chunk spanning both takes none", () => {
    // A slab hugging the left wall (small X) carries only the -X grills.
    const leftOnly = grillDownNormalForChunk(faces, [0, 0, 0], [30, pose.envelope.depth, pose.envelope.height]);
    expect(leftOnly).toEqual([-1, 0, 0]);
    // A chunk spanning the full width holds both ±X grills, so nothing to force down.
    const both = grillDownNormalForChunk(faces, [0, 0, 0], [pose.envelope.width, pose.envelope.depth, pose.envelope.height]);
    expect(both).toBeUndefined();
    // A grill-free slab at the middle of the width takes no normal.
    const middle = grillDownNormalForChunk(faces, [pose.envelope.width / 2 - 15, 0, 0], [30, pose.envelope.depth, pose.envelope.height]);
    expect(middle).toBeUndefined();
  });

  test("the grill-normal axis is capped at the bed height so grilled chunks fit grill-down", () => {
    const bed = { width: 256, depth: 256, height: 250 };
    const grid = featureAwarePrintableChunkGrid(model, pose, bed);
    // X is the ±X grill-normal axis, so its chunks must fit the 250 mm height when
    // laid grill-down, not the 256 mm footprint width.
    expect(grid.chunkWidth).toBeLessThanOrEqual(bed.height + 0.5);
  });
});
