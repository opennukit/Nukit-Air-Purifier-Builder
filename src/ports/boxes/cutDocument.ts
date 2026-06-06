// The cut-document data model: a sized collection of 2D laser shapes.
//
// This is a plain serialization-style vocabulary shared by THREE callers that
// otherwise know nothing about each other:
//   1. The live native geometry (`@/fabrication/laser/cutGeometry`, `panels`)
//      which produces a `BoxesDocument` for the real app export.
//   2. The live SVG renderer (`./svg`) which consumes one.
//   3. The boxes.py correctness oracle (`./reference/*`) which produces one the
//      equivalence test can compare against.
// Keeping the model here — not inside the oracle — is what lets the live app
// import these types without pulling in any of the `reference/` runtime.

export type Point = {
  x: number;
  y: number;
};

export type LaserOperation = "cut" | "inner-cut" | "annotation" | "reference";

export type ShapeColor = LaserOperation;

export type CircleShape = {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
  color: ShapeColor;
};

export type RectShape = {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: ShapeColor;
};

export type RoundedRectShape = {
  type: "rounded-rect";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  color: ShapeColor;
};

export type TextShape = {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: ShapeColor;
  fontSize: number;
};

export type PathShape = {
  type: "path";
  points: Point[];
  closed: boolean;
  color: ShapeColor;
};

export type Shape = CircleShape | RectShape | RoundedRectShape | TextShape | PathShape;

export type BoxesDocument = {
  width: number;
  height: number;
  shapes: Shape[];
};
