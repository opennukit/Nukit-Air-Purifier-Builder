<script lang="ts" module>
  import type { PrintableKit } from "@/fabrication/printing/printableKit";
  import { createPrintKitChannel } from "@/fabrication/printing/worker/kitWorkerClient";

  // The assembled tempest preview renders the same printable kit the export
  // uses, built off the main thread. Channel and cache live at module scope so
  // they survive preview-mode remounts: switching back to the assembled view
  // re-renders instantly from the cached kit instead of rebuilding through the
  // worker over a blank canvas. The cache (keyed on geometry-affecting
  // settings) also makes preview-only toggles like fans or exploded view
  // re-render instantly without a new geometry build.
  const assembledKitChannel = createPrintKitChannel();
  const assembledKitPresetId = "unsplit";
  let assembledKitCache: { readonly key: string; readonly kit: PrintableKit } | null = null;
  // A key that failed to build is not retried until the settings change;
  // afterUpdate fires on every render, so retrying a persistent failure here
  // would loop worker rebuilds forever.
  let lastFailedAssembledKitKey: string | null = null;
</script>

<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import { isTempestPrintDesignId } from "@/domain/purifier/designPresets";
  import type { LayoutResult } from "@/fabrication/purifierLayout";
  import type { PrintableSheetPlan } from "@/fabrication/printing/printableKit";
  import { printKitCacheKey } from "@/fabrication/printing/printDesignKit";
  import { PurifierThreePreview } from "@/rendering/three/purifierThreePreview";

  type AssembledBuildPhase = "idle" | "building" | "failed";

  export let layout: LayoutResult;
  export let printSeamPlan: PrintableSheetPlan | null;
  export let onAssembledBuildPhaseChange: (phase: AssembledBuildPhase) => void = () => {};

  // Instance-scoped, unlike the kit cache above: each mount reports its own
  // build phase and waits on its own render, so a build outliving the instance
  // can only warm the module cache, never touch a dead preview.
  let destroyed = false;
  let inFlightAssembledKitKey: string | null = null;
  // The latest layout waiting on the in-flight kit; every re-render request for
  // the same kit key overwrites it, so the build applies the newest view state.
  let pendingTempestRender: PendingTempestRender | null = null;

  type PendingTempestRender = {
    readonly layout: LayoutResult;
    readonly seamPlan: PrintableSheetPlan | null;
    readonly rebuildKey: string;
  };

  let host: HTMLDivElement;
  let preview: PurifierThreePreview | null = null;
  let previousRebuildKey = "";
  let previousSeamPlan: PrintableSheetPlan | null = null;

  function updatePreview(): void {
    if (preview === null) {
      return;
    }
    const rebuildKey = previewRebuildKey(layout);
    if (rebuildKey === previousRebuildKey && printSeamPlan === previousSeamPlan) {
      preview.setAutoRotate(layout.configuration.preview.enclosure.autoRotate);
      return;
    }
    if (isTempestPrintDesignId(layout.configuration.printDesign.id)) {
      updateTempestPreview(layout, printSeamPlan, rebuildKey);
      return;
    }
    // A non-tempest render invalidates any tempest render still waiting on a
    // kit (when that build lands it only warms the cache) and clears any
    // lingering tempest failure — this design renders fine.
    pendingTempestRender = null;
    onAssembledBuildPhaseChange("idle");
    preview.update(layout, printSeamPlan);
    previousRebuildKey = rebuildKey;
    previousSeamPlan = printSeamPlan;
  }

  // The expensive Manifold kit builds off-thread; the previous model stays on
  // screen until the new kit lands. Latest-wins: a newer request supersedes the
  // in-flight one, and a superseded outcome changes nothing.
  function updateTempestPreview(
    currentLayout: LayoutResult,
    currentSeamPlan: PrintableSheetPlan | null,
    rebuildKey: string,
  ): void {
    const kitKey = printKitCacheKey(currentLayout.rawSettings, assembledKitPresetId);
    if (assembledKitCache !== null && assembledKitCache.key === kitKey) {
      // The newest render request is satisfied right here; an older build
      // still in flight must not apply later and revert the preview. Serving
      // from cache also moots any lingering failure for another key.
      pendingTempestRender = null;
      onAssembledBuildPhaseChange("idle");
      applyTempestRender({ layout: currentLayout, seamPlan: currentSeamPlan, rebuildKey }, assembledKitCache.kit);
      return;
    }
    if (lastFailedAssembledKitKey === kitKey) {
      return;
    }
    pendingTempestRender = { layout: currentLayout, seamPlan: currentSeamPlan, rebuildKey };
    if (inFlightAssembledKitKey === kitKey) {
      return;
    }
    inFlightAssembledKitKey = kitKey;
    onAssembledBuildPhaseChange("building");
    void assembledKitChannel.request(currentLayout.rawSettings, assembledKitPresetId).then((outcome) => {
      if (outcome.type === "superseded") {
        return;
      }
      inFlightAssembledKitKey = null;
      if (outcome.type === "failed") {
        console.error(`updateTempestPreview: assembled kit build failed: ${outcome.message}`);
        lastFailedAssembledKitKey = kitKey;
        if (destroyed) {
          return;
        }
        onAssembledBuildPhaseChange("failed");
        pendingTempestRender = null;
        return;
      }
      lastFailedAssembledKitKey = null;
      assembledKitCache = { key: kitKey, kit: outcome.kit };
      // A build outliving this instance still warmed the module cache above,
      // but it must not clobber the phase a newer instance is reporting.
      if (destroyed) {
        return;
      }
      onAssembledBuildPhaseChange("idle");
      if (pendingTempestRender !== null) {
        applyTempestRender(pendingTempestRender, outcome.kit);
        pendingTempestRender = null;
      }
    });
  }

  function applyTempestRender(render: PendingTempestRender, kit: PrintableKit): void {
    if (preview === null) {
      return;
    }
    preview.update(render.layout, render.seamPlan, kit);
    previousRebuildKey = render.rebuildKey;
    previousSeamPlan = render.seamPlan;
  }

  onMount(() => {
    preview = new PurifierThreePreview(host);
    updatePreview();
  });

  afterUpdate(updatePreview);

  onDestroy(() => {
    destroyed = true;
    onAssembledBuildPhaseChange("idle");
    preview?.destroy();
    preview = null;
  });

  // The seam plan arrives asynchronously and is compared by reference instead,
  // so the key covers only the settings that shape the rendered model.
  function previewRebuildKey(currentLayout: LayoutResult): string {
    return JSON.stringify({
      ...currentLayout.rawSettings,
      autoRotate: undefined,
    });
  }
</script>

<div class="three-preview-host" role="img" aria-label="Interactive 3D enclosure preview" bind:this={host}></div>
