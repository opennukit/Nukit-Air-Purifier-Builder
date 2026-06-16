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
  Vector3,
} from "three";
import type { FanAppearance } from "@/domain/purifier/fans";
import type { AssemblyPanelPart } from "@/fabrication/assemblyModel";
import type { CutFeature, CutPanel, RectCut } from "@/fabrication/laser/cutGeometry";
import type { PrintableMesh } from "@/fabrication/printing/printableKit";
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
  sceneScale,
} from "@/rendering/three/preview/previewData";

// #######################################
// Generated Panel Meshes
// #######################################

// Scene meshes for generated parts: extruded laser-cut panels with their cut
// marks and fans, plus the printable-mesh-to-geometry preview groups and
// their contour edge overlays.

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
  screwMarkMaterial: Material,
): Group {
  const panel = part.panel;
  const group = new Group();
  const geometry = createPanelGeometry(panel, materialThickness, exploded);
  const mesh = new Mesh(geometry, material);
  mesh.name = panel.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = createPreviewEdges(geometry, edgeMaterial);
  group.add(edges);

  group.add(createPanelCutMarkGroup(panel, materialThickness, screwMarkMaterial));

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

function createPanelGeometry(panel: CutPanel, materialThickness: number, exploded: boolean): ExtrudeGeometry {
  const shape = new Shape();
  if (exploded) {
    // Exploded view shows how the parts join: extrude the real toothed cut
    // outline (finger combs + dovetails) so the joinery is visible.
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
  } else {
    // Assembled view shows solid rectangular walls so the laser model reads like
    // the 3D-print and assembled-box views (and the reference's assembled model).
    // The interlocking finger teeth live only in the 2D cut sheet here.
    const halfWidth = (panel.nominalWidth / 2) * sceneScale;
    const halfHeight = (panel.nominalHeight / 2) * sceneScale;
    shape.moveTo(-halfWidth, -halfHeight);
    shape.lineTo(halfWidth, -halfHeight);
    shape.lineTo(halfWidth, halfHeight);
    shape.lineTo(-halfWidth, halfHeight);
    shape.closePath();
  }

  for (const cut of panel.cuts) {
    // Finger-hole and slot joinery only belongs on the exploded view (and the
    // cut sheet); the assembled walls keep just the fan/window/screw openings.
    if (!exploded && cut.type === "rect" && (cut.role === "finger-hole" || cut.role === "slot")) {
      continue;
    }
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
  screwMarkMaterial: Material,
): Group {
  const group = new Group();
  const z = Math.max(materialThickness * sceneScale, 0.012) / 2 + panelCutOverlayLift;

  // Clean assembled walls only carry the screw-hole marks; finger-hole and slot
  // joinery is shown on the flat cut sheet, not on the 3D enclosure.
  for (const cut of panel.cuts) {
    if (cut.type === "circle" && cut.role === "screw") {
      const mark = new Mesh(new CircleGeometry(cut.radius * sceneScale, 20), screwMarkMaterial);
      mark.position.set((cut.cx - panel.assemblyCenter.x) * sceneScale, (cut.cy - panel.assemblyCenter.y) * sceneScale, z);
      group.add(mark);
    }
  }

  return group;
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
