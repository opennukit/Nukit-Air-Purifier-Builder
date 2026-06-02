import { describe, expect, test } from "bun:test";
import { createTempestModel, defaultTempestSettings, type TempestModel } from "@/domain/designs/tempest/model";
import { createTempestPrintablePose, type TempestPrintablePose } from "@/fabrication/printing/designs/tempest/printableKit";
import { featureAwarePrintableChunkGrid } from "@/fabrication/printing/designs/tempest/chunkSlicing";

const bed = { width: 256, depth: 256, height: 256 };

// Independently re-derive the fan-grill centres in the cut (pose) frame, so this
// test catches a regression in the slicing module's own derivation rather than
// just mirroring it.
function poseGrillCentres(model: TempestModel, pose: TempestPrintablePose): Array<readonly [number, number, number]> {
  const fan = model.fanLayout;
  if (fan.type !== "horizontal-wall-fans") {
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
});
