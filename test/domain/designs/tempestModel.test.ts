import { describe, expect, test } from "bun:test";
import {
  createTempestModel,
  defaultTempestSettings,
  defaultTempestTowerFilter,
  type TempestSettings,
} from "@/domain/designs/tempest/model";

describe("Tempest OpenSCAD model port", () => {
  test("ports the two-filter OpenSCAD defaults into deterministic dimensions and fan placement", () => {
    const model = createTempestModel();

    expect(model.settings.fan.opening).toEqual({
      type: "honeycomb",
      hexFlatToFlat: 10,
      ribThickness: 1.6,
    });
    expect(model.box).toEqual({
      width: 505,
      depth: 505,
      height: 262,
      wallHeight: 242,
    });
    expect(model.chunkGrid).toMatchObject({
      countX: 2,
      countY: 2,
      countZ: 2,
      totalCount: 8,
      chunkWidth: 252.5,
      chunkDepth: 252.5,
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
    expect(model.fanLayout.walls.left.positionsAlongWall).toEqual([102, 252.5, 403]);
    expect(model.fanLayout.walls.right.positionsAlongWall).toEqual([102, 252.5, 403]);

    expect(model.cordPassThrough).toMatchObject({
      topology: "sandwich",
      type: "wall-cylinder",
      wall: "right",
      side: "right",
      diameter: 8,
      positionAlongWall: 488,
      verticalCenter: 131,
      axis: "x",
    });
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

    expect(model.box).toEqual({
      width: 615,
      depth: 615,
      height: 510,
      wallHeight: 495,
    });
    expect(model.filterLayout.topology).toBe("quad");
    if (model.filterLayout.topology !== "quad") {
      throw new Error("Expected tower Tempest layout");
    }
    expect(model.filterLayout.structuralOffset).toBe(60);
    expect(model.filterLayout.airChamber).toEqual({
      xMin: 60,
      xMax: 555,
      yMin: 60,
      yMax: 555,
      zMin: 5,
      zMax: 500,
    });
    expect(Object.keys(model.filterLayout.filterPockets)).toHaveLength(4);
    expect(
      Object.values(model.filterLayout.filterPockets).every(
        (pocket) => pocket.width === 495 && pocket.height === 495 && pocket.depth === 45,
      ),
    ).toBe(true);

    expect(model.fanLayout.topology).toBe("quad");
    if (model.fanLayout.topology !== "quad") {
      throw new Error("Expected tower fan layout");
    }
    expect(model.fanLayout.minimumCenterFromEdge).toBe(130);
    expect(model.fanLayout.columns).toBe(3);
    expect(model.fanLayout.rows).toBe(3);
    expect(model.fanLayout.fanCount).toBe(9);
    expect(model.fanLayout.positionsX).toEqual([157.5, 307.5, 457.5]);
    expect(model.fanLayout.positionsY).toEqual([157.5, 307.5, 457.5]);

    expect(model.chunkGrid).toMatchObject({
      countX: 3,
      countY: 3,
      countZ: 2,
      totalCount: 18,
      chunkWidth: 205,
      chunkDepth: 205,
      chunkHeight: 255,
    });
    expect(model.cordPassThrough).toMatchObject({
      topology: "quad",
      type: "top-cylinder",
      wall: "right",
      side: "right",
      diameter: 8,
      x: 538,
      y: 538,
      zStart: 500,
      depth: 10,
      axis: "z",
    });
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
      chunkWidth: 252.5,
      chunkDepth: 252.5,
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
