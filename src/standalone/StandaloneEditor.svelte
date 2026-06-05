<script lang="ts">
  import { onDestroy } from "svelte";
  import { geometries } from "@jscad/modeling";
  import {
    BufferGeometry,
    DirectionalLight,
    Float32BufferAttribute,
    Group,
    HemisphereLight,
    Mesh,
    MeshStandardMaterial,
    PerspectiveCamera,
    Scene,
    Vector3,
    WebGLRenderer,
  } from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import {
    createTempestModel,
    defaultTempestHorizontalFilter,
    defaultTempestSettings,
    defaultTempestTowerFilter,
    type TempestFilterArrangement,
    type TempestSettings,
  } from "@/domain/designs/tempest/model";
  import { buildTempestGeometry } from "@/fabrication/printing/designs/tempest/geometry";
  import { jscadModeling } from "@/fabrication/printing/modeling/jscadModeling";

  // The JSCAD geom3 the editor previews/exports. Derived from the JSCAD backend's
  // own primitive return type so we don't depend on @jscad/modeling's type paths.
  type EditorSolid = ReturnType<typeof jscadModeling.primitives.cuboid>;

  // #######################################
  // Editor Parameter Model
  // #######################################

  // ##############################
  // Parameter Choices
  // ##############################

  type ArrangementChoice = TempestFilterArrangement["type"];
  type FanDiameterChoice = 120 | 140;
  type HoneycombChoice = "honeycomb" | "plain";

  type EditorParameters = {
    readonly arrangement: ArrangementChoice;
    readonly filterPrimary: number;
    readonly filterSecondary: number;
    readonly filterThickness: number;
    readonly fanDiameter: FanDiameterChoice;
    readonly opening: HoneycombChoice;
  };

  const arrangementOptions: readonly { readonly value: ArrangementChoice; readonly label: string }[] = [
    { value: "single-horizontal-top-filter", label: "1 filter (top)" },
    { value: "dual-horizontal-sandwich", label: "2 filters (sandwich)" },
    { value: "four-side-filter-tower", label: "4 filters (tower)" },
  ];
  const fanDiameterOptions: readonly FanDiameterChoice[] = [120, 140];

  // ##############################
  // Parameter State
  // ##############################

  let parameters = $state<EditorParameters>({
    arrangement: defaultTempestSettings.arrangement.type,
    filterPrimary: defaultTempestHorizontalFilter.footprintWidth,
    filterSecondary: defaultTempestHorizontalFilter.footprintDepth,
    filterThickness: defaultTempestHorizontalFilter.thickness,
    fanDiameter: 140,
    opening: defaultTempestSettings.fan.opening.type === "honeycomb" ? "honeycomb" : "plain",
  });

  // ##############################
  // Filter Dimension Labels
  // ##############################

  const isTowerArrangement = $derived(parameters.arrangement === "four-side-filter-tower");
  const primaryDimensionLabel = $derived(isTowerArrangement ? "Filter face width" : "Filter footprint width");
  const secondaryDimensionLabel = $derived(isTowerArrangement ? "Filter face height" : "Filter footprint depth");

  // #######################################
  // Settings and Geometry Derivation
  // #######################################

  function buildArrangement(input: EditorParameters): TempestFilterArrangement {
    if (input.arrangement === "four-side-filter-tower") {
      return {
        type: "four-side-filter-tower",
        filter: {
          faceWidth: input.filterPrimary,
          faceHeight: input.filterSecondary,
          thickness: input.filterThickness,
        },
      };
    }
    return {
      type: input.arrangement,
      filter: {
        footprintWidth: input.filterPrimary,
        footprintDepth: input.filterSecondary,
        thickness: input.filterThickness,
      },
    };
  }

  function buildSettings(input: EditorParameters): TempestSettings {
    return {
      ...defaultTempestSettings,
      arrangement: buildArrangement(input),
      fan: {
        ...defaultTempestSettings.fan,
        diameter: input.fanDiameter,
        opening:
          input.opening === "honeycomb" ? defaultTempestSettings.fan.opening : { type: "plain" },
      },
    };
  }

  const settings = $derived(buildSettings(parameters));
  const solid = $derived(buildTempestGeometry(jscadModeling, createTempestModel(settings)));

  // #######################################
  // Parameter Transitions
  // #######################################

  function applyArrangement(next: ArrangementChoice): void {
    const filterDefault = next === "four-side-filter-tower" ? defaultTempestTowerFilter : defaultTempestHorizontalFilter;
    const primary = next === "four-side-filter-tower" ? defaultTempestTowerFilter.faceWidth : defaultTempestHorizontalFilter.footprintWidth;
    const secondary = next === "four-side-filter-tower" ? defaultTempestTowerFilter.faceHeight : defaultTempestHorizontalFilter.footprintDepth;
    parameters = {
      ...parameters,
      arrangement: next,
      filterPrimary: primary,
      filterSecondary: secondary,
      filterThickness: filterDefault.thickness,
    };
  }

  function readArrangement(event: Event): ArrangementChoice {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) {
      throw new Error("readArrangement: Expected select event target");
    }
    const option = arrangementOptions.find((entry) => entry.value === target.value);
    return option?.value ?? parameters.arrangement;
  }

  function readFanDiameter(event: Event): FanDiameterChoice {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) {
      throw new Error("readFanDiameter: Expected select event target");
    }
    return target.value === "120" ? 120 : 140;
  }

  function readDimension(event: Event, fallback: number): number {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      throw new Error("readDimension: Expected input event target");
    }
    const parsed = Number(target.value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function readHoneycomb(event: Event): HoneycombChoice {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      throw new Error("readHoneycomb: Expected input event target");
    }
    return target.checked ? "honeycomb" : "plain";
  }

  // #######################################
  // Three.js Preview
  // #######################################

  // ##############################
  // Scene Construction
  // ##############################

  type PreviewScene = {
    readonly scene: Scene;
    readonly camera: PerspectiveCamera;
    readonly renderer: WebGLRenderer;
    readonly controls: OrbitControls;
    readonly modelGroup: Group;
    readonly material: MeshStandardMaterial;
    readonly resizeObserver: ResizeObserver;
  };

  const previewBackground = 0x12161d;
  const modelColor = 0xc8a06a;

  let host = $state<HTMLDivElement | null>(null);
  let preview: PreviewScene | null = null;

  function createPreviewScene(container: HTMLElement): PreviewScene {
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 5000);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setClearColor(previewBackground, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;

    // The model is authored Z-up; tell OrbitControls so orbiting feels natural.
    camera.up.set(0, 0, 1);

    const modelGroup = new Group();
    scene.add(modelGroup);
    scene.add(new HemisphereLight(0xfff5e6, 0x404a5a, 1.9));
    const keyLight = new DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(1, -1.4, 1.8);
    scene.add(keyLight);

    const material = new MeshStandardMaterial({ color: modelColor, roughness: 0.62, metalness: 0.04 });

    const renderFrame = (): void => renderer.render(scene, camera);
    controls.addEventListener("change", renderFrame);

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderFrame();
    });
    resizeObserver.observe(container);

    return { scene, camera, renderer, controls, modelGroup, material, resizeObserver };
  }

  // ##############################
  // Geometry Conversion
  // ##############################

  function solidToBufferGeometry(geometry: EditorSolid): BufferGeometry {
    const positions: number[] = [];
    for (const polygon of geometries.geom3.toPolygons(geometry)) {
      const points = polygon.vertices;
      if (points.length < 3) {
        continue;
      }
      const anchor = points[0]!;
      for (let index = 1; index < points.length - 1; index += 1) {
        const second = points[index]!;
        const third = points[index + 1]!;
        positions.push(anchor[0], anchor[1], anchor[2]);
        positions.push(second[0], second[1], second[2]);
        positions.push(third[0], third[1], third[2]);
      }
    }
    const bufferGeometry = new BufferGeometry();
    bufferGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    bufferGeometry.computeVertexNormals();
    return bufferGeometry;
  }

  // ##############################
  // Preview Updates
  // ##############################

  function rebuildPreview(activePreview: PreviewScene, geometry: EditorSolid): void {
    for (const child of activePreview.modelGroup.children) {
      if (child instanceof Mesh) {
        child.geometry.dispose();
      }
    }
    activePreview.modelGroup.clear();

    const bufferGeometry = solidToBufferGeometry(geometry);
    bufferGeometry.computeBoundingBox();
    const center = new Vector3();
    bufferGeometry.boundingBox?.getCenter(center);
    bufferGeometry.translate(-center.x, -center.y, -center.z);

    const mesh = new Mesh(bufferGeometry, activePreview.material);
    activePreview.modelGroup.add(mesh);

    frameModel(activePreview, bufferGeometry);
    activePreview.renderer.render(activePreview.scene, activePreview.camera);
  }

  function frameModel(activePreview: PreviewScene, geometry: BufferGeometry): void {
    geometry.computeBoundingBox();
    const size = new Vector3();
    geometry.boundingBox?.getSize(size);
    const radius = Math.max(size.x, size.y, size.z, 1);
    const distance = radius * 1.9;
    activePreview.camera.position.set(distance, -distance, distance * 0.85);
    activePreview.camera.near = radius / 100;
    activePreview.camera.far = radius * 50;
    activePreview.camera.updateProjectionMatrix();
    activePreview.controls.target.set(0, 0, 0);
    activePreview.controls.update();
  }

  function destroyPreview(activePreview: PreviewScene): void {
    activePreview.resizeObserver.disconnect();
    activePreview.controls.dispose();
    for (const child of activePreview.modelGroup.children) {
      if (child instanceof Mesh) {
        child.geometry.dispose();
      }
    }
    activePreview.material.dispose();
    activePreview.renderer.dispose();
    activePreview.renderer.domElement.remove();
  }

  // ##############################
  // Reactive Mount and Sync
  // ##############################

  $effect(() => {
    const container = host;
    if (container === null) {
      return;
    }
    const activePreview = createPreviewScene(container);
    preview = activePreview;
    return () => {
      destroyPreview(activePreview);
      preview = null;
    };
  });

  $effect(() => {
    const activePreview = preview;
    const geometry = solid;
    if (activePreview === null) {
      return;
    }
    rebuildPreview(activePreview, geometry);
  });

  onDestroy(() => {
    if (preview !== null) {
      destroyPreview(preview);
      preview = null;
    }
  });

  // #######################################
  // STL Export
  // #######################################

  function exportStl(): void {
    const text = solidToAsciiStl(solid, "tempest");
    const blob = new Blob([text], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tempest.stl";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function solidToAsciiStl(geometry: EditorSolid, name: string): string {
    const lines: string[] = [`solid ${name}`];
    for (const polygon of geometries.geom3.toPolygons(geometry)) {
      const points = polygon.vertices;
      if (points.length < 3) {
        continue;
      }
      const anchor = points[0]!;
      for (let index = 1; index < points.length - 1; index += 1) {
        const second = points[index]!;
        const third = points[index + 1]!;
        const normal = triangleNormal(anchor, second, third);
        lines.push(`  facet normal ${formatVector(normal)}`);
        lines.push("    outer loop");
        lines.push(`      vertex ${formatVector(anchor)}`);
        lines.push(`      vertex ${formatVector(second)}`);
        lines.push(`      vertex ${formatVector(third)}`);
        lines.push("    endloop");
        lines.push("  endfacet");
      }
    }
    lines.push(`endsolid ${name}`);
    return lines.join("\n");
  }

  type Vec3 = readonly [number, number, number];

  function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    return [nx / length, ny / length, nz / length];
  }

  function formatVector(vector: Vec3): string {
    return `${vector[0].toExponential(6)} ${vector[1].toExponential(6)} ${vector[2].toExponential(6)}`;
  }
</script>

<div class="editor">
  <aside class="controls">
    <h1>Tempest geometry editor</h1>
    <p class="hint">Pure-JS preview. Adjust parameters and export an STL.</p>

    <label class="field">
      <span>Filter arrangement</span>
      <select value={parameters.arrangement} onchange={(event) => applyArrangement(readArrangement(event))}>
        {#each arrangementOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span>{primaryDimensionLabel} (mm)</span>
      <input
        type="number"
        min="1"
        step="1"
        value={parameters.filterPrimary}
        oninput={(event) => (parameters = { ...parameters, filterPrimary: readDimension(event, parameters.filterPrimary) })}
      />
    </label>

    <label class="field">
      <span>{secondaryDimensionLabel} (mm)</span>
      <input
        type="number"
        min="1"
        step="1"
        value={parameters.filterSecondary}
        oninput={(event) => (parameters = { ...parameters, filterSecondary: readDimension(event, parameters.filterSecondary) })}
      />
    </label>

    <label class="field">
      <span>Filter thickness (mm)</span>
      <input
        type="number"
        min="1"
        step="0.1"
        value={parameters.filterThickness}
        oninput={(event) => (parameters = { ...parameters, filterThickness: readDimension(event, parameters.filterThickness) })}
      />
    </label>

    <label class="field">
      <span>Fan diameter (mm)</span>
      <select value={String(parameters.fanDiameter)} onchange={(event) => (parameters = { ...parameters, fanDiameter: readFanDiameter(event) })}>
        {#each fanDiameterOptions as diameter (diameter)}
          <option value={String(diameter)}>{diameter}</option>
        {/each}
      </select>
    </label>

    <label class="field field-inline">
      <input
        type="checkbox"
        checked={parameters.opening === "honeycomb"}
        onchange={(event) => (parameters = { ...parameters, opening: readHoneycomb(event) })}
      />
      <span>Honeycomb fan grille</span>
    </label>

    <button type="button" class="export" onclick={exportStl}>Export STL</button>
  </aside>

  <div class="preview" bind:this={host}></div>
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    height: 100%;
  }

  :global(#standalone) {
    height: 100vh;
  }

  .editor {
    display: flex;
    height: 100vh;
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #e7ecf3;
    background: #12161d;
  }

  .controls {
    width: 280px;
    flex: none;
    padding: 18px 18px 28px;
    background: #1b2029;
    border-right: 1px solid #2c333f;
    overflow-y: auto;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 16px;
  }

  .hint {
    margin: 0 0 18px;
    color: #93a0b4;
    font-size: 11px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 14px;
  }

  .field > span {
    color: #93a0b4;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field-inline {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .field-inline > span {
    text-transform: none;
    letter-spacing: 0;
    font-size: 13px;
    color: #e7ecf3;
  }

  select,
  input[type="number"] {
    padding: 7px 8px;
    border: 1px solid #2c333f;
    border-radius: 6px;
    background: #11141a;
    color: #e7ecf3;
    font: inherit;
  }

  .export {
    width: 100%;
    margin-top: 12px;
    padding: 10px;
    border: none;
    border-radius: 6px;
    background: #5b9dff;
    color: #0b1018;
    font-weight: 600;
    cursor: pointer;
  }

  .export:hover {
    background: #74acff;
  }

  .preview {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .preview :global(canvas) {
    display: block;
  }
</style>
