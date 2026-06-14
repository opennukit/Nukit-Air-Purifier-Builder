import { Box3, BoxGeometry, Group, Material, Mesh, Vector3 } from "three";
import type {
  TempestFilterLayout,
  TempestModel,
  TempestPrintablePose,
} from "@/domain/designs/tempest/model";
import type { TempestHorizontalFilterSize, TempestWall } from "@/domain/designs/tempest/shared";
import { assertNever } from "@/domain/designs/tempest/topology";
import { createPreviewEdges } from "@/rendering/three/preview/panelMeshes";
import {
  dominantVectorAxis,
  previewInteriorShiftForBounds,
  vectorAxisValue,
} from "@/rendering/three/preview/sceneMath";
import {
  fanPreviewRearDepthMillimeters,
  filterMediaPreviewClearanceMillimeters,
  filterMediaPreviewSurfaceGapMillimeters,
  previewFanWallInset,
  previewTopFanGrillGap,
  recessedMillimeterFilterMediaThickness,
  sceneScale,
  visualFilterMediaDimension,
  type FanAxis,
  type FanFacing,
  type PreviewInteriorPlane,
  type TempestCsgBox,
  type TempestCsgPoint,
} from "@/rendering/three/preview/previewData";

// #######################################
// Tempest Preview Purchased Parts
// #######################################

// Filter-media boxes and wall/top fan placement for the Tempest preview, in CSG
// coordinates mapped through the printable pose into the scene.

export function tempestHorizontalFilterBoxes(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
  filter: TempestHorizontalFilterSize,
): readonly TempestCsgBox[] {
  const inset = filterMediaPreviewClearanceMillimeters;
  const surfaceGap = filterMediaPreviewSurfaceGapMillimeters;
  // The media keeps its MEASURED footprint; the fit clearance shifts it to the
  // center of the cavity that grew around it.
  const fitClearance = model.frame.filterFitClearance;
  return filterLayout.filters.map((layer) => ({
    min: {
      x: model.frame.wallThickness + fitClearance + inset,
      y: model.frame.wallThickness + fitClearance + inset,
      z: layer.zBottom + surfaceGap,
    },
    size: {
      x: visualFilterMediaDimension(filter.footprintWidth),
      y: visualFilterMediaDimension(filter.footprintDepth),
      z: recessedMillimeterFilterMediaThickness(filter.thickness),
    },
  }));
}

export function tempestTowerFilterBoxes(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): readonly TempestCsgBox[] {
  const filter = filterLayout.filter; // carried on the quad layout
  const inset = filterMediaPreviewClearanceMillimeters;
  const surfaceGap = filterMediaPreviewSurfaceGapMillimeters;
  // The media keeps its MEASURED face size; the fit clearance centers it across
  // the wider pocket. In the thickness direction the clearance is single-sided
  // (chamber side), so resting against the outer flange stays correct.
  const fitClearance = model.frame.filterFitClearance;
  const faceWidth = visualFilterMediaDimension(filter.faceWidth);
  const faceHeight = visualFilterMediaDimension(filter.faceHeight);
  const filterThickness = recessedMillimeterFilterMediaThickness(filter.thickness);
  const z = filterLayout.bottomPlateThickness + inset;
  return [
    {
      min: { x: filterLayout.structuralOffset + fitClearance + inset, y: model.frame.outsideFlangeThickness + surfaceGap, z },
      size: { x: faceWidth, y: filterThickness, z: faceHeight },
    },
    {
      min: {
        x: filterLayout.structuralOffset + fitClearance + inset,
        y: model.box.depth - model.frame.outsideFlangeThickness - filter.thickness + surfaceGap,
        z,
      },
      size: { x: faceWidth, y: filterThickness, z: faceHeight },
    },
    {
      min: { x: model.frame.outsideFlangeThickness + surfaceGap, y: filterLayout.structuralOffset + fitClearance + inset, z },
      size: { x: filterThickness, y: faceWidth, z: faceHeight },
    },
    {
      min: {
        x: model.box.width - model.frame.outsideFlangeThickness - filter.thickness + surfaceGap,
        y: filterLayout.structuralOffset + fitClearance + inset,
        z,
      },
      size: { x: filterThickness, y: faceWidth, z: faceHeight },
    },
  ];
}

export function createTempestPreviewBox(
  box: TempestCsgBox,
  pose: TempestPrintablePose,
  material: Material,
  edgeMaterial: Material,
  name: string,
  showPreviewEdges: boolean,
): Group {
  const bounds = new Box3().setFromPoints(tempestCsgBoxCorners(box).map((point) => tempestCsgPointToScene(point, pose)));
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const geometry = new BoxGeometry(size.x, size.y, size.z);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(center);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new Group();
  group.add(mesh);
  if (showPreviewEdges) {
    const edges = createPreviewEdges(geometry, edgeMaterial);
    edges.position.copy(center);
    group.add(edges);
  }
  return group;
}

function tempestCsgBoxCorners(box: TempestCsgBox): readonly TempestCsgPoint[] {
  const x1 = box.min.x + box.size.x;
  const y1 = box.min.y + box.size.y;
  const z1 = box.min.z + box.size.z;
  return [
    { x: box.min.x, y: box.min.y, z: box.min.z },
    { x: x1, y: box.min.y, z: box.min.z },
    { x: box.min.x, y: y1, z: box.min.z },
    { x: x1, y: y1, z: box.min.z },
    { x: box.min.x, y: box.min.y, z: z1 },
    { x: x1, y: box.min.y, z: z1 },
    { x: box.min.x, y: y1, z: z1 },
    { x: x1, y: y1, z: z1 },
  ];
}

export function tempestCsgPointToScene(point: TempestCsgPoint, pose: TempestPrintablePose): Vector3 {
  const posedPoint =
    pose.type === "upright-dual-filter"
      ? {
          x: point.x,
          y: pose.envelope.depth - point.z,
          z: point.y,
        }
      : point;
  return tempestPosedPointToScene(posedPoint);
}

// Millimeter point already in the printable (posed, Z-up) frame → Y-up scene.
// Print-chunk meshes and their sourcePlacement live in this frame.
export function tempestPosedPointToScene(point: TempestCsgPoint): Vector3 {
  return new Vector3(point.x * sceneScale, point.z * sceneScale, point.y * sceneScale);
}

export function tempestCsgAxisToSceneAxis(axis: FanAxis, pose: TempestPrintablePose): FanAxis {
  if (pose.type === "upright-dual-filter") {
    return axis;
  }
  if (axis === "y") {
    return "z";
  }
  if (axis === "z") {
    return "y";
  }
  return "x";
}

export function tempestWallNormalAxis(wall: TempestWall): FanAxis {
  return wall === "front" || wall === "back" ? "y" : "x";
}

export function tempestWallInteriorFanCenter(
  model: TempestModel,
  wall: TempestWall,
  positionAlongWall: number,
  localVerticalCenter: number,
): TempestCsgPoint {
  const z = model.frame.outsideFlangeThickness + localVerticalCenter;
  // All four wall fans exhaust outward, so the wall side is the fan's rear
  // (exhaust) side; reserve that depth before the inset shift fine-tunes it.
  const centerDepth = model.frame.wallThickness + fanPreviewRearDepthMillimeters;
  if (wall === "front") {
    return { x: positionAlongWall, y: centerDepth, z };
  }
  if (wall === "back") {
    return { x: positionAlongWall, y: model.box.depth - centerDepth, z };
  }
  if (wall === "left") {
    return { x: centerDepth, y: positionAlongWall, z };
  }
  return { x: model.box.width - centerDepth, y: positionAlongWall, z };
}

export function moveTempestFanInsideWall(fan: Group, model: TempestModel, pose: TempestPrintablePose, wall: TempestWall): void {
  const bounds = new Box3().setFromObject(fan);
  const plane = tempestWallInteriorPlane(model, pose, wall);
  fan.position[plane.axis] += previewInteriorShiftForBounds(bounds, plane);
}

// Recess a tower's top fan below the top grill the same way wall fans are inset
// behind their grill, so it sits inside the box instead of level with the top.
// `topInteriorZ` is the underside of the top plate in CSG coordinates (passed in
// because only the quad layout carries a top plate).
export function moveTempestFanInsideTop(
  fan: Group,
  model: TempestModel,
  pose: TempestPrintablePose,
  topInteriorZ: number,
): void {
  const bounds = new Box3().setFromObject(fan);
  const plane = tempestTopInteriorPlane(model, pose, topInteriorZ);
  fan.position[plane.axis] += previewInteriorShiftForBounds(bounds, plane);
}

// The underside of the top plate, expressed as a scene-space interior plane —
// same shape as the wall planes, but with a real gap so the fan drops clear of
// the top fan-grid (the walls stop below the grid) rather than poking up level
// with it.
function tempestTopInteriorPlane(
  model: TempestModel,
  pose: TempestPrintablePose,
  topInteriorZ: number,
): PreviewInteriorPlane {
  const facePoint: TempestCsgPoint = { x: model.box.width / 2, y: model.box.depth / 2, z: topInteriorZ };
  const sceneFacePoint = tempestCsgPointToScene(facePoint, pose);
  const insideDirection = tempestCsgPointToScene({ ...facePoint, z: facePoint.z - 1 }, pose).sub(sceneFacePoint);
  const axis = dominantVectorAxis(insideDirection);
  const insideSign = vectorAxisValue(insideDirection, axis) >= 0 ? 1 : -1;
  return {
    axis,
    coordinate: vectorAxisValue(sceneFacePoint, axis),
    insideSign,
    inset: previewTopFanGrillGap,
  };
}

// Every wall fan exhausts outward: the fan model's local +y is its exhaust/back
// side, so facing points +y away from the interior on all four walls. Derived
// from the same scene-space interior probe the inset shift uses, so it stays
// correct under any pose.
export function tempestWallFanFacing(model: TempestModel, pose: TempestPrintablePose, wall: TempestWall): FanFacing {
  return tempestWallInteriorPlane(model, pose, wall).insideSign >= 0 ? "axis-negative" : "axis-positive";
}

function tempestWallInteriorPlane(model: TempestModel, pose: TempestPrintablePose, wall: TempestWall): PreviewInteriorPlane {
  const facePoint = tempestWallInteriorFacePoint(model, wall);
  const sceneFacePoint = tempestCsgPointToScene(facePoint, pose);
  const insideDirection = tempestCsgPointToScene(tempestWallInteriorProbePoint(model, wall), pose).sub(sceneFacePoint);
  const axis = dominantVectorAxis(insideDirection);
  const insideSign = vectorAxisValue(insideDirection, axis) >= 0 ? 1 : -1;
  return {
    axis,
    coordinate: vectorAxisValue(sceneFacePoint, axis),
    insideSign,
    inset: previewFanWallInset,
  };
}

function tempestWallInteriorFacePoint(model: TempestModel, wall: TempestWall): TempestCsgPoint {
  if (wall === "front") {
    return { x: 0, y: model.frame.wallThickness, z: 0 };
  }
  if (wall === "back") {
    return { x: 0, y: model.box.depth - model.frame.wallThickness, z: 0 };
  }
  if (wall === "left") {
    return { x: model.frame.wallThickness, y: 0, z: 0 };
  }
  return { x: model.box.width - model.frame.wallThickness, y: 0, z: 0 };
}

function tempestWallInteriorProbePoint(model: TempestModel, wall: TempestWall): TempestCsgPoint {
  const point = tempestWallInteriorFacePoint(model, wall);
  if (wall === "front") {
    return { ...point, y: point.y + 1 };
  }
  if (wall === "back") {
    return { ...point, y: point.y - 1 };
  }
  if (wall === "left") {
    return { ...point, x: point.x + 1 };
  }
  return { ...point, x: point.x - 1 };
}

// The sandwich preview filter media comes from the input arrangement's footprint
// filter, which a sandwich-topology model always carries.
export function expectSandwichArrangementFilter(arrangement: TempestModel["settings"]["arrangement"]): TempestHorizontalFilterSize {
  switch (arrangement.type) {
    case "single-horizontal-top-filter":
    case "dual-horizontal-sandwich":
      return arrangement.filter;
    case "four-side-filter-tower":
      throw new Error("expectSandwichArrangementFilter: quad arrangement in sandwich preview");
    default:
      return assertNever(arrangement);
  }
}

export const tempestPreviewWalls: readonly TempestWall[] = ["front", "back", "left", "right"];
