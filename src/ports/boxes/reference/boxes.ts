// Part of the boxes.py correctness oracle — see ./README.md.
// A faithful TypeScript port of the minimal subset of the upstream Python
// `boxes.Boxes` framework (procedural `rectangularWall` / `hole` /
// `fingerHolesAt` API with edge-pattern strings). It exists ONLY so generators
// ported 1:1 from boxes.py (e.g. `./airPurifierGenerator`) can run unchanged and
// act as an executable golden reference for the app's native cut geometry.
// Nothing in the shipped app instantiates `Boxes`.

import type { BoxesDocument } from "@/ports/boxes/cutDocument";
import { DrawingContext, getShapeBounds } from "@/ports/boxes/reference/drawingContext";
import { CompoundEdge, createDefaultEdges, type Edge } from "@/ports/boxes/reference/edges";

export type WallCallback = () => void;

export type MoveDirection = "up" | "right" | "down" | "left";

export type RectangularWallOptions = {
  callback?: WallCallback[];
  move?: MoveDirection;
  label?: string;
};

export class Boxes {
  readonly ctx = new DrawingContext();
  readonly edges: Map<string, Edge>;
  spacing = 10;
  burn = 0.1;
  labels = true;
  debug = false;

  constructor(readonly thickness: number) {
    this.edges = createDefaultEdges(thickness);
  }

  compoundEdge(pattern: string, lengths: number[]): CompoundEdge {
    const edges = Array.from(pattern).map((char) => this.resolveEdge(char));
    return new CompoundEdge(edges, lengths);
  }

  rectangularWall(
    width: number,
    height: number,
    edgeSpec: string | Array<string | Edge> = "eeee",
    options: RectangularWallOptions = {},
  ): void {
    if (edgeSpec.length !== 4) {
      throw new Error("Boxes.rectangularWall: four edges required");
    }
    const edges = Array.from(edgeSpec).map((edge) => (typeof edge === "string" ? this.resolveEdge(edge) : edge));
    const overallWidth = width + edges[3].spacing() + edges[1].spacing();
    const overallHeight = height + edges[0].spacing() + edges[2].spacing();

    this.ctx.save();
    this.ctx.translate(edges[3].spacing() + this.partSpacing() / 2, edges[0].margin() + this.partSpacing() / 2);
    // Upstream displaces the tool path outward by `burn` while drawing, so the
    // part outline it emits is one burn larger on every side.
    this.ctx.addRect(-this.burn, -this.burn, width + 2 * this.burn, height + 2 * this.burn, "cut");
    this.runCallbacks(options.callback);
    if (this.labels && options.label) {
      this.ctx.addText(width / 2, height / 2, options.label, 6, "annotation");
    }
    this.ctx.restore();

    this.move(overallWidth, overallHeight, options.move ?? "up");
  }

  hole(x: number, y: number, options: { r?: number; d?: number } = {}): void {
    const radius = options.r ?? (options.d ?? 0) / 2;
    this.ctx.addCircle(x, y, Math.max(0.001, radius - this.burn), "inner-cut");
  }

  rectangularHole(
    x: number,
    y: number,
    width: number,
    height: number,
    options: { r?: number; centerX?: boolean; centerY?: boolean } = {},
  ): void {
    const radius = Math.min(options.r ?? 0, width / 2, height / 2);
    const centerX = options.centerX ?? true;
    const centerY = options.centerY ?? true;
    const startX = (centerX ? x - width / 2 : x) + this.burn;
    const startY = (centerY ? y - height / 2 : y) + this.burn;
    this.ctx.addRoundedRect(
      startX,
      startY,
      width - 2 * this.burn,
      height - 2 * this.burn,
      Math.max(0, radius - this.burn),
      "inner-cut",
    );
  }

  fingerHolesAt(x: number, y: number, length: number, angle = 0): void {
    const slotLength = Math.max(this.thickness * 1.8, this.thickness + 2);
    const count = Math.max(1, Math.floor(length / (slotLength * 2)));
    const step = length / count;

    this.ctx.save();
    this.ctx.translate(x, y);
    for (let index = 0; index < count; index += 1) {
      const slotX = index * step + (step - slotLength) / 2 + this.burn;
      const slotWidth = slotLength - 2 * this.burn;
      const slotHeight = this.thickness - 2 * this.burn;
      if (angle === 90 || angle === -90) {
        this.ctx.addRect(-slotHeight / 2, slotX, slotHeight, slotWidth, "inner-cut");
      } else {
        this.ctx.addRect(slotX, -slotHeight / 2, slotWidth, slotHeight, "inner-cut");
      }
    }
    this.ctx.restore();
  }

  move(width: number, height: number, where: MoveDirection = "up"): void {
    if (where === "right") {
      this.ctx.translate(width + this.partSpacing(), 0);
      return;
    }
    if (where === "left") {
      this.ctx.translate(-(width + this.partSpacing()), 0);
      return;
    }
    if (where === "down") {
      this.ctx.translate(0, -(height + this.partSpacing()));
      return;
    }
    if (where !== "up") {
      throw new Error(`Boxes.move: Unknown move direction ${String(where)}`);
    }
    this.ctx.translate(0, height + this.partSpacing());
  }

  toDocument(): BoxesDocument {
    const bounds = getShapeBounds(this.ctx.shapes);
    return {
      width: bounds.width + this.partSpacing(),
      height: bounds.height + this.partSpacing(),
      shapes: [...this.ctx.shapes],
    };
  }

  // Upstream folds 2*burn into self.spacing when the canvas opens; this port
  // keeps `spacing` as the configured base and adds the burn where it is used.
  private partSpacing(): number {
    return this.spacing + 2 * this.burn;
  }

  protected resolveEdge(edge: string): Edge {
    const resolved = this.edges.get(edge);
    if (resolved === undefined) {
      throw new Error(`Boxes.resolveEdge: Unknown edge '${edge}'`);
    }
    return resolved;
  }

  private runCallbacks(callbacks: WallCallback[] | undefined): void {
    if (callbacks === undefined) {
      return;
    }
    for (const callback of callbacks) {
      callback();
    }
  }
}
