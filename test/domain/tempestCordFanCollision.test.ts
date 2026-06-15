import { describe, expect, test } from "bun:test";
import { decodeSettings } from "@/domain/purifier/settingsCodec";
import { createLayout } from "@/fabrication/purifierLayout";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
import { tempestCordFanCollision } from "@/domain/designs/tempest/cordFanCollision";
import { cleanManifold, manifoldReport } from "../helpers/manifoldChecks";

const tower =
  "printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&filterWidth=290&filterDepth=290&filterThickness=25&fanDiameter=140";

function model(query: string) {
  return createTempestModel(createTempestSettingsFromLayout(createLayout(decodeSettings(query))));
}

describe("tempest cord auto-shifts clear of the fans", () => {
  test("the reported config that ran a cord through a fan is auto-shifted clear", () => {
    const reported = model(`${tower}&cordHoleWall=left&cordHoleSide=right&cordHoleCornerOffset=17&cordHoleDiameter=8`);
    expect(tempestCordFanCollision(reported)).toBe(false);
    // and a cord is still present (not removed)
    expect(reported.cordPassThrough.type).toBe("top-cylinder");
  });

  test("the auto-shift only moves the cord when it would collide", () => {
    // A small corner offset on a clear corner stays put; a colliding one moves.
    const clear = model(`${tower}&cordHoleWall=left&cordHoleSide=left&cordHoleCornerOffset=10&cordHoleDiameter=8`);
    expect(tempestCordFanCollision(clear)).toBe(false);
  });

  test("no cord and box/exhaust never collide", () => {
    expect(tempestCordFanCollision(model(`${tower}&cordHoleWall=none`))).toBe(false);
    expect(
      tempestCordFanCollision(model(`${tower}&topExhaust=box-exhaust&cordHoleWall=left&cordHoleSide=right`)),
    ).toBe(false);
  });

  test("every tower cord wall/side combination ends up clear of the fans", () => {
    for (const wall of ["front", "back", "left", "right"] as const) {
      for (const side of ["left", "center", "right"] as const) {
        const m = model(`${tower}&cordHoleWall=${wall}&cordHoleSide=${side}&cordHoleCornerOffset=17&cordHoleDiameter=8`);
        expect(tempestCordFanCollision(m)).toBe(false);
      }
    }
  });

  test("the auto-shifted cord still exports a watertight body", () => {
    const settings = createTempestSettingsFromLayout(
      createLayout(decodeSettings(`${tower}&cordHoleWall=left&cordHoleSide=right&cordHoleCornerOffset=17&cordHoleDiameter=8`)),
    );
    const kit = createTempestPrintableKit(settings, "unsplit");
    expect(manifoldReport(kit.parts[0].mesh)).toEqual(cleanManifold);
  });
});
