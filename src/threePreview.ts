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
  Float32BufferAttribute,
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
  TorusGeometry,
  Vector3,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  filterSelectionDimensions,
  isCorsiRosenthalPrintDesignId,
  isDonutFilterPrintDesignId,
  type FanAppearance,
  type LayoutResult,
} from "./airPurifier";
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
import { createCorsiRosenthalModel } from "./corsiRosenthalModel";
import type { CorsiFaceSide, CorsiFanGrid, CorsiFanPanel, CorsiFilterFace } from "./corsiRosenthalModel";
import { createDonutFilterModel, donutAdapterTotalHeight, donutCapTotalHeight, type DonutFilterModel } from "./donutFilterModel";
import type { CutFeature, CutPanel, RectCut } from "./cutGeometry";

type FanAxis = "x" | "y" | "z";

type FanPlacement = {
  axis: FanAxis;
  position: Vector3;
  radius: number;
};

type CameraPose = {
  readonly offsetFromTarget: Vector3;
  readonly viewScale: number;
};

type CorsiPreviewMetrics = {
  readonly mode: "top-exhaust" | "side-exhaust";
  readonly filterFaces: readonly CorsiFilterFace[];
  readonly fanPanels: readonly CorsiFanPanel[];
  readonly filterWidth: number;
  readonly filterHeight: number;
  readonly filterThickness: number;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly boxDepth: number;
  readonly rail: number;
  readonly printLayerDepth: number;
  readonly fanRadius: number;
  readonly fanCassetteOuter: number;
};

const sceneScale = 1 / 260;
const woodColor = 0xc7965a;
const edgeColor = 0x4f3822;
const burnColor = 0x2b1a0f;
const filterColor = 0xeef1e6;
const groundY = -0.58;
const homePreviewRotationX = -Math.PI / 2;
// Local +Y is the exhaust/back side of the fan, which faces outside the purifier.
// Positive Y rotation reads as slow clockwise motion from that outside view.
const fanRotorAngularVelocity = 0.9;

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
  private readonly fanRotors: Object3D[] = [];
  private readonly modelFocus = new Vector3();
  private latestViewScale = 1;
  private previousAnimationTime = performance.now();

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
    ground.position.y = groundY;
    this.staticSceneGroup.add(ground);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  update(layout: LayoutResult): void {
    const previousLayout = this.latestLayout;
    const previousPose = previousLayout === null ? null : this.captureCameraPose();
    const shouldApplyPresetCamera =
      previousLayout === null ||
      previousLayout.configuration.preview.cameraPreset !== layout.configuration.preview.cameraPreset;

    this.latestLayout = layout;
    this.rebuildModel(layout);
    if (shouldApplyPresetCamera) {
      this.frameModel(layout);
    } else {
      this.restoreCameraPose(layout, previousPose);
    }
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
    this.controls.update();
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
    this.modelGroup.rotation.set(0, 0, 0);
    this.hoveredDimensionId = null;
    this.dimensionTargets = [];
    this.fanRotors.length = 0;
    this.renderer.domElement.style.cursor = "";
    if (isDonutFilterPrintDesignId(layout.configuration.printDesign.id)) {
      this.rebuildDonutFilterModel(layout);
      return;
    }
    if (isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
      this.rebuildCorsiRosenthalModel(layout);
      return;
    }
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
      const panelGroup = createPanelGroup(
        panel,
        settings.cutting.materialThickness,
        settings.preview.showFans,
        fanAppearance,
        settings.preview.explodedView,
        wood,
        darkEdge,
        cutMark,
        screwMark,
      );
      collectFanRotors(panelGroup, this.fanRotors);
      this.modelGroup.add(panelGroup);
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

    this.modelGroup.rotation.x = homePreviewRotationX;
    const outline = new Box3().setFromObject(this.modelGroup);
    const center = outline.getCenter(new Vector3());
    this.modelGroup.position.sub(center);
    const centeredOutline = new Box3().setFromObject(this.modelGroup);
    this.modelGroup.position.y += groundY - centeredOutline.min.y;
    new Box3().setFromObject(this.modelGroup).getCenter(this.modelFocus);

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

  private rebuildCorsiRosenthalModel(layout: LayoutResult): void {
    const settings = layout.configuration;
    const fanAppearance = settings.fan.productSelection.product.appearance;
    const frameMaterial = new MeshStandardMaterial({ color: 0x151a1b, roughness: 0.66, metalness: 0.05 });
    const edgeMaterial = new LineBasicMaterial({ color: 0x070909, transparent: true, opacity: 0.72 });
    const filterMaterial = createFilterMediaMaterial(0.7);
    const metrics = createCorsiPreviewMetrics(layout);

    if (settings.preview.showFilterFrame) {
      this.addCorsiStructuralFrame(metrics, frameMaterial, edgeMaterial);
    }

    for (const face of metrics.filterFaces) {
      this.addCorsiFilterFace(
        metrics,
        face.side,
        settings.preview.showFilterMedia,
        settings.preview.showFilterFrame,
        filterMaterial,
        frameMaterial,
        edgeMaterial,
      );
    }
    if (settings.preview.showFilterFrame || settings.preview.showFans) {
      for (const fanPanel of metrics.fanPanels) {
        this.addCorsiFanPanel(metrics, fanPanel, settings.preview.showFans, fanAppearance, frameMaterial, edgeMaterial);
      }
    }

    const outline = new Box3().setFromObject(this.modelGroup);
    const center = outline.getCenter(new Vector3());
    this.modelGroup.position.sub(center);
    const centeredOutline = new Box3().setFromObject(this.modelGroup);
    this.modelGroup.position.y += groundY - centeredOutline.min.y;
    new Box3().setFromObject(this.modelGroup).getCenter(this.modelFocus);
  }

  private rebuildDonutFilterModel(layout: LayoutResult): void {
    const settings = layout.configuration;
    const model = createDonutFilterModel(layout);
    const fanAppearance = settings.fan.productSelection.product.appearance;
    const adapterMaterial = new MeshStandardMaterial({ color: 0xc9f43b, roughness: 0.48, metalness: 0.04 });
    const blackMaterial = new MeshStandardMaterial({ color: 0x0c0f0d, roughness: 0.62, metalness: 0.08 });
    const capMaterial = new MeshStandardMaterial({ color: 0xc9f43b, roughness: 0.48, metalness: 0.04 });
    const filterMaterial = new MeshPhysicalMaterial({
      color: 0xf5f7ef,
      roughness: 0.74,
      metalness: 0.02,
      transparent: true,
      opacity: 0.58,
      transmission: 0.18,
      side: DoubleSide,
    });
    const pleatMaterial = new LineBasicMaterial({ color: 0xc9cec0, transparent: true, opacity: 0.74 });
    const edgeMaterial = new LineBasicMaterial({ color: 0x202715, transparent: true, opacity: 0.68 });
    const flangeThickness = model.adapter.flangeThickness * sceneScale;
    const coneLength = model.adapter.coneLength * sceneScale;
    const filterRadius = (model.filter.outerDiameter / 2) * sceneScale;
    const filterHoleRadius = (model.filter.holeDiameter / 2) * sceneScale;
    const filterLength = model.filter.length * sceneScale;
    const filterStartX = coneLength;
    const filterEndX = filterStartX + filterLength;

    this.addDonutFanFlange(
      model,
      [0, filterRadius, 0],
      adapterMaterial,
      edgeMaterial,
    );
    this.addDonutFrustum(
      coneLength,
      model.adapter.fanOpeningDiameter * sceneScale / 2,
      model.adapter.filterHoleDiameter * sceneScale / 2,
      coneLength / 2,
      filterRadius,
      adapterMaterial,
      edgeMaterial,
    );
    this.addDonutCylinderShell(
      model.adapter.filterHoleDiameter * sceneScale / 2,
      model.adapter.insertLength * sceneScale,
      coneLength + (model.adapter.insertLength * sceneScale) / 2,
      filterRadius,
      adapterMaterial,
      edgeMaterial,
    );

    if (settings.preview.showFilterMedia) {
      this.addDonutCylinderShell(filterRadius, filterLength, filterStartX + filterLength / 2, filterRadius, filterMaterial, edgeMaterial);
      this.addDonutCylinderShell(filterHoleRadius, filterLength, filterStartX + filterLength / 2, filterRadius, filterMaterial, edgeMaterial);
      this.addDonutFilterEndFace(filterStartX, filterRadius, filterHoleRadius, filterRadius, filterMaterial, edgeMaterial);
      this.addDonutFilterEndFace(filterEndX, filterRadius, filterHoleRadius, filterRadius, filterMaterial, edgeMaterial);
      this.addDonutFilterPleats(filterStartX, filterEndX, filterRadius, pleatMaterial);
      this.addDonutGasket(filterStartX, filterRadius, filterRadius, blackMaterial);
      this.addDonutGasket(filterEndX, filterRadius, filterRadius, blackMaterial);
      this.addDonutGasket(filterStartX, filterHoleRadius, filterRadius, blackMaterial);
      this.addDonutGasket(filterEndX, filterHoleRadius, filterRadius, blackMaterial);
    }

    if (model.cap.enabled && settings.preview.showFilterFrame) {
      this.addDonutCap(model, filterEndX, filterRadius, capMaterial, edgeMaterial);
    }

    if (settings.preview.showFans) {
      const fanVisualDepth = 0.047;
      const fanCenterX = -flangeThickness / 2 - fanVisualDepth / 2;
      const fan = createFan({
        axis: "x",
        position: new Vector3(fanCenterX, filterRadius, 0),
        radius: (model.fanSize / 2) * sceneScale,
        appearance: fanAppearance,
      });
      collectFanRotors(fan, this.fanRotors);
      this.modelGroup.add(fan);
      this.addDonutFanGuard(model, fanCenterX - fanVisualDepth / 2 - model.fanGuard.thickness * sceneScale / 2, filterRadius, adapterMaterial, edgeMaterial);
    }

    const outline = new Box3().setFromObject(this.modelGroup);
    const center = outline.getCenter(new Vector3());
    this.modelGroup.position.sub(center);
    const centeredOutline = new Box3().setFromObject(this.modelGroup);
    this.modelGroup.position.y += groundY - centeredOutline.min.y;
    new Box3().setFromObject(this.modelGroup).getCenter(this.modelFocus);
  }

  private addDonutFanFlange(
    model: DonutFilterModel,
    position: readonly [number, number, number],
    material: Material,
    edgeMaterial: Material,
  ): void {
    const fanSize = model.fanSize * sceneScale;
    const halfSize = fanSize / 2;
    const flangeThickness = model.adapter.flangeThickness * sceneScale;
    const shape = new Shape();
    shape.moveTo(-halfSize, -halfSize);
    shape.lineTo(halfSize, -halfSize);
    shape.lineTo(halfSize, halfSize);
    shape.lineTo(-halfSize, halfSize);
    shape.closePath();

    const fanHole = new Path();
    fanHole.absellipse(
      0,
      0,
      Math.max(0.001, (model.adapter.fanOpeningDiameter / 2 - model.adapter.wallThickness) * sceneScale),
      Math.max(0.001, (model.adapter.fanOpeningDiameter / 2 - model.adapter.wallThickness) * sceneScale),
      0,
      Math.PI * 2,
      true,
    );
    shape.holes.push(fanHole);

    for (const screw of model.adapter.screwCenters) {
      const screwHole = new Path();
      screwHole.absellipse(
        (screw.x - model.fanSize / 2) * sceneScale,
        (screw.y - model.fanSize / 2) * sceneScale,
        (model.screwHoleDiameter / 2) * sceneScale,
        (model.screwHoleDiameter / 2) * sceneScale,
        0,
        Math.PI * 2,
        true,
      );
      shape.holes.push(screwHole);
    }

    const geometry = new ExtrudeGeometry(shape, {
      depth: flangeThickness,
      bevelEnabled: false,
      curveSegments: 48,
      steps: 1,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-flangeThickness / 2, 0, 0);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);

    const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    this.modelGroup.add(edges);
  }

  private addDonutFrustum(
    length: number,
    fanRadius: number,
    filterHoleRadius: number,
    centerX: number,
    centerY: number,
    material: Material,
    edgeMaterial: Material,
  ): void {
    const geometry = new CylinderGeometry(filterHoleRadius, fanRadius, length, 96, 1, true);
    geometry.rotateZ(-Math.PI / 2);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(centerX, centerY, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);
    const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    this.modelGroup.add(edges);
  }

  private addDonutCylinderShell(
    radius: number,
    length: number,
    centerX: number,
    centerY: number,
    material: Material,
    edgeMaterial: Material,
  ): void {
    const geometry = new CylinderGeometry(radius, radius, length, 96, 1, true);
    geometry.rotateZ(-Math.PI / 2);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(centerX, centerY, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);
    const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    this.modelGroup.add(edges);
  }

  private addDonutGasket(x: number, radius: number, centerY: number, material: Material): void {
    const gasket = new Mesh(new TorusGeometry(radius, Math.max(0.007, radius * 0.055), 10, 80), material);
    gasket.rotation.y = Math.PI / 2;
    gasket.position.set(x, centerY, 0);
    gasket.castShadow = true;
    this.modelGroup.add(gasket);
  }

  private addDonutFilterEndFace(
    x: number,
    outerRadius: number,
    innerRadius: number,
    centerY: number,
    material: Material,
    edgeMaterial: Material,
  ): void {
    const faceThickness = 0.0035;
    const shape = new Shape();
    shape.absellipse(0, 0, outerRadius, outerRadius, 0, Math.PI * 2, false);
    const hole = new Path();
    hole.absellipse(0, 0, innerRadius, innerRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const geometry = new ExtrudeGeometry(shape, {
      depth: faceThickness,
      bevelEnabled: false,
      curveSegments: 96,
      steps: 1,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-faceThickness / 2, 0, 0);

    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, centerY, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);

    const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    this.modelGroup.add(edges);
  }

  private addDonutCap(model: DonutFilterModel, filterEndX: number, centerY: number, material: Material, edgeMaterial: Material): void {
    const capRadius = (model.cap.outerDiameter / 2) * sceneScale;
    const capThickness = model.cap.thickness * sceneScale;
    const insertLength = model.cap.insertLength * sceneScale;
    this.addDonutSolidCylinder(capRadius, capThickness, filterEndX + capThickness / 2, centerY, material, edgeMaterial);
    this.addDonutCylinderShell(
      (model.cap.holeDiameter / 2) * sceneScale,
      insertLength,
      filterEndX - insertLength / 2,
      centerY,
      material,
      edgeMaterial,
    );
  }

  private addDonutSolidCylinder(
    radius: number,
    length: number,
    centerX: number,
    centerY: number,
    material: Material,
    edgeMaterial: Material,
  ): void {
    const geometry = new CylinderGeometry(radius, radius, length, 96);
    geometry.rotateZ(-Math.PI / 2);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(centerX, centerY, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);
    const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    this.modelGroup.add(edges);
  }

  private addDonutFilterPleats(startX: number, endX: number, radius: number, material: Material): void {
    const positions: number[] = [];
    const centerY = radius;
    for (let index = 0; index < 44; index += 1) {
      const angle = (index / 44) * Math.PI * 2;
      const y = centerY + Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(startX, y, z, endX, y, z);
    }
    for (let ring = 0; ring <= 18; ring += 1) {
      const x = startX + ((endX - startX) * ring) / 18;
      for (let index = 0; index < 44; index += 1) {
        const a0 = (index / 44) * Math.PI * 2;
        const a1 = ((index + 1) / 44) * Math.PI * 2;
        positions.push(
          x,
          centerY + Math.cos(a0) * radius,
          Math.sin(a0) * radius,
          x,
          centerY + Math.cos(a1) * radius,
          Math.sin(a1) * radius,
        );
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    this.modelGroup.add(new LineSegments(geometry, material));
  }

  private addDonutFanGuard(model: DonutFilterModel, x: number, centerY: number, material: Material, edgeMaterial: Material): void {
    const size = model.fanGuard.outerSize * sceneScale;
    const bar = model.fanGuard.ringWidth * 1.7 * sceneScale;
    const thickness = model.fanGuard.thickness * sceneScale;
    const ringMaterial = material;
    const guard = new Group();
    guard.position.set(x, centerY, 0);

    for (const [y, z, width, height] of [
      [0, size / 2 - bar / 2, size, bar],
      [0, -size / 2 + bar / 2, size, bar],
      [-size / 2 + bar / 2, 0, bar, size],
      [size / 2 - bar / 2, 0, bar, size],
    ] as const) {
      const mesh = new Mesh(new BoxGeometry(thickness, width, height), ringMaterial);
      mesh.position.set(0, y, z);
      guard.add(mesh);
    }

    for (const radiusFactor of [0.18, 0.32, 0.46, 0.6, 0.74, 0.88]) {
      const ring = new Mesh(new TorusGeometry((size * 0.44) * radiusFactor, bar / 2, 8, 80), ringMaterial);
      ring.rotation.y = Math.PI / 2;
      guard.add(ring);
    }

    for (let index = 0; index < 12; index += 1) {
      const spoke = new Mesh(new BoxGeometry(thickness, size * 0.86, Math.max(bar * 0.72, 0.006)), ringMaterial);
      spoke.rotation.x = (index / 12) * Math.PI;
      guard.add(spoke);
    }

    const screwMaterial = new MeshStandardMaterial({ color: 0x0e120f, roughness: 0.58, metalness: 0.2 });
    for (const screw of model.fanGuard.screwCenters) {
      const boss = new Mesh(
        new CylinderGeometry(model.fanGuard.screwBossDiameter * sceneScale / 2, model.fanGuard.screwBossDiameter * sceneScale / 2, thickness * 1.1, 24),
        ringMaterial,
      );
      boss.rotation.z = Math.PI / 2;
      boss.position.set(0, (screw.x - model.fanSize / 2) * sceneScale, (screw.y - model.fanSize / 2) * sceneScale);
      guard.add(boss);

      const screwHead = new Mesh(new CylinderGeometry(thickness * 0.95, thickness * 0.95, thickness * 1.3, 24), screwMaterial);
      screwHead.rotation.z = Math.PI / 2;
      screwHead.position.copy(boss.position);
      screwHead.position.x -= thickness * 0.72;
      guard.add(screwHead);
    }

    const guardMeshes: Mesh[] = [];
    guard.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        guardMeshes.push(child);
      }
    });
    for (const mesh of guardMeshes) {
      const edges = new LineSegments(new EdgesGeometry(mesh.geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      edges.rotation.copy(mesh.rotation);
      guard.add(edges);
    }
    this.modelGroup.add(guard);
  }

  private addCorsiBox(
    id: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: Material,
    edgeMaterial: Material,
  ): void {
    const geometry = new BoxGeometry(size[0], size[1], size[2]);
    const mesh = new Mesh(geometry, material);
    mesh.name = id;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);

    const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    this.modelGroup.add(edges);
  }

  private addCorsiStructuralFrame(
    metrics: CorsiPreviewMetrics,
    frameMaterial: Material,
    edgeMaterial: Material,
  ): void {
    const halfWidth = metrics.boxWidth / 2;
    const halfDepth = metrics.boxDepth / 2;
    const cornerSize = metrics.rail * 0.72;
    const railSize = metrics.rail * 0.62;
    for (const x of [-halfWidth, halfWidth]) {
      for (const z of [-halfDepth, halfDepth]) {
        this.addCorsiBox(
          "corsi-corner-post",
          [cornerSize, metrics.boxHeight, cornerSize],
          [x, metrics.boxHeight / 2, z],
          frameMaterial,
          edgeMaterial,
        );
      }
    }

    for (const y of [metrics.rail / 2, metrics.boxHeight - metrics.rail / 2]) {
      for (const z of [-halfDepth, halfDepth]) {
        this.addCorsiBox("corsi-horizontal-face-rail", [metrics.boxWidth, railSize, railSize], [0, y, z], frameMaterial, edgeMaterial);
      }
      for (const x of [-halfWidth, halfWidth]) {
        this.addCorsiBox("corsi-horizontal-depth-rail", [railSize, railSize, metrics.boxDepth], [x, y, 0], frameMaterial, edgeMaterial);
      }
    }
  }

  private addCorsiFilterFace(
    metrics: CorsiPreviewMetrics,
    side: CorsiFaceSide,
    showFilterMedia: boolean,
    showFilterFrame: boolean,
    filterMaterial: Material,
    frameMaterial: Material,
    edgeMaterial: Material,
  ): void {
    if (side === "front" || side === "back") {
      this.addCorsiFrontBackFilterFace(
        metrics,
        side === "front" ? metrics.boxDepth / 2 : -metrics.boxDepth / 2,
        showFilterMedia,
        showFilterFrame,
        filterMaterial,
        frameMaterial,
        edgeMaterial,
      );
      return;
    }

    if (side === "left" || side === "right") {
      this.addCorsiSideFilterFace(
        metrics,
        side === "right" ? metrics.boxWidth / 2 : -metrics.boxWidth / 2,
        showFilterMedia,
        showFilterFrame,
        filterMaterial,
        frameMaterial,
        edgeMaterial,
      );
      return;
    }

    this.addCorsiHorizontalFilterFace(
      metrics,
      side === "top" ? metrics.boxHeight : 0,
      showFilterMedia,
      showFilterFrame,
      filterMaterial,
      frameMaterial,
      edgeMaterial,
    );
  }

  private addCorsiFrontBackFilterFace(
    metrics: CorsiPreviewMetrics,
    z: number,
    showFilterMedia: boolean,
    showFilterFrame: boolean,
    filterMaterial: Material,
    frameMaterial: Material,
    edgeMaterial: Material,
  ): void {
    const filterZ = z > 0
      ? z - metrics.printLayerDepth / 2 - metrics.filterThickness / 2
      : z + metrics.printLayerDepth / 2 + metrics.filterThickness / 2;
    if (showFilterMedia) {
      this.addCorsiBox(
        "corsi-filter-media",
        [metrics.filterWidth, metrics.filterHeight, metrics.filterThickness],
        [0, metrics.boxHeight / 2, filterZ],
        filterMaterial,
        edgeMaterial,
      );
    }

    if (!showFilterFrame) {
      return;
    }

    this.addCorsiBox(
      "corsi-filter-top-rail",
      [metrics.boxWidth, metrics.rail, metrics.printLayerDepth],
      [0, metrics.boxHeight - metrics.rail / 2, z],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-filter-bottom-rail",
      [metrics.boxWidth, metrics.rail, metrics.printLayerDepth],
      [0, metrics.rail / 2, z],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-filter-left-rail",
      [metrics.rail, metrics.boxHeight, metrics.printLayerDepth],
      [-metrics.boxWidth / 2 + metrics.rail / 2, metrics.boxHeight / 2, z],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-filter-right-rail",
      [metrics.rail, metrics.boxHeight, metrics.printLayerDepth],
      [metrics.boxWidth / 2 - metrics.rail / 2, metrics.boxHeight / 2, z],
      frameMaterial,
      edgeMaterial,
    );
  }

  private addCorsiSideFilterFace(
    metrics: CorsiPreviewMetrics,
    x: number,
    showFilterMedia: boolean,
    showFilterFrame: boolean,
    filterMaterial: Material,
    frameMaterial: Material,
    edgeMaterial: Material,
  ): void {
    const filterX = x > 0
      ? x - metrics.printLayerDepth / 2 - metrics.filterThickness / 2
      : x + metrics.printLayerDepth / 2 + metrics.filterThickness / 2;
    if (showFilterMedia) {
      this.addCorsiBox(
        "corsi-side-filter-media",
        [metrics.filterThickness, metrics.filterHeight, metrics.filterWidth],
        [filterX, metrics.boxHeight / 2, 0],
        filterMaterial,
        edgeMaterial,
      );
    }

    if (!showFilterFrame) {
      return;
    }

    this.addCorsiBox(
      "corsi-side-filter-top-rail",
      [metrics.printLayerDepth, metrics.rail, metrics.boxDepth],
      [x, metrics.boxHeight - metrics.rail / 2, 0],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-side-filter-bottom-rail",
      [metrics.printLayerDepth, metrics.rail, metrics.boxDepth],
      [x, metrics.rail / 2, 0],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-side-filter-front-rail",
      [metrics.printLayerDepth, metrics.boxHeight, metrics.rail],
      [x, metrics.boxHeight / 2, metrics.boxDepth / 2 - metrics.rail / 2],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-side-filter-back-rail",
      [metrics.printLayerDepth, metrics.boxHeight, metrics.rail],
      [x, metrics.boxHeight / 2, -metrics.boxDepth / 2 + metrics.rail / 2],
      frameMaterial,
      edgeMaterial,
    );
  }

  private addCorsiHorizontalFilterFace(
    metrics: CorsiPreviewMetrics,
    y: number,
    showFilterMedia: boolean,
    showFilterFrame: boolean,
    filterMaterial: Material,
    frameMaterial: Material,
    edgeMaterial: Material,
  ): void {
    const filterY = y > metrics.boxHeight / 2
      ? y - metrics.printLayerDepth / 2 - metrics.filterThickness / 2
      : y + metrics.printLayerDepth / 2 + metrics.filterThickness / 2;
    if (showFilterMedia) {
      this.addCorsiBox(
        "corsi-horizontal-filter-media",
        [metrics.filterWidth, metrics.filterThickness, metrics.boxDepth - metrics.rail * 2],
        [0, filterY, 0],
        filterMaterial,
        edgeMaterial,
      );
    }

    if (!showFilterFrame) {
      return;
    }

    this.addCorsiBox(
      "corsi-horizontal-filter-front-rail",
      [metrics.boxWidth, metrics.printLayerDepth, metrics.rail],
      [0, y, metrics.boxDepth / 2 - metrics.rail / 2],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-horizontal-filter-back-rail",
      [metrics.boxWidth, metrics.printLayerDepth, metrics.rail],
      [0, y, -metrics.boxDepth / 2 + metrics.rail / 2],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-horizontal-filter-left-rail",
      [metrics.rail, metrics.printLayerDepth, metrics.boxDepth],
      [-metrics.boxWidth / 2 + metrics.rail / 2, y, 0],
      frameMaterial,
      edgeMaterial,
    );
    this.addCorsiBox(
      "corsi-horizontal-filter-right-rail",
      [metrics.rail, metrics.printLayerDepth, metrics.boxDepth],
      [metrics.boxWidth / 2 - metrics.rail / 2, y, 0],
      frameMaterial,
      edgeMaterial,
    );
  }

  private addCorsiFanPanel(
    metrics: CorsiPreviewMetrics,
    panel: CorsiFanPanel,
    showFans: boolean,
    fanAppearance: FanAppearance,
    frameMaterial: Material,
    edgeMaterial: Material,
  ): void {
    const panelPlacement = corsiFanPanelPlacement(metrics, panel.side);
    const firstX = -((panel.grid.columns - 1) * (panel.grid.cell + panel.grid.gap)) / 2;
    const firstZ = ((panel.grid.rows - 1) * (panel.grid.cell + panel.grid.gap)) / 2;
    for (let index = 0; index < panel.fanCount; index += 1) {
      const column = index % panel.grid.columns;
      const row = Math.floor(index / panel.grid.columns);
      const localX = firstX + column * (panel.grid.cell + panel.grid.gap);
      const localZ = firstZ - row * (panel.grid.cell + panel.grid.gap);
      this.addCorsiFanCassetteFrame(metrics, panelPlacement, localX, localZ, frameMaterial, edgeMaterial);
      if (!showFans) {
        continue;
      }
      const fan = createFan({
        axis: panelPlacement.axis,
        position: corsiFanPosition(panelPlacement, localX, localZ),
        radius: metrics.fanRadius,
        appearance: fanAppearance,
      });
      collectFanRotors(fan, this.fanRotors);
      this.modelGroup.add(fan);
    }
  }

  private addCorsiFanCassetteFrame(
    metrics: CorsiPreviewMetrics,
    placement: CorsiFanPanelPlacement,
    localU: number,
    localV: number,
    material: Material,
    edgeMaterial: Material,
  ): void {
    const outer = metrics.fanCassetteOuter;
    const bar = Math.min(metrics.rail * 0.5, 18 * sceneScale);
    this.addCorsiPlaneBox("corsi-fan-cassette-top", placement, localU, localV + outer / 2 - bar / 2, outer, bar, material, edgeMaterial);
    this.addCorsiPlaneBox("corsi-fan-cassette-bottom", placement, localU, localV - outer / 2 + bar / 2, outer, bar, material, edgeMaterial);
    this.addCorsiPlaneBox("corsi-fan-cassette-left", placement, localU - outer / 2 + bar / 2, localV, bar, outer, material, edgeMaterial);
    this.addCorsiPlaneBox("corsi-fan-cassette-right", placement, localU + outer / 2 - bar / 2, localV, bar, outer, material, edgeMaterial);
  }

  private addCorsiPlaneBox(
    id: string,
    placement: CorsiFanPanelPlacement,
    localU: number,
    localV: number,
    sizeU: number,
    sizeV: number,
    material: Material,
    edgeMaterial: Material,
  ): void {
    if (placement.axis === "x") {
      this.addCorsiBox(
        id,
        [placement.thickness, sizeV, sizeU],
        [placement.position[0], placement.position[1] + localV, placement.position[2] + localU],
        material,
        edgeMaterial,
      );
      return;
    }
    this.addCorsiBox(
      id,
      [sizeU, placement.thickness, sizeV],
      [placement.position[0] + localU, placement.position[1], placement.position[2] + localV],
      material,
      edgeMaterial,
    );
  }

  private frameModel(layout: LayoutResult): void {
    const settings = layout.configuration;
    const maxDimension = modelViewScale(layout);
    const position = cameraPosition(settings.preview.cameraPreset, maxDimension);
    this.latestViewScale = maxDimension;
    this.camera.position.copy(this.modelFocus).add(position);
    this.controls.target.copy(this.modelFocus);
    this.applyCameraSettings(layout);
  }

  private captureCameraPose(): CameraPose {
    return {
      offsetFromTarget: this.camera.position.clone().sub(this.controls.target),
      viewScale: this.latestViewScale,
    };
  }

  private restoreCameraPose(layout: LayoutResult, previousPose: CameraPose | null): void {
    if (previousPose === null || previousPose.offsetFromTarget.lengthSq() === 0) {
      this.frameModel(layout);
      return;
    }

    const nextViewScale = modelViewScale(layout);
    const scale = nextViewScale / Math.max(previousPose.viewScale, 0.001);
    const nextDistance = clamp(
      previousPose.offsetFromTarget.length() * scale,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    const nextOffset = previousPose.offsetFromTarget.clone().normalize().multiplyScalar(nextDistance);
    this.latestViewScale = nextViewScale;
    this.camera.position.copy(this.modelFocus).add(nextOffset);
    this.controls.target.copy(this.modelFocus);
    this.applyCameraSettings(layout);
  }

  private applyCameraSettings(layout: LayoutResult): void {
    const settings = layout.configuration;
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.controls.autoRotate =
      settings.preview.autoRotate && !(settings.preview.showDimensions && !isCorsiRosenthalPrintDesignId(settings.printDesign.id));
    this.controls.update();
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate = (): void => {
    this.spinFanRotors();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationId = window.requestAnimationFrame(this.animate);
  };

  private spinFanRotors(): void {
    const now = performance.now();
    const deltaSeconds = Math.min(0.05, (now - this.previousAnimationTime) / 1000);
    this.previousAnimationTime = now;
    for (const rotor of this.fanRotors) {
      rotor.rotation.y += deltaSeconds * fanRotorAngularVelocity;
    }
  }

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

function modelViewScale(layout: LayoutResult): number {
  const settings = layout.configuration;
  if (isDonutFilterPrintDesignId(settings.printDesign.id)) {
    const model = createDonutFilterModel(layout);
    return Math.max(model.filter.length + donutAdapterTotalHeight(model) + donutCapTotalHeight(model), model.filter.outerDiameter, model.fanSize) * sceneScale * 1.25;
  }
  if (isCorsiRosenthalPrintDesignId(settings.printDesign.id)) {
    const metrics = createCorsiPreviewMetrics(layout);
    return Math.max(metrics.boxWidth, metrics.boxHeight, metrics.boxDepth) * 1.16;
  }
  return (
    Math.max(
      filterSelectionDimensions(settings.filter).width,
      layout.summary.workingDepth,
      layout.summary.chamberHeight,
    ) * sceneScale
  );
}

function createCorsiPreviewMetrics(layout: LayoutResult): CorsiPreviewMetrics {
  const model = createCorsiRosenthalModel(layout);
  const filterWidth = model.filterWidth * sceneScale;
  const filterHeight = model.filterHeight * sceneScale;
  const filterThickness = model.filterThickness * sceneScale;
  const rail = 32 * sceneScale;
  const printLayerDepth = (model.partHeight + 2) * sceneScale;
  const fanRadius = (layout.configuration.fan.spec.diameter / 2) * sceneScale;
  const fanCassetteOuter = model.fanCassetteOuter * sceneScale;

  return {
    mode: model.mode,
    filterFaces: model.filterFaces,
    fanPanels: model.fanPanels.map(scaleCorsiFanPanel),
    filterWidth,
    filterHeight,
    filterThickness,
    boxWidth: filterWidth + rail * 2,
    boxHeight: filterHeight + rail * 2,
    boxDepth: filterWidth + rail * 2,
    rail,
    printLayerDepth,
    fanRadius,
    fanCassetteOuter,
  };
}

function scaleCorsiFanPanel(panel: CorsiFanPanel): CorsiFanPanel {
  return {
    ...panel,
    grid: scaleCorsiFanGrid(panel.grid),
  };
}

function scaleCorsiFanGrid(grid: CorsiFanGrid): CorsiFanGrid {
  return {
    columns: grid.columns,
    rows: grid.rows,
    cell: grid.cell * sceneScale,
    gap: grid.gap * sceneScale,
    depth: grid.depth * sceneScale,
    height: grid.height * sceneScale,
  };
}

type CorsiFanPanelPlacement = {
  readonly axis: FanAxis;
  readonly position: readonly [number, number, number];
  readonly u: "x" | "z";
  readonly v: "y" | "z";
  readonly outward: number;
  readonly thickness: number;
};

function corsiFanPanelPlacement(metrics: CorsiPreviewMetrics, side: CorsiFaceSide): CorsiFanPanelPlacement {
  if (side === "left") {
    return {
      axis: "x",
      position: [-metrics.boxWidth / 2 - metrics.printLayerDepth / 2, metrics.boxHeight / 2, 0],
      u: "z",
      v: "y",
      outward: -1,
      thickness: metrics.printLayerDepth,
    };
  }
  if (side === "right") {
    return {
      axis: "x",
      position: [metrics.boxWidth / 2 + metrics.printLayerDepth / 2, metrics.boxHeight / 2, 0],
      u: "z",
      v: "y",
      outward: 1,
      thickness: metrics.printLayerDepth,
    };
  }
  return {
    axis: "y",
    position: [0, metrics.boxHeight + metrics.printLayerDepth / 2, 0],
    u: "x",
    v: "z",
    outward: 1,
    thickness: metrics.printLayerDepth,
  };
}

function corsiFanPosition(placement: CorsiFanPanelPlacement, localU: number, localV: number): Vector3 {
  const position = new Vector3(placement.position[0], placement.position[1], placement.position[2]);
  if (placement.u === "x") {
    position.x += localU;
  } else {
    position.z += localU;
  }

  if (placement.v === "y") {
    position.y += localV;
  } else {
    position.z += localV;
  }

  if (placement.axis === "x") {
    position.x += placement.outward * 0.024;
  } else {
    position.y += placement.outward * 0.024;
  }
  return position;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createFan({ axis, position, radius, appearance }: FanPlacement & { appearance: FanAppearance }): Group {
  const fan = new Group();
  fan.position.copy(position);
  if (axis === "x") {
    fan.rotation.z = -Math.PI / 2;
  } else if (axis === "z") {
    fan.rotation.x = Math.PI / 2;
  }

  fan.add(createFanFrame(radius, appearance));
  fan.add(createFanShroud(radius, appearance));
  fan.add(createRearFanSupport(radius, appearance));

  const rotor = new Group();
  rotor.name = "fan-rotor";
  rotor.userData["fanRotor"] = true;
  const hub = new Mesh(
    new CylinderGeometry(radius * 0.28, radius * 0.28, 0.047, 48),
    new MeshStandardMaterial({ color: appearance.hubColor, roughness: 0.45, metalness: 0.08 }),
  );
  rotor.add(hub);

  const bladeMaterial = new MeshStandardMaterial({
    color: appearance.bladeColor,
    roughness: 0.62,
    metalness: 0.04,
    transparent: true,
    opacity: appearance.bladeOpacity,
    side: DoubleSide,
  });
  for (let index = 0; index < 7; index += 1) {
    const blade = new Mesh(createBladeGeometry(radius), bladeMaterial);
    blade.rotation.y = (index / 7) * Math.PI * 2;
    blade.castShadow = true;
    rotor.add(blade);
  }
  fan.add(rotor);

  return fan;
}

function collectFanRotors(root: Object3D, rotors: Object3D[]): void {
  root.traverse((child) => {
    if (child.userData["fanRotor"] === true) {
      rotors.push(child);
    }
  });
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

function createFanShroud(radius: number, appearance: FanAppearance): Group {
  const shroud = new Group();
  const material = new MeshStandardMaterial({ color: appearance.ringColor, roughness: 0.58, metalness: 0.12 });
  const shadowDisk = new Mesh(
    new CircleGeometry(radius * 0.9, 72),
    new MeshBasicMaterial({ color: appearance.ringColor, transparent: true, opacity: 0.24, side: DoubleSide }),
  );
  shadowDisk.rotation.x = Math.PI / 2;
  shadowDisk.position.y = -0.018;
  shroud.add(shadowDisk);

  const ring = new Mesh(new TorusGeometry(radius * 0.86, radius * 0.045, 12, 80), material);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  shroud.add(ring);

  return shroud;
}

function createRearFanSupport(radius: number, appearance: FanAppearance): Group {
  const support = new Group();
  const material = new MeshStandardMaterial({ color: appearance.frameColor, roughness: 0.6, metalness: 0.1 });
  const rearY = 0.034;
  const strutLength = radius * 0.72;
  const strutWidth = radius * 0.07;
  const strutDepth = 0.024;
  const strutDistance = radius * 0.52;

  for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const strut = new Mesh(new BoxGeometry(strutWidth, strutDepth, strutLength), material);
    strut.position.set(Math.cos(angle) * strutDistance, rearY, Math.sin(angle) * strutDistance);
    strut.rotation.y = Math.PI / 2 - angle;
    strut.castShadow = true;
    support.add(strut);
  }

  const motorCup = new Mesh(new CylinderGeometry(radius * 0.23, radius * 0.23, strutDepth * 1.15, 40), material);
  motorCup.position.y = rearY + 0.002;
  motorCup.castShadow = true;
  support.add(motorCup);
  return support;
}

function createBladeGeometry(radius: number): BufferGeometry {
  const radialSegments = 9;
  const chordSegments = 3;
  const innerRadius = radius * 0.24;
  const outerRadius = radius * 0.84;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
    const radialProgress = radialIndex / radialSegments;
    const bladeRadius = innerRadius + (outerRadius - innerRadius) * radialProgress;
    const sweepAngle = -0.48 + radialProgress * 0.82;
    const halfChordAngle = radiusToChordAngle(radius, radialProgress);

    for (let chordIndex = 0; chordIndex <= chordSegments; chordIndex += 1) {
      const chordProgress = chordIndex / chordSegments;
      const chordSide = chordProgress * 2 - 1;
      const angle = sweepAngle + chordSide * halfChordAngle;
      const pitch = chordSide * radius * (0.07 - radialProgress * 0.026);
      const camber = Math.sin(radialProgress * Math.PI) * radius * 0.026;
      positions.push(Math.cos(angle) * bladeRadius, pitch + camber, Math.sin(angle) * bladeRadius);
    }
  }

  const rowSize = chordSegments + 1;
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    for (let chordIndex = 0; chordIndex < chordSegments; chordIndex += 1) {
      const a = radialIndex * rowSize + chordIndex;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function radiusToChordAngle(radius: number, radialProgress: number): number {
  return (0.34 - radialProgress * 0.16) * Math.max(0.74, Math.min(1.25, radius / 0.26));
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
