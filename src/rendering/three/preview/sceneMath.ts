import { Box3, Group, Vector3 } from "three";
import type { CameraPreset } from "@/domain/purifier/settingsModel";
import {
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  staticPrintReferenceForPreset,
} from "@/domain/purifier/designPresets";
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
  oneMeterCubeSize,
  sceneScale,
  staticReferencePreviewZoom,
  staticReferenceSceneScale,
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

export function explodeGeneratedPreviewChildrenFromCenter(group: Group, exploded: boolean): void {
  if (!exploded || group.children.length === 0) {
    return;
  }

  const modelBounds = new Box3().setFromObject(group);
  if (modelBounds.isEmpty()) {
    return;
  }

  const modelCenter = modelBounds.getCenter(new Vector3());
  const totalChildren = group.children.length;
  group.children.forEach((child, index) => {
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


function modelViewScale(layout: LayoutResult): number {
  const settings = layout.configuration;
  const scalePadding = settings.preview.enclosure.showBananaScale ? oneMeterCubeSize * 0.72 : 0;
  if (isStaticReferencePrintDesignId(settings.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(settings.printDesign);
    if (reference !== undefined && staticPrintReferenceHasAssembledPreview(reference)) {
      return (reference.previewMaxDimensionMm ?? 540) * sceneScale * 1.35 + scalePadding;
    }
    const assetCount = reference?.previewAssets.length ?? 1;
    const columns = Math.max(1, Math.ceil(Math.sqrt(assetCount * 0.8)));
    const rows = Math.max(1, Math.ceil(assetCount / columns));
    const gridSpan = Math.max(columns, rows);
    return (
      (reference?.previewMaxDimensionMm ?? 560) *
        Math.max(1.35, gridSpan * 0.55) *
        staticReferenceSceneScale +
      scalePadding
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
    return baseScale + scalePadding;
  }
  return (
    Math.max(
      settings.filter.width,
      layout.summary.workingDepth,
      layout.summary.chamberHeight,
    ) * sceneScale
  ) + scalePadding;
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
