import {
  ACESFilmicToneMapping,
  PMREMGenerator,
  Texture,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  AmbientLight,
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
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  Vector2,
  WebGLRenderer,
} from "three";
import type { ToneMapping } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  printableMeshToBufferGeometry,
  type PrintableMeshShading,
} from "@/rendering/three/printableMeshGeometry";
import {
  findPreviewMaterialColorPreset,
  isDonutFilterPrintDesignId,
  isStaticReferencePrintDesignId,
  isTempestPrintDesignId,
  staticPrintReferenceForPreset,
  type CameraPreset,
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
import {
  staticPrintReferenceHasAssembledPreview,
  type StaticPrintPreviewAsset,
  type StaticPrintReference,
} from "@/resources/static-print-references/references";
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
import {
  createDonutFilterModel,
  donutAdapterTotalHeight,
  donutCapTotalHeight,
  type DonutFilterCap,
  type DonutFilterModel,
} from "@/domain/designs/donut-filter/model";
import {
  createTempestModel,
  type TempestFilterLayout,
  type TempestModel,
  type TempestPrintablePose,
  type TempestWall,
  type TempestWallFanLayout,
} from "@/domain/designs/tempest/model";
import { assertNever, matchTopology } from "@/domain/designs/tempest/topology";
import type { CutFeature, CutPanel, RectCut } from "@/fabrication/laser/cutGeometry";
import {
  createTempestPrintableKitFromLayout,
  createTempestPrintablePose,
  createTempestSettingsFromLayout,
} from "@/fabrication/printing/designs/tempest/printableKit";
import type { PrintableMesh, PrintableSheetPlan, PrintableTileSource } from "@/fabrication/printing/printableKit";

// #######################################
// Appearance Lab (temporary surface/lighting experiment)
// #######################################
// A throwaway set of material + lighting "looks" to flip between in a floating
// selector and pick the nicest surface. Once chosen, drop the rest and inline the
// winner. Each preset drives the printed-part material, the lighting rig, an
// optional IBL environment, and tone mapping.

type PrintedSurfaceSpec = {
  readonly kind: "standard" | "physical";
  readonly normals: "flat" | "creased";
  readonly roughness: number;
  readonly metalness: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly envMapIntensity?: number;
};

type AppearancePreset = {
  readonly id: string;
  readonly label: string;
  readonly surface: PrintedSurfaceSpec;
  readonly environment: "room" | "none";
  readonly toneMapping: ToneMapping;
  readonly exposure: number;
  readonly lights: () => Object3D[];
};

function directionalLight(intensity: number, position: readonly [number, number, number], color = 0xffffff): DirectionalLight {
  const light = new DirectionalLight(color, intensity);
  light.position.set(position[0], position[1], position[2]);
  return light;
}

const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  {
    id: "studio",
    label: "Studio matte",
    // The product look: a matte creased-normal surface, a dominant world-fixed key
    // (which casts the floor shadow), a soft opposing fill, a uniform ambient, and a
    // faint IBL accent. The key being clearly directional is intentional — its cast
    // shadow on the floor is the cue that the box is fixed and the camera orbits it.
    surface: { kind: "standard", normals: "creased", roughness: 0.68, metalness: 0, envMapIntensity: 0.3 },
    environment: "room",
    toneMapping: ACESFilmicToneMapping,
    exposure: 0.72,
    lights: () => [
      new AmbientLight(0xffffff, 0.35),
      directionalLight(1.15, [3, 4.5, 2.5]),
      directionalLight(0.4, [-2.5, 2, -3.2], 0xeef2ff),
    ],
  },
];

const DEFAULT_APPEARANCE_PRESET_ID = "studio";
// Smooth shading within faces but crisp at dihedral angles >= this, so box edges
// and chamfers stay sharp while grills and rounded corners read smooth.
const CREASE_ANGLE_RADIANS = (40 * Math.PI) / 180;

let activeAppearance: PrintedSurfaceSpec = APPEARANCE_PRESETS[0].surface;

// #######################################
// Preview Model
// #######################################

// ##############################
// Fan Preview Data
// ##############################

type FanAxis = "x" | "y" | "z";

type FanPlacement = {
  axis: FanAxis;
  position: Vector3;
  radius: number;
};

type TempestCsgPoint = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type TempestCsgBox = {
  readonly min: TempestCsgPoint;
  readonly size: TempestCsgPoint;
};

export type PreviewInteriorPlane = {
  readonly axis: FanAxis;
  readonly coordinate: number;
  readonly insideSign: -1 | 1;
  readonly inset: number;
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

// ##############################
// Camera and Seam Data
// ##############################

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

// ##############################
// Design Preview Metrics
// ##############################

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

// ##############################
// Scene Constants
// ##############################

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
const fanPreviewFrontDepth = 0.018;
const fanPreviewRearDepth = 0.047;
const fanPreviewFrontDepthMillimeters = fanPreviewFrontDepth / sceneScale;
const fanPreviewRearDepthMillimeters = fanPreviewRearDepth / sceneScale;
const previewFanWallInset = 0.8 * sceneScale;
const filterMediaPreviewClearanceMillimeters = 3;
const filterMediaPreviewSurfaceGapMillimeters = 2;
const bananaReferenceLength = 180 * sceneScale;
const bananaReferenceRadius = 14 * sceneScale;
const oneMeterCubeSize = 1000 * sceneScale;
const staticReferenceExplodeDistance = 46 * sceneScale;
const generatedPreviewExplodeDistance = 72 * sceneScale;
const bananaScaleAssetUrl = "/vendor/scale-reference/banana/banana.glb";
const dimensionLabelNormalScale = new Vector3(1.37, 0.367, 1);
const dimensionLabelHoverScale = new Vector3(1.9, 0.51, 1);
const dimensionLabelOffsetMultiplier = 1.18;
const dimensionPreviewFramingMultiplier = 1.2;
const staticReferencePreviewZoom = 1.52;
const generatedPreviewZoom = 1.5;
const generatedPreviewZoomReferenceMillimeters = 360;
const minimumLargeModelPreviewZoom = 0.85;
const previewControlClearanceTargetOffset = 0.1;
// Local +Y is the exhaust/back side of the fan, which faces outside the purifier.
// Positive Y rotation reads as slow clockwise motion from that outside view.
const fanRotorAngularVelocity = 0.9;

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
    activeAppearance = preset.surface;
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
    const { material, filterBoxes } = matchTopology(model.topology, {
      sandwich: () => ({
        material: createFilterMediaMaterial(0.61),
        filterBoxes: tempestHorizontalFilterBoxes(model, expectSandwichFilterLayout(model.filterLayout)),
      }),
      quad: () => ({
        material: createFilterMediaMaterial(0.69),
        filterBoxes: tempestTowerFilterBoxes(model, expectQuadFilterLayout(model.filterLayout)),
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
    matchTopology(model.topology, {
      sandwich: () => {
        const fanLayout = expectSandwichFanLayout(model.fanLayout);
        for (const wall of tempestPreviewWalls) {
          this.addTempestWallFans(model, pose, fanLayout.walls[wall], fanLayout.localVerticalCenter, fanAppearance);
        }
      },
      quad: () => {
        const fanLayout = expectQuadFanLayout(model.fanLayout);
        const topFanCenterZ = tempestTowerTopFanCenterZ(model);
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

// #######################################
// Loaded Asset Disposal
// #######################################

function disposeLoadedStaticPrintAssets(assets: readonly LoadedStaticPrintAsset[]): void {
  for (const asset of assets) {
    asset.geometry.dispose();
  }
}

// #######################################
// Scale References
// #######################################

function createBananaScaleReference(): Group {
  const group = new Group();
  group.name = "banana-for-scale";

  const placeholder = createBananaScaleBoundsPlaceholder();
  group.add(placeholder);

  void loadBananaScaleAsset()
    .then((asset) => {
      if (group.userData["disposedPreviewObject"] === true) {
        return;
      }
      group.remove(placeholder);
      disposeMeshResources(placeholder);
      group.add(createNormalizedBananaScaleAsset(asset));
    })
    .catch(() => {
      if (group.userData["disposedPreviewObject"] === true) {
        return;
      }
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

function recessedMillimeterFilterMediaThickness(size: number): number {
  return Math.max(1, size - filterMediaPreviewSurfaceGapMillimeters * 2);
}

// #######################################
// Tempest Preview Purchased Parts
// #######################################

function tempestHorizontalFilterBoxes(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): readonly TempestCsgBox[] {
  // Reached only from the sandwich preview arm, so the arrangement is a sandwich
  // one carrying footprint dimensions.
  if (model.settings.arrangement.type === "four-side-filter-tower") {
    return [];
  }
  const filter = model.settings.arrangement.filter;
  const inset = filterMediaPreviewClearanceMillimeters;
  const surfaceGap = filterMediaPreviewSurfaceGapMillimeters;
  return filterLayout.filters.map((layer) => ({
    min: {
      x: model.frame.wallThickness + inset,
      y: model.frame.wallThickness + inset,
      z: layer.zBottom + surfaceGap,
    },
    size: {
      x: visualFilterMediaDimension(filter.footprintWidth),
      y: visualFilterMediaDimension(filter.footprintDepth),
      z: recessedMillimeterFilterMediaThickness(filter.thickness),
    },
  }));
}

function tempestTowerFilterBoxes(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): readonly TempestCsgBox[] {
  const filter = filterLayout.filter; // carried on the quad layout
  const inset = filterMediaPreviewClearanceMillimeters;
  const surfaceGap = filterMediaPreviewSurfaceGapMillimeters;
  const faceWidth = visualFilterMediaDimension(filter.faceWidth);
  const faceHeight = visualFilterMediaDimension(filter.faceHeight);
  const filterThickness = recessedMillimeterFilterMediaThickness(filter.thickness);
  const z = filterLayout.bottomPlateThickness + inset;
  return [
    {
      min: { x: filterLayout.structuralOffset + inset, y: model.frame.outsideFlangeThickness + surfaceGap, z },
      size: { x: faceWidth, y: filterThickness, z: faceHeight },
    },
    {
      min: {
        x: filterLayout.structuralOffset + inset,
        y: model.box.depth - model.frame.outsideFlangeThickness - filter.thickness + surfaceGap,
        z,
      },
      size: { x: faceWidth, y: filterThickness, z: faceHeight },
    },
    {
      min: { x: model.frame.outsideFlangeThickness + surfaceGap, y: filterLayout.structuralOffset + inset, z },
      size: { x: filterThickness, y: faceWidth, z: faceHeight },
    },
    {
      min: {
        x: model.box.width - model.frame.outsideFlangeThickness - filter.thickness + surfaceGap,
        y: filterLayout.structuralOffset + inset,
        z,
      },
      size: { x: filterThickness, y: faceWidth, z: faceHeight },
    },
  ];
}

function createTempestPreviewBox(
  box: TempestCsgBox,
  pose: TempestPrintablePose,
  material: Material,
  edgeMaterial: Material,
  name: string,
  showPreviewEdges: boolean,
): Group {
  const bounds = new Box3().setFromPoints(tempestCsgBoxCorners(box).map((point) => tempestCsgPointToScene(point, pose)));
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const geometry = new BoxGeometry(size.x, size.y, size.z);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(center);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new Group();
  group.add(mesh);
  if (showPreviewEdges) {
    const edges = createPreviewEdges(geometry, edgeMaterial);
    edges.position.copy(center);
    group.add(edges);
  }
  return group;
}

function tempestCsgBoxCorners(box: TempestCsgBox): readonly TempestCsgPoint[] {
  const x1 = box.min.x + box.size.x;
  const y1 = box.min.y + box.size.y;
  const z1 = box.min.z + box.size.z;
  return [
    { x: box.min.x, y: box.min.y, z: box.min.z },
    { x: x1, y: box.min.y, z: box.min.z },
    { x: box.min.x, y: y1, z: box.min.z },
    { x: x1, y: y1, z: box.min.z },
    { x: box.min.x, y: box.min.y, z: z1 },
    { x: x1, y: box.min.y, z: z1 },
    { x: box.min.x, y: y1, z: z1 },
    { x: x1, y: y1, z: z1 },
  ];
}

function tempestCsgPointToScene(point: TempestCsgPoint, pose: TempestPrintablePose): Vector3 {
  const posedPoint =
    pose.type === "upright-dual-filter"
      ? {
          x: point.x,
          y: pose.envelope.depth - point.z,
          z: point.y,
        }
      : point;
  return new Vector3(posedPoint.x * sceneScale, posedPoint.z * sceneScale, posedPoint.y * sceneScale);
}

function tempestCsgAxisToSceneAxis(axis: FanAxis, pose: TempestPrintablePose): FanAxis {
  if (pose.type === "upright-dual-filter") {
    return axis;
  }
  if (axis === "y") {
    return "z";
  }
  if (axis === "z") {
    return "y";
  }
  return "x";
}

function tempestWallNormalAxis(wall: TempestWall): FanAxis {
  return wall === "front" || wall === "back" ? "y" : "x";
}

function tempestWallInteriorFanCenter(
  model: TempestModel,
  wall: TempestWall,
  positionAlongWall: number,
  localVerticalCenter: number,
): TempestCsgPoint {
  const z = model.frame.outsideFlangeThickness + localVerticalCenter;
  if (wall === "front") {
    return { x: positionAlongWall, y: model.frame.wallThickness + fanPreviewFrontDepthMillimeters, z };
  }
  if (wall === "back") {
    return { x: positionAlongWall, y: model.box.depth - model.frame.wallThickness - fanPreviewRearDepthMillimeters, z };
  }
  if (wall === "left") {
    return { x: model.frame.wallThickness + fanPreviewFrontDepthMillimeters, y: positionAlongWall, z };
  }
  return { x: model.box.width - model.frame.wallThickness - fanPreviewRearDepthMillimeters, y: positionAlongWall, z };
}

function moveTempestFanInsideWall(fan: Group, model: TempestModel, pose: TempestPrintablePose, wall: TempestWall): void {
  const bounds = new Box3().setFromObject(fan);
  const plane = tempestWallInteriorPlane(model, pose, wall);
  fan.position[plane.axis] += previewInteriorShiftForBounds(bounds, plane);
}

function tempestWallInteriorPlane(model: TempestModel, pose: TempestPrintablePose, wall: TempestWall): PreviewInteriorPlane {
  const facePoint = tempestWallInteriorFacePoint(model, wall);
  const sceneFacePoint = tempestCsgPointToScene(facePoint, pose);
  const insideDirection = tempestCsgPointToScene(tempestWallInteriorProbePoint(model, wall), pose).sub(sceneFacePoint);
  const axis = dominantVectorAxis(insideDirection);
  const insideSign = vectorAxisValue(insideDirection, axis) >= 0 ? 1 : -1;
  return {
    axis,
    coordinate: vectorAxisValue(sceneFacePoint, axis),
    insideSign,
    inset: previewFanWallInset,
  };
}

function tempestWallInteriorFacePoint(model: TempestModel, wall: TempestWall): TempestCsgPoint {
  if (wall === "front") {
    return { x: 0, y: model.frame.wallThickness, z: 0 };
  }
  if (wall === "back") {
    return { x: 0, y: model.box.depth - model.frame.wallThickness, z: 0 };
  }
  if (wall === "left") {
    return { x: model.frame.wallThickness, y: 0, z: 0 };
  }
  return { x: model.box.width - model.frame.wallThickness, y: 0, z: 0 };
}

function tempestWallInteriorProbePoint(model: TempestModel, wall: TempestWall): TempestCsgPoint {
  const point = tempestWallInteriorFacePoint(model, wall);
  if (wall === "front") {
    return { ...point, y: point.y + 1 };
  }
  if (wall === "back") {
    return { ...point, y: point.y - 1 };
  }
  if (wall === "left") {
    return { ...point, x: point.x + 1 };
  }
  return { ...point, x: point.x - 1 };
}

export function previewInteriorShiftForBounds(bounds: Box3, plane: PreviewInteriorPlane): number {
  const target = plane.coordinate + plane.insideSign * plane.inset;
  const outsideEdge = vectorAxisValue(plane.insideSign > 0 ? bounds.min : bounds.max, plane.axis);
  const shift = target - outsideEdge;
  return plane.insideSign > 0 ? Math.max(0, shift) : Math.min(0, shift);
}

function dominantVectorAxis(vector: Vector3): FanAxis {
  const x = Math.abs(vector.x);
  const y = Math.abs(vector.y);
  const z = Math.abs(vector.z);
  if (x >= y && x >= z) {
    return "x";
  }
  if (y >= z) {
    return "y";
  }
  return "z";
}

function vectorAxisValue(vector: Vector3, axis: FanAxis): number {
  if (axis === "x") {
    return vector.x;
  }
  if (axis === "y") {
    return vector.y;
  }
  return vector.z;
}

// Reached only from the quad fan preview arm, so the filter layout is the quad
// arm carrying the top-plate thickness.
function tempestTowerTopFanCenterZ(model: TempestModel): number {
  return model.box.height - expectQuadFilterLayout(model.filterLayout).topPlateThickness - fanPreviewRearDepthMillimeters;
}

// planForArrangement returns a topology-consistent triple; once the model's
// topology has matched, these narrow the flat layout fields without re-validating.
function expectSandwichFilterLayout(layout: TempestFilterLayout): Extract<TempestFilterLayout, { readonly topology: "sandwich" }> {
  return layout.topology === "sandwich" ? layout : assertNever(layout.topology as never);
}

function expectQuadFilterLayout(layout: TempestFilterLayout): Extract<TempestFilterLayout, { readonly topology: "quad" }> {
  return layout.topology === "quad" ? layout : assertNever(layout.topology as never);
}

function expectSandwichFanLayout(layout: TempestModel["fanLayout"]): Extract<TempestModel["fanLayout"], { readonly topology: "sandwich" }> {
  return layout.topology === "sandwich" ? layout : assertNever(layout.topology as never);
}

function expectQuadFanLayout(layout: TempestModel["fanLayout"]): Extract<TempestModel["fanLayout"], { readonly topology: "quad" }> {
  return layout.topology === "quad" ? layout : assertNever(layout.topology as never);
}

const tempestPreviewWalls: readonly TempestWall[] = ["front", "back", "left", "right"];

// #######################################
// Generated Panel Meshes
// #######################################

function createPreviewEdges(geometry: BufferGeometry, material: Material, name?: string): LineSegments {
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

// #######################################
// Assembly Cues and Dimensions
// #######################################

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

function createPrintableMeshGeometry(mesh: PrintableMesh): BufferGeometry {
  // Grills and rounded corners read smooth while box edges stay crisp; the flat
  // preset keeps averaged normals (its material's flatShading ignores them anyway).
  const shading: PrintableMeshShading =
    activeAppearance.normals === "creased"
      ? { type: "creased", creaseAngleRadians: CREASE_ANGLE_RADIANS }
      : { type: "averaged" };
  return printableMeshToBufferGeometry(mesh, { scale: sceneScale, offset: [0, 0, 0] }, shading);
}

function createPrintableMeshPreviewGroup(
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

function createDimensionGroup(dimensions: readonly DimensionGuide[]): Group {
  const group = new Group();
  for (const guide of dimensions) {
    group.add(
      createSceneDimensionGuide({
        label: guide.label,
        from: toScenePosition(guide.from, [0, 0, 0], false),
        to: toScenePosition(guide.to, [0, 0, 0], false),
        labelOffset: toSceneOffset(guide.labelOffset),
        measurement: guide.measurement,
      }),
    );
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
        description: "outside width",
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
        description: "outside height",
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
        description: "outside depth",
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

  const dimensionMidpoint = input.from.clone().lerp(input.to, 0.5);
  const labelPosition = dimensionMidpoint.clone().add(input.labelOffset.clone().multiplyScalar(dimensionLabelOffsetMultiplier));
  if (input.labelOffset.lengthSq() > 0.000001) {
    guideGroup.add(createDimensionLine([closestPointOnSegment(input.from, input.to, labelPosition), labelPosition], dimensionId));
  }

  const label = createTextSprite(input.label, input.measurement);
  markDimensionObject(label, dimensionId);
  label.position.copy(labelPosition);
  guideGroup.add(label);
  return guideGroup;
}

function closestPointOnSegment(from: Vector3, to: Vector3, point: Vector3): Vector3 {
  const segment = to.clone().sub(from);
  const segmentLengthSquared = segment.lengthSq();
  if (segmentLengthSquared === 0) {
    return from.clone();
  }
  const t = clamp(point.clone().sub(from).dot(segment) / segmentLengthSquared, 0, 1);
  return from.clone().addScaledVector(segment, t);
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
  canvas.width = 704;
  canvas.height = 188;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createTextSprite: Could not create canvas context");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 253, 246, 0.96)";
  context.fillRect(10, 10, 684, 168);
  context.strokeStyle = "rgba(31, 111, 86, 0.72)";
  context.lineWidth = 6;
  context.strokeRect(10, 10, 684, 168);
  context.fillStyle = "#164d3d";
  context.font = "900 104px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 88, 94);
  context.textAlign = "left";
  context.fillStyle = "#111817";
  context.font = "900 66px Inter, Arial, sans-serif";
  context.fillText(formatDimension(measurement.value), 156, 78);
  context.fillStyle = "#667169";
  context.font = "800 40px Inter, Arial, sans-serif";
  context.fillText(measurement.description, 156, 128);

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

// #######################################
// Materials and Textures
// #######################################

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

function createWoodMaterial(): Material {
  return new MeshStandardMaterial({
    color: woodColor,
    map: createWoodTexture(),
    roughness: 0.72,
    metalness: 0.02,
  });
}

type PrintedPartMaterialOptions = {
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
};

function createPrintedPartMaterial(options: PrintedPartMaterialOptions): MeshStandardMaterial {
  // Driven by the active appearance preset (Appearance Lab) rather than the
  // per-part roughness/metalness, so every printed surface shares one look.
  const surface = activeAppearance;
  const base = {
    color: options.color,
    roughness: surface.roughness,
    metalness: surface.metalness,
    flatShading: surface.normals === "flat",
    envMapIntensity: surface.envMapIntensity ?? 1,
  };
  if (surface.kind === "physical") {
    return new MeshPhysicalMaterial({
      ...base,
      clearcoat: surface.clearcoat ?? 0,
      clearcoatRoughness: surface.clearcoatRoughness ?? 0,
    });
  }
  return new MeshStandardMaterial(base);
}

function createFilterMediaMaterial(opacity: number): Material {
  return new MeshPhysicalMaterial({
    color: filterColor,
    map: createFilterTexture(),
    roughness: 0.52,
    transparent: true,
    opacity,
    side: DoubleSide,
    depthWrite: false,
  });
}

function createPrintedPartEdgeMaterial(partColor: number, opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({
    color: relativeLuminance(partColor) < 0.42 ? 0x9fb6aa : 0x1c2722,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function createFilterMediaEdgeMaterial(opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({
    color: 0x6d7d68,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function relativeLuminance(color: number): number {
  const red = ((color >> 16) & 0xff) / 255;
  const green = ((color >> 8) & 0xff) / 255;
  const blue = (color & 0xff) / 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
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
  // A faint fine grid (horizontal + vertical cross lines) reads as filter mesh —
  // visible enough to feel like a filter, light enough not to overpower the housing.
  context.strokeStyle = "rgba(108, 119, 110, 0.13)";
  context.lineWidth = 1;
  for (let y = 0; y < canvas.height; y += 6) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(canvas.width, y + 0.5);
    context.stroke();
  }
  for (let x = 0; x < canvas.width; x += 6) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, canvas.height);
    context.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createStudioBackdropTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createStudioBackdropTexture: Could not create canvas context");
  }
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#f1efe9");
  gradient.addColorStop(1, "#ddd9d0");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// A soft round contact shadow — fake but cheap, and reads cleanly on the light
// backdrop where a real cast shadow would be fussy to tune.
function createGroundShadowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createGroundShadowTexture: Could not create canvas context");
  }
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(28, 32, 30, 0.30)");
  gradient.addColorStop(0.55, "rgba(28, 32, 30, 0.13)");
  gradient.addColorStop(1, "rgba(28, 32, 30, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// #######################################
// Camera and Scene Math
// #######################################

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

function explodeGeneratedPreviewChildrenFromCenter(group: Group, exploded: boolean): void {
  if (!exploded || group.children.length === 0) {
    return;
  }

  const modelBounds = new Box3().setFromObject(group);
  if (modelBounds.isEmpty()) {
    return;
  }

  const modelCenter = modelBounds.getCenter(new Vector3());
  const totalChildren = group.children.length;
  group.children.forEach((child, index) => {
    const childBounds = new Box3().setFromObject(child);
    if (childBounds.isEmpty()) {
      return;
    }

    const direction = childBounds.getCenter(new Vector3()).sub(modelCenter);
    if (direction.lengthSq() < 0.000001) {
      direction.copy(radialFallbackExplodeDirection(index, totalChildren));
    }

    child.position.add(direction.normalize().multiplyScalar(generatedPreviewExplodeDistance));
  });
}

function radialFallbackExplodeDirection(index: number, total: number): Vector3 {
  const angle = (Math.PI * 2 * index) / Math.max(1, total);
  return new Vector3(Math.cos(angle), 0.35, Math.sin(angle));
}

function cameraPosition(preset: CameraPreset, maxDimension: number): Vector3 {
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
  const dimensionFraming = layout.configuration.preview.enclosure.showDimensions ? dimensionPreviewFramingMultiplier : 1;
  return (modelViewScale(layout) / previewZoomForLayout(layout)) * dimensionFraming;
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

  return Math.max(
    filterSelectionDimensions(settings.filter).width,
    layout.summary.workingDepth,
    layout.summary.chamberHeight,
  );
}

// #######################################
// Static Reference Preview
// #######################################

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
  const scalePadding = settings.preview.enclosure.showBananaScale ? oneMeterCubeSize * 0.72 : 0;
  if (isStaticReferencePrintDesignId(settings.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(settings.printDesign);
    if (reference !== undefined && staticPrintReferenceHasAssembledPreview(reference)) {
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
  return (
    Math.max(
      filterSelectionDimensions(settings.filter).width,
      layout.summary.workingDepth,
      layout.summary.chamberHeight,
    ) * sceneScale
  ) + scalePadding;
}

function staticReferencePreviewAssets(reference: StaticPrintReference): readonly StaticPrintPreviewAsset[] {
  if (staticPrintReferenceHasAssembledPreview(reference) && reference.assembledPreview?.type === "single-source-asset") {
    return [reference.assembledPreview.asset];
  }
  if (staticPrintReferenceHasAssembledPreview(reference) && reference.assembledPreview?.type === "source-part-set") {
    return reference.assembledPreview.assets;
  }
  return reference.previewAssets;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// #######################################
// Fan Models
// #######################################

// ##############################
// Fan Assembly
// ##############################

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

  // Fan blades are opaque plastic; rendering them solid (not translucent) avoids
  // both the transparent-sort vanish and bright-background bleed-through at grazing angles.
  const bladeMaterial = new MeshStandardMaterial({
    color: appearance.bladeColor,
    roughness: 0.62,
    metalness: 0.04,
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

// ##############################
// CAD Fan Loading
// ##############################

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
      if (core.userData["disposedPreviewObject"] === true) {
        return;
      }
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
      if (core.userData["disposedPreviewObject"] === true) {
        return;
      }
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
      return parseFanCadPreviewAsset(await response.json());
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

// ##############################
// CAD Asset Parsing
// ##############################

function parseFanCadPreviewAsset(input: unknown): FanCadPreviewAsset {
  const asset = expectRecord(input, "fan CAD preview asset");
  const schema = asset["schema"];
  const usage = asset["usage"];
  const unit = asset["unit"];
  if (schema !== "filterboxbuilder-fan-cad-preview-v1" || usage !== "preview-only-purchased-part-visual" || unit !== "millimeter") {
    throw new Error("parseFanCadPreviewAsset: Unsupported fan CAD preview asset");
  }

  const bounds = expectRecord(asset["bounds"], "fan CAD preview bounds");
  const meshes = asset["meshes"];
  if (!Array.isArray(meshes) || meshes.length === 0) {
    throw new Error("parseFanCadPreviewAsset: Expected at least one mesh");
  }

  return {
    schema,
    usage,
    unit,
    nominalDiameter: expectPositiveNumber(asset["nominalDiameter"], "nominalDiameter"),
    bounds: {
      center: expectNumberTuple(bounds["center"], 3, "bounds.center"),
    },
    meshes: meshes.map((mesh, index) => parseFanCadPreviewMesh(mesh, index)),
  };
}

function parseFanCadPreviewMesh(input: unknown, meshIndex: number): FanCadPreviewMesh {
  const mesh = expectRecord(input, `mesh ${meshIndex}`);
  const name = mesh["name"];
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`parseFanCadPreviewMesh: Mesh ${meshIndex} is missing a name`);
  }

  const position = expectNumberArray(mesh["position"], `${name}.position`);
  if (position.length < 9 || position.length % 3 !== 0) {
    throw new Error(`parseFanCadPreviewMesh: ${name}.position must contain complete x/y/z coordinates`);
  }

  const index = expectNonNegativeIntegerArray(mesh["index"], `${name}.index`);
  if (index.length < 3 || index.length % 3 !== 0) {
    throw new Error(`parseFanCadPreviewMesh: ${name}.index must contain complete triangles`);
  }

  const vertexCount = position.length / 3;
  if (index.some((entry) => entry >= vertexCount)) {
    throw new Error(`parseFanCadPreviewMesh: ${name}.index references a missing vertex`);
  }

  const color = mesh["color"] === undefined ? undefined : expectUnitColor(mesh["color"], `${name}.color`);
  return color === undefined ? { name, position, index } : { name, color, position, index };
}

function expectRecord(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`expectRecord: Expected ${label} to be an object`);
  }
  return input as Record<string, unknown>;
}

function expectPositiveNumber(input: unknown, label: string): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    throw new Error(`expectPositiveNumber: Expected ${label} to be a positive number`);
  }
  return input;
}

function expectNumberArray(input: unknown, label: string): readonly number[] {
  if (!Array.isArray(input) || !input.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`expectNumberArray: Expected ${label} to contain only finite numbers`);
  }
  return input;
}

function expectNonNegativeIntegerArray(input: unknown, label: string): readonly number[] {
  if (!Array.isArray(input) || !input.every((entry) => Number.isSafeInteger(entry) && entry >= 0)) {
    throw new Error(`expectNonNegativeIntegerArray: Expected ${label} to contain only non-negative integer indexes`);
  }
  return input;
}

function expectNumberTuple(input: unknown, length: number, label: string): readonly [number, number, number] {
  const tuple = expectNumberArray(input, label);
  if (length !== 3 || tuple.length !== 3) {
    throw new Error(`expectNumberTuple: Expected ${label} to contain exactly three coordinates`);
  }
  const [x, y, z] = tuple;
  if (x === undefined || y === undefined || z === undefined) {
    throw new Error(`expectNumberTuple: Expected ${label} to contain exactly three coordinates`);
  }
  return [x, y, z];
}

function expectUnitColor(input: unknown, label: string): readonly [number, number, number] {
  const color = expectNumberTuple(input, 3, label);
  if (color.some((channel) => channel < 0 || channel > 1)) {
    throw new Error(`expectUnitColor: Expected ${label} channels to stay between 0 and 1`);
  }
  return color;
}

// ##############################
// CAD Mesh Conversion
// ##############################

function createLoadedFanCadMesh(
  mesh: FanCadPreviewMesh,
  center: readonly [number, number, number],
  appearance: FanAppearance,
): LoadedFanCadMesh {
  const positions: number[] = [];
  for (let index = 0; index < mesh.position.length; index += 3) {
    const { x: sourceX, y: sourceY, z: sourceZ } = fanCadVertexAt(mesh, index);
    positions.push(sourceX - center[0], sourceZ - center[2], sourceY - center[1]);
  }

  // Same Y↔Z reflection as the position map above reverses winding; swap each
  // triangle's last two indices back so glTF's CCW-outward faces stay outward
  // under FrontSide culling (otherwise the loaded fan renders inside-out).
  const windingFixedIndex: number[] = [];
  for (let triangle = 0; triangle < mesh.index.length; triangle += 3) {
    windingFixedIndex.push(mesh.index[triangle], mesh.index[triangle + 2], mesh.index[triangle + 1]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(windingFixedIndex);
  geometry.computeVertexNormals();

  const isRotor = mesh.name.toLowerCase().includes("impeller");
  return {
    name: mesh.name,
    geometry,
    color: meshColor(mesh, isRotor, appearance),
    isRotor,
  };
}

function fanCadVertexAt(mesh: FanCadPreviewMesh, index: number): { readonly x: number; readonly y: number; readonly z: number } {
  const x = mesh.position[index];
  const y = mesh.position[index + 1];
  const z = mesh.position[index + 2];
  if (x === undefined || y === undefined || z === undefined) {
    throw new Error(`fanCadVertexAt: ${mesh.name} has an incomplete vertex coordinate`);
  }
  return { x, y, z };
}

function meshColor(mesh: FanCadPreviewMesh, isRotor: boolean, appearance: FanAppearance): number {
  if (mesh.color !== undefined) {
    const [red, green, blue] = mesh.color;
    return ((Math.round(red * 255) << 16) | (Math.round(green * 255) << 8) | Math.round(blue * 255)) >>> 0;
  }
  return isRotor ? appearance.bladeColor : appearance.hubColor;
}

// ##############################
// Procedural Fan Geometry
// ##############################

function collectFanRotors(root: Object3D, rotors: Object3D[]): void {
  root.traverse((child) => {
    if (child.userData["fanRotor"] === true) {
      rotors.push(child);
    }
  });
}

function createFanFrame(radius: number, appearance: FanAppearance): Group {
  const frame = new Group();
  const size = proceduralFanFrameOuterSize(radius);
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

export function proceduralFanFrameOuterSize(radius: number): number {
  return radius * 2;
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
