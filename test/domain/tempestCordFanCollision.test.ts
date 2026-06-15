import { describe, expect, test } from "bun:test";
import { decodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { tempestCordFanCollision } from "@/domain/designs/tempest/cordFanCollision";

const tower =
  "printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&filterWidth=290&filterDepth=290&filterThickness=25&fanDiameter=140";

function collides(query: string): boolean {
  return tempestCordFanCollision(createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(query)))));
}

describe("tempest cord/fan collision", () => {
  test("flags the reported tower cord that runs through a fan body", () => {
    expect(collides(`${tower}&cordHoleWall=left&cordHoleSide=right&cordHoleCornerOffset=17&cordHoleDiameter=8`)).toBe(true);
  });

  test("no cord means no collision", () => {
    expect(collides(`${tower}&cordHoleWall=none`)).toBe(false);
  });

  test("box/exhaust has no PC fans, so no collision", () => {
    expect(collides(`${tower}&topExhaust=box-exhaust&cordHoleWall=left&cordHoleSide=right`)).toBe(false);
  });

  test("the horizontal sandwich (cord clears fans vertically) does not flag", () => {
    expect(
      collides(
        "printDesign=nukit-tempest&tempestArrangement=dual-horizontal-sandwich&cordHoleWall=left&cordHoleSide=right&cordHoleDiameter=8",
      ),
    ).toBe(false);
  });
});
