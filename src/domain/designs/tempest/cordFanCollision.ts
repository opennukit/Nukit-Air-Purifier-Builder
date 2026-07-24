import type { TempestModel } from "@/domain/designs/tempest/model";
import { sandwichCordWallLocalPos, SANDWICH_CORD_FAN_CLEARANCE_MM } from "@/domain/designs/tempest/shared";

// Clearance kept between the cord hole and a fan body before they are treated as
// colliding (mm). Touching exactly is already too close to print cleanly. Shared
// with the sandwich fan-row repack so the warning and the geometry stay in lockstep.
const CORD_FAN_CLEARANCE_MM = SANDWICH_CORD_FAN_CLEARANCE_MM;

// True when the power-cord pass-through overlaps a fan in the current model.
//
// The four-side tower routes the cord straight up through the top plate at a
// chamber corner, where the top fan grid also lives, so the two can intersect;
// avoidTowerFans shifts the cord to a clear spot, and this flags the rare case
// where none exists. The horizontal (1-top / sandwich) layouts repack the wall
// fan row clear of the cord (horizontalWallFanPositions), but a wall packed to
// its maximum fan count has no slack to shift into, so a center cord can still
// land in a fan. Both residual cases surface here as a build warning.
export function tempestCordFanCollision(model: TempestModel): boolean {
  const cord = model.cordPassThrough;
  if (cord.type === "none") {
    return false;
  }
  const reach = cord.diameter / 2 + model.settings.fan.diameter / 2 + CORD_FAN_CLEARANCE_MM;

  if (model.topology === "quad" && cord.type === "top-cylinder" && model.fanLayout.topology === "quad") {
    // A PC fan is a square frame, so test the cord against each fan's square
    // footprint (half-width = fan diameter / 2) rather than a circle: the cord can
    // otherwise sit in a fan's corner (inside the body) while clearing its round
    // opening.
    for (const fan of model.fanLayout.top.positions) {
      if (Math.abs(cord.x - fan.x) < reach && Math.abs(cord.y - fan.y) < reach) {
        return true;
      }
    }
    return false;
  }

  if (model.topology === "sandwich" && cord.type === "wall-cylinder" && model.fanLayout.topology === "sandwich") {
    const row = model.fanLayout.walls[cord.wall];
    if (row.positionsAlongWall.length === 0) {
      return false;
    }
    // The fan row sits at outsideFlangeThickness + localVerticalCenter in box
    // coordinates; if the cord clears it vertically there is no collision.
    const fanRowHeight = model.frame.outsideFlangeThickness + model.fanLayout.localVerticalCenter;
    if (Math.abs(cord.verticalCenter - fanRowHeight) >= reach) {
      return false;
    }
    const localPos = sandwichCordWallLocalPos(cord.wall, cord.positionAlongWall, model.box.width, model.box.depth);
    return row.positionsAlongWall.some((position) => Math.abs(position - localPos) < reach);
  }

  return false;
}
