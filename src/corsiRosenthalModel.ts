import {
  corsiFanGridColumns,
  filterSelectionDimensions,
  findPrintDesignPreset,
  resolveCorsiRosenthalLayout,
  type CorsiRosenthalFrameStyle,
  type CorsiRosenthalMode,
  type LayoutResult,
  type Millimeters,
} from "./airPurifier";

export const corsiRosenthalGeometry = {
  railDepth: 32,
  cornerSize: 58,
  cornerArm: 28,
  glueKey: { width: 44, depth: 18, height: 3 },
  braceWidth: 18,
  fanFrameMargin: 30,
  fanClip: { width: 34, depth: 12 },
  fanGap: 12,
} as const;

export type CorsiRosenthalModel = {
  readonly mode: CorsiRosenthalMode;
  readonly frameStyle: CorsiRosenthalFrameStyle;
  readonly filterCount: number;
  readonly filterWidth: Millimeters;
  readonly filterHeight: Millimeters;
  readonly filterThickness: Millimeters;
  readonly partHeight: Millimeters;
  readonly frameOuterWidth: Millimeters;
  readonly frameOuterHeight: Millimeters;
  readonly fanCount: number;
  readonly filterFaces: readonly CorsiFilterFace[];
  readonly fanPanels: readonly CorsiFanPanel[];
  readonly fanCassetteOuter: Millimeters;
  readonly fanOpeningRadius: Millimeters;
  readonly screwRadius: Millimeters;
  readonly screwCenters: readonly { readonly x: Millimeters; readonly y: Millimeters }[];
  readonly fanGrid: {
    readonly columns: number;
    readonly rows: number;
    readonly cell: Millimeters;
    readonly gap: Millimeters;
    readonly depth: Millimeters;
    readonly height: Millimeters;
  };
};

export type CorsiFaceSide = "front" | "right" | "back" | "left" | "top" | "bottom";

export type CorsiFilterFace = {
  readonly side: CorsiFaceSide;
};

export type CorsiFanPanel = {
  readonly side: CorsiFaceSide;
  readonly fanCount: number;
  readonly grid: CorsiFanGrid;
};

export type CorsiFanGrid = {
  readonly columns: number;
  readonly rows: number;
  readonly cell: Millimeters;
  readonly gap: Millimeters;
  readonly depth: Millimeters;
  readonly height: Millimeters;
};

export function createCorsiRosenthalModel(layout: LayoutResult): CorsiRosenthalModel {
  const filter = filterSelectionDimensions(layout.configuration.filter);
  const fanSpec = layout.configuration.fan.spec;
  const partHeight = Math.max(4, layout.configuration.cutting.materialThickness);
  const corsiLayout = resolveCorsiRosenthalLayout(layout);
  const fanCount = corsiLayout.fanCount;
  const fanCassetteOuter = fanSpec.diameter + corsiRosenthalGeometry.fanFrameMargin;
  const screwRadius = Math.max(1.6, layout.configuration.cutting.screwHoleDiameter / 2);
  const screwInset = (fanCassetteOuter - fanSpec.screwSpacing) / 2;
  const fanCell = fanSpec.diameter * 1.18;
  const fanPanels = createFanPanels(corsiLayout.mode, fanCount, fanCell);
  const fanGrid = fanPanels[0]?.grid ?? createFanGrid(1, fanCell);

  return {
    mode: corsiLayout.mode,
    frameStyle: findPrintDesignPreset(layout.configuration.printDesign.id).corsiFrameStyle ?? "scarf-rail",
    filterCount: corsiLayout.filterCount,
    filterWidth: filter.width,
    filterHeight: filter.depth,
    filterThickness: filter.thickness,
    partHeight,
    frameOuterWidth: filter.width + corsiRosenthalGeometry.railDepth * 2,
    frameOuterHeight: filter.depth + corsiRosenthalGeometry.railDepth * 2,
    fanCount,
    filterFaces: createFilterFaces(corsiLayout.mode, corsiLayout.filterCount),
    fanPanels,
    fanCassetteOuter,
    fanOpeningRadius: Math.max(16, fanSpec.diameter / 2 - 5),
    screwRadius,
    screwCenters: [
      { x: screwInset, y: screwInset },
      { x: fanCassetteOuter - screwInset, y: screwInset },
      { x: fanCassetteOuter - screwInset, y: fanCassetteOuter - screwInset },
      { x: screwInset, y: fanCassetteOuter - screwInset },
    ],
    fanGrid,
  };
}

function createFilterFaces(mode: CorsiRosenthalMode, filterCount: number): CorsiFilterFace[] {
  const sides: readonly CorsiFaceSide[] =
    mode === "side-exhaust" ? ["front", "back", "top", "bottom"] : ["front", "right", "back", "left", "bottom"];
  return sides.slice(0, filterCount).map((side) => ({ side }));
}

function createFanPanels(mode: CorsiRosenthalMode, fanCount: number, fanCell: Millimeters): CorsiFanPanel[] {
  if (mode === "side-exhaust") {
    const leftFanCount = Math.ceil(fanCount / 2);
    const rightFanCount = fanCount - leftFanCount;
    const panels: CorsiFanPanel[] = [{ side: "left", fanCount: leftFanCount, grid: createFanGrid(leftFanCount, fanCell) }];
    if (rightFanCount > 0) {
      panels.push({ side: "right", fanCount: rightFanCount, grid: createFanGrid(rightFanCount, fanCell) });
    }
    return panels;
  }
  return [{ side: "top", fanCount, grid: createFanGrid(fanCount, fanCell) }];
}

function createFanGrid(fanCount: number, fanCell: Millimeters): CorsiFanGrid {
  const fanColumns = corsiFanGridColumns(fanCount);
  const fanRows = Math.ceil(fanCount / fanColumns);
  return {
    columns: fanColumns,
    rows: fanRows,
    cell: fanCell,
    gap: corsiRosenthalGeometry.fanGap,
    depth:
      fanColumns * fanCell +
      Math.max(0, fanColumns - 1) * corsiRosenthalGeometry.fanGap +
      corsiRosenthalGeometry.railDepth * 1.4,
    height:
      fanRows * fanCell +
      Math.max(0, fanRows - 1) * corsiRosenthalGeometry.fanGap +
      corsiRosenthalGeometry.railDepth * 2,
  };
}
