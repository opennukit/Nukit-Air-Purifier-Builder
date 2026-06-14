<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import {
    normalizePurifierDraft,
    printDesignIdForPurifierDraft,
    serializePurifierDraft,
  } from "@/domain/purifier/airPurifier";
  import { decodePurifierDraftSettings, encodeSettings } from "@/domain/purifier/settingsCodec";
  import {
    applyTempestArrangementDefaults,
    cordHoleSides,
    cordHoleWalls,
    previewMaterialColorPresets,
    type CordHoleSide,
    type CordHoleWall,
    type PreviewMaterialColorId,
    type PurifierDraft,
    type RawPurifierSettings,
  } from "@/domain/purifier/settingsModel";
  import {
    defaultThreeDimensionalPrintDesignId,
    isPublicThreeDimensionalPrintDesignId,
    isStaticReferencePrintDesignId,
    type TempestArrangementPreset,
  } from "@/domain/purifier/designPresets";
  import {
    automaticFanCount,
    fanAppearanceForColor,
    fanColors,
    fixedFanCountOptions,
    type FanColor,
  } from "@/domain/purifier/fans";
  import {
    advancedJointControls,
    cordHoleInfo,
    donutFilterDimensionControls,
    fanPlacementControls,
    filterDimensionControls,
    generatedGeometryControls,
    nukitPanelFitControls,
    tempestArrangementOptions,
    tempestBoxExhaustControls,
    tempestFitControls,
    tempestHexGrillControls,
    type BooleanSettingName,
    type DonutFilterDimensionName,
    type DonutNumberSettingName,
    type FanCountSettingName,
    type FilterDimensionName,
    type NumericSettingName,
  } from "@/app/controls/controlMetadata";
  import {
    fanSizeChoiceForSettings,
    recommendedFanDiameterOptions,
    type FanSizeChoice,
  } from "@/app/controls/fanSelection";
  import {
    readCheckboxInput,
    readFanCountControlValue,
    readNumberInput,
    requireSelect,
  } from "@/app/controls/inputReaders";
  import { createActivePrintSheetPlan } from "@/app/printSheetPlans";
  import { LruMap } from "@/app/lruMap";
  import { createPrintKitChannel } from "@/fabrication/printing/worker/kitWorkerClient";
  import { evaluateActiveExportDiagnostics, summarizeActiveBuildReadiness } from "@/app/diagnostics";
  import { staticReferenceFilesUrl } from "@/app/externalLinks";
  import { fabricationMethodLabel, fanColorLabels, previewMaterialColorLabel, swatchColor } from "@/app/labels";
  import {
        createPartsListItems,
    createPreviewSummaryItems,
    type PartsListItem,
    type SummaryItem,
  } from "@/app/summaries";
  import type { PreviewMode } from "@/app/workbench/previewMode";
  import {
    createPrintDesignSettingsMemory,
    rememberPrintDesignSettings,
    switchPrintDesignSettings,
    type PrintDesignSettingsMemory,
  } from "@/app/state/printDesignSettingsMemory";
  import {
    decodeWorkbenchState,
    encodeWorkbenchState,
    withFabricationMethod,
    withPreviewMode,
    withPrintVolumePreset,
    type WorkbenchState,
  } from "@/app/workbench/workbenchState";
  import {
    createWorkbenchViewModel,
    normalizeWorkbenchSession,
    normalizeWorkbenchStateForSettings,
    type WorkbenchControlPanels,
    type WorkbenchDesignContext,
    type WorkbenchFabricationPreview,
    type WorkbenchViewModel,
  } from "@/app/workbench/workbenchViewModel";
  import { exportBlockingDiagnostics, summarizeBuildReadiness, type BuildDiagnostic } from "@/fabrication/buildDiagnostics";
  import { createLaserSvg, createLayout, type LayoutResult } from "@/fabrication/purifierLayout";
  import {
    createPrintableSheetPlanFromKit,
    exportFormats as fabricationMethods,
    findPrintVolumePreset,
    printVolumePresets,
    type ExportFormat,
    type PrintableSheetPlan,
    type PrintVolumePresetId,
  } from "@/fabrication/printing/printableKit";
  import { createPrintDesignThreeMfZipFromKit, printKitCacheKey } from "@/fabrication/printing/printDesignKit";
  import type { PrintSheetThreePreviewPlan } from "@/rendering/three/printSheetThreePreview";
  import PurifierPreview from "@/app/svelte/PurifierPreview.svelte";
  import PrintSheetPreview from "@/app/svelte/PrintSheetPreview.svelte";

  // #######################################
  // State Model
  // #######################################

  type FabricationMethod = ExportFormat;
  type TransientButtonKey = "copy-top" | "copy-mobile" | "export-main" | "export-mobile";
  type TransientButtonLabels = Partial<Record<TransientButtonKey, string>>;

  // The print kit behind the generated sheet plan builds in a worker; the
  // "ready" state lives in the plan cache itself, so this tracks the build in
  // flight and the last failure (which keeps the previous plan on screen).
  // Both carry the cache key they answer, so a key is requested at most once:
  // not re-posted while building, and not retried after failing until the
  // settings change or the user retries (retryFailedPreviewBuild).
  type PrintKitBuildState =
    | { readonly type: "idle" }
    | { readonly type: "building"; readonly key: string }
    | { readonly type: "failed"; readonly key: string; readonly message: string };

  // #######################################
  // Svelte State
  // #######################################

  // ##############################
  // Initial Session
  // ##############################

  const initialUrlParams = new URLSearchParams(window.location.search);

  // Reduced-motion users get a still model by default; an explicit autoRotate
  // URL param is a deliberate choice in a shared link, so it still wins.
  function applyReducedMotionAutoRotateDefault(draft: PurifierDraft): PurifierDraft {
    const autoRotateIsExplicit = initialUrlParams.has("autoRotate");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (autoRotateIsExplicit || !prefersReducedMotion) {
      return draft;
    }
    return {
      ...draft,
      preview: {
        ...draft.preview,
        enclosure: { ...draft.preview.enclosure, autoRotate: false },
      },
    };
  }

  const initialSession = normalizeWorkbenchSession(
    applyReducedMotionAutoRotateDefault(decodePurifierDraftSettings(window.location.search)),
    decodeWorkbenchState(initialUrlParams),
  );
  let draft: PurifierDraft = initialSession.settings;
  let settings: RawPurifierSettings = serializePurifierDraft(draft);
  let workbenchState: WorkbenchState = initialSession.workbenchState;
  let workbenchView: WorkbenchViewModel = createWorkbenchViewModel(draft, workbenchState);
  let printDesignSettingsMemory: PrintDesignSettingsMemory = createPrintDesignSettingsMemory(draft);
  let sheetDialog: HTMLDialogElement;
  let isSheetDialogOpen = false;
  let transientButtonLabels: TransientButtonLabels = {};
  const transientLabelTimers = new Map<TransientButtonKey, number>();
  // A few warm plans, keyed like the assembled-kit cache, so toggling between
  // bed presets (or settings the user just left) re-renders without a rebuild.
  const generatedPrintSheetPlanCache = new LruMap<string, PrintableSheetPlan>(4);
  const printSheetKitChannel = createPrintKitChannel();
  let printSheetKitBuild: PrintKitBuildState = { type: "idle" };
  // Reported up by PurifierPreview about its assembled tempest kit build.
  let assembledPreviewBuildPhase: "idle" | "building" | "failed" = "idle";
  let purifierPreview: PurifierPreview | undefined;
  // First load shows a centered "Building model…" state until the first build
  // SUCCEEDS; after that, rebuilds only show the corner pill over the old
  // model. A failed first build stays in-progress, so the next attempt builds
  // front and center again instead of behind a pill over a blank canvas.
  type FirstPreviewBuild = "not-started" | "in-progress" | "done";
  let firstPreviewBuild: FirstPreviewBuild = "not-started";

  // ##############################
  // Derived View State
  // ##############################

  let previewMode: PreviewMode = workbenchView.previewMode;
  let fabricationMethod: FabricationMethod = workbenchView.fabricationMethod;
  let printVolumePresetId: PrintVolumePresetId = workbenchView.printVolumePresetId;
  let layout: LayoutResult = createLayout(draft);
  let exportDiagnostics: readonly BuildDiagnostic[] = [];
  let exportReadiness: BuildDiagnostic = summarizeBuildReadiness(layout);
  let previewSummaryItems: readonly SummaryItem[] = [];
  let partsItems: readonly PartsListItem[] = [];
  let generatedPrintSheetPlan: PrintableSheetPlan | null = null;
  let activePrintSheetPlan: PrintSheetThreePreviewPlan | null = null;
  let activeDesignContext: WorkbenchDesignContext = workbenchView.design;
  let activeFabricationPreview: WorkbenchFabricationPreview = workbenchView.fabricationPreview;
  let activeControlPanels: WorkbenchControlPanels = workbenchView.controlPanels;
  let isFourFilterTower = false;
  let selectedFanSizeChoice: FanSizeChoice = fanSizeChoiceForSettings(settings.fanDiameter, settings.topExhaust);
  let isStaticReferenceControlsActive = false;
  let showCutSheetPreviewMode = false;
  let showPrintSheetsPreviewMode = true;
  let isDonutControlsActive = false;
  let isTempestControlsActive = false;
  // Honeycomb grill only applies to PC-fan exhausts; box/exhaust mode has no grill.
  let showHexGrillControls = false;
  let isNukitControlsActive = true;
  let showPrintSetupControls = true;
  let showAdvancedControls = true;
  let layoutSectionTitleText = "Fan placement";
  let partsSectionTitleText = "Filter and fan";
  let exportActionText = "Download print kit";
  let copyTopButtonText = "Copy URL";
  let copyMobileButtonText = "Copy URL";
  let exportMainButtonText = "Download print kit";
  let exportMobileButtonText = "Download print kit";

  // ##############################
  // Reactive Derivations
  // ##############################

  $: settings = serializePurifierDraft(draft);
  $: workbenchView = createWorkbenchViewModel(draft, workbenchState);
  $: previewMode = workbenchView.previewMode;
  $: fabricationMethod = workbenchView.fabricationMethod;
  $: printVolumePresetId = workbenchView.printVolumePresetId;
  $: layout = createLayout(draft);
  $: generatedPrintSheetPlan = resolveGeneratedPrintSheetPlan(layout, fabricationMethod, printVolumePresetId, previewMode);
  // The sheet-plan half only counts for 3D printing: the laser path renders
  // synchronously, so no pill or overlay belongs there even if a print build
  // is still settling in the background.
  $: isPreviewUpdating =
    (fabricationMethod === "print-3mf" && printSheetKitBuild.type === "building") ||
    assembledPreviewBuildPhase === "building";
  $: hasPreviewBuildFailure =
    (fabricationMethod === "print-3mf" && printSheetKitBuild.type === "failed") ||
    assembledPreviewBuildPhase === "failed";
  $: if (isPreviewUpdating && firstPreviewBuild === "not-started") {
    firstPreviewBuild = "in-progress";
  }
  $: if (firstPreviewBuild === "in-progress" && !isPreviewUpdating && !hasPreviewBuildFailure) {
    firstPreviewBuild = "done";
  }
  // The single source for the preview build status: one persistent live region
  // announces it, and the visual overlay/pill below render the same text.
  $: previewStatusText = isPreviewUpdating
    ? firstPreviewBuild === "done"
      ? "Updating…"
      : "Building model…"
    : hasPreviewBuildFailure
      ? "Couldn't update the model"
      : "";
  $: exportDiagnostics = evaluateActiveExportDiagnostics(layout, fabricationMethod, generatedPrintSheetPlan);
  $: exportReadiness = summarizeActiveBuildReadiness(layout, exportDiagnostics, fabricationMethod);
  $: previewSummaryItems = createPreviewSummaryItems(layout, previewMode, fabricationMethod, printVolumePresetId, generatedPrintSheetPlan);
  $: partsItems = createPartsListItems(layout, fabricationMethod, settings, printVolumePresetId);
  $: activePrintSheetPlan = previewMode === "print-sheets" ? createActivePrintSheetPlan(layout, printVolumePresetId, generatedPrintSheetPlan) : null;
  $: activeDesignContext = workbenchView.design;
  $: activeFabricationPreview = workbenchView.fabricationPreview;
  $: activeControlPanels = workbenchView.controlPanels;
  $: isFourFilterTower = isTempestControlsActive && settings.tempestArrangement === "four-side-filter-tower";
  $: selectedFanSizeChoice = fanSizeChoiceForSettings(
    settings.fanDiameter,
    isFourFilterTower ? settings.topExhaust : "fan-grid",
  );
  $: isStaticReferenceControlsActive = activeDesignContext.type === "static-reference";
  $: showCutSheetPreviewMode = activeFabricationPreview.type === "cut-sheet";
  $: showPrintSheetsPreviewMode = activeFabricationPreview.type === "print-sheets";
  $: isDonutControlsActive = activeDesignContext.type === "donut-filter-adapter";
  $: isTempestControlsActive = activeDesignContext.type === "tempest";
  $: showHexGrillControls = isTempestControlsActive && selectedFanSizeChoice !== "box-exhaust";
  // Box/exhaust uses its own ring screws, so the PC-fan screw-hole input is hidden.
  $: visibleGeometryControls =
    selectedFanSizeChoice === "box-exhaust"
      ? generatedGeometryControls.filter((control) => control.name !== "screwHoleDiameter")
      : generatedGeometryControls;
  $: isNukitControlsActive = activeDesignContext.type === "nukit";
  $: showPrintSetupControls = fabricationMethod === "print-3mf" && activeControlPanels.setup.type === "available";
  $: showAdvancedControls = activeControlPanels.advanced.type === "available";
  $: layoutSectionTitleText = activeDesignContext.layoutSectionTitle;
  $: partsSectionTitleText = activeDesignContext.partsSectionTitle;
  $: exportActionText = workbenchView.exportActionLabel;
  $: copyTopButtonText = transientButtonLabels["copy-top"] ?? "Copy URL";
  $: copyMobileButtonText = transientButtonLabels["copy-mobile"] ?? "Copy URL";
  $: exportMainButtonText = transientButtonLabels["export-main"] ?? exportActionText;
  $: exportMobileButtonText = transientButtonLabels["export-mobile"] ?? exportActionText;

  // ##############################
  // Lifecycle
  // ##############################

  onDestroy(() => {
    for (const timer of transientLabelTimers.values()) {
      window.clearTimeout(timer);
    }
  });

  // ##############################
  // Manual State Sync
  // ##############################

  function syncDerivedWorkbenchState(): void {
    settings = serializePurifierDraft(draft);
    workbenchView = createWorkbenchViewModel(draft, workbenchState);
    previewMode = workbenchView.previewMode;
    fabricationMethod = workbenchView.fabricationMethod;
    printVolumePresetId = workbenchView.printVolumePresetId;
    activeDesignContext = workbenchView.design;
    activeFabricationPreview = workbenchView.fabricationPreview;
    activeControlPanels = workbenchView.controlPanels;
  }

  // #######################################
  // State Transitions
  // #######################################

  function commitSettings(nextSettings: RawPurifierSettings): void {
    const normalizedDraft = normalizePurifierDraft(nextSettings);
    draft = normalizedDraft;
    settings = serializePurifierDraft(normalizedDraft);
    printDesignSettingsMemory = rememberPrintDesignSettings(printDesignSettingsMemory, normalizedDraft);
    workbenchState = normalizeWorkbenchStateForSettings(workbenchState, normalizedDraft);
    syncDerivedWorkbenchState();
    syncUrl();
  }

  function setWorkbenchState(nextState: WorkbenchState): void {
    workbenchState = normalizeWorkbenchStateForSettings(nextState, draft);
    syncDerivedWorkbenchState();
    syncUrl();
  }

  function applyFabricationMethod(nextMethod: FabricationMethod): void {
    const nextState = withFabricationMethod(workbenchState, nextMethod);
    let nextDraft = draft;
    let nextMemory = printDesignSettingsMemory;
    if (nextMethod === "laser-svg" && printDesignIdForPurifierDraft(draft) !== "nukit-open-air") {
      const switched = switchPrintDesignSettings(printDesignSettingsMemory, draft, "nukit-open-air");
      nextDraft = normalizePurifierDraft(switched.settings);
      nextMemory = switched.memory;
    } else if (
      nextMethod === "print-3mf" &&
      !isPublicThreeDimensionalPrintDesignId(printDesignIdForPurifierDraft(draft))
    ) {
      const switched = switchPrintDesignSettings(printDesignSettingsMemory, draft, defaultThreeDimensionalPrintDesignId);
      nextDraft = normalizePurifierDraft(switched.settings);
      nextMemory = switched.memory;
    }
    draft = nextDraft;
    settings = serializePurifierDraft(nextDraft);
    printDesignSettingsMemory = nextMemory;
    workbenchState = normalizeWorkbenchStateForSettings(nextState, nextDraft);
    syncDerivedWorkbenchState();
    syncUrl();
  }

  // ##############################
  // Form Control Updates
  // ##############################

  function updateFanSizeChoice(choice: FanSizeChoice): void {
    if (choice === "box-exhaust") {
      commitSettings({ ...settings, topExhaust: "box-exhaust" });
      return;
    }
    commitSettings({
      ...settings,
      fanDiameter: choice,
      topExhaust: "fan-grid",
    });
  }

  function updateFanColor(color: FanColor): void {
    commitSettings({
      ...settings,
      fanColor: color,
    });
  }

  function updateTempestArrangement(arrangement: TempestArrangementPreset): void {
    commitSettings(applyTempestArrangementDefaults(settings, arrangement));
  }

  const filterDimensionNames = new Set<string>(filterDimensionControls.map((control) => control.name));

  function updateMeasuredDimension(
    name: FilterDimensionName | DonutFilterDimensionName,
    event: Event,
  ): void {
    const entered = readNumberInput(event, Number.NaN);
    if (Number.isNaN(entered)) {
      return;
    }
    // All measurements are millimetres (no unit toggle). The rectangular filter
    // dimensions are whole millimetres; the round-shaped donut filter keeps its
    // decimals.
    const value = filterDimensionNames.has(name) ? Math.round(entered) : entered;
    commitSettings({
      ...settings,
      [name]: value,
    });
  }

  function updateDonutNumberSetting(
    name: DonutNumberSettingName,
    event: Event,
  ): void {
    commitSettings({
      ...settings,
      [name]: readNumberInput(event, settings[name]),
    });
  }

  function updateNumberSetting(name: NumericSettingName, event: Event): void {
    const nextSettings: RawPurifierSettings = {
      ...settings,
      [name]: readNumberInput(event, settings[name]),
    };
    commitSettings(nextSettings);
  }

  function updateCordHoleWall(event: Event): void {
    commitSettings({ ...settings, cordHoleWall: (event.target as HTMLSelectElement).value as CordHoleWall });
  }

  function updateCordHoleSide(event: Event): void {
    commitSettings({ ...settings, cordHoleSide: (event.target as HTMLSelectElement).value as CordHoleSide });
  }

  function titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function updateBooleanSetting(name: BooleanSettingName, event: Event): void {
    const nextSettings: RawPurifierSettings = {
      ...settings,
      [name]: readCheckboxInput(event),
    };
    commitSettings(nextSettings);
  }

  function updatePreviewMaterialColor(color: PreviewMaterialColorId): void {
    commitSettings({
      ...settings,
      previewMaterialColor: color,
    });
  }

  function updateFilterCount(count: 1 | 2): void {
    commitSettings({
      ...settings,
      filters: count,
    });
  }

  function updateFanCountSetting(
    name: FanCountSettingName,
    event: Event,
  ): void {
    commitSettings({
      ...settings,
      [name]: readFanCountControlValue(event),
    });
  }

  function toggleAutoRotate(): void {
    commitSettings({
      ...settings,
      autoRotate: !settings.autoRotate,
    });
  }

  // ##############################
  // Info Tips
  // ##############################

  // Tooltips open on hover/keyboard focus via CSS alone; this click-toggled
  // state exists for touch, where iOS Safari taps neither hover nor focus the
  // button. At most one tip is open; the id is the tooltip element's id.
  let openInfoTipId: string | null = null;

  function toggleInfoTip(tipId: string): void {
    openInfoTipId = openInfoTipId === tipId ? null : tipId;
  }

  function closeInfoTip(tipId: string): void {
    if (openInfoTipId === tipId) {
      openInfoTipId = null;
    }
  }

  function handleInfoTipKeydown(tipId: string, event: KeyboardEvent): void {
    if (event.key === "Escape") {
      closeInfoTip(tipId);
    }
  }

  // ##############################
  // Workbench Navigation
  // ##############################

  function setPreviewMode(nextMode: PreviewMode): void {
    setWorkbenchState(withPreviewMode(workbenchState, nextMode));
  }

  function setPrintVolume(event: Event): void {
    setWorkbenchState(withPrintVolumePreset(workbenchState, findPrintVolumePreset(requireSelect(event, "setPrintVolume").value).id));
  }

  // #######################################
  // View Availability
  // #######################################

  // #######################################
  // Export and Dialog Actions
  // #######################################

  function exportDrawing(buttonKey: TransientButtonKey): void {
    // Only blocking diagnostics refuse the export; advisories stay visible in
    // the checks list but leave the download available.
    if (exportBlockingDiagnostics(exportDiagnostics).length > 0) {
      flashDownloadButtons("Review checks");
      return;
    }

    if (fabricationMethod === "print-3mf") {
      showTransientButtonLabel(buttonKey, exportPrintKit(layout, generatedPrintSheetPlan, printSheetKitBuild), 1400);
      return;
    }

    exportSvgDrawing(layout);
    showTransientButtonLabel(buttonKey, "Exported SVG", 1400);
  }

  function exportSvgDrawing(currentLayout: LayoutResult): void {
    const svg = createLaserSvg(currentLayout);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nukit-open-air-purifier.svg";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportPrintKit(
    currentLayout: LayoutResult,
    currentGeneratedPlan: PrintableSheetPlan | null,
    currentKitBuild: PrintKitBuildState,
  ): string {
    if (isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      window.open(staticReferenceFilesUrl(currentLayout), "_blank", "noopener,noreferrer");
      return "Opened source files";
    }
    // Only a fresh plan may be exported. While a rebuild is in flight the
    // cached plan still reflects the previous settings, so ask the user to
    // retry shortly; after a failure there is no plan for these settings at
    // all.
    if (currentKitBuild.type === "building") {
      return "Still updating…";
    }
    if (currentKitBuild.type === "failed") {
      return "Build failed";
    }
    if (currentGeneratedPlan === null) {
      // The plan resolves lazily, so nothing may be building yet (e.g.
      // exporting straight from the assembled view): start the build now and
      // ask the user to retry shortly.
      requestGeneratedPrintSheetPlan(currentLayout, printVolumePresetId, printKitCacheKey(currentLayout.rawSettings, printVolumePresetId));
      return "Still updating…";
    }
    const printExport = createPrintDesignThreeMfZipFromKit(currentLayout, currentGeneratedPlan.kit);
    const blob = new Blob([toArrayBuffer(printExport.bytes)], { type: printExport.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = printExport.filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "Downloaded kit";
  }

  function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
  }

  async function copyUrl(buttonKey: TransientButtonKey): Promise<void> {
    const url = new URL(window.location.href);
    url.search = encodeShareState();
    try {
      await navigator.clipboard.writeText(url.toString());
      showTransientButtonLabel(buttonKey, "Copied", 1200);
    } catch (error) {
      console.warn("copyUrl: Clipboard write failed", error);
      showTransientButtonLabel(buttonKey, "Copy failed", 1600);
    }
  }

  function openSheetDialog(): void {
    if (previewMode === "enclosure") {
      return;
    }
    isSheetDialogOpen = true;
    void tick().then(() => {
      if (!sheetDialog.open) {
        sheetDialog.showModal();
      }
    });
  }

  function closeSheetDialog(): void {
    isSheetDialogOpen = false;
    if (sheetDialog.open) {
      sheetDialog.close();
    }
  }

  function handleDialogClose(): void {
    isSheetDialogOpen = false;
  }

  function closeDialogOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      closeSheetDialog();
    }
  }

  function flashDownloadButtons(label: string): void {
    showTransientButtonLabel("export-main", label, 1400);
    showTransientButtonLabel("export-mobile", label, 1400);
  }

  function showTransientButtonLabel(key: TransientButtonKey, label: string, durationMs: number): void {
    const previousTimer = transientLabelTimers.get(key);
    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer);
    }
    transientButtonLabels = {
      ...transientButtonLabels,
      [key]: label,
    };
    const nextTimer = window.setTimeout(() => {
      const { [key]: _removed, ...rest } = transientButtonLabels;
      transientButtonLabels = rest;
      transientLabelTimers.delete(key);
    }, durationMs);
    transientLabelTimers.set(key, nextTimer);
  }

  // #######################################
  // URL and Preview Plans
  // #######################################

  // ##############################
  // Share URL
  // ##############################

  function syncUrl(): void {
    const url = new URL(window.location.href);
    url.search = encodeShareState();
    window.history.replaceState(null, "", url);
  }

  function encodeShareState(): string {
    const params = new URLSearchParams(encodeSettings(draft));
    for (const [key, value] of encodeWorkbenchState(workbenchState)) {
      params.set(key, value);
    }
    return params.toString();
  }

  // ##############################
  // Print Sheet Plans
  // ##############################

  // Resolves the plan synchronously from the cache when possible. On a cache
  // miss a worker build only starts when a view actually shows the plan —
  // posting the visible assembled tempest request first in the worker's FIFO
  // queue — and the previous plan stays on screen until the new one lands
  // (the "Updating…" indicator covers the gap). While nothing shows the plan,
  // the summaries render their pending placeholders and the export button
  // starts a build on demand.
  function resolveGeneratedPrintSheetPlan(
    currentLayout: LayoutResult,
    currentFabricationMethod: FabricationMethod,
    currentPrintVolumePresetId: PrintVolumePresetId,
    currentPreviewMode: PreviewMode,
  ): PrintableSheetPlan | null {
    if (currentFabricationMethod !== "print-3mf" || isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      return null;
    }
    const cacheKey = printKitCacheKey(currentLayout.rawSettings, currentPrintVolumePresetId);
    const cachedPlan = generatedPrintSheetPlanCache.get(cacheKey);
    if (cachedPlan !== undefined) {
      // A recorded failure always belongs to some other key (failures never
      // reach the cache), and it is moot once the current key serves from
      // cache — clear it so the export path sees a fresh plan.
      if (printSheetKitBuild.type === "failed") {
        printSheetKitBuild = { type: "idle" };
      }
      return cachedPlan;
    }
    if (currentPreviewMode !== "print-sheets") {
      return null;
    }
    const keyAlreadyHandled = printSheetKitBuild.type !== "idle" && printSheetKitBuild.key === cacheKey;
    if (!keyAlreadyHandled) {
      requestGeneratedPrintSheetPlan(currentLayout, currentPrintVolumePresetId, cacheKey);
    }
    return generatedPrintSheetPlan;
  }

  function requestGeneratedPrintSheetPlan(
    currentLayout: LayoutResult,
    currentPrintVolumePresetId: PrintVolumePresetId,
    cacheKey: string,
  ): void {
    printSheetKitBuild = { type: "building", key: cacheKey };
    void printSheetKitChannel.request(currentLayout.rawSettings, currentPrintVolumePresetId).then((outcome) => {
      // A superseded request was replaced by a newer one that now owns the
      // build state, so it changes nothing here.
      if (outcome.type === "superseded") {
        return;
      }
      if (outcome.type === "failed") {
        console.error(`requestGeneratedPrintSheetPlan: print kit build failed: ${outcome.message}`);
        printSheetKitBuild = { type: "failed", key: cacheKey, message: outcome.message };
        return;
      }
      const plan = createPrintableSheetPlanFromKit(outcome.kit);
      generatedPrintSheetPlanCache.set(cacheKey, plan);
      printSheetKitBuild = { type: "idle" };
      // The finished build always warms the cache, but it only goes on screen
      // if it still answers the current settings — e.g. switching to the laser
      // method mid-build must keep the plan null, not resurrect a print plan.
      if (fabricationMethod === "print-3mf" && printKitCacheKey(layout.rawSettings, printVolumePresetId) === cacheKey) {
        generatedPrintSheetPlan = plan;
      }
    });
  }

  // "Try again" on the failure pill. A failed key is otherwise never retried
  // until the settings change, leaving the pill a dead end. The sheet-plan
  // side resets its build state and re-resolves through the same path the
  // reactive statement uses (which re-requests the build, since the failed
  // key no longer blocks it); the assembled preview retries through its own
  // component, which owns the failed-key memory.
  function retryFailedPreviewBuild(): void {
    if (printSheetKitBuild.type === "failed") {
      printSheetKitBuild = { type: "idle" };
      generatedPrintSheetPlan = resolveGeneratedPrintSheetPlan(layout, fabricationMethod, printVolumePresetId, previewMode);
    }
    purifierPreview?.retryFailedAssembledKitBuild();
  }

  workbenchState = normalizeWorkbenchStateForSettings(workbenchState, draft);
  syncDerivedWorkbenchState();
</script>

<main class="app-shell">
  <!-- #######################################
  App Header
  ####################################### -->

  <header class="topbar">
    <div>
      <p class="eyebrow">Browser generator</p>
      <h1>FilterBoxBuilder: DIY clean air</h1>
    </div>
    <div class="topbar-actions">
      <a
        class="icon-link"
        href="https://github.com/opennukit/Nukit-Air-Purifier-Builder"
        target="_blank"
        rel="noreferrer"
        aria-label="View source on GitHub"
        title="View source on GitHub"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.46-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
        </svg>
      </a>
      <button class="ghost-button" type="button" onclick={() => void copyUrl("copy-top")}>
        {copyTopButtonText}
      </button>
    </div>
  </header>

  <!-- #######################################
  Workbench
  ####################################### -->

  <section class="method-workbench" aria-label="Manufacturing workspace">
    <fieldset class="fabrication-method-field">
      <legend>Make with</legend>
      <div>
        {#each fabricationMethods as method}
          <label>
            <input
              type="radio"
              name="fabricationMethod"
              value={method}
              checked={fabricationMethod === method}
              onchange={() => applyFabricationMethod(method)}
            />
            <span>{fabricationMethodLabel(method)}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <section class="workspace" aria-label="Open air purifier builder">
      <!-- ##############################
      Preview Pane
      ############################## -->

      <section class="preview-pane" aria-label="Live preview">
        <div class="preview-toolbar" aria-label="Preview mode">
          <div class="preview-mode-group">
            <button
              class:is-active={previewMode === "enclosure"}
              class="mode-button"
              type="button"
              onclick={() => setPreviewMode("enclosure")}
            >
              Assembled box
            </button>
            {#if showCutSheetPreviewMode}
              <button
                class:is-active={previewMode === "cut-sheet"}
                class="mode-button"
                type="button"
                onclick={() => setPreviewMode("cut-sheet")}
              >
                Laser drawing
              </button>
            {/if}
            {#if showPrintSheetsPreviewMode}
              <button
                class:is-active={previewMode === "print-sheets"}
                class="mode-button"
                type="button"
                onclick={() => setPreviewMode("print-sheets")}
              >
                Print plates
              </button>
            {/if}
          </div>
          <span class="preview-toolbar-action-slot">
            <button
              class="ghost-button preview-large-view-button"
              type="button"
              disabled={previewMode === "enclosure"}
              aria-hidden={previewMode === "enclosure"}
              tabindex={previewMode === "enclosure" ? -1 : 0}
              onclick={openSheetDialog}
            >
              Open large view
            </button>
          </span>
        </div>

        <div
          class:is-three-preview={previewMode === "enclosure"}
          class:is-print-sheet-three-preview={previewMode === "print-sheets"}
          class:is-sheet-preview={previewMode === "cut-sheet"}
          class="preview-stage"
          id="previewStage"
        >
          <span class="sr-only" role="status">{previewStatusText}</span>
          {#if isPreviewUpdating && firstPreviewBuild !== "done"}
            <div class="preview-loading-overlay" aria-hidden="true">
              <span class="preview-loading-spinner"></span>
              {previewStatusText}
            </div>
          {:else if isPreviewUpdating}
            <span class="preview-updating-indicator" aria-hidden="true">{previewStatusText}</span>
          {:else if hasPreviewBuildFailure}
            <span class="preview-updating-indicator preview-update-failed">
              <span aria-hidden="true">{previewStatusText}</span>
              <button class="preview-retry-button" type="button" onclick={retryFailedPreviewBuild}>Try again</button>
            </span>
          {/if}
          {#if previewMode === "enclosure"}
            <div class="preview-view-controls" data-preview-view-controls>
              <div class="preview-toggle-strip" aria-label="Preview display options">
                <label class="toggle-field preview-toggle-field preview-control-main" title="Filters">
                  <input
                    type="checkbox"
                    name="showFilterMedia"
                    checked={settings.showFilterMedia}
                    onchange={(event) => updateBooleanSetting("showFilterMedia", event)}
                  />
                  <span class="preview-control-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path class="preview-icon-soft-fill" d="M5 5h14v14H5z" />
                      <path d="M8 5v14M12 5v14M16 5v14" />
                    </svg>
                  </span>
                  <span class="preview-control-label">Filter</span>
                </label>
                <label class="toggle-field preview-toggle-field preview-control-main" title="Fans">
                  <input
                    type="checkbox"
                    name="showFans"
                    checked={settings.showFans}
                    onchange={(event) => updateBooleanSetting("showFans", event)}
                  />
                  <span class="preview-control-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <circle class="preview-icon-soft-fill" cx="12" cy="12" r="2.4" />
                      <path d="M12 4c2.7 0 3.9 2.7 2.1 4.5L12 10zM20 12c0 2.7-2.7 3.9-4.5 2.1L14 12zM12 20c-2.7 0-3.9-2.7-2.1-4.5L12 14zM4 12c0-2.7 2.7-3.9 4.5-2.1L10 12z" />
                    </svg>
                  </span>
                  <span class="preview-control-label">Fans</span>
                </label>
                <span class="preview-toolbar-primary-break" aria-hidden="true"></span>
                <label class="toggle-field preview-toggle-field preview-control-spatial" title="Exploded view">
                  <input
                    type="checkbox"
                    name="explodedView"
                    checked={settings.explodedView}
                    onchange={(event) => updateBooleanSetting("explodedView", event)}
                  />
                  <span class="preview-control-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M9 9h6v6H9z" />
                      <path d="M8 8L4 4M4 4h4M4 4v4M16 8l4-4M20 4h-4M20 4v4M8 16l-4 4M4 20h4M4 20v-4M16 16l4 4M20 20h-4M20 20v-4" />
                    </svg>
                  </span>
                  <span class="preview-control-label">Exploded view</span>
                </label>
                <label class="toggle-field preview-toggle-field preview-control-spatial" title="Show dimensions">
                  <input
                    type="checkbox"
                    name="showDimensions"
                    checked={settings.showDimensions}
                    onchange={(event) => updateBooleanSetting("showDimensions", event)}
                  />
                  <span class="preview-control-icon" aria-hidden="true">
                    <span class="preview-control-glyph">mm</span>
                  </span>
                  <span class="preview-control-label">Show dimensions</span>
                </label>
                <label class="toggle-field preview-toggle-field preview-control-spatial" title="Scale reference">
                  <input
                    type="checkbox"
                    name="showBananaScale"
                    checked={settings.showBananaScale}
                    onchange={(event) => updateBooleanSetting("showBananaScale", event)}
                  />
                  <span class="preview-control-icon" aria-hidden="true">
                    <span class="preview-control-glyph preview-control-glyph-wide">1:1</span>
                  </span>
                  <span class="preview-control-label">Scale reference</span>
                </label>
                {#if fabricationMethod === "print-3mf" && !isStaticReferenceControlsActive}
                  <div class="preview-color-field" aria-label="Preview color">
                    {#each previewMaterialColorPresets as color}
                      <button
                        class:active-color={settings.previewMaterialColor === color.id}
                        type="button"
                        aria-label={previewMaterialColorLabel(color)}
                        aria-pressed={settings.previewMaterialColor === color.id}
                        title={previewMaterialColorLabel(color)}
                        onclick={() => updatePreviewMaterialColor(color.id)}
                      >
                        <span style:--swatch-color={swatchColor(color.color)}></span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
              <button
                class="preview-rotation-button"
                type="button"
                aria-pressed={settings.autoRotate}
                aria-label={settings.autoRotate ? "Pause auto rotate" : "Start auto rotate"}
                data-tooltip={settings.autoRotate ? "Pause rotation" : "Rotate"}
                title={settings.autoRotate ? "Pause rotation" : "Rotate"}
                onclick={toggleAutoRotate}
              >
                {#if settings.autoRotate}
                  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                    <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                  </svg>
                {:else}
                  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                {/if}
                <span class="sr-only">{settings.autoRotate ? "Pause auto rotate" : "Start auto rotate"}</span>
              </button>
            </div>
            <PurifierPreview
              bind:this={purifierPreview}
              {layout}
              {printVolumePresetId}
              onAssembledBuildPhaseChange={(phase) => (assembledPreviewBuildPhase = phase)}
            />
          {:else if previewMode === "print-sheets"}
            {#if activePrintSheetPlan !== null}
              <PrintSheetPreview plan={activePrintSheetPlan} />
            {/if}
          {:else if previewMode === "cut-sheet" && fabricationMethod === "laser-svg"}
            <div class="sheet-preview laser-sheet-preview">{@html createLaserSvg(layout)}</div>
          {/if}
        </div>

        <div class="summary-grid" id="summaryGrid">
          {#each previewSummaryItems as item}
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          {/each}
        </div>
      </section>

      <!-- ##############################
      Control Sidebar
      ############################## -->

      <aside class="controls-pane" aria-label="Build settings">
        <section class="persistent-output-panel" data-persistent-output-panel aria-label="Build output">
          <div class="export-readiness-summary" id="exportReadinessSummary">
            <div class={`diagnostic-item ${exportReadiness.severity}`}>
              <strong>{exportReadiness.title}</strong>
              <span>{exportReadiness.detail}</span>
            </div>
          </div>
          <div class="persistent-export-actions">
            <div class="export-action-menu" data-export-action-menu>
              <button
                class="primary-button export-primary-button"
                type="button"
                data-export-primary
                onclick={() => exportDrawing("export-main")}
              >
                {exportMainButtonText}
              </button>
            </div>
          </div>
          {#if exportDiagnostics.length > 0}
            <ul class="export-diagnostics-list" id="exportDiagnosticsList" aria-label="Export checks">
              {#each exportDiagnostics as diagnostic (diagnostic.id)}
                <li class={`diagnostic-item ${diagnostic.severity}`}>
                  <strong>{diagnostic.title}</strong>
                  <span>{diagnostic.detail}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <div class="controls-sections">
          {#if !isStaticReferenceControlsActive}
            <section class="control-section layout-section" data-generated-layout-controls>
              <div class="section-heading">
                <p class="eyebrow">Layout</p>
                <h2 id="layoutSectionTitle">{layoutSectionTitleText}</h2>
              </div>
              <div class="fan-grid">
                {#if isNukitControlsActive}
                  <div data-nukit-fan-placement>
                    {#each fanPlacementControls as control}
                      <label class="field compact-field">
                        <span>{control.label}</span>
                        <select name={control.name} onchange={(event) => updateFanCountSetting(control.name, event)}>
                          <option value={automaticFanCount} selected={settings[control.name] === automaticFanCount}>Auto</option>
                          {#each fixedFanCountOptions as count}
                            <option value={count} selected={settings[control.name] === count}>{count === 0 ? "None" : String(count)}</option>
                          {/each}
                        </select>
                      </label>
                    {/each}
                  </div>
                {/if}

                {#if isDonutControlsActive}
                  <div data-donut-layout>
                    <label class="field">
                      <span>Insert length</span>
                      <span class="input-shell">
                        <input
                          type="number"
                          name="donutAdapterInsertLength"
                          step="0.1"
                          inputmode="decimal"
                          value={settings.donutAdapterInsertLength}
                          onchange={(event) => updateDonutNumberSetting("donutAdapterInsertLength", event)}
                        />
                        <small>mm</small>
                      </span>
                    </label>
                    <label class="toggle-field">
                      <input
                        type="checkbox"
                        name="donutCapEnabled"
                        checked={settings.donutCapEnabled}
                        onchange={(event) => updateBooleanSetting("donutCapEnabled", event)}
                      />
                      <span>Print back cap</span>
                    </label>
                    <label class="field">
                      <span>Back cap rim</span>
                      <span class="input-shell">
                        <input
                          type="number"
                          name="donutCapRim"
                          step="0.1"
                          inputmode="decimal"
                          value={settings.donutCapRim}
                          onchange={(event) => updateDonutNumberSetting("donutCapRim", event)}
                        />
                        <small>mm</small>
                      </span>
                    </label>
                  </div>
                {/if}

                {#if isTempestControlsActive}
                  <div data-tempest-layout>
                    <fieldset class="segmented-field segmented-field-three">
                      <legend>Filter layout</legend>
                      <div>
                        {#each tempestArrangementOptions as option}
                          <label>
                            <input
                              type="radio"
                              name="tempestArrangement"
                              value={option.id}
                              checked={settings.tempestArrangement === option.id}
                              onchange={() => updateTempestArrangement(option.id)}
                            />
                            <span>{option.label}</span>
                          </label>
                        {/each}
                      </div>
                    </fieldset>
                  </div>
                {/if}
              </div>
              {#if isNukitControlsActive}
                <div data-nukit-filter-count>
                  <fieldset class="segmented-field">
                    <legend>Filters</legend>
                    <div>
                      <label>
                        <input
                          type="radio"
                          name="filters"
                          value="1"
                          checked={settings.filters === 1}
                          onchange={() => updateFilterCount(1)}
                        />
                        <span>One side</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="filters"
                          value="2"
                          checked={settings.filters === 2}
                          onchange={() => updateFilterCount(2)}
                        />
                        <span>Both sides</span>
                      </label>
                    </div>
                  </fieldset>
                </div>
              {/if}
            </section>
          {/if}

          {#if showPrintSetupControls}
            <section class="control-section print-volume-section" data-print-volume-section>
              <div class="section-heading">
                <p class="eyebrow">Printer</p>
                <h2>Print setup</h2>
              </div>
              <div data-print-volume-control>
                <label class="field">
                  <span>Print volume</span>
                  <select name="printVolume" onchange={setPrintVolume}>
                    {#each printVolumePresets as preset}
                      <option value={preset.id} selected={printVolumePresetId === preset.id}>{preset.label}</option>
                    {/each}
                  </select>
                </label>
              </div>
            </section>
          {/if}

          {#if !isStaticReferenceControlsActive}
            <section class="control-section parts-section">
              <div class="section-heading">
                <p class="eyebrow">Parts</p>
                <h2 id="partsSectionTitle">{partsSectionTitleText}</h2>
              </div>
              <p class="section-note">
                Get your filters first, measure them, then enter the numbers here.
              </p>
              <div data-generated-part-controls>
                <!--
                  Measurements are millimetres only — there is intentionally no
                  mm/in unit toggle. Filters are labelled with nominal sizes in
                  inches (a "20x25x1" is really ~622 x 495 x 19 mm), so an inch
                  field invites entering the nominal label instead of the actual
                  measured size. Millimetres push people to measure the real part.
                -->
                {#if !isDonutControlsActive}
                  <div data-rectangular-filter-controls>
                    <div class="custom-dimensions" data-custom-filter-dimensions>
                      {#each filterDimensionControls as control}
                        <label class="field">
                          <span>{control.label}</span>
                          <span class="input-shell">
                            <input
                              type="number"
                              name={control.name}
                              step={control.step}
                              max="999"
                              inputmode="numeric"
                              value={Math.round(settings[control.name])}
                              onchange={(event) => updateMeasuredDimension(control.name, event)}
                            />
                            <small>mm</small>
                          </span>
                        </label>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if isDonutControlsActive}
                  <div class="donut-filter-controls" data-donut-filter-controls>
                    <div class="donut-filter-dimensions">
                      {#each donutFilterDimensionControls as control}
                        <label class="field">
                          <span>{control.label}</span>
                          <span class="input-shell">
                            <input
                              type="number"
                              name={control.name}
                              step={control.step}
                              inputmode="decimal"
                              value={settings[control.name]}
                              onchange={(event) => updateMeasuredDimension(control.name, event)}
                            />
                            <small>mm</small>
                          </span>
                        </label>
                      {/each}
                    </div>
                  </div>
                {/if}

                <div class="fan-selection">
                  <fieldset class="segmented-field" class:segmented-field-three={isFourFilterTower}>
                    <legend>Fan size</legend>
                    <div>
                      {#each recommendedFanDiameterOptions as diameter}
                        <label>
                          <input
                            type="radio"
                            name="fanSizeChoice"
                            value={diameter}
                            checked={selectedFanSizeChoice === diameter}
                            onchange={() => updateFanSizeChoice(diameter)}
                          />
                          <span>{diameter} mm</span>
                        </label>
                      {/each}
                      {#if isFourFilterTower}
                        <label>
                          <input
                            type="radio"
                            name="fanSizeChoice"
                            value="box-exhaust"
                            checked={selectedFanSizeChoice === "box-exhaust"}
                            onchange={() => updateFanSizeChoice("box-exhaust")}
                          />
                          <span>Box/Exhaust</span>
                        </label>
                      {/if}
                    </div>
                  </fieldset>

                  {#if selectedFanSizeChoice === "box-exhaust"}
                    <div data-box-exhaust-controls>
                      {#each tempestBoxExhaustControls as control}
                        <label class="field">
                          <span>{control.label}</span>
                          <span class="input-shell">
                            <input
                              type="number"
                              name={control.name}
                              min="0"
                              step={control.step}
                              inputmode="decimal"
                              value={settings[control.name]}
                              onchange={(event) => updateNumberSetting(control.name, event)}
                            />
                            <small>{control.suffix}</small>
                          </span>
                        </label>
                      {/each}
                    </div>
                  {/if}

                  <div class="field fan-color-field">
                    <span>Fan color</span>
                    <div class="fan-color-options" role="group" aria-label="Fan color">
                      {#each fanColors as color}
                        <button
                          class:active-color={settings.fanColor === color}
                          type="button"
                          aria-label={fanColorLabels[color]}
                          aria-pressed={settings.fanColor === color}
                          title={fanColorLabels[color]}
                          onclick={() => updateFanColor(color)}
                        >
                          <span style:--swatch-color={swatchColor(fanAppearanceForColor(color).frameColor)}></span>
                        </button>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          {/if}

          {#if !isStaticReferenceControlsActive}
            <section class="control-section geometry-section" data-generated-geometry-controls>
              <div class="section-heading">
                <p class="eyebrow">Geometry</p>
                <h2>Material and fit</h2>
              </div>
              {#each visibleGeometryControls as control}
                <label class="field">
                  <span>{control.label}</span>
                  <span class="input-shell">
                    <input
                      type="number"
                      name={control.name}
                      step={control.step}
                      inputmode="decimal"
                      value={settings[control.name]}
                      onchange={(event) => updateNumberSetting(control.name, event)}
                    />
                    <small>{control.suffix}</small>
                  </span>
                </label>
              {/each}
              {#if isNukitControlsActive}
                <div data-nukit-panel-fit-controls>
                  {#each nukitPanelFitControls as control}
                    <label class="field">
                      <span>{control.label}</span>
                      <span class="input-shell">
                        <input
                          type="number"
                          name={control.name}
                          step={control.step}
                          inputmode="decimal"
                          value={settings[control.name]}
                          onchange={(event) => updateNumberSetting(control.name, event)}
                        />
                        <small>{control.suffix}</small>
                      </span>
                    </label>
                  {/each}
                </div>
              {/if}
              {#if isTempestControlsActive}
                <div data-tempest-fit-controls>
                  {#each tempestFitControls as control}
                    <label class="field">
                      <span>
                        {control.label}
                        {#if control.info !== undefined}
                          <span class="info-tip" class:is-open={openInfoTipId === `info-${control.name}`}>
                            <button
                              type="button"
                              aria-label="What does {control.label} do?"
                              aria-describedby="info-{control.name}"
                              aria-expanded={openInfoTipId === `info-${control.name}`}
                              onclick={() => toggleInfoTip(`info-${control.name}`)}
                              onblur={() => closeInfoTip(`info-${control.name}`)}
                              onkeydown={(event) => handleInfoTipKeydown(`info-${control.name}`, event)}
                            >i</button>
                            <p id="info-{control.name}" role="tooltip">{control.info}</p>
                          </span>
                        {/if}
                      </span>
                      <span class="input-shell">
                        <input
                          type="number"
                          name={control.name}
                          min="0"
                          max="5"
                          step={control.step}
                          inputmode="decimal"
                          value={settings[control.name]}
                          onchange={(event) => updateNumberSetting(control.name, event)}
                        />
                        <small>{control.suffix}</small>
                      </span>
                    </label>
                  {/each}
                  <label class="field">
                    <span>
                      Power cord wall
                      <span class="info-tip" class:is-open={openInfoTipId === "info-cordHoleDiameter"}>
                        <button
                          type="button"
                          aria-label="What does the power cord pass-through do?"
                          aria-describedby="info-cordHoleDiameter"
                          aria-expanded={openInfoTipId === "info-cordHoleDiameter"}
                          onclick={() => toggleInfoTip("info-cordHoleDiameter")}
                          onblur={() => closeInfoTip("info-cordHoleDiameter")}
                          onkeydown={(event) => handleInfoTipKeydown("info-cordHoleDiameter", event)}
                        >i</button>
                        <p id="info-cordHoleDiameter" role="tooltip">{cordHoleInfo}</p>
                      </span>
                    </span>
                    <select name="cordHoleWall" onchange={updateCordHoleWall}>
                      {#each cordHoleWalls as wall}
                        <option value={wall} selected={settings.cordHoleWall === wall}>{wall === "none" ? "None" : titleCase(wall)}</option>
                      {/each}
                    </select>
                  </label>
                  {#if settings.cordHoleWall !== "none"}
                    <label class="field">
                      <span>Cord hole diameter</span>
                      <span class="input-shell">
                        <input
                          type="number"
                          name="cordHoleDiameter"
                          min="3"
                          max="25"
                          step="0.5"
                          inputmode="decimal"
                          value={settings.cordHoleDiameter}
                          onchange={(event) => updateNumberSetting("cordHoleDiameter", event)}
                        />
                        <small>mm</small>
                      </span>
                    </label>
                    <label class="field">
                      <span>Cord position</span>
                      <select name="cordHoleSide" onchange={updateCordHoleSide}>
                        {#each cordHoleSides as side}
                          <option value={side} selected={settings.cordHoleSide === side}>{titleCase(side)}</option>
                        {/each}
                      </select>
                    </label>
                    <label class="field">
                      <span>Cord corner offset</span>
                      <span class="input-shell">
                        <input
                          type="number"
                          name="cordHoleCornerOffset"
                          min="0"
                          step="1"
                          inputmode="numeric"
                          value={settings.cordHoleCornerOffset}
                          onchange={(event) => updateNumberSetting("cordHoleCornerOffset", event)}
                        />
                        <small>mm</small>
                      </span>
                    </label>
                  {/if}
                  {#if showHexGrillControls}
                    <label class="toggle-field">
                      <input
                        type="checkbox"
                        name="hexGrill"
                        checked={settings.hexGrill}
                        onchange={(event) => updateBooleanSetting("hexGrill", event)}
                      />
                      <span>Honeycomb grill</span>
                    </label>
                    {#if settings.hexGrill}
                      {#each tempestHexGrillControls as control}
                        <label class="field">
                          <span>{control.label}</span>
                          <span class="input-shell">
                            <input
                              type="number"
                              name={control.name}
                              min="0"
                              step={control.step}
                              inputmode="decimal"
                              value={settings[control.name]}
                              onchange={(event) => updateNumberSetting(control.name, event)}
                            />
                            <small>{control.suffix}</small>
                          </span>
                        </label>
                      {/each}
                    {/if}
                  {/if}
                </div>
              {/if}
            </section>
          {/if}

          {#if fabricationMethod === "laser-svg"}
            <section class="control-section laser-output-section" data-laser-output-controls>
              <div class="section-heading">
                <p class="eyebrow">Laser setup</p>
                <h2>Drawing output</h2>
              </div>
              <label class="toggle-field">
                <input
                  type="checkbox"
                  name="labels"
                  checked={settings.labels}
                  onchange={(event) => updateBooleanSetting("labels", event)}
                />
                <span>Engrave part labels</span>
              </label>
              <label class="field">
                <span>Reference scale</span>
                <span class="input-shell">
                  <input
                    type="number"
                    name="referenceScale"
                    step="1"
                    inputmode="decimal"
                    value={settings.referenceScale}
                    onchange={(event) => updateNumberSetting("referenceScale", event)}
                  />
                  <small>mm</small>
                </span>
              </label>
            </section>
          {/if}

          {#if showAdvancedControls}
            <section class="control-section joint-tuning-section" data-generated-advanced-controls>
              <div class="section-heading">
                <p class="eyebrow">Advanced</p>
                <h2>Joint tuning</h2>
              </div>
              <div class="advanced-field-grid">
                {#each advancedJointControls as control}
                  <label class="field">
                    <span>{control.label}</span>
                    <span class="input-shell">
                      <input
                        type="number"
                        name={control.name}
                        step={control.step}
                        inputmode="decimal"
                        value={settings[control.name]}
                        onchange={(event) => updateNumberSetting(control.name, event)}
                      />
                      <small>{control.suffix}</small>
                    </span>
                  </label>
                {/each}
              </div>
            </section>
          {/if}

          <section class="control-section parts-list-section">
            <div class="parts-list-card" id="partsList">
              <div class="parts-list-heading">
                <strong>What you need</strong>
                <span>{fabricationMethod === "print-3mf" ? "Print and assemble" : "Cut and build"}</span>
              </div>
              <ul>
                {#each partsItems as item}
                  <li class="parts-list-row">
                    <div>
                      <small>{item.category}</small>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                    {#if item.url !== undefined}
                      <a href={item.url} target="_blank" rel="noreferrer">Open</a>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          </section>

        </div>

        <!-- #######################################
        Guides
        ####################################### -->

        <section class="guides-card" aria-label="Guides">
          <strong>Guides</strong>
          <ul>
            <li>
              <a href="https://itsairborne.com/choosing-a-pc-fan-for-an-air-purifier-the-only-fans-guide-feaf497af20c" target="_blank" rel="noreferrer">
                Choosing a PC fan for an air purifier
              </a>
            </li>
            <li>
              <a href="https://itsairborne.com/untangling-the-electronics-in-a-pc-fan-air-purifier-33f36b5834e1" target="_blank" rel="noreferrer">
                Untangling the electronics in a PC fan air purifier
              </a>
            </li>
            <li>
              <a href="https://itsairborne.com/building-a-pc-fan-corsi-rosenthal-box-68e7cd1ca570" target="_blank" rel="noreferrer">
                Building a PC-fan box purifier
              </a>
            </li>
            <li>
              <a href="https://itsairborne.com/pc-fan-corsi-rosenthal-guide-a611dabf7e0c" target="_blank" rel="noreferrer">
                PC-fan purifier guide
              </a>
            </li>
          </ul>
        </section>
      </aside>
    </section>
  </section>

  <!-- #######################################
  Sheet Dialog
  ####################################### -->

  <dialog
    class="sheet-dialog"
    id="sheetDialog"
    aria-labelledby="sheetDialogTitle"
    bind:this={sheetDialog}
    onclose={handleDialogClose}
    onclick={closeDialogOnBackdrop}
  >
    <div class="sheet-dialog-surface">
      <header class="sheet-dialog-bar">
        <div>
          <p class="eyebrow" id="sheetDialogEyebrow">{previewMode === "print-sheets" ? "3D printing" : "Laser cutting"}</p>
          <h2 id="sheetDialogTitle">{previewMode === "print-sheets" ? "Print plates" : "Laser drawing"}</h2>
        </div>
        <button class="ghost-button" type="button" onclick={closeSheetDialog}>Close</button>
      </header>
      <div class="sheet-dialog-preview" id="sheetDialogPreview">
        {#if isSheetDialogOpen}
          {#if previewMode === "print-sheets" && activePrintSheetPlan !== null}
            <PrintSheetPreview
              plan={activePrintSheetPlan}
              label="3D print plate dialog preview"
              className="print-sheet-dialog-host"
            />
          {:else}
            {@html createLaserSvg(layout)}
          {/if}
        {/if}
      </div>
    </div>
  </dialog>

  <!-- #######################################
  Mobile Actions
  ####################################### -->

  <nav class="mobile-action-bar" aria-label="Export actions">
    <button class="ghost-button" type="button" onclick={() => void copyUrl("copy-mobile")}>
      {copyMobileButtonText}
    </button>
    <button class="primary-button" type="button" data-export-primary onclick={() => exportDrawing("export-mobile")}>
      {exportMobileButtonText}
    </button>
  </nav>
</main>
