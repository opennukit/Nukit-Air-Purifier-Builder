import type {
  TempestFilterLayout,
  TempestModel,
  TempestWallFanLayout,
} from "@/domain/designs/tempest/model";
import type { GeometryContext } from "./context";
import { epsilon, scadWallCutOverlap } from "./context";
import {
  chamferedOpeningCutAlongZ,
  chamferedPrism,
  cuboidFromMinSize,
  subtractAll,
  unionAll,
} from "./primitives";
import { fanPatternCut, filterOpening2d } from "./patterns2d";
import { horizontalWallFanLayout, horizontalWallLocalFanCenter } from "./layout";

// #######################################
// 1 / 2 Filter Horizontal Assembly
// #######################################

export function assemblyHorizontal<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }>,
): Solid {
  const { transforms } = ctx.modeling;
  const bottomPanel = filterLayout.bottomPanel === "solid-plate" ? platePanel(ctx, model) : framePanel(ctx, model);
  const topFrame = transforms.translate([0, 0, model.box.height - model.frame.outsideFlangeThickness], framePanel(ctx, model));
  const flanges = filterLayout.flanges.map((flange) =>
    transforms.translate([0, 0, flange.zBottom], flangePanel(ctx, model, model.frame.insideFlangeThickness)),
  );
  const fanLayout = horizontalWallFanLayout(model);

  return unionAll(ctx, [
    bottomPanel,
    topFrame,
    ...flanges,
    transforms.translate(
      [0, 0, model.frame.outsideFlangeThickness],
      wall(ctx, model, model.box.width, fanLayout.walls.front, filterLayout),
    ),
    transforms.translate(
      [model.box.width, model.box.depth, model.frame.outsideFlangeThickness],
      transforms.rotateZ(Math.PI, wall(ctx, model, model.box.width, fanLayout.walls.back, filterLayout)),
    ),
    transforms.translate(
      [0, model.box.depth, model.frame.outsideFlangeThickness],
      transforms.rotateZ(-Math.PI / 2, wall(ctx, model, model.box.depth, fanLayout.walls.left, filterLayout)),
    ),
    transforms.translate(
      [model.box.width, 0, model.frame.outsideFlangeThickness],
      transforms.rotateZ(Math.PI / 2, wall(ctx, model, model.box.depth, fanLayout.walls.right, filterLayout)),
    ),
  ]);
}

export function framePanel<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid {
  const panel = chamferedPrism(
    ctx,
    0,
    0,
    0,
    model.box.width,
    model.box.depth,
    model.frame.outsideFlangeThickness,
    model.frame.chamferSize,
  );
  const opening = filterOpening2d(ctx, model);
  if (opening === null) {
    return panel;
  }
  return subtractAll(ctx, panel, [chamferedOpeningCutAlongZ(ctx, opening, model.frame.outsideFlangeThickness, model.frame.chamferSize)]);
}

export function platePanel<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid {
  return chamferedPrism(
    ctx,
    0,
    0,
    0,
    model.box.width,
    model.box.depth,
    model.frame.outsideFlangeThickness,
    model.frame.chamferSize,
  );
}

export function flangePanel<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel, height: number): Solid {
  const { transforms, extrusions } = ctx.modeling;
  const panel = chamferedPrism(ctx, 0, 0, 0, model.box.width, model.box.depth, height, model.frame.chamferSize);
  const opening = filterOpening2d(ctx, model);
  if (opening === null) {
    return panel;
  }
  return subtractAll(ctx, panel, [
    transforms.translate(
      [0, 0, -epsilon],
      extrusions.extrudeLinear({ height: height + 2 * epsilon }, opening),
    ),
  ]);
}

export function wall<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  length: number,
  fanLayout: TempestWallFanLayout,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }>,
): Solid {
  const body = chamferedPrism(ctx, 0, 0, 0, length, model.frame.wallThickness, model.box.wallHeight, model.frame.chamferSize);
  const fanHoles = fanLayout.positionsAlongWall.map((position) =>
    fanPatternCut(
      ctx,
      model,
      "y",
      [position, model.frame.wallThickness / 2, horizontalWallLocalFanCenter(model)],
      model.frame.wallThickness + 2 * scadWallCutOverlap,
    ),
  );
  const slotHoles =
    model.settings.filterSlot.wall === fanLayout.wall
      ? filterLayout.loading.slots.flatMap((slot) => horizontalFilterSlotHole(ctx, model, length, slot.localZBottom, slot.localZTop))
      : [];

  return subtractAll(ctx, body, [...fanHoles, ...slotHoles]);
}

export function horizontalFilterSlotHole<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  wallLength: number,
  localZBottom: number,
  localZTop: number,
): Solid[] {
  if (localZTop <= localZBottom) {
    return [];
  }
  return [
    cuboidFromMinSize(
      ctx,
      model.settings.filterSlot.endMargin,
      -scadWallCutOverlap,
      localZBottom,
      Math.max(0.001, wallLength - 2 * model.settings.filterSlot.endMargin),
      model.frame.wallThickness + 2 * scadWallCutOverlap,
      localZTop - localZBottom,
    ),
  ];
}
