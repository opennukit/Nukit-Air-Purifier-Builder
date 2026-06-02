<script lang="ts">
  import {
    defaultTempestSettings,
    defaultTempestHorizontalFilter,
    defaultTempestTowerFilter,
    type TempestFilterArrangement,
    type TempestSettings,
  } from "@/domain/designs/tempest/model";
  import { createTempestPrintableKit } from "@/fabrication/printing/designs/tempest/printableKit";
  import { printVolumePresetIds, type PrintVolumePresetId } from "@/fabrication/printing/printableKit";
  import ThreePreview from "./ThreePreview.svelte";

  type ArrangementKind = TempestFilterArrangement["type"];

  let arrangement = $state<ArrangementKind>("dual-horizontal-sandwich");
  let horizontalWidth = $state(defaultTempestHorizontalFilter.footprintWidth);
  let horizontalDepth = $state(defaultTempestHorizontalFilter.footprintDepth);
  let horizontalThickness = $state(defaultTempestHorizontalFilter.thickness);
  let towerFaceWidth = $state(defaultTempestTowerFilter.faceWidth);
  let towerFaceHeight = $state(defaultTempestTowerFilter.faceHeight);
  let towerThickness = $state(defaultTempestTowerFilter.thickness);
  let fanDiameter = $state<120 | 140>(140);
  let honeycomb = $state(true);
  let bed = $state<PrintVolumePresetId>("bed-256");

  const isTower = $derived(arrangement === "four-side-filter-tower");

  // Early return so TS narrows `arrangement` to the horizontal kinds for the
  // footprint-filter branch.
  function buildArrangement(): TempestFilterArrangement {
    if (arrangement === "four-side-filter-tower") {
      return {
        type: "four-side-filter-tower",
        filter: { faceWidth: towerFaceWidth, faceHeight: towerFaceHeight, thickness: towerThickness },
      };
    }
    return {
      type: arrangement,
      filter: { footprintWidth: horizontalWidth, footprintDepth: horizontalDepth, thickness: horizontalThickness },
    };
  }

  const settings = $derived.by<TempestSettings>(() => ({
    ...defaultTempestSettings,
    arrangement: buildArrangement(),
    fan: {
      ...defaultTempestSettings.fan,
      diameter: fanDiameter,
      opening: honeycomb ? defaultTempestSettings.fan.opening : { type: "plain" },
    },
  }));

  // Preview the whole assembly (unsplit) on the same Manifold backend the
  // Builder exports with — what you see is what slices.
  const preview = $derived.by(() => {
    try {
      const part = createTempestPrintableKit(settings, "unsplit").parts[0];
      return {
        status: "ok" as const,
        mesh: part.mesh,
        size: { width: part.width, depth: part.depth, height: part.height },
        triangles: part.mesh.triangles.length,
      };
    } catch (error) {
      return { status: "error" as const, message: error instanceof Error ? error.message : String(error) };
    }
  });

  // Separately report how the current design splits for the selected bed.
  const split = $derived.by(() => {
    try {
      const kit = createTempestPrintableKit(settings, bed);
      return { status: "ok" as const, parts: kit.summary.partCount, oversized: kit.summary.oversizedPartCount };
    } catch {
      return { status: "error" as const };
    }
  });
</script>

<div class="layout">
  <aside class="panel">
    <h1>Nukit Geometry Playground</h1>
    <p class="hint">Edit the parametric Tempest model live. Geometry comes from <code>buildTempestGeometry</code> on the Manifold backend — identical to the Builder's export.</p>

    <label>
      Filter arrangement
      <select bind:value={arrangement}>
        <option value="single-horizontal-top-filter">1 filter — single horizontal</option>
        <option value="dual-horizontal-sandwich">2 filters — horizontal sandwich</option>
        <option value="four-side-filter-tower">4 filters — side tower</option>
      </select>
    </label>

    {#if isTower}
      <fieldset>
        <legend>Tower filter face (mm)</legend>
        <label>Width<input type="number" min="50" bind:value={towerFaceWidth} /></label>
        <label>Height<input type="number" min="50" bind:value={towerFaceHeight} /></label>
        <label>Thickness<input type="number" min="5" bind:value={towerThickness} /></label>
      </fieldset>
    {:else}
      <fieldset>
        <legend>Filter footprint (mm)</legend>
        <label>Width<input type="number" min="50" bind:value={horizontalWidth} /></label>
        <label>Depth<input type="number" min="50" bind:value={horizontalDepth} /></label>
        <label>Thickness<input type="number" min="5" bind:value={horizontalThickness} /></label>
      </fieldset>
    {/if}

    <label>
      Fan diameter
      <select bind:value={fanDiameter}>
        <option value={120}>120 mm</option>
        <option value={140}>140 mm</option>
      </select>
    </label>

    <label class="checkbox">
      <input type="checkbox" bind:checked={honeycomb} />
      Honeycomb fan grills
    </label>

    <label>
      Printer bed
      <select bind:value={bed}>
        {#each printVolumePresetIds as presetId (presetId)}
          <option value={presetId}>{presetId}</option>
        {/each}
      </select>
    </label>

    <div class="summary">
      {#if preview.status === "ok"}
        <div>Envelope: {preview.size.width} × {preview.size.depth} × {preview.size.height} mm</div>
        <div>{preview.triangles.toLocaleString()} triangles</div>
        {#if split.status === "ok"}
          <div>At <code>{bed}</code>: {split.parts} printable chunk{split.parts === 1 ? "" : "s"}{split.oversized > 0 ? ` · ${split.oversized} oversized` : ""}</div>
        {/if}
      {:else}
        <div class="error">⚠ {preview.message}</div>
      {/if}
    </div>
  </aside>

  <main class="stage">
    {#if preview.status === "ok"}
      <ThreePreview mesh={preview.mesh} />
    {:else}
      <div class="stage-error">Geometry failed to build — adjust the parameters.</div>
    {/if}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: ui-sans-serif, system-ui, sans-serif;
    background: #0f1216;
    color: #d7dde5;
  }
  .layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    height: 100vh;
  }
  .panel {
    padding: 20px;
    overflow-y: auto;
    background: #161a20;
    border-right: 1px solid #232a33;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h1 {
    font-size: 16px;
    margin: 0;
  }
  .hint {
    font-size: 12px;
    color: #8b95a3;
    margin: 0;
    line-height: 1.5;
  }
  code {
    color: #8fd3a6;
    font-size: 0.92em;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  label.checkbox {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  fieldset {
    border: 1px solid #232a33;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
  }
  legend {
    font-size: 12px;
    color: #8b95a3;
    padding: 0 4px;
  }
  input[type="number"],
  select {
    background: #0f1216;
    color: #d7dde5;
    border: 1px solid #2c333d;
    border-radius: 5px;
    padding: 6px 8px;
    font: inherit;
  }
  .summary {
    margin-top: auto;
    font-size: 12px;
    color: #aab3c0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 1px solid #232a33;
    padding-top: 12px;
  }
  .error {
    color: #f0a63a;
  }
  .stage {
    position: relative;
    min-height: 0;
  }
  .stage-error {
    display: grid;
    place-items: center;
    height: 100%;
    color: #f0a63a;
  }
</style>
