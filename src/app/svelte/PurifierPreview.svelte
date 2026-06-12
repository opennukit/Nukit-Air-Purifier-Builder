<script lang="ts" module>
  import { LruMap } from "@/app/lruMap";
  import type { PrintableKit } from "@/fabrication/printing/printableKit";
  import { createPrintKitChannel } from "@/fabrication/printing/worker/kitWorkerClient";

  // The assembled tempest preview renders the same printable kit the export
  // uses, built off the main thread. Channel and cache live at module scope so
  // they survive preview-mode remounts: switching back to the assembled view
  // re-renders instantly from the cached kit instead of rebuilding through the
  // worker over a blank canvas. The cache is keyed on geometry-affecting
  // settings plus the requested print volume; keeping a few entries means
  // toggling exploded view (which alternates between the unsplit and the
  // active-preset kit) re-renders instantly once both kits are warm.
  const assembledKitChannel = createPrintKitChannel();
  const assembledKitCache = new LruMap<string, PrintableKit>(4);
  // A key that failed to build is not retried until the settings change or
  // the user asks (retryFailedAssembledKitBuild); afterUpdate fires on every
  // render, so retrying a persistent failure there would loop worker rebuilds
  // forever.
  let lastFailedAssembledKitKey: string | null = null;
</script>

<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import { isTempestPrintDesignId } from "@/domain/purifier/designPresets";
  import type { LayoutResult } from "@/fabrication/purifierLayout";
  import type { PrintVolumePresetId } from "@/fabrication/printing/printableKit";
  import { printKitCacheKey } from "@/fabrication/printing/printDesignKit";
  import { PurifierThreePreview } from "@/rendering/three/purifierThreePreview";

  type AssembledBuildPhase = "idle" | "building" | "failed";

  export let layout: LayoutResult;
  export let printVolumePresetId: PrintVolumePresetId;
  export let onAssembledBuildPhaseChange: (phase: AssembledBuildPhase) => void = () => {};

  // Exploded view shows the model separated into the actual printable chunks
  // of the user's selected print volume; the assembled view always shows the
  // seamless unsplit build.
  function assembledTempestPresetId(currentLayout: LayoutResult): PrintVolumePresetId {
    return currentLayout.configuration.preview.enclosure.explodedView ? printVolumePresetId : "unsplit";
  }

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
    readonly rebuildKey: string;
  };

  let host: HTMLDivElement;
  let preview: PurifierThreePreview | null = null;
  let previousRebuildKey = "";

  function updatePreview(): void {
    if (preview === null) {
      return;
    }
    const rebuildKey = previewRebuildKey(layout);
    if (rebuildKey === previousRebuildKey) {
      preview.setAutoRotate(layout.configuration.preview.enclosure.autoRotate);
      return;
    }
    if (isTempestPrintDesignId(layout.configuration.printDesign.id)) {
      updateTempestPreview(layout, rebuildKey);
      return;
    }
    // A non-tempest render invalidates any tempest render still waiting on a
    // kit (when that build lands it only warms the cache) and clears any
    // lingering tempest failure — this design renders fine.
    pendingTempestRender = null;
    onAssembledBuildPhaseChange("idle");
    preview.update(layout);
    previousRebuildKey = rebuildKey;
  }

  // The expensive Manifold kit builds off-thread; the previous model stays on
  // screen until the new kit lands. Latest-wins: a newer request supersedes the
  // in-flight one, and a superseded outcome changes nothing.
  function updateTempestPreview(currentLayout: LayoutResult, rebuildKey: string): void {
    const presetId = assembledTempestPresetId(currentLayout);
    const kitKey = printKitCacheKey(currentLayout.rawSettings, presetId);
    const cachedKit = assembledKitCache.get(kitKey);
    if (cachedKit !== undefined) {
      // The newest render request is satisfied right here; an older build
      // still in flight must not apply later and revert the preview. Serving
      // from cache also moots any lingering failure for another key.
      pendingTempestRender = null;
      onAssembledBuildPhaseChange("idle");
      applyTempestRender({ layout: currentLayout, rebuildKey }, cachedKit);
      return;
    }
    if (lastFailedAssembledKitKey === kitKey) {
      // Re-entering a key that already failed (e.g. toggling exploded view
      // away and back): re-surface the failure instead of silently keeping
      // whatever model is on screen.
      pendingTempestRender = null;
      onAssembledBuildPhaseChange("failed");
      return;
    }
    pendingTempestRender = { layout: currentLayout, rebuildKey };
    if (inFlightAssembledKitKey === kitKey) {
      // The build is already on its way; make sure the phase says so even if
      // a cache-hit render reported "idle" in between.
      onAssembledBuildPhaseChange("building");
      return;
    }
    inFlightAssembledKitKey = kitKey;
    onAssembledBuildPhaseChange("building");
    void assembledKitChannel.request(currentLayout.rawSettings, presetId).then((outcome) => {
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
      assembledKitCache.set(kitKey, outcome.kit);
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
    preview.update(render.layout, kit);
    previousRebuildKey = render.rebuildKey;
  }

  // The failure pill's "Try again" (App.svelte calls this via bind:this):
  // forget the failed key and run the normal update path again, which now
  // re-requests the build instead of re-surfacing the recorded failure.
  export function retryFailedAssembledKitBuild(): void {
    if (lastFailedAssembledKitKey === null) {
      return;
    }
    lastFailedAssembledKitKey = null;
    updatePreview();
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

  // The key covers the settings that shape the rendered model — plus, for
  // tempest, which kit the assembled preview renders: changing the print
  // volume while exploded view is on must re-render with the new chunks.
  function previewRebuildKey(currentLayout: LayoutResult): string {
    return JSON.stringify({
      ...currentLayout.rawSettings,
      autoRotate: undefined,
      assembledTempestPresetId: isTempestPrintDesignId(currentLayout.configuration.printDesign.id)
        ? assembledTempestPresetId(currentLayout)
        : undefined,
    });
  }
</script>

<div class="three-preview-host" role="img" aria-label="Interactive 3D enclosure preview" bind:this={host}></div>
