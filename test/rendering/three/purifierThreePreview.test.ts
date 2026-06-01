import { describe, expect, test } from "bun:test";
import { Box3, BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import {
  createPrintableMeshContourEdgeGeometry,
  previewInteriorShiftForBounds,
} from "@/rendering/three/purifierThreePreview";

describe("Purifier 3D preview", () => {
  test("uses only printable part bounding contours for generated mesh line overlays", () => {
    const source = new BufferGeometry();
    source.setAttribute(
      "position",
      new Float32BufferAttribute(
        [
          0, 0, 0,
          2, 0, 0,
          2, 3, 0,
          0, 3, 0,
          0, 0, 4,
          2, 0, 4,
          2, 3, 4,
          0, 3, 4,
          1, 1, 1,
        ],
        3,
      ),
    );

    const contour = createPrintableMeshContourEdgeGeometry(source);
    const positions = contour.getAttribute("position");
    const values = Array.from(positions.array);

    expect(positions.count).toBe(24);
    expect(new Set(values.filter((_, index) => index % 3 === 0))).toEqual(new Set([0, 2]));
    expect(new Set(values.filter((_, index) => index % 3 === 1))).toEqual(new Set([0, 3]));
    expect(new Set(values.filter((_, index) => index % 3 === 2))).toEqual(new Set([0, 4]));
  });

  test("moves wall-mounted purchased parts inward when their bounds cross the case interior plane", () => {
    const bounds = new Box3(new Vector3(-2, 1, 0), new Vector3(4, 6, 3));

    expect(
      previewInteriorShiftForBounds(bounds, {
        axis: "x",
        coordinate: 0,
        insideSign: 1,
        inset: 0.5,
      }),
    ).toBe(2.5);
    expect(
      previewInteriorShiftForBounds(bounds, {
        axis: "y",
        coordinate: 4,
        insideSign: -1,
        inset: 0.25,
      }),
    ).toBe(-2.25);
  });

  test("keeps wall-mounted purchased parts fixed when their bounds are already inside", () => {
    const bounds = new Box3(new Vector3(1, -3, 0), new Vector3(4, -1, 3));

    expect(
      previewInteriorShiftForBounds(bounds, {
        axis: "x",
        coordinate: 0,
        insideSign: 1,
        inset: 0.5,
      }),
    ).toBe(0);
    expect(
      previewInteriorShiftForBounds(bounds, {
        axis: "y",
        coordinate: 0,
        insideSign: -1,
        inset: 0.5,
      }),
    ).toBe(0);
  });
});
