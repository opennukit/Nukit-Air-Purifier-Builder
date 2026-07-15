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
  }, 30000);

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

  test('the one-side "Back" fan grid bores the bottom plate yet stays watertight', () => {
    const oneSide = {
      ...defaultTempestSettings,
      // Plain openings keep this fast; the honeycomb grill's manifoldness is
      // already covered above.
      fan: { ...defaultTempestSettings.fan, opening: { type: "plain" as const } },
      arrangement: {
        type: "single-horizontal-top-filter" as const,
        filter: { footprintWidth: 370, footprintDepth: 290, thickness: 40 },
      },
    };
    const solid = createTempestPrintableKit(oneSide, "unsplit");
    const withBack = createTempestPrintableKit(
      { ...oneSide, fan: { ...oneSide.fan, bottomPlateFans: { type: "automatic" } } },
      "unsplit",
    );
    expect(manifoldReport(withBack.parts[0].mesh)).toEqual(cleanManifold);
    // Each bored fan opening + its screw holes raises the genus, so the back grid
    // must add holes the solid plate did not have.
    expect(totalGenus(withBack.parts[0].mesh)).toBeGreaterThan(totalGenus(solid.parts[0].mesh));
  }, 30000);

  test('a split "Back" panel stays watertight with seam pins through the bored plate', () => {
    const panel = {
      ...defaultTempestSettings,
      fan: {
        ...defaultTempestSettings.fan,
        opening: { type: "plain" as const },
        bottomPlateFans: { type: "automatic" as const },
        // No side-wall fans: a flat panel.
        wallRequests: {
          front: { type: "fixed" as const, count: 0 },
          back: { type: "fixed" as const, count: 0 },
          left: { type: "fixed" as const, count: 0 },
          right: { type: "fixed" as const, count: 0 },
        },
      },
      arrangement: {
        type: "single-horizontal-top-filter" as const,
        // Exceeds the 256mm bed so it splits and grows bottom-plate seam pins.
        filter: { footprintWidth: 370, footprintDepth: 290, thickness: 40 },
      },
    };
    const kit = createTempestPrintableKit(panel, "bed-256");
    expect(kit.parts.length).toBeGreaterThan(1);
    for (const part of kit.parts) {
      expect(manifoldReport(part.mesh)).toEqual(cleanManifold);
    }
  }, 30000);

  test("four-filter tower exports a watertight single body", () => {
    const kit = createTempestPrintableKit(
      { ...defaultTempestSettings, arrangement: { type: "four-side-filter-tower", filter: defaultTempestTowerFilter, bottomFilter: false, feetLength: 0 } },
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
          arrangement: { type: "four-side-filter-tower", filter: { ...defaultTempestTowerFilter, thickness }, bottomFilter: false, feetLength: 0 },
        },
        "unsplit",
      ).parts[0].mesh;
    expect(totalGenus(towerAt(30))).toBe(totalGenus(towerAt(33)));
  });

  test("thick filters keep the full corner chamfer (the max cap)", () => {
    // structuralOffset 65 (~50mm filter): pocket corner far away, so the max applies.
    expect(towerCornerChamfer(fullChamfer, 65, flange)).toBe(fullChamfer);
  });

  test("four-filter tower with box exhaust stays manifold and differs from the fan grid", () => {
    const tower = { type: "four-side-filter-tower" as const, filter: defaultTempestTowerFilter, bottomFilter: false, feetLength: 0 };
    const grid = createTempestPrintableKit({ ...defaultTempestSettings, arrangement: tower }, "unsplit");
    const boxExhaust = createTempestPrintableKit(
      {
        ...defaultTempestSettings,
        arrangement: tower,
        fan: {
          ...defaultTempestSettings.fan,
          topExhaust: "box-exhaust",
          boxExhaust: {
            fanHoleSize: 200,
            ringOne: { screwHoles: 4, screwDiameter: 6, radius: 120 },
            ringTwo: { screwHoles: 4, screwDiameter: 6, radius: 140 },
          },
        },
      },
      "unsplit",
    );
    expect(manifoldReport(boxExhaust.parts[0].mesh)).toEqual(cleanManifold);
    // A central hole + two screw rings is far simpler than the honeycomb fan grid.
    expect(boxExhaust.parts[0].mesh.triangles.length).toBeLessThan(grid.parts[0].mesh.triangles.length);
  });
  test("the wall cord bore carries a drillable 45-degree boss on the inside face", () => {
    // DRILLABLE_CORD_BOSS_TAG: extra meat around the cord bore (approved
    // parts-list item) so builders can drill the hole out for larger
    // connectors. Default model: right wall, cord near the floor corner; the
    // boss face ring reaches bore/2 + 4mm and grows at 45 degrees toward the
    // wall, so the probes below sit inside the meat at any default diameter.
    const model = createTempestModel(defaultTempestSettings);
    if (model.topology !== "sandwich" || model.cordPassThrough.type !== "wall-cylinder") {
      throw new Error("Expected the default sandwich wall cord");
    }
    const face = model.box.width - model.frame.wallThickness;
    const y = model.cordPassThrough.positionAlongWall;
    const z = model.cordPassThrough.verticalCenter;
    withGeometryArena(() => {
      const ctx: GeometryContext<Geom3, Geom2> = { modeling: manifoldModeling, fanPatternCache: new Map() };
      const solid = buildTempestGeometry(manifoldModeling, model);
      const probeAt = (x: number, yy: number, zz: number) =>
        meshVolume(
          extractWeldedMesh(
            manifoldModeling.booleans.intersect(solid, cuboidFromMinSize(ctx, x - 0.2, yy - 0.2, zz - 0.2, 0.4, 0.4, 0.4)),
          ),
        );
      const probeVolume = 0.4 * 0.4 * 0.4;
      // Solid boss meat 2mm in from the wall face, 6.5mm out from the bore axis...
      expect(probeAt(face - 2, y + 6.5, z)).toBeCloseTo(probeVolume, 3);
      // ...the bore itself stays open through the boss...
      expect(probeAt(face - 2, y, z)).toBe(0);
      // ...and past the boss depth it is open chamber again.
      expect(probeAt(face - 6, y + 6.5, z)).toBe(0);
      return [];
    });
  });
});
