import type { TempestChunkGrid, TempestFilterLayout, TempestModel } from "@/domain/designs/tempest/model";
import type { GeometryContext } from "./context";
import { EPSILON_LIP, SHELL_OVERLAP_MM } from "./context";
import { cylinderAlong, cylinderAlongFromStart, unionAll } from "./primitives";
import { horizontalWallLocalFanCenter, towerFilterThickness } from "./layout";

type AlignmentPinSpec = { readonly diameter: number; readonly holeDepth: number; readonly spacing: number };

const CORD_CYLINDER_SEGMENTS = 24; // facets on the cord pass-through cylinders

// #######################################
// Cord Pass-Through
// #######################################

export function cordHoleCylinders<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid[] {
  const cord = model.cordPassThrough;
  if (cord.type === "none") {
    return [];
  }
  if (cord.type === "top-cylinder") {
    return [cylinderAlong(ctx, "z", [cord.x, cord.y, cord.zStart + cord.depth / 2], cord.depth + 2 * EPSILON_LIP, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }

  const wallCenter = model.frame.wallThickness / 2;
  const oppositeWallCenter = cord.wall === "front" || cord.wall === "back" ? model.box.depth - wallCenter : model.box.width - wallCenter;
  const length = model.frame.wallThickness + 2 * SHELL_OVERLAP_MM;
  if (cord.wall === "front") {
    return [cylinderAlong(ctx, "y", [cord.positionAlongWall, wallCenter, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  if (cord.wall === "back") {
    return [cylinderAlong(ctx, "y", [cord.positionAlongWall, oppositeWallCenter, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  if (cord.wall === "left") {
    return [cylinderAlong(ctx, "x", [wallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  return [cylinderAlong(ctx, "x", [oppositeWallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
}

// #######################################
// Alignment Pins
// #######################################

export function pinHoles<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  chunkGrid: TempestChunkGrid,
): Solid[] {
  if (model.settings.alignmentPins.type === "disabled") {
    return [];
  }
  const pin = model.settings.alignmentPins;
  if (
    pin.diameter <= 0 ||
    pin.holeDepth <= 0 ||
    pin.spacing <= 0 ||
    (chunkGrid.countX <= 1 && chunkGrid.countY <= 1 && chunkGrid.countZ <= 1)
  ) {
    return [];
  }

  const candidates =
    model.filterLayout.topology === "quad"
      ? pinCandidatesTower(ctx, model, model.filterLayout, chunkGrid, pin)
      : pinCandidatesHorizontal(ctx, model, model.filterLayout, chunkGrid, pin);
  if (candidates.length === 0) {
    return [];
  }
  const fanZones = fanBodyZones(ctx, model);
  const candidateGeometry = unionAll(ctx, candidates);
  return [fanZones.length === 0 ? candidateGeometry : ctx.modeling.booleans.subtract(candidateGeometry, unionAll(ctx, fanZones))];
}

function pinCandidatesHorizontal<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
  chunkGrid: TempestChunkGrid,
  pin: AlignmentPinSpec,
): Solid[] {
  const geometries: Solid[] = [];
  const length = 2 * pin.holeDepth;
  const radius = pin.diameter / 2;

  if (chunkGrid.countX > 1) {
    for (let index = 1; index < chunkGrid.countX; index += 1) {
      const seamX = chunkGrid.boundariesX[index];
      for (const wallY of [model.frame.wallThickness / 2, model.box.depth - model.frame.wallThickness / 2]) {
        for (const gridZ of rimPositions(model.frame.outsideFlangeThickness, model.box.height - model.frame.outsideFlangeThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, wallY, gridZ], length, radius));
        }
      }
      for (const frameZ of horizontalFrameMidlinesWithOpening(model, filterLayout)) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.frame.rim, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, gridY, frameZ], length, radius));
        }
        for (const gridY of rimPositions(model.box.depth - model.frame.rim, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, gridY, frameZ], length, radius));
        }
      }
      for (const frameZ of horizontalSolidPlateMidlines(model, filterLayout)) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, gridY, frameZ], length, radius));
        }
      }
    }
  }

  if (chunkGrid.countY > 1) {
    for (let index = 1; index < chunkGrid.countY; index += 1) {
      const seamY = chunkGrid.boundariesY[index];
      for (const wallX of [model.frame.wallThickness / 2, model.box.width - model.frame.wallThickness / 2]) {
        for (const gridZ of rimPositions(model.frame.outsideFlangeThickness, model.box.height - model.frame.outsideFlangeThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "y", [wallX, seamY - pin.holeDepth, gridZ], length, radius));
        }
      }
      for (const frameZ of horizontalFrameMidlinesWithOpening(model, filterLayout)) {
        for (const gridX of rimPositions(model.frame.wallThickness, model.frame.rim, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "y", [gridX, seamY - pin.holeDepth, frameZ], length, radius));
        }
        for (const gridX of rimPositions(model.box.width - model.frame.rim, model.box.width - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "y", [gridX, seamY - pin.holeDepth, frameZ], length, radius));
        }
      }
      for (const frameZ of horizontalSolidPlateMidlines(model, filterLayout)) {
        for (const gridX of rimPositions(model.frame.wallThickness, model.box.width - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "y", [gridX, seamY - pin.holeDepth, frameZ], length, radius));
        }
      }
    }
  }

  if (chunkGrid.countZ > 1) {
    for (let index = 1; index < chunkGrid.countZ; index += 1) {
      const seamZ = chunkGrid.boundariesZ[index];
      for (const wallY of [model.frame.wallThickness / 2, model.box.depth - model.frame.wallThickness / 2]) {
        for (const gridX of rimPositions(0, model.box.width, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "z", [gridX, wallY, seamZ - pin.holeDepth], length, radius));
        }
      }
      for (const wallX of [model.frame.wallThickness / 2, model.box.width - model.frame.wallThickness / 2]) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "z", [wallX, gridY, seamZ - pin.holeDepth], length, radius));
        }
      }
    }
  }

  return geometries;
}

function pinCandidatesTower<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  chunkGrid: TempestChunkGrid,
  pin: AlignmentPinSpec,
): Solid[] {
  const geometries: Solid[] = [];
  const length = 2 * pin.holeDepth;
  const radius = pin.diameter / 2;
  const wallZLow = filterLayout.bottomPlateThickness;
  const wallZHigh = model.box.height - filterLayout.topPlateThickness;

  if (chunkGrid.countX > 1) {
    for (let index = 1; index < chunkGrid.countX; index += 1) {
      const seamX = chunkGrid.boundariesX[index];
      for (const wallY of [model.frame.outsideFlangeThickness / 2, model.box.depth - model.frame.outsideFlangeThickness / 2]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, wallY, gridZ], length, radius));
        }
      }
      for (const wallY of [
        model.frame.outsideFlangeThickness + towerFilterThickness(model) + model.frame.wallThickness / 2,
        model.box.depth - model.frame.outsideFlangeThickness - towerFilterThickness(model) - model.frame.wallThickness / 2,
      ]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, wallY, gridZ], length, radius));
        }
      }
      for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
        geometries.push(cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, gridY, filterLayout.bottomPlateThickness / 2], length, radius));
      }
      for (const gridY of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        geometries.push(
          cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, gridY, model.box.height - filterLayout.topPlateThickness / 2], length, radius),
        );
      }
      for (const gridY of rimPositions(model.box.depth - filterLayout.structuralOffset, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
        geometries.push(
          cylinderAlongFromStart(ctx, "x", [seamX - pin.holeDepth, gridY, model.box.height - filterLayout.topPlateThickness / 2], length, radius),
        );
      }
    }
  }

  if (chunkGrid.countY > 1) {
    for (let index = 1; index < chunkGrid.countY; index += 1) {
      const seamY = chunkGrid.boundariesY[index];
      for (const wallX of [model.frame.outsideFlangeThickness / 2, model.box.width - model.frame.outsideFlangeThickness / 2]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "y", [wallX, seamY - pin.holeDepth, gridZ], length, radius));
        }
      }
      for (const wallX of [
        model.frame.outsideFlangeThickness + towerFilterThickness(model) + model.frame.wallThickness / 2,
        model.box.width - model.frame.outsideFlangeThickness - towerFilterThickness(model) - model.frame.wallThickness / 2,
      ]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "y", [wallX, seamY - pin.holeDepth, gridZ], length, radius));
        }
      }
      for (const gridX of rimPositions(model.frame.wallThickness, model.box.width - model.frame.wallThickness, pin.spacing)) {
        geometries.push(cylinderAlongFromStart(ctx, "y", [gridX, seamY - pin.holeDepth, filterLayout.bottomPlateThickness / 2], length, radius));
      }
      for (const gridX of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        geometries.push(
          cylinderAlongFromStart(ctx, "y", [gridX, seamY - pin.holeDepth, model.box.height - filterLayout.topPlateThickness / 2], length, radius),
        );
      }
      for (const gridX of rimPositions(model.box.width - filterLayout.structuralOffset, model.box.width - model.frame.outsideFlangeThickness, pin.spacing)) {
        geometries.push(
          cylinderAlongFromStart(ctx, "y", [gridX, seamY - pin.holeDepth, model.box.height - filterLayout.topPlateThickness / 2], length, radius),
        );
      }
    }
  }

  if (chunkGrid.countZ > 1) {
    for (let index = 1; index < chunkGrid.countZ; index += 1) {
      const seamZ = chunkGrid.boundariesZ[index];
      for (const wallY of [model.frame.outsideFlangeThickness / 2, model.box.depth - model.frame.outsideFlangeThickness / 2]) {
        for (const gridX of rimPositions(0, model.box.width, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "z", [gridX, wallY, seamZ - pin.holeDepth], length, radius));
        }
      }
      for (const wallX of [model.frame.outsideFlangeThickness / 2, model.box.width - model.frame.outsideFlangeThickness / 2]) {
        for (const gridY of rimPositions(model.frame.outsideFlangeThickness, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "z", [wallX, gridY, seamZ - pin.holeDepth], length, radius));
        }
      }
      for (const wallY of [
        model.frame.outsideFlangeThickness + towerFilterThickness(model) + model.frame.wallThickness / 2,
        model.box.depth - model.frame.outsideFlangeThickness - towerFilterThickness(model) - model.frame.wallThickness / 2,
      ]) {
        for (const gridX of rimPositions(filterLayout.structuralOffset, model.box.width - filterLayout.structuralOffset, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "z", [gridX, wallY, seamZ - pin.holeDepth], length, radius));
        }
      }
      for (const wallX of [
        model.frame.outsideFlangeThickness + towerFilterThickness(model) + model.frame.wallThickness / 2,
        model.box.width - model.frame.outsideFlangeThickness - towerFilterThickness(model) - model.frame.wallThickness / 2,
      ]) {
        for (const gridY of rimPositions(filterLayout.structuralOffset, model.box.depth - filterLayout.structuralOffset, pin.spacing)) {
          geometries.push(cylinderAlongFromStart(ctx, "z", [wallX, gridY, seamZ - pin.holeDepth], length, radius));
        }
      }
      const pinXY = filterLayout.structuralOffset - model.frame.wallThickness;
      for (const centerX of [pinXY, model.box.width - pinXY]) {
        for (const centerY of [pinXY, model.box.depth - pinXY]) {
          geometries.push(cylinderAlongFromStart(ctx, "z", [centerX, centerY, seamZ - pin.holeDepth], length, radius));
        }
      }
    }
  }

  return geometries;
}

function fanBodyZones<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid[] {
  if (model.fanLayout.topology !== "sandwich") {
    return [];
  }
  const { transforms } = ctx.modeling;
  const oneWall = (positions: readonly number[]) =>
    positions.map((position) =>
      cylinderAlongFromStart(ctx, "y", [position, -1, horizontalWallLocalFanCenter(model)], model.frame.wallThickness + 2, model.settings.fan.diameter / 2),
    );

  return [
    ...oneWall(model.fanLayout.walls.front.positionsAlongWall).map((geometry) =>
      transforms.translate([0, 0, model.frame.outsideFlangeThickness], geometry),
    ),
    ...oneWall(model.fanLayout.walls.back.positionsAlongWall).map((geometry) =>
      transforms.translate([model.box.width, model.box.depth, model.frame.outsideFlangeThickness], transforms.rotateZ(Math.PI, geometry)),
    ),
    ...oneWall(model.fanLayout.walls.left.positionsAlongWall).map((geometry) =>
      transforms.translate([0, model.box.depth, model.frame.outsideFlangeThickness], transforms.rotateZ(-Math.PI / 2, geometry)),
    ),
    ...oneWall(model.fanLayout.walls.right.positionsAlongWall).map((geometry) =>
      transforms.translate([model.box.width, 0, model.frame.outsideFlangeThickness], transforms.rotateZ(Math.PI / 2, geometry)),
    ),
  ];
}

function horizontalFrameMidlinesWithOpening(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): readonly number[] {
  return [
    model.box.height - model.frame.outsideFlangeThickness / 2,
    ...(filterLayout.bottomPanel === "open-frame" ? [model.frame.outsideFlangeThickness / 2] : []),
    ...filterLayout.flanges.map((flange) => (flange.zBottom + flange.zTop) / 2),
  ];
}

function horizontalSolidPlateMidlines(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): readonly number[] {
  return filterLayout.bottomPanel === "solid-plate" ? [model.frame.outsideFlangeThickness / 2] : [];
}

function rimPositions(low: number, high: number, spacing: number): readonly number[] {
  const width = high - low;
  const count = width <= 0 ? 0 : Math.max(1, Math.floor(width / spacing));
  const step = count > 0 ? width / count : 0;
  return count === 0 ? [] : Array.from({ length: count }, (_, index) => low + (index + 0.5) * step);
}
