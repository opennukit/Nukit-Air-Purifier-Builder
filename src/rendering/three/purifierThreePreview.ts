import {
  PMREMGenerator,
  Texture,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  GridHelper,
  Group,
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
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Shape,
  Sprite,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { findPreviewMaterialColorPreset } from "@/domain/purifier/settingsModel";
import {
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
  staticPrintReferenceForPreset,
} from "@/domain/purifier/designPresets";
import type { FanAppearance } from "@/domain/purifier/fanProducts";
import type { LayoutResult } from "@/fabrication/purifierLayout";
import { filterSelectionDimensions } from "@/domain/purifier/filter";
import {
  loadStaticPrintAssemblyAssets,
  loadStaticPrintAssets,
  type LoadedStaticPrintAssembly,
  type LoadedStaticPrintAsset,
} from "@/rendering/three/staticPrintAssets";
import {
  staticPrintReferenceHasAssembledPreview,
} from "@/resources/static-print-references/references";
import {
  createAssemblyModel,
  type AssemblyBoxPart,
} from "@/fabrication/assemblyModel";
import {
  createDonutFilterModel,
  type DonutFilterCap,
  type DonutFilterModel,
} from "@/domain/designs/donut-filter/model";
import {
  createTempestModel,
  type TempestModel,
  type TempestPrintablePose,
  type TempestWallFanLayout,
} from "@/domain/designs/tempest/model";
import { matchTopology } from "@/domain/designs/tempest/topology";
import {
  createTempestPrintableKitFromLayout,
  createTempestPrintablePose,
  createTempestSettingsFromLayout,
} from "@/fabrication/printing/designs/tempest/printableKit";
import type { PrintableSheetPlan } from "@/fabrication/printing/printableKit";
import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE_PRESET_ID,
  setActiveAppearance,
} from "@/rendering/three/preview/appearance";
import {
  createCutMarkMaterial,
  createFilterMediaEdgeMaterial,
  createFilterMediaMaterial,
  createGroundShadowTexture,
  createPrintedPartEdgeMaterial,
  createPrintedPartMaterial,
  createStudioBackdropTexture,
  createWoodMaterial,
} from "@/rendering/three/preview/materials";
import {
  applyDimensionHover,
  boundsInModelGroupSpace,
  collectDimensionTargets,
  createDimensionGroup,
  createSeamGroup,
  createStaticReferenceDimensionGroup,
  readDimensionId,
} from "@/rendering/three/preview/assemblyCues";
import {
  cameraPosition,
  cameraViewScale,
  clamp,
  explodeGeneratedPreviewChildrenFromCenter,
  previewInteriorShiftForBounds,
  toScenePosition,
} from "@/rendering/three/preview/sceneMath";
import { collectFanRotors, createFan } from "@/rendering/three/preview/fanModels";
import {
  createPanelGroup,
  createPanelPrintSeams,
  createPreviewEdges,
  createPrintableMeshPreviewGroup,
} from "@/rendering/three/preview/panelMeshes";
import {
  createTempestPreviewBox,
  expectSandwichArrangementFilter,
  moveTempestFanInsideWall,
  tempestCsgAxisToSceneAxis,
  tempestCsgPointToScene,
  tempestHorizontalFilterBoxes,
  tempestPreviewWalls,
  tempestTowerFilterBoxes,
  tempestWallInteriorFanCenter,
  tempestWallNormalAxis,
} from "@/rendering/three/preview/tempestParts";
import {
  createBananaScaleReference,
  createOneMeterScaleCube,
  disposeMaterial,
} from "@/rendering/three/preview/scaleReferences";
import {
  disposeLoadedStaticPrintAssets,
  staticReferenceAssembledPreviewPose,
  staticReferenceBoardExplodeOffset,
  staticReferencePreviewAssets,
  staticReferencePurchasedPartPosition,
} from "@/rendering/three/preview/staticReference";
import {
  bananaReferenceLength,
  burnColor,
  edgeColor,
  fanPreviewRearDepthMillimeters,
  fanRotorAngularVelocity,
  groundY,
  homePreviewRotationX,
  oneMeterCubeSize,
  previewControlClearanceTargetOffset,
  previewFanWallInset,
  sceneScale,
  staticReferenceSceneScale,
  visualAssemblyBoxSize,
  type CameraPose,
  type PreviewInteriorPlane,
  type StaticReferenceAssembledPreviewPose,
  type StaticReferenceAssemblyMetrics,
  type StaticReferencePurchasedPartExplosion,
} from "@/rendering/three/preview/previewData";

// #######################################
// Preview Class
// #######################################

export class PurifierThreePreview {
  // ##############################
  // Scene State
  // ##############################

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
  private latestPrintSeamPlan: PrintableSheetPlan | null = null;
  private readonly lightGroup = new Group();
  private roomEnvTexture: Texture | null = null;
  private hoveredDimensionId: string | null = null;
  private dimensionTargets: Object3D[] = [];
  private readonly fanRotors: Object3D[] = [];
  private readonly modelFocus = new Vector3();
  private latestViewScale = 1;
  private previousAnimationTime = performance.now();
  private staticReferenceLoadToken = 0;
  private destroyed = false;

  // ##############################
  // Initialization
  // ##############################

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    // Soft light studio backdrop: a gentle warm-white vertical gradient reads as
    // a clean white background while giving the framed viewport a little depth.
    this.renderer.setClearColor(0x000000, 0);
    this.scene.background = createStudioBackdropTexture();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Soft cast shadow on the floor: the box's shadow falls in a fixed world
    // direction and sweeps across the view as you orbit — the clearest cue that the
    // box is stationary and the camera is the thing moving.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.container.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = false;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 14;
    // Keep the camera above the floor — you orbit around a box sitting on a surface,
    // you don't fly underneath it. This reinforces "fixed box, moving camera".
    this.controls.maxPolarAngle = Math.PI * 0.5;
    this.raycaster.params.Line = { threshold: 0.045 };
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.clearDimensionHover);

    this.scene.add(this.modelGroup);
    this.scene.add(this.staticSceneGroup);
    this.scene.add(this.scaleReferenceGroup);
    // Lighting/material come from the active appearance preset (see Appearance Lab).
    this.scene.add(this.lightGroup);
    this.applyAppearancePreset(DEFAULT_APPEARANCE_PRESET_ID);

    // A large matte floor the box visibly rests on. Lit by the (world-fixed) rig, it
    // gives perspective + parallax as you orbit, so the scene reads as a stationary
    // box on a surface with the camera moving around it — not a floating object.
    const floor = new Mesh(
      new PlaneGeometry(160, 160),
      new MeshStandardMaterial({ color: 0xd9d5cb, roughness: 0.97, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = groundY - 0.02;
    floor.receiveShadow = true;
    this.staticSceneGroup.add(floor);

    // Soft contact shadow sitting just on top of the floor, anchoring the box.
    const shadow = new Mesh(
      new CircleGeometry(2.4, 96),
      new MeshBasicMaterial({ map: createGroundShadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = groundY;
    this.staticSceneGroup.add(shadow);

    // A faint world-fixed floor grid. As the camera orbits, the grid slides in
    // perspective — the clearest cue that the box is stationary and you are moving.
    const grid = new GridHelper(30, 30, 0xb4b0a4, 0xc6c2b6);
    grid.position.y = groundY + 0.003;
    if (grid.material instanceof LineBasicMaterial) {
      grid.material.transparent = true;
      grid.material.opacity = 0.38;
    }
    this.staticSceneGroup.add(grid);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate();
  }

  // ##############################
  // Public API
  // ##############################

  update(layout: LayoutResult, printSeamPlan: PrintableSheetPlan | null = null): void {
    if (this.destroyed) {
      return;
    }
    const previousLayout = this.latestLayout;
    const previousPose = previousLayout === null ? null : this.captureCameraPose();
    const shouldApplyPresetCamera =
      previousLayout === null ||
      previousLayout.configuration.preview.enclosure.cameraPreset !== layout.configuration.preview.enclosure.cameraPreset;

    this.latestLayout = layout;
    this.latestPrintSeamPlan = printSeamPlan;
    this.rebuildModel(layout, printSeamPlan);
    if (shouldApplyPresetCamera) {
      this.frameModel(layout);
    } else {
      this.restoreCameraPose(layout, previousPose);
    }
  }

  applyAppearancePreset(presetId: string): void {
    if (this.destroyed) {
      return;
    }
    const preset = APPEARANCE_PRESETS.find((candidate) => candidate.id === presetId) ?? APPEARANCE_PRESETS[0];
    setActiveAppearance(preset.surface);
    this.lightGroup.clear();
    let shadowAssigned = false;
    for (const light of preset.lights()) {
      // The first directional is the key — let it cast the floor shadow.
      if (!shadowAssigned && light instanceof DirectionalLight) {
        light.castShadow = true;
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.bias = -0.0006;
        const shadowCamera = light.shadow.camera;
        shadowCamera.near = 0.5;
        shadowCamera.far = 30;
        shadowCamera.left = -7;
        shadowCamera.right = 7;
        shadowCamera.top = 7;
        shadowCamera.bottom = -7;
        shadowCamera.updateProjectionMatrix();
        shadowAssigned = true;
      }
      this.lightGroup.add(light);
    }
    this.scene.environment = preset.environment === "room" ? this.roomEnvironment() : null;
    this.renderer.toneMapping = preset.toneMapping;
    this.renderer.toneMappingExposure = preset.exposure;
    // Material + surface normals are baked at build time, so rebuild the model.
    if (this.latestLayout !== null) {
      this.rebuildModel(this.latestLayout, this.latestPrintSeamPlan);
    }
  }

  private roomEnvironment(): Texture {
    if (this.roomEnvTexture === null) {
      const pmrem = new PMREMGenerator(this.renderer);
      this.roomEnvTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    return this.roomEnvTexture;
  }

  setAutoRotate(enabled: boolean): void {
    if (this.destroyed) {
      return;
    }
    this.controls.autoRotate = enabled;
    this.controls.update();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.staticReferenceLoadToken += 1;
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
    this.roomEnvTexture?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ##############################
  // Model Rebuilds
  // ##############################

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
    if (isTempestPrintDesignId(layout.configuration.printDesign.id)) {
      this.rebuildTempestModel(layout);
      return;
    }
    const assembly = createAssemblyModel(layout);
    const settings = layout.configuration;

    const wood = createWoodMaterial();
    const railWood = createWoodMaterial();
    const darkEdge = new LineBasicMaterial({ color: edgeColor });
    const seamMaterial = new LineBasicMaterial({ color: burnColor, transparent: true, opacity: 0.78 });
    const printSeamMaterial = new LineBasicMaterial({ color: 0x2b6fd6, transparent: true, opacity: 0.9 });
    const panelPrintSeams = createPanelPrintSeams(printSeamPlan);
    const cutMark = createCutMarkMaterial(0.54);
    const screwMark = createCutMarkMaterial(0.68);
    const filter = createFilterMediaMaterial(settings.filterCount === 2 ? 0.55 : 0.73);
    const fanAppearance = settings.fan.productSelection.product.appearance;

    for (const panel of assembly.panels) {
      const panelGroup = createPanelGroup(
        panel,
        settings.cutting.materialThickness,
        settings.preview.enclosure.showFans,
        fanAppearance,
        settings.preview.enclosure.explodedView,
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

    if (settings.preview.enclosure.showFilterFrame) {
      if (assembly.filterRails.length > 0) {
        for (const rail of assembly.filterRails) {
          this.modelGroup.add(
            createPanelGroup(
              rail,
              settings.cutting.materialThickness,
              false,
              fanAppearance,
              settings.preview.enclosure.explodedView,
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
          this.addAssemblyBox(frame, settings.preview.enclosure.explodedView, railWood, darkEdge);
        }
      }
    }
    if (settings.preview.enclosure.showFilterMedia) {
      for (const media of assembly.filterMedia) {
        this.addAssemblyBox(media, settings.preview.enclosure.explodedView, filter, darkEdge);
      }
    }
    if (!settings.preview.enclosure.explodedView) {
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

    if (settings.preview.enclosure.showDimensions) {
      const dimensionGroup = createDimensionGroup(assembly.dimensions);
      this.modelGroup.add(dimensionGroup);
      this.dimensionTargets = collectDimensionTargets(dimensionGroup);
    }
  }

  // ##############################
  // Static Reference Models
  // ##############################

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
      staticPrintReferenceHasAssembledPreview(reference) && reference.assembledPreview?.type === "source-part-set"
        ? loadStaticPrintAssemblyAssets(reference.assembledPreview.assets).then((assembly) => ({ type: "assembly" as const, assembly }))
        : loadStaticPrintAssets(previewAssets).then((assets) => ({ type: "assets" as const, assets }));

    void assetsPromise
      .then((loaded) => {
        if (!this.isStaticReferenceLoadCurrent(loadToken)) {
          const disposableAssets = loaded.type === "assets" ? loaded.assets : loaded.assembly.assets;
          disposeLoadedStaticPrintAssets(disposableAssets);
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
        if (layout.configuration.preview.enclosure.showDimensions) {
          const dimensionGroup = createStaticReferenceDimensionGroup(boundsInModelGroupSpace(outline, this.modelGroup));
          this.modelGroup.add(dimensionGroup);
          this.dimensionTargets = collectDimensionTargets(dimensionGroup);
        }
        this.updateModelFocus(new Box3().setFromObject(this.modelGroup));
        this.frameModel(layout);
      })
      .catch((error) => {
        if (!this.isStaticReferenceLoadCurrent(loadToken)) {
          return;
        }
        console.warn("rebuildStaticReferenceModel: Failed to load static STL reference", error);
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
    const shouldExplode = layout.configuration.preview.enclosure.explodedView;

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

    if (settings.preview.enclosure.showFilterMedia) {
      if (pose.installedPartLayout === "fan-panel-up") {
        this.addStaticReferenceTopFilter(assembly, layout, target);
      } else if (pose.installedPartLayout === "source-side-fans") {
        this.addStaticReferenceSideFanFilters(assembly, layout, target);
      } else {
        this.addStaticReferenceFilter(assembly, layout, target);
      }
    }

    if (!settings.preview.enclosure.showFans) {
      return;
    }

    const fanRadius = (settings.fan.spec.diameter / 2) * sceneScale;
    if (pose.installedPartLayout === "source-side-fans") {
      // The assembled body sits in z ∈ [0, height] (its near face is the z = 0 plane),
      // so "inside the case" is +z. Recess each fan into the body the same way Tempest
      // wall fans are inset, rather than leaving it proud of the outer surface.
      const bodyNearFace: PreviewInteriorPlane = { axis: "z", coordinate: 0, insideSign: 1, inset: previewFanWallInset };
      const centerSpacing = Math.min(assetWidth / 4, fanRadius * 2.08);
      for (const x of [-1.5, -0.5, 0.5, 1.5].map((multiplier) => multiplier * centerSpacing)) {
        const fan = createFan({
          axis: "z",
          position: new Vector3(x, 0, 0),
          radius: fanRadius,
          appearance: settings.fan.productSelection.product.appearance,
        });
        fan.name = "static-reference-installed-side-fan";
        fan.position.z += previewInteriorShiftForBounds(new Box3().setFromObject(fan), bodyNearFace);
        fan.position.copy(staticReferencePurchasedPartPosition(fan.position.clone(), explosion));
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
      createFilterMediaMaterial(0.77),
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
        createFilterMediaMaterial(0.63),
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
      createFilterMediaMaterial(0.77),
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

  // ##############################
  // Generated Enclosure Helpers
  // ##############################

  private addAssemblyBox(part: AssemblyBoxPart, exploded: boolean, material: Material, edgeMaterial: Material): void {
    const [width, height, depth] = visualAssemblyBoxSize(part);
    const geometry = new BoxGeometry(width * sceneScale, height * sceneScale, depth * sceneScale);
    const mesh = new Mesh(geometry, material);
    mesh.name = part.id;
    mesh.position.copy(toScenePosition(part.position, part.explodeDirection, exploded));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);

    const edges = createPreviewEdges(geometry, edgeMaterial);
    edges.position.copy(mesh.position);
    this.modelGroup.add(edges);
  }

  private addScaleReference(layout: LayoutResult, modelBounds: Box3): void {
    if (!layout.configuration.preview.enclosure.showBananaScale) {
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

  // ##############################
  // Generated Design Models
  // ##############################

  private rebuildDonutFilterModel(layout: LayoutResult): void {
    const settings = layout.configuration;
    const model = createDonutFilterModel(layout);
    const fanAppearance = settings.fan.productSelection.product.appearance;
    const printedPartColor = findPreviewMaterialColorPreset(settings.preview.enclosure.materialColor).color;
    const adapterMaterial = createPrintedPartMaterial({
      color: printedPartColor,
      roughness: 0.48,
      metalness: 0.04,
    });
    const blackMaterial = new MeshStandardMaterial({ color: 0x0c0f0d, roughness: 0.62, metalness: 0.08 });
    const capMaterial = createPrintedPartMaterial({
      color: printedPartColor,
      roughness: 0.48,
      metalness: 0.04,
    });
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

    if (settings.preview.enclosure.showFilterMedia) {
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

    if (model.cap.type === "printed-cap" && settings.preview.enclosure.showFilterFrame) {
      this.addDonutCap(model.cap, filterEndX, filterRadius, capMaterial, edgeMaterial);
    }

    if (settings.preview.enclosure.showFans) {
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

    explodeGeneratedPreviewChildrenFromCenter(this.modelGroup, settings.preview.enclosure.explodedView);

    const outline = new Box3().setFromObject(this.modelGroup);
    const center = outline.getCenter(new Vector3());
    this.modelGroup.position.sub(center);
    const centeredOutline = new Box3().setFromObject(this.modelGroup);
    this.modelGroup.position.y += groundY - centeredOutline.min.y;
    const settledOutline = new Box3().setFromObject(this.modelGroup);
    this.addScaleReference(layout, settledOutline);
    this.updateModelFocus(settledOutline);
  }

  private rebuildTempestModel(layout: LayoutResult): void {
    const settings = layout.configuration;
    const tempestModel = createTempestModel(createTempestSettingsFromLayout(layout));
    const pose = createTempestPrintablePose(tempestModel);
    const kit = createTempestPrintableKitFromLayout(layout, "unsplit");
    const printedPartColor = findPreviewMaterialColorPreset(settings.preview.enclosure.materialColor).color;
    const material = createPrintedPartMaterial({
      color: printedPartColor,
      roughness: 0.85,
      metalness: 0.05,
    });
    const edgeMaterial = createPrintedPartEdgeMaterial(printedPartColor, 0.58);

    for (const part of kit.parts) {
      this.modelGroup.add(
        createPrintableMeshPreviewGroup(
          part.mesh,
          material,
          edgeMaterial,
          `tempest-preview-${part.id}`,
          settings.preview.enclosure.showPreviewEdges,
        ),
      );
    }

    this.addTempestPreviewPurchasedParts(tempestModel, pose, settings.fan.productSelection.product.appearance, {
      showFilterMedia: settings.preview.enclosure.showFilterMedia,
      showFans: settings.preview.enclosure.showFans,
      showPreviewEdges: settings.preview.enclosure.showPreviewEdges,
    });

    const dimensionBounds = new Box3().setFromObject(this.modelGroup);
    explodeGeneratedPreviewChildrenFromCenter(this.modelGroup, settings.preview.enclosure.explodedView);

    const outline = this.settleModelOnGround();
    this.addScaleReference(layout, outline);
    if (layout.configuration.preview.enclosure.showDimensions) {
      const dimensionGroup = createStaticReferenceDimensionGroup(dimensionBounds);
      this.modelGroup.add(dimensionGroup);
      this.dimensionTargets = collectDimensionTargets(dimensionGroup);
      this.updateModelFocus(new Box3().setFromObject(this.modelGroup));
      return;
    }
    this.updateModelFocus(outline);
  }

  private addTempestPreviewPurchasedParts(
    model: TempestModel,
    pose: TempestPrintablePose,
    fanAppearance: FanAppearance,
    visibility: { readonly showFilterMedia: boolean; readonly showFans: boolean; readonly showPreviewEdges: boolean },
  ): void {
    if (visibility.showFilterMedia) {
      this.addTempestPreviewFilters(model, pose, visibility.showPreviewEdges);
    }
    if (visibility.showFans) {
      this.addTempestPreviewFans(model, pose, fanAppearance);
    }
  }

  private addTempestPreviewFilters(model: TempestModel, pose: TempestPrintablePose, showPreviewEdges: boolean): void {
    const { material, filterBoxes } = matchTopology(model, {
      sandwich: (m) => ({
        material: createFilterMediaMaterial(0.61),
        filterBoxes: tempestHorizontalFilterBoxes(m, m.filterLayout, expectSandwichArrangementFilter(m.settings.arrangement)),
      }),
      quad: (m) => ({
        material: createFilterMediaMaterial(0.69),
        filterBoxes: tempestTowerFilterBoxes(m, m.filterLayout),
      }),
    });
    const edgeMaterial = createFilterMediaEdgeMaterial(0.36);
    for (const [index, box] of filterBoxes.entries()) {
      this.modelGroup.add(
        createTempestPreviewBox(box, pose, material, edgeMaterial, `tempest-filter-${index}`, showPreviewEdges),
      );
    }
  }

  private addTempestPreviewFans(model: TempestModel, pose: TempestPrintablePose, fanAppearance: FanAppearance): void {
    matchTopology(model, {
      sandwich: (m) => {
        const { fanLayout } = m;
        for (const wall of tempestPreviewWalls) {
          this.addTempestWallFans(m, pose, fanLayout.walls[wall], fanLayout.localVerticalCenter, fanAppearance);
        }
      },
      quad: (m) => {
        const { fanLayout } = m;
        const topFanCenterZ = m.box.height - m.filterLayout.topPlateThickness - fanPreviewRearDepthMillimeters;
        for (const x of fanLayout.positionsX) {
          for (const y of fanLayout.positionsY) {
            const fan = createFan({
              axis: tempestCsgAxisToSceneAxis("z", pose),
              position: tempestCsgPointToScene({ x, y, z: topFanCenterZ }, pose),
              radius: (model.settings.fan.diameter / 2) * sceneScale,
              appearance: fanAppearance,
            });
            collectFanRotors(fan, this.fanRotors);
            this.modelGroup.add(fan);
          }
        }
      },
    });
  }

  private addTempestWallFans(
    model: TempestModel,
    pose: TempestPrintablePose,
    layout: TempestWallFanLayout,
    localVerticalCenter: number,
    fanAppearance: FanAppearance,
  ): void {
    for (const position of layout.positionsAlongWall) {
      const fan = createFan({
        axis: tempestCsgAxisToSceneAxis(tempestWallNormalAxis(layout.wall), pose),
        position: tempestCsgPointToScene(tempestWallInteriorFanCenter(model, layout.wall, position, localVerticalCenter), pose),
        radius: (model.settings.fan.diameter / 2) * sceneScale,
        appearance: fanAppearance,
      });
      moveTempestFanInsideWall(fan, model, pose, layout.wall);
      collectFanRotors(fan, this.fanRotors);
      this.modelGroup.add(fan);
    }
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

    const edges = createPreviewEdges(geometry, edgeMaterial);
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

  private addDonutCap(
    cap: Extract<DonutFilterCap, { readonly type: "printed-cap" }>,
    filterEndX: number,
    centerY: number,
    material: Material,
    edgeMaterial: Material,
  ): void {
    const capRadius = (cap.outerDiameter / 2) * sceneScale;
    const capThickness = cap.thickness * sceneScale;
    const insertLength = cap.insertLength * sceneScale;
    this.addDonutSolidCylinder(capRadius, capThickness, filterEndX + capThickness / 2, centerY, material, edgeMaterial);
    this.addDonutCylinderShell(
      (cap.holeDiameter / 2) * sceneScale,
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

  // ##############################
  // Camera and Interaction
  // ##############################

  private frameModel(layout: LayoutResult): void {
    const settings = layout.configuration;
    const maxDimension = cameraViewScale(layout);
    const target = this.cameraTarget(layout, maxDimension);
    const position = cameraPosition(settings.preview.enclosure.cameraPreset, maxDimension);
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
    if (layout.configuration.preview.enclosure.cameraPreset !== "top") {
      target.y += viewScale * previewControlClearanceTargetOffset;
    }
    return target;
  }

  private applyCameraSettings(layout: LayoutResult): void {
    const settings = layout.configuration;
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.controls.autoRotate = settings.preview.enclosure.autoRotate;
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
  }

  private animate = (): void => {
    if (this.destroyed) {
      return;
    }
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
    if (this.destroyed) {
      return;
    }
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
    if (this.destroyed) {
      return;
    }
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

  // ##############################
  // Disposal
  // ##############################

  private disposeObject(object: Object3D): void {
    const seenMaterials = new Set<Material>();
    object.traverse((child) => {
      child.userData["disposedPreviewObject"] = true;
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

  private isStaticReferenceLoadCurrent(loadToken: number): boolean {
    return !this.destroyed && loadToken === this.staticReferenceLoadToken;
  }
}
