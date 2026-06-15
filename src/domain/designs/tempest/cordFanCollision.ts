import type { TempestModel } from "@/domain/designs/tempest/model";

// Clearance kept between the cord hole and a fan body before they are treated as
// colliding (mm). Touching exactly is already too close to print cleanly.
const CORD_FAN_CLEARANCE_MM = 1;

// True when the power-cord pass-through overlaps a fan in the current model.
//
// The four-side tower routes the cord straight up through the top plate at a
// chamber corner, where the top fan grid also lives, so the two can intersect.
// The horizontal (1-top / sandwich) layouts already shift their wall fans
// vertically clear of the cord (see horizontalFanVerticalCenter), so only the
// tower needs this check.
export function tempestCordFanCollision(model: TempestModel): boolean {
  const cord = model.cordPassThrough;
  if (cord.type === "none") {
    return false;
  }
  if (model.topology !== "quad" || cord.type !== "top-cylinder") {
    return false;
  }
  if (model.fanLayout.topology !== "quad") {
    return false;
  }
  // A PC fan is a square frame, so test the cord against each fan's square
  // footprint (half-width = fan diameter / 2) rather than a circle — the cord can
  // otherwise sit in a fan's corner (inside the body) while clearing its round
  // opening.
  const reach = cord.diameter / 2 + model.settings.fan.diameter / 2 + CORD_FAN_CLEARANCE_MM;
  for (const fanX of model.fanLayout.positionsX) {
    for (const fanY of model.fanLayout.positionsY) {
      if (Math.abs(cord.x - fanX) < reach && Math.abs(cord.y - fanY) < reach) {
        return true;
      }
    }
  }
  return false;
}
