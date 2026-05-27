import {
  corsiFanGridColumns,
  corsiFrameStyleForPreset,
  resolveCorsiRosenthalLayout,
  type CorsiRosenthalFrameStyle,
  type CorsiRosenthalMode,
} from "@/domain/purifier/airPurifier";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import type { Millimeters } from "@/domain/units";
import { filterSelectionDimensions } from "@/domain/purifier/filter";
import { corsiRosenthalGeometry } from "@/domain/designs/corsi-rosenthal/geometry";

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
  readonly sealedFaces: readonly CorsiSealedFace[];
  readonly faceRoles: readonly CorsiFaceRoleAssignment[];
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

export const corsiFaceSides: readonly CorsiFaceSide[] = ["front", "right", "back", "left", "top", "bottom"];

export type CorsiFaceRole = "filter" | "fan" | "sealed";

export type CorsiFaceRoleAssignment =
  | {
      readonly side: CorsiFaceSide;
      readonly role: "filter";
      readonly fanCount?: never;
    }
  | {
      readonly side: CorsiFaceSide;
      readonly role: "fan";
      readonly fanCount: number;
    }
  | {
      readonly side: CorsiFaceSide;
      readonly role: "sealed";
      readonly fanCount?: never;
    };

export type CorsiFilterFace = {
  readonly side: CorsiFaceSide;
};

export type CorsiSealedFace = {
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
  const filterFaces = createFilterFaces(corsiLayout.mode, corsiLayout.filterCount);
  const fanPanels = createFanPanels(corsiLayout.mode, fanCount, fanCell);
  const sealedFaces = createSealedFaces(filterFaces, fanPanels);
  const fanGrid = fanPanels[0]?.grid ?? createFanGrid(1, fanCell);

  return {
    mode: corsiLayout.mode,
    frameStyle: corsiFrameStyleForPreset(layout.configuration.printDesign) ?? "scarf-rail",
    filterCount: corsiLayout.filterCount,
    filterWidth: filter.width,
    filterHeight: filter.depth,
    filterThickness: filter.thickness,
    partHeight,
    frameOuterWidth: filter.width + corsiRosenthalGeometry.railDepth * 2,
    frameOuterHeight: filter.depth + corsiRosenthalGeometry.railDepth * 2,
    fanCount,
    filterFaces,
    fanPanels,
    sealedFaces,
    faceRoles: createFaceRoles(filterFaces, fanPanels, sealedFaces),
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

function createSealedFaces(
  filterFaces: readonly CorsiFilterFace[],
  fanPanels: readonly CorsiFanPanel[],
): CorsiSealedFace[] {
  const occupiedSides = new Set<CorsiFaceSide>([
    ...filterFaces.map((face) => face.side),
    ...fanPanels.map((panel) => panel.side),
  ]);
  return corsiFaceSides.filter((side) => !occupiedSides.has(side)).map((side) => ({ side }));
}

function createFaceRoles(
  filterFaces: readonly CorsiFilterFace[],
  fanPanels: readonly CorsiFanPanel[],
  sealedFaces: readonly CorsiSealedFace[],
): CorsiFaceRoleAssignment[] {
  const fanCountBySide = new Map(fanPanels.map((panel) => [panel.side, panel.fanCount] as const));
  return corsiFaceSides.map((side) => {
    if (filterFaces.some((face) => face.side === side)) {
      return { side, role: "filter" };
    }
    const fanCount = fanCountBySide.get(side);
    if (fanCount !== undefined) {
      return { side, role: "fan", fanCount };
    }
    if (sealedFaces.some((face) => face.side === side)) {
      return { side, role: "sealed" };
    }
    throw new Error(`createFaceRoles: Missing Corsi face role for ${side}`);
  });
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
