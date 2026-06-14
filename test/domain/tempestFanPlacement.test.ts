import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import {
  applyTempestArrangementDefaults,
  defaultSettings,
} from "@/domain/purifier/settingsModel";
import { normalizeRawSettings } from "@/domain/purifier/airPurifier";

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

  test("the four-side tower ignores per-wall edits (no editable wall fans)", () => {
    const raw = {
      ...defaultSettings,
      printDesign: "nukit-tempest",
      tempestArrangement: "four-side-filter-tower",
      fansTop: 2,
      fansLeft: 3,
    } as const;
    const out = normalizeRawSettings(raw);
    expect(out.fansTop).toBe(0);
    expect(out.fansLeft).toBe(0);
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
