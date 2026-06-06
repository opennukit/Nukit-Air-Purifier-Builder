import type { TempestChunkGrid, TempestFanLayout, TempestFilterLayout, TempestModel } from "@/domain/designs/tempest/model";
import { tempestWalls } from "@/domain/designs/tempest/model";
import { assertNever, matchTopology } from "@/domain/designs/tempest/topology";
import type { ModelingApi } from "@/fabrication/printing/modeling/modelingApi";
import type { GeometryContext } from "./context";
import { EPSILON_LIP } from "./context";
import { chamferedPrism, subtractAll, unionAll } from "./primitives";
import {
  towerAirChamber,
  towerCornerChamfer,
  towerFanGrid,
  towerFilterPocket,
  towerFilterSlots,
  towerSideOpening,
} from "./quadAssembly";
import { flangePanel, framePanel, platePanel, wall } from "./sandwichAssembly";
import { cordHoleCylinders, pinHoles } from "./pins";

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
  return subtractAll(ctx, assembly(ctx, model), [
    ...cordHoleCylinders(ctx, model),
    ...pinHoles(ctx, model, options.alignmentPinChunkGrid ?? model.chunkGrid),
  ]);
}

// Pick the recipe named by the model's topology.
function assembly<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid {
  return matchTopology(model.topology, {
    sandwich: () => assembleSandwich(ctx, model, expectSandwichFilters(model.filterLayout), expectSandwichFans(model.fanLayout)),
    quad: () => assembleQuad(ctx, model, expectQuadFilters(model.filterLayout), expectQuadFans(model.fanLayout)),
  });
}

// planForArrangement returns a topology-consistent triple, so once the model's
// topology tag has matched, the layout arms are known. These guards prove the
// dead branch unreachable to the type system without re-validating caller input
// (unlike the deleted layout.ts throws, which guarded against real mismatches).
function expectSandwichFilters(layout: TempestFilterLayout): Extract<TempestFilterLayout, { readonly topology: "sandwich" }> {
  return layout.topology === "sandwich" ? layout : assertNever(layout.topology as never);
}

function expectQuadFilters(layout: TempestFilterLayout): Extract<TempestFilterLayout, { readonly topology: "quad" }> {
  return layout.topology === "quad" ? layout : assertNever(layout.topology as never);
}

function expectSandwichFans(layout: TempestFanLayout): Extract<TempestFanLayout, { readonly topology: "sandwich" }> {
  return layout.topology === "sandwich" ? layout : assertNever(layout.topology as never);
}

function expectQuadFans(layout: TempestFanLayout): Extract<TempestFanLayout, { readonly topology: "quad" }> {
  return layout.topology === "quad" ? layout : assertNever(layout.topology as never);
}

// #######################################
// Recipe: 4-filter side-filter quad tower
// #######################################

// Built top to bottom:
//   1. Start with the outer box, corners chamfered.
//   2. Hollow out the central air chamber.
//   3. Carve the four filter pockets, one per wall.
//   4. Cut each wall's inlet (outer) and outlet (inner) opening.
//   5. Cut the top fan grid (or a single box-fan exhaust).
//   6. Cut the slots you push the filters down through.
function assembleQuad<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
): Solid {
  // 1. The outer box; towerCornerChamfer keeps the bevel a full wall clear of the
  //    nearest filter pocket.
  const outerBox = chamferedPrism(
    ctx,
    0,
    0,
    0,
    model.box.width,
    model.box.depth,
    model.box.height,
    towerCornerChamfer(model.frame.towerCornerPostChamfer, filterLayout.structuralOffset, model.frame.outsideFlangeThickness),
  );

  // 2-6. Subtract every void from the box.
  return subtractAll(ctx, outerBox, [
    towerAirChamber(ctx, filterLayout), // 2. central air chamber
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
    ...towerFanGrid(ctx, model, filterLayout, fanLayout), // 5. top fan grid (or single box-fan exhaust)
    ...towerFilterSlots(ctx, model, filterLayout), // 6. slots you push the filters through
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

  const bottomPanel = filterLayout.bottomPanel === "solid-plate" ? platePanel(ctx, model) : framePanel(ctx, model); // 1.
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
