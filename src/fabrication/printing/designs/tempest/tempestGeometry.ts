import type { ModelingApi } from "@/fabrication/printing/modelingApi";
import type {
  TempestChunkGrid,
  TempestFilterLayout,
  TempestModel,
  TempestWall,
  TempestWallFanLayout,
} from "@/domain/designs/tempest/model";

// #######################################
// Parametric Tempest Geometry (kernel-agnostic)
// #######################################

// The single source of truth for the Tempest purifier shape. It is written
// against the abstract `ModelingApi`, never a concrete CSG kernel, so the same
// code drives both the static Builder's Manifold export and the in-browser
// design editor's JSCAD preview. Function names and construction order follow
// the original model so it stays auditable feature-by-feature.

const epsilon = 0.05;
const scadWallCutOverlap = 0.5;
// The geometry's own tessellation resolution, passed explicitly to every
// circular primitive so it does not depend on any backend's global default.
const csgSegments = 48;

type TempestGeometryOptions = {
  readonly alignmentPinChunkGrid?: TempestChunkGrid;
};

export function buildTempestGeometry<Solid, Region>(
  modeling: ModelingApi<Solid, Region>,
  model: TempestModel,
  alignmentPinChunkGrid?: TempestChunkGrid,
): Solid {
  const { primitives, transforms, transforms2d, extrusions, expansions, hulls, booleans, booleans2d } = modeling;
  // Per-build memo of fan-pattern cross-sections. Local to the call so it can
  // never outlive the build: under Manifold the arena wrapping the build owns
  // and frees the handles it holds, and there is no cross-build state to dangle.
  const fanPatternCache = new Map<string, Region>();

// #######################################
// SCAD Top-Level Model
// #######################################

function finalModel(model: TempestModel, options: TempestGeometryOptions): Solid {
  return subtractAll(assembly(model), [
    ...cordHoleCylinders(model),
    ...pinHoles(model, options.alignmentPinChunkGrid ?? model.chunkGrid),
  ]);
}

function assembly(model: TempestModel): Solid {
  return model.filterLayout.type === "side-filter-tower"
    ? assemblyTower(model, model.filterLayout)
    : assemblyHorizontal(model, model.filterLayout);
}

// #######################################
// 1 / 2 Filter Horizontal Assembly
// #######################################

function assemblyHorizontal(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }>,
): Solid {
  const bottomPanel = filterLayout.bottomPanel === "solid-plate" ? platePanel(model) : framePanel(model);
  const topFrame = transforms.translate([0, 0, model.box.height - model.frame.outsideFlangeThickness], framePanel(model));
  const flanges = filterLayout.flanges.map((flange) =>
    transforms.translate([0, 0, flange.zBottom], flangePanel(model, model.frame.insideFlangeThickness)),
  );
  const fanLayout = horizontalWallFanLayout(model);

  return unionAll([
    bottomPanel,
    topFrame,
    ...flanges,
    transforms.translate(
      [0, 0, model.frame.outsideFlangeThickness],
      wall(model, model.box.width, fanLayout.walls.front, filterLayout),
    ),
    transforms.translate(
      [model.box.width, model.box.depth, model.frame.outsideFlangeThickness],
      transforms.rotateZ(Math.PI, wall(model, model.box.width, fanLayout.walls.back, filterLayout)),
    ),
    transforms.translate(
      [0, model.box.depth, model.frame.outsideFlangeThickness],
      transforms.rotateZ(-Math.PI / 2, wall(model, model.box.depth, fanLayout.walls.left, filterLayout)),
    ),
    transforms.translate(
      [model.box.width, 0, model.frame.outsideFlangeThickness],
      transforms.rotateZ(Math.PI / 2, wall(model, model.box.depth, fanLayout.walls.right, filterLayout)),
    ),
  ]);
}

function framePanel(model: TempestModel): Solid {
  const panel = chamferedPrism(
    0,
    0,
    0,
    model.box.width,
    model.box.depth,
    model.frame.outsideFlangeThickness,
    model.frame.chamferSize,
  );
  const opening = filterOpening2d(model);
  if (opening === null) {
    return panel;
  }
  return subtractAll(panel, [chamferedOpeningCutAlongZ(opening, model.frame.outsideFlangeThickness, model.frame.chamferSize)]);
}

function platePanel(model: TempestModel): Solid {
  return chamferedPrism(
    0,
    0,
    0,
    model.box.width,
    model.box.depth,
    model.frame.outsideFlangeThickness,
    model.frame.chamferSize,
  );
}

function flangePanel(model: TempestModel, height: number): Solid {
  const panel = chamferedPrism(0, 0, 0, model.box.width, model.box.depth, height, model.frame.chamferSize);
  const opening = filterOpening2d(model);
  if (opening === null) {
    return panel;
  }
  return subtractAll(panel, [
    transforms.translate(
      [0, 0, -epsilon],
      extrusions.extrudeLinear({ height: height + 2 * epsilon }, opening),
    ),
  ]);
}

function wall(
  model: TempestModel,
  length: number,
  fanLayout: TempestWallFanLayout,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }>,
): Solid {
  const body = chamferedPrism(0, 0, 0, length, model.frame.wallThickness, model.box.wallHeight, model.frame.chamferSize);
  const fanHoles = fanLayout.positionsAlongWall.map((position) =>
    fanPatternCut(
      model,
      "y",
      [position, model.frame.wallThickness / 2, horizontalWallLocalFanCenter(model)],
      model.frame.wallThickness + 2 * scadWallCutOverlap,
    ),
  );
  const slotHoles =
    model.settings.filterSlot.wall === fanLayout.wall
      ? filterLayout.loading.slots.flatMap((slot) => horizontalFilterSlotHole(model, length, slot.localZBottom, slot.localZTop))
      : [];

  return subtractAll(body, [...fanHoles, ...slotHoles]);
}

function horizontalFilterSlotHole(model: TempestModel, wallLength: number, localZBottom: number, localZTop: number): Solid[] {
  if (localZTop <= localZBottom) {
    return [];
  }
  return [
    cuboidFromMinSize(
      model.settings.filterSlot.endMargin,
      -scadWallCutOverlap,
      localZBottom,
      Math.max(0.001, wallLength - 2 * model.settings.filterSlot.endMargin),
      model.frame.wallThickness + 2 * scadWallCutOverlap,
      localZTop - localZBottom,
    ),
  ];
}

// #######################################
// 4 Filter Tower Assembly
// #######################################

function assemblyTower(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Solid {
  const solid = chamferedPrism(
    0,
    0,
    0,
    model.box.width,
    model.box.depth,
    model.box.height,
    model.frame.towerCornerPostChamfer,
  );

  return subtractAll(solid, [
    towerAirChamber(filterLayout),
    ...tempestWalls.map((wallName) => towerFilterPocket(model, filterLayout, wallName)),
    ...tempestWalls.flatMap((wallName) => [
      ...towerSideOpening(model, filterLayout, wallName, -epsilon, model.frame.outsideFlangeThickness + epsilon),
      ...towerSideOpening(
        model,
        filterLayout,
        wallName,
        model.frame.outsideFlangeThickness + towerFilterThickness(model) - epsilon,
        filterLayout.structuralOffset + epsilon,
      ),
    ]),
    ...towerFanGrid(model, filterLayout),
    ...towerFilterSlots(model, filterLayout),
  ]);
}

function towerAirChamber(filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>): Solid {
  return cuboidFromMinSize(
    filterLayout.airChamber.xMin,
    filterLayout.airChamber.yMin,
    filterLayout.airChamber.zMin - epsilon,
    filterLayout.airChamber.xMax - filterLayout.airChamber.xMin,
    filterLayout.airChamber.yMax - filterLayout.airChamber.yMin,
    filterLayout.airChamber.zMax - filterLayout.airChamber.zMin + 2 * epsilon,
  );
}

function towerFilterPocket(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
  wallName: TempestWall,
): Solid {
  const filter = towerFilter(model);
  const z = filterLayout.bottomPlateThickness - epsilon;
  const height = model.box.height - filterLayout.bottomPlateThickness - filterLayout.topPlateThickness + 2 * epsilon;
  const offset = filterLayout.structuralOffset;
  const outsideFlange = model.frame.outsideFlangeThickness;

  if (wallName === "front") {
    return cuboidFromMinSize(offset, outsideFlange, z, model.box.width - 2 * offset, filter.thickness, height);
  }
  if (wallName === "back") {
    return cuboidFromMinSize(
      offset,
      model.box.depth - outsideFlange - filter.thickness,
      z,
      model.box.width - 2 * offset,
      filter.thickness,
      height,
    );
  }
  if (wallName === "left") {
    return cuboidFromMinSize(outsideFlange, offset, z, filter.thickness, model.box.depth - 2 * offset, height);
  }
  return cuboidFromMinSize(
    model.box.width - outsideFlange - filter.thickness,
    offset,
    z,
    filter.thickness,
    model.box.depth - 2 * offset,
    height,
  );
}

function towerSideOpening(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
  wallName: TempestWall,
  depthLow: number,
  depthHigh: number,
): readonly Solid[] {
  const filter = towerFilter(model);
  const width = filter.faceWidth - 2 * model.frame.rim;
  const height = filter.faceHeight - 2 * model.frame.rim;
  if (width <= 0 || height <= 0) {
    return [];
  }
  const depth = depthHigh - depthLow;
  const centerZ = filterLayout.bottomPlateThickness + filter.faceHeight / 2;
  const cut = towerChamferedOpeningCut(
    wallName === "left" || wallName === "right" ? height : width,
    wallName === "left" || wallName === "right" ? width : height,
    depth,
    model.frame.chamferSize,
  );

  if (wallName === "front") {
    return [transforms.translate([model.box.width / 2, depthLow + depth, centerZ], transforms.rotateX(Math.PI / 2, cut))];
  }
  if (wallName === "back") {
    return [
      transforms.translate(
        [model.box.width / 2, model.box.depth - depthLow - depth, centerZ],
        transforms.rotateX(-Math.PI / 2, cut),
      ),
    ];
  }
  if (wallName === "left") {
    return [transforms.translate([depthLow + depth, model.box.depth / 2, centerZ], transforms.rotateY(-Math.PI / 2, cut))];
  }
  return [
    transforms.translate(
      [model.box.width - depthLow - depth, model.box.depth / 2, centerZ],
      transforms.rotateY(Math.PI / 2, cut),
    ),
  ];
}

function towerFanGrid(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Solid[] {
  if ((model.settings.fan.topExhaust ?? "fan-grid") === "single-box-fan") {
    return towerBoxExhaustCuts(model, filterLayout);
  }
  if (model.fanLayout.type !== "tower-top-grid") {
    return [];
  }
  return model.fanLayout.positionsX.flatMap((x) =>
    model.fanLayout.type === "tower-top-grid"
      ? model.fanLayout.positionsY.map((y) =>
          fanPatternCut(
            model,
            "z",
            [x, y, model.box.height - filterLayout.topPlateThickness / 2],
            filterLayout.topPlateThickness + 2 * epsilon,
          ),
        )
      : [],
  );
}

// A single large box/exhaust-fan opening over the air chamber, plus paired
// corner holes for zip-tying a box fan in place (the traditional CR-Box top).
function towerBoxExhaustCuts(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Solid[] {
  const chamber = filterLayout.airChamber;
  const cutHeight = filterLayout.topPlateThickness + 2 * epsilon;
  const seatRim = model.frame.outsideFlangeThickness;
  const openWidth = Math.max(0.001, chamber.xMax - chamber.xMin - 2 * seatRim);
  const openDepth = Math.max(0.001, chamber.yMax - chamber.yMin - 2 * seatRim);
  const centerX = (chamber.xMin + chamber.xMax) / 2;
  const centerY = (chamber.yMin + chamber.yMax) / 2;
  const holeCenterZ = model.box.height - filterLayout.topPlateThickness / 2;

  const opening = transforms.translate(
    [centerX, centerY, model.box.height - filterLayout.topPlateThickness - epsilon],
    extrusions.extrudeLinear({ height: cutHeight }, towerOpening2d(openWidth, openDepth)),
  );

  const tieRadius = Math.max(0.001, model.settings.fan.screwHoleDiameter / 2);
  const tieOutset = seatRim / 2;
  const tiePairOffset = Math.min(openWidth, openDepth) / 8;
  const cornerX = openWidth / 2 + tieOutset;
  const cornerY = openDepth / 2 + tieOutset;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [centerX - cornerX, centerY - cornerY],
    [centerX + cornerX, centerY - cornerY],
    [centerX - cornerX, centerY + cornerY],
    [centerX + cornerX, centerY + cornerY],
  ];
  const zipTieHoles = corners.flatMap(([cx, cy]) =>
    [-tiePairOffset, tiePairOffset].map((dy) => cylinderAlong("z", [cx, cy + dy, holeCenterZ], cutHeight, tieRadius, 24)),
  );

  return [opening, ...zipTieHoles];
}

function towerFilterSlots(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Solid[] {
  const filter = towerFilter(model);
  const z = model.box.height - filterLayout.topPlateThickness - epsilon;
  const height = filterLayout.topPlateThickness + 2 * epsilon;
  return [
    cuboidFromMinSize(filterLayout.structuralOffset, model.frame.outsideFlangeThickness, z, filter.faceWidth, filter.thickness, height),
    cuboidFromMinSize(
      filterLayout.structuralOffset,
      model.box.depth - model.frame.outsideFlangeThickness - filter.thickness,
      z,
      filter.faceWidth,
      filter.thickness,
      height,
    ),
    cuboidFromMinSize(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, z, filter.thickness, filter.faceWidth, height),
    cuboidFromMinSize(
      model.box.width - model.frame.outsideFlangeThickness - filter.thickness,
      filterLayout.structuralOffset,
      z,
      filter.thickness,
      filter.faceWidth,
      height,
    ),
  ];
}

// #######################################
// Cord Pass-Through
// #######################################

function cordHoleCylinders(model: TempestModel): Solid[] {
  const cord = model.cordPassThrough;
  if (cord.type === "none") {
    return [];
  }
  if (cord.type === "tower-top-cylinder") {
    return [cylinderAlong("z", [cord.x, cord.y, cord.zStart + cord.depth / 2], cord.depth + 2 * epsilon, cord.diameter / 2, 24)];
  }

  const wallCenter = model.frame.wallThickness / 2;
  const oppositeWallCenter = cord.wall === "front" || cord.wall === "back" ? model.box.depth - wallCenter : model.box.width - wallCenter;
  const length = model.frame.wallThickness + 2 * scadWallCutOverlap;
  if (cord.wall === "front") {
    return [cylinderAlong("y", [cord.positionAlongWall, wallCenter, cord.verticalCenter], length, cord.diameter / 2, 24)];
  }
  if (cord.wall === "back") {
    return [cylinderAlong("y", [cord.positionAlongWall, oppositeWallCenter, cord.verticalCenter], length, cord.diameter / 2, 24)];
  }
  if (cord.wall === "left") {
    return [cylinderAlong("x", [wallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, 24)];
  }
  return [cylinderAlong("x", [oppositeWallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, 24)];
}

// #######################################
// Alignment Pins
// #######################################

function pinHoles(model: TempestModel, chunkGrid: TempestChunkGrid): Solid[] {
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
    model.filterLayout.type === "side-filter-tower"
      ? pinCandidatesTower(model, model.filterLayout, chunkGrid, pin)
      : pinCandidatesHorizontal(model, model.filterLayout, chunkGrid, pin);
  if (candidates.length === 0) {
    return [];
  }
  const fanZones = fanBodyZones(model);
  const candidateGeometry = unionAll(candidates);
  return [fanZones.length === 0 ? candidateGeometry : booleans.subtract(candidateGeometry, unionAll(fanZones))];
}

function pinCandidatesHorizontal(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }>,
  chunkGrid: TempestChunkGrid,
  pin: { readonly diameter: number; readonly holeDepth: number; readonly spacing: number },
): Solid[] {
  const geometries: Solid[] = [];
  const length = 2 * pin.holeDepth;
  const radius = pin.diameter / 2;

  if (chunkGrid.countX > 1) {
    for (let index = 1; index < chunkGrid.countX; index += 1) {
      const seamX = index * chunkGrid.chunkWidth;
      for (const wallY of [model.frame.wallThickness / 2, model.box.depth - model.frame.wallThickness / 2]) {
        for (const gridZ of rimPositions(model.frame.outsideFlangeThickness, model.box.height - model.frame.outsideFlangeThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("x", [seamX - pin.holeDepth, wallY, gridZ], length, radius));
        }
      }
      for (const frameZ of horizontalFrameMidlinesWithOpening(model, filterLayout)) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.frame.rim, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("x", [seamX - pin.holeDepth, gridY, frameZ], length, radius));
        }
        for (const gridY of rimPositions(model.box.depth - model.frame.rim, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("x", [seamX - pin.holeDepth, gridY, frameZ], length, radius));
        }
      }
      for (const frameZ of horizontalSolidPlateMidlines(model, filterLayout)) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("x", [seamX - pin.holeDepth, gridY, frameZ], length, radius));
        }
      }
    }
  }

  if (chunkGrid.countY > 1) {
    for (let index = 1; index < chunkGrid.countY; index += 1) {
      const seamY = index * chunkGrid.chunkDepth;
      for (const wallX of [model.frame.wallThickness / 2, model.box.width - model.frame.wallThickness / 2]) {
        for (const gridZ of rimPositions(model.frame.outsideFlangeThickness, model.box.height - model.frame.outsideFlangeThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("y", [wallX, seamY - pin.holeDepth, gridZ], length, radius));
        }
      }
      for (const frameZ of horizontalFrameMidlinesWithOpening(model, filterLayout)) {
        for (const gridX of rimPositions(model.frame.wallThickness, model.frame.rim, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("y", [gridX, seamY - pin.holeDepth, frameZ], length, radius));
        }
        for (const gridX of rimPositions(model.box.width - model.frame.rim, model.box.width - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("y", [gridX, seamY - pin.holeDepth, frameZ], length, radius));
        }
      }
      for (const frameZ of horizontalSolidPlateMidlines(model, filterLayout)) {
        for (const gridX of rimPositions(model.frame.wallThickness, model.box.width - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("y", [gridX, seamY - pin.holeDepth, frameZ], length, radius));
        }
      }
    }
  }

  if (chunkGrid.countZ > 1) {
    for (let index = 1; index < chunkGrid.countZ; index += 1) {
      const seamZ = index * chunkGrid.chunkHeight;
      for (const wallY of [model.frame.wallThickness / 2, model.box.depth - model.frame.wallThickness / 2]) {
        for (const gridX of rimPositions(0, model.box.width, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("z", [gridX, wallY, seamZ - pin.holeDepth], length, radius));
        }
      }
      for (const wallX of [model.frame.wallThickness / 2, model.box.width - model.frame.wallThickness / 2]) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("z", [wallX, gridY, seamZ - pin.holeDepth], length, radius));
        }
      }
    }
  }

  return geometries;
}

function pinCandidatesTower(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
  chunkGrid: TempestChunkGrid,
  pin: { readonly diameter: number; readonly holeDepth: number; readonly spacing: number },
): Solid[] {
  const geometries: Solid[] = [];
  const length = 2 * pin.holeDepth;
  const radius = pin.diameter / 2;
  const wallZLow = filterLayout.bottomPlateThickness;
  const wallZHigh = model.box.height - filterLayout.topPlateThickness;

  if (chunkGrid.countX > 1) {
    for (let index = 1; index < chunkGrid.countX; index += 1) {
      const seamX = index * chunkGrid.chunkWidth;
      for (const wallY of [model.frame.outsideFlangeThickness / 2, model.box.depth - model.frame.outsideFlangeThickness / 2]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("x", [seamX - pin.holeDepth, wallY, gridZ], length, radius));
        }
      }
      for (const wallY of [
        model.frame.outsideFlangeThickness + towerFilterThickness(model) + model.frame.wallThickness / 2,
        model.box.depth - model.frame.outsideFlangeThickness - towerFilterThickness(model) - model.frame.wallThickness / 2,
      ]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("x", [seamX - pin.holeDepth, wallY, gridZ], length, radius));
        }
      }
      for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
        geometries.push(cylinderAlongFromStart("x", [seamX - pin.holeDepth, gridY, filterLayout.bottomPlateThickness / 2], length, radius));
      }
      for (const gridY of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        geometries.push(
          cylinderAlongFromStart("x", [seamX - pin.holeDepth, gridY, model.box.height - filterLayout.topPlateThickness / 2], length, radius),
        );
      }
      for (const gridY of rimPositions(model.box.depth - filterLayout.structuralOffset, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
        geometries.push(
          cylinderAlongFromStart("x", [seamX - pin.holeDepth, gridY, model.box.height - filterLayout.topPlateThickness / 2], length, radius),
        );
      }
    }
  }

  if (chunkGrid.countY > 1) {
    for (let index = 1; index < chunkGrid.countY; index += 1) {
      const seamY = index * chunkGrid.chunkDepth;
      for (const wallX of [model.frame.outsideFlangeThickness / 2, model.box.width - model.frame.outsideFlangeThickness / 2]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("y", [wallX, seamY - pin.holeDepth, gridZ], length, radius));
        }
      }
      for (const wallX of [
        model.frame.outsideFlangeThickness + towerFilterThickness(model) + model.frame.wallThickness / 2,
        model.box.width - model.frame.outsideFlangeThickness - towerFilterThickness(model) - model.frame.wallThickness / 2,
      ]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("y", [wallX, seamY - pin.holeDepth, gridZ], length, radius));
        }
      }
      for (const gridX of rimPositions(model.frame.wallThickness, model.box.width - model.frame.wallThickness, pin.spacing)) {
        geometries.push(cylinderAlongFromStart("y", [gridX, seamY - pin.holeDepth, filterLayout.bottomPlateThickness / 2], length, radius));
      }
      for (const gridX of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        geometries.push(
          cylinderAlongFromStart("y", [gridX, seamY - pin.holeDepth, model.box.height - filterLayout.topPlateThickness / 2], length, radius),
        );
      }
      for (const gridX of rimPositions(model.box.width - filterLayout.structuralOffset, model.box.width - model.frame.outsideFlangeThickness, pin.spacing)) {
        geometries.push(
          cylinderAlongFromStart("y", [gridX, seamY - pin.holeDepth, model.box.height - filterLayout.topPlateThickness / 2], length, radius),
        );
      }
    }
  }

  if (chunkGrid.countZ > 1) {
    for (let index = 1; index < chunkGrid.countZ; index += 1) {
      const seamZ = index * chunkGrid.chunkHeight;
      for (const wallY of [model.frame.outsideFlangeThickness / 2, model.box.depth - model.frame.outsideFlangeThickness / 2]) {
        for (const gridX of rimPositions(0, model.box.width, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("z", [gridX, wallY, seamZ - pin.holeDepth], length, radius));
        }
      }
      for (const wallX of [model.frame.outsideFlangeThickness / 2, model.box.width - model.frame.outsideFlangeThickness / 2]) {
        for (const gridY of rimPositions(model.frame.outsideFlangeThickness, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("z", [wallX, gridY, seamZ - pin.holeDepth], length, radius));
        }
      }
      for (const wallY of [
        model.frame.outsideFlangeThickness + towerFilterThickness(model) + model.frame.wallThickness / 2,
        model.box.depth - model.frame.outsideFlangeThickness - towerFilterThickness(model) - model.frame.wallThickness / 2,
      ]) {
        for (const gridX of rimPositions(filterLayout.structuralOffset, model.box.width - filterLayout.structuralOffset, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("z", [gridX, wallY, seamZ - pin.holeDepth], length, radius));
        }
      }
      for (const wallX of [
        model.frame.outsideFlangeThickness + towerFilterThickness(model) + model.frame.wallThickness / 2,
        model.box.width - model.frame.outsideFlangeThickness - towerFilterThickness(model) - model.frame.wallThickness / 2,
      ]) {
        for (const gridY of rimPositions(filterLayout.structuralOffset, model.box.depth - filterLayout.structuralOffset, pin.spacing)) {
          geometries.push(cylinderAlongFromStart("z", [wallX, gridY, seamZ - pin.holeDepth], length, radius));
        }
      }
      const pinXY = filterLayout.structuralOffset - model.frame.wallThickness;
      for (const centerX of [pinXY, model.box.width - pinXY]) {
        for (const centerY of [pinXY, model.box.depth - pinXY]) {
          geometries.push(cylinderAlongFromStart("z", [centerX, centerY, seamZ - pin.holeDepth], length, radius));
        }
      }
    }
  }

  return geometries;
}

function fanBodyZones(model: TempestModel): Solid[] {
  if (model.fanLayout.type !== "horizontal-wall-fans") {
    return [];
  }
  const oneWall = (positions: readonly number[]) =>
    positions.map((position) =>
      cylinderAlongFromStart("y", [position, -1, horizontalWallLocalFanCenter(model)], model.frame.wallThickness + 2, model.settings.fan.diameter / 2),
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
  filterLayout: Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }>,
): readonly number[] {
  return [
    model.box.height - model.frame.outsideFlangeThickness / 2,
    ...(filterLayout.bottomPanel === "open-frame" ? [model.frame.outsideFlangeThickness / 2] : []),
    ...filterLayout.flanges.map((flange) => (flange.zBottom + flange.zTop) / 2),
  ];
}

function horizontalSolidPlateMidlines(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }>,
): readonly number[] {
  return filterLayout.bottomPanel === "solid-plate" ? [model.frame.outsideFlangeThickness / 2] : [];
}

function rimPositions(low: number, high: number, spacing: number): readonly number[] {
  const width = high - low;
  const count = width <= 0 ? 0 : Math.max(1, Math.floor(width / spacing));
  const step = count > 0 ? width / count : 0;
  return count === 0 ? [] : Array.from({ length: count }, (_, index) => low + (index + 0.5) * step);
}

// #######################################
// 2D Primitives
// #######################################

function hex2d(flatToFlat: number): Region {
  const radius = flatToFlat / Math.sqrt(3);
  return primitives.polygon({
    points: Array.from({ length: 6 }, (_, index) => {
      const angle = (Math.PI / 180) * (60 * index + 30);
      return [radius * Math.cos(angle), radius * Math.sin(angle)];
    }),
  });
}

function hexGrill2d(model: TempestModel, outerDiameter: number): Region {
  const opening = model.settings.fan.opening;
  if (opening.type !== "honeycomb") {
    return primitives.circle({ radius: Math.max(0.001, outerDiameter / 2), segments: csgSegments });
  }

  const pitchX = opening.hexFlatToFlat + opening.ribThickness;
  const pitchY = pitchX * Math.sqrt(3) / 2;
  const columnCount = Math.ceil(outerDiameter / pitchX) + 2;
  const rowCount = Math.ceil(outerDiameter / pitchY) + 2;
  const clipRadius = Math.max(0, (outerDiameter - 2 * opening.ribThickness) / 2);
  const hexRadius = opening.hexFlatToFlat / Math.sqrt(3);
  const holes: Region[] = [];

  for (let row = -rowCount; row <= rowCount; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : pitchX / 2;
    for (let column = -columnCount; column <= columnCount; column += 1) {
      const x = column * pitchX + rowOffset;
      const y = row * pitchY;
      if (Math.hypot(x, y) - hexRadius > clipRadius) {
        continue;
      }
      holes.push(transforms2d.translate([x, y], hex2d(opening.hexFlatToFlat)));
    }
  }

  return booleans2d.intersect(
    primitives.circle({ radius: Math.max(0.001, (outerDiameter - 2 * opening.ribThickness) / 2), segments: csgSegments }),
    unionAll2d(holes),
  );
}

function fanPattern2d(model: TempestModel): Region {
  const cacheKey = fanPatternCacheKey(model);
  const cached = fanPatternCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const opening =
    model.settings.fan.opening.type === "honeycomb"
      ? hexGrill2d(model, model.settings.fan.diameter - 4)
      : primitives.circle({ radius: Math.max(0.001, model.settings.fan.diameter / 2 - 2), segments: csgSegments });
  const screwDelta = fanScrewPitch(model) / 2;
  const screwRadius = model.settings.fan.screwHoleDiameter / 2;
  const screwHoles = [-screwDelta, screwDelta].flatMap((x) =>
    [-screwDelta, screwDelta].map((y) =>
      transforms2d.translate([x, y], primitives.circle({ radius: Math.max(0.001, screwRadius), segments: 16 })),
    ),
  );
  const pattern = unionAll2d([opening, ...screwHoles]);
  fanPatternCache.set(cacheKey, pattern);
  return pattern;
}

function fanPatternCacheKey(model: TempestModel): string {
  const opening = model.settings.fan.opening;
  return opening.type === "honeycomb"
    ? [
        model.settings.fan.diameter,
        model.settings.fan.screwHoleDiameter,
        opening.type,
        opening.hexFlatToFlat,
        opening.ribThickness,
        csgSegments,
      ].join(":")
    : [model.settings.fan.diameter, model.settings.fan.screwHoleDiameter, opening.type, csgSegments].join(":");
}

function filterOpening2d(model: TempestModel): Region | null {
  const width = model.box.width - 2 * model.frame.rim;
  const depth = model.box.depth - 2 * model.frame.rim;
  if (width <= 0 || depth <= 0) {
    return null;
  }
  const radius = Math.min(10, width / 2, depth / 2);
  return primitives.roundedRectangle({
    center: [model.frame.rim + width / 2, model.frame.rim + depth / 2],
    size: [width, depth],
    roundRadius: radius,
    segments: csgSegments,
  });
}

function towerOpening2d(width: number, height: number, expand = 0): Region {
  const radius = Math.min(10, width / 2, height / 2);
  const opening = primitives.roundedRectangle({
    center: [0, 0],
    size: [Math.max(0.001, width), Math.max(0.001, height)],
    roundRadius: Math.max(0.001, radius),
    segments: csgSegments,
  });
  return expand <= 0 ? opening : expansions.offset({ delta: expand, corners: "round", segments: csgSegments }, opening);
}

// #######################################
// 3D Primitives
// #######################################

function chamferedPrism(
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  chamfer: number,
): Solid {
  return transforms.translate(
    [x, y, z],
    extrusions.extrudeLinear(
      { height: Math.max(0.001, height) },
      chamferedRectangle2d(Math.max(0.001, width), Math.max(0.001, depth), chamfer),
    ),
  );
}

function chamferedRectangle2d(width: number, depth: number, chamfer: number): Region {
  const safeChamfer = Math.max(0, Math.min(chamfer, width / 2 - 0.01, depth / 2 - 0.01));
  if (safeChamfer <= 0) {
    return rectangle2d(0, 0, width, depth);
  }
  return primitives.polygon({
    points: [
      [safeChamfer, 0],
      [width - safeChamfer, 0],
      [width, safeChamfer],
      [width, depth - safeChamfer],
      [width - safeChamfer, depth],
      [safeChamfer, depth],
      [0, depth - safeChamfer],
      [0, safeChamfer],
    ],
  });
}

function rectangle2d(x: number, y: number, width: number, depth: number): Region {
  return primitives.polygon({
    points: [
      [x, y],
      [x + Math.max(0.001, width), y],
      [x + Math.max(0.001, width), y + Math.max(0.001, depth)],
      [x, y + Math.max(0.001, depth)],
    ],
  });
}

function towerChamferedOpeningCut(width: number, height: number, depth: number, chamfer: number): Solid {
  if (chamfer > 0 && depth > 2 * chamfer) {
    return unionAll([
      hulls.hull(
        thinExtrude(towerOpening2d(width, height, chamfer), 0),
        transforms.translate([0, 0, chamfer], thinExtrude(towerOpening2d(width, height), 0)),
      ),
      transforms.translate(
        [0, 0, chamfer],
        extrusions.extrudeLinear({ height: depth - 2 * chamfer }, towerOpening2d(width, height)),
      ),
      hulls.hull(
        transforms.translate([0, 0, depth - chamfer], thinExtrude(towerOpening2d(width, height), 0)),
        transforms.translate([0, 0, depth - 0.01], thinExtrude(towerOpening2d(width, height, chamfer), 0)),
      ),
    ]);
  }
  return extrusions.extrudeLinear({ height: Math.max(0.001, depth) }, towerOpening2d(width, height));
}

function chamferedOpeningCutAlongZ(shape: Region, depth: number, chamfer: number): Solid {
  if (chamfer > 0 && depth > 2 * chamfer) {
    const expanded = expansions.offset({ delta: chamfer, corners: "round", segments: csgSegments }, shape);
    return unionAll([
      hulls.hull(
        transforms.translate([0, 0, -epsilon], thinExtrude(expanded, 0)),
        transforms.translate([0, 0, chamfer], thinExtrude(shape, 0)),
      ),
      transforms.translate([0, 0, chamfer], extrusions.extrudeLinear({ height: depth - 2 * chamfer }, shape)),
      hulls.hull(
        transforms.translate([0, 0, depth - chamfer], thinExtrude(shape, 0)),
        transforms.translate([0, 0, depth + epsilon], thinExtrude(expanded, 0)),
      ),
    ]);
  }
  return transforms.translate([0, 0, -epsilon], extrusions.extrudeLinear({ height: depth + 2 * epsilon }, shape));
}

function thinExtrude(shape: Region, z: number): Solid {
  return transforms.translate([0, 0, z], extrusions.extrudeLinear({ height: 0.01 }, shape));
}

function fanPatternCut(
  model: TempestModel,
  axis: "x" | "y" | "z",
  center: readonly [number, number, number],
  length: number,
): Solid {
  const pattern = transforms.translate(
    [0, 0, -length / 2],
    extrusions.extrudeLinear({ height: Math.max(0.001, length) }, fanPattern2d(model)),
  );
  return transforms.translate(center, orientZExtrusion(axis, pattern));
}

function orientZExtrusion(axis: "x" | "y" | "z", geometry: Solid): Solid {
  if (axis === "x") {
    return transforms.rotateY(Math.PI / 2, geometry);
  }
  if (axis === "y") {
    return transforms.rotateX(Math.PI / 2, geometry);
  }
  return geometry;
}

function cylinderAlong(
  axis: "x" | "y" | "z",
  center: readonly [number, number, number],
  length: number,
  radius: number,
  segments: number,
): Solid {
  const cylinder = primitives.cylinder({
    height: Math.max(0.001, length),
    radius: Math.max(0.001, radius),
    segments,
  });
  return transforms.translate(center, orientZExtrusion(axis, cylinder));
}

function cylinderAlongFromStart(
  axis: "x" | "y" | "z",
  start: readonly [number, number, number],
  length: number,
  radius: number,
): Solid {
  if (axis === "x") {
    return cylinderAlong(axis, [start[0] + length / 2, start[1], start[2]], length, radius, csgSegments);
  }
  if (axis === "y") {
    return cylinderAlong(axis, [start[0], start[1] + length / 2, start[2]], length, radius, csgSegments);
  }
  return cylinderAlong(axis, [start[0], start[1], start[2] + length / 2], length, radius, csgSegments);
}

function cuboidFromMinSize(x: number, y: number, z: number, width: number, depth: number, height: number): Solid {
  return primitives.cuboid({
    center: [x + width / 2, y + depth / 2, z + height / 2],
    size: [Math.max(0.001, width), Math.max(0.001, depth), Math.max(0.001, height)],
  });
}

// #######################################
// Derived Helpers
// #######################################

function horizontalWallFanLayout(model: TempestModel): Extract<TempestModel["fanLayout"], { readonly type: "horizontal-wall-fans" }> {
  if (model.fanLayout.type !== "horizontal-wall-fans") {
    throw new Error("horizontalWallFanLayout: Expected horizontal wall fans");
  }
  return model.fanLayout;
}

function horizontalWallLocalFanCenter(model: TempestModel): number {
  return horizontalWallFanLayout(model).localVerticalCenter;
}

function fanScrewPitch(model: TempestModel): number {
  return model.fanLayout.screwPitch;
}

function towerFilter(model: TempestModel): Extract<TempestModel["settings"]["arrangement"], { readonly type: "four-side-filter-tower" }>["filter"] {
  if (model.settings.arrangement.type !== "four-side-filter-tower") {
    throw new Error("towerFilter: Expected four-side-filter-tower arrangement");
  }
  return model.settings.arrangement.filter;
}

function towerFilterThickness(model: TempestModel): number {
  return towerFilter(model).thickness;
}

// #######################################
// Boolean Helpers
// #######################################

function unionAll(geometriesToUnion: readonly Solid[]): Solid {
  const first = geometriesToUnion[0];
  if (first === undefined) {
    throw new Error("unionAll: Missing geometry");
  }
  return geometriesToUnion.length === 1 ? first : booleans.union(first, ...geometriesToUnion.slice(1));
}

function unionAll2d(geometriesToUnion: readonly Region[]): Region {
  const first = geometriesToUnion[0];
  if (first === undefined) {
    throw new Error("unionAll2d: Missing geometry");
  }
  return geometriesToUnion.length === 1 ? first : booleans2d.union(first, ...geometriesToUnion.slice(1));
}

function subtractAll(base: Solid, holes: readonly Solid[]): Solid {
  return holes.length === 0 ? base : booleans.subtract(base, ...holes);
}

  const tempestWalls: readonly TempestWall[] = ["front", "back", "left", "right"];

  return finalModel(model, { alignmentPinChunkGrid });
}
