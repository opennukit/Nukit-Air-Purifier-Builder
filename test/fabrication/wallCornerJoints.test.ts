import { describe, expect, test } from "bun:test";
import { defaultSettings, type RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { createLayout, requireCutPanelFabricationPlan } from "@/fabrication/purifierLayout";
import type { CutPanel, RectCut } from "@/fabrication/laser/cutGeometry";

// The four vertical box corners join a fan wall to a side wall with a boxes.py
// finger joint: the fan wall's edge fingers ("f") pass through the side wall's
// finger HOLES ("h"). For the parts to assemble, the fan wall's fingers and the
// side wall's holes must land at the SAME positions along the shared corner.
// Both are derived from the same edge length (the chamber height) via calcFingers,
// so they must match exactly. This guards that invariant across dimensions.

function panel(plan: ReturnType<typeof requireCutPanelFabricationPlan>, id: string): CutPanel {
  const found = plan.cutPanels.find((p) => p.id === id);
  if (found === undefined) {
    throw new Error(`missing panel ${id}`);
  }
  return found;
}

// Y-centres of the finger-hole column nearest the panel's right ("h") edge.
function sideWallHoleCentres(side: CutPanel): number[] {
  const holes = side.cuts.filter((cut): cut is RectCut => cut.type === "rect" && cut.role === "finger-hole");
  const maxX = Math.max(...holes.map((cut) => cut.x + cut.width / 2));
  return holes
    .filter((cut) => Math.abs(cut.x + cut.width / 2 - maxX) < 1)
    .map((cut) => cut.y + cut.height / 2)
    .sort((a, b) => a - b);
}

// Y-midpoints of the fan wall's teeth on its right edge (max-x protrusions).
function fanWallToothCentres(fan: CutPanel): number[] {
  const maxX = Math.max(...fan.outline.map((point) => point.x));
  const centres: number[] = [];
  for (let i = 0; i < fan.outline.length; i += 1) {
    const a = fan.outline[i]!;
    const b = fan.outline[(i + 1) % fan.outline.length]!;
    if (Math.abs(a.x - maxX) < 0.3 && Math.abs(b.x - maxX) < 0.3 && Math.abs(a.y - b.y) > 0.5) {
      centres.push((a.y + b.y) / 2);
    }
  }
  return centres.sort((a, b) => a - b);
}

function cornerMismatch(raw: RawPurifierSettings): string | null {
  const plan = requireCutPanelFabricationPlan(createLayout(raw), "wallCornerJoints");
  const side = panel(plan, "left-side-wall");
  const fan = panel(plan, "bottom-fan-wall");
  const holes = sideWallHoleCentres(side);
  const teeth = fanWallToothCentres(fan);
  if (holes.length === 0 || teeth.length === 0) {
    return `no fingers/holes (holes=${holes.length} teeth=${teeth.length})`;
  }
  if (holes.length !== teeth.length) {
    return `count holes=${holes.length} teeth=${teeth.length}`;
  }
  for (let i = 0; i < holes.length; i += 1) {
    if (Math.abs(holes[i]! - teeth[i]!) > 0.5) {
      return `position #${i} hole=${holes[i]!.toFixed(2)} tooth=${teeth[i]!.toFixed(2)}`;
    }
  }
  return null;
}

describe("wall corner finger joints", () => {
  test("the default housing's fan fingers mesh with the side-wall holes", () => {
    expect(cornerMismatch(defaultSettings)).toBeNull();
  });

  test("fan fingers mesh with side-wall holes across filter counts, fan sizes, thicknesses, and footprints", () => {
    const failures: string[] = [];
    for (const filters of [1, 2] as const) {
      for (const fanDiameter of [60, 80, 92, 120, 140]) {
        for (const materialThickness of [3, 4, 5, 6]) {
          for (const [filterWidth, filterDepth] of [
            [370, 290],
            [290, 370],
            [500, 400],
            [250, 250],
          ] as const) {
            for (const splitFrames of [true, false] as const) {
              const raw = {
                ...defaultSettings,
                filters,
                fanDiameter,
                materialThickness,
                filterWidth,
                filterDepth,
                filterThickness: 40,
                rim: 30,
                splitFrames,
              } as RawPurifierSettings;
              const mismatch = cornerMismatch(raw);
              if (mismatch !== null) {
                failures.push(
                  `filters=${filters} fan=${fanDiameter} t=${materialThickness} ${filterWidth}x${filterDepth} split=${splitFrames}: ${mismatch}`,
                );
              }
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
