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
  test("the backPlateFans toggle survives the URL round-trip", () => {
    const round = new URLSearchParams(
      encodeSettings(decodeSettings(`${oneSide}&backPlateFans=true`)),
    );
    expect(round.get("backPlateFans")).toBe("true");
  });

  test("the toggle survives normalization (not dropped to the default)", () => {
    expect(
      normalizeRawSettings({
        ...defaultSettings,
        printDesign: "nukit-tempest",
        tempestArrangement: "single-horizontal-top-filter",
        backPlateFans: true,
      } as const).backPlateFans,
    ).toBe(true);
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
