import type { TempestModel } from "@/domain/designs/tempest/model";

// Clearance kept between the cord hole and a fan body before they are treated as
// colliding (mm). Touching exactly is already too close to print cleanly.
const CORD_FAN_CLEARANCE_MM = 1;

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
    for (const fanX of model.fanLayout.positionsX) {
      for (const fanY of model.fanLayout.positionsY) {
        if (Math.abs(cord.x - fanX) < reach && Math.abs(cord.y - fanY) < reach) {
          return true;
        }
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
    // Map the cord along-wall position into the same local frame the fan positions
    // use for this wall (front/right run with the cord; back/left mirror across the
    // wall length).
    const localPos =
      cord.wall === "front" || cord.wall === "right"
        ? cord.positionAlongWall
        : (cord.wall === "back" ? model.box.width : model.box.depth) - cord.positionAlongWall;
    return row.positionsAlongWall.some((position) => Math.abs(position - localPos) < reach);
  }

  return false;
}
