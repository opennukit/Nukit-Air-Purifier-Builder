import { describe, expect, test } from "bun:test";
import { printPreviewGridY, printPreviewPartY } from "@/rendering/three/printSheetThreePreview";
import { chooseStaticPrintOrientationForSize } from "@/rendering/three/staticPrintAssets";

describe("Print sheet 3D preview", () => {
  test("renders printable parts above the bed grid to avoid z-fighting", () => {
    const partBottomY = printPreviewPartY(0);
    const gridY = printPreviewGridY();

    expect(partBottomY).toBeGreaterThan(gridY);
    expect(partBottomY - gridY).toBeGreaterThanOrEqual(0.002);
  });

  test("orients static STL parts to the lowest printable height", () => {
    const orientation = chooseStaticPrintOrientationForSize({ x: 220, y: 40, z: 160 });

    expect(orientation.height).toBe(40);
    expect(orientation.footprintWidth * orientation.footprintDepth).toBe(220 * 160);
  });

  test("honors an explicit static STL bed face before optimizing height", () => {
    const orientation = chooseStaticPrintOrientationForSize(
      { x: 220, y: 40, z: 160 },
      "source-min-z",
    );

    expect(orientation.height).toBe(160);
    expect(orientation.footprintWidth * orientation.footprintDepth).toBe(220 * 40);
  });
});
