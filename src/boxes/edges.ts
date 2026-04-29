import type { Boxes } from "./kernel";

export interface Edge {
  readonly char: string;
  spacing(): number;
  margin(): number;
  startWidth(): number;
  endWidth(): number;
  draw(boxes: Boxes, length: number): void;
}

export class PlainEdge implements Edge {
  readonly char = "e";

  spacing(): number {
    return 0;
  }

  margin(): number {
    return 0;
  }

  startWidth(): number {
    return 0;
  }

  endWidth(): number {
    return 0;
  }

  draw(): void {
    // Plain edges are represented by the enclosing wall rectangle.
  }
}

export class FingerJointEdge implements Edge {
  readonly char: string;

  constructor(
    private readonly thickness: number,
    char = "f",
  ) {
    this.char = char;
  }

  spacing(): number {
    return this.thickness;
  }

  margin(): number {
    return this.thickness / 2;
  }

  startWidth(): number {
    return this.thickness;
  }

  endWidth(): number {
    return this.thickness;
  }

  draw(): void {
    // Finger geometry is emitted as slot markers by Boxes.fingerHolesAt for this port stage.
  }
}

export class FingerHoleEdge extends FingerJointEdge {
  constructor(thickness: number, char = "h") {
    super(thickness, char);
  }
}

export class DoveTailEdge extends FingerJointEdge {
  constructor(thickness: number, char = "d") {
    super(thickness, char);
  }
}

export class CompoundEdge implements Edge {
  readonly char = "compound";
  private readonly parts: Array<{ edge: Edge; length: number }>;

  constructor(edges: Edge[], lengths: number[]) {
    if (edges.length !== lengths.length) {
      throw new Error("CompoundEdge: edge and length counts must match");
    }
    this.parts = edges.map((edge, index) => ({ edge, length: lengths[index] ?? 0 }));
  }

  spacing(): number {
    return Math.max(...this.parts.map((part) => part.edge.spacing()), 0);
  }

  margin(): number {
    return Math.max(...this.parts.map((part) => part.edge.margin()), 0);
  }

  startWidth(): number {
    return this.parts[0]?.edge.startWidth() ?? 0;
  }

  endWidth(): number {
    return this.parts[this.parts.length - 1]?.edge.endWidth() ?? 0;
  }

  draw(boxes: Boxes): void {
    for (const part of this.parts) {
      part.edge.draw(boxes, part.length);
    }
  }
}

export function createDefaultEdges(thickness: number): Map<string, Edge> {
  const edges = new Map<string, Edge>();
  const plain = new PlainEdge();
  for (const char of ["e", "E", "X"]) {
    edges.set(char, plain);
  }
  for (const char of ["f", "F"]) {
    edges.set(char, new FingerJointEdge(thickness, char));
  }
  for (const char of ["h", "H"]) {
    edges.set(char, new FingerHoleEdge(thickness, char));
  }
  for (const char of ["d", "D"]) {
    edges.set(char, new DoveTailEdge(thickness, char));
  }
  return edges;
}
