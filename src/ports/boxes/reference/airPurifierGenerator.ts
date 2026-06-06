// Part of the boxes.py correctness oracle — see ./README.md.
//
// A faithful, line-for-line TypeScript port of upstream `boxes/generators/
// airpurifier.py`. It deliberately mirrors the Python source: the same
// `rectangularWall(...)` call sequence, the same edge-pattern strings ("ffff",
// "Ehhh", "hded", compoundEdge("fff", ...)), the same fan/finger-hole callbacks.
//
// It is NOT how the app builds cut sheets — the shipped app uses the native,
// app-idiomatic `@/fabrication/laser/cutGeometry` + `panels`. This generator
// exists solely as an executable golden reference: `test/ports/boxes/
// airPurifierCutSheetEquivalence.test.ts` runs it to prove the native path stays
// a correct port of boxes.py, and `scripts/boxes-port/airpurifier-oracle.ts`
// cross-checks both against the real Python boxes.py. Keep it in lockstep with
// upstream; do not "improve" it to match our native output.

import { Boxes } from "@/ports/boxes/reference/boxes";
import { createAirPurifierGeometry, fanCenterYForWall } from "@/domain/purifier/geometry";
import {
  normalizeSettings,
  type FanCountRequest,
  type FilterFrameConstruction,
  type PurifierInput,
  type PurifierSettings,
} from "@/domain/purifier/airPurifier";

type FingerHoleCutRequest =
  | {
      type: "none";
    }
  | {
      type: "include";
      frameConstruction: FilterFrameConstruction;
    };

export class AirPurifierGenerator extends Boxes {
  private readonly configuration: PurifierSettings;

  constructor(settings: PurifierInput) {
    const configuration = normalizeSettings(settings);
    super(configuration.cutting.materialThickness);
    this.configuration = configuration;
    this.burn = configuration.cutting.kerfFit;
    this.labels = configuration.cutting.labels;
  }

  render(): void {
    const geometry = createAirPurifierGeometry(this.configuration);
    const x = geometry.filterDimensions.width;
    const d = geometry.fanDiameter;
    const t = geometry.materialThickness;
    const r = geometry.rim;
    const y = geometry.workingDepth;
    const filterHeight = geometry.filterDimensions.thickness;
    const chamberHeight = geometry.chamberHeight;
    const filterCount = this.configuration.filterCount;
    const usesSplitRails = this.configuration.frameConstruction.type === "split-rails";

    this.rectangularWall(x, d, "ffff", {
      callback: [this.fanCallback(this.configuration.fan.banks.top, d, x, { type: "none" })],
      move: "up",
      label: "top",
    });
    this.rectangularWall(x, chamberHeight, "ffff", {
      callback: [
        this.fanCallback(this.configuration.fan.banks.bottom, chamberHeight, x, {
          type: "include",
          frameConstruction: this.configuration.frameConstruction,
        }),
      ],
      move: "up",
      label: "bottom",
    });

    const bottomEdge = usesSplitRails ? this.compoundEdge("fff", [r, y - 2 * r, r]) : "f";
    let topEdge = bottomEdge;
    const leftEdge =
      filterCount === 2
        ? this.compoundEdge("EFE", [filterHeight + t, d + 2, filterHeight + t])
        : this.compoundEdge("FE", [d + 2, filterHeight + t]);
    if (filterCount === 1) {
      topEdge = "f";
    }

    for (const fans of [this.configuration.fan.banks.left, this.configuration.fan.banks.right]) {
      this.rectangularWall(y, chamberHeight, [bottomEdge, "h", topEdge, leftEdge], {
        callback: [
          this.fanCallback(fans, chamberHeight, y, {
            type: "include",
            frameConstruction: this.configuration.frameConstruction,
          }),
        ],
        move: "up",
      });
    }

    if (usesSplitRails) {
      const edge = this.compoundEdge("DeD", [r, x - 2 * r, r]);
      for (let index = 0; index < filterCount; index += 1) {
        this.rectangularWall(x, r, ["E", "h", edge, "h"], { move: "up" });
        this.rectangularWall(y - 2 * r, r, "hded", { move: "up" });
        this.rectangularWall(y - 2 * r, r, "hded", { move: "up" });
        this.rectangularWall(x, r, [edge, "h", "h", "h"], { move: "up" });

        this.rectangularWall(x, r, ["F", "f", edge, "f"], { move: "up" });
        this.rectangularWall(y - 2 * r, r, "fded", { move: "up" });
        this.rectangularWall(y - 2 * r, r, "fded", { move: "up" });
        this.rectangularWall(x, r, [edge, "f", "f", "f"], { move: "up" });
      }
    } else {
      for (let index = 0; index < filterCount; index += 1) {
        this.rectangularWall(x, y, "Ffff", {
          callback: [() => this.rectangularHole(x / 2, y / 2, x - r, y - r, { r: 10 })],
          move: "up",
        });
        this.rectangularWall(x, y, "Ehhh", {
          callback: [() => this.rectangularHole(x / 2, y / 2, x - r, y - r, { r: 10 })],
          move: "up",
        });
      }
    }

    if (filterCount === 1) {
      this.rectangularWall(x, y, "hhhh", { move: "up" });
    }

    const referenceScale = this.configuration.cutting.referenceScale;
    if (referenceScale.type === "enabled") {
      this.ctx.addRect(0, 0, referenceScale.length, 10, "reference");
      this.ctx.addText(referenceScale.length / 2, 5, `${referenceScale.length} mm`, 6, "annotation");
    }
  }

  private fanCallback(
    requestedFans: FanCountRequest,
    height: number,
    length: number,
    fingerHoleCut: FingerHoleCutRequest,
  ): () => void {
    return () => {
      const geometry = createAirPurifierGeometry(this.configuration);
      const t = geometry.materialThickness;
      const r = geometry.rim;
      const fanDiameter = this.configuration.fan.spec.diameter;

      if (fingerHoleCut.type === "include") {
        const usesSplitRails = fingerHoleCut.frameConstruction.type === "split-rails";
        for (const holeY of geometry.filterFingerHoleYs) {
          if (usesSplitRails) {
            this.fingerHolesAt(0, holeY, r, 0);
            this.fingerHolesAt(r, holeY, length - 2 * r, 0);
            this.fingerHolesAt(length - r, holeY, r, 0);
          } else {
            this.fingerHolesAt(0, holeY, length, 0);
          }
        }
      }

      const fanCount = this.resolveFanCount(requestedFans, length);
      if (fanCount === 0) {
        return;
      }

      const segmentWidth = (length - 20) / fanCount;
      const screwOffset = this.configuration.fan.spec.screwSpacing / 2;
      const fanCenterY = fanCenterYForWall(this.configuration.filterCount, height, t, geometry.filterDimensions.thickness);

      for (let index = 0; index < fanCount; index += 1) {
        const fanCenterX = 10 + segmentWidth / 2 + index * segmentWidth;
        this.hole(fanCenterX, fanCenterY, { d: fanDiameter - 4 });
        for (const dx of [-screwOffset, screwOffset]) {
          for (const dy of [-screwOffset, screwOffset]) {
            this.hole(fanCenterX + dx, fanCenterY + dy, { d: this.configuration.cutting.screwHoleDiameter });
          }
        }
      }
    };
  }

  private resolveFanCount(requestedFans: FanCountRequest, length: number): number {
    const maxFans = Math.max(0, Math.floor((length - 20) / (this.configuration.fan.spec.diameter + 10)));
    if (requestedFans.type === "auto") {
      return maxFans;
    }
    return Math.min(maxFans, Math.max(0, requestedFans.count));
  }
}

export function generateAirPurifier(settings: PurifierInput): AirPurifierGenerator {
  const generator = new AirPurifierGenerator(settings);
  generator.render();
  return generator;
}
