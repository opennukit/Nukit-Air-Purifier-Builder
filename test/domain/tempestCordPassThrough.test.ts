import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";

function model(query: string) {
  return createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(query))));
}

describe("tempest cord pass-through settings", () => {
  test("wall=none disables the cord", () => {
    const settings = createTempestSettingsFromLayout(createLayout(decodeSettings("printDesign=nukit-tempest&cordHoleWall=none")));
    expect(settings.cordPassThrough).toEqual({ type: "none" });
    expect(model("printDesign=nukit-tempest&cordHoleWall=none").cordPassThrough.type).toBe("none");
  });

  test("a 0 cord-hole diameter disables the cord (means none)", () => {
    const settings = createTempestSettingsFromLayout(
      createLayout(decodeSettings("printDesign=nukit-tempest&cordHoleWall=left&cordHoleDiameter=0")),
    );
    expect(settings.cordPassThrough).toEqual({ type: "none" });
    // a real diameter restores it
    expect(
      createTempestSettingsFromLayout(
        createLayout(decodeSettings("printDesign=nukit-tempest&cordHoleWall=left&cordHoleDiameter=8")),
      ).cordPassThrough.type,
    ).toBe("wall");
  });

  test("sandwich routes the cord through the chosen wall", () => {
    const cord = model(
      "printDesign=nukit-tempest&tempestArrangement=dual-horizontal-sandwich&cordHoleWall=left&cordHoleSide=center&cordHoleDiameter=10&cordHoleCornerOffset=20",
    ).cordPassThrough;
    expect(cord.type).toBe("wall-cylinder");
    if (cord.type === "wall-cylinder") {
      expect(cord.wall).toBe("left");
      expect(cord.diameter).toBe(10);
    }
  });

  test("tower routes the cord through the top plate", () => {
    const cord = model(
      "printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&cordHoleWall=right&cordHoleSide=right",
    ).cordPassThrough;
    expect(cord.type).toBe("top-cylinder");
  });

  test("round-trips wall/side/offset through the URL", () => {
    const params = new URLSearchParams(
      encodeSettings(decodeSettings("printDesign=nukit-tempest&cordHoleWall=front&cordHoleSide=left&cordHoleCornerOffset=25")),
    );
    expect(params.get("cordHoleWall")).toBe("front");
    expect(params.get("cordHoleSide")).toBe("left");
    expect(params.get("cordHoleCornerOffset")).toBe("25");
  });
});
