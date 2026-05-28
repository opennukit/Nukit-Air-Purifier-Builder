<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import type { LayoutResult } from "@/fabrication/purifierLayout";
  import type { PrintableSheetPlan } from "@/fabrication/printing/printableKit";
  import { PurifierThreePreview } from "@/rendering/three/purifierThreePreview";

  export let layout: LayoutResult;
  export let printSeamPlan: PrintableSheetPlan | null;

  let host: HTMLDivElement;
  let preview: PurifierThreePreview | null = null;

  function updatePreview(): void {
    preview?.update(layout, printSeamPlan);
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
</script>

<div class="three-preview-host" role="img" aria-label="Interactive 3D enclosure preview" bind:this={host}></div>
