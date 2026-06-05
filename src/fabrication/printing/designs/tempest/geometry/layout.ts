import type { TempestModel } from "@/domain/designs/tempest/model";

// #######################################
// Derived Helpers
// #######################################

export function horizontalWallFanLayout(
  model: TempestModel,
): Extract<TempestModel["fanLayout"], { readonly type: "horizontal-wall-fans" }> {
  if (model.fanLayout.type !== "horizontal-wall-fans") {
    throw new Error("horizontalWallFanLayout: Expected horizontal wall fans");
  }
  return model.fanLayout;
}

export function horizontalWallLocalFanCenter(model: TempestModel): number {
  return horizontalWallFanLayout(model).localVerticalCenter;
}

export function fanScrewPitch(model: TempestModel): number {
  return model.fanLayout.screwPitch;
}

export function towerFilter(
  model: TempestModel,
): Extract<TempestModel["settings"]["arrangement"], { readonly type: "four-side-filter-tower" }>["filter"] {
  if (model.settings.arrangement.type !== "four-side-filter-tower") {
    throw new Error("towerFilter: Expected four-side-filter-tower arrangement");
  }
  return model.settings.arrangement.filter;
}

export function towerFilterThickness(model: TempestModel): number {
  return towerFilter(model).thickness;
}
