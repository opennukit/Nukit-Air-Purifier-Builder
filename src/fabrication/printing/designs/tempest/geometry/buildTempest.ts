import type { TempestChunkGrid, TempestFanLayout, TempestFilterLayout, TempestModel } from "@/domain/designs/tempest/model";
import { tempestWalls } from "@/domain/designs/tempest/shared";
import { matchTopology } from "@/domain/designs/tempest/topology";
import type { ModelingApi } from "@/fabrication/printing/modeling/modelingApi";
import type { GeometryContext } from "./context";
import { EPSILON_LIP } from "./context";
import { chamferedRectangle2d, edgeChamferSolid, subtractAll, unionAll } from "./primitives";
import {
  quadBottomFilterCuts,
  towerAirChamber,
  towerCornerChamfer,
  towerFeet,
  quadTopExhaust,
  quadBottomFans,
  towerFilterPocket,
  towerFilterSlots,
  towerSideOpening,
} from "./quadAssembly";
import { flangePanel, framePanel, platePanel, wall } from "./sandwichAssembly";
import { cordBossCones, cordHoleCylinders, pinHoles } from "./pins";

// #######################################
// The Build Timeline
// #######################################

// Read this file top to bottom and it is the recipe for building the box — like a
// Fusion 360 timeline. Each step is a named call, and that call IS one timeline
// node; opening the function it names (in ./quadAssembly, ./sandwichAssembly,
// ./pins) is the "double-click to see this operation's internals". The low-level
// shapes those nodes are built from live in ./primitives and ./patterns2d.
//
// There are two recipes because the builder makes two product families — a
// 1/2-filter sandwich box and a 4-filter side-filter quad tower. `assembly`
// dispatches on the model's topology via matchTopology.

type TempestGeometryOptions = {
  readonly alignmentPinChunkGrid?: TempestChunkGrid;
};

// Entry point. Bundles the injected modeling backend + a per-build fan-pattern
// cache into the GeometryContext that every node threads through, then runs it.
export function buildTempestGeometry<Solid, Region>(
  modeling: ModelingApi<Solid, Region>,
  model: TempestModel,
  alignmentPinChunkGrid?: TempestChunkGrid,
): Solid {
  const ctx: GeometryContext<Solid, Region> = { modeling, fanPatternCache: new Map<string, Region>() };
  return finalModel(ctx, model, { alignmentPinChunkGrid });
}

// Outermost step: build the housing for the chosen filter layout, then drill the
// holes that pass through everything — the cord pass-through and the alignment-pin
// holes at the print-chunk seams.
function finalModel<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  options: TempestGeometryOptions,
): Solid {
  // Build the shell (plus the drillable cord boss), then drill the cord
  // pass-through BEFORE placing pins. The pin socket-embedding test and the
  // chunk-split coverage check both read this shell, so they must see the cord
  // void: testing sockets against a pre-cord shell let a seam pin drill coaxially
  // through the cord hole (the socket then opens sideways into the bore, a
  // through-hole into an internal void). The boss joins the shell first so the
  // bore pierces both, and the finished shell (windows, pockets, exhaust cuts) is
  // still what the coverage check needs to see how each chunk splits into pieces.
  const shell = unionAll(ctx, [assembly(ctx, model), ...cordBossCones(ctx, model)]);
  const cordCylinders = cordHoleCylinders(ctx, model);
  const boredShell = cordCylinders.length === 0 ? shell : subtractAll(ctx, shell, cordCylinders);
  return subtractAll(ctx, boredShell, pinHoles(ctx, model, options.alignmentPinChunkGrid ?? model.chunkGrid, boredShell));
}

// Pick the recipe named by the model's topology. TempestModel is a union, so the
// one match narrows the model AND its filter/fan layout arms together — both
// recipe args come straight off the narrowed model with no re-narrow.
function assembly<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid {
  return matchTopology(model, {
    sandwich: (m) => assembleSandwich(ctx, m, m.filterLayout, m.fanLayout),
    quad: (m) => assembleQuad(ctx, m, m.filterLayout, m.fanLayout),
  });
}

// #######################################
// Recipe: 4-filter side-filter quad tower
// #######################################

// Built top to bottom:
//   1. Start with the outer box, corners chamfered. (Exterior edges are always
//      chamfers, never fillets — fillets on outside edges print poorly with
//      thick layers; internal vertical fillets are fine and added for strength.)
//   2. Hollow out the central air chamber, its vertical corners filleted.
//   3. Carve the four filter pockets, one per wall.
//   4. Cut each wall's inlet (outer) and outlet (inner) opening.
//   5. Cut the top exhaust: a fan grid or a single box-fan opening.
//   6. Cut the slots you push the filters down through.
function assembleQuad<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
): Solid {
  const { transforms } = ctx.modeling;
  // 1. The outer box. The octagonal footprint carries the vertical-corner bevel
  //    (towerCornerChamfer keeps it a full wall clear of the nearest filter
  //    pocket); extruding it through topBottomEdgeChamferSolid adds the same
  //    small horizontal-edge chamfer the sandwich carries (model.frame.chamferSize)
  //    around the whole top and bottom outline — main faces AND corner posts.
  const outerFootprint = chamferedRectangle2d(
    ctx,
    model.box.width,
    model.box.depth,
    towerCornerChamfer(model.frame.towerCornerPostChamfer, filterLayout.structuralOffset, model.frame.outsideFlangeThickness),
  );
  // The body sits on top of the corner feet (feetLength tall, or flush when zero):
  // it is the full-footprint shell from feetLength up, with the four legs unioned
  // below it. The model has folded feetLength + any bottom-filter stack into
  // box.height, so the body still reaches box.height.
  const feetLength = filterLayout.feetLength;
  const body = transforms.translate(
    [0, 0, feetLength],
    // With feet, the body's bottom edge meets the legs, so leave it square (no
    // bevel); the top edge keeps the usual chamfer. Without feet the bottom is the
    // box base and keeps its chamfer as before.
    edgeChamferSolid(ctx, outerFootprint, model.box.height - feetLength, model.frame.chamferSize, {
      bottom: feetLength <= 0,
      top: true,
    }),
  );
  const feet = towerFeet(ctx, model, filterLayout, outerFootprint);
  const outerBox = feet.length === 0 ? body : unionAll(ctx, [body, ...feet]);

  // 2-7. Subtract every void from the box.
  return subtractAll(ctx, outerBox, [
    towerAirChamber(ctx, model, filterLayout), // 2. central air chamber, vertical corners filleted for strength
    ...tempestWalls.map((wallName) => towerFilterPocket(ctx, model, filterLayout, filterLayout.wallRects[wallName])), // 3. four filter pockets
    // 4. each wall's inlet (outer face -> flange) and outlet (filter -> chamber) opening
    ...tempestWalls.flatMap((wallName) => {
      const rect = filterLayout.wallRects[wallName];
      return [
        ...towerSideOpening(ctx, model, filterLayout, wallName, rect, -EPSILON_LIP, model.frame.outsideFlangeThickness + EPSILON_LIP),
        ...towerSideOpening(
          ctx,
          model,
          filterLayout,
          wallName,
          rect,
          model.frame.outsideFlangeThickness + filterLayout.filter.thickness - EPSILON_LIP,
          filterLayout.structuralOffset + EPSILON_LIP,
        ),
      ];
    }),
    ...quadTopExhaust(ctx, model, filterLayout, fanLayout), // 5. top exhaust: fan grid or single box-fan opening
    ...quadBottomFans(ctx, model, filterLayout, fanLayout), // 5b. bottom fan grid (mirror of the top), when enabled
    ...towerFilterSlots(ctx, model, filterLayout), // 6. slots you push the filters through
    ...quadBottomFilterCuts(ctx, model, filterLayout), // 7. bottom intake filter holder (square filter only)
  ]);
}

// #######################################
// Recipe: 1 / 2-filter sandwich box
// #######################################

// Assembled from stacked panels + four walls:
//   1. Bottom panel — a solid plate (1-filter) or an open frame (2-filter).
//   2. Top frame — open; the filter sits below it.
//   3. The inside flange(s) the filter(s) rest on.
//   4. The four side walls, each carrying its fan holes (and a filter slot on the
//      loading wall). Everything is unioned into one body.
function assembleSandwich<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>,
): Solid {
  const { transforms } = ctx.modeling;

  const bottomPanel = filterLayout.bottomPanel === "solid-plate" ? platePanel(ctx, model, fanLayout) : framePanel(ctx, model); // 1.
  const topFrame = transforms.translate(
    [0, 0, model.box.height - model.frame.outsideFlangeThickness],
    framePanel(ctx, model),
  ); // 2.
  const flanges = filterLayout.flanges.map((flange) =>
    transforms.translate([0, 0, flange.zBottom], flangePanel(ctx, model, model.frame.insideFlangeThickness)),
  ); // 3.
  const fanCenter = fanLayout.localVerticalCenter;

  // 4. Union the panels with the four side walls.
  return unionAll(ctx, [
    bottomPanel,
    topFrame,
    ...flanges,
    transforms.translate(
      [0, 0, model.frame.outsideFlangeThickness],
      wall(ctx, model, model.box.width, fanLayout.walls.front, filterLayout, fanCenter),
    ),
    transforms.translate(
      [model.box.width, model.box.depth, model.frame.outsideFlangeThickness],
      transforms.rotateZ(Math.PI, wall(ctx, model, model.box.width, fanLayout.walls.back, filterLayout, fanCenter)),
    ),
    transforms.translate(
      [0, model.box.depth, model.frame.outsideFlangeThickness],
      transforms.rotateZ(-Math.PI / 2, wall(ctx, model, model.box.depth, fanLayout.walls.left, filterLayout, fanCenter)),
    ),
    transforms.translate(
      [model.box.width, 0, model.frame.outsideFlangeThickness],
      transforms.rotateZ(Math.PI / 2, wall(ctx, model, model.box.depth, fanLayout.walls.right, filterLayout, fanCenter)),
    ),
  ]);
}
