import type { BoxesDocument, Point, Shape, ShapeColor } from "@/ports/boxes/cutDocument";

// Renders a cut document as a DXF (AutoCAD R12 / AC1009) — the most widely
// accepted DXF flavour for laser software (LightBurn, Illustrator, Inkscape).
// R12 POLYLINE/VERTEX/SEQEND avoids the handle and subclass bookkeeping that
// newer DXF versions require, so the output stays small and portable.
//
// SVG's Y axis points down; DXF's points up. Every Y is flipped through the
// sheet height so the drawing keeps the same orientation as the SVG export.

// Each laser operation gets its own layer + AutoCAD Color Index so cut/engrave
// lines stay separable in the laser software.
const layers: Record<ShapeColor, { name: string; aci: number }> = {
  cut: { name: "CUT", aci: 1 },
  "inner-cut": { name: "INNER_CUT", aci: 5 },
  annotation: { name: "ANNOTATION", aci: 3 },
  reference: { name: "REFERENCE", aci: 4 },
};

export function renderBoxesDocumentDxf(document: BoxesDocument): string {
  const flipY = (y: number) => round(document.height - y);
  const lines: string[] = [];
  const emit = (code: number, value: string | number) => {
    lines.push(String(code), String(value));
  };

  emit(0, "SECTION");
  emit(2, "HEADER");
  emit(9, "$ACADVER");
  emit(1, "AC1009");
  emit(9, "$INSUNITS");
  emit(70, 4); // millimetres
  emit(0, "ENDSEC");

  emit(0, "SECTION");
  emit(2, "TABLES");
  emit(0, "TABLE");
  emit(2, "LAYER");
  emit(70, Object.keys(layers).length);
  for (const { name, aci } of Object.values(layers)) {
    emit(0, "LAYER");
    emit(2, name);
    emit(70, 0);
    emit(62, aci);
    emit(6, "CONTINUOUS");
  }
  emit(0, "ENDTAB");
  emit(0, "ENDSEC");

  emit(0, "SECTION");
  emit(2, "ENTITIES");
  for (const shape of document.shapes) {
    emitShape(emit, shape, flipY);
  }
  emit(0, "ENDSEC");
  emit(0, "EOF");

  return lines.join("\n") + "\n";
}

type Emit = (code: number, value: string | number) => void;

function emitShape(emit: Emit, shape: Shape, flipY: (y: number) => number): void {
  const layer = layers[shape.color].name;
  if (shape.type === "circle") {
    emit(0, "CIRCLE");
    emit(8, layer);
    emit(10, round(shape.cx));
    emit(20, flipY(shape.cy));
    emit(40, round(shape.radius));
    return;
  }
  if (shape.type === "text") {
    emit(0, "TEXT");
    emit(8, layer);
    emit(10, round(shape.x));
    emit(20, flipY(shape.y));
    emit(40, round(shape.fontSize));
    emit(1, shape.text);
    return;
  }
  if (shape.type === "path") {
    emitPolyline(emit, layer, shape.points, shape.closed, flipY);
    return;
  }
  // rect / rounded-rect: emit the four corners as a closed polyline (the corner
  // rounding is cosmetic and is dropped for the cut path).
  const { x, y, width, height } = shape;
  emitPolyline(
    emit,
    layer,
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    true,
    flipY,
  );
}

function emitPolyline(emit: Emit, layer: string, points: readonly Point[], closed: boolean, flipY: (y: number) => number): void {
  if (points.length === 0) {
    return;
  }
  emit(0, "POLYLINE");
  emit(8, layer);
  emit(66, 1); // vertices follow
  emit(70, closed ? 1 : 0);
  for (const point of points) {
    emit(0, "VERTEX");
    emit(8, layer);
    emit(10, round(point.x));
    emit(20, flipY(point.y));
  }
  emit(0, "SEQEND");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
