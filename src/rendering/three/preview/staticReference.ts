import { Box3, BufferGeometry, Vector3 } from "three";
import { staticPrintReferenceForPreset } from "@/domain/purifier/airPurifier";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import type {
  LoadedStaticPrintAsset,
  LoadedStaticPrintAssembly,
} from "@/rendering/three/staticPrintAssets";
import {
  staticPrintReferenceHasAssembledPreview,
  type StaticPrintPreviewAsset,
  type StaticPrintReference,
} from "@/resources/static-print-references/references";
import {
  sceneScale,
  staticReferenceExplodeDistance,
  type StaticReferenceAssembledPreviewPose,
  type StaticReferencePurchasedPartExplosion,
} from "@/rendering/three/preview/previewData";

// #######################################
// Static Reference Preview
// #######################################

// Pose, explode-offset, and asset-selection math for the static STL reference
// previews, plus disposal of their loaded geometries.

export function disposeLoadedStaticPrintAssets(assets: readonly LoadedStaticPrintAsset[]): void {
  for (const asset of assets) {
    asset.geometry.dispose();
  }
}

export function staticReferenceBoardExplodeOffset(
  geometry: BufferGeometry,
  assembly: LoadedStaticPrintAssembly,
  exploded: boolean,
): Vector3 {
  if (!exploded) {
    return new Vector3(0, 0, 0);
  }

  const bounds = staticReferenceGeometryBounds(geometry);
  const direction = staticReferenceBoardExplodeDirection(bounds, assembly);
  return direction.multiplyScalar(staticReferenceExplodeDistance);
}

function staticReferenceBoardExplodeDirection(bounds: Box3, assembly: LoadedStaticPrintAssembly): Vector3 {
  const center = bounds.getCenter(new Vector3());
  const halfFootprintWidth = assembly.footprintWidth / 2;
  const halfFootprintDepth = assembly.footprintDepth / 2;
  const halfHeight = assembly.height / 2;
  const locationDirection = new Vector3(
    normalizedStaticReferenceDistance(center.x, halfFootprintWidth),
    normalizedStaticReferenceDistance(center.y, halfFootprintDepth),
    normalizedStaticReferenceDistance(center.z - halfHeight, halfHeight),
  );

  if (locationDirection.lengthSq() > 0.01) {
    return locationDirection.normalize();
  }

  const verticalDirection = center.z >= halfHeight ? 1 : -1;
  return new Vector3(0, 0, verticalDirection);
}

function normalizedStaticReferenceDistance(value: number, halfExtent: number): number {
  if (halfExtent <= 0.001) {
    return 0;
  }
  return value / halfExtent;
}

export function staticReferencePurchasedPartPosition(
  position: Vector3,
  explosion: StaticReferencePurchasedPartExplosion,
): Vector3 {
  if (!explosion.exploded || explosion.assembly === undefined) {
    return position;
  }
  return position.add(staticReferenceNearestBoardExplodeOffset(position, explosion.assembly));
}

function staticReferenceNearestBoardExplodeOffset(position: Vector3, assembly: LoadedStaticPrintAssembly): Vector3 {
  const sourcePoint = position.clone().multiplyScalar(1 / sceneScale);
  let nearestOffset = new Vector3(0, 0, 0);
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const asset of assembly.assets) {
    const bounds = staticReferenceGeometryBounds(asset.geometry);
    const distance = squaredDistanceToBox(sourcePoint, bounds);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestOffset = staticReferenceBoardExplodeOffset(asset.geometry, assembly, true);
    }
  }

  return nearestOffset;
}

function squaredDistanceToBox(point: Vector3, bounds: Box3): number {
  const dx = distanceOutsideRange(point.x, bounds.min.x, bounds.max.x);
  const dy = distanceOutsideRange(point.y, bounds.min.y, bounds.max.y);
  const dz = distanceOutsideRange(point.z, bounds.min.z, bounds.max.z);
  return dx * dx + dy * dy + dz * dz;
}

function distanceOutsideRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min - value;
  }
  if (value > max) {
    return value - max;
  }
  return 0;
}

function staticReferenceGeometryBounds(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds === null) {
    return new Box3();
  }
  return bounds.clone();
}

export function staticReferenceAssembledPreviewPose(layout: LayoutResult): StaticReferenceAssembledPreviewPose {
  const orientation = staticPrintReferenceForPreset(layout.configuration.printDesign)?.assembledPreviewOrientation ?? "source";
  if (orientation === "fan-panel-up") {
    return {
      meshRotationX: Math.PI,
      rotateWholePreview: false,
      installedPartLayout: "fan-panel-up",
    };
  }
  if (orientation === "source-fans-up") {
    return {
      meshRotationX: Math.PI / 2,
      rotateWholePreview: true,
      installedPartLayout: "source-side-fans",
    };
  }
  if (orientation === "source-side-fans") {
    return {
      meshRotationX: 0,
      rotateWholePreview: false,
      installedPartLayout: "source-side-fans",
    };
  }
  return {
    meshRotationX: -Math.PI / 2,
    rotateWholePreview: false,
    installedPartLayout: "source-front",
  };
}

export function staticReferencePreviewAssets(reference: StaticPrintReference): readonly StaticPrintPreviewAsset[] {
  if (staticPrintReferenceHasAssembledPreview(reference) && reference.assembledPreview?.type === "single-source-asset") {
    return [reference.assembledPreview.asset];
  }
  if (staticPrintReferenceHasAssembledPreview(reference) && reference.assembledPreview?.type === "source-part-set") {
    return reference.assembledPreview.assets;
  }
  return reference.previewAssets;
}
