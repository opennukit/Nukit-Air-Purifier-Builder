import { describe, expect, test } from "bun:test";
import { decodeSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import { createTempestModel } from "@/domain/designs/tempest/model";

const sandwich = "printDesign=nukit-tempest&tempestArrangement=dual-horizontal-sandwich";

describe("tempest filter slot wall (entry face)", () => {
  test("defaults to the back wall (renders at the visual top)", () => {
    const fan = createTempestSettingsFromLayout(createLayout(decodeSettings(sandwich)));
    expect(fan.filterSlot.wall).toBe("back");
  });

  test("the selected wall reaches the geometry and the loading slots", () => {
    const settings = createTempestSettingsFromLayout(createLayout(decodeSettings(`${sandwich}&filterSlotWall=left`)));
    expect(settings.filterSlot.wall).toBe("left");
    const model = createTempestModel(settings);
    if (model.filterLayout.topology !== "sandwich") throw new Error("expected a sandwich layout");
    expect(model.filterLayout.loading.type).toBe("wall-slots");
    if (model.filterLayout.loading.type === "wall-slots") {
      expect(model.filterLayout.loading.slots.every((slot) => slot.wall === "left")).toBe(true);
    }
  });

  test("round-trips through the URL and falls back on unknown values", () => {
    expect(
      new URLSearchParams(encodeSettings(decodeSettings(`${sandwich}&filterSlotWall=right`))).get("filterSlotWall"),
    ).toBe("right");
    const settings = createTempestSettingsFromLayout(createLayout(decodeSettings(`${sandwich}&filterSlotWall=bogus`)));
    expect(settings.filterSlot.wall).toBe("back");
  });
});
