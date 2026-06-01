import { booleans, extrusions, geometries, primitives, transforms } from "@jscad/modeling";
import {
  createTempestModel,
  defaultTempestSettings,
  type TempestChunkGrid,
  type TempestFilterLayout,
  type TempestModel,
  type TempestSettings,
  type TempestWall,
  type TempestWallFanLayout,
} from "@/domain/designs/tempest/model";
import {
  findPrintVolumePreset,
  printBedFitForPart,
  type PrintableKit,
  type PrintableMesh,
  type PrintablePart,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

export {
  createTempestSettingsFromConfiguration,
  createTempestSettingsFromLayout,
} from "@/fabrication/printing/designs/tempest/settings";

// #######################################
// Tempest Printable CSG Model
// #######################################

// ##############################
// CSG Types and Constants
// ##############################

type Geom3 = ReturnType<typeof primitives.cuboid>;
type Geom2 = ReturnType<typeof primitives.circle>;

type ChunkAddress = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type TempestPrintableEnvelope = {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
};

export type TempestPrintablePose =
  | {
      readonly type: "source";
      readonly envelope: TempestPrintableEnvelope;
    }
  | {
      readonly type: "upright-dual-filter";
      readonly envelope: TempestPrintableEnvelope;
    };

const epsilon = 0.05;
const shellJoinOverlap = 0.2;
const defaultHorizontalCornerChamfer = 2;
const csgSegments = 32;
const fanOpeningAndScrewFeatureCount = 5;
const tempestPrintableWalls: readonly TempestWall[] = ["front", "back", "left", "right"];

type HoneycombHoleCenter = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
};

const honeycombPatternCache = new Map<string, Geom2>();

// #######################################
// Public Kit API
// #######################################

export function createTempestPrintableKit(
  settings: TempestSettings = defaultTempestSettings,
  presetId: PrintVolumePresetId,
): PrintableKit {
  const preset = findPrintVolumePreset(presetId);
  const model = createTempestModel(settingsForPresetBed(settings, presetId));
  const pose = createTempestPrintablePose(model);
  const chunkGrid = createPrintableChunkGrid(pose.envelope, model.settings.printBed);
  const assembly = applyTempestPrintablePose(createFinalAssemblyGeometry(model), pose);
  const parts = createChunkParts(model, chunkGrid, assembly);
  const featureCount = estimateFeatureCount(model);

  return {
    preset,
    parts,
    summary: {
      partCount: parts.length,
      panelTileCount: 0,
      glueKeyCount: 0,
      splitPanelCount: chunkGrid.totalCount > 1 ? 1 : 0,
      oversizedPartCount: parts.filter((part) => printBedFitForPart(part, preset.bed).type === "oversized").length,
      sourceCutFeatureCount: featureCount,
      retainedCutFeatureCount: featureCount,
      sourcePrintCriticalCutFeatureCount: featureCount,
      retainedPrintCriticalCutFeatureCount: featureCount,
    },
  };
}

export function createTempestPrintableKitFromLayout(
  layout: LayoutResult,
  presetId: PrintVolumePresetId,
): PrintableKit {
  return createTempestPrintableKit(createTempestSettingsFromLayout(layout), presetId);
}

function settingsForPresetBed(settings: TempestSettings, presetId: PrintVolumePresetId): TempestSettings {
  const preset = findPrintVolumePreset(presetId);
  if (preset.bed.type === "unbounded") {
    const unboundedModel = createTempestModel(settings);
    const pose = createTempestPrintablePose(unboundedModel);
    return {
      ...settings,
      printBed: {
        width: pose.envelope.width,
        depth: pose.envelope.depth,
        height: pose.envelope.height,
      },
    };
  }
  return {
    ...settings,
    printBed: {
      width: preset.bed.width,
      depth: preset.bed.depth,
      height: preset.bed.height,
    },
  };
}

// #######################################
// Chunk Parts
// #######################################

function createChunkParts(model: TempestModel, chunkGrid: TempestChunkGrid, assembly: Geom3): PrintablePart[] {
  const parts: PrintablePart[] = [];
  const featureCount = estimateFeatureCount(model);
  for (let z = 0; z < chunkGrid.countZ; z += 1) {
    for (let y = 0; y < chunkGrid.countY; y += 1) {
      for (let x = 0; x < chunkGrid.countX; x += 1) {
        const part = createChunkPart(chunkGrid, assembly, { x, y, z }, featureCount);
        if (part.mesh.vertices.length > 0) {
          parts.push(part);
        }
      }
    }
  }
  return parts;
}

function createChunkPart(
  chunkGrid: TempestChunkGrid,
  assembly: Geom3,
  address: ChunkAddress,
  featureCount: number,
): PrintablePart {
  const origin = {
    x: address.x * chunkGrid.chunkWidth,
    y: address.y * chunkGrid.chunkDepth,
    z: address.z * chunkGrid.chunkHeight,
  };
  const chunkBox = cuboidFromMinSize(
    origin.x - epsilon,
    origin.y - epsilon,
    origin.z - epsilon,
    chunkGrid.chunkWidth + 2 * epsilon,
    chunkGrid.chunkDepth + 2 * epsilon,
    chunkGrid.chunkHeight + 2 * epsilon,
  );
  const roughChunkGeometry = transforms.translate(
    [-origin.x, -origin.y, -origin.z],
    booleans.intersect(assembly, chunkBox),
  );
  const exactChunkBox = cuboidFromMinSize(0, 0, 0, chunkGrid.chunkWidth, chunkGrid.chunkDepth, chunkGrid.chunkHeight);
  const chunkGeometry = booleans.intersect(roughChunkGeometry, exactChunkBox);
  return {
    id: `tempest-chunk-${address.x}-${address.y}-${address.z}`,
    name: `Tempest chunk ${address.x},${address.y},${address.z}`,
    kind: "tempest-print-chunk",
    sourcePanelId: "tempest-parametric-csg",
    width: roundMillimeters(chunkGrid.chunkWidth),
    depth: roundMillimeters(chunkGrid.chunkDepth),
    height: roundMillimeters(chunkGrid.chunkHeight),
    cutFeatureCount: featureCount,
    printCriticalCutFeatureCount: featureCount,
    mesh: jscadGeometryToPrintableMesh(chunkGeometry),
  };
}

// #######################################
// Printable Orientation
// #######################################

export function createTempestPrintablePose(model: TempestModel): TempestPrintablePose {
  if (model.settings.arrangement.type === "dual-horizontal-sandwich") {
    return {
      type: "upright-dual-filter",
      envelope: {
        width: model.box.width,
        depth: model.box.height,
        height: model.box.depth,
      },
    };
  }
  return {
    type: "source",
    envelope: {
      width: model.box.width,
      depth: model.box.depth,
      height: model.box.height,
    },
  };
}

function applyTempestPrintablePose(geometry: Geom3, pose: TempestPrintablePose): Geom3 {
  if (pose.type === "source") {
    return geometry;
  }
  return transforms.translate(
    [0, pose.envelope.depth, 0],
    transforms.rotateX(Math.PI / 2, geometry),
  );
}

function createPrintableChunkGrid(envelope: TempestPrintableEnvelope, bed: TempestSettings["printBed"]): TempestChunkGrid {
  const countX = Math.max(1, Math.ceil(envelope.width / bed.width));
  const countY = Math.max(1, Math.ceil(envelope.depth / bed.depth));
  const countZ = Math.max(1, Math.ceil(envelope.height / bed.height));
  return {
    countX,
    countY,
    countZ,
    totalCount: countX * countY * countZ,
    chunkWidth: envelope.width / countX,
    chunkDepth: envelope.depth / countY,
    chunkHeight: envelope.height / countZ,
  };
}

// #######################################
// Final Assembly Geometry
// #######################################

function createFinalAssemblyGeometry(model: TempestModel): Geom3 {
  return subtractAll(createAssemblyGeometry(model), [
    ...cordPassThroughHoles(model),
  ]);
}

function createAssemblyGeometry(model: TempestModel): Geom3 {
  return model.filterLayout.type === "side-filter-tower"
    ? createTowerAssemblyGeometry(model, model.filterLayout)
    : createHorizontalAssemblyGeometry(model, model.filterLayout);
}

// ##############################
// Horizontal Assembly
// ##############################

function createHorizontalAssemblyGeometry(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "horizontal-stack" }>,
): Geom3 {
  const bottomPanel =
    filterLayout.bottomPanel === "solid-plate"
      ? chamferedPrismFromMinSize(
          0,
          0,
          0,
          model.box.width,
          model.box.depth,
          model.frame.outsideFlangeThickness,
          horizontalCornerChamfer(model),
        )
      : createFilterFramePanel(model, 0, model.frame.outsideFlangeThickness);
  const topFrame = createFilterFramePanel(
    model,
    model.box.height - model.frame.outsideFlangeThickness,
    model.frame.outsideFlangeThickness,
  );
  const flanges = filterLayout.flanges.map((flange) => createFilterFramePanel(model, flange.zBottom, model.frame.insideFlangeThickness));
  return unionAll([
    bottomPanel,
    topFrame,
    ...flanges,
    createHorizontalWallRing(model),
  ]);
}

function createFilterFramePanel(model: TempestModel, z: number, height: number): Geom3 {
  const panel = chamferedPrismFromMinSize(
    0,
    0,
    z,
    model.box.width,
    model.box.depth,
    height,
    horizontalCornerChamfer(model),
  );
  const openingWidth = Math.max(0, model.box.width - 2 * model.frame.rim);
  const openingDepth = Math.max(0, model.box.depth - 2 * model.frame.rim);
  if (openingWidth <= 0 || openingDepth <= 0) {
    return panel;
  }
  return subtractAll(panel, [
    cuboidFromMinSize(model.frame.rim, model.frame.rim, z - epsilon, openingWidth, openingDepth, height + 2 * epsilon),
  ]);
}

function createHorizontalWallRing(model: TempestModel): Geom3 {
  const t = model.frame.wallThickness;
  const z = model.frame.outsideFlangeThickness - shellJoinOverlap;
  const height = model.box.wallHeight + 2 * shellJoinOverlap;
  const outerShell = chamferedPrismFromMinSize(
    0,
    0,
    z,
    model.box.width,
    model.box.depth,
    height,
    horizontalCornerChamfer(model),
  );
  const airChamber = cuboidFromMinSize(
    t,
    t,
    z - epsilon,
    model.box.width - 2 * t,
    model.box.depth - 2 * t,
    height + 2 * epsilon,
  );
  const fanLayout = requireHorizontalFanLayout(model);
  return subtractAll(outerShell, [
    airChamber,
    ...tempestPrintableWalls.flatMap((wall) => horizontalWallFanHoles(model, fanLayout.walls[wall])),
  ]);
}

function horizontalCornerChamfer(model: TempestModel): number {
  return Math.max(0, Math.min(defaultHorizontalCornerChamfer, model.frame.wallThickness / 2 - 0.01));
}

function horizontalWallFanHoles(model: TempestModel, layout: TempestWallFanLayout): Geom3[] {
  const fanLayout = requireHorizontalFanLayout(model);
  return layout.positionsAlongWall.flatMap((position) => [
    ...horizontalFanOpeningHoles(model, layout.wall, position, fanLayout.localVerticalCenter),
    ...horizontalFanScrewHoles(model, layout.wall, position, fanLayout.localVerticalCenter),
  ]);
}

function horizontalFanOpeningHoles(model: TempestModel, wall: TempestWall, position: number, localZ: number): Geom3[] {
  const fanCenterZ = model.frame.outsideFlangeThickness + localZ;
  return [horizontalWallFanOpening(model, wall, position, fanCenterZ)];
}

function horizontalWallFanOpening(model: TempestModel, wall: TempestWall, positionAlongWall: number, z: number): Geom3 {
  const length = model.frame.wallThickness + 2;
  if (wall === "front") {
    return fanOpeningHole(model, "y", [positionAlongWall, model.frame.wallThickness / 2, z], length);
  }
  if (wall === "back") {
    return fanOpeningHole(model, "y", [positionAlongWall, model.box.depth - model.frame.wallThickness / 2, z], length);
  }
  if (wall === "left") {
    return fanOpeningHole(model, "x", [model.frame.wallThickness / 2, positionAlongWall, z], length);
  }
  return fanOpeningHole(model, "x", [model.box.width - model.frame.wallThickness / 2, positionAlongWall, z], length);
}

function horizontalFanScrewHoles(model: TempestModel, wall: TempestWall, position: number, localZ: number): Geom3[] {
  const screwOffset = requireHorizontalFanLayout(model).screwPitch / 2;
  return [
    { along: position - screwOffset, z: localZ - screwOffset },
    { along: position + screwOffset, z: localZ - screwOffset },
    { along: position + screwOffset, z: localZ + screwOffset },
    { along: position - screwOffset, z: localZ + screwOffset },
  ].map((center) =>
    horizontalWallCylinder(
      model,
      wall,
      center.along,
      model.frame.outsideFlangeThickness + center.z,
      model.settings.fan.screwHoleDiameter / 2,
      16,
    ),
  );
}

function horizontalWallCylinder(
  model: TempestModel,
  wall: TempestWall,
  positionAlongWall: number,
  z: number,
  radius: number,
  segments: number,
): Geom3 {
  const length = model.frame.wallThickness + 2;
  if (wall === "front") {
    return cylinderAlong("y", [positionAlongWall, model.frame.wallThickness / 2, z], length, radius, segments);
  }
  if (wall === "back") {
    return cylinderAlong("y", [positionAlongWall, model.box.depth - model.frame.wallThickness / 2, z], length, radius, segments);
  }
  if (wall === "left") {
    return cylinderAlong("x", [model.frame.wallThickness / 2, positionAlongWall, z], length, radius, segments);
  }
  return cylinderAlong("x", [model.box.width - model.frame.wallThickness / 2, positionAlongWall, z], length, radius, segments);
}

function requireHorizontalFanLayout(model: TempestModel): Extract<TempestModel["fanLayout"], { readonly type: "horizontal-wall-fans" }> {
  if (model.fanLayout.type !== "horizontal-wall-fans") {
    throw new Error("requireHorizontalFanLayout: Expected horizontal fan layout");
  }
  return model.fanLayout;
}

// ##############################
// Tower Assembly
// ##############################

function createTowerAssemblyGeometry(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Geom3 {
  const solid = cuboidFromMinSize(0, 0, 0, model.box.width, model.box.depth, model.box.height);
  return subtractAll(solid, [
    towerAirChamberHole(filterLayout),
    ...towerFilterPocketHoles(model, filterLayout),
    ...towerSideOpeningHoles(model, filterLayout),
    ...towerFanHoles(model, filterLayout),
    ...towerFilterSlotHoles(model, filterLayout),
  ]);
}

function towerAirChamberHole(filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>): Geom3 {
  return cuboidFromMinSize(
    filterLayout.airChamber.xMin,
    filterLayout.airChamber.yMin,
    filterLayout.airChamber.zMin - epsilon,
    filterLayout.airChamber.xMax - filterLayout.airChamber.xMin,
    filterLayout.airChamber.yMax - filterLayout.airChamber.yMin,
    filterLayout.airChamber.zMax - filterLayout.airChamber.zMin + 2 * epsilon,
  );
}

function towerFilterPocketHoles(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Geom3[] {
  const filter = model.settings.arrangement.type === "four-side-filter-tower" ? model.settings.arrangement.filter : null;
  if (filter === null) {
    return [];
  }
  const height = model.box.height - filterLayout.bottomPlateThickness - filterLayout.topPlateThickness + 2 * epsilon;
  const z = filterLayout.bottomPlateThickness - epsilon;
  const offset = filterLayout.structuralOffset;
  const outsideFlange = model.frame.outsideFlangeThickness;
  return [
    cuboidFromMinSize(offset, outsideFlange, z, model.box.width - 2 * offset, filter.thickness, height),
    cuboidFromMinSize(offset, model.box.depth - outsideFlange - filter.thickness, z, model.box.width - 2 * offset, filter.thickness, height),
    cuboidFromMinSize(outsideFlange, offset, z, filter.thickness, model.box.depth - 2 * offset, height),
    cuboidFromMinSize(model.box.width - outsideFlange - filter.thickness, offset, z, filter.thickness, model.box.depth - 2 * offset, height),
  ];
}

function towerSideOpeningHoles(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Geom3[] {
  const filter = model.settings.arrangement.type === "four-side-filter-tower" ? model.settings.arrangement.filter : null;
  if (filter === null) {
    return [];
  }
  const openingWidth = Math.max(0, filter.faceWidth - 2 * model.frame.rim);
  const openingHeight = Math.max(0, filter.faceHeight - 2 * model.frame.rim);
  const z = filterLayout.bottomPlateThickness + model.frame.rim;
  const centerSpanStart = filterLayout.structuralOffset + model.frame.rim;
  const innerLow = model.frame.outsideFlangeThickness + filter.thickness - epsilon;
  const innerHigh = filterLayout.structuralOffset + epsilon;
  return [
    cuboidFromMinSize(centerSpanStart, -epsilon, z, openingWidth, model.frame.outsideFlangeThickness + 2 * epsilon, openingHeight),
    cuboidFromMinSize(centerSpanStart, model.box.depth - model.frame.outsideFlangeThickness - epsilon, z, openingWidth, model.frame.outsideFlangeThickness + 2 * epsilon, openingHeight),
    cuboidFromMinSize(-epsilon, centerSpanStart, z, model.frame.outsideFlangeThickness + 2 * epsilon, openingWidth, openingHeight),
    cuboidFromMinSize(model.box.width - model.frame.outsideFlangeThickness - epsilon, centerSpanStart, z, model.frame.outsideFlangeThickness + 2 * epsilon, openingWidth, openingHeight),
    cuboidFromMinSize(centerSpanStart, innerLow, z, openingWidth, innerHigh - innerLow, openingHeight),
    cuboidFromMinSize(centerSpanStart, model.box.depth - innerHigh, z, openingWidth, innerHigh - innerLow, openingHeight),
    cuboidFromMinSize(innerLow, centerSpanStart, z, innerHigh - innerLow, openingWidth, openingHeight),
    cuboidFromMinSize(model.box.width - innerHigh, centerSpanStart, z, innerHigh - innerLow, openingWidth, openingHeight),
  ];
}

function towerFanHoles(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Geom3[] {
  if (model.fanLayout.type !== "tower-top-grid") {
    return [];
  }
  return model.fanLayout.positionsX.flatMap((x) =>
    model.fanLayout.type === "tower-top-grid"
      ? model.fanLayout.positionsY.flatMap((y) => [
          ...towerFanOpeningHoles(model, x, y, filterLayout),
          ...towerFanScrewHoles(model, x, y, filterLayout),
        ])
      : [],
  );
}

function towerFanOpeningHoles(
  model: TempestModel,
  fanCenterX: number,
  fanCenterY: number,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Geom3[] {
  const z = model.box.height - filterLayout.topPlateThickness / 2;
  const length = filterLayout.topPlateThickness + 2 * epsilon;
  return [fanOpeningHole(model, "z", [fanCenterX, fanCenterY, z], length)];
}

function towerFanScrewHoles(
  model: TempestModel,
  fanCenterX: number,
  fanCenterY: number,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Geom3[] {
  if (model.fanLayout.type !== "tower-top-grid") {
    return [];
  }
  const delta = model.fanLayout.screwPitch / 2;
  return [
    [fanCenterX - delta, fanCenterY - delta],
    [fanCenterX + delta, fanCenterY - delta],
    [fanCenterX + delta, fanCenterY + delta],
    [fanCenterX - delta, fanCenterY + delta],
  ].map(([x, y]) =>
    cylinderAlong(
      "z",
      [x, y, model.box.height - filterLayout.topPlateThickness / 2],
      filterLayout.topPlateThickness + 2 * epsilon,
      model.settings.fan.screwHoleDiameter / 2,
      16,
    ),
  );
}

function towerFilterSlotHoles(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly type: "side-filter-tower" }>,
): Geom3[] {
  const filter = model.settings.arrangement.type === "four-side-filter-tower" ? model.settings.arrangement.filter : null;
  if (filter === null) {
    return [];
  }
  const z = model.box.height - filterLayout.topPlateThickness - epsilon;
  const height = filterLayout.topPlateThickness + 2 * epsilon;
  return [
    cuboidFromMinSize(filterLayout.structuralOffset, model.frame.outsideFlangeThickness, z, filter.faceWidth, filter.thickness, height),
    cuboidFromMinSize(filterLayout.structuralOffset, model.box.depth - model.frame.outsideFlangeThickness - filter.thickness, z, filter.faceWidth, filter.thickness, height),
    cuboidFromMinSize(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, z, filter.thickness, filter.faceWidth, height),
    cuboidFromMinSize(model.box.width - model.frame.outsideFlangeThickness - filter.thickness, filterLayout.structuralOffset, z, filter.thickness, filter.faceWidth, height),
  ];
}

// ##############################
// Cord Hole
// ##############################

function cordPassThroughHoles(model: TempestModel): Geom3[] {
  const cord = model.cordPassThrough;
  if (cord.type === "none") {
    return [];
  }
  if (cord.type === "tower-top-cylinder") {
    return [cylinderAlong("z", [cord.x, cord.y, cord.zStart + cord.depth / 2], cord.depth + 2 * epsilon, cord.diameter / 2, 24)];
  }
  const length = model.frame.wallThickness + 2 * epsilon;
  const wallCenter = model.frame.wallThickness / 2;
  const oppositeWallCenter = (wall: TempestWall): number =>
    wall === "front" || wall === "back" ? model.box.depth - wallCenter : model.box.width - wallCenter;
  if (cord.wall === "back") {
    return [cylinderAlong("y", [cord.positionAlongWall, oppositeWallCenter(cord.wall), cord.verticalCenter], length, cord.diameter / 2, 24)];
  }
  if (cord.wall === "front") {
    return [cylinderAlong("y", [cord.positionAlongWall, wallCenter, cord.verticalCenter], length, cord.diameter / 2, 24)];
  }
  if (cord.wall === "right") {
    return [cylinderAlong("x", [oppositeWallCenter(cord.wall), cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, 24)];
  }
  return [cylinderAlong("x", [wallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, 24)];
}

// #######################################
// CSG Helpers
// #######################################

function cuboidFromMinSize(x: number, y: number, z: number, width: number, depth: number, height: number): Geom3 {
  return primitives.cuboid({
    center: [x + width / 2, y + depth / 2, z + height / 2],
    size: [Math.max(0.001, width), Math.max(0.001, depth), Math.max(0.001, height)],
  });
}

function chamferedPrismFromMinSize(
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  chamfer: number,
): Geom3 {
  return transforms.translate(
    [x, y, z],
    extrusions.extrudeLinear(
      { height: Math.max(0.001, height) },
      chamferedRectangle2d(Math.max(0.001, width), Math.max(0.001, depth), chamfer),
    ),
  );
}

function chamferedRectangle2d(width: number, depth: number, chamfer: number): Geom2 {
  const c = Math.max(0, Math.min(chamfer, width / 2 - 0.01, depth / 2 - 0.01));
  if (c <= 0) {
    return rectangleFromMinSize2d(0, 0, width, depth);
  }
  return primitives.polygon({
    points: [
      [c, 0],
      [width - c, 0],
      [width, c],
      [width, depth - c],
      [width - c, depth],
      [c, depth],
      [0, depth - c],
      [0, c],
    ],
  });
}

function rectangleFromMinSize2d(x: number, y: number, width: number, depth: number): Geom2 {
  return primitives.polygon({
    points: [
      [x, y],
      [x + Math.max(0.001, width), y],
      [x + Math.max(0.001, width), y + Math.max(0.001, depth)],
      [x, y + Math.max(0.001, depth)],
    ],
  });
}

function cylinderAlong(
  axis: "x" | "y" | "z",
  center: readonly [number, number, number],
  length: number,
  radius: number,
  segments: number,
): Geom3 {
  let geometry = primitives.cylinder({
    height: Math.max(0.001, length),
    radius: Math.max(0.001, radius),
    segments,
  });
  if (axis === "x") {
    geometry = transforms.rotateY(Math.PI / 2, geometry);
  }
  if (axis === "y") {
    geometry = transforms.rotateX(Math.PI / 2, geometry);
  }
  return transforms.translate([...center], geometry);
}

function fanOpeningRadius(model: TempestModel): number {
  return Math.max(2, model.settings.fan.diameter / 2 - 2);
}

function fanOpeningHole(
  model: TempestModel,
  axis: "x" | "y" | "z",
  center: readonly [number, number, number],
  length: number,
): Geom3 {
  if (model.settings.fan.opening.type === "plain") {
    return cylinderAlong(axis, center, length, fanOpeningRadius(model), csgSegments);
  }
  return transforms.translate([...center], orientExtrudedOpening(axis, centeredExtrudedHoneycombOpening(model, length)));
}

function centeredExtrudedHoneycombOpening(model: TempestModel, length: number): Geom3 {
  return transforms.translate(
    [0, 0, -length / 2],
    extrusions.extrudeLinear({ height: Math.max(0.001, length) }, honeycombOpeningPattern2d(model)),
  );
}

function orientExtrudedOpening(axis: "x" | "y" | "z", geometry: Geom3): Geom3 {
  if (axis === "x") {
    return transforms.rotateY(Math.PI / 2, geometry);
  }
  if (axis === "y") {
    return transforms.rotateX(Math.PI / 2, geometry);
  }
  return geometry;
}

function honeycombOpeningPattern2d(model: TempestModel): Geom2 {
  const opening = model.settings.fan.opening;
  if (opening.type !== "honeycomb") {
    return primitives.circle({ radius: fanOpeningRadius(model), segments: csgSegments });
  }
  const cacheKey = `${model.settings.fan.diameter}:${opening.hexFlatToFlat}:${opening.ribThickness}`;
  const cachedPattern = honeycombPatternCache.get(cacheKey);
  if (cachedPattern !== undefined) {
    return cachedPattern;
  }
  const holeShapes = honeycombHoleCenters(model).map((center) => hexagon2d(center.x, center.y, center.radius));
  const pattern = booleans.intersect(
    primitives.circle({ radius: Math.max(0.001, fanOpeningRadius(model) - opening.ribThickness), segments: csgSegments }),
    unionAll2d(holeShapes),
  );
  honeycombPatternCache.set(cacheKey, pattern);
  return pattern;
}

function honeycombHoleCenters(model: TempestModel): readonly HoneycombHoleCenter[] {
  const opening = model.settings.fan.opening;
  if (opening.type !== "honeycomb") {
    return [];
  }
  const radius = opening.hexFlatToFlat / Math.sqrt(3);
  const pitchX = opening.hexFlatToFlat + opening.ribThickness;
  const pitchY = pitchX * Math.sqrt(3) / 2;
  const fanRadius = fanOpeningRadius(model);
  const clipRadius = Math.max(0, fanRadius - opening.ribThickness);
  const columnCount = Math.ceil((fanRadius * 2) / pitchX) + 2;
  const rowCount = Math.ceil((fanRadius * 2) / pitchY) + 2;
  const holes: HoneycombHoleCenter[] = [];
  for (let row = -rowCount; row <= rowCount; row += 1) {
    const rowOffset = row % 2 === 0 ? 0 : pitchX / 2;
    for (let column = -columnCount; column <= columnCount; column += 1) {
      const x = column * pitchX + rowOffset;
      const y = row * pitchY;
      if (Math.hypot(x, y) - radius > clipRadius) {
        continue;
      }
      holes.push({ x, y, radius });
    }
  }
  return holes;
}

function hexagon2d(x: number, y: number, radius: number): Geom2 {
  return primitives.polygon({
    points: Array.from({ length: 6 }, (_, index) => {
      const angle = (Math.PI / 180) * (60 * index + 30);
      return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
    }),
  });
}

function unionAll(geometriesToUnion: readonly Geom3[]): Geom3 {
  const first = geometriesToUnion[0];
  if (first === undefined) {
    throw new Error("unionAll: Missing geometry");
  }
  return geometriesToUnion.length === 1 ? first : booleans.union(first, ...geometriesToUnion.slice(1));
}

function unionAll2d(geometriesToUnion: readonly Geom2[]): Geom2 {
  const first = geometriesToUnion[0];
  if (first === undefined) {
    throw new Error("unionAll2d: Missing geometry");
  }
  return geometriesToUnion.length === 1 ? first : booleans.union(first, ...geometriesToUnion.slice(1));
}

function subtractAll(base: Geom3, holes: readonly Geom3[]): Geom3 {
  return holes.length === 0 ? base : booleans.subtract(base, ...holes);
}

// #######################################
// Mesh Conversion
// #######################################

function jscadGeometryToPrintableMesh(geometry: Geom3): PrintableMesh {
  const vertices: MeshVertex[] = [];
  const triangles: MeshTriangle[] = [];
  for (const polygon of geometries.geom3.toPolygons(geometry)) {
    const points = polygon.vertices;
    if (points.length < 3) {
      continue;
    }
    const offset = vertices.length;
    vertices.push(
      ...points.map((point) =>
        roundVertex({
          x: point[0],
          y: point[1],
          z: point[2],
        }),
      ),
    );
    for (let index = 1; index < points.length - 1; index += 1) {
      triangles.push({
        v1: offset,
        v2: offset + index,
        v3: offset + index + 1,
      });
    }
  }
  return { vertices, triangles };
}

// #######################################
// Summary Helpers
// #######################################

function estimateFeatureCount(model: TempestModel): number {
  if (model.fanLayout.type === "tower-top-grid") {
    return model.fanLayout.fanCount * fanOpeningAndScrewFeatureCount + 9;
  }
  const fanHoleCount = Object.values(model.fanLayout.walls).reduce((total, wall) => total + wall.actualCount * fanOpeningAndScrewFeatureCount, 0);
  return fanHoleCount + (model.cordPassThrough.type === "none" ? 0 : 1);
}

// #######################################
// Primitive Helpers
// #######################################

function roundVertex(vertex: MeshVertex): MeshVertex {
  return {
    x: roundMillimeters(vertex.x),
    y: roundMillimeters(vertex.y),
    z: roundMillimeters(vertex.z),
  };
}

function roundMillimeters(value: number): number {
  return Number(value.toFixed(4));
}
