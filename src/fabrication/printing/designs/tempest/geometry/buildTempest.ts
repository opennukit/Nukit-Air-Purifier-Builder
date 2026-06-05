import type { TempestChunkGrid, TempestModel } from "@/domain/designs/tempest/model";
import type { ModelingApi } from "@/fabrication/printing/modeling/modelingApi";
import type { GeometryContext } from "./context";
import { subtractAll } from "./primitives";
import { assemblyHorizontal } from "./horizontalAssembly";
import { assemblyTower } from "./towerAssembly";
import { cordHoleCylinders, pinHoles } from "./pins";

type TempestGeometryOptions = {
  readonly alignmentPinChunkGrid?: TempestChunkGrid;
};

// Entry point for the parametric Tempest geometry. Bundles the injected modeling
// backend + a per-build fan-pattern cache into the GeometryContext that every
// helper threads through, then dispatches on the filter arrangement.
export function buildTempestGeometry<Solid, Region>(
  modeling: ModelingApi<Solid, Region>,
  model: TempestModel,
  alignmentPinChunkGrid?: TempestChunkGrid,
): Solid {
  const ctx: GeometryContext<Solid, Region> = { modeling, fanPatternCache: new Map<string, Region>() };
  return finalModel(ctx, model, { alignmentPinChunkGrid });
}

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

function assembly<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid {
  return model.filterLayout.type === "side-filter-tower"
    ? assemblyTower(ctx, model, model.filterLayout)
    : assemblyHorizontal(ctx, model, model.filterLayout);
}
