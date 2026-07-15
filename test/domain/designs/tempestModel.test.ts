import { describe, expect, test } from "bun:test";
import {
  createTempestModel,
  defaultTempestHorizontalFilter,
  defaultTempestSettings,
  defaultTempestTowerFilter,
} from "@/domain/designs/tempest/model";
import type { TempestSettings } from "@/domain/designs/tempest/shared";

describe("Tempest OpenSCAD model port", () => {
  test("ports the two-filter OpenSCAD defaults into deterministic dimensions and fan placement", () => {
    const model = createTempestModel();

    expect(model.settings.fan.opening).toEqual({
      type: "honeycomb",
      hexFlatToFlat: 10,
      ribThickness: 1.6,
      fullCellsOnly: false,
    });
    // 495 measured footprint + 2*1 fit clearance + 2*5 walls; the height carries
    // one fit clearance per filter pocket (filterPocketThickness).
    expect(model.box).toEqual({
      width: 506.2,
      depth: 506.2,
      height: 263.2,
      wallHeight: 243.2,
    });
    expect(model.chunkGrid).toMatchObject({
      countX: 2,
      countY: 2,
      countZ: 2,
      totalCount: 8,
      chunkWidth: 253.1,
      chunkDepth: 253.1,
      chunkHeight: 131.6,
    });
    expect(model.filterLayout.topology).toBe("sandwich");
    if (model.filterLayout.topology !== "sandwich") {
      throw new Error("Expected horizontal Tempest layout");
    }
    expect(model.filterLayout.filterCount).toBe(2);
    expect(model.filterLayout.bottomPanel).toBe("open-frame");
    expect(model.filterLayout.filters.map((filter) => filter.zBottom)).toEqual([10, 207.6]);
    expect(model.filterLayout.flanges.map((flange) => [flange.type, flange.zBottom, flange.zTop])).toEqual([
      ["above-filter", 55.6, 60.6],
      ["below-filter", 202.6, 207.6],
    ]);
    expect(model.filterLayout.loading.slots.map((slot) => [slot.wall, slot.localZBottom, slot.localZTop])).toEqual([
      ["back", 0, 46.6],
      ["back", 196.6, 243.2],
    ]);

    expect(model.fanLayout.topology).toBe("sandwich");
    if (model.fanLayout.topology !== "sandwich") {
      throw new Error("Expected horizontal fan layout");
    }
    expect(model.fanLayout.bodyDepth).toBe(27);
    expect(model.fanLayout.screwPitch).toBe(125);
    expect(model.fanLayout.cornerSafeMinimum).toBe(102);
    expect(model.fanLayout.localVerticalCenter).toBe(121.6);
    expect(model.fanLayout.walls.front.actualCount).toBe(0);
    expect(model.fanLayout.walls.back.actualCount).toBe(0);
    expect(model.fanLayout.walls.left.actualCount).toBe(3);
    expect(model.fanLayout.walls.left.positionsAlongWall).toEqual([102, 253.1, 404.2]);
    expect(model.fanLayout.walls.right.positionsAlongWall).toEqual([102, 253.1, 404.2]);

    // The cord defaults to "center": it sits the corner offset up from the floor
    // (near the bottom in the upright view) and centred horizontally along the
    // chamber height. The control value and the rendered position match.
    expect(model.cordPassThrough).toMatchObject({
      topology: "sandwich",
      type: "wall-cylinder",
      wall: "right",
      side: "center",
      diameter: 10,
      axis: "x",
    });
    if (model.cordPassThrough.type !== "wall-cylinder") throw new Error("expected wall cord");
    expect(model.cordPassThrough.positionAlongWall).toBeGreaterThan(0);
    expect(model.cordPassThrough.positionAlongWall).toBeLessThan(model.box.depth / 2); // near the floor
    expect(model.cordPassThrough.verticalCenter).toBe(model.box.height / 2); // horizontal centre
  });

  test("a side-wall cord sits near the floor via the corner offset", () => {
    const model = createTempestModel();
    expect(model.printablePose.type).toBe("upright-dual-filter");
    if (model.cordPassThrough.type === "none" || model.cordPassThrough.topology !== "sandwich") {
      throw new Error("Expected a sandwich wall cord");
    }
    // Near the floor (depth = vertical in the view), not the depth midline.
    expect(model.cordPassThrough.positionAlongWall).toBeLessThan(model.box.depth / 2);
    // A larger corner offset lifts it further from the floor.
    const lifted = createTempestModel({
      ...defaultTempestSettings,
      cordPassThrough: { type: "wall", wall: "right", side: "center", diameter: 8, cornerOffset: 60 },
    });
    if (lifted.cordPassThrough.type !== "wall-cylinder") throw new Error("expected wall cord");
    expect(lifted.cordPassThrough.positionAlongWall).toBeGreaterThan(model.cordPassThrough.positionAlongWall);
  });

  test("a side-wall cord slides along the box height (horizontal in the upright view)", () => {
    const sideCord = (side: "left" | "center" | "right") =>
      createTempestModel({
        ...defaultTempestSettings,
        cordPassThrough: { type: "wall", wall: "right", side, diameter: 8, cornerOffset: 17 },
      });
    const left = sideCord("left");
    const center = sideCord("center");
    const right = sideCord("right");
    if (
      left.cordPassThrough.type !== "wall-cylinder" ||
      center.cordPassThrough.type !== "wall-cylinder" ||
      right.cordPassThrough.type !== "wall-cylinder"
    ) {
      throw new Error("expected wall cords");
    }
    // It sits near the floor along the depth — same for every side (the corner
    // offset, not the side, drives that axis)...
    const floorPos = center.cordPassThrough.positionAlongWall;
    expect(floorPos).toBeLessThan(center.box.depth / 2);
    expect(left.cordPassThrough.positionAlongWall).toBe(floorPos);
    expect(right.cordPassThrough.positionAlongWall).toBe(floorPos);
    // ...and the side slides it along the height (which renders horizontally):
    // left low, center mid, right high.
    expect(left.cordPassThrough.verticalCenter).toBeLessThan(center.cordPassThrough.verticalCenter);
    expect(right.cordPassThrough.verticalCenter).toBeGreaterThan(center.cordPassThrough.verticalCenter);
  });

  test("single-filter wall mount sits its side-wall cord near the floor by default", () => {
    const model = createTempestModel({
      ...defaultTempestSettings,
      arrangement: { type: "single-horizontal-top-filter", filter: defaultTempestHorizontalFilter },
    });
    expect(model.printablePose.type).toBe("upright-dual-filter");
    if (model.cordPassThrough.type === "none" || model.cordPassThrough.topology !== "sandwich") {
      throw new Error("Expected a sandwich wall cord");
    }
    expect(model.cordPassThrough.positionAlongWall).toBeLessThan(model.box.depth / 2);
    expect(model.cordPassThrough.verticalCenter).toBe(model.box.height / 2);
  });

  test("models the four-filter tower as a different arrangement instead of widening horizontal filter count", () => {
    const settings: TempestSettings = {
      ...defaultTempestSettings,
      arrangement: {
        type: "four-side-filter-tower",
        filter: defaultTempestTowerFilter,
        bottomFilter: false,
        feetLength: 0,
      },
    };
    const model = createTempestModel(settings);

    // 495 face + 2*0.6 fit clearance + 2*60.6 structural offset (the offset
    // itself carries the 0.6mm pocket-depth clearance: 10 flange + 45.6 pocket +
    // 5 wall).
    expect(model.box).toEqual({
      width: 617.4,
      depth: 617.4,
      height: 510,
      wallHeight: 495,
    });
    expect(model.filterLayout.topology).toBe("quad");
    if (model.filterLayout.topology !== "quad") {
      throw new Error("Expected tower Tempest layout");
    }
    expect(model.filterLayout.structuralOffset).toBeCloseTo(60.6);
    expect(model.filterLayout.airChamber).toEqual({
      xMin: 60.6,
      xMax: 556.8,
      yMin: 60.6,
      yMax: 556.8,
      zMin: 5,
      zMax: 500,
    });
    expect(Object.keys(model.filterLayout.filterPockets)).toHaveLength(4);
    expect(
      Object.values(model.filterLayout.filterPockets).every(
        (pocket) => pocket.width === 496.2 && pocket.height === 495 && pocket.depth === 45.6,
      ),
    ).toBe(true);

    expect(model.fanLayout.topology).toBe("quad");
    if (model.fanLayout.topology !== "quad") {
      throw new Error("Expected tower fan layout");
    }
    expect(model.fanLayout.minimumCenterFromEdge).toBeCloseTo(130.6);
    expect(model.fanLayout.columns).toBe(3);
    expect(model.fanLayout.rows).toBe(3);
    expect(model.fanLayout.fanCount).toBe(9);
    expect(model.fanLayout.positionsX).toEqual([158.7, 308.7, 458.7]);
    expect(model.fanLayout.positionsY).toEqual([158.7, 308.7, 458.7]);

    expect(model.chunkGrid).toMatchObject({
      countX: 3,
      countY: 3,
      countZ: 2,
      totalCount: 18,
      chunkWidth: 617.4 / 3,
      chunkDepth: 617.4 / 3,
      chunkHeight: 255,
    });
    expect(model.cordPassThrough).toMatchObject({
      topology: "quad",
      type: "top-cylinder",
      diameter: 10,
      x: 539.8,
      y: 77.6,
      zStart: 500,
      depth: 10,
    });
  });

  test("grows every filter cavity by the fit clearance while the measured filter stays fixed", () => {
    const clearance = 2.5;
    const sandwichAt = (filterFitClearance: number) =>
      createTempestModel({
        ...defaultTempestSettings,
        frame: { ...defaultTempestSettings.frame, filterFitClearance },
      });
    const towerAt = (filterFitClearance: number) =>
      createTempestModel({
        ...defaultTempestSettings,
        arrangement: { type: "four-side-filter-tower", filter: defaultTempestTowerFilter, bottomFilter: false, feetLength: 0 },
        frame: { ...defaultTempestSettings.frame, filterFitClearance },
      });

    // Sandwich: the interior (box minus walls) is the measured footprint plus one
    // clearance per side, so the envelope grows by exactly 2*clearance. The
    // height grows by ONE clearance per filter pocket (filterPocketThickness) —
    // the thickness faces seal against flanges, so the pocket gets minimal play.
    const snugSandwich = sandwichAt(0);
    const easedSandwich = sandwichAt(clearance);
    const wall = defaultTempestSettings.frame.wallThickness;
    expect(snugSandwich.box.width - 2 * wall).toBe(defaultTempestHorizontalFilter.footprintWidth);
    expect(easedSandwich.box.width - snugSandwich.box.width).toBe(2 * clearance);
    expect(easedSandwich.box.depth - snugSandwich.box.depth).toBe(2 * clearance);
    expect(easedSandwich.box.height - snugSandwich.box.height).toBe(2 * clearance); // 2 filters * 1 clearance
    // The pocket between the flanges is the measured thickness plus one
    // clearance — a snug build clamps the filter exactly, an eased build leaves
    // slide-in room. This is the press-fit regression: the sandwich once kept
    // the pocket at bare thickness no matter the clearance.
    for (const [model, expectedPocket] of [
      [snugSandwich, defaultTempestHorizontalFilter.thickness],
      [easedSandwich, defaultTempestHorizontalFilter.thickness + clearance],
    ] as const) {
      if (model.filterLayout.topology !== "quad") {
        for (const pocket of model.filterLayout.filters) {
          expect(pocket.zTop - pocket.zBottom).toBe(expectedPocket);
        }
      }
    }

    // Quad: pockets grow by 2*clearance across the face and 1*clearance in the
    // thickness direction (the filter rests against the outer flange), and the
    // wall behind each pocket keeps its full thickness.
    const snugTowerLayout = towerAt(0).filterLayout;
    const easedTowerLayout = towerAt(clearance).filterLayout;
    if (snugTowerLayout.topology !== "quad" || easedTowerLayout.topology !== "quad") {
      throw new Error("Expected tower Tempest layouts");
    }
    expect(snugTowerLayout.filterPockets.front.width).toBe(defaultTempestTowerFilter.faceWidth);
    expect(snugTowerLayout.filterPockets.front.depth).toBe(defaultTempestTowerFilter.thickness);
    expect(easedTowerLayout.filterPockets.front.width - snugTowerLayout.filterPockets.front.width).toBe(2 * clearance);
    expect(easedTowerLayout.filterPockets.front.depth - snugTowerLayout.filterPockets.front.depth).toBe(clearance);
    expect(easedTowerLayout.filterPockets.front.height).toBe(snugTowerLayout.filterPockets.front.height);
    for (const towerLayout of [snugTowerLayout, easedTowerLayout]) {
      const frontRect = towerLayout.wallRects.front;
      expect(frontRect.xMax - frontRect.xMin).toBe(towerLayout.filterPockets.front.width);
      expect(frontRect.yMax - frontRect.yMin).toBe(towerLayout.filterPockets.front.depth);
      expect(towerLayout.structuralOffset - frontRect.yMax).toBe(wall);
    }
  });

  test("keeps chunk export selection explicit and clamps invalid chunk indexes", () => {
    const model = createTempestModel({
      ...defaultTempestSettings,
      printBed: {
        width: 1000,
        depth: 1000,
        height: 1000,
      },
      renderTarget: {
        type: "chunk",
        chunkIndex: {
          x: 9,
          y: -1,
          z: Number.NaN,
        },
        moveToOrigin: true,
      },
    });

    expect(model.chunkGrid.totalCount).toBe(1);
    expect(model.renderTarget).toEqual({
      type: "chunk",
      chunkIndex: {
        x: 0,
        y: 0,
        z: 0,
      },
      origin: {
        x: 0,
        y: 0,
        z: 0,
      },
      moveToOrigin: true,
    });
  });

  test("uses explicit automatic fan requests instead of the OpenSCAD -1 sentinel", () => {
    const model = createTempestModel({
      ...defaultTempestSettings,
      fan: {
        ...defaultTempestSettings.fan,
        wallRequests: {
          front: { type: "fixed", count: 99 },
          back: { type: "fixed", count: 1 },
          left: { type: "fixed", count: 0 },
          right: { type: "automatic" },
        },
      },
    });

    expect(model.fanLayout.topology).toBe("sandwich");
    if (model.fanLayout.topology !== "sandwich") {
      throw new Error("Expected horizontal fan layout");
    }
    expect(model.fanLayout.walls.front.maximumCount).toBe(3);
    expect(model.fanLayout.walls.front.actualCount).toBe(3);
    expect(model.fanLayout.walls.back.actualCount).toBe(1);
    expect(model.fanLayout.walls.left.actualCount).toBe(0);
    expect(model.fanLayout.walls.right.actualCount).toBe(3);
  });

  test("normalizes unsafe numeric boundary values before deriving geometry", () => {
    const model = createTempestModel({
      ...defaultTempestSettings,
      fan: {
        ...defaultTempestSettings.fan,
        wallRequests: {
          front: { type: "fixed", count: Number.NaN },
          back: { type: "fixed", count: Number.POSITIVE_INFINITY },
          left: { type: "fixed", count: 2.8 },
          right: { type: "automatic" },
        },
      },
      printBed: {
        width: 0,
        depth: Number.NaN,
        height: Number.POSITIVE_INFINITY,
      },
      alignmentPins: {
        type: "enabled",
        diameter: Number.NaN,
        holeDepth: Number.NEGATIVE_INFINITY,
        spacing: -4,
      },
    });

    expect(model.settings.printBed).toEqual(defaultTempestSettings.printBed);
    expect(model.settings.alignmentPins).toEqual(defaultTempestSettings.alignmentPins);
    expect(model.chunkGrid).toMatchObject({
      countX: 2,
      countY: 2,
      countZ: 2,
      totalCount: 8,
      chunkWidth: 253.1,
      chunkDepth: 253.1,
      chunkHeight: 131.6,
    });
    expect(model.fanLayout.topology).toBe("sandwich");
    if (model.fanLayout.topology !== "sandwich") {
      throw new Error("Expected horizontal fan layout");
    }
    expect(model.fanLayout.walls.front.actualCount).toBe(0);
    expect(model.fanLayout.walls.back.actualCount).toBe(0);
    expect(model.fanLayout.walls.left.actualCount).toBe(2);
    expect(model.fanLayout.walls.right.actualCount).toBe(3);
  });
});
