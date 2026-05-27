import { describe, expect, test } from "bun:test";
import { printPreviewGridY, printPreviewPartY } from "../src/printSheetThreePreview";
import { chooseStaticPrintOrientationForSize } from "../src/staticStlAssets";
import { staticPrintReferences } from "../src/staticPrintReferences";

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

  test("turns the static 14x20 print plates right-side-up", () => {
    const plateAssets = staticPrintReferences["static-cr-14x20-base"].platePreviewAssets;
    const bedSideByName = new Map(
      plateAssets.map((asset) => [
        asset.name,
        asset.printPlateOrientation.type === "source-bed-side" ? asset.printPlateOrientation.bedSide : "auto",
      ]),
    );

    expect(plateAssets).toHaveLength(19);
    expect(bedSideByName.get("1 filter housing fan mounts top power side.stl")).toBe("source-min-z");
    expect(bedSideByName.get("2 filter housing fan mounts top power side.stl")).toBe("source-min-z");
    expect(bedSideByName.get("5 filter housing bottom power base.stl")).toBe("source-min-z");
    expect(bedSideByName.get("6 filter housing bottom not power base.stl")).toBe("source-min-z");
    expect(bedSideByName.get("3.2 filter housing power side upper less tight.stl")).toBe("source-max-z");
    expect(bedSideByName.get("8.2 filter housing no power side upper less tight.stl")).toBe("source-max-z");
  });
});
