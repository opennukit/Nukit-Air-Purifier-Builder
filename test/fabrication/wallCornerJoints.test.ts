import { describe, expect, test } from "bun:test";
import { Euler, Vector3 } from "three";
import { defaultSettings, type RawPurifierSettings } from "@/domain/purifier/settingsModel";
import { createLayout } from "@/fabrication/purifierLayout";
import { createAssemblyModel } from "@/fabrication/assemblyModel";

// The four vertical box corners are finger joints between a fan wall and a side
// wall. Their teeth must INTERLEAVE (one wall's teeth fall in the other's gaps),
// never overlap — overlapping teeth mean the laser-cut parts physically collide
// and cannot assemble. This guards against that across a range of dimensions.

type Interval = [number, number];

function worldOutline(part: ReturnType<typeof createAssemblyModel>["panels"][number]): Vector3[] {
  const euler = new Euler(part.rotation[0], part.rotation[1], part.rotation[2]);
  return part.panel.outline.map((point) =>
    new Vector3(point.x - part.panel.assemblyCenter.x, point.y - part.panel.assemblyCenter.y, 0)
      .applyEuler(euler)
      .add(new Vector3(part.position[0], part.position[1], part.position[2])),
  );
}

// Tooth tops are the Y-spanning segments sitting at the extreme of `axis`.
function toothIntervals(pts: Vector3[], axis: "x" | "z", side: "min" | "max"): Interval[] {
  const coord = (p: Vector3) => (axis === "x" ? p.x : p.z);
  const values = pts.map(coord);
  const at = side === "min" ? Math.min(...values) : Math.max(...values);
  const intervals: Interval[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if (Math.abs(coord(a) - at) < 0.3 && Math.abs(coord(b) - at) < 0.3 && Math.abs(a.y - b.y) > 0.5) {
      intervals.push([Math.min(a.y, b.y), Math.max(a.y, b.y)]);
    }
  }
  return intervals;
}

function overlapCount(a: Interval[], b: Interval[]): number {
  let count = 0;
  for (const x of a) {
    for (const y of b) {
      if (Math.min(x[1], y[1]) - Math.max(x[0], y[0]) > 0.3) {
        count += 1;
      }
    }
  }
  return count;
}

function cornerCollisions(raw: RawPurifierSettings): number {
  const model = createAssemblyModel(createLayout(raw));
  const panel = (id: string) => {
    const found = model.panels.find((p) => p.id === id);
    if (found === undefined) {
      throw new Error(`missing panel ${id}`);
    }
    return worldOutline(found);
  };
  const top = panel("top-fan-wall");
  const bottom = panel("bottom-fan-wall");
  const left = panel("left-side-wall");
  const right = panel("right-side-wall");
  return (
    overlapCount(toothIntervals(top, "x", "min"), toothIntervals(left, "z", "max")) +
    overlapCount(toothIntervals(top, "x", "max"), toothIntervals(right, "z", "max")) +
    overlapCount(toothIntervals(bottom, "x", "min"), toothIntervals(left, "z", "min")) +
    overlapCount(toothIntervals(bottom, "x", "max"), toothIntervals(right, "z", "min"))
  );
}

describe("wall corner finger joints", () => {
  test("the default housing has interleaving (non-colliding) corner fingers", () => {
    expect(cornerCollisions(defaultSettings)).toBe(0);
  });

  test("corner fingers interleave across filter counts, fan sizes, thicknesses, and footprints", () => {
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
              const collisions = cornerCollisions(raw);
              if (collisions !== 0) {
                failures.push(
                  `filters=${filters} fan=${fanDiameter} t=${materialThickness} ${filterWidth}x${filterDepth} split=${splitFrames}: ${collisions}`,
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
