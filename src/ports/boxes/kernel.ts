import { DrawingContext, getShapeBounds, type Shape } from "@/ports/boxes/drawing";
import { CompoundEdge, createDefaultEdges, type Edge } from "@/ports/boxes/edges";

export type WallCallback = () => void;

export type MoveDirection = "up" | "right" | "down" | "left";

export type RectangularWallOptions = {
  callback?: WallCallback[];
  move?: MoveDirection;
  label?: string;
};

export type BoxesDocument = {
  width: number;
  height: number;
  shapes: Shape[];
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
    this.ctx.translate(edges[3].spacing() + this.spacing / 2, edges[0].margin() + this.spacing / 2);
    this.ctx.addRect(0, 0, width, height, "cut");
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
    const startX = centerX ? x - width / 2 : x;
    const startY = centerY ? y - height / 2 : y;
    this.ctx.addRoundedRect(startX, startY, width, height, radius, "inner-cut");
  }

  fingerHolesAt(x: number, y: number, length: number, angle = 0): void {
    const slotLength = Math.max(this.thickness * 1.8, this.thickness + 2);
    const count = Math.max(1, Math.floor(length / (slotLength * 2)));
    const step = length / count;

    this.ctx.save();
    this.ctx.translate(x, y);
    for (let index = 0; index < count; index += 1) {
      const slotX = index * step + (step - slotLength) / 2;
      if (angle === 90 || angle === -90) {
        this.ctx.addRect(-this.thickness / 2, slotX, this.thickness, slotLength, "inner-cut");
      } else {
        this.ctx.addRect(slotX, -this.thickness / 2, slotLength, this.thickness, "inner-cut");
      }
    }
    this.ctx.restore();
  }

  move(width: number, height: number, where: MoveDirection = "up"): void {
    if (where === "right") {
      this.ctx.translate(width + this.spacing, 0);
      return;
    }
    if (where === "left") {
      this.ctx.translate(-(width + this.spacing), 0);
      return;
    }
    if (where === "down") {
      this.ctx.translate(0, -(height + this.spacing));
      return;
    }
    if (where !== "up") {
      throw new Error(`Boxes.move: Unknown move direction ${String(where)}`);
    }
    this.ctx.translate(0, height + this.spacing);
  }

  toDocument(): BoxesDocument {
    const bounds = getShapeBounds(this.ctx.shapes);
    return {
      width: bounds.width + this.spacing,
      height: bounds.height + this.spacing,
      shapes: [...this.ctx.shapes],
    };
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
