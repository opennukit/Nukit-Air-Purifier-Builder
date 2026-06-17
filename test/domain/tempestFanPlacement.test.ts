import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import {
  applyTempestArrangementDefaults,
  defaultSettings,
} from "@/domain/purifier/settingsModel";
import { normalizeRawSettings } from "@/domain/purifier/airPurifier";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { matchTopology } from "@/domain/designs/tempest/topology";
import { tempestPinPlacementsClearOfFans } from "@/fabrication/printing/designs/tempest/geometry/pins";

const oneSide =
  "printDesign=nukit-tempest&tempestArrangement=single-horizontal-top-filter&fanDiameter=140&filterWidth=370&filterDepth=290&filterThickness=40";

const sandwich =
  "printDesign=nukit-tempest&tempestArrangement=dual-horizontal-sandwich&fanDiameter=140";

describe("tempest per-wall fan placement (1-top / 2-sandwich)", () => {
  test("editable per-wall fan counts survive the URL round-trip", () => {
    const url = `${sandwich}&fansTop=2&fansLeft=-1&fansRight=-1&fansBottom=1`;
    const round = new URLSearchParams(encodeSettings(decodeSettings(url)));
    expect(round.get("fansTop")).toBe("2");
    expect(round.get("fansLeft")).toBe("-1"); // automatic
    expect(round.get("fansBottom")).toBe("1");
  });

  test("the wall requests reach the tempest geometry settings", () => {
    const fan = createTempestSettingsFromLayout(
      createLayout(decodeSettings(`${sandwich}&fansTop=2&fansLeft=-1`)),
    ).fan;
    expect(fan.wallRequests.back).toEqual({ type: "fixed", count: 2 }); // "Top" -> back wall (visual top)
    expect(fan.wallRequests.left.type).toBe("automatic"); // -1 -> automatic
  });

  test("the four-side tower forces side walls to 0 but keeps the top-fan toggle", () => {
    const raw = {
      ...defaultSettings,
      printDesign: "nukit-tempest",
      tempestArrangement: "four-side-filter-tower",
      fansTop: -1, // top grid on
      fansLeft: 3,
      fansRight: 3,
      fansBottom: 3,
    } as const;
    const out = normalizeRawSettings(raw);
    expect(out.fansLeft).toBe(0);
    expect(out.fansRight).toBe(0);
    expect(out.fansBottom).toBe(0);
    expect(out.fansTop).toBe(-1); // preserved: the top-panel fan grid toggle

    // turning the top off (0) is preserved too
    expect(normalizeRawSettings({ ...raw, fansTop: 0 }).fansTop).toBe(0);
  });

  test("switching arrangement resets the per-wall banks to its defaults", () => {
    const edited = decodeSettings(`${sandwich}&fansTop=2&fansBottom=2`);
    const switched = applyTempestArrangementDefaults(
      edited,
      "single-horizontal-top-filter",
    );
    // single-top defaults: sides automatic (-1), top/bottom 0
    expect(switched.fansTop).toBe(0);
    expect(switched.fansBottom).toBe(0);
    expect(switched.fansLeft).toBe(-1);
  });
});

describe('tempest "Back" fan grid (single-filter bottom plate)', () => {
  test("the backPlateFans count survives the URL round-trip", () => {
    const round = new URLSearchParams(encodeSettings(decodeSettings(`${oneSide}&backPlateFans=3`)));
    expect(round.get("backPlateFans")).toBe("3");
  });

  test("the legacy boolean form decodes to automatic / none", () => {
    expect(new URLSearchParams(encodeSettings(decodeSettings(`${oneSide}&backPlateFans=true`))).get("backPlateFans")).toBe("-1");
    expect(new URLSearchParams(encodeSettings(decodeSettings(`${oneSide}&backPlateFans=false`))).get("backPlateFans")).toBe("0");
  });

  test("the count survives normalization (not dropped to the default)", () => {
    expect(
      normalizeRawSettings({
        ...defaultSettings,
        printDesign: "nukit-tempest",
        tempestArrangement: "single-horizontal-top-filter",
        backPlateFans: -1,
      } as const).backPlateFans,
    ).toBe(-1);
  });

  test("a checked Back toggle fills a fan grid on the one-side bottom plate", () => {
    const settings = createTempestSettingsFromLayout(
      createLayout(decodeSettings(`${oneSide}&backPlateFans=true`)),
    );
    expect(settings.fan.bottomPlateFans).toEqual({ type: "automatic" });
    const grid = matchTopology(createTempestModel(settings).fanLayout, {
      quad: () => ({ fanCount: 0 }),
      sandwich: (fans) => fans.bottomPlate,
    });
    expect(grid.fanCount).toBeGreaterThan(0);
  });

  test("a fixed back count keeps that many fans, up to the grid maximum", () => {
    const at = (count: number) => {
      const m = createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(`${oneSide}&backPlateFans=${count}`))));
      if (m.topology !== "sandwich") throw new Error("expected sandwich");
      return m.fanLayout.bottomPlate;
    };
    const auto = at(-1);
    expect(auto.fanCount).toBe(auto.maximumCount);
    expect(auto.maximumCount).toBeGreaterThan(1);
    expect(at(2).fanCount).toBe(2);
    expect(at(1).fanCount).toBe(1);
    // Asking for more than fit is capped at the maximum.
    expect(at(auto.maximumCount + 5).fanCount).toBe(auto.maximumCount);
  });

  test("the bottom plate stays solid when Back is off", () => {
    const grid = matchTopology(
      createTempestModel(
        createTempestSettingsFromLayout(createLayout(decodeSettings(oneSide))),
      ).fanLayout,
      {
        quad: () => ({ fanCount: 0 }),
        sandwich: (fans) => fans.bottomPlate,
      },
    );
    expect(grid.fanCount).toBe(0);
  });
});

describe('tempest "Box depth" (one-side panel chamber)', () => {
  const modelFor = (url: string) =>
    createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(url))));

  // The chamber between the inside filter flange and the inside back wall.
  const chamberDepth = (m: ReturnType<typeof modelFor>) => {
    if (m.topology !== "sandwich") throw new Error("expected sandwich");
    return m.box.height - 2 * m.frame.outsideFlangeThickness - m.frame.insideFlangeThickness -
      (m.settings.arrangement.type === "four-side-filter-tower" ? 0 : m.settings.arrangement.filter.thickness);
  };

  test("boxDepth survives the URL round-trip", () => {
    const round = new URLSearchParams(
      encodeSettings(decodeSettings(`${oneSide}&backPlateFans=true&boxDepth=72`)),
    );
    expect(round.get("boxDepth")).toBe("72");
  });

  test("with Back on and no wall fans, the chamber depth equals boxDepth", () => {
    const panel = "&fansLeft=0&fansRight=0&fansTop=0&fansBottom=0";
    expect(chamberDepth(modelFor(`${oneSide}&backPlateFans=true&boxDepth=50${panel}`))).toBeCloseTo(50);
    expect(chamberDepth(modelFor(`${oneSide}&backPlateFans=true&boxDepth=120${panel}`))).toBeCloseTo(120);
  });

  test("with Back off, boxDepth is ignored (fan-diameter drives the chamber)", () => {
    const off = modelFor(`${oneSide}&backPlateFans=false&boxDepth=50`);
    // 140mm fan + padding, never the 50mm panel depth.
    expect(chamberDepth(off)).toBeGreaterThan(140);
  });

  test("engaging side fans reverts to a tall box so those fans fit", () => {
    // A side fan disables the shallow panel depth, so the fan-driven height
    // returns and the side fans are present (not silently dropped).
    const m = modelFor(`${oneSide}&backPlateFans=true&boxDepth=50&fansLeft=-1&fansRight=-1`);
    if (m.topology !== "sandwich") throw new Error("expected sandwich");
    expect(m.settings.oneSidePanelDepth).toBeUndefined();
    expect(m.box.wallHeight).toBeGreaterThanOrEqual(m.settings.fan.diameter);
    expect(m.fanLayout.walls.left.actualCount).toBeGreaterThan(0);
    expect(m.fanLayout.walls.right.actualCount).toBeGreaterThan(0);
  });

  test("panel depth is ignored once any wall fan is engaged", () => {
    const m = modelFor(`${oneSide}&backPlateFans=true&boxDepth=50&fansTop=-1`);
    expect(m.settings.oneSidePanelDepth).toBeUndefined();
    // Fan-diameter drives the (tall) box, not the 50mm panel depth.
    expect(m.box.height).toBeGreaterThan(180);
  });
});

describe('tempest "Back" panel cord placement', () => {
  const modelFor = (url: string) =>
    createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(url))));

  test("the cord auto-centres midway between the back fan and the inside filter flange", () => {
    const m = modelFor(`${oneSide}&backPlateFans=true&boxDepth=80&cordHoleWall=right&cordHoleDiameter=8`);
    if (m.topology !== "sandwich" || m.cordPassThrough.type !== "wall-cylinder") throw new Error("expected sandwich cord");
    const flange = m.frame.outsideFlangeThickness;
    const fanBodyTop = flange + 27; // 140mm fan body depth
    const insideFilterFlange = m.box.height - flange - m.settings.arrangement.filter.thickness - m.frame.wallThickness;
    const vc = m.cordPassThrough.verticalCenter;
    expect(vc).toBeCloseTo((fanBodyTop + insideFilterFlange) / 2);
    // and it sits strictly between the two (clear of both)
    expect(vc).toBeGreaterThan(fanBodyTop);
    expect(vc).toBeLessThan(insideFilterFlange);
  });

  test("without Back fans the cord stays box-centred (unchanged wall mount)", () => {
    const m = modelFor(`${oneSide}&backPlateFans=false&cordHoleWall=right&cordHoleDiameter=8`);
    if (m.topology !== "sandwich" || m.cordPassThrough.type !== "wall-cylinder") throw new Error("expected sandwich cord");
    expect(m.cordPassThrough.verticalCenter).toBeCloseTo(m.box.height / 2);
  });
});

describe('tempest "Back" panel alignment pins clear the fan grid', () => {
  // A 370x290 filter exceeds the 256mm bed, so the panel splits and grows seam
  // pins on the solid bottom plate the back grid bores.
  const split =
    "printDesign=nukit-tempest&tempestArrangement=single-horizontal-top-filter&filterWidth=370&filterDepth=290&filterThickness=40&fanDiameter=140&fansLeft=0&fansRight=0&fansTop=0&fansBottom=0&boxDepth=70";
  const buildPlatePins = (backOn: boolean) => {
    const m = createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(`${split}&backPlateFans=${backOn}`))));
    if (m.topology !== "sandwich") throw new Error("expected sandwich");
    const plateZ = m.frame.outsideFlangeThickness / 2;
    const pins = tempestPinPlacementsClearOfFans(m, m.chunkGrid).filter((p) => Math.abs(p.position[2] - plateZ) < 1e-6);
    return { m, pins };
  };

  test("the panel actually splits and grows bottom-plate seam pins", () => {
    const { m, pins } = buildPlatePins(true);
    expect(m.chunkGrid.countX * m.chunkGrid.countY).toBeGreaterThan(1);
    expect(pins.length).toBeGreaterThan(0);
  });

  test("no bottom-plate pin sits inside a back fan opening or screw hole", () => {
    const { m, pins } = buildPlatePins(true);
    if (m.topology !== "sandwich") throw new Error("expected sandwich");
    const r = m.settings.fan.diameter / 2;
    const screwDelta = m.fanLayout.screwPitch / 2;
    const screwR = m.settings.fan.screwHoleDiameter / 2;
    const holes = m.fanLayout.bottomPlate.positions.flatMap(({ x, y }) => [
      { cx: x, cy: y, rr: r },
      ...[x - screwDelta, x + screwDelta].flatMap((sx) => [y - screwDelta, y + screwDelta].map((sy) => ({ cx: sx, cy: sy, rr: screwR }))),
    ]);
    for (const p of pins) {
      const [px, py] = p.position;
      for (const h of holes) {
        expect(Math.hypot(px - h.cx, py - h.cy) >= h.rr).toBe(true);
      }
    }
  });

  test("some bottom-plate pins are shortened to clear the holes, only when Back is on", () => {
    expect(buildPlatePins(true).pins.some((p) => p.holeDepth !== undefined)).toBe(true);
    // Without the back grid the same plate pins are all full-depth.
    expect(buildPlatePins(false).pins.every((p) => p.holeDepth === undefined)).toBe(true);
  });

  test("no bottom-plate pin lands on a piece edge or 4-way chunk corner", () => {
    const { m, pins } = buildPlatePins(true);
    if (m.topology !== "sandwich" || m.settings.alignmentPins.type !== "enabled") throw new Error("expected sandwich w/ pins");
    const clearance = m.settings.alignmentPins.holeDepth + m.settings.alignmentPins.diameter;
    const interiorX = m.chunkGrid.boundariesX.slice(1, -1);
    const interiorY = m.chunkGrid.boundariesY.slice(1, -1);
    for (const p of pins) {
      // a pin runs along its seam axis; its free in-plane coordinate is the other axis
      const free = p.axis === "x" ? p.position[1] : p.position[0];
      const extent = p.axis === "x" ? m.box.depth : m.box.width;
      const perp = p.axis === "x" ? interiorY : interiorX;
      expect(free).toBeGreaterThan(clearance); // off the near outer edge
      expect(free).toBeLessThan(extent - clearance); // off the far outer edge
      for (const seam of perp) {
        expect(Math.abs(free - seam)).toBeGreaterThanOrEqual(clearance); // off the 4-way corner
      }
    }
  });
});

describe('tempest "Back" fan collision with wall fans', () => {
  const modelFor = (url: string) =>
    createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(url))));
  const backCount = (url: string) => {
    const m = modelFor(url);
    if (m.topology !== "sandwich") throw new Error("expected sandwich");
    return m.fanLayout.bottomPlate.fanCount;
  };

  test("back fans clear of the walls are all kept", () => {
    // No wall fans: the full grid stands.
    expect(backCount(`${oneSide}&backPlateFans=true&fansTop=0&fansBottom=0&fansLeft=0&fansRight=0`)).toBeGreaterThan(0);
  });

  test("back fans that would hit front/back wall fans are dropped", () => {
    const clear = backCount(`${oneSide}&backPlateFans=true&fansTop=0&fansBottom=0&fansLeft=0&fansRight=0`);
    const collided = backCount(`${oneSide}&backPlateFans=true&fansTop=-1&fansBottom=-1&fansLeft=0&fansRight=0`);
    expect(collided).toBeLessThan(clear);
  });

  test("no back fan body overlaps a wall fan body (3D footprints stay clear)", () => {
    const m = modelFor(`${oneSide}&backPlateFans=true&fansTop=-1&fansBottom=-1&fansLeft=-1&fansRight=-1&boxDepth=50`);
    if (m.topology !== "sandwich") throw new Error("expected sandwich");
    const fl = m.fanLayout;
    const r = m.settings.fan.diameter / 2;
    // Project both onto the bottom plane; a back fan must be clear on x or y of
    // every wall fan's in-plane centre (square frames, like the cord check).
    const wallCentres: Array<[number, number]> = [
      ...fl.walls.front.positionsAlongWall.map((p): [number, number] => [p, 0]),
      ...fl.walls.back.positionsAlongWall.map((p): [number, number] => [m.box.width - p, m.box.depth]),
      ...fl.walls.left.positionsAlongWall.map((p): [number, number] => [0, m.box.depth - p]),
      ...fl.walls.right.positionsAlongWall.map((p): [number, number] => [m.box.width, p]),
    ];
    for (const { x, y } of fl.bottomPlate.positions) {
      for (const [wx, wy] of wallCentres) {
        // bodies only collide when close on BOTH axes; require clearance on one.
        expect(Math.abs(x - wx) >= r || Math.abs(y - wy) >= r).toBe(true);
      }
    }
  });
});
