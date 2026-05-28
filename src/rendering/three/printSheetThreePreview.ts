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
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { StaticPrintReference } from "@/resources/static-print-references/references";
import { loadStaticPrintAssets, type LoadedStaticPrintAsset } from "@/rendering/three/staticPrintAssets";
import type { PrintBed } from "@/fabrication/printing/printableKit";
import type { PrintSheet, PrintSheetPlacement, PrintableSheetPlan } from "@/fabrication/printing/printableKit";

// #######################################
// Preview Model
// #######################################

const printPreviewScale = 1 / 260;
const sheetGapMillimeters = 64;
const staticPartGapMillimeters = 10;
const bedThickness = 0.012;
const bedGridLift = 0.001;
const printPartLift = 0.004;
const panelColor = 0xd1a166;
const glueKeyColor = 0x7f997d;
const oversizedColor = 0xd78872;
const edgeColor = 0x604322;
const labelColor = "#17201c";

type PrintPreviewMaterials = {
  readonly panel: MeshStandardMaterial;
  readonly glueKey: MeshStandardMaterial;
  readonly oversized: MeshStandardMaterial;
  readonly staticPart: MeshStandardMaterial;
  readonly staticFanPart: MeshStandardMaterial;
  readonly edge: LineBasicMaterial;
};

export type PrintSheetPreviewSettings = {
  readonly showPlateLabels: boolean;
};

export type StaticPrintSheetPreviewPlan = {
  readonly type: "static-reference";
  readonly reference: StaticPrintReference;
  readonly bed: PrintBed;
  readonly bedLabel: string;
};

export type PrintSheetThreePreviewPlan = PrintableSheetPlan | StaticPrintSheetPreviewPlan;

type StaticPrintSheetPlacement = {
  readonly asset: LoadedStaticPrintAsset;
  readonly x: number;
  readonly y: number;
  readonly fits: boolean;
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

const defaultPrintSheetPreviewSettings: PrintSheetPreviewSettings = {
  showPlateLabels: false,
};

// #######################################
// Preview Class
// #######################################

export class PrintSheetThreePreview {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(36, 1, 0.01, 100);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly sheetGroup = new Group();
  private readonly resizeObserver: ResizeObserver;
  private latestPlan: PrintSheetThreePreviewPlan | null = null;
  private staticReferenceLoadToken = 0;

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

  update(plan: PrintSheetThreePreviewPlan, settings: PrintSheetPreviewSettings = defaultPrintSheetPreviewSettings): void {
    this.latestPlan = plan;
    this.rebuildSheets(plan, settings);
    this.frameSheets();
    this.render();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.render);
    this.controls.dispose();
    this.disposeObject(this.sheetGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private rebuildSheets(plan: PrintSheetThreePreviewPlan, settings: PrintSheetPreviewSettings): void {
    this.disposeObject(this.sheetGroup);
    this.sheetGroup.clear();

    const materials = createPrintPreviewMaterials();
    if (isStaticPrintSheetPreviewPlan(plan)) {
      this.staticReferenceLoadToken += 1;
      const loadToken = this.staticReferenceLoadToken;
      this.addStaticReferenceLoadingSheets(plan);
      void loadStaticPrintAssets(plan.reference.platePreviewAssets, "print").then((assets) => {
        if (loadToken !== this.staticReferenceLoadToken) {
          for (const asset of assets) {
            asset.geometry.dispose();
          }
          return;
        }
        this.disposeObject(this.sheetGroup);
        this.sheetGroup.clear();
        this.addStaticReferenceSheets(arrangeStaticPrintSheets(assets, plan.bed), materials, settings);
        this.frameSheets();
        this.render();
      });
      return;
    }

    this.staticReferenceLoadToken += 1;
    const columns = Math.max(1, Math.ceil(Math.sqrt(plan.sheets.length)));
    plan.sheets.forEach((sheet, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const sheetOrigin = new Vector3(
        column * (sheet.width + sheetGapMillimeters) * printPreviewScale,
        0,
        row * (sheet.depth + sheetGapMillimeters) * printPreviewScale,
      );
      this.sheetGroup.add(createSheetGroup(sheet, sheetOrigin, materials, settings));
    });

    const outline = new Box3().setFromObject(this.sheetGroup);
    const center = outline.getCenter(new Vector3());
    this.sheetGroup.position.sub(center);
  }

  private addStaticReferenceLoadingSheets(plan: StaticPrintSheetPreviewPlan): void {
    const loadingSheet = emptyStaticPrintSheet(1, staticPreviewSheetWidth([], plan.bed), staticPreviewSheetDepth([], plan.bed));
    this.sheetGroup.add(createStaticSheetBase(loadingSheet, new Vector3(0, 0, 0), false));
  }

  private addStaticReferenceSheets(
    sheets: readonly StaticPrintSheet[],
    materials: PrintPreviewMaterials,
    settings: PrintSheetPreviewSettings,
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
      this.sheetGroup.add(createStaticSheetGroup(sheet, sheetOrigin, materials, settings));
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
    this.render();
  }

  private render = (): void => {
    this.renderer.render(this.scene, this.camera);
  };

  private disposeObject(object: Object3D): void {
    const seenMaterials = new Set<Material>();
    object.traverse((child) => {
      if (child instanceof Mesh || child instanceof LineSegments) {
        child.geometry.dispose();
        disposeMaterial(child.material, seenMaterials);
      }
      if (child instanceof Sprite) {
        disposeMaterial(child.material, seenMaterials);
      }
    });
  }
}

// #######################################
// Sheet and Plate Rendering
// #######################################

function createSheetGroup(
  sheet: PrintSheet,
  sheetOrigin: Vector3,
  materials: PrintPreviewMaterials,
  settings: PrintSheetPreviewSettings,
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
  if (settings.showPlateLabels) {
    group.add(createPlateLabel(sheet));
  }

  for (const placement of sheet.placements) {
    group.add(createPlacementMesh(placement, materials));
  }

  return group;
}

function createStaticSheetGroup(
  sheet: StaticPrintSheet,
  sheetOrigin: Vector3,
  materials: PrintPreviewMaterials,
  settings: PrintSheetPreviewSettings,
): Group {
  const group = createStaticSheetBase(sheet, sheetOrigin, settings.showPlateLabels);
  for (const placement of sheet.placements) {
    group.add(createStaticPlacementMesh(placement, materials));
  }
  return group;
}

function createStaticSheetBase(
  sheet: StaticPrintSheet,
  sheetOrigin: Vector3,
  showPlateLabels: boolean,
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
  if (showPlateLabels) {
    group.add(createStaticPlateLabel(sheet));
  }
  return group;
}

function createPlateLabel(sheet: PrintSheet): Sprite {
  const label = createPlateLabelSprite(`Plate ${sheet.index}`, plateContentsText(sheet));
  label.position.set(
    (sheet.width * printPreviewScale) / 2,
    printPreviewPartY(0) + 0.13,
    -0.068,
  );
  return label;
}

function createStaticPlateLabel(sheet: StaticPrintSheet): Sprite {
  const label = createPlateLabelSprite(`Plate ${sheet.index}`, staticPlateContentsText(sheet));
  label.position.set(
    (sheet.width * printPreviewScale) / 2,
    printPreviewPartY(0) + 0.13,
    -0.068,
  );
  return label;
}

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
// Labels
// #######################################

function createPlateLabelSprite(title: string, detail: string): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createPlateLabelSprite: Could not create canvas context");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fffdf6";
  context.globalAlpha = 0.96;
  roundRect(context, 10, 18, canvas.width - 20, canvas.height - 36, 20);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = labelColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "800 40px Arial, sans-serif";
  context.fillText(title, canvas.width / 2, 62, canvas.width - 56);
  context.font = "700 26px Arial, sans-serif";
  context.fillText(detail, canvas.width / 2, 104, canvas.width - 64);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.renderOrder = 1000;
  sprite.scale.set(1.06, 0.22, 1);
  sprite.position.set(0.53, printPreviewPartY(0) + 0.035, 0.025);
  return sprite;
}

function staticPlateContentsText(sheet: StaticPrintSheet): string {
  const partCount = sheet.placements.length;
  if (partCount === 0) {
    return "loading source STLs";
  }
  const visibleNames = sheet.placements.slice(0, 2).map((placement) => compactStaticAssetLabel(placement.asset.asset.name));
  const suffix = partCount > visibleNames.length ? `, +${partCount - visibleNames.length} other` : "";
  return `${partCount} STL part${partCount === 1 ? "" : "s"} · ${visibleNames.join(", ")}${suffix}`;
}

function compactStaticAssetLabel(name: string): string {
  return name
    .replace(".stl", "")
    .replace("filter housing", "")
    .replace("Corsi-Rosenthal box", "")
    .replaceAll("  ", " ")
    .trim()
    .slice(0, 38);
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function compactPartLabel(name: string): string {
  return name
    .replace(" print panel", "")
    .replace(" wall tile", "")
    .replace(" tile", "")
    .replace(" dovetail glue key", " key")
    .replace(" vertical key", " V key")
    .replace(" horizontal key", " H key")
    .replace("horizontal", "H")
    .replace("vertical", "V")
    .replace("Top fan wall", "Top fan")
    .replace("Bottom fan wall", "Bottom fan")
    .replace("Filter ", "F")
    .slice(0, 34);
}

function plateContentsText(sheet: PrintSheet): string {
  const partCount = sheet.placements.length;
  const summaries = plateContentSummaries(sheet);
  if (summaries.length === 0) {
    return "empty";
  }

  const visibleSummaries = summaries.slice(0, 3);
  const hiddenCount = summaries.slice(3).reduce((total, summary) => total + summary.count, 0);
  const contents = visibleSummaries.map((summary) => plateContentSummaryText(summary)).join(", ");
  const suffix = hiddenCount > 0 ? `, +${hiddenCount} other` : "";
  return `${partCount} part${partCount === 1 ? "" : "s"} · ${contents}${suffix}`;
}

function plateContentSummaries(sheet: PrintSheet): Array<{ readonly label: string; readonly count: number }> {
  const counts = new Map<string, number>();
  for (const placement of sheet.placements) {
    const label = plateContentCategory(placement.part);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count);
}

function plateContentSummaryText(summary: { readonly label: string; readonly count: number }): string {
  return summary.count === 1 ? summary.label : `${summary.label} x${summary.count}`;
}

function plateContentCategory(part: PrintSheetPlacement["part"]): string {
  if (part.kind === "dovetail-glue-key") {
    return "glue keys";
  }

  const name = part.name.toLowerCase();
  if (name.includes("fan")) {
    return "fan plates";
  }
  if (name.includes("rail")) {
    return "rails";
  }
  if (name.includes("seal")) {
    return "seal panels";
  }
  if (name.includes("filter")) {
    return "filter panels";
  }
  if (part.sourceTile !== undefined && (part.sourceTile.columnCount > 1 || part.sourceTile.rowCount > 1)) {
    return "panel tiles";
  }
  return compactPartLabel(part.name);
}

// #######################################
// Placement Meshes
// #######################################

function createPrintablePartGeometry(placement: PrintSheetPlacement): BufferGeometry {
  const positions: number[] = [];
  for (const vertex of placement.part.mesh.vertices) {
    positions.push(
      (placement.x + vertex.x) * printPreviewScale,
      printPreviewPartY(vertex.z),
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
  if (!placement.fits) {
    return materials.oversized;
  }
  return placement.part.kind === "dovetail-glue-key" ? materials.glueKey : materials.panel;
}

function staticPartMaterial(placement: StaticPrintSheetPlacement, materials: PrintPreviewMaterials): MeshStandardMaterial {
  if (!placement.fits) {
    return materials.oversized;
  }
  return placement.asset.asset.name.toLowerCase().includes("fan") ? materials.staticFanPart : materials.staticPart;
}

// #######################################
// Static Reference Packing
// #######################################

export function printPreviewGridY(): number {
  return bedThickness / 2 + bedGridLift;
}

export function printPreviewPartY(vertexZMillimeters: number): number {
  return bedThickness / 2 + printPartLift + vertexZMillimeters * printPreviewScale;
}

function isStaticPrintSheetPreviewPlan(plan: PrintSheetThreePreviewPlan): plan is StaticPrintSheetPreviewPlan {
  return "type" in plan && plan.type === "static-reference";
}

function arrangeStaticPrintSheets(assets: readonly LoadedStaticPrintAsset[], bed: PrintBed): StaticPrintSheet[] {
  const sheets: MutableStaticPrintSheet[] = [
    emptyStaticPrintSheet(1, staticPreviewSheetWidth(assets, bed), staticPreviewSheetDepth(assets, bed)),
  ];
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;

  for (const asset of assets) {
    let sheet = requiredLastStaticSheet(sheets);
    const fits = staticAssetFitsPrintBed(asset, bed);

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
      fits,
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

function staticAssetFitsPrintBed(asset: LoadedStaticPrintAsset, bed: PrintBed): boolean {
  if (bed.type === "unbounded") {
    return true;
  }
  return asset.footprintWidth <= bed.width && asset.footprintDepth <= bed.depth && asset.height <= bed.height;
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
  if (material instanceof MeshBasicMaterial || material instanceof MeshStandardMaterial || material instanceof SpriteMaterial) {
    material.map?.dispose();
  }
  material.dispose();
}
