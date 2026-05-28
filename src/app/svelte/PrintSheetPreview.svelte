<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import {
    PrintSheetThreePreview,
    type PrintSheetPreviewSettings,
    type PrintSheetThreePreviewPlan,
  } from "@/rendering/three/printSheetThreePreview";

  export let plan: PrintSheetThreePreviewPlan;
  export let settings: PrintSheetPreviewSettings;
  export let label = "3D print plate preview";
  export let className = "print-sheet-three-host";

  let host: HTMLDivElement;
  let preview: PrintSheetThreePreview | null = null;

  function updatePreview(): void {
    preview?.update(plan, settings);
  }

  onMount(() => {
    preview = new PrintSheetThreePreview(host);
    updatePreview();
  });

  afterUpdate(updatePreview);

  onDestroy(() => {
    preview?.destroy();
    preview = null;
  });
</script>

<div class={className} role="img" aria-label={label} bind:this={host}></div>
