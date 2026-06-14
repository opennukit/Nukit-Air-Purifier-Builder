import { describe, expect, test } from "bun:test";
import { decodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import { createTempestModel } from "@/domain/designs/tempest/model";

function towerBox(width: number, depth: number) {
  const url = `printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&filterWidth=${width}&filterDepth=${depth}&filterThickness=19`;
  return createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(url)))).box;
}

describe("four-side tower box orientation", () => {
  test("a wide filter makes a wide, squat box", () => {
    const box = towerBox(622, 495);
    expect(box.width).toBeGreaterThan(box.height);
  });

  test("a long filter makes a tall box", () => {
    const box = towerBox(495, 622);
    expect(box.height).toBeGreaterThan(box.width);
  });

  test("swapping width and length changes the box (not the same aspect ratio)", () => {
    const wide = towerBox(622, 495);
    const tall = towerBox(495, 622);
    // footprint follows width; height follows length
    expect(wide.width).toBeGreaterThan(tall.width);
    expect(tall.height).toBeGreaterThan(wide.height);
  });
});
