import {
  BufferGeometry,
  CircleGeometry,
  EdgesGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Material,
  Mesh,
  Path,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import type { FanAppearance } from "@/domain/purifier/fans";
import type { AssemblyPanelPart } from "@/fabrication/assemblyModel";
import type { CutFeature, CutPanel, RectCut } from "@/fabrication/laser/cutGeometry";
import type { PrintableMesh, PrintableSheetPlan, PrintableTileSource } from "@/fabrication/printing/printableKit";
import {
  printableMeshToBufferGeometry,
  type PrintableMeshShading,
} from "@/rendering/three/printableMeshGeometry";
import { CREASE_ANGLE_RADIANS, activeAppearance } from "@/rendering/three/preview/appearance";
import { createFan } from "@/rendering/three/preview/fanModels";
import { toScenePosition } from "@/rendering/three/preview/sceneMath";
import {
  fanPreviewFrontDepth,
  fanPreviewRearDepth,
  panelCutOverlayLift,
  panelPrintSeamOverlayLift,
  sceneScale,
  type PanelPrintSeam,
} from "@/rendering/three/preview/previewData";

// #######################################
// Generated Panel Meshes
// #######################################

// Scene meshes for generated parts: extruded laser-cut panels with their cut
// marks, print-seam overlays, and fans, plus the printable-mesh-to-geometry
// preview groups and their contour edge overlays.

export function createPreviewEdges(geometry: BufferGeometry, material: Material, name?: string): LineSegments {
  const edges = new LineSegments(new EdgesGeometry(geometry), material);
  if (name !== undefined) {
    edges.name = name;
  }
  edges.renderOrder = 4;
  return edges;
}

function createPreviewContourEdges(geometry: BufferGeometry, material: Material, name?: string): LineSegments {
  const edges = new LineSegments(createPrintableMeshContourEdgeGeometry(geometry), material);
  if (name !== undefined) {
    edges.name = name;
  }
  edges.renderOrder = 4;
  return edges;
}

export function createPrintableMeshContourEdgeGeometry(source: BufferGeometry): BufferGeometry {
  source.computeBoundingBox();
  const bounds = source.boundingBox;
  if (bounds === null || bounds.isEmpty()) {
    return new BufferGeometry();
  }

  const { min, max } = bounds;
  const corners = [
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(max.x, max.y, max.z),
    new Vector3(min.x, max.y, max.z),
  ] as const;
  const edges = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ] as const;
  const positions: number[] = [];
  for (const [start, end] of edges) {
    positions.push(corners[start].x, corners[start].y, corners[start].z);
    positions.push(corners[end].x, corners[end].y, corners[end].z);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

function panelInteriorFanCenterZ(part: AssemblyPanelPart, materialThickness: number): number {
  const [rx, ry, rz] = part.rotation;
  const localPositiveNormal = new Vector3(0, 0, 1).applyEuler(new Euler(rx, ry, rz));
  const assembledPosition = new Vector3(part.position[0], part.position[1], part.position[2]);
  const localPositiveNormalPointsOutward = localPositiveNormal.dot(assembledPosition) > 0;
  const panelHalfThickness = (materialThickness * sceneScale) / 2;
  return localPositiveNormalPointsOutward
    ? -(panelHalfThickness + fanPreviewRearDepth)
    : panelHalfThickness + fanPreviewFrontDepth;
}

export function createPanelGroup(
  part: AssemblyPanelPart,
  materialThickness: number,
  showFans: boolean,
  fanAppearance: FanAppearance,
  exploded: boolean,
  material: Material,
  edgeMaterial: Material,
  cutMarkMaterial: Material,
  screwMarkMaterial: Material,
  printSeams: readonly PanelPrintSeam[],
  printSeamMaterial: Material,
): Group {
  const panel = part.panel;
  const group = new Group();
  const geometry = createPanelGeometry(panel, materialThickness);
  const mesh = new Mesh(geometry, material);
  mesh.name = panel.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = createPreviewEdges(geometry, edgeMaterial);
  group.add(edges);

  group.add(createPanelCutMarkGroup(panel, materialThickness, cutMarkMaterial, screwMarkMaterial));
  if (printSeams.length > 0) {
    group.add(createPanelPrintSeamGroup(panel, materialThickness, printSeams, printSeamMaterial));
  }

  if (showFans) {
    const fanCenterZ = panelInteriorFanCenterZ(part, materialThickness);
    for (const cut of panel.cuts) {
      if (cut.type === "circle" && cut.role === "fan") {
        group.add(
          createFan({
            axis: "z",
            position: new Vector3(
              (cut.cx - panel.assemblyCenter.x) * sceneScale,
              (cut.cy - panel.assemblyCenter.y) * sceneScale,
              fanCenterZ,
            ),
            radius: cut.radius * sceneScale,
            facing: "axis-positive",
            appearance: fanAppearance,
          }),
        );
      }
    }
  }

  const [rx, ry, rz] = part.rotation;
  group.position.copy(toScenePosition(part.position, part.explodeDirection, exploded));
  group.rotation.set(rx, ry, rz);

  return group;
}

export function createPanelPrintSeams(plan: PrintableSheetPlan | null): Map<string, readonly PanelPrintSeam[]> {
  const seamMap = new Map<string, PanelPrintSeam[]>();
  if (plan === null) {
    return seamMap;
  }

  const seen = new Set<string>();
  for (const sheet of plan.sheets) {
    for (const placement of sheet.placements) {
      const source = placement.part.sourceTile;
      if (source === undefined) {
        continue;
      }
      for (const seam of seamsForTile(source)) {
        const key = `${source.panelId}:${seam.orientation}:${seam.offset.toFixed(4)}:${seam.start.toFixed(4)}:${seam.end.toFixed(4)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const panelSeams = seamMap.get(source.panelId) ?? [];
        panelSeams.push(seam);
        seamMap.set(source.panelId, panelSeams);
      }
    }
  }
  return seamMap;
}

function seamsForTile(tile: PrintableTileSource): readonly PanelPrintSeam[] {
  const seams: PanelPrintSeam[] = [];
  if (tile.columnIndex < tile.columnCount - 1) {
    seams.push({
      orientation: "vertical",
      offset: tile.x1,
      start: tile.y0,
      end: tile.y1,
    });
  }
  if (tile.rowIndex < tile.rowCount - 1) {
    seams.push({
      orientation: "horizontal",
      offset: tile.y1,
      start: tile.x0,
      end: tile.x1,
    });
  }
  return seams;
}

function createPanelPrintSeamGroup(
  panel: CutPanel,
  materialThickness: number,
  printSeams: readonly PanelPrintSeam[],
  material: Material,
): LineSegments {
  const positions: number[] = [];
  const z = Math.max(materialThickness * sceneScale, 0.012) / 2 + panelPrintSeamOverlayLift;

  for (const seam of printSeams) {
    if (seam.orientation === "vertical") {
      positions.push(
        (seam.offset - panel.assemblyCenter.x) * sceneScale,
        (seam.start - panel.assemblyCenter.y) * sceneScale,
        z,
        (seam.offset - panel.assemblyCenter.x) * sceneScale,
        (seam.end - panel.assemblyCenter.y) * sceneScale,
        z,
      );
    } else {
      positions.push(
        (seam.start - panel.assemblyCenter.x) * sceneScale,
        (seam.offset - panel.assemblyCenter.y) * sceneScale,
        z,
        (seam.end - panel.assemblyCenter.x) * sceneScale,
        (seam.offset - panel.assemblyCenter.y) * sceneScale,
        z,
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geometry, material);
}

function createPanelGeometry(panel: CutPanel, materialThickness: number): ExtrudeGeometry {
  const shape = new Shape();
  panel.outline.forEach((point, index) => {
    const x = (point.x - panel.assemblyCenter.x) * sceneScale;
    const y = (point.y - panel.assemblyCenter.y) * sceneScale;
    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  });
  shape.closePath();

  for (const cut of panel.cuts) {
    const hole = createHolePath(cut, panel);
    if (hole !== null) {
      shape.holes.push(hole);
    }
  }

  const depth = Math.max(materialThickness * sceneScale, 0.012);
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 24,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function createPanelCutMarkGroup(
  panel: CutPanel,
  materialThickness: number,
  cutMarkMaterial: Material,
  screwMarkMaterial: Material,
): Group {
  const group = new Group();
  const z = Math.max(materialThickness * sceneScale, 0.012) / 2 + panelCutOverlayLift;

  for (const cut of panel.cuts) {
    if (cut.type === "rect" && (cut.role === "finger-hole" || cut.role === "slot")) {
      const mark = new Mesh(createRectFaceGeometry(cut, panel), cutMarkMaterial);
      mark.position.z = z;
      group.add(mark);
    } else if (cut.type === "circle" && cut.role === "screw") {
      const mark = new Mesh(new CircleGeometry(cut.radius * sceneScale, 20), screwMarkMaterial);
      mark.position.set((cut.cx - panel.assemblyCenter.x) * sceneScale, (cut.cy - panel.assemblyCenter.y) * sceneScale, z);
      group.add(mark);
    }
  }

  return group;
}

function createRectFaceGeometry(cut: RectCut, panel: CutPanel): ShapeGeometry {
  const left = (cut.x - panel.assemblyCenter.x) * sceneScale;
  const right = (cut.x + cut.width - panel.assemblyCenter.x) * sceneScale;
  const top = (cut.y - panel.assemblyCenter.y) * sceneScale;
  const bottom = (cut.y + cut.height - panel.assemblyCenter.y) * sceneScale;
  const shape = new Shape();
  shape.moveTo(left, top);
  shape.lineTo(left, bottom);
  shape.lineTo(right, bottom);
  shape.lineTo(right, top);
  shape.closePath();
  return new ShapeGeometry(shape);
}

function createHolePath(cut: CutFeature, panel: CutPanel): Path | null {
  if (cut.type === "circle") {
    const path = new Path();
    path.absellipse(
      (cut.cx - panel.assemblyCenter.x) * sceneScale,
      (cut.cy - panel.assemblyCenter.y) * sceneScale,
      cut.radius * sceneScale,
      cut.radius * sceneScale,
      0,
      Math.PI * 2,
      true,
    );
    return path;
  }

  return createRectHolePath(cut, panel);
}

function createRectHolePath(cut: RectCut, panel: CutPanel): Path | null {
  if (cut.width <= 0 || cut.height <= 0) {
    return null;
  }

  const left = (cut.x - panel.assemblyCenter.x) * sceneScale;
  const right = (cut.x + cut.width - panel.assemblyCenter.x) * sceneScale;
  const top = (cut.y - panel.assemblyCenter.y) * sceneScale;
  const bottom = (cut.y + cut.height - panel.assemblyCenter.y) * sceneScale;
  const radius = Math.min(cut.radius * sceneScale, Math.abs(right - left) / 2, Math.abs(bottom - top) / 2);
  const path = new Path();

  if (radius <= 0) {
    path.moveTo(left, top);
    path.lineTo(left, bottom);
    path.lineTo(right, bottom);
    path.lineTo(right, top);
    path.closePath();
    return path;
  }

  path.moveTo(left + radius, top);
  path.lineTo(right - radius, top);
  path.quadraticCurveTo(right, top, right, top + radius);
  path.lineTo(right, bottom - radius);
  path.quadraticCurveTo(right, bottom, right - radius, bottom);
  path.lineTo(left + radius, bottom);
  path.quadraticCurveTo(left, bottom, left, bottom - radius);
  path.lineTo(left, top + radius);
  path.quadraticCurveTo(left, top, left + radius, top);
  path.closePath();
  return path;
}

function createPrintableMeshGeometry(mesh: PrintableMesh): BufferGeometry {
  // Grills and rounded corners read smooth while box edges stay crisp; the flat
  // preset keeps averaged normals (its material's flatShading ignores them anyway).
  const shading: PrintableMeshShading =
    activeAppearance().normals === "creased"
      ? { type: "creased", creaseAngleRadians: CREASE_ANGLE_RADIANS }
      : { type: "averaged" };
  return printableMeshToBufferGeometry(mesh, { scale: sceneScale, offset: [0, 0, 0] }, shading);
}

export function createPrintableMeshPreviewGroup(
  mesh: PrintableMesh,
  material: Material,
  edgeMaterial: Material,
  name: string,
  showPreviewEdges: boolean,
): Group {
  const geometry = createPrintableMeshGeometry(mesh);
  const group = new Group();
  group.name = `${name}-group`;

  const body = new Mesh(geometry, material);
  body.name = name;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  if (showPreviewEdges) {
    const edges = createPreviewContourEdges(geometry, edgeMaterial, `${name}-edges`);
    group.add(edges);
  }

  return group;
}
