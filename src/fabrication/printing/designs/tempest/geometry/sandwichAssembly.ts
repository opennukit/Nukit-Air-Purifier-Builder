import type {
  TempestFanLayout,
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
  outerChamferedWallPrism,
  subtractAll,
} from "./primitives";
import { fanPatternCut, filterOpening2d } from "./patterns2d";

// #######################################
// 1 / 2 Filter Sandwich Assembly
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

export function platePanel<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>,
): Solid {
  const plate = chamferedPrism(
    ctx,
    0,
    0,
    0,
    model.box.width,
    model.box.depth,
    model.frame.outsideFlangeThickness,
    model.frame.chamferSize,
  );
  // The "Back" fan grid: bore each fan opening + its screw holes straight through
  // the solid plate (z), centered on the plate's thickness.
  const grid = fanLayout.bottomPlate;
  if (grid.fanCount === 0) {
    return plate;
  }
  const cuts = grid.positionsX.flatMap((x) =>
    grid.positionsY.map((y) =>
      fanPatternCut(
        ctx,
        model,
        "z",
        [x, y, model.frame.outsideFlangeThickness / 2],
        model.frame.outsideFlangeThickness + 2 * SHELL_OVERLAP_MM,
      ),
    ),
  );
  return subtractAll(ctx, plate, cuts);
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
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
  localFanCenter: number,
): Solid {
  const body = outerChamferedWallPrism(ctx, length, model.frame.wallThickness, model.box.wallHeight, model.frame.chamferSize);
  const fanHoles = fanLayout.positionsAlongWall.map((position) =>
    fanPatternCut(
      ctx,
      model,
      "y",
      [position, model.frame.wallThickness / 2, localFanCenter],
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
  // The slot may reach up to the adjacent walls' inner faces but never into the
  // exterior corner bevel: past `chamferSize` from the wall end, the through-cut
  // would pierce the bevel face the two walls share and open a corner slit.
  const endMargin = Math.max(model.settings.filterSlot.endMargin, model.frame.chamferSize);
  return [
    cuboidFromMinSize(
      ctx,
      endMargin,
      -SHELL_OVERLAP_MM,
      localZBottom,
      Math.max(0.001, wallLength - 2 * endMargin),
      model.frame.wallThickness + 2 * SHELL_OVERLAP_MM,
      localZTop - localZBottom,
    ),
  ];
}
