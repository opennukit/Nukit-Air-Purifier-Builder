import { BufferAttribute, ExtrudeGeometry, Path, Shape } from "three";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import { corsiRosenthalGeometry } from "@/domain/designs/corsi-rosenthal/geometry";
import { createCorsiRosenthalModel, type CorsiFaceSide } from "@/domain/designs/corsi-rosenthal/model";
import {
  findPrintVolumePreset,
  partFitsPrintBed,
  type PrintableKit,
  type PrintableMesh,
  type PrintablePart,
  type PrintVolumePreset,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

type Point2 = {
  readonly x: number;
  readonly y: number;
};

type PlateCut =
  | {
      readonly type: "circle";
      readonly cx: number;
      readonly cy: number;
      readonly radius: number;
    }
  | {
      readonly type: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly depth: number;
      readonly radius: number;
    };

type SplitRailGroup = {
  readonly groupId: string;
  readonly label: string;
  readonly totalLength: number;
  readonly depth: number;
  readonly height: number;
  readonly splitJoint: "scarf" | "pocketed-connector";
};

type FanPanelGridBand =
  | {
      readonly kind: "seal";
      readonly size: number;
      readonly label: string;
    }
  | {
      readonly kind: "cassette";
      readonly size: number;
      readonly label: string;
      readonly index: number;
    };

const connectorPocketClearance = 0.4;
const minimumFanSealTileSize = 0.5;

export function createCorsiRosenthalPrintableKit(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableKit {
  const preset = findPrintVolumePreset(presetId);
  const model = createCorsiRosenthalModel(layout);
  const railLengthLimit = maxPrintableRailLength(preset);
  const filterFrameWidth = model.frameOuterWidth;
  const filterFrameHeight = model.frameOuterHeight;
  const railGroups: readonly SplitRailGroup[] =
    model.frameStyle === "modular-rail"
      ? createModularRailGroups(filterFrameWidth, filterFrameHeight, model.partHeight + 2)
      : createFaceRailGroups(model, filterFrameWidth, filterFrameHeight);

  const railParts = railGroups.flatMap((group) => createSplitRailParts(group, railLengthLimit));
  const parts = [
    ...railParts,
    ...(model.frameStyle === "modular-rail"
      ? createModularCornerBlocks(model.partHeight + 2)
      : createCornerBlocks(model.partHeight + 2, model.filterFaces.length)),
    ...createSealedFaceParts(model, model.partHeight, preset),
    ...createFanCassetteParts(model, model.partHeight),
    ...createFanPanelSealParts(model, model.partHeight, preset),
    ...(model.frameStyle === "modular-rail"
      ? createRailConnectors(railParts, model.fanCount)
      : createScarfGlueKeys(railParts, model.fanCount)),
  ];
  const retainedCutFeatureCount = parts.reduce((total, part) => total + part.cutFeatureCount, 0);
  const retainedPrintCriticalCutFeatureCount = parts.reduce(
    (total, part) => total + part.printCriticalCutFeatureCount,
    0,
  );

  return {
    preset,
    parts,
    summary: {
      partCount: parts.length,
      panelTileCount: parts.filter((part) => part.kind === "panel-tile").length,
      glueKeyCount: parts.filter((part) => part.kind === "dovetail-glue-key").length,
      splitPanelCount: railGroups.filter((group) => group.totalLength > railLengthLimit).length,
      oversizedPartCount: parts.filter((part) => !partFitsPrintBed(part, preset.bed)).length,
      sourceCutFeatureCount: retainedCutFeatureCount,
      retainedCutFeatureCount,
      sourcePrintCriticalCutFeatureCount: retainedPrintCriticalCutFeatureCount,
      retainedPrintCriticalCutFeatureCount,
    },
  };
}

function createFaceRailGroups(
  model: ReturnType<typeof createCorsiRosenthalModel>,
  filterFrameWidth: number,
  filterFrameHeight: number,
): readonly SplitRailGroup[] {
  return model.filterFaces.flatMap((face) => {
    const prefix = face.side;
    const labelPrefix = faceLabel(face.side);
    return [
      {
        groupId: `${prefix}-top-filter-rail`,
        label: `${labelPrefix} top filter rail`,
        totalLength: filterFrameWidth,
        depth: corsiRosenthalGeometry.railDepth,
        height: model.partHeight + 2,
        splitJoint: "scarf",
      },
      {
        groupId: `${prefix}-bottom-filter-rail`,
        label: `${labelPrefix} bottom filter rail`,
        totalLength: filterFrameWidth,
        depth: corsiRosenthalGeometry.railDepth,
        height: model.partHeight + 2,
        splitJoint: "scarf",
      },
      {
        groupId: `${prefix}-left-filter-rail`,
        label: `${labelPrefix} left filter rail`,
        totalLength: filterFrameHeight,
        depth: corsiRosenthalGeometry.railDepth,
        height: model.partHeight + 2,
        splitJoint: "scarf",
      },
      {
        groupId: `${prefix}-right-filter-rail`,
        label: `${labelPrefix} right filter rail`,
        totalLength: filterFrameHeight,
        depth: corsiRosenthalGeometry.railDepth,
        height: model.partHeight + 2,
        splitJoint: "scarf",
      },
    ];
  });
}

function createModularRailGroups(frameWidth: number, frameHeight: number, height: number): readonly SplitRailGroup[] {
  const horizontalEdges = ["top-front", "top-back", "top-left", "top-right", "bottom-front", "bottom-back", "bottom-left", "bottom-right"];
  const verticalEdges = ["front-left", "front-right", "back-left", "back-right"];
  return [
    ...horizontalEdges.map((edge) => ({
      groupId: `modular-${edge}-frame-unit`,
      label: `Modular ${edge.replaceAll("-", " ")} frame unit`,
      totalLength: frameWidth,
      depth: corsiRosenthalGeometry.railDepth,
      height,
      splitJoint: "pocketed-connector" as const,
    })),
    ...verticalEdges.map((edge) => ({
      groupId: `modular-${edge}-upright-frame-unit`,
      label: `Modular ${edge.replaceAll("-", " ")} upright frame unit`,
      totalLength: frameHeight,
      depth: corsiRosenthalGeometry.railDepth,
      height,
      splitJoint: "pocketed-connector" as const,
    })),
  ];
}

function maxPrintableRailLength(preset: PrintVolumePreset): number {
  if (preset.bed.type === "unbounded") {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(90, Math.min(preset.bed.width, preset.bed.depth) - 12);
}

function createSplitRailParts(group: SplitRailGroup, maxLength: number): PrintablePart[] {
  const segmentCount = Number.isFinite(maxLength) ? Math.max(1, Math.ceil(group.totalLength / maxLength)) : 1;
  const segmentLength = group.totalLength / segmentCount;

  return Array.from({ length: segmentCount }, (_, index) => {
    const isFirst = index === 0;
    const isLast = index === segmentCount - 1;
    const hasLeftJoint = !isFirst;
    const hasRightJoint = !isLast;
    const isPocketedConnector = group.splitJoint === "pocketed-connector";
    return createPolygonPart({
      id: `corsi-${group.groupId}-${index + 1}`,
      name: `${group.label} ${index + 1}.${segmentCount}`,
      sourcePanelId: `corsi-${group.groupId}`,
      width: segmentLength,
      depth: group.depth,
      height: group.height,
      points: isPocketedConnector
        ? connectorReceiverStripPoints(segmentLength, group.depth, hasLeftJoint, hasRightJoint)
        : scarfStripPoints(segmentLength, group.depth, hasLeftJoint, hasRightJoint),
      cutFeatureCount: isPocketedConnector ? Number(hasLeftJoint) + Number(hasRightJoint) : 0,
    });
  });
}

function createCornerBlocks(height: number, filterFaceCount: number): PrintablePart[] {
  const cornerPoints: readonly Point2[] = [
    { x: 0, y: 0 },
    { x: corsiRosenthalGeometry.cornerSize, y: 0 },
    { x: corsiRosenthalGeometry.cornerSize, y: corsiRosenthalGeometry.cornerArm },
    { x: corsiRosenthalGeometry.cornerArm, y: corsiRosenthalGeometry.cornerArm },
    { x: corsiRosenthalGeometry.cornerArm, y: corsiRosenthalGeometry.cornerSize },
    { x: 0, y: corsiRosenthalGeometry.cornerSize },
  ];

  return Array.from({ length: filterFaceCount * 4 }, (_, index) =>
    createPolygonPart({
      id: `corsi-glue-corner-${index + 1}`,
      name: `Glue corner block ${index + 1}`,
      sourcePanelId: "corsi-filter-frame",
      width: corsiRosenthalGeometry.cornerSize,
      depth: corsiRosenthalGeometry.cornerSize,
      height,
      points: cornerPoints,
      cutFeatureCount: 0,
    }),
  );
}

function createModularCornerBlocks(height: number): PrintablePart[] {
  return createCornerBlocks(height, 2).map((part, index) => ({
    ...part,
    id: `corsi-modular-corner-${index + 1}`,
    name: `Modular corner block ${index + 1}`,
    sourcePanelId: "corsi-modular-frame",
  }));
}

function createFanCassetteParts(model: ReturnType<typeof createCorsiRosenthalModel>, height: number): PrintablePart[] {
  const outer = model.fanCassetteOuter;
  const fanFrameParts = Array.from({ length: model.fanCount }, (_, index) =>
    createPlatePart({
      id: `corsi-fan-cassette-${index + 1}`,
      name: `Snap-in fan cassette ${index + 1}`,
      sourcePanelId: "corsi-fan-wall",
      width: outer,
      depth: outer,
      height,
      cuts: [
        { type: "circle", cx: outer / 2, cy: outer / 2, radius: model.fanOpeningRadius },
        ...model.screwCenters.map((center) => ({
          type: "circle" as const,
          cx: center.x,
          cy: center.y,
          radius: model.screwRadius,
        })),
        {
          type: "rect",
          x: outer / 2 - 4,
          y: 4,
          width: 8,
          depth: 18,
          radius: 2,
        },
        {
          type: "rect",
          x: outer / 2 - 4,
          y: outer - 22,
          width: 8,
          depth: 18,
          radius: 2,
        },
      ],
    }),
  );
  return fanFrameParts;
}

function createSealedFaceParts(
  model: ReturnType<typeof createCorsiRosenthalModel>,
  height: number,
  preset: PrintVolumePreset,
): PrintablePart[] {
  return model.sealedFaces.flatMap((face) => {
    const size = panelOuterSize(model, face.side);
    return createTiledPlateParts({
      id: `corsi-${face.side}-sealed-face`,
      name: `${faceLabel(face.side)} sealed panel`,
      sourcePanelId: `corsi-${face.side}-sealed-face`,
      width: size.width,
      depth: size.depth,
      height,
      preset,
    });
  });
}

function createFanPanelSealParts(
  model: ReturnType<typeof createCorsiRosenthalModel>,
  height: number,
  preset: PrintVolumePreset,
): PrintablePart[] {
  return model.fanPanels.flatMap((panel) => {
    const centerSpacing = panel.grid.cell + panel.grid.gap;
    const panelSize = panelOuterSize(model, panel.side);
    const xBands = fanPanelGridBands(panel.grid.columns, panelSize.width, model.fanCassetteOuter, centerSpacing);
    const yBands = fanPanelGridBands(panel.grid.rows, panelSize.depth, model.fanCassetteOuter, centerSpacing);

    return yBands.flatMap((yBand, yIndex) =>
      xBands.flatMap((xBand, xIndex) => {
        if (isFanCassetteOpening(panel, xBand, yBand)) {
          return [];
        }
        if (xBand.size < minimumFanSealTileSize || yBand.size < minimumFanSealTileSize) {
          return [];
        }
        return createTiledPlateParts({
          id: `corsi-${panel.side}-fan-seal-${yIndex + 1}-${xIndex + 1}`,
          name: `${faceLabel(panel.side)} fan panel sealing ${yBand.label} ${xBand.label}`,
          sourcePanelId: `corsi-${panel.side}-fan-panel-seal`,
          width: xBand.size,
          depth: yBand.size,
          height,
          preset,
        });
      }),
    );
  });
}

function panelOuterSize(
  model: ReturnType<typeof createCorsiRosenthalModel>,
  side: CorsiFaceSide,
): { readonly width: number; readonly depth: number } {
  return {
    width: model.frameOuterWidth,
    depth: side === "top" || side === "bottom" ? model.frameOuterWidth : model.frameOuterHeight,
  };
}

function fanPanelGridBands(
  cassetteCount: number,
  panelSize: number,
  cassetteSize: number,
  centerSpacing: number,
): readonly FanPanelGridBand[] {
  const cassetteSpan = cassetteCount > 0 ? cassetteSize + Math.max(0, cassetteCount - 1) * centerSpacing : 0;
  const edgeMargin = Math.max(0, (panelSize - cassetteSpan) / 2);
  const cassetteGap = Math.max(0, centerSpacing - cassetteSize);
  const bands: FanPanelGridBand[] = [{ kind: "seal", size: edgeMargin, label: "edge-1" }];

  for (let index = 0; index < cassetteCount; index += 1) {
    bands.push({ kind: "cassette", size: cassetteSize, label: `cassette-${index + 1}`, index });
    if (index < cassetteCount - 1) {
      bands.push({ kind: "seal", size: cassetteGap, label: `gap-${index + 1}` });
    }
  }

  bands.push({ kind: "seal", size: edgeMargin, label: "edge-2" });
  return bands;
}

function isFanCassetteOpening(
  panel: ReturnType<typeof createCorsiRosenthalModel>["fanPanels"][number],
  xBand: FanPanelGridBand,
  yBand: FanPanelGridBand,
): boolean {
  if (xBand.kind !== "cassette" || yBand.kind !== "cassette") {
    return false;
  }
  return yBand.index * panel.grid.columns + xBand.index < panel.fanCount;
}

function createTiledPlateParts(input: {
  readonly id: string;
  readonly name: string;
  readonly sourcePanelId: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly preset: PrintVolumePreset;
}): PrintablePart[] {
  const columnCount = splitDimension(input.width, maxPrintableTileWidth(input.preset));
  const rowCount = splitDimension(input.depth, maxPrintableTileDepth(input.preset));
  const tileWidth = input.width / columnCount;
  const tileDepth = input.depth / rowCount;

  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => {
      const isSingleTile = columnCount === 1 && rowCount === 1;
      return createPlatePart({
        id: isSingleTile ? input.id : `${input.id}-tile-${rowIndex + 1}-${columnIndex + 1}`,
        name: isSingleTile
          ? input.name
          : `${input.name} tile ${rowIndex + 1}.${rowCount} ${columnIndex + 1}.${columnCount}`,
        sourcePanelId: input.sourcePanelId,
        width: tileWidth,
        depth: tileDepth,
        height: input.height,
        cuts: [],
      });
    }),
  ).flat();
}

function splitDimension(size: number, maxSize: number): number {
  return Number.isFinite(maxSize) ? Math.max(1, Math.ceil(size / maxSize)) : 1;
}

function maxPrintableTileWidth(preset: PrintVolumePreset): number {
  return preset.bed.type === "bounded" ? preset.bed.width : Number.POSITIVE_INFINITY;
}

function maxPrintableTileDepth(preset: PrintVolumePreset): number {
  return preset.bed.type === "bounded" ? preset.bed.depth : Number.POSITIVE_INFINITY;
}

function faceLabel(side: CorsiFaceSide): string {
  return `${side[0]?.toUpperCase() ?? ""}${side.slice(1)}`;
}

function createScarfGlueKeys(railParts: readonly PrintablePart[], fanCount: number): PrintablePart[] {
  const railSeamKeyCount = railParts.filter((part) => part.name.includes(".")).length;
  const keyCount = Math.max(8, railSeamKeyCount + fanCount * 2);
  return Array.from({ length: keyCount }, (_, index) =>
    createPolygonPart({
      id: `corsi-angled-glue-key-${index + 1}`,
      name: `Angled scarf glue key ${index + 1}`,
      kind: "dovetail-glue-key",
      sourcePanelId: "corsi-glue-joints",
      width: corsiRosenthalGeometry.glueKey.width,
      depth: corsiRosenthalGeometry.glueKey.depth,
      height: corsiRosenthalGeometry.glueKey.height,
      points: [
        { x: 0, y: corsiRosenthalGeometry.glueKey.depth },
        { x: corsiRosenthalGeometry.glueKey.depth * 0.55, y: 0 },
        { x: corsiRosenthalGeometry.glueKey.width, y: 0 },
        {
          x: corsiRosenthalGeometry.glueKey.width - corsiRosenthalGeometry.glueKey.depth * 0.55,
          y: corsiRosenthalGeometry.glueKey.depth,
        },
      ],
      cutFeatureCount: 0,
    }),
  );
}

function createRailConnectors(railParts: readonly PrintablePart[], fanCount: number): PrintablePart[] {
  const railSeamCount = Math.ceil(railParts.reduce((total, part) => total + part.cutFeatureCount, 0) / 2);
  const connectorCount = Math.max(8, railSeamCount + Math.ceil(fanCount / 2));
  return Array.from({ length: connectorCount }, (_, index) =>
    createPolygonPart({
      id: `corsi-modular-rail-connector-${index + 1}`,
      name: `Modular rail connector ${index + 1}`,
      kind: "dovetail-glue-key",
      sourcePanelId: "corsi-modular-connectors",
      width: corsiRosenthalGeometry.glueKey.width,
      depth: corsiRosenthalGeometry.glueKey.depth,
      height: corsiRosenthalGeometry.glueKey.height,
      points: [
        { x: 0, y: 0 },
        { x: corsiRosenthalGeometry.glueKey.width, y: 0 },
        { x: corsiRosenthalGeometry.glueKey.width, y: corsiRosenthalGeometry.glueKey.depth },
        { x: 0, y: corsiRosenthalGeometry.glueKey.depth },
      ],
      cutFeatureCount: 0,
    }),
  );
}

function connectorReceiverStripPoints(
  width: number,
  depth: number,
  leftReceiver: boolean,
  rightReceiver: boolean,
): readonly Point2[] {
  const slotLength = Math.min(width / 2 - 1, corsiRosenthalGeometry.glueKey.width / 2 + connectorPocketClearance);
  const slotDepth = Math.min(depth - 2, corsiRosenthalGeometry.glueKey.depth + connectorPocketClearance);
  if (slotLength <= 0 || slotDepth <= 0) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: depth },
      { x: 0, y: depth },
    ];
  }

  const slotY0 = (depth - slotDepth) / 2;
  const slotY1 = slotY0 + slotDepth;
  const points: Point2[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
  ];

  if (rightReceiver) {
    points.push(
      { x: width, y: slotY0 },
      { x: width - slotLength, y: slotY0 },
      { x: width - slotLength, y: slotY1 },
      { x: width, y: slotY1 },
    );
  }

  points.push({ x: width, y: depth }, { x: 0, y: depth });

  if (leftReceiver) {
    points.push(
      { x: 0, y: slotY1 },
      { x: slotLength, y: slotY1 },
      { x: slotLength, y: slotY0 },
      { x: 0, y: slotY0 },
    );
  }

  return points;
}

function scarfStripPoints(width: number, depth: number, leftScarf: boolean, rightScarf: boolean): readonly Point2[] {
  const inset = Math.min(depth * 0.45, width * 0.22);
  return [
    { x: leftScarf ? inset : 0, y: 0 },
    { x: rightScarf ? width - inset : width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function createPlatePart(input: {
  readonly id: string;
  readonly name: string;
  readonly sourcePanelId: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly cuts: readonly PlateCut[];
}): PrintablePart {
  return {
    id: input.id,
    name: input.name,
    kind: "panel-tile",
    sourcePanelId: input.sourcePanelId,
    width: input.width,
    depth: input.depth,
    height: input.height,
    cutFeatureCount: input.cuts.length,
    printCriticalCutFeatureCount: input.cuts.length,
    mesh: createPlateMesh(input.width, input.depth, input.height, input.cuts),
  };
}

function createPolygonPart(input: {
  readonly id: string;
  readonly name: string;
  readonly kind?: PrintablePart["kind"];
  readonly sourcePanelId: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly points: readonly Point2[];
  readonly cutFeatureCount: number;
}): PrintablePart {
  return {
    id: input.id,
    name: input.name,
    kind: input.kind ?? "panel-tile",
    sourcePanelId: input.sourcePanelId,
    width: input.width,
    depth: input.depth,
    height: input.height,
    cutFeatureCount: input.cutFeatureCount,
    printCriticalCutFeatureCount: input.cutFeatureCount,
    mesh: extrudeShape(createShape(input.points), input.height),
  };
}

function createPlateMesh(width: number, depth: number, height: number, cuts: readonly PlateCut[]): PrintableMesh {
  const shape = createShape([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ]);

  for (const cut of cuts) {
    const hole = cutToHolePath(cut);
    if (hole !== null) {
      shape.holes.push(hole);
    }
  }

  return extrudeShape(shape, height);
}

function createShape(points: readonly Point2[]): Shape {
  const first = points[0];
  if (first === undefined) {
    throw new Error("createShape: Missing polygon points");
  }
  const shape = new Shape();
  shape.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    shape.lineTo(point.x, point.y);
  }
  shape.closePath();
  return shape;
}

function cutToHolePath(cut: PlateCut): Path | null {
  if (cut.type === "circle") {
    const path = new Path();
    path.absellipse(cut.cx, cut.cy, cut.radius, cut.radius, 0, Math.PI * 2, true);
    return path;
  }
  if (cut.width <= 0 || cut.depth <= 0) {
    return null;
  }
  const radius = Math.min(cut.radius, cut.width / 2, cut.depth / 2);
  const path = new Path();
  if (radius <= 0) {
    path.moveTo(cut.x, cut.y);
    path.lineTo(cut.x, cut.y + cut.depth);
    path.lineTo(cut.x + cut.width, cut.y + cut.depth);
    path.lineTo(cut.x + cut.width, cut.y);
    path.closePath();
    return path;
  }

  path.moveTo(cut.x + radius, cut.y);
  path.lineTo(cut.x + cut.width - radius, cut.y);
  path.quadraticCurveTo(cut.x + cut.width, cut.y, cut.x + cut.width, cut.y + radius);
  path.lineTo(cut.x + cut.width, cut.y + cut.depth - radius);
  path.quadraticCurveTo(cut.x + cut.width, cut.y + cut.depth, cut.x + cut.width - radius, cut.y + cut.depth);
  path.lineTo(cut.x + radius, cut.y + cut.depth);
  path.quadraticCurveTo(cut.x, cut.y + cut.depth, cut.x, cut.y + cut.depth - radius);
  path.lineTo(cut.x, cut.y + radius);
  path.quadraticCurveTo(cut.x, cut.y, cut.x + radius, cut.y);
  path.closePath();
  return path;
}

function extrudeShape(shape: Shape, height: number): PrintableMesh {
  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 24,
    steps: 1,
  });
  const mesh = geometryToPrintableMesh(geometry);
  geometry.dispose();
  return mesh;
}

function geometryToPrintableMesh(geometry: ExtrudeGeometry): PrintableMesh {
  const position = geometry.getAttribute("position");
  if (!(position instanceof BufferAttribute)) {
    throw new Error("geometryToPrintableMesh: Missing position buffer");
  }

  const vertices: MeshVertex[] = Array.from({ length: position.count }, (_, index) => ({
    x: roundMillimeters(position.getX(index)),
    y: roundMillimeters(position.getY(index)),
    z: roundMillimeters(position.getZ(index)),
  }));

  const triangles: MeshTriangle[] = [];
  const index = geometry.index;
  if (index !== null) {
    for (let cursor = 0; cursor < index.count; cursor += 3) {
      triangles.push({
        v1: index.getX(cursor),
        v2: index.getX(cursor + 1),
        v3: index.getX(cursor + 2),
      });
    }
  } else {
    for (let cursor = 0; cursor < vertices.length; cursor += 3) {
      triangles.push({ v1: cursor, v2: cursor + 1, v3: cursor + 2 });
    }
  }

  return { vertices, triangles };
}

function roundMillimeters(value: number): number {
  return Number(value.toFixed(4));
}
