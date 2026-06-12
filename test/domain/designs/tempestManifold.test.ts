import { describe, expect, test } from "bun:test";
import { createTempestModel, defaultTempestSettings, defaultTempestTowerFilter } from "@/domain/designs/tempest/model";
import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
import { buildTempestGeometry, towerCornerChamfer } from "@/fabrication/printing/designs/tempest/geometry";
import { cuboidFromMinSize } from "@/fabrication/printing/designs/tempest/geometry/primitives";
import type { GeometryContext } from "@/fabrication/printing/designs/tempest/geometry/context";
import { type Geom2, type Geom3, manifoldModeling } from "@/fabrication/printing/modeling/manifoldOps";
import { withGeometryArena } from "@/fabrication/printing/modeling/manifoldKernel";
import { extractWeldedMesh } from "@/fabrication/printing/modeling/meshConversion";
import { cleanManifold, manifoldReport, meshVolume, totalGenus } from "../../helpers/manifoldChecks";

describe("Tempest meshes are 2-manifold", () => {
  test("two-filter housing exports a watertight single body", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    expect(manifoldReport(kit.parts[0].mesh)).toEqual(cleanManifold);
  });

  test("every split bed-256 chunk is watertight", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "bed-256");
    expect(kit.parts.length).toBeGreaterThan(1);
    for (const part of kit.parts) {
      expect(manifoldReport(part.mesh)).toEqual(cleanManifold);
    }
  });

  test("honeycomb fan grills stay manifold", () => {
    const kit = createTempestPrintableKit(defaultTempestSettings, "unsplit");
    // The honeycomb grill was the dominant source of T-junctions under the prior
    // CSG backend; guard that the manifold kernel keeps it clean.
    expect(defaultTempestSettings.fan.opening.type).toBe("honeycomb");
    expect(manifoldReport(kit.parts[0].mesh)).toEqual(cleanManifold);
  });

  test("filter-slot ends stay sealed at the wall corners", () => {
    // The loading slot reaches past the adjacent wall's inner face (endMargin 4 <
    // wall 5). When the wall body's inner-face corners carried chamfers, the slot
    // exposed those chamfer triangles as ~1mm through-slits at the box corners,
    // and the filter media showed through from outside. Probe the corner blocks
    // inside both slot bands and require them fully solid.
    const model = createTempestModel(defaultTempestSettings);
    if (model.topology !== "sandwich") {
      throw new Error("Expected the sandwich topology");
    }
    const wall = model.frame.wallThickness;
    const flange = model.frame.outsideFlangeThickness;
    const slotZBands = model.filterLayout.loading.slots.map((slot) => [flange + slot.localZBottom, flange + slot.localZTop]);
    withGeometryArena(() => {
      const ctx: GeometryContext<Geom3, Geom2> = { modeling: manifoldModeling, fanPatternCache: new Map() };
      const solid = buildTempestGeometry(manifoldModeling, model);
      // The slot wall is "back"; its corner blocks sit against the left and right
      // walls. Probe the strip between each side wall's inner face and the slot
      // end, just inside the back wall's inner face (clear of the exterior bevel).
      for (const [zBottom, zTop] of slotZBands) {
        for (const xMin of [model.settings.filterSlot.endMargin, model.box.width - wall]) {
          const probe = cuboidFromMinSize(
            ctx,
            xMin,
            model.box.depth - wall,
            zBottom + 1,
            wall - model.settings.filterSlot.endMargin,
            wall - 0.5,
            zTop - zBottom - 2,
          );
          const probeVolume =
            (wall - model.settings.filterSlot.endMargin) * (wall - 0.5) * (zTop - zBottom - 2);
          const overlap = meshVolume(extractWeldedMesh(manifoldModeling.booleans.intersect(solid, probe)));
          expect(overlap).toBeCloseTo(probeVolume, 3);
        }
      }
      return [];
    });
  });

  test("four-filter tower exports a watertight single body", () => {
    const kit = createTempestPrintableKit(
      { ...defaultTempestSettings, arrangement: { type: "four-side-filter-tower", filter: defaultTempestTowerFilter } },
      "unsplit",
    );
    expect(manifoldReport(kit.parts[0].mesh)).toEqual(cleanManifold);
  });

  const flange = defaultTempestSettings.frame.outsideFlangeThickness;
  const wall = defaultTempestSettings.frame.wallThickness;
  const fullChamfer = defaultTempestSettings.frame.towerCornerPostChamfer;

  test("thin filter: bevel shrinks below the max and leaves a full wall to the filter", () => {
    // ~2mm filter -> structuralOffset 17, pocket corner at x+y = 27. The 55mm max
    // would carve past the filter; the derived bevel must shrink so it leaves one
    // outer-wall thickness to the pocket — the corner is the outer shell at 45°.
    const structuralOffset = flange + 2 + wall;
    const bevel = towerCornerChamfer(fullChamfer, structuralOffset, flange);
    expect(bevel).toBeLessThan(fullChamfer);
    // Perpendicular wall from the bevel face to the pocket's near corner. When the
    // max doesn't bind, it equals exactly the outer-wall thickness (flange).
    const wallToPocket = (structuralOffset + flange - bevel) / Math.SQRT2;
    expect(wallToPocket).toBeCloseTo(flange);
  });

  test("bevel never reaches the filter-pocket corner, so the corner stays tunnel-free", () => {
    // The pocket near corner is x+y = structuralOffset + outsideFlange. At defaults a
    // ~30mm filter put the old fixed 55mm bevel exactly on it -> a corner tunnel.
    const structuralOffset = flange + 30 + wall; // 45; pocket corner = 55
    const bevel = towerCornerChamfer(fullChamfer, structuralOffset, flange);
    expect(bevel).toBeLessThan(structuralOffset + flange);

    // And the real build at that thickness must stay tunnel-free. The corner is
    // independent of the grill, so use plain openings to keep this fast.
    const towerAt = (thickness: number) =>
      createTempestPrintableKit(
        {
          ...defaultTempestSettings,
          fan: { ...defaultTempestSettings.fan, opening: { type: "plain" } },
          arrangement: { type: "four-side-filter-tower", filter: { ...defaultTempestTowerFilter, thickness } },
        },
        "unsplit",
      ).parts[0].mesh;
    expect(totalGenus(towerAt(30))).toBe(totalGenus(towerAt(33)));
  });

  test("thick filters keep the full corner chamfer (the max cap)", () => {
    // structuralOffset 65 (~50mm filter): pocket corner far away, so the max applies.
    expect(towerCornerChamfer(fullChamfer, 65, flange)).toBe(fullChamfer);
  });

  test("four-filter tower with single box-exhaust stays manifold and differs from the fan grid", () => {
    const tower = { type: "four-side-filter-tower" as const, filter: defaultTempestTowerFilter };
    const grid = createTempestPrintableKit({ ...defaultTempestSettings, arrangement: tower }, "unsplit");
    const boxExhaust = createTempestPrintableKit(
      { ...defaultTempestSettings, arrangement: tower, fan: { ...defaultTempestSettings.fan, topExhaust: "single-box-fan" } },
      "unsplit",
    );
    expect(manifoldReport(boxExhaust.parts[0].mesh)).toEqual(cleanManifold);
    // A single opening + corner ties is far simpler than the honeycomb fan grid.
    expect(boxExhaust.parts[0].mesh.triangles.length).toBeLessThan(grid.parts[0].mesh.triangles.length);
  });
});
