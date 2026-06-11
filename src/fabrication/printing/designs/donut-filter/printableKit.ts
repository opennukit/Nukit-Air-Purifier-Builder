import { Path, Shape } from "three";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import { extrudeShapeToMesh } from "@/fabrication/printing/extrudeMesh";
import { roundVertex } from "@/fabrication/printing/meshWelding";
import {
  createDonutFilterModel,
  donutCapTotalHeight,
  type DonutFilterCap,
  type DonutFilterModel,
} from "@/domain/designs/donut-filter/model";
import {
  findPrintVolumePreset,
  partFitsPrintBed,
  type PrintableKit,
  type PrintableMesh,
  type PrintablePart,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

// #######################################
// Donut Printable Model
// #######################################

type Point2 = {
  readonly x: number;
  readonly y: number;
};

type CircleCut = {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
};

// #######################################
// Public Kit API
// #######################################

export function createDonutFilterPrintableKit(layout: LayoutResult, presetId: PrintVolumePresetId): PrintableKit {
  const preset = findPrintVolumePreset(presetId);
  const model = createDonutFilterModel(layout);
  const parts = [
    createAdapterPart(model),
    createFanGuardPart(model),
    ...(model.cap.type === "printed-cap" ? [createCapPart(model, model.cap)] : []),
  ];
  const featureCount = parts.reduce((total, part) => total + part.cutFeatureCount, 0);

  return {
    preset,
    parts,
    summary: {
      partCount: parts.length,
      panelTileCount: parts.filter((part) => part.kind === "panel-tile").length,
      glueKeyCount: 0,
      splitPanelCount: 0,
      oversizedPartCount: parts.filter((part) => !partFitsPrintBed(part, preset.bed)).length,
      sourceCutFeatureCount: featureCount,
      retainedCutFeatureCount: featureCount,
      sourcePrintCriticalCutFeatureCount: featureCount,
      retainedPrintCriticalCutFeatureCount: featureCount,
    },
  };
}

// #######################################
// Printable Parts
// #######################################

function createAdapterPart(model: DonutFilterModel): PrintablePart {
  const height = model.adapter.coneLength + model.adapter.insertLength;
  const mesh = combineMeshes([
    createPlateMesh(model.fanSize, model.fanSize, model.adapter.flangeThickness, adapterFlangeCuts(model)),
    createTubeShellMesh({
      cx: model.fanSize / 2,
      cy: model.fanSize / 2,
      z0: 0,
      z1: model.adapter.coneLength,
      outerRadius0: model.adapter.fanOpeningDiameter / 2,
      outerRadius1: model.adapter.filterHoleDiameter / 2,
      innerRadius0: Math.max(2, model.adapter.fanOpeningDiameter / 2 - model.adapter.wallThickness),
      innerRadius1: Math.max(2, model.adapter.filterHoleDiameter / 2 - model.adapter.wallThickness),
      segments: 96,
    }),
    createTubeShellMesh({
      cx: model.fanSize / 2,
      cy: model.fanSize / 2,
      z0: model.adapter.coneLength,
      z1: height,
      outerRadius0: model.adapter.filterHoleDiameter / 2,
      outerRadius1: model.adapter.filterHoleDiameter / 2,
      innerRadius0: Math.max(2, model.adapter.filterHoleDiameter / 2 - model.adapter.wallThickness),
      innerRadius1: Math.max(2, model.adapter.filterHoleDiameter / 2 - model.adapter.wallThickness),
      segments: 96,
    }),
  ]);

  return {
    id: "donut-filter-fan-adapter",
    name: "Donut filter fan adaptor",
    kind: "donut-filter-adapter",
    sourcePanelId: "donut-filter-adapter",
    width: model.fanSize,
    depth: model.fanSize,
    height,
    cutFeatureCount: 5,
    printCriticalCutFeatureCount: 5,
    mesh,
  };
}

function createFanGuardPart(model: DonutFilterModel): PrintablePart {
  const guard = model.fanGuard;
  const center = guard.outerSize / 2;
  const outerRing = guard.outerSize * 0.44;
  const meshes: PrintableMesh[] = [
    createBoxMesh(guard.outerSize, guard.ringWidth * 1.7, guard.thickness, 0, 0),
    createBoxMesh(guard.outerSize, guard.ringWidth * 1.7, guard.thickness, 0, guard.outerSize - guard.ringWidth * 1.7),
    createBoxMesh(guard.ringWidth * 1.7, guard.outerSize, guard.thickness, 0, 0),
    createBoxMesh(guard.ringWidth * 1.7, guard.outerSize, guard.thickness, guard.outerSize - guard.ringWidth * 1.7, 0),
    createDiskMesh(center, center, guard.outerSize * 0.105, guard.thickness, 48),
  ];

  for (const radius of [0.17, 0.3, 0.43, 0.56, 0.69, 0.82].map((value) => outerRing * value)) {
    meshes.push(createRingMesh(center, center, radius + guard.ringWidth / 2, Math.max(1, radius - guard.ringWidth / 2), guard.thickness, 96));
  }

  for (let index = 0; index < 12; index += 1) {
    meshes.push(createRotatedBarMesh(center, center, outerRing * 2, guard.spokeWidth, guard.thickness, (index / 12) * Math.PI));
  }

  for (const screwCenter of guard.screwCenters) {
    meshes.push(createDiskMesh(screwCenter.x, screwCenter.y, guard.screwBossDiameter / 2, guard.thickness, 32));
  }

  return {
    id: "donut-filter-fan-guard",
    name: "Printed fan guard",
    kind: "donut-fan-guard",
    sourcePanelId: "donut-filter-adapter",
    width: guard.outerSize,
    depth: guard.outerSize,
    height: guard.thickness,
    cutFeatureCount: 0,
    printCriticalCutFeatureCount: 0,
    mesh: combineMeshes(meshes),
  };
}

function createCapPart(model: DonutFilterModel, cap: Extract<DonutFilterCap, { readonly type: "printed-cap" }>): PrintablePart {
  const center = cap.outerDiameter / 2;
  const mesh = combineMeshes([
    createDiskMesh(center, center, cap.outerDiameter / 2, cap.thickness, 96),
    createTubeShellMesh({
      cx: center,
      cy: center,
      z0: cap.thickness,
      z1: donutCapTotalHeight(model),
      outerRadius0: cap.holeDiameter / 2,
      outerRadius1: cap.holeDiameter / 2,
      innerRadius0: Math.max(2, cap.holeDiameter / 2 - model.wallThickness),
      innerRadius1: Math.max(2, cap.holeDiameter / 2 - model.wallThickness),
      segments: 96,
    }),
  ]);

  return {
    id: "donut-filter-blanking-cap",
    name: "Press-fit filter blanking cap",
    kind: "donut-filter-cap",
    sourcePanelId: "donut-filter-cap",
    width: cap.outerDiameter,
    depth: cap.outerDiameter,
    height: donutCapTotalHeight(model),
    cutFeatureCount: 1,
    printCriticalCutFeatureCount: 1,
    mesh,
  };
}

// #######################################
// Cut Geometry
// #######################################

function adapterFlangeCuts(model: DonutFilterModel): readonly CircleCut[] {
  return [
    {
      cx: model.fanSize / 2,
      cy: model.fanSize / 2,
      radius: Math.max(2, model.adapter.fanOpeningDiameter / 2 - model.adapter.wallThickness),
    },
    ...model.adapter.screwCenters.map((center) => ({
      cx: center.x,
      cy: center.y,
      radius: model.screwHoleDiameter / 2,
    })),
  ];
}

// #######################################
// Mesh Generation
// #######################################

function createPlateMesh(width: number, depth: number, height: number, cuts: readonly CircleCut[]): PrintableMesh {
  const shape = createShape([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ]);
  for (const cut of cuts) {
    const path = new Path();
    path.absellipse(cut.cx, cut.cy, cut.radius, cut.radius, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  return extrudeShapeToMesh(shape, height);
}

function createTubeShellMesh(input: {
  readonly cx: number;
  readonly cy: number;
  readonly z0: number;
  readonly z1: number;
  readonly outerRadius0: number;
  readonly outerRadius1: number;
  readonly innerRadius0: number;
  readonly innerRadius1: number;
  readonly segments: number;
}): PrintableMesh {
  const vertices: MeshVertex[] = [];
  const triangles: MeshTriangle[] = [];

  for (let index = 0; index < input.segments; index += 1) {
    const angle = (index / input.segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    vertices.push(
      { x: input.cx + cos * input.outerRadius0, y: input.cy + sin * input.outerRadius0, z: input.z0 },
      { x: input.cx + cos * input.outerRadius1, y: input.cy + sin * input.outerRadius1, z: input.z1 },
      { x: input.cx + cos * input.innerRadius0, y: input.cy + sin * input.innerRadius0, z: input.z0 },
      { x: input.cx + cos * input.innerRadius1, y: input.cy + sin * input.innerRadius1, z: input.z1 },
    );
  }

  for (let index = 0; index < input.segments; index += 1) {
    const next = (index + 1) % input.segments;
    const outer0 = index * 4;
    const outer1 = next * 4;
    const inner0 = index * 4 + 2;
    const inner1 = next * 4 + 2;
    triangles.push(
      { v1: outer0, v2: outer1, v3: outer0 + 1 },
      { v1: outer0 + 1, v2: outer1, v3: outer1 + 1 },
      { v1: inner0, v2: inner0 + 1, v3: inner1 },
      { v1: inner0 + 1, v2: inner1 + 1, v3: inner1 },
      { v1: outer0 + 1, v2: outer1 + 1, v3: inner0 + 1 },
      { v1: inner0 + 1, v2: outer1 + 1, v3: inner1 + 1 },
      { v1: outer0, v2: inner0, v3: outer1 },
      { v1: inner0, v2: inner1, v3: outer1 },
    );
  }

  return { vertices: vertices.map(roundVertex), triangles };
}

function createRingMesh(cx: number, cy: number, outerRadius: number, innerRadius: number, height: number, segments: number): PrintableMesh {
  return createTubeShellMesh({
    cx,
    cy,
    z0: 0,
    z1: height,
    outerRadius0: outerRadius,
    outerRadius1: outerRadius,
    innerRadius0: innerRadius,
    innerRadius1: innerRadius,
    segments,
  });
}

function createDiskMesh(cx: number, cy: number, radius: number, height: number, segments: number): PrintableMesh {
  const shape = new Shape();
  shape.absellipse(cx, cy, radius, radius, 0, Math.PI * 2, false);
  return extrudeShapeToMesh(shape, height, segments);
}

function createBoxMesh(width: number, depth: number, height: number, x: number, y: number): PrintableMesh {
  return createExtrudedPolygonMesh(
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + depth },
      { x, y: y + depth },
    ],
    height,
  );
}

function createRotatedBarMesh(cx: number, cy: number, length: number, width: number, height: number, angle: number): PrintableMesh {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const point = (x: number, y: number): Point2 => ({
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  });
  return createExtrudedPolygonMesh(
    [point(-halfLength, -halfWidth), point(halfLength, -halfWidth), point(halfLength, halfWidth), point(-halfLength, halfWidth)],
    height,
  );
}

function createExtrudedPolygonMesh(points: readonly Point2[], height: number): PrintableMesh {
  return extrudeShapeToMesh(createShape(points), height);
}

function createShape(points: readonly Point2[]): Shape {
  const first = points[0];
  if (first === undefined) {
    throw new Error("createShape: Missing polygon points");
  }
  const shape = new Shape();
  shape.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    shape.lineTo(point.x, point.y);
  }
  shape.closePath();
  return shape;
}

// #######################################
// Mesh Composition
// #######################################

function combineMeshes(meshes: readonly PrintableMesh[]): PrintableMesh {
  const vertices: MeshVertex[] = [];
  const triangles: MeshTriangle[] = [];
  for (const mesh of meshes) {
    const offset = vertices.length;
    vertices.push(...mesh.vertices);
    triangles.push(
      ...mesh.triangles.map((triangle) => ({
        v1: triangle.v1 + offset,
        v2: triangle.v2 + offset,
        v3: triangle.v3 + offset,
      })),
    );
  }
  return { vertices, triangles };
}
