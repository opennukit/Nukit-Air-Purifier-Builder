import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Object3D,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import {
  formatDimension,
  type AssemblyLineCue,
  type DimensionGuide,
  type DimensionMeasurement,
} from "@/fabrication/assemblyModel";
import { clamp, toSceneOffset, toScenePosition } from "@/rendering/three/preview/sceneMath";
import {
  dimensionLabelHoverScale,
  dimensionLabelNormalScale,
  dimensionLabelOffsetMultiplier,
  sceneScale,
} from "@/rendering/three/preview/previewData";

// #######################################
// Assembly Cues and Dimensions
// #######################################

// Seam-line cues plus the hoverable dimension guides: lines, ticks, sprite
// labels, and the dimension-id tagging that drives raycast hover state.

export function createSeamGroup(seams: readonly AssemblyLineCue[], material: Material): Group {
  const group = new Group();
  for (const seam of seams) {
    const geometry = new BufferGeometry().setFromPoints([
      toScenePosition(seam.from, [0, 0, 0], false),
      toScenePosition(seam.to, [0, 0, 0], false),
    ]);
    const line = new Line(geometry, material);
    line.name = seam.id;
    group.add(line);
  }
  return group;
}

export function createDimensionGroup(dimensions: readonly DimensionGuide[]): Group {
  const group = new Group();
  for (const guide of dimensions) {
    group.add(
      createSceneDimensionGuide({
        label: guide.label,
        from: toScenePosition(guide.from, [0, 0, 0], false),
        to: toScenePosition(guide.to, [0, 0, 0], false),
        labelOffset: toSceneOffset(guide.labelOffset),
        measurement: guide.measurement,
      }),
    );
  }
  return group;
}

export function createStaticReferenceDimensionGroup(bounds: Box3): Group {
  const size = bounds.getSize(new Vector3());
  const padding = Math.max(28 * sceneScale, Math.max(size.x, size.y, size.z) * 0.045);
  const group = new Group();
  group.add(
    createSceneDimensionGuide({
      label: "W",
      from: new Vector3(bounds.min.x, bounds.min.y, bounds.max.z + padding),
      to: new Vector3(bounds.max.x, bounds.min.y, bounds.max.z + padding),
      labelOffset: new Vector3(0, -padding * 0.65, padding * 0.35),
      measurement: {
        value: size.x / sceneScale,
        description: "outside width",
      },
    }),
  );
  group.add(
    createSceneDimensionGuide({
      label: "H",
      from: new Vector3(bounds.max.x + padding, bounds.min.y, bounds.max.z + padding * 0.2),
      to: new Vector3(bounds.max.x + padding, bounds.max.y, bounds.max.z + padding * 0.2),
      labelOffset: new Vector3(padding * 0.85, 0, padding * 0.18),
      measurement: {
        value: size.y / sceneScale,
        description: "outside height",
      },
      extensionLines: [
        [
          new Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
          new Vector3(bounds.max.x + padding, bounds.min.y, bounds.max.z + padding * 0.2),
        ],
        [
          new Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
          new Vector3(bounds.max.x + padding, bounds.max.y, bounds.max.z + padding * 0.2),
        ],
      ],
    }),
  );
  group.add(
    createSceneDimensionGuide({
      label: "D",
      from: new Vector3(bounds.min.x - padding, bounds.min.y, bounds.min.z),
      to: new Vector3(bounds.min.x - padding, bounds.min.y, bounds.max.z),
      labelOffset: new Vector3(-padding * 0.85, -padding * 0.65, 0),
      measurement: {
        value: size.z / sceneScale,
        description: "outside depth",
      },
    }),
  );
  return group;
}

export function boundsInModelGroupSpace(worldBounds: Box3, modelGroup: Group): Box3 {
  const localBounds = worldBounds.clone();
  localBounds.min.sub(modelGroup.position);
  localBounds.max.sub(modelGroup.position);
  return localBounds;
}

function createSceneDimensionGuide(input: {
  readonly label: string;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly labelOffset: Vector3;
  readonly measurement: DimensionMeasurement;
  readonly extensionLines?: readonly [Vector3, Vector3][];
}): Group {
  const dimensionId = `dimension-${input.label}`;
  const guideGroup = new Group();
  for (const extensionLine of input.extensionLines ?? []) {
    guideGroup.add(createDimensionLine(extensionLine, dimensionId));
  }
  guideGroup.add(createDimensionLine([input.from, input.to], dimensionId));
  for (const tick of createDimensionTicks(input.from, input.to)) {
    guideGroup.add(createDimensionLine(tick, dimensionId));
  }

  const dimensionMidpoint = input.from.clone().lerp(input.to, 0.5);
  const labelPosition = dimensionMidpoint.clone().add(input.labelOffset.clone().multiplyScalar(dimensionLabelOffsetMultiplier));
  if (input.labelOffset.lengthSq() > 0.000001) {
    guideGroup.add(createDimensionLine([closestPointOnSegment(input.from, input.to, labelPosition), labelPosition], dimensionId));
  }

  const label = createTextSprite(input.label, input.measurement);
  markDimensionObject(label, dimensionId);
  label.position.copy(labelPosition);
  guideGroup.add(label);
  return guideGroup;
}

function closestPointOnSegment(from: Vector3, to: Vector3, point: Vector3): Vector3 {
  const segment = to.clone().sub(from);
  const segmentLengthSquared = segment.lengthSq();
  if (segmentLengthSquared === 0) {
    return from.clone();
  }
  const t = clamp(point.clone().sub(from).dot(segment) / segmentLengthSquared, 0, 1);
  return from.clone().addScaledVector(segment, t);
}

function createDimensionLine(points: [Vector3, Vector3], dimensionId: string): Line {
  const geometry = new BufferGeometry().setFromPoints(points);
  const line = new Line(geometry, createDimensionLineMaterial());
  line.renderOrder = 12;
  markDimensionObject(line, dimensionId);
  return line;
}

function createDimensionLineMaterial(): LineBasicMaterial {
  return new LineBasicMaterial({
    color: 0x164d3d,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
}

function createDimensionTicks(from: Vector3, to: Vector3): Array<[Vector3, Vector3]> {
  const direction = to.clone().sub(from).normalize();
  const reference = Math.abs(direction.dot(new Vector3(0, 1, 0))) > 0.82 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const tickDirection = new Vector3().crossVectors(direction, reference).normalize();
  const tickLength = 0.085;
  return [from, to].map((point) => [
    point.clone().addScaledVector(tickDirection, -tickLength),
    point.clone().addScaledVector(tickDirection, tickLength),
  ]);
}

function createTextSprite(label: string, measurement: DimensionMeasurement): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 704;
  canvas.height = 188;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createTextSprite: Could not create canvas context");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 253, 246, 0.96)";
  context.fillRect(10, 10, 684, 168);
  context.strokeStyle = "rgba(31, 111, 86, 0.72)";
  context.lineWidth = 6;
  context.strokeRect(10, 10, 684, 168);
  context.fillStyle = "#164d3d";
  context.font = "900 104px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 88, 94);
  context.textAlign = "left";
  context.fillStyle = "#111817";
  context.font = "900 66px Inter, Arial, sans-serif";
  context.fillText(formatDimension(measurement.value), 156, 78);
  context.fillStyle = "#667169";
  context.font = "800 40px Inter, Arial, sans-serif";
  context.fillText(measurement.description, 156, 128);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.renderOrder = 13;
  sprite.scale.copy(dimensionLabelNormalScale);
  return sprite;
}

export function collectDimensionTargets(root: Object3D): Object3D[] {
  const targets: Object3D[] = [];
  root.traverse((child) => {
    if (readDimensionId(child) !== null) {
      targets.push(child);
    }
  });
  return targets;
}

export function readDimensionId(object: Object3D | null): string | null {
  const dimensionId = object?.userData.dimensionId;
  return typeof dimensionId === "string" ? dimensionId : null;
}

function markDimensionObject<T extends Object3D>(object: T, dimensionId: string): T {
  object.userData.dimensionId = dimensionId;
  return object;
}

export function applyDimensionHover(root: Object3D, hoveredDimensionId: string | null): void {
  root.traverse((child) => {
    const dimensionId = readDimensionId(child);
    if (dimensionId === null) {
      return;
    }
    const isHovered = hoveredDimensionId === dimensionId;
    if (child instanceof Line) {
      setDimensionLineState(child, isHovered);
    }
    if (child instanceof Sprite) {
      setDimensionLabelState(child, isHovered);
    }
  });
}

function setDimensionLineState(line: Line, isHovered: boolean): void {
  if (line.material instanceof LineBasicMaterial) {
    line.material.color.setHex(isHovered ? 0x0b8f68 : 0x164d3d);
    line.material.opacity = isHovered ? 1 : 0.92;
    line.material.needsUpdate = true;
  }
  line.renderOrder = isHovered ? 22 : 12;
}

function setDimensionLabelState(sprite: Sprite, isHovered: boolean): void {
  if (sprite.material instanceof SpriteMaterial) {
    sprite.material.opacity = isHovered ? 1 : 0.95;
    sprite.material.needsUpdate = true;
  }
  sprite.scale.copy(isHovered ? dimensionLabelHoverScale : dimensionLabelNormalScale);
  sprite.renderOrder = isHovered ? 23 : 13;
}

