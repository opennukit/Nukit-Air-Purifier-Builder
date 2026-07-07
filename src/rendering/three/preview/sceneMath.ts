import { Box3, Group, Object3D, Vector3 } from "three";
import type { CameraPreset } from "@/domain/purifier/settingsModel";
import {
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
  staticPrintReferenceForPreset,
} from "@/domain/purifier/designPresets";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { assertNever } from "@/domain/designs/tempest/topology";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/settings";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import { staticPrintReferenceHasAssembledPreview } from "@/resources/static-print-references/references";
import {
  createDonutFilterModel,
  donutAdapterTotalHeight,
  donutCapTotalHeight,
} from "@/domain/designs/donut-filter/model";
import type { MillimeterVector3, Vector3Tuple } from "@/fabrication/assemblyModel";
import {
  dimensionPreviewFramingMultiplier,
  generatedPreviewExplodeDistance,
  generatedPreviewZoom,
  generatedPreviewZoomReferenceMillimeters,
  minimumLargeModelPreviewZoom,
  sceneScale,
  staticReferencePreviewZoom,
  staticReferenceSceneScale,
  tempestChunkSeamExplodeFraction,
  tempestPreviewZoom,
  type FanAxis,
  type PreviewInteriorPlane,
} from "@/rendering/three/preview/previewData";

// #######################################
// Camera and Scene Math
// #######################################

// Millimeter-to-scene conversions, exploded-view displacement, camera framing,
// and the axis/interior-plane vector math shared across preview models.

export function toScenePosition(position: Vector3Tuple, explodeDirection: Vector3Tuple, exploded: boolean): Vector3 {
  const explodeDistance = exploded ? 72 : 0;
  return new Vector3(
    (position[0] + explodeDirection[0] * explodeDistance) * sceneScale,
    (position[1] + explodeDirection[1] * explodeDistance) * sceneScale,
    (position[2] + explodeDirection[2] * explodeDistance) * sceneScale,
  );
}

export function toSceneOffset(offset: MillimeterVector3): Vector3 {
  return new Vector3(offset[0] * sceneScale, offset[1] * sceneScale, offset[2] * sceneScale);
}

// Displaces `children` (default: every child) outward from the whole group's
// center; the bounds always come from the full group so a partial selection
// still explodes away from the assembled model's center.
export function explodeGeneratedPreviewChildrenFromCenter(
  group: Group,
  exploded: boolean,
  children: readonly Object3D[] = group.children,
): void {
  if (!exploded || children.length === 0) {
    return;
  }

  const modelBounds = new Box3().setFromObject(group);
  if (modelBounds.isEmpty()) {
    return;
  }

  const modelCenter = modelBounds.getCenter(new Vector3());
  const totalChildren = children.length;
  children.forEach((child, index) => {
    const childBounds = new Box3().setFromObject(child);
    if (childBounds.isEmpty()) {
      return;
    }

    const direction = childBounds.getCenter(new Vector3()).sub(modelCenter);
    if (direction.lengthSq() < 0.000001) {
      direction.copy(radialFallbackExplodeDirection(index, totalChildren));
    }

    child.position.add(direction.normalize().multiplyScalar(generatedPreviewExplodeDistance));
  });
}

function radialFallbackExplodeDirection(index: number, total: number): Vector3 {
  const angle = (Math.PI * 2 * index) / Math.max(1, total);
  return new Vector3(Math.cos(angle), 0.35, Math.sin(angle));
}

// The axis-aligned millimeter box one print chunk occupies in the posed assembly.
export type ChunkBoxMillimeters = {
  readonly min: Vector3Tuple;
  readonly size: Vector3Tuple;
};

// Exploded-view displacement per chunk, in posed-assembly millimeters: each
// chunk moves outward by its center-offset from the assembly's center, scaled
// by tempestChunkSeamExplodeFraction. Scaling the UN-normalized vector is the
// point — chunks further out move proportionally further, so EVERY seam opens
// by fraction × chunk pitch, including seams between same-side collinear
// neighbours (a fixed-magnitude offset would leave those closed). A chunk
// centered on the assembly stays put.
export function chunkSeamExplodeOffsetsMillimeters(chunks: readonly ChunkBoxMillimeters[]): Vector3Tuple[] {
  if (chunks.length === 0) {
    return [];
  }

  const assemblyBounds = new Box3();
  const chunkCenters = chunks.map((chunk) => {
    const min = new Vector3(...chunk.min);
    const max = min.clone().add(new Vector3(...chunk.size));
    assemblyBounds.expandByPoint(min).expandByPoint(max);
    return min.add(max).multiplyScalar(0.5);
  });

  const assemblyCenter = assemblyBounds.getCenter(new Vector3());

  return chunkCenters.map((center) => {
    const offset = center.sub(assemblyCenter).multiplyScalar(tempestChunkSeamExplodeFraction);
    return [offset.x, offset.y, offset.z];
  });
}

export function cameraPosition(preset: CameraPreset, maxDimension: number): Vector3 {
  if (preset === "front") {
    return new Vector3(0, maxDimension * 0.45, -maxDimension * 2.45);
  }
  if (preset === "side") {
    return new Vector3(maxDimension * 2.45, maxDimension * 0.52, 0);
  }
  if (preset === "top") {
    return new Vector3(0.001, maxDimension * 2.8, 0.001);
  }
  // Default three-quarter start: front-left of the box at modest elevation, so
  // the filter face and one fan wall are both visible on first load.
  return new Vector3(-maxDimension * 1.45, maxDimension * 0.5, -maxDimension * 1.95);
}

export function cameraViewScale(layout: LayoutResult): number {
  const dimensionFraming = layout.configuration.preview.enclosure.showDimensions ? dimensionPreviewFramingMultiplier : 1;
  return (modelViewScale(layout) / previewZoomForLayout(layout)) * dimensionFraming;
}

function previewZoomForLayout(layout: LayoutResult): number {
  if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    return staticReferencePreviewZoom;
  }
  if (isTempestPrintDesignId(layout.configuration.printDesign.id)) {
    return tempestPreviewZoom;
  }

  const largestPhysicalDimension = previewLargestPhysicalDimensionMillimeters(layout);
  const sizeRatio = Math.max(1, largestPhysicalDimension / generatedPreviewZoomReferenceMillimeters);
  return clamp(generatedPreviewZoom / sizeRatio, minimumLargeModelPreviewZoom, generatedPreviewZoom);
}

function previewLargestPhysicalDimensionMillimeters(layout: LayoutResult): number {
  const settings = layout.configuration;
  if (isDonutFilterPrintDesignId(settings.printDesign.id)) {
    const model = createDonutFilterModel(layout);
    return Math.max(
      model.filter.length + donutAdapterTotalHeight(model) + donutCapTotalHeight(model),
      model.filter.outerDiameter,
      model.fanSize,
    );
  }
  return Math.max(
    settings.filter.width,
    layout.summary.workingDepth,
    layout.summary.chamberHeight,
  );
}

// The tempest arrangements differ wildly in shape (a flat sandwich vs a tall
// four-filter tower), so framing must follow the real derived box — the laser
// summary fields underestimate the tower and the camera ends up zoomed in.
//
// The largest single dimension is nearly identical across arrangements
// (~635 mm at defaults), but the tower is bulky on EVERY axis (568x568x637 vs
// the sandwiches' flat 634x507x~200), so equal framing puts the camera far too
// close on the tower. Pad it by the bounding-sphere ratio between the shapes.
const towerPreviewFramingMultiplier = 1.25;

function tempestFramingDimensionMillimeters(layout: LayoutResult): number {
  const settings = createTempestSettingsFromLayout(layout);
  const box = createTempestModel(settings).box;
  const largestDimension = Math.max(box.width, box.depth, box.height);
  switch (settings.arrangement.type) {
    case "single-horizontal-top-filter":
    case "dual-horizontal-sandwich":
      return largestDimension;
    case "four-side-filter-tower":
      return largestDimension * towerPreviewFramingMultiplier;
    default:
      return assertNever(settings.arrangement);
  }
}


// The scale reference (banana) sits beside the model and is small relative to
// it, so toggling it on must NOT change the camera framing — the view scale is
// derived from the model alone.
function modelViewScale(layout: LayoutResult): number {
  const settings = layout.configuration;
  if (isStaticReferencePrintDesignId(settings.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(settings.printDesign);
    if (reference !== undefined && staticPrintReferenceHasAssembledPreview(reference)) {
      return (reference.previewMaxDimensionMm ?? 540) * sceneScale * 1.35;
    }
    const assetCount = reference?.previewAssets.length ?? 1;
    const columns = Math.max(1, Math.ceil(Math.sqrt(assetCount * 0.8)));
    const rows = Math.max(1, Math.ceil(assetCount / columns));
    const gridSpan = Math.max(columns, rows);
    return (
      (reference?.previewMaxDimensionMm ?? 560) * Math.max(1.35, gridSpan * 0.55) * staticReferenceSceneScale
    );
  }
  if (isDonutFilterPrintDesignId(settings.printDesign.id)) {
    const model = createDonutFilterModel(layout);
    const baseScale =
      Math.max(
        model.filter.length + donutAdapterTotalHeight(model) + donutCapTotalHeight(model),
        model.filter.outerDiameter,
        model.fanSize,
      ) *
      sceneScale *
      1.25;
    return baseScale;
  }
  if (isTempestPrintDesignId(settings.printDesign.id)) {
    return tempestFramingDimensionMillimeters(layout) * sceneScale;
  }
  return (
    Math.max(
      settings.filter.width,
      layout.summary.workingDepth,
      layout.summary.chamberHeight,
    ) * sceneScale
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function previewInteriorShiftForBounds(bounds: Box3, plane: PreviewInteriorPlane): number {
  const target = plane.coordinate + plane.insideSign * plane.inset;
  const outsideEdge = vectorAxisValue(plane.insideSign > 0 ? bounds.min : bounds.max, plane.axis);
  const shift = target - outsideEdge;
  return plane.insideSign > 0 ? Math.max(0, shift) : Math.min(0, shift);
}

export function dominantVectorAxis(vector: Vector3): FanAxis {
  const x = Math.abs(vector.x);
  const y = Math.abs(vector.y);
  const z = Math.abs(vector.z);
  if (x >= y && x >= z) {
    return "x";
  }
  if (y >= z) {
    return "y";
  }
  return "z";
}

export function vectorAxisValue(vector: Vector3, axis: FanAxis): number {
  if (axis === "x") {
    return vector.x;
  }
  if (axis === "y") {
    return vector.y;
  }
  return vector.z;
}
