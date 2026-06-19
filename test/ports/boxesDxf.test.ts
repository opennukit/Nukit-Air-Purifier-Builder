import { describe, expect, test } from "bun:test";
import { renderBoxesDocumentDxf } from "@/ports/boxes/dxf";
import { createLaserDxf, createLayout } from "@/fabrication/purifierLayout";
import { defaultSettings } from "@/domain/purifier/settingsModel";

describe("DXF renderer", () => {
  test("emits an R12 entities section with polylines, circles, and text", () => {
    const dxf = renderBoxesDocumentDxf({
      width: 100,
      height: 50,
      shapes: [
        { type: "path", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true, color: "cut" },
        { type: "circle", cx: 20, cy: 5, radius: 3, color: "inner-cut" },
        { type: "text", x: 5, y: 5, text: "A", color: "annotation", fontSize: 6 },
      ],
    });
    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("ENTITIES");
    expect(dxf).toContain("POLYLINE");
    expect(dxf).toContain("CIRCLE");
    expect(dxf).toContain("TEXT");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  test("flips Y so the drawing stays upright (DXF Y up vs SVG Y down)", () => {
    const dxf = renderBoxesDocumentDxf({
      width: 100,
      height: 50,
      shapes: [{ type: "circle", cx: 10, cy: 5, radius: 1, color: "cut" }],
    });
    // cy=5 on a 50-tall sheet becomes DXF y = 45.
    expect(dxf).toContain("20\n45");
  });

  test("createLaserDxf renders a real laser layout", () => {
    // The cut pipeline emits every cut (bores included) as closed polylines, so
    // a real sheet is all POLYLINE entities; CIRCLE rendering is unit-tested above.
    const raw = { ...defaultSettings, printDesign: "nukit-open-air", filters: 1, fansLeft: -1 };
    const dxf = createLaserDxf(createLayout(raw as never));
    expect(dxf).toContain("ENTITIES");
    expect(dxf).toContain("POLYLINE");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });
});
