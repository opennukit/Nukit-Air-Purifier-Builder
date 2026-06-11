import { BufferGeometry, Vector3 } from "three";
import type { AssemblyBoxPart, MillimeterSize3 } from "@/fabrication/assemblyModel";
import type { LoadedStaticPrintAssembly } from "@/rendering/three/staticPrintAssets";

// #######################################
// Preview Model
// #######################################

// Shared preview model data: fan preview types, camera/seam data, design preview
// metrics, and the scene constants every preview module scales against.

// ##############################
// Fan Preview Data
// ##############################

export type FanAxis = "x" | "y" | "z";

// Which way the fan's front face points along its axis. The procedural fan is
// depth-symmetric so this never showed; the asymmetric CAD silhouette pokes
// through the wall when a fan faces the wrong way (e.g. tempest back vs front).
export type FanFacing = "axis-positive" | "axis-negative";

export type FanPlacement = {
  axis: FanAxis;
  position: Vector3;
  radius: number;
  facing: FanFacing;
};

export type TempestCsgPoint = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type TempestCsgBox = {
  readonly min: TempestCsgPoint;
  readonly size: TempestCsgPoint;
};

export type PreviewInteriorPlane = {
  readonly axis: FanAxis;
  readonly coordinate: number;
  readonly insideSign: -1 | 1;
  readonly inset: number;
};

export type FanCadPreviewAsset = {
  readonly schema: "filterboxbuilder-fan-cad-preview-v1";
  readonly usage: "preview-only-purchased-part-visual";
  readonly unit: "millimeter";
  readonly nominalDiameter: number;
  readonly bounds: {
    readonly center: readonly [number, number, number];
  };
  readonly meshes: readonly FanCadPreviewMesh[];
};

export type FanCadPreviewMesh = {
  readonly name: string;
  readonly color?: readonly [number, number, number];
  readonly position: readonly number[];
  readonly index: readonly number[];
};

export type LoadedFanCadModel = {
  readonly nominalDiameter: number;
  readonly meshes: readonly LoadedFanCadMesh[];
};

export type LoadedFanCadMesh = {
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly color: number;
  readonly isRotor: boolean;
};

// ##############################
// Camera and Seam Data
// ##############################

export type CameraPose = {
  readonly offsetFromTarget: Vector3;
  readonly viewScale: number;
};

export type PanelPrintSeam = {
  readonly orientation: "vertical" | "horizontal";
  readonly offset: number;
  readonly start: number;
  readonly end: number;
};

// ##############################
// Design Preview Metrics
// ##############################

export type StaticReferenceAssembledPreviewPose = {
  readonly meshRotationX: number;
  readonly rotateWholePreview: boolean;
  readonly installedPartLayout: "source-front" | "source-side-fans" | "fan-panel-up";
};

export type StaticReferenceAssemblyMetrics = {
  readonly footprintWidth: number;
  readonly footprintDepth: number;
  readonly height: number;
};

export type StaticReferencePurchasedPartExplosion = {
  readonly exploded: boolean;
  readonly assembly?: LoadedStaticPrintAssembly;
};

export function visualAssemblyBoxSize(part: AssemblyBoxPart): MillimeterSize3 {
  if (part.role !== "filter-media") {
    return part.size;
  }

  const [width, height, depth] = part.size;
  return [
    visualFilterMediaDimension(width),
    visualFilterMediaDimension(height),
    visualFilterMediaDimension(depth),
  ];
}

export function visualFilterMediaDimension(size: number): number {
  return Math.max(1, size - filterMediaPreviewClearanceMillimeters * 2, size * 0.72);
}

export function recessedMillimeterFilterMediaThickness(size: number): number {
  return Math.max(1, size - filterMediaPreviewSurfaceGapMillimeters * 2);
}

// ##############################
// Scene Constants
// ##############################

export const sceneScale = 1 / 260;
export const staticReferenceSceneScale = sceneScale * 0.72;
export const woodColor = 0xc7965a;
export const edgeColor = 0x4f3822;
export const burnColor = 0x2b1a0f;
export const filterColor = 0xeef1e6;
export const groundY = -0.58;
export const homePreviewRotationX = -Math.PI / 2;
export const panelCutOverlayLift = 1.4 * sceneScale;
export const panelPrintSeamOverlayLift = 2.1 * sceneScale;
export const fanPreviewFrontDepth = 0.018;
export const fanPreviewRearDepth = 0.047;
export const fanPreviewRearDepthMillimeters = fanPreviewRearDepth / sceneScale;
export const previewFanWallInset = 0.8 * sceneScale;
export const filterMediaPreviewClearanceMillimeters = 3;
export const filterMediaPreviewSurfaceGapMillimeters = 2;
export const bananaReferenceLength = 180 * sceneScale;
export const bananaReferenceRadius = 14 * sceneScale;
export const oneMeterCubeSize = 1000 * sceneScale;
export const staticReferenceExplodeDistance = 46 * sceneScale;
export const generatedPreviewExplodeDistance = 72 * sceneScale;
// Exploded tempest chunks displace outward by this fraction of their
// center-offset from the posed assembly's center, so every glue seam opens by
// this fraction of the chunk pitch — clear separation while the chunks still
// read as one model.
export const tempestChunkSeamExplodeFraction = 0.5;
export const bananaScaleAssetUrl = "/vendor/scale-reference/banana/banana.glb";
export const dimensionLabelNormalScale = new Vector3(1.37, 0.367, 1);
export const dimensionLabelHoverScale = new Vector3(1.9, 0.51, 1);
export const dimensionLabelOffsetMultiplier = 1.18;
export const dimensionPreviewFramingMultiplier = 1.2;
export const staticReferencePreviewZoom = 1.52;
export const generatedPreviewZoom = 1.5;
export const generatedPreviewZoomReferenceMillimeters = 360;
export const minimumLargeModelPreviewZoom = 0.85;
export const previewControlClearanceTargetOffset = 0.1;
// Local +Y is the exhaust/back side of the fan, which faces outside the purifier.
// Positive Y rotation reads as slow clockwise motion from that outside view.
export const fanRotorAngularVelocity = 0.9;
