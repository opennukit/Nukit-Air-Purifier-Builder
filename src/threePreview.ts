import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  Line,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { filterSelectionDimensions, type FanAppearance, type LayoutResult } from "./airPurifier";
import {
  createAssemblyModel,
  formatDimension,
  type AssemblyBoxPart,
  type AssemblyPanelPart,
  type DimensionGuide,
  type DimensionMeasurement,
  type MillimeterVector3,
  type Vector3Tuple,
} from "./assemblyModel";
import type { AssemblyLineCue } from "./assemblyModel";
import type { CutFeature, CutPanel, RectCut } from "./cutGeometry";

type FanAxis = "x" | "y" | "z";

type FanPlacement = {
  axis: FanAxis;
  position: Vector3;
  radius: number;
};

const sceneScale = 1 / 260;
const woodColor = 0xc7965a;
const edgeColor = 0x4f3822;
const burnColor = 0x2b1a0f;
const filterColor = 0xeef1e6;

export class PurifierThreePreview {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(38, 1, 0.01, 100);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly modelGroup = new Group();
  private readonly staticSceneGroup = new Group();
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private animationId: number | null = null;
  private latestLayout: LayoutResult | null = null;
  private hoveredDimensionId: string | null = null;
  private dimensionTargets: Object3D[] = [];

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
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 5.2;
    this.raycaster.params.Line = { threshold: 0.045 };
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.clearDimensionHover);

    this.scene.add(this.modelGroup);
    this.scene.add(this.staticSceneGroup);
    this.scene.add(new HemisphereLight(0xfff7e8, 0x7d897d, 2.2));
    const keyLight = new DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(2.5, 3.5, 3.2);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const ground = new Mesh(
      new CircleGeometry(1.8, 96),
      new MeshBasicMaterial({ color: 0x1f6f56, transparent: true, opacity: 0.06 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.58;
    this.staticSceneGroup.add(ground);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  update(layout: LayoutResult): void {
    this.latestLayout = layout;
    this.rebuildModel(layout);
    this.frameModel(layout);
  }

  destroy(): void {
    if (this.animationId !== null) {
      window.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.clearDimensionHover);
    this.controls.dispose();
    this.disposeObject(this.modelGroup);
    this.disposeObject(this.staticSceneGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private rebuildModel(layout: LayoutResult): void {
    this.disposeObject(this.modelGroup);
    this.modelGroup.clear();
    this.modelGroup.position.set(0, 0, 0);
    this.hoveredDimensionId = null;
    this.dimensionTargets = [];
    this.renderer.domElement.style.cursor = "";
    const assembly = createAssemblyModel(layout);
    const settings = layout.configuration;

    const wood = createWoodMaterial(settings.preview.transparentWalls);
    const railWood = createWoodMaterial(false);
    const darkEdge = new LineBasicMaterial({ color: edgeColor });
    const seamMaterial = new LineBasicMaterial({ color: burnColor, transparent: true, opacity: 0.78 });
    const cutMark = createCutMarkMaterial(0.54);
    const screwMark = createCutMarkMaterial(0.68);
    const filter = createFilterMediaMaterial(settings.filterCount === 2 ? 0.5 : 0.68);
    const fanAppearance = settings.fan.productSelection.product.appearance;

    for (const panel of assembly.panels) {
      this.modelGroup.add(
        createPanelGroup(
          panel,
          settings.cutting.materialThickness,
          settings.preview.showFans,
          fanAppearance,
          settings.preview.explodedView,
          wood,
          darkEdge,
          cutMark,
          screwMark,
        ),
      );
    }

    if (settings.preview.showFilterFrame) {
      if (assembly.filterRails.length > 0) {
        for (const rail of assembly.filterRails) {
          this.modelGroup.add(
            createPanelGroup(
              rail,
              settings.cutting.materialThickness,
              false,
              fanAppearance,
              settings.preview.explodedView,
              railWood,
              darkEdge,
              cutMark,
              screwMark,
            ),
          );
        }
      } else {
        for (const frame of assembly.filterFrames) {
          this.addAssemblyBox(frame, settings.preview.explodedView, railWood, darkEdge);
        }
      }
    }
    if (settings.preview.showFilterMedia) {
      for (const media of assembly.filterMedia) {
        this.addAssemblyBox(media, settings.preview.explodedView, filter, darkEdge);
      }
    }
    if (!settings.preview.explodedView) {
      this.modelGroup.add(createSeamGroup(assembly.seams, seamMaterial));
    }
    const outline = new Box3().setFromObject(this.modelGroup);
    const center = outline.getCenter(new Vector3());
    this.modelGroup.position.sub(center);

    if (settings.preview.showDimensions) {
      const dimensionGroup = createDimensionGroup(assembly.dimensions);
      this.modelGroup.add(dimensionGroup);
      this.dimensionTargets = collectDimensionTargets(dimensionGroup);
    }
  }

  private addAssemblyBox(part: AssemblyBoxPart, exploded: boolean, material: Material, edgeMaterial: Material): void {
    const [width, height, depth] = part.size;
    const geometry = new BoxGeometry(width * sceneScale, height * sceneScale, depth * sceneScale);
    const mesh = new Mesh(geometry, material);
    mesh.name = part.id;
    mesh.position.copy(toScenePosition(part.position, part.explodeDirection, exploded));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);

    const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    this.modelGroup.add(edges);
  }

  private frameModel(layout: LayoutResult): void {
    const settings = layout.configuration;
    const maxDimension =
      Math.max(
        filterSelectionDimensions(settings.filter).width,
        layout.summary.workingDepth,
        layout.summary.chamberHeight,
      ) * sceneScale;
    const position = cameraPosition(settings.preview.cameraPreset, maxDimension);
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.autoRotate = settings.preview.autoRotate && !settings.preview.showDimensions;
    this.controls.update();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.latestLayout !== null) {
      this.frameModel(this.latestLayout);
    }
  }

  private animate = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationId = window.requestAnimationFrame(this.animate);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.dimensionTargets.length === 0) {
      this.setHoveredDimension(null);
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObjects(this.dimensionTargets, false)[0];
    this.setHoveredDimension(readDimensionId(hit?.object ?? null));
  };

  private clearDimensionHover = (): void => {
    this.setHoveredDimension(null);
  };

  private setHoveredDimension(dimensionId: string | null): void {
    if (this.hoveredDimensionId === dimensionId) {
      return;
    }
    this.hoveredDimensionId = dimensionId;
    this.renderer.domElement.style.cursor = dimensionId === null ? "" : "help";
    applyDimensionHover(this.modelGroup, dimensionId);
  }

  private disposeObject(object: Object3D): void {
    const seenMaterials = new Set<Material>();
    object.traverse((child) => {
      if (child instanceof Mesh || child instanceof LineSegments || child instanceof Line) {
        child.geometry.dispose();
        disposeMaterial(child.material, seenMaterials);
      }
      if (child instanceof Sprite) {
        disposeMaterial(child.material, seenMaterials);
      }
    });
  }
}

function createPanelGroup(
  part: AssemblyPanelPart,
  materialThickness: number,
  showFans: boolean,
  fanAppearance: FanAppearance,
  exploded: boolean,
  material: Material,
  edgeMaterial: Material,
  cutMarkMaterial: Material,
  screwMarkMaterial: Material,
): Group {
  const panel = part.panel;
  const group = new Group();
  const geometry = createPanelGeometry(panel, materialThickness);
  const mesh = new Mesh(geometry, material);
  mesh.name = panel.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
  group.add(edges);

  group.add(createPanelCutMarkGroup(panel, materialThickness, cutMarkMaterial, screwMarkMaterial));

  if (showFans) {
    for (const cut of panel.cuts) {
      if (cut.type === "circle" && cut.role === "fan") {
        group.add(
          createFan({
            axis: "z",
            position: new Vector3(
              (cut.cx - panel.assemblyCenter.x) * sceneScale,
              (cut.cy - panel.assemblyCenter.y) * sceneScale,
              materialThickness * sceneScale * 0.5 + 0.014,
            ),
            radius: cut.radius * sceneScale,
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
  const z = Math.max(materialThickness * sceneScale, 0.012) / 2 + 0.0015;

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

function createSeamGroup(seams: readonly AssemblyLineCue[], material: Material): Group {
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

function createDimensionGroup(dimensions: readonly DimensionGuide[]): Group {
  const group = new Group();
  for (const guide of dimensions) {
    const dimensionId = `dimension-${guide.label}`;
    const from = toScenePosition(guide.from, [0, 0, 0], false);
    const to = toScenePosition(guide.to, [0, 0, 0], false);
    const guideGroup = new Group();
    guideGroup.add(createDimensionLine([from, to], dimensionId));
    for (const tick of createDimensionTicks(from, to)) {
      guideGroup.add(createDimensionLine(tick, dimensionId));
    }

    const midpoint = from.clone().lerp(to, 0.5).add(toSceneOffset(guide.labelOffset));
    const label = createTextSprite(guide.label, guide.measurement);
    markDimensionObject(label, dimensionId);
    label.position.copy(midpoint);
    guideGroup.add(label);
    group.add(guideGroup);
  }
  return group;
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
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createTextSprite: Could not create canvas context");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 253, 246, 0.96)";
  context.fillRect(18, 18, 476, 118);
  context.strokeStyle = "rgba(31, 111, 86, 0.72)";
  context.lineWidth = 4;
  context.strokeRect(18, 18, 476, 118);
  context.fillStyle = "#164d3d";
  context.font = "800 58px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 76, 78);
  context.textAlign = "left";
  context.fillStyle = "#111817";
  context.font = "800 30px Inter, Arial, sans-serif";
  context.fillText(formatDimension(measurement.value), 132, 66);
  context.fillStyle = "#667169";
  context.font = "650 22px Inter, Arial, sans-serif";
  context.fillText(measurement.description, 132, 100);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.renderOrder = 13;
  sprite.scale.set(0.66, 0.206, 1);
  return sprite;
}

function collectDimensionTargets(root: Object3D): Object3D[] {
  const targets: Object3D[] = [];
  root.traverse((child) => {
    if (readDimensionId(child) !== null) {
      targets.push(child);
    }
  });
  return targets;
}

function readDimensionId(object: Object3D | null): string | null {
  const dimensionId = object?.userData.dimensionId;
  return typeof dimensionId === "string" ? dimensionId : null;
}

function markDimensionObject<T extends Object3D>(object: T, dimensionId: string): T {
  object.userData.dimensionId = dimensionId;
  return object;
}

function applyDimensionHover(root: Object3D, hoveredDimensionId: string | null): void {
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
  sprite.scale.set(isHovered ? 0.96 : 0.66, isHovered ? 0.3 : 0.206, 1);
  sprite.renderOrder = isHovered ? 23 : 13;
}

function createCutMarkMaterial(opacity: number): Material {
  return new MeshBasicMaterial({
    color: burnColor,
    transparent: true,
    opacity,
    side: DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

function createWoodMaterial(transparent: boolean): Material {
  const material = new MeshStandardMaterial({
    color: woodColor,
    map: createWoodTexture(),
    roughness: 0.72,
    metalness: 0.02,
    transparent,
    opacity: transparent ? 0.48 : 1,
    depthWrite: !transparent,
  });
  if (transparent) {
    material.side = DoubleSide;
  }
  return material;
}

function createFilterMediaMaterial(opacity: number): Material {
  return new MeshPhysicalMaterial({
    color: filterColor,
    map: createFilterTexture(),
    roughness: 0.52,
    transparent: true,
    opacity,
    transmission: 0.08,
    depthWrite: false,
  });
}

function createWoodTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createWoodTexture: Could not create canvas context");
  }

  context.fillStyle = "#c7965a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 4) {
    const alpha = y % 16 === 0 ? 0.12 : 0.055;
    context.strokeStyle = `rgba(68, 42, 19, ${alpha})`;
    context.beginPath();
    context.moveTo(0, y + Math.sin(y * 0.17) * 1.8);
    context.lineTo(canvas.width, y + Math.cos(y * 0.11) * 1.6);
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createFilterTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createFilterTexture: Could not create canvas context");
  }

  context.fillStyle = "#eef1e6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let x = -canvas.height; x < canvas.width; x += 14) {
    context.strokeStyle = "rgba(108, 119, 110, 0.24)";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x, canvas.height);
    context.lineTo(x + canvas.height, 0);
    context.stroke();
  }
  for (let x = -canvas.height + 7; x < canvas.width; x += 14) {
    context.strokeStyle = "rgba(255, 255, 255, 0.34)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, canvas.height);
    context.lineTo(x + canvas.height, 0);
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function toScenePosition(position: Vector3Tuple, explodeDirection: Vector3Tuple, exploded: boolean): Vector3 {
  const explodeDistance = exploded ? 72 : 0;
  return new Vector3(
    (position[0] + explodeDirection[0] * explodeDistance) * sceneScale,
    (position[1] + explodeDirection[1] * explodeDistance) * sceneScale,
    (position[2] + explodeDirection[2] * explodeDistance) * sceneScale,
  );
}

function toSceneOffset(offset: MillimeterVector3): Vector3 {
  return new Vector3(offset[0] * sceneScale, offset[1] * sceneScale, offset[2] * sceneScale);
}

function cameraPosition(preset: LayoutResult["configuration"]["preview"]["cameraPreset"], maxDimension: number): Vector3 {
  if (preset === "front") {
    return new Vector3(0, maxDimension * 0.45, -maxDimension * 2.45);
  }
  if (preset === "side") {
    return new Vector3(maxDimension * 2.45, maxDimension * 0.52, 0);
  }
  if (preset === "top") {
    return new Vector3(0.001, maxDimension * 2.8, 0.001);
  }
  return new Vector3(maxDimension * 1.75, maxDimension * 1.05, maxDimension * 2.05);
}

function createFan({ axis, position, radius, appearance }: FanPlacement & { appearance: FanAppearance }): Group {
  const fan = new Group();
  fan.position.copy(position);
  if (axis === "x") {
    fan.rotation.z = Math.PI / 2;
  } else if (axis === "z") {
    fan.rotation.x = Math.PI / 2;
  }

  fan.add(createFanFrame(radius, appearance));

  const housing = new Mesh(
    new CylinderGeometry(radius, radius, 0.035, 72),
    new MeshStandardMaterial({ color: appearance.ringColor, roughness: 0.58, metalness: 0.12 }),
  );
  housing.castShadow = true;
  fan.add(housing);

  const hub = new Mesh(
    new CylinderGeometry(radius * 0.28, radius * 0.28, 0.047, 48),
    new MeshStandardMaterial({ color: appearance.hubColor, roughness: 0.45, metalness: 0.08 }),
  );
  fan.add(hub);

  const bladeMaterial = new MeshStandardMaterial({
    color: appearance.bladeColor,
    roughness: 0.62,
    metalness: 0.04,
    transparent: true,
    opacity: appearance.bladeOpacity,
    side: DoubleSide,
  });
  for (let index = 0; index < 5; index += 1) {
    const blade = new Mesh(createBladeGeometry(radius), bladeMaterial);
    blade.rotation.y = (index / 5) * Math.PI * 2;
    fan.add(blade);
  }

  return fan;
}

function createFanFrame(radius: number, appearance: FanAppearance): Group {
  const frame = new Group();
  const size = radius * 2.15;
  const barWidth = radius * 0.26;
  const depth = 0.032;
  const material = new MeshStandardMaterial({ color: appearance.frameColor, roughness: 0.62, metalness: 0.08 });
  const accentMaterial = new MeshStandardMaterial({ color: appearance.accentColor, roughness: 0.5, metalness: 0.12 });

  const top = new Mesh(new BoxGeometry(size, depth, barWidth), material);
  top.position.z = size / 2 - barWidth / 2;
  const bottom = new Mesh(new BoxGeometry(size, depth, barWidth), material);
  bottom.position.z = -size / 2 + barWidth / 2;
  const left = new Mesh(new BoxGeometry(barWidth, depth, size), material);
  left.position.x = -size / 2 + barWidth / 2;
  const right = new Mesh(new BoxGeometry(barWidth, depth, size), material);
  right.position.x = size / 2 - barWidth / 2;

  frame.add(top, bottom, left, right);
  const cornerOffset = size / 2 - barWidth / 2;
  for (const x of [-cornerOffset, cornerOffset]) {
    for (const z of [-cornerOffset, cornerOffset]) {
      const accent = new Mesh(new CylinderGeometry(radius * 0.075, radius * 0.075, depth * 1.2, 24), accentMaterial);
      accent.position.set(x, -0.002, z);
      frame.add(accent);
    }
  }
  return frame;
}

function createBladeGeometry(radius: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(radius * 0.14, -radius * 0.1);
  shape.bezierCurveTo(radius * 0.62, -radius * 0.42, radius * 0.82, -radius * 0.14, radius * 0.48, radius * 0.16);
  shape.bezierCurveTo(radius * 0.28, radius * 0.34, radius * 0.1, radius * 0.18, radius * 0.14, -radius * 0.1);
  return new ShapeGeometry(shape, 16);
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
  if (
    material instanceof MeshBasicMaterial ||
    material instanceof MeshStandardMaterial ||
    material instanceof MeshPhysicalMaterial ||
    material instanceof SpriteMaterial
  ) {
    material.map?.dispose();
  }
  material.dispose();
}
