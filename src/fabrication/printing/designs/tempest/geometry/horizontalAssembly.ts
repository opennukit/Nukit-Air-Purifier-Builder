import type {
  TempestFilterLayout,
  TempestModel,
  TempestWallFanLayout,
} from "@/domain/designs/tempest/model";
import type { GeometryContext } from "./context";
import { EPSILON_LIP, SHELL_OVERLAP_MM } from "./context";
import {
  chamferedOpeningCutAlongZ,
  chamferedPrism,
  cuboidFromMinSize,
  subtractAll,
} from "./primitives";
import { fanPatternCut, filterOpening2d } from "./patterns2d";
import { horizontalWallLocalFanCenter } from "./layout";

// #######################################
// 1 / 2 Filter Horizontal Assembly
// #######################################

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
      [0, 0, -EPSILON_LIP],
      extrusions.extrudeLinear({ height: height + 2 * EPSILON_LIP }, opening),
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
      model.frame.wallThickness + 2 * SHELL_OVERLAP_MM,
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
      -SHELL_OVERLAP_MM,
      localZBottom,
      Math.max(0.001, wallLength - 2 * model.settings.filterSlot.endMargin),
      model.frame.wallThickness + 2 * SHELL_OVERLAP_MM,
      localZTop - localZBottom,
    ),
  ];
}
