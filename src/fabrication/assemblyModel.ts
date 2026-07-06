import { requireCutPanelFabricationPlan, type LayoutResult } from "@/fabrication/purifierLayout";
import { createAirPurifierGeometry, type FilterLayerGeometry } from "@/domain/purifier/geometry";
import type { AssemblyPlacement, CutPanel, FilterRailKey, StructuralAssemblyRole } from "@/fabrication/laser/cutGeometry";

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
  // Preview only: render this panel reflected across its local X axis.
  mirrored: boolean;
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
  label: "W" | "H" | "D";
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
  const cutPanelFabrication = requireCutPanelFabricationPlan(layout, "createAssemblyModel");
  const geometry = createAirPurifierGeometry(settings);
  const width = geometry.filterDimensions.width;
  const filterDepth = geometry.filterDimensions.depth;
  const height = geometry.chamberHeight;
  const depth = geometry.workingDepth;
  const thickness = settings.cutting.materialThickness;
  const rim = geometry.rim;
  const filterThickness = settings.filter.thickness;
  // Hand cut has no inner/outer filter flanges — the filter is taped in — so the
  // preview shows no flange frames (the cut sheet already omits the frame panels).
  const handCut = settings.design.type === "laser-cut" && settings.design.cutStyle === "hand";

  return {
    panels: cutPanelFabrication.cutPanels.flatMap((panel) => createStructuralPanelPart(panel)),
    filterRails: handCut ? [] : createFilterRailParts(layout),
    filterFrames: handCut ? [] : geometry.filterLayers.flatMap((layer) => createFilterFrameParts(layer, width, depth, rim, thickness)),
    filterMedia: geometry.filterLayers.map((layer) => ({
      kind: "box",
      id: `filter-media-${layer.index + 1}`,
      role: "filter-media",
      position: [0, layer.mediaCenterY, 0],
      size: [width, filterThickness, filterDepth],
      explodeDirection: [0, layer.explodeDirectionY, 0],
    })),
    seams: createPanelSeams(width, height, depth),
    dimensions: createDimensionGuides(width, height, depth),
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
  const cutPanelFabrication = requireCutPanelFabricationPlan(layout, "createFilterRailParts");
  return cutPanelFabrication.cutPanels.flatMap((panel) => {
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

// Exploded view only: the left, right, and bottom walls get pushed ~10 mm
// further out (on top of the shared explode distance) so the inner filter
// flanges that seat against them are left with a visible gap, not touching.
const explodeBoostRoles = new Set<AssemblyPanelRole>(["left-side-wall", "right-side-wall", "front-fan-wall"]);
const explodeBoostFactor = (72 + 10) / 72;

function createPanelPart(panel: CutPanel, role: AssemblyPanelRole, placement: AssemblyPlacement): AssemblyPanelPart {
  const [x, y, z] = placement.position;
  const direction = normalize([x, y, z]);
  const boosted: UnitVector3 = explodeBoostRoles.has(role)
    ? [direction[0] * explodeBoostFactor, direction[1] * explodeBoostFactor, direction[2] * explodeBoostFactor]
    : direction;
  return {
    kind: "cut-panel",
    id: panel.id,
    role,
    panel,
    position: placement.position,
    rotation: placement.rotation,
    explodeDirection: boosted,
    mirrored: placement.mirrored ?? false,
  };
}

type FilterRailPlacementInput = {
  layer: FilterLayerGeometry;
  width: number;
  depth: number;
  rim: number;
};

const filterRailPlacements: Record<FilterRailKey, (input: FilterRailPlacementInput) => AssemblyPlacement> = {
  // front-long and right-short swap faces: the front-long rail seats on the rear
  // edge (where the right-short rail used to sit) and vice versa.
  "front-long": ({ layer, depth, rim }) => ({
    position: [0, layer.outerFrameY, depth / 2 - rim / 2],
    // Flipped 180deg about its long (X) axis so it is no longer upside down.
    rotation: [-Math.PI / 2, 0, 0],
  }),
  "rear-long": ({ layer, width, rim }) => ({
    position: [-width / 2 + rim / 2, layer.outerFrameY, 0],
    // Left-side rail: flipped about its normal so the finger edge faces the left
    // wall (outward, -X) and the smooth air-opening edge faces inward (+X).
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
  }),
  "left-short": ({ layer, width, rim }) => ({
    position: [width / 2 - rim / 2, layer.outerFrameY, 0],
    rotation: [Math.PI / 2, 0, Math.PI / 2],
  }),
  "right-short": ({ layer, depth, rim }) => ({
    position: [0, layer.outerFrameY, -depth / 2 + rim / 2],
    // Flipped 180deg about its long (X) axis so it is no longer upside down.
    rotation: [-Math.PI / 2, 0, 0],
  }),
  // inner-long ("inner bottom rail") and outer-short ("inner top rail") swap
  // their seats in the assembly: the inner-bottom rail seats at the rear (+z,
  // the "top" of the upright view) and the inner-top rail at the front (-z).
  "inner-long": ({ layer, depth, rim }) => ({
    position: [0, layer.innerFrameY, depth / 2 - rim / 2],
    // Flipped 180deg about its long (X) axis so the rail is not upside down.
    rotation: [-Math.PI / 2, 0, 0],
  }),
  "outer-long": ({ layer, width, rim }) => ({
    position: [-width / 2 + rim / 2, layer.innerFrameY, 0],
    // Left-side rail: flipped so its finger edge faces the left wall (outward).
    rotation: [Math.PI / 2, 0, -Math.PI / 2],
  }),
  "inner-short": ({ layer, width, rim }) => ({
    position: [width / 2 - rim / 2, layer.innerFrameY, 0],
    rotation: [Math.PI / 2, 0, Math.PI / 2],
  }),
  "outer-short": ({ layer, depth, rim }) => ({
    position: [0, layer.innerFrameY, -depth / 2 + rim / 2],
    // Flipped 180deg about its long (X) axis so the rail is not upside down.
    rotation: [-Math.PI / 2, 0, 0],
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

function createDimensionGuides(width: number, height: number, depth: number): DimensionGuide[] {
  const yTop = height / 2 + 28;
  return [
    {
      label: "W",
      measurement: { value: width, description: "outside width" },
      from: [-width / 2, yTop, depth / 2],
      to: [width / 2, yTop, depth / 2],
      labelOffset: [-26, 52, 0],
    },
    {
      // The preview tilts the model -90° about X (homePreviewRotationX), so the
      // model-Y axis (chamberHeight) reads as depth into the screen, not height.
      label: "D",
      measurement: { value: height, description: "outside depth" },
      from: [width / 2 + 34, -height / 2, -depth / 2],
      to: [width / 2 + 34, height / 2, -depth / 2],
      labelOffset: [-41.6, 0, 0],
    },
    {
      // ...and the model-Z axis (workingDepth) reads as the vertical height.
      label: "H",
      measurement: { value: depth, description: "outside height" },
      from: [width / 2 + 28, yTop, -depth / 2],
      to: [width / 2 + 28, yTop, depth / 2],
      labelOffset: [20.8, 41.6, 0],
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
