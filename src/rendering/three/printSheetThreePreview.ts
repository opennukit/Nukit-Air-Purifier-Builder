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
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { StaticPrintReference } from "@/resources/static-print-references/references";
import { loadStaticPrintAssets, type LoadedStaticPrintAsset } from "@/rendering/three/staticPrintAssets";
import { printBedFitForDimensions, type PrintBed, type PrintBedFit } from "@/fabrication/printing/printableKit";
import type { PrintSheet, PrintSheetPlacement, PrintableSheetPlan } from "@/fabrication/printing/printableKit";

// #######################################
// Preview Model
// #######################################

// ##############################
// Scene Constants
// ##############################

const printPreviewScale = 1 / 260;
const sheetGapMillimeters = 64;
const staticPartGapMillimeters = 10;
const bedThickness = 0.012;
const bedGridLift = 0.001;
const printPartLift = 0.004;
// Smooth normals within a face but split them at dihedrals >= this, so flat walls
// stay flat and grills/rounded corners read smooth (matches the assembled preview).
const printPartCreaseAngleRadians = (40 * Math.PI) / 180;
const panelColor = 0xd1a166;
const glueKeyColor = 0x7f997d;
const oversizedColor = 0xd78872;
const edgeColor = 0x604322;

// ##############################
// Public Plan Types
// ##############################

type PrintPreviewMaterials = {
  readonly panel: MeshStandardMaterial;
  readonly glueKey: MeshStandardMaterial;
  readonly oversized: MeshStandardMaterial;
  readonly staticPart: MeshStandardMaterial;
  readonly staticFanPart: MeshStandardMaterial;
  readonly edge: LineBasicMaterial;
};

export type StaticPrintSheetPreviewPlan = {
  readonly type: "static-reference";
  readonly reference: StaticPrintReference;
  readonly bed: PrintBed;
  readonly bedLabel: string;
};

export type PrintSheetThreePreviewPlan = PrintableSheetPlan | StaticPrintSheetPreviewPlan;

// ##############################
// Static Reference Packing Types
// ##############################

type StaticPrintSheetPlacement = {
  readonly asset: LoadedStaticPrintAsset;
  readonly x: number;
  readonly y: number;
  readonly fit: PrintBedFit;
};

type StaticPrintSheet = {
  readonly index: number;
  readonly width: number;
  readonly depth: number;
  readonly placements: readonly StaticPrintSheetPlacement[];
};

type MutableStaticPrintSheet = Omit<StaticPrintSheet, "placements"> & {
  readonly placements: StaticPrintSheetPlacement[];
};

// #######################################
// Preview Class
// #######################################

export class PrintSheetThreePreview {
  // ##############################
  // Scene State
  // ##############################

  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(36, 1, 0.01, 100);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly sheetGroup = new Group();
  private readonly resizeObserver: ResizeObserver;
  private latestPlan: PrintSheetThreePreviewPlan | null = null;
  private staticReferenceLoadToken = 0;
  private destroyed = false;

  // ##############################
  // Initialization
  // ##############################

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.container.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enablePan = true;
    this.controls.autoRotate = false;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 9;
    this.controls.addEventListener("change", this.render);

    this.scene.add(this.sheetGroup);
    this.scene.add(new HemisphereLight(0xfff7e8, 0x7f897a, 2.4));
    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4, 2.5);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  // ##############################
  // Public API
  // ##############################

  update(plan: PrintSheetThreePreviewPlan): void {
    if (this.destroyed) {
      return;
    }
    this.latestPlan = plan;
    this.rebuildSheets(plan);
    this.frameSheets();
    this.render();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.staticReferenceLoadToken += 1;
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.render);
    this.controls.dispose();
    this.disposeObject(this.sheetGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ##############################
  // Sheet Rebuilds
  // ##############################

  private rebuildSheets(plan: PrintSheetThreePreviewPlan): void {
    this.disposeObject(this.sheetGroup);
    this.sheetGroup.clear();

    if (isStaticPrintSheetPreviewPlan(plan)) {
      this.staticReferenceLoadToken += 1;
      const loadToken = this.staticReferenceLoadToken;
      this.addStaticReferenceLoadingSheets(plan);
      void loadStaticPrintAssets(plan.reference.platePreviewAssets, "print").then((assets) => {
        if (!this.isStaticReferenceLoadCurrent(loadToken)) {
          disposeLoadedStaticPrintAssets(assets);
          return;
        }
        const materials = createPrintPreviewMaterials();
        this.disposeObject(this.sheetGroup);
        this.sheetGroup.clear();
        this.addStaticReferenceSheets(arrangeStaticPrintSheets(assets, plan.bed), materials);
        this.frameSheets();
        this.render();
      });
      return;
    }

    this.staticReferenceLoadToken += 1;
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

  // ##############################
  // Static Reference Loading
  // ##############################

  private addStaticReferenceLoadingSheets(plan: StaticPrintSheetPreviewPlan): void {
    const loadingSheet = emptyStaticPrintSheet(1, staticPreviewSheetWidth([], plan.bed), staticPreviewSheetDepth([], plan.bed));
    this.sheetGroup.add(createStaticSheetBase(loadingSheet, new Vector3(0, 0, 0)));
  }

  private addStaticReferenceSheets(
    sheets: readonly StaticPrintSheet[],
    materials: PrintPreviewMaterials,
  ): void {
    const columns = Math.max(1, Math.ceil(Math.sqrt(sheets.length)));
    sheets.forEach((sheet, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const sheetOrigin = new Vector3(
        column * (sheet.width + sheetGapMillimeters) * printPreviewScale,
        0,
        row * (sheet.depth + sheetGapMillimeters) * printPreviewScale,
      );
      this.sheetGroup.add(createStaticSheetGroup(sheet, sheetOrigin, materials));
    });

    const outline = new Box3().setFromObject(this.sheetGroup);
    const center = outline.getCenter(new Vector3());
    this.sheetGroup.position.sub(center);
  }

  // ##############################
  // Camera and Disposal
  // ##############################

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
    if (this.destroyed) {
      return;
    }
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.latestPlan !== null) {
      this.frameSheets();
    }
    this.render();
  }

  private render = (): void => {
    if (this.destroyed) {
      return;
    }
    this.renderer.render(this.scene, this.camera);
  };

  private isStaticReferenceLoadCurrent(loadToken: number): boolean {
    return !this.destroyed && loadToken === this.staticReferenceLoadToken;
  }

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

// #######################################
// Sheet and Plate Rendering
// #######################################

// ##############################
// Generated Sheets
// ##############################

function createSheetGroup(
  sheet: PrintSheet,
  sheetOrigin: Vector3,
  materials: PrintPreviewMaterials,
): Group {
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

// ##############################
// Static Sheets
// ##############################

function createStaticSheetGroup(
  sheet: StaticPrintSheet,
  sheetOrigin: Vector3,
  materials: PrintPreviewMaterials,
): Group {
  const group = createStaticSheetBase(sheet, sheetOrigin);
  for (const placement of sheet.placements) {
    group.add(createStaticPlacementMesh(placement, materials));
  }
  return group;
}

function createStaticSheetBase(
  sheet: StaticPrintSheet,
  sheetOrigin: Vector3,
): Group {
  const group = new Group();
  group.position.copy(sheetOrigin);

  const bed = new Mesh(
    new BoxGeometry(sheet.width * printPreviewScale, bedThickness, sheet.depth * printPreviewScale),
    new MeshBasicMaterial({ color: 0xfbfaf6, transparent: true, opacity: 0.72 }),
  );
  bed.position.set((sheet.width * printPreviewScale) / 2, 0, (sheet.depth * printPreviewScale) / 2);
  group.add(bed);
  group.add(createStaticBedGrid(sheet));
  return group;
}

// ##############################
// Bed Grids
// ##############################

function createBedGrid(sheet: PrintSheet): LineSegments {
  const spacing = 32;
  const positions: number[] = [];
  for (let x = 0; x <= sheet.width + 0.001; x += spacing) {
    positions.push(x * printPreviewScale, printPreviewGridY(), 0);
    positions.push(x * printPreviewScale, printPreviewGridY(), sheet.depth * printPreviewScale);
  }
  for (let y = 0; y <= sheet.depth + 0.001; y += spacing) {
    positions.push(0, printPreviewGridY(), y * printPreviewScale);
    positions.push(sheet.width * printPreviewScale, printPreviewGridY(), y * printPreviewScale);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geometry, new LineBasicMaterial({ color: 0xd0c7b7, transparent: true, opacity: 0.58 }));
}

function createStaticBedGrid(sheet: StaticPrintSheet): LineSegments {
  const spacing = 32;
  const positions: number[] = [];
  for (let x = 0; x <= sheet.width + 0.001; x += spacing) {
    positions.push(x * printPreviewScale, printPreviewGridY(), 0);
    positions.push(x * printPreviewScale, printPreviewGridY(), sheet.depth * printPreviewScale);
  }
  for (let y = 0; y <= sheet.depth + 0.001; y += spacing) {
    positions.push(0, printPreviewGridY(), y * printPreviewScale);
    positions.push(sheet.width * printPreviewScale, printPreviewGridY(), y * printPreviewScale);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new LineSegments(geometry, new LineBasicMaterial({ color: 0xd0c7b7, transparent: true, opacity: 0.58 }));
}

// ##############################
// Part Meshes
// ##############################

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

function createStaticPlacementMesh(placement: StaticPrintSheetPlacement, materials: PrintPreviewMaterials): Group {
  const group = new Group();
  group.position.set(
    (placement.x + placement.asset.footprintWidth / 2) * printPreviewScale,
    printPreviewPartY(0),
    (placement.y + placement.asset.footprintDepth / 2) * printPreviewScale,
  );

  const geometry = placement.asset.geometry;
  const mesh = new Mesh(geometry, staticPartMaterial(placement, materials));
  mesh.scale.setScalar(printPreviewScale);
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new LineSegments(new EdgesGeometry(geometry), materials.edge);
  edges.scale.copy(mesh.scale);
  edges.rotation.copy(mesh.rotation);
  group.add(edges);
  return group;
}

// #######################################
// Placement Meshes
// #######################################

// ##############################
// Printable Geometry
// ##############################

function createPrintablePartGeometry(placement: PrintSheetPlacement): BufferGeometry {
  const positions: number[] = [];
  for (const vertex of placement.part.mesh.vertices) {
    positions.push(
      (placement.x + vertex.x) * printPreviewScale,
      printPreviewPartY(vertex.z),
      (placement.y + vertex.y) * printPreviewScale,
    );
  }

  // The position map above swaps Y↔Z, which is a reflection (determinant −1) and
  // reverses triangle winding. Swap v2/v3 back so the shell stays CCW-outward;
  // otherwise FrontSide culling renders the parts inside-out (hollow look) — same
  // bug, and same fix, as createPrintableMeshGeometry in the assembled preview.
  const indices: number[] = [];
  for (const triangle of placement.part.mesh.triangles) {
    indices.push(triangle.v1, triangle.v3, triangle.v2);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The mesh weld shares each flat-wall vertex with the triangle fan bored around
  // screw holes and chamfers; plain averaged normals then bend the wall into a
  // wrinkled "tent" radiating from the hole. Creasing splits normals at sharp
  // dihedrals so flat walls stay flat — same fix as the assembled preview's
  // createPrintableMeshGeometry.
  return toCreasedNormals(geometry, printPartCreaseAngleRadians);
}

// ##############################
// Placement Materials
// ##############################

function createPrintPreviewMaterials(): PrintPreviewMaterials {
  return {
    panel: new MeshStandardMaterial({
      color: panelColor,
      map: createPrintWoodTexture(),
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      roughness: 0.68,
      metalness: 0.02,
    }),
    glueKey: new MeshStandardMaterial({
      color: glueKeyColor,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      roughness: 0.62,
      metalness: 0.02,
    }),
    oversized: new MeshStandardMaterial({
      color: oversizedColor,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      roughness: 0.62,
      metalness: 0.02,
    }),
    staticPart: new MeshStandardMaterial({
      color: panelColor,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      roughness: 0.62,
      metalness: 0.02,
      transparent: true,
      opacity: 0.82,
    }),
    staticFanPart: new MeshStandardMaterial({
      color: 0x151a1b,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      roughness: 0.66,
      metalness: 0.05,
    }),
    edge: new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.62 }),
  };
}

function partMaterial(placement: PrintSheetPlacement, materials: PrintPreviewMaterials): MeshStandardMaterial {
  if (placement.fit.type === "oversized") {
    return materials.oversized;
  }
  return placement.part.kind === "dovetail-glue-key" ||
    placement.part.kind === "scarf-glue-key" ||
    placement.part.kind === "rail-connector"
    ? materials.glueKey
    : materials.panel;
}

function staticPartMaterial(placement: StaticPrintSheetPlacement, materials: PrintPreviewMaterials): MeshStandardMaterial {
  if (placement.fit.type === "oversized") {
    return materials.oversized;
  }
  return placement.asset.asset.name.toLowerCase().includes("fan") ? materials.staticFanPart : materials.staticPart;
}

// #######################################
// Static Reference Packing
// #######################################

// ##############################
// Preview Heights
// ##############################

export function printPreviewGridY(): number {
  return bedThickness / 2 + bedGridLift;
}

export function printPreviewPartY(vertexZMillimeters: number): number {
  return bedThickness / 2 + printPartLift + vertexZMillimeters * printPreviewScale;
}

// ##############################
// Plan Type Guard
// ##############################

function isStaticPrintSheetPreviewPlan(plan: PrintSheetThreePreviewPlan): plan is StaticPrintSheetPreviewPlan {
  return "type" in plan && plan.type === "static-reference";
}

// ##############################
// Static Shelf Packing
// ##############################

function arrangeStaticPrintSheets(assets: readonly LoadedStaticPrintAsset[], bed: PrintBed): StaticPrintSheet[] {
  const sheets: MutableStaticPrintSheet[] = [
    emptyStaticPrintSheet(1, staticPreviewSheetWidth(assets, bed), staticPreviewSheetDepth(assets, bed)),
  ];
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;

  for (const asset of assets) {
    let sheet = requiredLastStaticSheet(sheets);
    const fit = staticAssetPrintBedFit(asset, bed);

    if (cursorX > 0 && cursorX + asset.footprintWidth > sheet.width) {
      cursorX = 0;
      cursorY += rowDepth + staticPartGapMillimeters;
      rowDepth = 0;
    }

    if (bed.type === "bounded" && cursorY > 0 && cursorY + asset.footprintDepth > sheet.depth) {
      sheet = emptyStaticPrintSheet(sheets.length + 1, staticPreviewSheetWidth(assets, bed), staticPreviewSheetDepth(assets, bed));
      sheets.push(sheet);
      cursorX = 0;
      cursorY = 0;
      rowDepth = 0;
    }

    sheet.placements.push({
      asset,
      x: cursorX,
      y: cursorY,
      fit,
    });
    cursorX += asset.footprintWidth + staticPartGapMillimeters;
    rowDepth = Math.max(rowDepth, asset.footprintDepth);
  }

  return sheets.filter((sheet) => sheet.placements.length > 0);
}

function emptyStaticPrintSheet(index: number, width: number, depth: number): MutableStaticPrintSheet {
  return {
    index,
    width,
    depth,
    placements: [],
  };
}

// ##############################
// Static Sheet Sizing
// ##############################

function staticPreviewSheetWidth(assets: readonly LoadedStaticPrintAsset[], bed: PrintBed): number {
  if (bed.type === "bounded") {
    return bed.width;
  }
  const widestPart = Math.max(...assets.map((asset) => asset.footprintWidth), 1);
  return Math.max(1000, widestPart);
}

function staticPreviewSheetDepth(assets: readonly LoadedStaticPrintAsset[], bed: PrintBed): number {
  if (bed.type === "bounded") {
    return bed.depth;
  }
  return Math.max(
    assets.reduce((total, asset) => total + asset.footprintDepth + staticPartGapMillimeters, 0),
    320,
  );
}

function staticAssetPrintBedFit(asset: LoadedStaticPrintAsset, bed: PrintBed): PrintBedFit {
  return printBedFitForDimensions(
    {
      width: asset.footprintWidth,
      depth: asset.footprintDepth,
      height: asset.height,
    },
    bed,
  );
}

function requiredLastStaticSheet(sheets: readonly MutableStaticPrintSheet[]): MutableStaticPrintSheet {
  const sheet = sheets[sheets.length - 1];
  if (sheet === undefined) {
    throw new Error("requiredLastStaticSheet: Missing print sheet");
  }
  return sheet;
}

// #######################################
// Materials and Disposal
// #######################################

// ##############################
// Textures
// ##############################

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

// ##############################
// Disposal
// ##############################

function disposeLoadedStaticPrintAssets(assets: readonly LoadedStaticPrintAsset[]): void {
  for (const asset of assets) {
    asset.geometry.dispose();
  }
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
