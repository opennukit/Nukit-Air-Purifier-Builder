import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ArrowHelper,
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
  PlaneGeometry,
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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  isCorsiRosenthalPrintDesignId,
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  staticPrintReferenceForPreset,
  type FanAppearance,
} from "@/domain/purifier/airPurifier";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import { filterSelectionDimensions } from "@/domain/purifier/filter";
import {
  loadStaticPrintAssemblyAssets,
  loadStaticPrintAssets,
  type LoadedStaticPrintAssembly,
  type LoadedStaticPrintAsset,
} from "@/rendering/three/staticPrintAssets";
import type { StaticPrintPreviewAsset, StaticPrintReference } from "@/resources/static-print-references/references";
import {
  createAssemblyModel,
  formatDimension,
  type AssemblyBoxPart,
  type AssemblyPanelPart,
  type DimensionGuide,
  type DimensionMeasurement,
  type MillimeterSize3,
  type MillimeterVector3,
  type Vector3Tuple,
} from "@/fabrication/assemblyModel";
import type { AssemblyLineCue } from "@/fabrication/assemblyModel";
import { createCorsiRosenthalModel } from "@/domain/designs/corsi-rosenthal/model";
import type { CorsiFaceSide, CorsiFanGrid, CorsiFanPanel, CorsiFilterFace, CorsiSealedFace } from "@/domain/designs/corsi-rosenthal/model";
import { createDonutFilterModel, donutAdapterTotalHeight, donutCapTotalHeight, type DonutFilterModel } from "@/domain/designs/donut-filter/model";
import type { CutFeature, CutPanel, RectCut } from "@/fabrication/laser/cutGeometry";
import type { PrintableTileSource } from "@/fabrication/printing/printableKit";
import type { PrintableSheetPlan } from "@/fabrication/printing/printableKit";

type FanAxis = "x" | "y" | "z";

type FanPlacement = {
  axis: FanAxis;
  position: Vector3;
  radius: number;
};

type FanCadPreviewAsset = {
  readonly schema: "filterboxbuilder-fan-cad-preview-v1";
  readonly usage: "preview-only-purchased-part-visual";
  readonly unit: "millimeter";
  readonly nominalDiameter: number;
  readonly bounds: {
    readonly center: readonly [number, number, number];
  };
  readonly meshes: readonly FanCadPreviewMesh[];
};

type FanCadPreviewMesh = {
  readonly name: string;
  readonly color?: readonly [number, number, number];
  readonly position: readonly number[];
  readonly index: readonly number[];
};

type LoadedFanCadModel = {
  readonly nominalDiameter: number;
  readonly meshes: readonly LoadedFanCadMesh[];
};

type LoadedFanCadMesh = {
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly color: number;
  readonly isRotor: boolean;
};

type CameraPose = {
  readonly offsetFromTarget: Vector3;
  readonly viewScale: number;
};

type PanelPrintSeam = {
  readonly orientation: "vertical" | "horizontal";
  readonly offset: number;
  readonly start: number;
  readonly end: number;
};

type CorsiPreviewMetrics = {
  readonly mode: "top-exhaust" | "side-exhaust";
  readonly filterFaces: readonly CorsiFilterFace[];
  readonly fanPanels: readonly CorsiFanPanel[];
  readonly sealedFaces: readonly CorsiSealedFace[];
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

type StaticReferenceAssembledPreviewPose = {
  readonly meshRotationX: number;
  readonly rotateWholePreview: boolean;
  readonly installedPartLayout: "source-front" | "source-side-fans" | "fan-panel-up";
};

type StaticReferenceAssemblyMetrics = {
  readonly footprintWidth: number;
  readonly footprintDepth: number;
  readonly height: number;
};

type StaticReferencePurchasedPartExplosion = {
  readonly exploded: boolean;
  readonly assembly?: LoadedStaticPrintAssembly;
};

const sceneScale = 1 / 260;
const staticReferenceSceneScale = sceneScale * 0.72;
const woodColor = 0xc7965a;
const edgeColor = 0x4f3822;
const burnColor = 0x2b1a0f;
const filterColor = 0xeef1e6;
const groundY = -0.58;
const homePreviewRotationX = -Math.PI / 2;
const panelCutOverlayLift = 1.4 * sceneScale;
const panelPrintSeamOverlayLift = 2.1 * sceneScale;
const filterMediaPreviewClearanceMillimeters = 3;
const bananaReferenceLength = 180 * sceneScale;
const bananaReferenceRadius = 14 * sceneScale;
const oneMeterCubeSize = 1000 * sceneScale;
const staticReferenceExplodeDistance = 46 * sceneScale;
const bananaScaleAssetUrl = "/vendor/scale-reference/banana/banana.glb";
const dimensionLabelNormalScale = new Vector3(1.28, 0.367, 1);
const dimensionLabelHoverScale = new Vector3(1.78, 0.51, 1);
const staticReferencePreviewZoom = 1.52;
const generatedPreviewZoom = 1.5;
const generatedPreviewZoomReferenceMillimeters = 360;
const minimumLargeModelPreviewZoom = 0.85;
const previewControlClearanceTargetOffset = 0.1;
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
  private readonly scaleReferenceGroup = new Group();
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
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 14;
    this.raycaster.params.Line = { threshold: 0.045 };
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.clearDimensionHover);

    this.scene.add(this.modelGroup);
    this.scene.add(this.staticSceneGroup);
    this.scene.add(this.scaleReferenceGroup);
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

  update(layout: LayoutResult, printSeamPlan: PrintableSheetPlan | null = null): void {
    const previousLayout = this.latestLayout;
    const previousPose = previousLayout === null ? null : this.captureCameraPose();
    const shouldApplyPresetCamera =
      previousLayout === null ||
      previousLayout.configuration.preview.cameraPreset !== layout.configuration.preview.cameraPreset;

    this.latestLayout = layout;
    this.rebuildModel(layout, printSeamPlan);
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
    this.disposeObject(this.scaleReferenceGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private rebuildModel(layout: LayoutResult, printSeamPlan: PrintableSheetPlan | null): void {
    this.staticReferenceLoadToken += 1;
    this.disposeObject(this.modelGroup);
    this.modelGroup.clear();
    this.disposeObject(this.scaleReferenceGroup);
    this.scaleReferenceGroup.clear();
    this.modelGroup.position.set(0, 0, 0);
    this.modelGroup.rotation.set(0, 0, 0);
    this.hoveredDimensionId = null;
    this.dimensionTargets = [];
    this.fanRotors.length = 0;
    this.renderer.domElement.style.cursor = "";
    if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
      this.rebuildStaticReferenceModel(layout, this.staticReferenceLoadToken);
      return;
    }
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
    const printSeamMaterial = new LineBasicMaterial({ color: 0x2b6fd6, transparent: true, opacity: 0.9 });
    const panelPrintSeams = createPanelPrintSeams(printSeamPlan);
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
        panelPrintSeams.get(panel.id) ?? [],
        printSeamMaterial,
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
              panelPrintSeams.get(rail.id) ?? [],
              printSeamMaterial,
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
    const settledOutline = new Box3().setFromObject(this.modelGroup);
    this.addScaleReference(layout, settledOutline);
    this.updateModelFocus(settledOutline);

    if (settings.preview.showDimensions) {
      const dimensionGroup = createDimensionGroup(assembly.dimensions);
      this.modelGroup.add(dimensionGroup);
      this.dimensionTargets = collectDimensionTargets(dimensionGroup);
    }
  }

  private rebuildStaticReferenceModel(layout: LayoutResult, loadToken: number): void {
    const reference = staticPrintReferenceForPreset(layout.configuration.printDesign);
    const previewAssets = reference === undefined ? [] : staticReferencePreviewAssets(reference);
    if (reference === undefined || previewAssets.length === 0) {
      this.addStaticReferencePlaceholder();
      const outline = this.settleModelOnGround();
      this.addScaleReference(layout, outline);
      this.updateModelFocus(outline);
      return;
    }

    const assetsPromise =
      reference.assembledPreview?.type !== "source-part-set"
        ? loadStaticPrintAssets(previewAssets).then((assets) => ({ type: "assets" as const, assets }))
        : loadStaticPrintAssemblyAssets(reference.assembledPreview.assets).then((assembly) => ({ type: "assembly" as const, assembly }));

    void assetsPromise
      .then((loaded) => {
        if (loadToken !== this.staticReferenceLoadToken) {
          const disposableAssets = loaded.type === "assets" ? loaded.assets : loaded.assembly.assets;
          for (const asset of disposableAssets) {
            asset.geometry.dispose();
          }
          return;
        }
        this.disposeObject(this.modelGroup);
        this.modelGroup.clear();
        this.modelGroup.position.set(0, 0, 0);
        this.modelGroup.rotation.set(0, 0, 0);
        if (loaded.type === "assembly") {
          if (loaded.assembly.assets.length === 0) {
            this.addStaticReferencePlaceholder();
          } else {
            this.addStaticReferenceAssembledBoards(loaded.assembly, layout);
          }
        } else if (loaded.assets.length === 0) {
          this.addStaticReferencePlaceholder();
        } else if (reference.assembledPreview?.type === "single-source-asset") {
          this.addStaticReferenceAssembledAsset(loaded.assets[0], layout);
        } else {
          this.addStaticReferenceAssetGrid(loaded.assets);
        }
        const outline = this.settleModelOnGround();
        this.disposeObject(this.scaleReferenceGroup);
        this.scaleReferenceGroup.clear();
        this.addScaleReference(layout, outline);
        if (layout.configuration.preview.showDimensions) {
          const dimensionGroup = createStaticReferenceDimensionGroup(boundsInModelGroupSpace(outline, this.modelGroup));
          this.modelGroup.add(dimensionGroup);
          this.dimensionTargets = collectDimensionTargets(dimensionGroup);
        }
        this.updateModelFocus(new Box3().setFromObject(this.modelGroup));
        this.frameModel(layout);
      })
      .catch((error) => {
        console.warn("rebuildStaticReferenceModel: Failed to load static STL reference", error);
        if (loadToken !== this.staticReferenceLoadToken) {
          return;
        }
        this.disposeObject(this.modelGroup);
        this.modelGroup.clear();
        this.addStaticReferencePlaceholder();
        const outline = this.settleModelOnGround();
        this.disposeObject(this.scaleReferenceGroup);
        this.scaleReferenceGroup.clear();
        this.addScaleReference(layout, outline);
        this.updateModelFocus(new Box3().setFromObject(this.modelGroup));
        this.frameModel(layout);
      });
  }

  private addStaticReferencePlaceholder(): void {
    const material = new MeshStandardMaterial({ color: 0x22312b, roughness: 0.68, metalness: 0.04 });
    const edgeMaterial = new LineBasicMaterial({ color: 0x0f1814, transparent: true, opacity: 0.7 });
    for (let index = 0; index < 5; index += 1) {
      const geometry = new BoxGeometry(0.22 + index * 0.035, 0.035, 0.16);
      const mesh = new Mesh(geometry, material);
      mesh.position.set((index - 2) * 0.28, 0, (index % 2) * 0.22);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.modelGroup.add(mesh);
      const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      this.modelGroup.add(edges);
    }
  }

  private addStaticReferenceAssembledAsset(asset: LoadedStaticPrintAsset | undefined, layout: LayoutResult): void {
    if (asset === undefined) {
      this.addStaticReferencePlaceholder();
      return;
    }
    const material = new MeshStandardMaterial({ color: 0x151a1b, roughness: 0.66, metalness: 0.05 });
    const edgeMaterial = new LineBasicMaterial({ color: 0x53605a, transparent: true, opacity: 0.5 });
    const pose = staticReferenceAssembledPreviewPose(layout);
    const previewGroup = pose.rotateWholePreview ? new Group() : this.modelGroup;
    const mesh = new Mesh(asset.geometry, material);
    mesh.name = `static-reference-assembled-${asset.asset.name}`;
    mesh.scale.setScalar(sceneScale);
    if (!pose.rotateWholePreview) {
      mesh.rotation.x = pose.meshRotationX;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    previewGroup.add(mesh);

    const edges = new LineSegments(new EdgesGeometry(asset.geometry), edgeMaterial);
    edges.scale.copy(mesh.scale);
    edges.rotation.copy(mesh.rotation);
    previewGroup.add(edges);
    this.addStaticReferencePurchasedParts(asset, layout, pose, previewGroup, { exploded: false });
    if (pose.rotateWholePreview) {
      previewGroup.rotation.x = pose.meshRotationX;
      this.modelGroup.add(previewGroup);
    }
  }

  private addStaticReferenceAssembledBoards(assembly: LoadedStaticPrintAssembly, layout: LayoutResult): void {
    const material = new MeshStandardMaterial({ color: 0x151a1b, roughness: 0.66, metalness: 0.05 });
    const edgeMaterial = new LineBasicMaterial({ color: 0x53605a, transparent: true, opacity: 0.5 });
    const pose = staticReferenceAssembledPreviewPose(layout);
    const previewGroup = pose.rotateWholePreview ? new Group() : this.modelGroup;
    const shouldExplode = layout.configuration.preview.explodedView;

    for (const asset of assembly.assets) {
      const explodeOffset = staticReferenceBoardExplodeOffset(asset.geometry, assembly, shouldExplode);
      const mesh = new Mesh(asset.geometry, material);
      mesh.name = `static-reference-assembled-board-${asset.asset.name}`;
      mesh.scale.setScalar(sceneScale);
      mesh.position.copy(explodeOffset);
      if (!pose.rotateWholePreview) {
        mesh.rotation.x = pose.meshRotationX;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      previewGroup.add(mesh);

      const edges = new LineSegments(new EdgesGeometry(asset.geometry), edgeMaterial);
      edges.scale.copy(mesh.scale);
      edges.position.copy(explodeOffset);
      edges.rotation.copy(mesh.rotation);
      previewGroup.add(edges);
    }

    this.addStaticReferencePurchasedParts(assembly, layout, pose, previewGroup, { exploded: shouldExplode, assembly });
    if (pose.rotateWholePreview) {
      previewGroup.rotation.x = pose.meshRotationX;
      this.modelGroup.add(previewGroup);
    }
  }

  private addStaticReferencePurchasedParts(
    assembly: StaticReferenceAssemblyMetrics,
    layout: LayoutResult,
    pose: StaticReferenceAssembledPreviewPose,
    target: Group = this.modelGroup,
    explosion: StaticReferencePurchasedPartExplosion = { exploded: false },
  ): void {
    const settings = layout.configuration;
    const assetWidth = assembly.footprintWidth * sceneScale;
    const assetDepth = assembly.footprintDepth * sceneScale;
    const assetHeight = assembly.height * sceneScale;

    if (settings.preview.showFilterMedia) {
      if (pose.installedPartLayout === "fan-panel-up") {
        this.addStaticReferenceTopFilter(assembly, layout, target);
      } else if (pose.installedPartLayout === "source-side-fans") {
        this.addStaticReferenceSideFanFilters(assembly, layout, target);
      } else {
        this.addStaticReferenceFilter(assembly, layout, target);
      }
    }

    if (!settings.preview.showFans) {
      return;
    }

    const fanRadius = (settings.fan.spec.diameter / 2) * sceneScale;
    if (pose.installedPartLayout === "source-side-fans") {
      const fanY = 0;
      const fanZ = -fanRadius * 0.12;
      const centerSpacing = Math.min(assetWidth / 4, fanRadius * 2.08);
      for (const x of [-1.5, -0.5, 0.5, 1.5].map((multiplier) => multiplier * centerSpacing)) {
        const position = staticReferencePurchasedPartPosition(new Vector3(x, fanY, fanZ), explosion);
        const fan = createFan({
          axis: "z",
          position,
          radius: fanRadius,
          appearance: settings.fan.productSelection.product.appearance,
        });
        fan.name = "static-reference-installed-side-fan";
        collectFanRotors(fan, this.fanRotors);
        target.add(fan);
      }
      return;
    }

    if (pose.installedPartLayout === "fan-panel-up") {
      const fanY = assetDepth / 2 + 8 * sceneScale;
      const fanZ = -assetHeight * 0.145;
      const fanSpacing = Math.min(assetWidth * 0.245, fanRadius * 2.1);
      for (const x of [-fanSpacing, fanSpacing]) {
        const position = staticReferencePurchasedPartPosition(new Vector3(x, fanY, fanZ), explosion);
        const fan = createFan({
          axis: "y",
          position,
          radius: fanRadius,
          appearance: settings.fan.productSelection.product.appearance,
        });
        fan.name = "static-reference-installed-top-fan";
        collectFanRotors(fan, this.fanRotors);
        target.add(fan);
      }
      return;
    }

    const fanY = assetHeight * 0.145;
    const fanZ = assetDepth / 2 + fanRadius * 0.12;
    const fanSpacing = Math.min(assetWidth * 0.25, fanRadius * 2.12);
    for (const x of [-fanSpacing * 1.5, -fanSpacing * 0.5, fanSpacing * 0.5, fanSpacing * 1.5]) {
      const position = staticReferencePurchasedPartPosition(new Vector3(x, fanY, fanZ), explosion);
      const fan = createFan({
        axis: "z",
        position,
        radius: fanRadius,
        appearance: settings.fan.productSelection.product.appearance,
      });
      fan.name = "static-reference-installed-fan";
      collectFanRotors(fan, this.fanRotors);
      target.add(fan);
    }
  }

  private addStaticReferenceFilter(asset: StaticReferenceAssemblyMetrics, layout: LayoutResult, target: Group): void {
    const filterDimensions = filterSelectionDimensions(layout.configuration.filter);
    const filterWidth = Math.min(filterDimensions.width, Math.max(1, asset.footprintWidth - 28)) * sceneScale;
    const filterHeight = Math.min(filterDimensions.depth, Math.max(1, asset.height - 24)) * sceneScale;
    const filterThickness = Math.min(filterDimensions.thickness, Math.max(10, asset.footprintDepth * 0.08)) * sceneScale;
    const assetHeight = asset.height * sceneScale;
    const assetDepth = asset.footprintDepth * sceneScale;

    const filter = new Mesh(
      new BoxGeometry(filterWidth, filterHeight, filterThickness),
      createFilterMediaMaterial(0.72),
    );
    filter.name = "static-reference-installed-filter";
    filter.position.set(0, assetHeight * 0.5, assetDepth * 0.12);
    filter.castShadow = true;
    filter.receiveShadow = true;
    target.add(filter);

    const gasketMaterial = new MeshStandardMaterial({
      color: 0xf3f0de,
      roughness: 0.66,
      metalness: 0.02,
      transparent: true,
      opacity: 0.88,
    });
    const railThickness = Math.max(8 * sceneScale, filterThickness * 0.92);
    const railDepth = filterThickness * 1.16;
    for (const [x, y, width, height] of [
      [0, filterHeight / 2 - railThickness / 2, filterWidth, railThickness],
      [0, -filterHeight / 2 + railThickness / 2, filterWidth, railThickness],
      [-filterWidth / 2 + railThickness / 2, 0, railThickness, filterHeight],
      [filterWidth / 2 - railThickness / 2, 0, railThickness, filterHeight],
    ] as const) {
      const rail = new Mesh(new BoxGeometry(width, height, railDepth), gasketMaterial);
      rail.position.set(filter.position.x + x, filter.position.y + y, filter.position.z + filterThickness * 0.08);
      rail.castShadow = true;
      rail.receiveShadow = true;
      target.add(rail);
    }

    const pleatMaterial = new LineBasicMaterial({ color: 0xc7cdbc, transparent: true, opacity: 0.62 });
    const z = filter.position.z + filterThickness / 2 + 0.003;
    const positions: number[] = [];
    for (let index = 0; index <= 26; index += 1) {
      const x = filter.position.x - filterWidth / 2 + (filterWidth * index) / 26;
      positions.push(x, filter.position.y - filterHeight / 2, z, x, filter.position.y + filterHeight / 2, z);
    }
    for (let index = 0; index <= 14; index += 1) {
      const y = filter.position.y - filterHeight / 2 + (filterHeight * index) / 14;
      positions.push(filter.position.x - filterWidth / 2, y, z, filter.position.x + filterWidth / 2, y, z);
    }
    const pleats = new LineSegments(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3)), pleatMaterial);
    pleats.name = "static-reference-filter-pleats";
    target.add(pleats);
  }

  private addStaticReferenceSideFanFilters(asset: StaticReferenceAssemblyMetrics, layout: LayoutResult, target: Group): void {
    const filterDimensions = filterSelectionDimensions(layout.configuration.filter);
    const filterWidth = Math.min(filterDimensions.width, Math.max(1, asset.footprintWidth - 28)) * sceneScale;
    const filterDepth = Math.min(filterDimensions.depth, Math.max(1, asset.height - 28)) * sceneScale;
    const filterThickness = Math.min(filterDimensions.thickness, Math.max(10, asset.footprintDepth * 0.08)) * sceneScale;
    const assetHeight = asset.footprintDepth * sceneScale;
    const assetDepth = asset.height * sceneScale;

    for (const side of [-1, 1]) {
      const filter = new Mesh(
        new BoxGeometry(filterWidth, filterThickness, filterDepth),
        createFilterMediaMaterial(0.58),
      );
      filter.name = side > 0 ? "static-reference-installed-top-filter" : "static-reference-installed-bottom-filter";
      filter.position.set(0, side * (assetHeight / 2 - filterThickness / 2 - 7 * sceneScale), assetDepth / 2);
      filter.castShadow = true;
      filter.receiveShadow = true;
      target.add(filter);

      const pleatMaterial = new LineBasicMaterial({ color: 0xc7cdbc, transparent: true, opacity: side > 0 ? 0.62 : 0.42 });
      const y = filter.position.y + side * (filterThickness / 2 + 0.003);
      const positions: number[] = [];
      for (let index = 0; index <= 26; index += 1) {
        const x = filter.position.x - filterWidth / 2 + (filterWidth * index) / 26;
        positions.push(x, y, filter.position.z - filterDepth / 2, x, y, filter.position.z + filterDepth / 2);
      }
      for (let index = 0; index <= 14; index += 1) {
        const z = filter.position.z - filterDepth / 2 + (filterDepth * index) / 14;
        positions.push(filter.position.x - filterWidth / 2, y, z, filter.position.x + filterWidth / 2, y, z);
      }
      const pleats = new LineSegments(
        new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3)),
        pleatMaterial,
      );
      pleats.name = side > 0 ? "static-reference-top-filter-pleats" : "static-reference-bottom-filter-pleats";
      target.add(pleats);
    }
  }

  private addStaticReferenceTopFilter(asset: StaticReferenceAssemblyMetrics, layout: LayoutResult, target: Group): void {
    const filterDimensions = filterSelectionDimensions(layout.configuration.filter);
    const filterWidth = Math.min(filterDimensions.width, Math.max(1, asset.footprintWidth - 28)) * sceneScale;
    const filterDepth = Math.min(filterDimensions.depth, Math.max(1, asset.height - 28)) * sceneScale;
    const filterThickness = Math.min(filterDimensions.thickness, Math.max(10, asset.footprintDepth * 0.08)) * sceneScale;
    const assetDepth = asset.footprintDepth * sceneScale;
    const assetHeight = asset.height * sceneScale;

    const filter = new Mesh(
      new BoxGeometry(filterWidth, filterThickness, filterDepth),
      createFilterMediaMaterial(0.72),
    );
    filter.name = "static-reference-installed-top-filter";
    filter.position.set(0, assetDepth / 2 - filterThickness / 2 - 26 * sceneScale, -assetHeight * 0.5);
    filter.castShadow = true;
    filter.receiveShadow = true;
    target.add(filter);

    const gasketMaterial = new MeshStandardMaterial({
      color: 0xf3f0de,
      roughness: 0.66,
      metalness: 0.02,
      transparent: true,
      opacity: 0.88,
    });
    const railThickness = Math.max(8 * sceneScale, filterThickness * 0.92);
    for (const [x, z, width, depth] of [
      [0, filterDepth / 2 - railThickness / 2, filterWidth, railThickness],
      [0, -filterDepth / 2 + railThickness / 2, filterWidth, railThickness],
      [-filterWidth / 2 + railThickness / 2, 0, railThickness, filterDepth],
      [filterWidth / 2 - railThickness / 2, 0, railThickness, filterDepth],
    ] as const) {
      const rail = new Mesh(new BoxGeometry(width, railThickness, depth), gasketMaterial);
      rail.position.set(filter.position.x + x, filter.position.y + filterThickness * 0.1, filter.position.z + z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      target.add(rail);
    }

    const pleatMaterial = new LineBasicMaterial({ color: 0xc7cdbc, transparent: true, opacity: 0.62 });
    const y = filter.position.y + filterThickness / 2 + 0.003;
    const positions: number[] = [];
    for (let index = 0; index <= 26; index += 1) {
      const x = filter.position.x - filterWidth / 2 + (filterWidth * index) / 26;
      positions.push(x, y, filter.position.z - filterDepth / 2, x, y, filter.position.z + filterDepth / 2);
    }
    for (let index = 0; index <= 14; index += 1) {
      const z = filter.position.z - filterDepth / 2 + (filterDepth * index) / 14;
      positions.push(filter.position.x - filterWidth / 2, y, z, filter.position.x + filterWidth / 2, y, z);
    }
    const pleats = new LineSegments(new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3)), pleatMaterial);
    pleats.name = "static-reference-top-filter-pleats";
    target.add(pleats);
  }

  private addStaticReferenceAssetGrid(assets: readonly LoadedStaticPrintAsset[]): void {
    const material = new MeshStandardMaterial({ color: 0x8f5b35, roughness: 0.58, metalness: 0.02 });
    const darkMaterial = new MeshStandardMaterial({ color: 0x151a1b, roughness: 0.66, metalness: 0.05 });
    const columns = Math.max(1, Math.ceil(Math.sqrt(assets.length * 0.8)));
    const maxFootprintWidth = Math.max(...assets.map((asset) => asset.footprintWidth), 1) * staticReferenceSceneScale;
    const maxFootprintDepth = Math.max(...assets.map((asset) => asset.footprintDepth), 1) * staticReferenceSceneScale;
    const gap = 28 * staticReferenceSceneScale;
    const cellWidth = maxFootprintWidth + gap;
    const cellDepth = maxFootprintDepth + gap;

    assets.forEach((asset, index) => {
      const geometry = asset.geometry;
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, asset.asset.name.toLowerCase().includes("fan") ? darkMaterial : material);
      mesh.name = `static-reference-${asset.asset.name}`;
      mesh.scale.setScalar(staticReferenceSceneScale);
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const column = index % columns;
      const row = Math.floor(index / columns);
      mesh.position.set(
        (column - (columns - 1) / 2) * cellWidth,
        0,
        (row - (Math.ceil(assets.length / columns) - 1) / 2) * cellDepth,
      );
      this.modelGroup.add(mesh);
    });
  }

  private settleModelOnGround(): Box3 {
    const outline = new Box3().setFromObject(this.modelGroup);
    const center = outline.getCenter(new Vector3());
    this.modelGroup.position.sub(center);
    const centeredOutline = new Box3().setFromObject(this.modelGroup);
    this.modelGroup.position.y += groundY - centeredOutline.min.y;
    return new Box3().setFromObject(this.modelGroup);
  }

  private addAssemblyBox(part: AssemblyBoxPart, exploded: boolean, material: Material, edgeMaterial: Material): void {
    const [width, height, depth] = visualAssemblyBoxSize(part);
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

  private addScaleReference(layout: LayoutResult, modelBounds: Box3): void {
    if (!layout.configuration.preview.showBananaScale) {
      return;
    }

    const banana = createBananaScaleReference();
    const bananaBounds = new Box3().setFromObject(banana);
    const gap = Math.max(34 * sceneScale, modelBounds.getSize(new Vector3()).length() * 0.035);
    banana.rotation.y = 0;
    banana.position.set(
      modelBounds.min.x + bananaReferenceLength * 0.72,
      groundY - bananaBounds.min.y + 0.009,
      modelBounds.max.z + gap - bananaBounds.min.z,
    );
    this.scaleReferenceGroup.add(banana);

    const cube = createOneMeterScaleCube();
    const cubeBounds = new Box3().setFromObject(cube);
    cube.position.set(
      banana.position.x + bananaReferenceLength * 0.62 + oneMeterCubeSize * 0.62,
      groundY - cubeBounds.min.y + 0.009,
      modelBounds.max.z + gap - cubeBounds.min.z,
    );
    this.scaleReferenceGroup.add(cube);
  }

  private updateModelFocus(modelBounds: Box3): void {
    const previewBounds = modelBounds.clone();
    if (this.scaleReferenceGroup.children.length > 0) {
      previewBounds.union(new Box3().setFromObject(this.scaleReferenceGroup));
    }
    previewBounds.getCenter(this.modelFocus);
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
      for (const face of metrics.sealedFaces) {
        this.addCorsiSealedFace(metrics, face.side, frameMaterial, edgeMaterial);
      }
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
        this.addCorsiFanPanel(
          metrics,
          fanPanel,
          settings.preview.showFans,
          settings.preview.showFilterFrame,
          fanAppearance,
          frameMaterial,
          edgeMaterial,
        );
      }
    }

    const outline = new Box3().setFromObject(this.modelGroup);
    const center = outline.getCenter(new Vector3());
    this.modelGroup.position.sub(center);
    const centeredOutline = new Box3().setFromObject(this.modelGroup);
    this.modelGroup.position.y += groundY - centeredOutline.min.y;
    const settledOutline = new Box3().setFromObject(this.modelGroup);
    this.addScaleReference(layout, settledOutline);
    this.updateModelFocus(settledOutline);
    this.addCorsiAirflowCues(metrics, settings.preview.showFilterMedia, settings.preview.showFans);
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
    const settledOutline = new Box3().setFromObject(this.modelGroup);
    this.addScaleReference(layout, settledOutline);
    this.updateModelFocus(settledOutline);
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

  private addCorsiSealedFace(
    metrics: CorsiPreviewMetrics,
    side: CorsiFaceSide,
    material: Material,
    edgeMaterial: Material,
  ): void {
    if (side === "front" || side === "back") {
      this.addCorsiBox(
        "corsi-sealed-face",
        [metrics.boxWidth, metrics.boxHeight, metrics.printLayerDepth],
        [0, metrics.boxHeight / 2, side === "front" ? metrics.boxDepth / 2 : -metrics.boxDepth / 2],
        material,
        edgeMaterial,
      );
      return;
    }

    if (side === "left" || side === "right") {
      this.addCorsiBox(
        "corsi-sealed-side-face",
        [metrics.printLayerDepth, metrics.boxHeight, metrics.boxDepth],
        [side === "right" ? metrics.boxWidth / 2 : -metrics.boxWidth / 2, metrics.boxHeight / 2, 0],
        material,
        edgeMaterial,
      );
      return;
    }

    this.addCorsiBox(
      "corsi-sealed-horizontal-face",
      [metrics.boxWidth, metrics.printLayerDepth, metrics.boxDepth],
      [0, side === "top" ? metrics.boxHeight : 0, 0],
      material,
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
    showFilterFrame: boolean,
    fanAppearance: FanAppearance,
    frameMaterial: Material,
    edgeMaterial: Material,
  ): void {
    const panelPlacement = corsiFanPanelPlacement(metrics, panel.side);
    const firstX = -((panel.grid.columns - 1) * (panel.grid.cell + panel.grid.gap)) / 2;
    const firstZ = ((panel.grid.rows - 1) * (panel.grid.cell + panel.grid.gap)) / 2;
    if (showFilterFrame) {
      this.addCorsiFanPanelFiller(metrics, panel, panelPlacement, firstX, firstZ, frameMaterial, edgeMaterial);
    }
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

  private addCorsiFanPanelFiller(
    metrics: CorsiPreviewMetrics,
    panel: CorsiFanPanel,
    placement: CorsiFanPanelPlacement,
    firstU: number,
    firstV: number,
    material: Material,
    edgeMaterial: Material,
  ): void {
    const { sizeU, sizeV } = corsiFanPanelSize(metrics, placement);
    const halfU = sizeU / 2;
    const halfV = sizeV / 2;
    const outer = metrics.fanCassetteOuter;
    const centerSpacing = panel.grid.cell + panel.grid.gap;
    const lastColumn = Math.max(0, Math.min(panel.fanCount, panel.grid.columns) - 1);
    const lastRow = Math.max(0, Math.ceil(panel.fanCount / panel.grid.columns) - 1);
    const gridLeft = firstU - outer / 2;
    const gridRight = firstU + lastColumn * centerSpacing + outer / 2;
    const gridTop = firstV + outer / 2;
    const gridBottom = firstV - lastRow * centerSpacing - outer / 2;
    const addPiece = (id: string, minU: number, maxU: number, minV: number, maxV: number): void => {
      const clippedMinU = clamp(minU, -halfU, halfU);
      const clippedMaxU = clamp(maxU, -halfU, halfU);
      const clippedMinV = clamp(minV, -halfV, halfV);
      const clippedMaxV = clamp(maxV, -halfV, halfV);
      if (clippedMaxU - clippedMinU <= 0.002 || clippedMaxV - clippedMinV <= 0.002) {
        return;
      }
      this.addCorsiPlaneBox(
        id,
        placement,
        (clippedMinU + clippedMaxU) / 2,
        (clippedMinV + clippedMaxV) / 2,
        clippedMaxU - clippedMinU,
        clippedMaxV - clippedMinV,
        material,
        edgeMaterial,
      );
    };

    addPiece("corsi-fan-panel-top-fill", -halfU, halfU, gridTop, halfV);
    addPiece("corsi-fan-panel-bottom-fill", -halfU, halfU, -halfV, gridBottom);
    addPiece("corsi-fan-panel-left-fill", -halfU, gridLeft, gridBottom, gridTop);
    addPiece("corsi-fan-panel-right-fill", gridRight, halfU, gridBottom, gridTop);

    for (let row = 0; row < lastRow; row += 1) {
      const upperCenter = firstV - row * centerSpacing;
      const lowerCenter = firstV - (row + 1) * centerSpacing;
      addPiece(
        "corsi-fan-panel-row-gap-fill",
        gridLeft,
        gridRight,
        lowerCenter + outer / 2,
        upperCenter - outer / 2,
      );
    }

    for (let index = 0; index < panel.fanCount; index += 1) {
      const column = index % panel.grid.columns;
      const nextIndex = index + 1;
      if (column >= panel.grid.columns - 1 || nextIndex >= panel.fanCount) {
        continue;
      }
      const row = Math.floor(index / panel.grid.columns);
      const leftCenter = firstU + column * centerSpacing;
      const rightCenter = firstU + (column + 1) * centerSpacing;
      const rowCenter = firstV - row * centerSpacing;
      addPiece(
        "corsi-fan-panel-column-gap-fill",
        leftCenter + outer / 2,
        rightCenter - outer / 2,
        rowCenter - outer / 2,
        rowCenter + outer / 2,
      );
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

  private addCorsiAirflowCues(metrics: CorsiPreviewMetrics, showFilterMedia: boolean, showFans: boolean): void {
    if (showFilterMedia) {
      for (const face of metrics.filterFaces) {
        this.addCorsiAirflowCue(metrics, face.side, "intake");
      }
    }

    if (showFans) {
      for (const panel of metrics.fanPanels) {
        this.addCorsiAirflowCue(metrics, panel.side, "exhaust");
      }
    }
  }

  private addCorsiAirflowCue(
    metrics: CorsiPreviewMetrics,
    side: CorsiFaceSide,
    direction: "intake" | "exhaust",
  ): void {
    if (side === "bottom") {
      return;
    }
    const outward = corsiFaceNormal(side);
    const arrowDirection = direction === "exhaust" ? outward : outward.clone().multiplyScalar(-1);
    const faceCenter = corsiFaceCenter(metrics, side);
    const arrowLength = Math.max(0.11, Math.min(metrics.boxWidth, metrics.boxHeight, metrics.boxDepth) * 0.14);
    const surfaceOffset = metrics.printLayerDepth * 1.4 + 0.018;
    const origin =
      direction === "exhaust"
        ? faceCenter.clone().addScaledVector(outward, surfaceOffset)
        : faceCenter.clone().addScaledVector(outward, surfaceOffset + arrowLength);
    const cue = new ArrowHelper(
      arrowDirection,
      origin,
      arrowLength,
      direction === "exhaust" ? 0xf0a63a : 0x2cae86,
      arrowLength * 0.32,
      arrowLength * 0.17,
    );
    cue.name = `corsi-airflow-${direction}-${side}`;
    styleCorsiAirflowCue(cue);
    this.modelGroup.add(cue);
  }

  private frameModel(layout: LayoutResult): void {
    const settings = layout.configuration;
    const maxDimension = cameraViewScale(layout);
    const target = this.cameraTarget(layout, maxDimension);
    const position = cameraPosition(settings.preview.cameraPreset, maxDimension);
    this.latestViewScale = maxDimension;
    this.camera.position.copy(target).add(position);
    this.controls.target.copy(target);
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

    const nextViewScale = cameraViewScale(layout);
    const scale = nextViewScale / Math.max(previousPose.viewScale, 0.001);
    const nextDistance = clamp(
      previousPose.offsetFromTarget.length() * scale,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    const nextOffset = previousPose.offsetFromTarget.clone().normalize().multiplyScalar(nextDistance);
    const target = this.cameraTarget(layout, nextViewScale);
    this.latestViewScale = nextViewScale;
    this.camera.position.copy(target).add(nextOffset);
    this.controls.target.copy(target);
    this.applyCameraSettings(layout);
  }

  private cameraTarget(layout: LayoutResult, viewScale: number): Vector3 {
    const target = this.modelFocus.clone();
    if (layout.configuration.preview.cameraPreset !== "top") {
      target.y += viewScale * previewControlClearanceTargetOffset;
    }
    return target;
  }

  private applyCameraSettings(layout: LayoutResult): void {
    const settings = layout.configuration;
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.controls.autoRotate = settings.preview.autoRotate;
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
        if (child.userData["sharedCadGeometry"] !== true) {
          child.geometry.dispose();
        }
        disposeMaterial(child.material, seenMaterials);
      }
      if (child instanceof Sprite) {
        disposeMaterial(child.material, seenMaterials);
      }
    });
  }
}

function createBananaScaleReference(): Group {
  const group = new Group();
  group.name = "banana-for-scale";

  const placeholder = createBananaScaleBoundsPlaceholder();
  group.add(placeholder);

  void loadBananaScaleAsset()
    .then((asset) => {
      group.remove(placeholder);
      disposeMeshResources(placeholder);
      group.add(createNormalizedBananaScaleAsset(asset));
    })
    .catch(() => {
      placeholder.material.opacity = 0.16;
      placeholder.material.color.set(0xf5c84b);
    });

  return group;
}

function createBananaScaleBoundsPlaceholder(): Mesh<BoxGeometry, MeshBasicMaterial> {
  const placeholder = new Mesh(
    new BoxGeometry(bananaReferenceLength, bananaReferenceRadius * 1.8, bananaReferenceRadius * 2.6),
    new MeshBasicMaterial({
      color: 0xf5c84b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  placeholder.name = "banana-scale-bounds-placeholder";
  placeholder.position.y = (bananaReferenceRadius * 1.8) / 2;
  return placeholder;
}

let bananaScaleAssetPromise: Promise<Object3D> | null = null;

function loadBananaScaleAsset(): Promise<Object3D> {
  bananaScaleAssetPromise ??= new GLTFLoader().loadAsync(bananaScaleAssetUrl).then((gltf) => gltf.scene);
  return bananaScaleAssetPromise;
}

function createNormalizedBananaScaleAsset(asset: Object3D): Object3D {
  const clone = cloneObjectWithOwnMeshResources(asset);
  const rawSize = new Box3().setFromObject(clone).getSize(new Vector3());
  if (rawSize.z >= rawSize.x && rawSize.z >= rawSize.y) {
    clone.rotation.y = Math.PI / 2;
  } else if (rawSize.y >= rawSize.x && rawSize.y >= rawSize.z) {
    clone.rotation.z = -Math.PI / 2;
  }
  clone.rotation.x += 0.04;
  clone.updateWorldMatrix(true, true);

  const initialBounds = new Box3().setFromObject(clone);
  const initialSize = initialBounds.getSize(new Vector3());
  const scale = bananaReferenceLength / Math.max(initialSize.x, 0.001);
  clone.scale.setScalar(scale);
  clone.updateWorldMatrix(true, true);

  const scaledBounds = new Box3().setFromObject(clone);
  const scaledCenter = scaledBounds.getCenter(new Vector3());
  clone.position.sub(new Vector3(scaledCenter.x, scaledBounds.min.y, scaledCenter.z));
  clone.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return clone;
}

function createOneMeterScaleCube(): Group {
  const group = new Group();
  group.name = "one-meter-scale-cube";

  const geometry = new BoxGeometry(oneMeterCubeSize, oneMeterCubeSize, oneMeterCubeSize);
  const material = new MeshStandardMaterial({
    color: 0xdad3bc,
    roughness: 0.68,
    metalness: 0.02,
    transparent: true,
    opacity: 0.16,
  });
  const cube = new Mesh(geometry, material);
  cube.name = "one-meter-scale-cube-body";
  cube.position.y = oneMeterCubeSize / 2;
  cube.castShadow = true;
  cube.receiveShadow = true;
  group.add(cube);

  const edges = new LineSegments(
    new EdgesGeometry(geometry),
    new LineBasicMaterial({ color: 0x4f584e, transparent: true, opacity: 0.82 }),
  );
  edges.position.copy(cube.position);
  group.add(edges);
  for (const label of createOneMeterCubeFaceLabels()) {
    group.add(label);
  }

  return group;
}

function createOneMeterCubeFaceLabels(): Object3D[] {
  const label = createScaleLabelTexture("1 m cube");
  const material = new MeshBasicMaterial({
    map: label,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const width = oneMeterCubeSize * 0.88;
  const height = oneMeterCubeSize * 0.18;
  const faceInset = 0.006;
  const frontLabel = new Mesh(new PlaneGeometry(width, height), material.clone());
  frontLabel.name = "one-meter-scale-cube-front-label";
  frontLabel.position.set(0, oneMeterCubeSize * 0.62, oneMeterCubeSize / 2 + faceInset);

  const rightLabel = new Mesh(new PlaneGeometry(width, height), material.clone());
  rightLabel.name = "one-meter-scale-cube-side-label";
  rightLabel.rotation.y = Math.PI / 2;
  rightLabel.position.set(oneMeterCubeSize / 2 + faceInset, oneMeterCubeSize * 0.62, 0);

  return [frontLabel, rightLabel];
}

function createScaleLabelTexture(text: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 224;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createScaleLabelTexture: Could not create canvas context");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 253, 246, 0.9)";
  roundRect(context, 28, 28, 968, 168, 44);
  context.fill();
  context.strokeStyle = "rgba(31, 111, 86, 0.72)";
  context.lineWidth = 8;
  roundRect(context, 28, 28, 968, 168, 44);
  context.stroke();
  context.fillStyle = "#111817";
  context.font = "900 118px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function cloneObjectWithOwnMeshResources(object: Object3D): Object3D {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry = child.geometry.clone();
      child.material = cloneMaterial(child.material);
    }
  });
  return clone;
}

function cloneMaterial(material: Material | Material[]): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => entry.clone());
  }
  return material.clone();
}

function disposeMeshResources(mesh: Mesh): void {
  mesh.geometry.dispose();
  disposeMaterial(mesh.material, new Set());
}

function visualAssemblyBoxSize(part: AssemblyBoxPart): MillimeterSize3 {
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

function visualFilterMediaDimension(size: number): number {
  return Math.max(1, size - filterMediaPreviewClearanceMillimeters * 2, size * 0.72);
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

  const edges = new LineSegments(new EdgesGeometry(geometry), edgeMaterial);
  group.add(edges);

  group.add(createPanelCutMarkGroup(panel, materialThickness, cutMarkMaterial, screwMarkMaterial));
  if (printSeams.length > 0) {
    group.add(createPanelPrintSeamGroup(panel, materialThickness, printSeams, printSeamMaterial));
  }

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

function createPanelPrintSeams(plan: PrintableSheetPlan | null): Map<string, readonly PanelPrintSeam[]> {
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

function createStaticReferenceDimensionGroup(bounds: Box3): Group {
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
        description: "overall width",
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
        description: "overall height",
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
        description: "overall depth",
      },
    }),
  );
  return group;
}

function boundsInModelGroupSpace(worldBounds: Box3, modelGroup: Group): Box3 {
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

  const label = createTextSprite(input.label, input.measurement);
  markDimensionObject(label, dimensionId);
  label.position.copy(input.from.clone().lerp(input.to, 0.5).add(input.labelOffset));
  guideGroup.add(label);
  return guideGroup;
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
  canvas.width = 768;
  canvas.height = 220;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createTextSprite: Could not create canvas context");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 253, 246, 0.96)";
  context.fillRect(24, 24, 720, 168);
  context.strokeStyle = "rgba(31, 111, 86, 0.72)";
  context.lineWidth = 7;
  context.strokeRect(24, 24, 720, 168);
  context.fillStyle = "#164d3d";
  context.font = "900 96px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 112, 108);
  context.textAlign = "left";
  context.fillStyle = "#111817";
  context.font = "900 58px Inter, Arial, sans-serif";
  context.fillText(formatDimension(measurement.value), 198, 94);
  context.fillStyle = "#667169";
  context.font = "800 36px Inter, Arial, sans-serif";
  context.fillText(measurement.description, 198, 142);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.renderOrder = 13;
  sprite.scale.copy(dimensionLabelNormalScale);
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
  sprite.scale.copy(isHovered ? dimensionLabelHoverScale : dimensionLabelNormalScale);
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
    polygonOffsetUnits: -2,
  });
}

function createWoodMaterial(transparent: boolean): Material {
  const material = new MeshStandardMaterial({
    color: woodColor,
    map: transparent ? undefined : createWoodTexture(),
    roughness: 0.72,
    metalness: 0.02,
    transparent,
    opacity: transparent ? 0.28 : 1,
    depthWrite: !transparent,
    polygonOffset: transparent,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  if (transparent) {
    material.side = DoubleSide;
    material.forceSinglePass = true;
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

function cameraViewScale(layout: LayoutResult): number {
  return modelViewScale(layout) / previewZoomForLayout(layout);
}

function previewZoomForLayout(layout: LayoutResult): number {
  if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    return staticReferencePreviewZoom;
  }

  const largestPhysicalDimension = previewLargestPhysicalDimensionMillimeters(layout);
  const sizeRatio = Math.max(1, largestPhysicalDimension / generatedPreviewZoomReferenceMillimeters);
  return clamp(generatedPreviewZoom / sizeRatio, minimumLargeModelPreviewZoom, generatedPreviewZoom);
}

function previewLargestPhysicalDimensionMillimeters(layout: LayoutResult): number {
  const settings = layout.configuration;
  if (isDonutFilterPrintDesignId(settings.printDesign.id)) {
    const model = createDonutFilterModel(layout);
    return Math.max(
      model.filter.length + donutAdapterTotalHeight(model) + donutCapTotalHeight(model),
      model.filter.outerDiameter,
      model.fanSize,
    );
  }

  if (isCorsiRosenthalPrintDesignId(settings.printDesign.id)) {
    const model = createCorsiRosenthalModel(layout);
    return Math.max(model.filterWidth, model.filterHeight, model.filterThickness);
  }

  return Math.max(
    filterSelectionDimensions(settings.filter).width,
    layout.summary.workingDepth,
    layout.summary.chamberHeight,
  );
}

function staticReferenceBoardExplodeOffset(
  geometry: BufferGeometry,
  assembly: LoadedStaticPrintAssembly,
  exploded: boolean,
): Vector3 {
  if (!exploded) {
    return new Vector3(0, 0, 0);
  }

  const bounds = staticReferenceGeometryBounds(geometry);
  const direction = staticReferenceBoardExplodeDirection(bounds, assembly);
  return direction.multiplyScalar(staticReferenceExplodeDistance);
}

function staticReferenceBoardExplodeDirection(bounds: Box3, assembly: LoadedStaticPrintAssembly): Vector3 {
  const center = bounds.getCenter(new Vector3());
  const halfFootprintWidth = assembly.footprintWidth / 2;
  const halfFootprintDepth = assembly.footprintDepth / 2;
  const halfHeight = assembly.height / 2;
  const locationDirection = new Vector3(
    normalizedStaticReferenceDistance(center.x, halfFootprintWidth),
    normalizedStaticReferenceDistance(center.y, halfFootprintDepth),
    normalizedStaticReferenceDistance(center.z - halfHeight, halfHeight),
  );

  if (locationDirection.lengthSq() > 0.01) {
    return locationDirection.normalize();
  }

  const verticalDirection = center.z >= halfHeight ? 1 : -1;
  return new Vector3(0, 0, verticalDirection);
}

function normalizedStaticReferenceDistance(value: number, halfExtent: number): number {
  if (halfExtent <= 0.001) {
    return 0;
  }
  return value / halfExtent;
}

function staticReferencePurchasedPartPosition(
  position: Vector3,
  explosion: StaticReferencePurchasedPartExplosion,
): Vector3 {
  if (!explosion.exploded || explosion.assembly === undefined) {
    return position;
  }
  return position.add(staticReferenceNearestBoardExplodeOffset(position, explosion.assembly));
}

function staticReferenceNearestBoardExplodeOffset(position: Vector3, assembly: LoadedStaticPrintAssembly): Vector3 {
  const sourcePoint = position.clone().multiplyScalar(1 / sceneScale);
  let nearestOffset = new Vector3(0, 0, 0);
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const asset of assembly.assets) {
    const bounds = staticReferenceGeometryBounds(asset.geometry);
    const distance = squaredDistanceToBox(sourcePoint, bounds);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestOffset = staticReferenceBoardExplodeOffset(asset.geometry, assembly, true);
    }
  }

  return nearestOffset;
}

function squaredDistanceToBox(point: Vector3, bounds: Box3): number {
  const dx = distanceOutsideRange(point.x, bounds.min.x, bounds.max.x);
  const dy = distanceOutsideRange(point.y, bounds.min.y, bounds.max.y);
  const dz = distanceOutsideRange(point.z, bounds.min.z, bounds.max.z);
  return dx * dx + dy * dy + dz * dz;
}

function distanceOutsideRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min - value;
  }
  if (value > max) {
    return value - max;
  }
  return 0;
}

function staticReferenceGeometryBounds(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds === null) {
    return new Box3();
  }
  return bounds.clone();
}

function staticReferenceAssembledPreviewPose(layout: LayoutResult): StaticReferenceAssembledPreviewPose {
  const orientation = staticPrintReferenceForPreset(layout.configuration.printDesign)?.assembledPreviewOrientation ?? "source";
  if (orientation === "fan-panel-up") {
    return {
      meshRotationX: Math.PI,
      rotateWholePreview: false,
      installedPartLayout: "fan-panel-up",
    };
  }
  if (orientation === "source-fans-up") {
    return {
      meshRotationX: Math.PI / 2,
      rotateWholePreview: true,
      installedPartLayout: "source-side-fans",
    };
  }
  if (orientation === "source-side-fans") {
    return {
      meshRotationX: 0,
      rotateWholePreview: false,
      installedPartLayout: "source-side-fans",
    };
  }
  return {
    meshRotationX: -Math.PI / 2,
    rotateWholePreview: false,
    installedPartLayout: "source-front",
  };
}

function modelViewScale(layout: LayoutResult): number {
  const settings = layout.configuration;
  const scalePadding = settings.preview.showBananaScale ? oneMeterCubeSize * 0.72 : 0;
  if (isStaticReferencePrintDesignId(settings.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(settings.printDesign);
    if (reference !== undefined && staticReferenceHasAssembledPreview(reference)) {
      return (reference.previewMaxDimensionMm ?? 540) * sceneScale * 1.35 + scalePadding;
    }
    const assetCount = reference?.previewAssets.length ?? 1;
    const columns = Math.max(1, Math.ceil(Math.sqrt(assetCount * 0.8)));
    const rows = Math.max(1, Math.ceil(assetCount / columns));
    const gridSpan = Math.max(columns, rows);
    return (
      (reference?.previewMaxDimensionMm ?? 560) *
        Math.max(1.35, gridSpan * 0.55) *
        staticReferenceSceneScale +
      scalePadding
    );
  }
  if (isDonutFilterPrintDesignId(settings.printDesign.id)) {
    const model = createDonutFilterModel(layout);
    const baseScale =
      Math.max(
        model.filter.length + donutAdapterTotalHeight(model) + donutCapTotalHeight(model),
        model.filter.outerDiameter,
        model.fanSize,
      ) *
      sceneScale *
      1.25;
    return baseScale + scalePadding;
  }
  if (isCorsiRosenthalPrintDesignId(settings.printDesign.id)) {
    const metrics = createCorsiPreviewMetrics(layout);
    return Math.max(metrics.boxWidth, metrics.boxHeight, metrics.boxDepth) * 1.16 + scalePadding;
  }
  return (
    Math.max(
      filterSelectionDimensions(settings.filter).width,
      layout.summary.workingDepth,
      layout.summary.chamberHeight,
    ) * sceneScale
  ) + scalePadding;
}

function staticReferenceHasAssembledPreview(reference: StaticPrintReference): boolean {
  return reference.assembledPreview !== undefined;
}

function staticReferencePreviewAssets(reference: StaticPrintReference): readonly StaticPrintPreviewAsset[] {
  if (reference.assembledPreview?.type === "single-source-asset") {
    return [reference.assembledPreview.asset];
  }
  if (reference.assembledPreview?.type === "source-part-set") {
    return reference.assembledPreview.assets;
  }
  return reference.previewAssets;
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
    sealedFaces: model.sealedFaces,
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

function corsiFanPanelSize(
  metrics: CorsiPreviewMetrics,
  placement: CorsiFanPanelPlacement,
): { readonly sizeU: number; readonly sizeV: number } {
  if (placement.axis === "x") {
    return { sizeU: metrics.boxDepth, sizeV: metrics.boxHeight };
  }
  return { sizeU: metrics.boxWidth, sizeV: metrics.boxDepth };
}

function corsiFaceNormal(side: CorsiFaceSide): Vector3 {
  if (side === "front") {
    return new Vector3(0, 0, 1);
  }
  if (side === "back") {
    return new Vector3(0, 0, -1);
  }
  if (side === "left") {
    return new Vector3(-1, 0, 0);
  }
  if (side === "right") {
    return new Vector3(1, 0, 0);
  }
  if (side === "top") {
    return new Vector3(0, 1, 0);
  }
  return new Vector3(0, -1, 0);
}

function corsiFaceCenter(metrics: CorsiPreviewMetrics, side: CorsiFaceSide): Vector3 {
  if (side === "front") {
    return new Vector3(0, metrics.boxHeight / 2, metrics.boxDepth / 2);
  }
  if (side === "back") {
    return new Vector3(0, metrics.boxHeight / 2, -metrics.boxDepth / 2);
  }
  if (side === "left") {
    return new Vector3(-metrics.boxWidth / 2, metrics.boxHeight / 2, 0);
  }
  if (side === "right") {
    return new Vector3(metrics.boxWidth / 2, metrics.boxHeight / 2, 0);
  }
  if (side === "top") {
    return new Vector3(0, metrics.boxHeight, 0);
  }
  return new Vector3(0, 0, 0);
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

function styleCorsiAirflowCue(cue: ArrowHelper): void {
  cue.traverse((child) => {
    if (child instanceof Line && child.material instanceof LineBasicMaterial) {
      child.material.transparent = true;
      child.material.opacity = 0.74;
      child.material.depthWrite = false;
      child.renderOrder = 8;
    }
    if (child instanceof Mesh && child.material instanceof MeshBasicMaterial) {
      child.material.transparent = true;
      child.material.opacity = 0.78;
      child.material.depthWrite = false;
      child.renderOrder = 8;
    }
  });
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

  if (appearance.previewCadModel?.type === "noctua-nf-a14-public-cad") {
    fan.add(createNoctuaCadFanCore(radius, appearance));
    return fan;
  }

  fan.add(createFanFrame(radius, appearance));
  fan.add(createFanShroud(radius, appearance));
  fan.add(createRearFanSupport(radius, appearance));

  const rotor = new Group();
  rotor.name = "fan-rotor";
  rotor.userData["fanRotor"] = true;
  addProceduralFanRotor(rotor, radius, appearance);
  fan.add(rotor);

  return fan;
}

function addProceduralFanRotor(rotor: Group, radius: number, appearance: FanAppearance): void {
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
}

const fanCadModelCache = new Map<string, Promise<LoadedFanCadModel>>();

function createNoctuaCadFanCore(radius: number, appearance: FanAppearance): Group {
  const core = new Group();
  core.name = "noctua-nf-a14-preview-cad";

  const fallbackStatic = new Group();
  fallbackStatic.add(createFanFrame(radius, appearance));
  fallbackStatic.add(createFanShroud(radius, appearance));
  fallbackStatic.add(createRearFanSupport(radius, appearance));

  const rotor = new Group();
  rotor.name = "fan-rotor";
  rotor.userData["fanRotor"] = true;
  const fallbackRotor = new Group();
  addProceduralFanRotor(fallbackRotor, radius, appearance);
  rotor.add(fallbackRotor);

  core.add(fallbackStatic, rotor);

  const cadModel = appearance.previewCadModel;
  if (cadModel === undefined) {
    return core;
  }

  void loadFanCadModel(cadModel.assetUrl, appearance)
    .then((model) => {
      fallbackStatic.visible = false;
      fallbackRotor.visible = false;
      const scale = (radius * 2) / model.nominalDiameter;

      for (const part of model.meshes) {
        const mesh = new Mesh(
          part.geometry,
          new MeshStandardMaterial({
            color: part.color,
            roughness: part.isRotor ? 0.5 : 0.62,
            metalness: part.isRotor ? 0.05 : 0.08,
          }),
        );
        mesh.name = part.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData["sharedCadGeometry"] = true;
        mesh.scale.setScalar(scale);
        if (part.isRotor) {
          rotor.add(mesh);
        } else {
          core.add(mesh);
        }
      }
    })
    .catch(() => {
      fallbackStatic.visible = true;
      fallbackRotor.visible = true;
    });

  return core;
}

async function loadFanCadModel(assetUrl: string, appearance: FanAppearance): Promise<LoadedFanCadModel> {
  const cached = fanCadModelCache.get(assetUrl);
  if (cached !== undefined) {
    return cached;
  }

  const promise = fetch(assetUrl)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`loadFanCadModel: Failed to load ${assetUrl}: ${response.status}`);
      }
      return (await response.json()) as FanCadPreviewAsset;
    })
    .then((asset) => createLoadedFanCadModel(asset, appearance))
    .catch((error) => {
      fanCadModelCache.delete(assetUrl);
      throw error;
    });
  fanCadModelCache.set(assetUrl, promise);
  return promise;
}

function createLoadedFanCadModel(asset: FanCadPreviewAsset, appearance: FanAppearance): LoadedFanCadModel {
  if (asset.schema !== "filterboxbuilder-fan-cad-preview-v1" || asset.usage !== "preview-only-purchased-part-visual") {
    throw new Error("createLoadedFanCadModel: Unsupported fan CAD preview asset");
  }

  return {
    nominalDiameter: asset.nominalDiameter,
    meshes: asset.meshes.map((mesh) => createLoadedFanCadMesh(mesh, asset.bounds.center, appearance)),
  };
}

function createLoadedFanCadMesh(
  mesh: FanCadPreviewMesh,
  center: readonly [number, number, number],
  appearance: FanAppearance,
): LoadedFanCadMesh {
  const positions: number[] = [];
  for (let index = 0; index < mesh.position.length; index += 3) {
    const sourceX = mesh.position[index] ?? 0;
    const sourceY = mesh.position[index + 1] ?? 0;
    const sourceZ = mesh.position[index + 2] ?? 0;
    positions.push(sourceX - center[0], sourceZ - center[2], sourceY - center[1]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex([...mesh.index]);
  geometry.computeVertexNormals();

  const isRotor = mesh.name.toLowerCase().includes("impeller");
  return {
    name: mesh.name,
    geometry,
    color: meshColor(mesh, isRotor, appearance),
    isRotor,
  };
}

function meshColor(mesh: FanCadPreviewMesh, isRotor: boolean, appearance: FanAppearance): number {
  if (mesh.color !== undefined) {
    const [red, green, blue] = mesh.color;
    return ((Math.round(red * 255) << 16) | (Math.round(green * 255) << 8) | Math.round(blue * 255)) >>> 0;
  }
  return isRotor ? appearance.bladeColor : appearance.hubColor;
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
