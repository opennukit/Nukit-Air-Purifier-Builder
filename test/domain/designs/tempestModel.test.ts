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
    });
    // 495 measured footprint + 2*1 fit clearance + 2*5 walls.
    expect(model.box).toEqual({
      width: 507,
      depth: 507,
      height: 262,
      wallHeight: 242,
    });
    expect(model.chunkGrid).toMatchObject({
      countX: 2,
      countY: 2,
      countZ: 2,
      totalCount: 8,
      chunkWidth: 253.5,
      chunkDepth: 253.5,
      chunkHeight: 131,
    });
    expect(model.filterLayout.topology).toBe("sandwich");
    if (model.filterLayout.topology !== "sandwich") {
      throw new Error("Expected horizontal Tempest layout");
    }
    expect(model.filterLayout.filterCount).toBe(2);
    expect(model.filterLayout.bottomPanel).toBe("open-frame");
    expect(model.filterLayout.filters.map((filter) => filter.zBottom)).toEqual([10, 207]);
    expect(model.filterLayout.flanges.map((flange) => [flange.type, flange.zBottom, flange.zTop])).toEqual([
      ["above-filter", 55, 60],
      ["below-filter", 202, 207],
    ]);
    expect(model.filterLayout.loading.slots.map((slot) => [slot.wall, slot.localZBottom, slot.localZTop])).toEqual([
      ["back", 0, 46],
      ["back", 196, 242],
    ]);

    expect(model.fanLayout.topology).toBe("sandwich");
    if (model.fanLayout.topology !== "sandwich") {
      throw new Error("Expected horizontal fan layout");
    }
    expect(model.fanLayout.bodyDepth).toBe(27);
    expect(model.fanLayout.screwPitch).toBe(125);
    expect(model.fanLayout.cornerSafeMinimum).toBe(102);
    expect(model.fanLayout.localVerticalCenter).toBe(121);
    expect(model.fanLayout.walls.front.actualCount).toBe(0);
    expect(model.fanLayout.walls.back.actualCount).toBe(0);
    expect(model.fanLayout.walls.left.actualCount).toBe(3);
    expect(model.fanLayout.walls.left.positionsAlongWall).toEqual([102, 253.5, 405]);
    expect(model.fanLayout.walls.right.positionsAlongWall).toEqual([102, 253.5, 405]);

    // The dual sandwich stands upright (build +y up, front wall = floor), so the
    // cord hole sits one corner-safe offset (17) above the wall's floor end and on
    // the standing depth midline (131 = height/2), inside the fan chamber.
    expect(model.cordPassThrough).toMatchObject({
      topology: "sandwich",
      type: "wall-cylinder",
      wall: "right",
      side: "right",
      diameter: 8,
      positionAlongWall: 17,
      verticalCenter: 131,
      axis: "x",
    });
  });

  test("dual sandwich cord hole lands near the standing floor after the upright pose", () => {
    const model = createTempestModel();
    expect(model.printablePose.type).toBe("upright-dual-filter");
    if (model.cordPassThrough.type === "none" || model.cordPassThrough.topology !== "sandwich") {
      throw new Error("Expected a sandwich wall cord");
    }
    // upright-dual-filter maps source (x, y, z) -> posed (x, boxHeight - z, y), so
    // the cord hole's standing height is its position along the left/right wall.
    const standingHeight = model.cordPassThrough.positionAlongWall;
    const floorClearance =
      model.frame.wallThickness + model.cordPassThrough.diameter / 2;
    expect(standingHeight).toBeGreaterThanOrEqual(floorClearance);
    expect(standingHeight).toBeLessThanOrEqual(floorClearance + 10);
  });

  test("single-filter sandwich keeps its as-modelled pose and side-positioned cord", () => {
    const model = createTempestModel({
      ...defaultTempestSettings,
      arrangement: { type: "single-horizontal-top-filter", filter: defaultTempestHorizontalFilter },
    });
    expect(model.printablePose.type).toBe("source");
    if (model.cordPassThrough.type === "none" || model.cordPassThrough.topology !== "sandwich") {
      throw new Error("Expected a sandwich wall cord");
    }
    // side "right" along the 507 wall with the 17 corner offset.
    expect(model.cordPassThrough.positionAlongWall).toBe(490);
    expect(model.cordPassThrough.verticalCenter).toBe(model.box.height / 2);
  });

  test("models the four-filter tower as a different arrangement instead of widening horizontal filter count", () => {
    const settings: TempestSettings = {
      ...defaultTempestSettings,
      arrangement: {
        type: "four-side-filter-tower",
        filter: defaultTempestTowerFilter,
      },
    };
    const model = createTempestModel(settings);

    // 495 face + 2*1 fit clearance + 2*61 structural offset (the offset itself
    // carries the 1mm pocket-depth clearance: 10 flange + 45+1 pocket + 5 wall).
    expect(model.box).toEqual({
      width: 619,
      depth: 619,
      height: 510,
      wallHeight: 495,
    });
    expect(model.filterLayout.topology).toBe("quad");
    if (model.filterLayout.topology !== "quad") {
      throw new Error("Expected tower Tempest layout");
    }
    expect(model.filterLayout.structuralOffset).toBe(61);
    expect(model.filterLayout.airChamber).toEqual({
      xMin: 61,
      xMax: 558,
      yMin: 61,
      yMax: 558,
      zMin: 5,
      zMax: 500,
    });
    expect(Object.keys(model.filterLayout.filterPockets)).toHaveLength(4);
    expect(
      Object.values(model.filterLayout.filterPockets).every(
        (pocket) => pocket.width === 497 && pocket.height === 495 && pocket.depth === 46,
      ),
    ).toBe(true);

    expect(model.fanLayout.topology).toBe("quad");
    if (model.fanLayout.topology !== "quad") {
      throw new Error("Expected tower fan layout");
    }
    expect(model.fanLayout.minimumCenterFromEdge).toBe(131);
    expect(model.fanLayout.columns).toBe(3);
    expect(model.fanLayout.rows).toBe(3);
    expect(model.fanLayout.fanCount).toBe(9);
    expect(model.fanLayout.positionsX).toEqual([159.5, 309.5, 459.5]);
    expect(model.fanLayout.positionsY).toEqual([159.5, 309.5, 459.5]);

    expect(model.chunkGrid).toMatchObject({
      countX: 3,
      countY: 3,
      countZ: 2,
      totalCount: 18,
      chunkWidth: 619 / 3,
      chunkDepth: 619 / 3,
      chunkHeight: 255,
    });
    expect(model.cordPassThrough).toMatchObject({
      topology: "quad",
      type: "top-cylinder",
      diameter: 8,
      x: 541,
      y: 541,
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
        arrangement: { type: "four-side-filter-tower", filter: defaultTempestTowerFilter },
        frame: { ...defaultTempestSettings.frame, filterFitClearance },
      });

    // Sandwich: the interior (box minus walls) is the measured footprint plus one
    // clearance per side, so the envelope grows by exactly 2*clearance.
    const snugSandwich = sandwichAt(0);
    const easedSandwich = sandwichAt(clearance);
    const wall = defaultTempestSettings.frame.wallThickness;
    expect(snugSandwich.box.width - 2 * wall).toBe(defaultTempestHorizontalFilter.footprintWidth);
    expect(easedSandwich.box.width - snugSandwich.box.width).toBe(2 * clearance);
    expect(easedSandwich.box.depth - snugSandwich.box.depth).toBe(2 * clearance);
    expect(easedSandwich.box.height).toBe(snugSandwich.box.height);

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
      chunkWidth: 253.5,
      chunkDepth: 253.5,
      chunkHeight: 131,
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
