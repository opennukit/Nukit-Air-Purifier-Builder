<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import { isTempestPrintDesignId } from "@/domain/purifier/designPresets";
  import type { LayoutResult } from "@/fabrication/purifierLayout";
  import type { PrintableKit, PrintableSheetPlan } from "@/fabrication/printing/printableKit";
  import { createPrintKitChannel } from "@/fabrication/printing/worker/kitWorkerClient";
  import { printKitCacheKey } from "@/fabrication/printing/printDesignKit";
  import { PurifierThreePreview } from "@/rendering/three/purifierThreePreview";

  type AssembledBuildPhase = "idle" | "building";

  export let layout: LayoutResult;
  export let printSeamPlan: PrintableSheetPlan | null;
  export let onAssembledBuildPhase: (phase: AssembledBuildPhase) => void = () => {};

  // The assembled tempest preview renders the same printable kit the export
  // uses, built off the main thread. The cache (keyed on geometry-affecting
  // settings) makes preview-only toggles like fans or exploded view re-render
  // instantly without a new geometry build.
  const assembledKitChannel = createPrintKitChannel();
  const assembledKitPresetId = "unsplit";
  let assembledKitCache: { readonly key: string; readonly kit: PrintableKit } | null = null;
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
    // kit; when that build lands it only warms the cache.
    pendingTempestRender = null;
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
      applyTempestRender({ layout: currentLayout, seamPlan: currentSeamPlan, rebuildKey }, assembledKitCache.kit);
      return;
    }
    pendingTempestRender = { layout: currentLayout, seamPlan: currentSeamPlan, rebuildKey };
    if (inFlightAssembledKitKey === kitKey) {
      return;
    }
    inFlightAssembledKitKey = kitKey;
    onAssembledBuildPhase("building");
    void assembledKitChannel.request(currentLayout.rawSettings, assembledKitPresetId).then((outcome) => {
      if (outcome.type === "superseded") {
        return;
      }
      inFlightAssembledKitKey = null;
      onAssembledBuildPhase("idle");
      if (outcome.type === "failed") {
        console.error(`updateTempestPreview: assembled kit build failed: ${outcome.message}`);
        pendingTempestRender = null;
        return;
      }
      assembledKitCache = { key: kitKey, kit: outcome.kit };
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
    onAssembledBuildPhase("idle");
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
