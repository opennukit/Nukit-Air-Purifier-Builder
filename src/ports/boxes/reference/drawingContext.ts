// Part of the boxes.py correctness oracle — see ./README.md.
// A faithful port of the minimal boxes.py turtle/canvas: a mutable builder that
// accumulates `Shape`s under a translation stack. The live app never uses this;
// only the `Boxes` reference kernel and its generators draw through it.

import type { Point, Shape, ShapeColor } from "@/ports/boxes/cutDocument";

type DrawingState = {
  offsetX: number;
  offsetY: number;
};

export class DrawingContext {
  readonly shapes: Shape[] = [];
  private state: DrawingState = { offsetX: 0, offsetY: 0 };
  private stack: DrawingState[] = [];

  translate(x: number, y: number): void {
    this.state = {
      offsetX: this.state.offsetX + x,
      offsetY: this.state.offsetY + y,
    };
  }

  save(): void {
    this.stack.push({ ...this.state });
  }

  restore(): void {
    const restored = this.stack.pop();
    if (restored === undefined) {
      throw new Error("DrawingContext.restore: Cannot restore without matching save");
    }
    this.state = restored;
  }

  addRect(x: number, y: number, width: number, height: number, color: ShapeColor = "cut"): void {
    this.shapes.push({
      type: "rect",
      x: this.state.offsetX + x,
      y: this.state.offsetY + y,
      width,
      height,
      color,
    });
  }

  addRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: ShapeColor = "inner-cut",
  ): void {
    this.shapes.push({
      type: "rounded-rect",
      x: this.state.offsetX + x,
      y: this.state.offsetY + y,
      width,
      height,
      radius,
      color,
    });
  }

  addCircle(cx: number, cy: number, radius: number, color: ShapeColor = "inner-cut"): void {
    this.shapes.push({
      type: "circle",
      cx: this.state.offsetX + cx,
      cy: this.state.offsetY + cy,
      radius,
      color,
    });
  }

  addText(x: number, y: number, text: string, fontSize = 6, color: ShapeColor = "annotation"): void {
    this.shapes.push({
      type: "text",
      x: this.state.offsetX + x,
      y: this.state.offsetY + y,
      text,
      color,
      fontSize,
    });
  }

  addPath(points: readonly Point[], closed: boolean, color: ShapeColor = "cut"): void {
    this.shapes.push({
      type: "path",
      points: points.map((point) => ({
        x: this.state.offsetX + point.x,
        y: this.state.offsetY + point.y,
      })),
      closed,
      color,
    });
  }
}

export function getShapeBounds(shapes: readonly Shape[]): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const shape of shapes) {
    if (shape.type === "circle") {
      maxX = Math.max(maxX, shape.cx + shape.radius);
      maxY = Math.max(maxY, shape.cy + shape.radius);
    } else if (shape.type === "text") {
      maxX = Math.max(maxX, shape.x);
      maxY = Math.max(maxY, shape.y);
    } else if (shape.type === "path") {
      for (const point of shape.points) {
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    } else {
      maxX = Math.max(maxX, shape.x + shape.width);
      maxY = Math.max(maxY, shape.y + shape.height);
    }
  }
  return {
    width: maxX,
    height: maxY,
  };
}
