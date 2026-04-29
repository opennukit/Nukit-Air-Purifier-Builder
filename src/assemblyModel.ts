import { filterSelectionDimensions, type LayoutResult } from "./airPurifier";
import { createAirPurifierGeometry, type FilterLayerGeometry } from "./airPurifierGeometry";
import type { AssemblyPlacement, CutPanel, FilterRailKey, StructuralAssemblyRole } from "./cutGeometry";

export type MillimeterVector3 = readonly [number, number, number];
export type MillimeterSize3 = readonly [number, number, number];
export type EulerRotation = readonly [number, number, number];
export type UnitVector3 = readonly [number, number, number];
export type Vector3Tuple = MillimeterVector3;

export type AssemblyWallRole = StructuralAssemblyRole;
export type AssemblyPanelRole = AssemblyWallRole | "filter-rail" | "filter-frame-panel";

export type AssemblyPanelPart = {
  kind: "cut-panel";
  id: string;
  role: AssemblyPanelRole;
  panel: CutPanel;
  position: MillimeterVector3;
  rotation: EulerRotation;
  explodeDirection: UnitVector3;
};

export type AssemblyBoxPart = {
  kind: "box";
  id: string;
  role: "filter-media" | "filter-frame";
  position: MillimeterVector3;
  size: MillimeterSize3;
  explodeDirection: UnitVector3;
};

export type DimensionMeasurement = {
  value: number;
  description: string;
};

export type DimensionGuide = {
  label: "A" | "B" | "C" | "E" | "G";
  from: MillimeterVector3;
  to: MillimeterVector3;
  measurement: DimensionMeasurement;
  labelOffset: MillimeterVector3;
};

export type AssemblyLineCue = {
  kind: "line-cue";
  id: string;
  role: "panel-seam";
  from: MillimeterVector3;
  to: MillimeterVector3;
};

export type AssemblyModel = {
  panels: AssemblyPanelPart[];
  filterRails: AssemblyPanelPart[];
  filterFrames: AssemblyBoxPart[];
  filterMedia: AssemblyBoxPart[];
  seams: AssemblyLineCue[];
  dimensions: DimensionGuide[];
};

export function createAssemblyModel(layout: LayoutResult): AssemblyModel {
  const settings = layout.configuration;
  const geometry = createAirPurifierGeometry(settings);
  const width = geometry.filterDimensions.width;
  const filterDepth = geometry.filterDimensions.depth;
  const height = geometry.chamberHeight;
  const depth = geometry.workingDepth;
  const thickness = settings.cutting.materialThickness;
  const rim = geometry.rim;
  const filterThickness = filterSelectionDimensions(settings.filter).thickness;

  return {
    panels: layout.cutPanels.flatMap((panel) => createStructuralPanelPart(panel)),
    filterRails: createFilterRailParts(layout),
    filterFrames: geometry.filterLayers.flatMap((layer) => createFilterFrameParts(layer, width, depth, rim, thickness)),
    filterMedia: geometry.filterLayers.map((layer) => ({
      kind: "box",
      id: `filter-media-${layer.index + 1}`,
      role: "filter-media",
      position: [0, layer.mediaCenterY, 0],
      size: [width, filterThickness, filterDepth],
      explodeDirection: [0, layer.explodeDirectionY, 0],
    })),
    seams: createPanelSeams(width, height, depth),
    dimensions: createDimensionGuides(width, height, depth, settings.fan.spec.diameter, rim),
  };
}

function createStructuralPanelPart(panel: CutPanel): AssemblyPanelPart[] {
  const assembly = panel.assembly;
  if (assembly?.type !== "placed" || assembly.role === "filter-frame-panel") {
    return [];
  }

  return [createPanelPart(panel, assembly.role, assembly.placement)];
}

function createFilterRailParts(layout: LayoutResult): AssemblyPanelPart[] {
  return layout.cutPanels.flatMap((panel) => {
    const assembly = panel.assembly;
    if (assembly === undefined) {
      return [];
    }

    if (assembly.type === "placed" && assembly.role === "filter-frame-panel") {
      return [createPanelPart(panel, "filter-frame-panel", assembly.placement)];
    }

    if (assembly.type !== "filter-rail") {
      return [];
    }

    const placement = splitFrameRailPlacement(assembly.filterIndex, assembly.railKey, layout);
    return placement === null ? [] : [createPanelPart(panel, "filter-rail", placement)];
  });
}

function createPanelPart(panel: CutPanel, role: AssemblyPanelRole, placement: AssemblyPlacement): AssemblyPanelPart {
  const [x, y, z] = placement.position;
  return {
    kind: "cut-panel",
    id: panel.id,
    role,
    panel,
    position: placement.position,
    rotation: placement.rotation,
    explodeDirection: normalize([x, y, z]),
  };
}

type FilterRailPlacementInput = {
  layer: FilterLayerGeometry;
  width: number;
  depth: number;
  rim: number;
};

const filterRailPlacements: Record<FilterRailKey, (input: FilterRailPlacementInput) => AssemblyPlacement> = {
  "front-long": ({ layer, depth, rim }) => ({
    position: [0, layer.outerFrameY, -depth / 2 + rim / 2],
    rotation: [Math.PI / 2, 0, 0],
  }),
  "rear-long": ({ layer, width, rim }) => ({
    position: [-width / 2 + rim / 2, layer.outerFrameY, 0],
    rotation: [Math.PI / 2, 0, Math.PI / 2],
  }),
  "left-short": ({ layer, width, rim }) => ({
    position: [width / 2 - rim / 2, layer.outerFrameY, 0],
    rotation: [Math.PI / 2, 0, Math.PI / 2],
  }),
  "right-short": ({ layer, depth, rim }) => ({
    position: [0, layer.outerFrameY, depth / 2 - rim / 2],
    rotation: [Math.PI / 2, 0, 0],
  }),
  "inner-long": ({ layer, depth, rim }) => ({
    position: [0, layer.innerFrameY, -depth / 2 + rim / 2],
    rotation: [Math.PI / 2, 0, 0],
  }),
  "outer-long": ({ layer, width, rim }) => ({
    position: [-width / 2 + rim / 2, layer.innerFrameY, 0],
    rotation: [Math.PI / 2, 0, Math.PI / 2],
  }),
  "inner-short": ({ layer, width, rim }) => ({
    position: [width / 2 - rim / 2, layer.innerFrameY, 0],
    rotation: [Math.PI / 2, 0, Math.PI / 2],
  }),
  "outer-short": ({ layer, depth, rim }) => ({
    position: [0, layer.innerFrameY, depth / 2 - rim / 2],
    rotation: [Math.PI / 2, 0, 0],
  }),
};

function splitFrameRailPlacement(filterIndex: number, railKey: FilterRailKey, layout: LayoutResult): AssemblyPlacement | null {
  const geometry = createAirPurifierGeometry(layout.configuration);
  const layer = geometry.filterLayers[filterIndex];
  if (layer === undefined) {
    return null;
  }

  return filterRailPlacements[railKey]({
    layer,
    width: geometry.filterDimensions.width,
    depth: geometry.workingDepth,
    rim: geometry.rim,
  });
}

function createFilterFrameParts(
  layer: FilterLayerGeometry,
  width: number,
  depth: number,
  rim: number,
  thickness: number,
): AssemblyBoxPart[] {
  const prefix = `filter-frame-${layer.index + 1}`;
  const explodeDirection: Vector3Tuple = [0, layer.explodeDirectionY, 0];
  return [
    {
      kind: "box",
      id: `${prefix}-top`,
      role: "filter-frame",
      position: [0, layer.mediaCenterY, depth / 2 - rim / 2],
      size: [width, thickness, rim],
      explodeDirection,
    },
    {
      kind: "box",
      id: `${prefix}-bottom`,
      role: "filter-frame",
      position: [0, layer.mediaCenterY, -depth / 2 + rim / 2],
      size: [width, thickness, rim],
      explodeDirection,
    },
    {
      kind: "box",
      id: `${prefix}-left`,
      role: "filter-frame",
      position: [-width / 2 + rim / 2, layer.mediaCenterY, 0],
      size: [rim, thickness, depth],
      explodeDirection,
    },
    {
      kind: "box",
      id: `${prefix}-right`,
      role: "filter-frame",
      position: [width / 2 - rim / 2, layer.mediaCenterY, 0],
      size: [rim, thickness, depth],
      explodeDirection,
    },
  ];
}

function createDimensionGuides(
  width: number,
  height: number,
  depth: number,
  fanDiameter: number,
  rim: number,
): DimensionGuide[] {
  const yTop = height / 2 + 28;
  return [
    {
      label: "A",
      measurement: { value: width, description: "filter width" },
      from: [-width / 2, yTop, depth / 2],
      to: [width / 2, yTop, depth / 2],
      labelOffset: [-26, 52, 0],
    },
    {
      label: "B",
      measurement: { value: depth, description: "working depth" },
      from: [width / 2 + 28, yTop, -depth / 2],
      to: [width / 2 + 28, yTop, depth / 2],
      labelOffset: [20.8, 41.6, 0],
    },
    {
      label: "C",
      measurement: { value: height, description: "chamber height" },
      from: [width / 2 + 34, -height / 2, -depth / 2],
      to: [width / 2 + 34, height / 2, -depth / 2],
      labelOffset: [-41.6, 0, 0],
    },
    {
      label: "E",
      measurement: { value: fanDiameter, description: "fan diameter" },
      from: [-width / 2 + rim, -fanDiameter / 2, -depth / 2 - 16],
      to: [-width / 2 + rim, fanDiameter / 2, -depth / 2 - 16],
      labelOffset: [-117, -83.2, -46.8],
    },
    {
      label: "G",
      measurement: { value: rim, description: "filter rim" },
      from: [width / 2 - rim, height / 2 - rim, -depth / 2 - 16],
      to: [width / 2, height / 2 - rim, -depth / 2 - 16],
      labelOffset: [-72.8, 41.6, -10.4],
    },
  ];
}

export function formatDimension(value: number): string {
  const fixed = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${fixed.replace(/\.0$/, "")} mm`;
}

function createPanelSeams(width: number, height: number, depth: number): AssemblyLineCue[] {
  const xLeft = -width / 2;
  const xRight = width / 2;
  const yBottom = -height / 2;
  const yTop = height / 2;
  const zFront = -depth / 2;
  const zRear = depth / 2;

  return [
    createPanelSeam("front-left-vertical", [xLeft, yBottom, zFront], [xLeft, yTop, zFront]),
    createPanelSeam("front-right-vertical", [xRight, yBottom, zFront], [xRight, yTop, zFront]),
    createPanelSeam("rear-left-vertical", [xLeft, yBottom, zRear], [xLeft, yTop, zRear]),
    createPanelSeam("rear-right-vertical", [xRight, yBottom, zRear], [xRight, yTop, zRear]),
    createPanelSeam("front-top", [xLeft, yTop, zFront], [xRight, yTop, zFront]),
    createPanelSeam("front-bottom", [xLeft, yBottom, zFront], [xRight, yBottom, zFront]),
    createPanelSeam("rear-top", [xLeft, yTop, zRear], [xRight, yTop, zRear]),
    createPanelSeam("rear-bottom", [xLeft, yBottom, zRear], [xRight, yBottom, zRear]),
    createPanelSeam("left-top", [xLeft, yTop, zFront], [xLeft, yTop, zRear]),
    createPanelSeam("left-bottom", [xLeft, yBottom, zFront], [xLeft, yBottom, zRear]),
    createPanelSeam("right-top", [xRight, yTop, zFront], [xRight, yTop, zRear]),
    createPanelSeam("right-bottom", [xRight, yBottom, zFront], [xRight, yBottom, zRear]),
  ];
}

function createPanelSeam(id: string, from: MillimeterVector3, to: MillimeterVector3): AssemblyLineCue {
  return {
    kind: "line-cue",
    id: `panel-seam-${id}`,
    role: "panel-seam",
    from,
    to,
  };
}

function normalize(vector: MillimeterVector3): UnitVector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length < 0.001) {
    return [0, 0, 0];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
