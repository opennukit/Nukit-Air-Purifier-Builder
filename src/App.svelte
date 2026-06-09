<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import {
    normalizePurifierDraft,
    printDesignIdForPurifierDraft,
    serializePurifierDraft,
  } from "@/domain/purifier/airPurifier";
  import {
    decodePurifierDraftSettings,
    encodeSettings,
    formatMillimeters,
  } from "@/domain/purifier/settingsCodec";
  import {
    applyDonutFilterPreset,
    applyFanProductPreset,
    applyFilterPreset,
    applyTempestArrangementDefaults,
    previewMaterialColorPresets,
    type PreviewMaterialColorId,
    type PreviewMaterialColorPreset,
    type PurifierDraft,
    type RawPurifierSettings,
  } from "@/domain/purifier/settingsModel";
  import {
    customDonutFilterPresetId,
    defaultThreeDimensionalPrintDesignId,
    donutFilterPresets,
    isPublicThreeDimensionalPrintDesignId,
    isStaticReferencePrintDesignId,
    isTempestPrintDesignId,
    type PrintDesignId,
    type TempestArrangementPreset,
  } from "@/domain/purifier/designPresets";
  import {
    automaticFanCount,
    customFanProductPresetId,
    findFanProductPreset,
    fixedFanCountOptions,
    type PresetFanProduct,
  } from "@/domain/purifier/fanProducts";
  import { customFilterPresetId, filterPresets } from "@/domain/purifier/filter";
  import {
    advancedJointControls,
    donutFilterDimensionControls,
    fanPlacementControls,
    filterDimensionControls,
    generatedGeometryControls,
    nukitPanelFitControls,
    parametricPrintDesignPresets,
    staticPrintDesignPresets,
    tempestArrangementOptions,
    type BooleanSettingName,
    type DonutNumberSettingName,
    type FanCountSettingName,
    type FilterDimensionName,
    type NumericSettingName,
  } from "@/app/controls/controlMetadata";
  import {
    defaultFanProductPresetForRecommendedDiameter,
    defaultRecommendedFanDiameter,
    fanDiameterSelectionForSettings,
    fanProductOptionsForSelection,
    isRecommendedFanProductPreset,
    recommendedFanDiameterOptions,
    type FanDiameterSelection,
    type RecommendedFanDiameter,
  } from "@/app/controls/fanSelection";
  import {
    readCheckboxInput,
    readDonutFilterPresetControlValue,
    readFanCountControlValue,
    readFanProductPresetControlValue,
    readFilterPresetControlValue,
    readNumberInput,
    readPrintDesignControlValue,
    requireSelect,
  } from "@/app/controls/inputReaders";
  import {
    createActiveAssemblyPrintSeamPlan,
    createActivePrintSheetPlan,
    createGeneratedPrintSheetPlanFromLayout,
    generatedPrintSheetPlanCacheKey,
    requireGeneratedPrintSheetPlan,
    type GeneratedPrintSheetPlanCacheEntry,
  } from "@/app/printSheetPlans";
  import { evaluateActiveExportDiagnostics, summarizeActiveBuildReadiness } from "@/app/diagnostics";
  import { staticReferenceFilesUrl } from "@/app/externalLinks";
  import {
    createPreviewSummaryItems,
    createPurchaseListItems,
    type PurchaseListItem,
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
    withControlsTab,
    withFabricationMethod,
    withPreviewMode,
    withPrintVolumePreset,
    type ControlsTab,
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
  import { summarizeBuildReadiness, type BuildDiagnostic } from "@/fabrication/buildDiagnostics";
  import { createLaserSvg, createLayout, type LayoutResult } from "@/fabrication/purifierLayout";
  import {
    exportFormats as fabricationMethods,
    findPrintVolumePreset,
    printVolumePresets,
    type ExportFormat,
    type PrintableSheetPlan,
    type PrintVolumePresetId,
  } from "@/fabrication/printing/printableKit";
  import { createPrintDesignThreeMfExportFromKit } from "@/fabrication/printing/printDesignKit";
  import type { PrintSheetThreePreviewPlan } from "@/rendering/three/printSheetThreePreview";
  import PurifierPreview from "@/app/svelte/PurifierPreview.svelte";
  import PrintSheetPreview from "@/app/svelte/PrintSheetPreview.svelte";

  // #######################################
  // State Model
  // #######################################

  type FabricationMethod = ExportFormat;
  type TransientButtonKey = "copy-top" | "copy-mobile" | "export-main" | "export-mobile";
  type TransientButtonLabels = Partial<Record<TransientButtonKey, string>>;
  // #######################################
  // Control Metadata
  // #######################################

  const initialUrlParams = new URLSearchParams(window.location.search);

  // #######################################
  // Svelte State
  // #######################################

  // ##############################
  // Initial Session
  // ##############################

  const initialSession = normalizeWorkbenchSession(
    decodePurifierDraftSettings(window.location.search),
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
  let generatedPrintSheetPlanCache: GeneratedPrintSheetPlanCacheEntry | null = null;

  // ##############################
  // Derived View State
  // ##############################

  let previewMode: PreviewMode = workbenchView.previewMode;
  let controlsTab: ControlsTab = workbenchView.controlsTab;
  let fabricationMethod: FabricationMethod = workbenchView.fabricationMethod;
  let printVolumePresetId: PrintVolumePresetId = workbenchView.printVolumePresetId;
  let layout: LayoutResult = createLayout(draft);
  let exportDiagnostics: readonly BuildDiagnostic[] = [];
  let exportReadiness: BuildDiagnostic = summarizeBuildReadiness(layout);
  let previewSummaryItems: readonly SummaryItem[] = [];
  let purchaseItems: readonly PurchaseListItem[] = [];
  let generatedPrintSheetPlan: PrintableSheetPlan | null = null;
  let activePrintSheetPlan: PrintSheetThreePreviewPlan | null = null;
  let activePrintSeamPlan: PrintableSheetPlan | null = null;
  let activePrintDesignPreset = workbenchView.printDesignPreset;
  let activeDesignContext: WorkbenchDesignContext = workbenchView.design;
  let activeFabricationPreview: WorkbenchFabricationPreview = workbenchView.fabricationPreview;
  let activeControlPanels: WorkbenchControlPanels = workbenchView.controlPanels;
  let activeStaticPrintReference = activeDesignContext.type === "static-reference" ? activeDesignContext.reference : undefined;
  let selectedFanProductPreset = findFanProductPreset(settings.fanPreset);
  let selectedFanDiameterSelection: FanDiameterSelection = defaultRecommendedFanDiameter;
  let selectedFanProductOptions: readonly PresetFanProduct[] = [];
  let isStaticReferenceControlsActive = false;
  let activeStaticReferenceCanPreviewPlate = false;
  let showCutSheetPreviewMode = false;
  let showPrintSheetsPreviewMode = true;
  let isDonutControlsActive = false;
  let isTempestControlsActive = false;
  let isNukitControlsActive = true;
  let showSetupControlTab = true;
  let showAdvancedControlTab = true;
  let layoutSectionTitleText = "Fan placement";
  let partsSectionTitleText = "Filter and fan";
  let setupTabText = "Print setup";
  let exportActionText = "Download 3MF";
  let copyTopButtonText = "Copy URL";
  let copyMobileButtonText = "Copy URL";
  let exportMainButtonText = "Download 3MF";
  let exportMobileButtonText = "Download 3MF";

  // ##############################
  // Reactive Derivations
  // ##############################

  $: settings = serializePurifierDraft(draft);
  $: workbenchView = createWorkbenchViewModel(draft, workbenchState);
  $: previewMode = workbenchView.previewMode;
  $: controlsTab = workbenchView.controlsTab;
  $: fabricationMethod = workbenchView.fabricationMethod;
  $: printVolumePresetId = workbenchView.printVolumePresetId;
  $: layout = createLayout(draft);
  $: generatedPrintSheetPlan = createCurrentGeneratedPrintSheetPlan(layout, fabricationMethod, printVolumePresetId);
  $: exportDiagnostics = evaluateActiveExportDiagnostics(layout, fabricationMethod, generatedPrintSheetPlan);
  $: exportReadiness = summarizeActiveBuildReadiness(layout, exportDiagnostics, fabricationMethod);
  $: previewSummaryItems = createPreviewSummaryItems(layout, previewMode, fabricationMethod, printVolumePresetId, generatedPrintSheetPlan);
  $: purchaseItems = createPurchaseListItems(layout, fabricationMethod, settings);
  $: activePrintSheetPlan = previewMode === "print-sheets" ? createActivePrintSheetPlan(layout, printVolumePresetId, generatedPrintSheetPlan) : null;
  $: activePrintSeamPlan = createActiveAssemblyPrintSeamPlan(layout, previewMode, fabricationMethod, settings, generatedPrintSheetPlan);
  $: activePrintDesignPreset = workbenchView.printDesignPreset;
  $: activeDesignContext = workbenchView.design;
  $: activeFabricationPreview = workbenchView.fabricationPreview;
  $: activeControlPanels = workbenchView.controlPanels;
  $: activeStaticPrintReference = activeDesignContext.type === "static-reference" ? activeDesignContext.reference : undefined;
  $: selectedFanProductPreset = findFanProductPreset(settings.fanPreset);
  $: selectedFanDiameterSelection = fanDiameterSelectionForSettings(settings);
  $: selectedFanProductOptions = fanProductOptionsForSelection(selectedFanDiameterSelection);
  $: isStaticReferenceControlsActive = activeDesignContext.type === "static-reference";
  $: activeStaticReferenceCanPreviewPlate =
    activeDesignContext.type === "static-reference" && activeDesignContext.platePreview.type === "available";
  $: showCutSheetPreviewMode = activeFabricationPreview.type === "cut-sheet";
  $: showPrintSheetsPreviewMode = activeFabricationPreview.type === "print-sheets";
  $: isDonutControlsActive = activeDesignContext.type === "donut-filter-adapter";
  $: isTempestControlsActive = activeDesignContext.type === "tempest";
  $: isNukitControlsActive = activeDesignContext.type === "nukit";
  $: showSetupControlTab = activeControlPanels.setup.type === "available";
  $: showAdvancedControlTab = activeControlPanels.advanced.type === "available";
  $: layoutSectionTitleText = activeDesignContext.layoutSectionTitle;
  $: partsSectionTitleText = activeDesignContext.partsSectionTitle;
  $: setupTabText = workbenchView.setupTabLabel;
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
    controlsTab = workbenchView.controlsTab;
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

  function applyPrintDesignSelection(printDesign: PrintDesignId): void {
    const switched = switchPrintDesignSettings(printDesignSettingsMemory, draft, publicThreeDimensionalPrintDesignId(printDesign));
    const nextDraft = normalizePurifierDraft(switched.settings);
    draft = nextDraft;
    settings = serializePurifierDraft(nextDraft);
    printDesignSettingsMemory = switched.memory;
    workbenchState = normalizeWorkbenchStateForSettings(workbenchState, nextDraft);
    syncDerivedWorkbenchState();
    syncUrl();
  }

  // ##############################
  // Form Control Updates
  // ##############################

  function updateFilterPreset(event: Event): void {
    commitSettings(applyFilterPreset(settings, readFilterPresetControlValue(event)));
  }

  function updateDonutFilterPreset(event: Event): void {
    commitSettings(applyDonutFilterPreset(settings, readDonutFilterPresetControlValue(event)));
  }

  function updateFanPreset(event: Event): void {
    commitSettings(applyFanProductPreset(settings, readFanProductPresetControlValue(event)));
  }

  function updateRecommendedFanDiameter(diameter: RecommendedFanDiameter): void {
    if (isRecommendedFanProductPreset(selectedFanProductPreset) && selectedFanProductPreset.diameter === diameter) {
      commitSettings({
        ...settings,
        fanDiameter: diameter,
      });
      return;
    }

    commitSettings(applyFanProductPreset(settings, defaultFanProductPresetForRecommendedDiameter(diameter).id));
  }

  function updatePrintDesign(event: Event): void {
    applyPrintDesignSelection(readPrintDesignControlValue(event));
  }

  function updateTempestArrangement(arrangement: TempestArrangementPreset): void {
    commitSettings(applyTempestArrangementDefaults(settings, arrangement));
  }

  function updateFilterDimension(name: FilterDimensionName, event: Event): void {
    commitSettings({
      ...settings,
      [name]: readNumberInput(event, settings[name]),
      filterPreset: customFilterPresetId,
    });
  }

  function updateDonutNumberSetting(
    name: DonutNumberSettingName,
    event: Event,
  ): void {
    commitSettings({
      ...settings,
      [name]: readNumberInput(event, settings[name]),
      donutFilterPreset: customDonutFilterPresetId,
    });
  }

  function updateNumberSetting(name: NumericSettingName, event: Event): void {
    const nextSettings: RawPurifierSettings = {
      ...settings,
      [name]: readNumberInput(event, settings[name]),
    };
    commitSettings(nextSettings);
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
  // Workbench Navigation
  // ##############################

  function setPreviewMode(nextMode: PreviewMode): void {
    setWorkbenchState(withPreviewMode(workbenchState, nextMode));
  }

  function setControlsTab(tab: ControlsTab): void {
    setWorkbenchState(withControlsTab(workbenchState, tab));
  }

  function setPrintVolume(event: Event): void {
    setWorkbenchState(withPrintVolumePreset(workbenchState, findPrintVolumePreset(requireSelect(event, "setPrintVolume").value).id));
  }

  // #######################################
  // Control Input Readers
  // #######################################

  // #######################################
  // View Availability
  // #######################################

  function publicThreeDimensionalPrintDesignId(printDesign: PrintDesignId): PrintDesignId {
    return isPublicThreeDimensionalPrintDesignId(printDesign) ? printDesign : defaultThreeDimensionalPrintDesignId;
  }

  function swatchColor(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  // #######################################
  // Export and Dialog Actions
  // #######################################

  function exportDrawing(buttonKey: TransientButtonKey): void {
    if (exportDiagnostics.length > 0) {
      flashDownloadButtons("Review checks");
      return;
    }

    if (fabricationMethod === "print-3mf") {
      showTransientButtonLabel(buttonKey, exportPrintKit(layout, generatedPrintSheetPlan), 1400);
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
  ): string {
    if (isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      window.open(staticReferenceFilesUrl(currentLayout), "_blank", "noopener,noreferrer");
      return "Opened source files";
    }
    const printExport = createPrintDesignThreeMfExportFromKit(
      currentLayout,
      requireGeneratedPrintSheetPlan(currentGeneratedPlan, "exportPrintKit").kit,
    );
    const blob = new Blob([toArrayBuffer(printExport.bytes)], { type: printExport.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = printExport.filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "Downloaded 3MF";
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

  function createCurrentGeneratedPrintSheetPlan(
    currentLayout: LayoutResult,
    currentFabricationMethod: FabricationMethod,
    currentPrintVolumePresetId: PrintVolumePresetId,
  ): PrintableSheetPlan | null {
    if (currentFabricationMethod !== "print-3mf" || isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      return null;
    }
    const cacheKey = generatedPrintSheetPlanCacheKey(currentLayout.rawSettings, currentPrintVolumePresetId);
    if (generatedPrintSheetPlanCache?.key === cacheKey) {
      return generatedPrintSheetPlanCache.plan;
    }
    const plan = createGeneratedPrintSheetPlanFromLayout(currentLayout, currentPrintVolumePresetId);
    generatedPrintSheetPlanCache = { key: cacheKey, plan };
    return plan;
  }

  // #######################################
  // Labels and Formatting
  // #######################################

  function fabricationMethodLabel(method: FabricationMethod): string {
    return method === "print-3mf" ? "3D print" : "Laser cut";
  }

  function filterPresetOptionLabel(preset: (typeof filterPresets)[number]): string {
    if (preset.id === customFilterPresetId) {
      return `${preset.label} - enter exact dimensions`;
    }
    return `${preset.label} - ${formatFilterDimensions(preset.dimensions)}`;
  }

  function formatFilterDimensions(dimensions: (typeof filterPresets)[number]["dimensions"]): string {
    return `${formatMillimeters(dimensions.width)} x ${formatMillimeters(dimensions.depth)} x ${formatMillimeters(dimensions.thickness)}`;
  }

  function previewMaterialColorLabel(color: PreviewMaterialColorPreset): string {
    return `${color.label} preview color`;
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
                  <span class="preview-control-label">Dims</span>
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
                  <span class="preview-control-label">Scale</span>
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
                {#if fabricationMethod === "print-3mf" && !isTempestPrintDesignId(settings.printDesign) && !isStaticReferenceControlsActive}
                  <label class="toggle-field preview-toggle-field preview-control-technical" title="Print split lines">
                    <input
                      type="checkbox"
                      name="showPrintSeams"
                      checked={settings.showPrintSeams}
                      onchange={(event) => updateBooleanSetting("showPrintSeams", event)}
                    />
                    <span class="preview-control-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M5 6h14M5 12h14M5 18h14" />
                        <path d="M9 4v16M15 4v16" />
                      </svg>
                    </span>
                    <span class="preview-control-label">Splits</span>
                  </label>
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
            <PurifierPreview {layout} printSeamPlan={activePrintSeamPlan} />
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
        </section>

        <div class="controls-tabs" role="tablist" aria-label="Builder steps">
          <button
            class:is-active={controlsTab === "design"}
            class="controls-tab"
            id="design-controls-tab"
            type="button"
            role="tab"
            aria-selected={controlsTab === "design"}
            aria-controls="design-controls-panel"
            onclick={() => setControlsTab("design")}
          >
            Design
          </button>
          {#if showSetupControlTab}
            <button
              class:is-active={controlsTab === "setup"}
              class="controls-tab"
              id="setup-controls-tab"
              type="button"
              role="tab"
              aria-selected={controlsTab === "setup"}
              aria-controls="setup-controls-panel"
              onclick={() => setControlsTab("setup")}
            >
              {setupTabText}
            </button>
          {/if}
          {#if showAdvancedControlTab}
            <button
              class:is-active={controlsTab === "advanced"}
              class="controls-tab"
              id="advanced-controls-tab"
              type="button"
              role="tab"
              aria-selected={controlsTab === "advanced"}
              aria-controls="advanced-controls-panel"
              onclick={() => setControlsTab("advanced")}
            >
              Advanced
            </button>
          {/if}
        </div>

        {#if controlsTab === "design"}
          <div class="tab-panel design-controls" id="design-controls-panel" role="tabpanel" aria-labelledby="design-controls-tab">
            {#if fabricationMethod === "print-3mf"}
              <section class="control-section design-model-section" data-print-design-control>
                <div class="section-heading">
                  <p class="eyebrow">Design</p>
                  <h2>Printable model</h2>
                </div>
                <label class="field print-design-select">
                  <span>Printable design</span>
                  <select name="printDesign" onchange={updatePrintDesign}>
                    {#if parametricPrintDesignPresets.length > 0}
                      <optgroup label="Parametric generators">
                        {#each parametricPrintDesignPresets as preset}
                          <option value={preset.id} selected={settings.printDesign === preset.id}>{preset.label}</option>
                        {/each}
                      </optgroup>
                    {/if}
                    {#if staticPrintDesignPresets.length > 0}
                      <optgroup label="Curated static references">
                        {#each staticPrintDesignPresets as preset}
                          <option value={preset.id} selected={settings.printDesign === preset.id}>{preset.label}</option>
                        {/each}
                      </optgroup>
                    {/if}
                  </select>
                </label>
                <div class="print-design-card" id="printDesignDetail">
                  <strong>{activePrintDesignPreset.detail}</strong>
                  {#if activeStaticPrintReference !== undefined}
                    <span>{activeStaticPrintReference.fileSummary} · {activeStaticPrintReference.attribution}</span>
                    <small>{activeStaticPrintReference.usePolicy.note}</small>
                  {/if}
                  <small>
                    {activePrintDesignPreset.source}
                    {#if activePrintDesignPreset.sourceUrl !== undefined}
                      <a href={activePrintDesignPreset.sourceUrl} target="_blank" rel="noreferrer">Source</a>
                    {/if}
                  </small>
                </div>
              </section>
            {/if}

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

            {#if !isStaticReferenceControlsActive}
              <section class="control-section parts-section">
                <div class="section-heading">
                  <p class="eyebrow">Parts</p>
                  <h2 id="partsSectionTitle">{partsSectionTitleText}</h2>
                </div>
                <div data-generated-part-controls>
                  {#if !isDonutControlsActive}
                    <div data-rectangular-filter-controls>
                      <div class="field-with-info">
                        <label class="field">
                          <span>Filter</span>
                          <select name="filterPreset" onchange={updateFilterPreset}>
                            {#each filterPresets as preset}
                              <option value={preset.id} selected={settings.filterPreset === preset.id}>{filterPresetOptionLabel(preset)}</option>
                            {/each}
                          </select>
                        </label>
                      </div>
                      {#if settings.filterPreset === customFilterPresetId}
                      <div class="custom-dimensions" data-custom-filter-dimensions>
                          {#each filterDimensionControls as control}
                            <label class="field">
                              <span>{control.label}</span>
                              <span class="input-shell">
                                <input
                                  type="number"
                                  name={control.name}
                                  step={control.step}
                                  inputmode="decimal"
                                  value={settings[control.name]}
                                  onchange={(event) => updateFilterDimension(control.name, event)}
                                />
                                <small>{control.suffix}</small>
                              </span>
                            </label>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}

                  {#if isDonutControlsActive}
                    <div class="donut-filter-controls" data-donut-filter-controls>
                      <div class="field-with-info">
                        <label class="field">
                          <span>Round filter</span>
                          <select name="donutFilterPreset" onchange={updateDonutFilterPreset}>
                            {#each donutFilterPresets as preset}
                              <option value={preset.id} selected={settings.donutFilterPreset === preset.id}>{preset.label}</option>
                            {/each}
                          </select>
                        </label>
                      </div>
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
                                onchange={(event) => updateDonutNumberSetting(control.name, event)}
                              />
                              <small>{control.suffix}</small>
                            </span>
                          </label>
                        {/each}
                      </div>
                    </div>
                  {/if}

                  <div class="fan-selection">
                    <fieldset class="segmented-field">
                      <legend>Fan size</legend>
                      <div>
                        {#each recommendedFanDiameterOptions as diameter}
                          <label>
                            <input
                              type="radio"
                              name="recommendedFanDiameter"
                              value={diameter}
                              checked={selectedFanDiameterSelection === diameter}
                              onchange={() => updateRecommendedFanDiameter(diameter)}
                            />
                            <span>{diameter} mm</span>
                          </label>
                        {/each}
                      </div>
                    </fieldset>

                    <div class="field-with-info">
                      <label class="field">
                        <span>Fan model</span>
                        <select name="fanPreset" onchange={updateFanPreset}>
                          {#each selectedFanProductOptions as preset}
                            <option value={preset.id} selected={settings.fanPreset === preset.id}>{preset.label}</option>
                          {/each}
                          <option value={customFanProductPresetId} selected={settings.fanPreset === customFanProductPresetId}>Custom fan</option>
                        </select>
                      </label>
                      {#if settings.fanPreset === customFanProductPresetId}
                        <label class="field">
                          <span>Fan diameter</span>
                          <span class="input-shell">
                            <input
                              type="number"
                              name="fanDiameter"
                              min="40"
                              max="140"
                              step="1"
                              inputmode="decimal"
                              value={settings.fanDiameter}
                              onchange={(event) => updateNumberSetting("fanDiameter", event)}
                            />
                            <small>mm</small>
                          </span>
                        </label>
                      {/if}
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
                {#each generatedGeometryControls as control}
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
              </section>
            {/if}

            <section class="control-section purchase-section">
              <div class="purchase-list-card" id="purchaseList">
                <div class="purchase-list-heading">
                  <strong>Purchase list</strong>
                  <span>{fabricationMethod === "print-3mf" ? "Buy parts" : "Cut and build"}</span>
                </div>
                <ul>
                  {#each purchaseItems as item}
                    <li class="purchase-list-row">
                      <div>
                        <small>{item.category}</small>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </div>
                      {#if item.url !== undefined}
                        <a href={item.url} target="_blank" rel="noreferrer">Find</a>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            </section>
          </div>
        {:else if controlsTab === "setup"}
          <div class="tab-panel setup-controls" id="setup-controls-panel" role="tabpanel" aria-labelledby="setup-controls-tab">
            {#if fabricationMethod === "print-3mf" && (!isStaticReferenceControlsActive || activeStaticReferenceCanPreviewPlate)}
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
                {#if isNukitControlsActive}
                  <div data-nukit-print-split-control>
                    <label class="toggle-field">
                      <input
                        type="checkbox"
                        name="splitFrames"
                        checked={settings.splitFrames}
                        onchange={(event) => updateBooleanSetting("splitFrames", event)}
                      />
                      <span>Split large frame panels</span>
                    </label>
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
          </div>
        {:else if controlsTab === "advanced" && isNukitControlsActive}
          <div class="tab-panel advanced-controls" id="advanced-controls-panel" role="tabpanel" aria-labelledby="advanced-controls-tab">
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
          </div>
        {/if}
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
