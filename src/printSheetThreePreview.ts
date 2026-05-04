import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PrintSheet, PrintSheetPlacement, PrintableSheetPlan } from "./printSheetPreview";

const printPreviewScale = 1 / 260;
const sheetGapMillimeters = 64;
const bedThickness = 0.012;
const panelColor = 0xd1a166;
const glueKeyColor = 0x7f997d;
const oversizedColor = 0xd78872;
const edgeColor = 0x604322;

type PrintPreviewMaterials = {
  readonly panel: MeshStandardMaterial;
  readonly glueKey: MeshStandardMaterial;
  readonly oversized: MeshStandardMaterial;
  readonly edge: LineBasicMaterial;
};

export class PrintSheetThreePreview {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(36, 1, 0.01, 100);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly sheetGroup = new Group();
  private readonly resizeObserver: ResizeObserver;
  private animationId: number | null = null;
  private latestPlan: PrintableSheetPlan | null = null;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.container.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.autoRotate = false;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 9;

    this.scene.add(this.sheetGroup);
    this.scene.add(new HemisphereLight(0xfff7e8, 0x7f897a, 2.4));
    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4, 2.5);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  update(plan: PrintableSheetPlan): void {
    this.latestPlan = plan;
    this.rebuildSheets(plan);
    this.frameSheets();
  }

  destroy(): void {
    if (this.animationId !== null) {
      window.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeObject(this.sheetGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private rebuildSheets(plan: PrintableSheetPlan): void {
    this.disposeObject(this.sheetGroup);
    this.sheetGroup.clear();

    const materials = createPrintPreviewMaterials();
    const columns = Math.max(1, Math.ceil(Math.sqrt(plan.sheets.length)));
    plan.sheets.forEach((sheet, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const sheetOrigin = new Vector3(
        column * (sheet.width + sheetGapMillimeters) * printPreviewScale,
        0,
        row * (sheet.depth + sheetGapMillimeters) * printPreviewScale,
      );
      this.sheetGroup.add(createSheetGroup(sheet, sheetOrigin, materials));
    });

    const outline = new Box3().setFromObject(this.sheetGroup);
    const center = outline.getCenter(new Vector3());
    this.sheetGroup.position.sub(center);
  }

  private frameSheets(): void {
    const outline = new Box3().setFromObject(this.sheetGroup);
    if (outline.isEmpty()) {
      this.camera.position.set(1.8, 1.5, 2.2);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
      return;
    }

    const center = outline.getCenter(new Vector3());
    const size = outline.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    this.camera.position.copy(center).add(new Vector3(maxDimension * 0.92, maxDimension * 0.82, maxDimension * 1.08));
    this.camera.near = 0.01;
    this.camera.far = Math.max(100, maxDimension * 12);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.latestPlan !== null) {
      this.frameSheets();
    }
  }

  private animate = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationId = window.requestAnimationFrame(this.animate);
  };

  private disposeObject(object: Object3D): void {
    const seenMaterials = new Set<Material>();
    object.traverse((child) => {
      if (child instanceof Mesh || child instanceof LineSegments) {
        child.geometry.dispose();
        disposeMaterial(child.material, seenMaterials);
      }
    });
  }
}

function createSheetGroup(sheet: PrintSheet, sheetOrigin: Vector3, materials: PrintPreviewMaterials): Group {
  const group = new Group();
  group.position.copy(sheetOrigin);

  const bed = new Mesh(
    new BoxGeometry(sheet.width * printPreviewScale, bedThickness, sheet.depth * printPreviewScale),
    new MeshBasicMaterial({ color: 0xfbfaf6, transparent: true, opacity: 0.72 }),
  );
  bed.position.set((sheet.width * printPreviewScale) / 2, 0, (sheet.depth * printPreviewScale) / 2);
  group.add(bed);

  group.add(createBedGrid(sheet));

  for (const placement of sheet.placements) {
    group.add(createPlacementMesh(placement, materials));
  }

  return group;
}

function createBedGrid(sheet: PrintSheet): LineSegments {
  const spacing = 32;
  const positions: number[] = [];
  for (let x = 0; x <= sheet.width + 0.001; x += spacing) {
    positions.push(x * printPreviewScale, bedThickness / 2 + 0.001, 0);
    positions.push(x * printPreviewScale, bedThickness / 2 + 0.001, sheet.depth * printPreviewScale);
  }
  for (let y = 0; y <= sheet.depth + 0.001; y += spacing) {
    positions.push(0, bedThickness / 2 + 0.001, y * printPreviewScale);
    positions.push(sheet.width * printPreviewScale, bedThickness / 2 + 0.001, y * printPreviewScale);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geometry, new LineBasicMaterial({ color: 0xd0c7b7, transparent: true, opacity: 0.58 }));
}

function createPlacementMesh(placement: PrintSheetPlacement, materials: PrintPreviewMaterials): Group {
  const group = new Group();
  const geometry = createPrintablePartGeometry(placement);
  const mesh = new Mesh(geometry, partMaterial(placement, materials));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new LineSegments(new EdgesGeometry(geometry), materials.edge);
  group.add(edges);
  return group;
}

function createPrintablePartGeometry(placement: PrintSheetPlacement): BufferGeometry {
  const positions: number[] = [];
  for (const vertex of placement.part.mesh.vertices) {
    positions.push(
      (placement.x + vertex.x) * printPreviewScale,
      bedThickness / 2 + vertex.z * printPreviewScale,
      (placement.y + vertex.y) * printPreviewScale,
    );
  }

  const indices: number[] = [];
  for (const triangle of placement.part.mesh.triangles) {
    indices.push(triangle.v1, triangle.v2, triangle.v3);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPrintPreviewMaterials(): PrintPreviewMaterials {
  return {
    panel: new MeshStandardMaterial({
      color: panelColor,
      map: createPrintWoodTexture(),
      roughness: 0.68,
      metalness: 0.02,
    }),
    glueKey: new MeshStandardMaterial({
      color: glueKeyColor,
      roughness: 0.62,
      metalness: 0.02,
    }),
    oversized: new MeshStandardMaterial({
      color: oversizedColor,
      roughness: 0.62,
      metalness: 0.02,
    }),
    edge: new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.62 }),
  };
}

function partMaterial(placement: PrintSheetPlacement, materials: PrintPreviewMaterials): MeshStandardMaterial {
  if (!placement.fits) {
    return materials.oversized;
  }
  return placement.part.kind === "dovetail-glue-key" ? materials.glueKey : materials.panel;
}

function createPrintWoodTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createPrintWoodTexture: Could not create canvas context");
  }

  context.fillStyle = "#d1a166";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 5) {
    context.strokeStyle = `rgba(72, 44, 20, ${y % 20 === 0 ? 0.16 : 0.07})`;
    context.beginPath();
    context.moveTo(0, y + Math.sin(y * 0.21) * 1.6);
    context.lineTo(canvas.width, y + Math.cos(y * 0.16) * 1.2);
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function disposeMaterial(material: Material | Material[], seenMaterials: Set<Material>): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      disposeSingleMaterial(entry, seenMaterials);
    }
    return;
  }
  disposeSingleMaterial(material, seenMaterials);
}

function disposeSingleMaterial(material: Material, seenMaterials: Set<Material>): void {
  if (seenMaterials.has(material)) {
    return;
  }
  seenMaterials.add(material);
  if (material instanceof MeshBasicMaterial || material instanceof MeshStandardMaterial) {
    material.map?.dispose();
  }
  material.dispose();
}
