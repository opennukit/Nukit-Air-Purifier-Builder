<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import type { LayoutResult } from "@/fabrication/purifierLayout";
  import type { PrintableSheetPlan } from "@/fabrication/printing/printableKit";
  import { PurifierThreePreview } from "@/rendering/three/purifierThreePreview";

  export let layout: LayoutResult;
  export let printSeamPlan: PrintableSheetPlan | null;

  let host: HTMLDivElement;
  let preview: PurifierThreePreview | null = null;
  let previousRebuildKey = "";

  function updatePreview(): void {
    if (preview === null) {
      return;
    }
    const rebuildKey = previewRebuildKey(layout, printSeamPlan);
    if (rebuildKey !== previousRebuildKey) {
      preview.update(layout, printSeamPlan);
      previousRebuildKey = rebuildKey;
      return;
    }
    preview.setAutoRotate(layout.configuration.preview.enclosure.autoRotate);
  }

  onMount(() => {
    preview = new PurifierThreePreview(host);
    updatePreview();
  });

  afterUpdate(updatePreview);

  onDestroy(() => {
    preview?.destroy();
    preview = null;
  });

  function previewRebuildKey(currentLayout: LayoutResult, currentPrintSeamPlan: PrintableSheetPlan | null): string {
    const rawSettingsThatAffectGeometry = {
      ...currentLayout.rawSettings,
      autoRotate: undefined,
    };
    return JSON.stringify({
      rawSettingsThatAffectGeometry,
      printSeamPreset: currentPrintSeamPlan?.kit.preset.id ?? "none",
      printSeamParts: currentPrintSeamPlan?.kit.summary.partCount ?? 0,
    });
  }
</script>

<div class="three-preview-host" role="img" aria-label="Interactive 3D enclosure preview" bind:this={host}></div>
