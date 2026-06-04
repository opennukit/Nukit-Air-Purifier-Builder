<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import {
    applyDonutFilterPreset,
    applyFanProductPreset,
    applyFilterPreset,
    applyTempestArrangementDefaults,
    automaticFanCount,
    corsiFanCountFits,
    corsiRosenthalFanCountOptions,
    corsiRosenthalFilterCountRange,
    corsiRosenthalModes,
    customDonutFilterPresetId,
    customFanProductPresetId,
    decodePurifierDraftSettings,
    defaultCorsiRosenthalFilterCount,
    defaultSettings,
    defaultThreeDimensionalPrintDesignId,
    donutFilterPresets,
    encodeSettings,
    fanProductPresets,
    findDonutFilterPreset,
    findFanProductPreset,
    fixedFanCountOptions,
    formatMillimeters,
    isCorsiRosenthalPrintDesignId,
    isDonutFilterPrintDesignId,
    isPublicThreeDimensionalPrintDesignId,
    isStaticReferencePrintDesignId,
    isTempestPrintDesignId,
    normalizePurifierDraft,
    printDesignIdForPurifierDraft,
    previewMaterialColorPresets,
    publicThreeDimensionalPrintDesignPresets,
    resolveCorsiRosenthalFanCount,
    resolveCorsiRosenthalLayout,
    serializePurifierDraft,
    staticReferenceDefaultsForPreset,
    staticPrintReferenceForPreset,
    type CorsiRosenthalMode,
    type DonutFilterPresetId,
    type FanDiameter,
    type FanProductPresetId,
    type PresetFanProduct,
    type PreviewMaterialColorId,
    type PreviewMaterialColorPreset,
    type PrintDesignId,
    type PurifierDraft,
    type RawPurifierSettings,
    type TempestArrangementPreset,
  } from "@/domain/purifier/airPurifier";
  import {
    customFilterPresetId,
    filterPresets,
    filterSelectionDimensions,
    findFilterPreset,
    type FilterPresetId,
  } from "@/domain/purifier/filter";
  import { createDonutFilterModel } from "@/domain/designs/donut-filter/model";
  import { createTempestModel } from "@/domain/designs/tempest/model";
  import {
    corsiFaceSides,
    createCorsiRosenthalModel,
    type CorsiFaceRoleAssignment,
    type CorsiFaceSide,
  } from "@/domain/designs/corsi-rosenthal/model";
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
  import { evaluateBuildDiagnostics, summarizeBuildReadiness, type BuildDiagnostic } from "@/fabrication/buildDiagnostics";
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
  import { createPrintDesignKit, createPrintDesignThreeMfExportFromKit } from "@/fabrication/printing/printDesignKit";
  import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";
  import type { StaticPrintEstimate } from "@/resources/static-print-references/references";
  import type { PrintSheetThreePreviewPlan } from "@/rendering/three/printSheetThreePreview";
  import PurifierPreview from "@/app/svelte/PurifierPreview.svelte";
  import PrintSheetPreview from "@/app/svelte/PrintSheetPreview.svelte";

  // #######################################
  // State Model
  // #######################################

  type FabricationMethod = ExportFormat;
  type NumericSettingName = {
    [Key in keyof RawPurifierSettings]: RawPurifierSettings[Key] extends number ? Key : never;
  }[keyof RawPurifierSettings];
  type BooleanSettingName = {
    [Key in keyof RawPurifierSettings]: RawPurifierSettings[Key] extends boolean ? Key : never;
  }[keyof RawPurifierSettings];
  type FanCountSettingName = "fansLeft" | "fansRight" | "fansTop" | "fansBottom" | "corsiFanCount";
  type FilterDimensionName = "filterWidth" | "filterDepth" | "filterThickness";
  type RecommendedFanDiameter = Extract<FanDiameter, 120 | 140>;
  type FanDiameterSelection = RecommendedFanDiameter | "custom";
  type RecommendedFanProductPreset = PresetFanProduct & {
    readonly diameter: RecommendedFanDiameter;
  };
  type DonutNumberSettingName =
    | "donutFilterOuterDiameter"
    | "donutFilterLength"
    | "donutFilterHoleDiameter"
    | "donutAdapterInsertLength"
    | "donutCapRim";
  type NumberControl<Name extends NumericSettingName> = {
    readonly name: Name;
    readonly label: string;
    readonly suffix: string;
    readonly step: string;
  };
  type SummaryItem = {
    readonly label: string;
    readonly value: string;
  };
  type PurchaseListItem = {
    readonly category: string;
    readonly label: string;
    readonly detail: string;
    readonly url?: string;
  };
  type TransientButtonKey = "copy-top" | "copy-mobile" | "export-main" | "export-mobile";
  type TransientButtonLabels = Partial<Record<TransientButtonKey, string>>;
  type GeneratedPrintSheetPlanCacheEntry = {
    readonly key: string;
    readonly plan: PrintableSheetPlan;
  };

  // #######################################
  // Control Metadata
  // #######################################

  const initialUrlParams = new URLSearchParams(window.location.search);
  const parametricPrintDesignPresets = publicThreeDimensionalPrintDesignPresets.filter(
    (preset) => !isStaticReferencePrintDesignId(preset.id),
  );
  const staticPrintDesignPresets = publicThreeDimensionalPrintDesignPresets.filter((preset) =>
    isStaticReferencePrintDesignId(preset.id),
  );
  const fanPlacementControls: readonly { readonly name: FanCountSettingName; readonly label: string }[] = [
    { name: "fansLeft", label: "Left" },
    { name: "fansRight", label: "Right" },
    { name: "fansTop", label: "Top" },
    { name: "fansBottom", label: "Bottom" },
  ];
  const filterDimensionControls: readonly NumberControl<FilterDimensionName>[] = [
    { name: "filterWidth", label: "Filter width", suffix: "mm", step: "1" },
    { name: "filterDepth", label: "Filter depth", suffix: "mm", step: "1" },
    { name: "filterThickness", label: "Filter thickness", suffix: "mm", step: "0.1" },
  ];
  const donutFilterDimensionControls: readonly NumberControl<DonutNumberSettingName>[] = [
    { name: "donutFilterOuterDiameter", label: "Outer diameter", suffix: "mm", step: "1" },
    { name: "donutFilterLength", label: "Length", suffix: "mm", step: "1" },
    { name: "donutFilterHoleDiameter", label: "Center hole", suffix: "mm", step: "0.1" },
  ];
  const generatedGeometryControls: readonly NumberControl<NumericSettingName>[] = [
    { name: "materialThickness", label: "Material thickness", suffix: "mm", step: "0.1" },
    { name: "screwHoleDiameter", label: "Fan screw holes", suffix: "mm", step: "0.1" },
  ];
  const nukitPanelFitControls: readonly NumberControl<NumericSettingName>[] = [
    { name: "rim", label: "Filter rim", suffix: "mm", step: "1" },
    { name: "kerfFit", label: "Fit allowance", suffix: "mm", step: "0.01" },
  ];
  const advancedJointControls: readonly NumberControl<NumericSettingName>[] = [
    { name: "fingerWidthMultiplier", label: "Finger width", suffix: "x", step: "0.1" },
    { name: "fingerSpaceMultiplier", label: "Finger space", suffix: "x", step: "0.1" },
    { name: "fingerHoleWidthMultiplier", label: "Slot width", suffix: "x", step: "0.05" },
    { name: "fingerHoleOffsetMultiplier", label: "Slot offset", suffix: "x", step: "0.05" },
    { name: "fingerPlayMultiplier", label: "Finger play", suffix: "x", step: "0.05" },
    { name: "dovetailSizeMultiplier", label: "Dovetail size", suffix: "x", step: "0.1" },
    { name: "dovetailDepthMultiplier", label: "Dovetail depth", suffix: "x", step: "0.05" },
    { name: "dovetailTaper", label: "Dovetail taper", suffix: "0-80", step: "1" },
  ];
  const tempestArrangementOptions: readonly { readonly id: TempestArrangementPreset; readonly label: string }[] = [
    { id: "single-horizontal-top-filter", label: "1 top filter" },
    { id: "dual-horizontal-sandwich", label: "2-filter sandwich" },
    { id: "four-side-filter-tower", label: "4 side filters" },
  ];
  const recommendedFanDiameterOptions: readonly RecommendedFanDiameter[] = [120, 140];
  const defaultRecommendedFanDiameter: RecommendedFanDiameter = 140;
  const recommendedFanProductPresets: readonly RecommendedFanProductPreset[] = fanProductPresets.filter(
    isRecommendedFanProductPreset,
  );

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
  let selectedDonutFilterPreset = findDonutFilterPreset(settings.donutFilterPreset);
  let selectedFanProductPreset = findFanProductPreset(settings.fanPreset);
  let selectedFanDiameterSelection: FanDiameterSelection = defaultRecommendedFanDiameter;
  let selectedFanProductOptions: readonly PresetFanProduct[] = [];
  let corsiFilterCountMax = corsiRosenthalFilterCountRange(settings.corsiMode).max;
  let allowedCorsiFanCounts: ReadonlySet<number> = new Set(corsiRosenthalFanCountOptions(settings.corsiMode));
  let isStaticReferenceControlsActive = false;
  let activeStaticReferenceCanPreviewPlate = false;
  let showCutSheetPreviewMode = false;
  let showPrintSheetsPreviewMode = true;
  let isCorsiControlsActive = false;
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
  let selectedFilterDetailText = "";
  let selectedFilterDimensionsText = "";
  let selectedDonutFilterDimensionsText = "";
  let selectedFanDetailText = "";
  let corsiFaceAssignments: readonly CorsiFaceRoleAssignment[] = [];

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
  $: previewSummaryItems = createPreviewSummaryItems(layout, previewMode, fabricationMethod, printVolumePresetId, settings, generatedPrintSheetPlan);
  $: purchaseItems = createPurchaseListItems(layout, fabricationMethod, settings);
  $: activePrintSheetPlan = previewMode === "print-sheets" ? createActivePrintSheetPlan(layout, printVolumePresetId, generatedPrintSheetPlan) : null;
  $: activePrintSeamPlan = createActiveAssemblyPrintSeamPlan(layout, previewMode, fabricationMethod, settings, generatedPrintSheetPlan);
  $: activePrintDesignPreset = workbenchView.printDesignPreset;
  $: activeDesignContext = workbenchView.design;
  $: activeFabricationPreview = workbenchView.fabricationPreview;
  $: activeControlPanels = workbenchView.controlPanels;
  $: activeStaticPrintReference = activeDesignContext.type === "static-reference" ? activeDesignContext.reference : undefined;
  $: selectedDonutFilterPreset = findDonutFilterPreset(settings.donutFilterPreset);
  $: selectedFanProductPreset = findFanProductPreset(settings.fanPreset);
  $: selectedFanDiameterSelection = fanDiameterSelectionForSettings(settings);
  $: selectedFanProductOptions = fanProductOptionsForSelection(selectedFanDiameterSelection);
  $: corsiFilterCountMax = corsiRosenthalFilterCountRange(settings.corsiMode).max;
  $: allowedCorsiFanCounts = new Set(corsiRosenthalFanCountOptions(settings.corsiMode));
  $: isStaticReferenceControlsActive = activeDesignContext.type === "static-reference";
  $: activeStaticReferenceCanPreviewPlate =
    activeDesignContext.type === "static-reference" && activeDesignContext.platePreview.type === "available";
  $: showCutSheetPreviewMode = activeFabricationPreview.type === "cut-sheet";
  $: showPrintSheetsPreviewMode = activeFabricationPreview.type === "print-sheets";
  $: isCorsiControlsActive = activeDesignContext.type === "corsi-rosenthal";
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
  $: selectedFilterDimensionsText = `${formatMillimeters(settings.filterWidth)} x ${formatMillimeters(settings.filterDepth)} x ${formatMillimeters(settings.filterThickness)}`;
  $: selectedFilterDetailText = createSelectedFilterDetail(settings, layout, fabricationMethod);
  $: selectedDonutFilterDimensionsText = `${formatMillimeters(settings.donutFilterOuterDiameter)} dia x ${formatMillimeters(settings.donutFilterLength)} · ${formatMillimeters(settings.donutFilterHoleDiameter)} hole`;
  $: selectedFanDetailText = createSelectedFanDetail(settings, layout, fabricationMethod);
  $: corsiFaceAssignments = isCorsiControlsActive ? createCorsiFaceAssignments(layout) : [];

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

  function updateCorsiMode(event: Event): void {
    const corsiMode = readCorsiModeControlValue(event);
    commitSettings({
      ...settings,
      corsiMode,
      corsiFilterCount: defaultCorsiRosenthalFilterCount(corsiMode),
    });
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

  function updateCorsiFilterCount(event: Event): void {
    commitSettings({
      ...settings,
      corsiFilterCount: readNumberInput(event, settings.corsiFilterCount),
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

  function readFilterPresetControlValue(event: Event): FilterPresetId {
    const preset = filterPresets.find((entry) => entry.id === requireSelect(event, "readFilterPresetControlValue").value);
    return preset?.id ?? defaultSettings.filterPreset;
  }

  function readDonutFilterPresetControlValue(event: Event): DonutFilterPresetId {
    return findDonutFilterPreset(requireSelect(event, "readDonutFilterPresetControlValue").value).id;
  }

  function readFanProductPresetControlValue(event: Event): FanProductPresetId {
    const preset = fanProductPresets.find((entry) => entry.id === requireSelect(event, "readFanProductPresetControlValue").value);
    return preset?.id ?? defaultSettings.fanPreset;
  }

  function readPrintDesignControlValue(event: Event): PrintDesignId {
    const preset = publicThreeDimensionalPrintDesignPresets.find((entry) => entry.id === requireSelect(event, "readPrintDesignControlValue").value);
    return preset?.id ?? defaultThreeDimensionalPrintDesignId;
  }

  function readCorsiModeControlValue(event: Event): CorsiRosenthalMode {
    const mode = corsiRosenthalModes.find((entry) => entry === requireSelect(event, "readCorsiModeControlValue").value);
    return mode ?? defaultSettings.corsiMode;
  }

  function readFanCountControlValue(event: Event): number {
    const parsed = Number(requireSelect(event, "readFanCountControlValue").value);
    return Number.isFinite(parsed) ? parsed : automaticFanCount;
  }

  function isRecommendedFanDiameter(diameter: FanDiameter): diameter is RecommendedFanDiameter {
    return diameter === 120 || diameter === 140;
  }

  function isRecommendedFanProductPreset(preset: { readonly id: FanProductPresetId; readonly diameter: FanDiameter }): preset is RecommendedFanProductPreset {
    return preset.id !== customFanProductPresetId && isRecommendedFanDiameter(preset.diameter);
  }

  function fanDiameterSelectionForSettings(currentSettings: RawPurifierSettings): FanDiameterSelection {
    if (currentSettings.fanPreset === customFanProductPresetId && !isRecommendedFanDiameter(currentSettings.fanDiameter)) {
      return "custom";
    }
    const fanProduct = findFanProductPreset(currentSettings.fanPreset);
    if (isRecommendedFanProductPreset(fanProduct)) {
      return fanProduct.diameter;
    }
    if (isRecommendedFanDiameter(currentSettings.fanDiameter)) {
      return currentSettings.fanDiameter;
    }
    return defaultRecommendedFanDiameter;
  }

  function recommendedFanProductPresetsForDiameter(diameter: RecommendedFanDiameter): readonly RecommendedFanProductPreset[] {
    return recommendedFanProductPresets.filter((preset) => preset.diameter === diameter);
  }

  function fanProductOptionsForSelection(selection: FanDiameterSelection): readonly PresetFanProduct[] {
    if (selection === "custom") {
      return [];
    }
    return recommendedFanProductPresetsForDiameter(selection);
  }

  function defaultFanProductPresetForRecommendedDiameter(diameter: RecommendedFanDiameter): RecommendedFanProductPreset {
    const preset = recommendedFanProductPresetsForDiameter(diameter)[0];
    if (preset === undefined) {
      throw new Error(`defaultFanProductPresetForRecommendedDiameter: Missing ${diameter} mm fan preset`);
    }
    return preset;
  }

  function readNumberInput(event: Event, fallback: number): number {
    const value = requireInputOrSelect(event, "readNumberInput").value.trim();
    if (value.length === 0) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function readCheckboxInput(event: Event): boolean {
    const input = requireInput(event, "readCheckboxInput");
    return input.checked;
  }

  function requireSelect(event: Event, context: string): HTMLSelectElement {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) {
      throw new Error(`${context}: Expected select event target`);
    }
    return target;
  }

  function requireInput(event: Event, context: string): HTMLInputElement {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      throw new Error(`${context}: Expected input event target`);
    }
    return target;
  }

  function requireInputOrSelect(event: Event, context: string): HTMLInputElement | HTMLSelectElement {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      throw new Error(`${context}: Expected input or select event target`);
    }
    return target;
  }

  // #######################################
  // View Availability
  // #######################################

  function publicThreeDimensionalPrintDesignId(printDesign: PrintDesignId): PrintDesignId {
    return isPublicThreeDimensionalPrintDesignId(printDesign) ? printDesign : defaultThreeDimensionalPrintDesignId;
  }

  function createSelectedFilterDetail(
    currentSettings: RawPurifierSettings,
    currentLayout: LayoutResult,
    currentFabricationMethod: FabricationMethod,
  ): string {
    const preset = findFilterPreset(currentSettings.filterPreset);
    const examples = preset.examples.length > 0 ? ` (${preset.examples.join(", ")})` : "";
    return `${preset.detail}${examples} · ${preset.nominalSize} · ${configuredFanCountFor(currentLayout, currentFabricationMethod)} fans`;
  }

  function createSelectedFanDetail(
    currentSettings: RawPurifierSettings,
    currentLayout: LayoutResult,
    currentFabricationMethod: FabricationMethod,
  ): string {
    const product = findFanProductPreset(currentSettings.fanPreset);
    return `${configuredFanCountFor(currentLayout, currentFabricationMethod)} x ${currentLayout.configuration.fan.spec.diameter} mm · ${product.detail} · ${product.powerNote}`;
  }

  function swatchColor(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  // #######################################
  // Summaries and Diagnostics
  // #######################################

  // ##############################
  // Export Diagnostics
  // ##############################

  function evaluateActiveExportDiagnostics(
    currentLayout: LayoutResult,
    currentFabricationMethod: FabricationMethod,
    currentGeneratedPlan: PrintableSheetPlan | null,
  ): BuildDiagnostic[] {
    if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      return [];
    }

    const usesGeneratedPrintKit =
      currentFabricationMethod === "print-3mf" &&
      (isCorsiRosenthalPrintDesignId(currentLayout.configuration.printDesign.id) ||
        isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id) ||
        isTempestPrintDesignId(currentLayout.configuration.printDesign.id));
    const baseDiagnostics = usesGeneratedPrintKit
      ? evaluateBuildDiagnostics(currentLayout).filter(
          (diagnostic) =>
            ![
              "no-fans",
              "no-side-fans",
              "tight-fan-margin",
              "large-unsplit-frame",
              "large-sheet",
              "custom-filter-range",
            ].includes(diagnostic.id),
        )
      : evaluateBuildDiagnostics(currentLayout);

    if (currentFabricationMethod !== "print-3mf") {
      return baseDiagnostics;
    }

    const kit = currentGeneratedPlan?.kit;
    if (kit === undefined) {
      return baseDiagnostics;
    }
    const printDiagnostics: BuildDiagnostic[] = [];
    if (kit.summary.oversizedPartCount > 0) {
      printDiagnostics.push({
        id: "oversized-print-part",
        severity: "warning",
        title: "Print part exceeds bed",
        detail: `${kit.summary.oversizedPartCount} part${kit.summary.oversizedPartCount === 1 ? "" : "s"} exceed ${kit.preset.label}.`,
      });
    }
    if (kit.summary.retainedPrintCriticalCutFeatureCount < kit.summary.sourcePrintCriticalCutFeatureCount) {
      printDiagnostics.push({
        id: "critical-print-feature-loss",
        severity: "warning",
        title: "Critical cut features lost",
        detail: "The selected split would drop fan, screw, slot, or window features from the printable parts.",
      });
    }
    return [...baseDiagnostics, ...printDiagnostics];
  }

  function summarizeActiveBuildReadiness(
    currentLayout: LayoutResult,
    diagnostics: readonly BuildDiagnostic[],
    currentFabricationMethod: FabricationMethod,
  ): BuildDiagnostic {
    if (diagnostics.length > 0) {
      return {
        id: "warnings",
        severity: "warning",
        title: `${diagnostics.length} export check${diagnostics.length === 1 ? "" : "s"}`,
        detail: "Review the fabrication checks before exporting.",
      };
    }
    if (currentFabricationMethod === "print-3mf") {
      if (isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
        const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
        return {
          id: "ready",
          severity: "info",
          title: "Ready to open files",
          detail: reference === undefined ? "Open the original source files." : reference.fileSummary,
        };
      }
      return {
        id: "ready",
        severity: "info",
        title: "Ready to export",
        detail: "No print-bed or printable-geometry issues were detected.",
      };
    }
    return summarizeBuildReadiness(currentLayout);
  }

  // ##############################
  // Preview Summary
  // ##############################

  function createPreviewSummaryItems(
    currentLayout: LayoutResult,
    currentPreviewMode: PreviewMode,
    currentFabricationMethod: FabricationMethod,
    currentPrintVolumePresetId: PrintVolumePresetId,
    currentSettings: RawPurifierSettings,
    currentGeneratedPlan: PrintableSheetPlan | null,
  ): readonly SummaryItem[] {
    if (currentPreviewMode === "print-sheets") {
      if (isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
        const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
        return [
          { label: "Print plates", value: findPrintVolumePreset(currentPrintVolumePresetId).label },
          { label: "Source STLs", value: String(reference?.platePreviewAssets.length ?? 0) },
          ...staticPrintEstimateSummaryItems(reference?.printEstimate),
          { label: "License", value: currentLayout.configuration.printDesign.license },
          { label: "Source", value: reference?.attribution ?? currentLayout.configuration.printDesign.source },
        ];
      }
      const plan = requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createPreviewSummaryItems");
      if (isTempestPrintDesignId(currentLayout.configuration.printDesign.id)) {
        return [
          { label: "Print plates", value: String(plan.sheets.length) },
          { label: "Print chunks", value: String(plan.kit.summary.partCount) },
          { label: "Split model", value: String(plan.kit.summary.splitPanelCount) },
          { label: "Bed", value: plan.kit.preset.label },
        ];
      }
      return [
        { label: "Print plates", value: String(plan.sheets.length) },
        { label: "Panel tiles", value: String(plan.kit.summary.panelTileCount) },
        { label: "Glue keys", value: String(plan.kit.summary.glueKeyCount) },
        { label: "Split panels", value: String(plan.kit.summary.splitPanelCount) },
        { label: "Bed", value: plan.kit.preset.label },
      ];
    }

    if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
      return [
        { label: "Design", value: currentLayout.configuration.printDesign.label },
        { label: "Type", value: "Curated static" },
        { label: "Files", value: reference?.fileSummary ?? "Original source files" },
        ...staticPrintEstimateSummaryItems(reference?.printEstimate),
        { label: "Source", value: reference?.attribution ?? currentLayout.configuration.printDesign.source },
      ];
    }

    if (currentFabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(currentLayout.configuration.printDesign.id)) {
      const plan = requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createPreviewSummaryItems");
      const corsiLayout = resolveCorsiRosenthalLayout(currentLayout);
      return [
        { label: "Design", value: currentLayout.configuration.printDesign.label },
        { label: "Mode", value: corsiModeLabel(corsiLayout.mode) },
        {
          label: "Filters",
          value: `${corsiLayout.filterCount} x ${formatMillimeters(currentSettings.filterWidth)} x ${formatMillimeters(currentSettings.filterDepth)}`,
        },
        { label: "Fans", value: `${corsiLayout.fanCount} x ${currentSettings.fanDiameter} mm` },
        { label: "Print parts", value: String(plan.kit.summary.partCount) },
        { label: "Bed", value: plan.kit.preset.label },
      ];
    }

    if (currentFabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id)) {
      const plan = requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createPreviewSummaryItems");
      const model = createDonutFilterModel(currentLayout);
      return [
        { label: "Design", value: currentLayout.configuration.printDesign.label },
        {
          label: "Filter",
          value: `${formatMillimeters(model.filter.outerDiameter)} dia x ${formatMillimeters(model.filter.length)}`,
        },
        { label: "Center hole", value: formatMillimeters(model.filter.holeDiameter) },
        { label: "Fan", value: `${model.fanSize} mm` },
        { label: "Print parts", value: String(plan.kit.summary.partCount) },
        { label: "Bed", value: plan.kit.preset.label },
      ];
    }

    if (currentFabricationMethod === "print-3mf" && isTempestPrintDesignId(currentLayout.configuration.printDesign.id)) {
      const plan = requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createPreviewSummaryItems");
      const model = createTempestModel(createTempestSettingsFromLayout(currentLayout));
      return [
        { label: "Design", value: currentLayout.configuration.printDesign.label },
        { label: "Arrangement", value: tempestArrangementLabel(model.settings.arrangement.type) },
        { label: "Fans", value: String(totalConfiguredFans(currentLayout.summary.fans)) },
        { label: "Print chunks", value: String(plan.kit.summary.partCount) },
        { label: "Bed", value: plan.kit.preset.label },
      ];
    }

    const cutPanelSummary = requireCutPanelFabricationSummary(currentLayout, "createPreviewSummaryItems");
    return [
      { label: "Panels", value: String(cutPanelSummary.panelCount) },
      { label: "Chamber height", value: formatMillimeters(currentLayout.summary.chamberHeight) },
      { label: "Working depth", value: formatMillimeters(currentLayout.summary.workingDepth) },
      { label: "Fans", value: String(totalConfiguredFans(currentLayout.summary.fans)) },
      {
        label: "Sheet",
        value: `${formatMillimeters(cutPanelSummary.sheetWidth)} x ${formatMillimeters(cutPanelSummary.sheetHeight)}`,
      },
    ];
  }

  // ##############################
  // Static Print Estimates
  // ##############################

  function staticPrintEstimateSummaryItems(estimate: StaticPrintEstimate | undefined): readonly SummaryItem[] {
    if (estimate === undefined) {
      return [];
    }
    return [
      { label: "Filament", value: `${formatKilograms(estimate.estimatedFilamentKilograms)} @ ${estimate.assumptions.infillPercent}%` },
      { label: "Print time", value: `${formatHourRange(estimate.printTimeHours)} h` },
    ];
  }

  // #######################################
  // Purchase List
  // #######################################

  // ##############################
  // Required Items
  // ##############################

  function createPurchaseListItems(
    currentLayout: LayoutResult,
    currentFabricationMethod: FabricationMethod,
    currentSettings: RawPurifierSettings,
  ): readonly PurchaseListItem[] {
    if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
      if (reference === undefined) {
        return [];
      }
      const staticDefaults = staticReferenceDefaultsForPreset(currentLayout.configuration.printDesign);
      if (staticDefaults === undefined) {
        return [];
      }
      const fanProduct = findFanProductPreset(currentSettings.fanPreset);
      const fanCount = staticDefaults.fanCount;
      const filterPreset = findFilterPreset(currentSettings.filterPreset);
      const filterCount = staticDefaults.filterCount;
      return [
        {
          category: "Source files",
          label: currentLayout.configuration.printDesign.label,
          detail: reference.fileSummary,
          url: staticReferenceFilesUrl(currentLayout),
        },
        ...staticPrintEstimatePurchaseItems(reference.printEstimate),
        {
          category: "Filters",
          label: `${filterCount} x ${filterPreset.label}`,
          detail: `${formatMillimeters(currentSettings.filterWidth)} x ${formatMillimeters(currentSettings.filterDepth)} x ${formatMillimeters(currentSettings.filterThickness)} each`,
          url: webSearchUrl(`${filterPreset.label} air filter`),
        },
        {
          category: "Fans",
          label: `${fanCount} x ${currentLayout.configuration.fan.spec.diameter} mm`,
          detail: fanProduct.label,
          url: fanProduct.productUrl,
        },
        {
          category: "Power",
          label: "12 V fan power",
          detail: `PWM power supply or fan hub sized for ${fanCount} ${fanProduct.label} fans`,
          url: webSearchUrl(`${fanProduct.label} 12V PWM fan power supply hub`),
        },
        {
          category: "License",
          label: currentLayout.configuration.printDesign.license,
          detail: reference.usePolicy.note,
          url: currentLayout.configuration.printDesign.licenseUrl,
        },
      ];
    }

    const fanProduct = findFanProductPreset(currentSettings.fanPreset);
    const fanCount = configuredFanCountFor(currentLayout, currentFabricationMethod);
    const baseItems: PurchaseListItem[] = [
      {
        category: "Fans",
        label: `${fanCount} x ${currentLayout.configuration.fan.spec.diameter} mm`,
        detail: fanProduct.label,
        url: fanProduct.productUrl,
      },
      {
        category: "Power",
        label: "12 V fan power",
        detail: "PWM power supply or fan hub sized for the fan current",
        url: webSearchUrl(`${fanProduct.label} 12V PWM fan power supply hub`),
      },
    ];

    if (currentFabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id)) {
      const preset = findDonutFilterPreset(currentSettings.donutFilterPreset);
      return [
        {
          category: "Filter",
          label: "Round HEPA filter",
          detail: `${formatMillimeters(currentSettings.donutFilterOuterDiameter)} dia x ${formatMillimeters(currentSettings.donutFilterLength)}`,
          url: preset.productUrl ?? webSearchUrl(`${preset.label} replacement filter`),
        },
        ...baseItems,
        {
          category: "Seal",
          label: "Foam gasket tape",
          detail: "Optional seal between adaptor, fan, and filter",
          url: webSearchUrl("foam gasket tape air purifier filter adapter"),
        },
      ];
    }

    const filterPreset = findFilterPreset(currentSettings.filterPreset);
    const isCorsi = currentFabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(currentLayout.configuration.printDesign.id);
    const corsiFilterCount = isCorsi ? resolveCorsiRosenthalLayout(currentLayout).filterCount : null;
    return [
      {
        category: "Filter",
        label: corsiFilterCount === null ? filterPreset.label : `${corsiFilterCount} x ${filterPreset.label}`,
        detail: `${formatMillimeters(currentSettings.filterWidth)} x ${formatMillimeters(currentSettings.filterDepth)} x ${formatMillimeters(currentSettings.filterThickness)}${corsiFilterCount === null ? "" : " each"}`,
        url: webSearchUrl(`${filterPreset.label} air filter`),
      },
      ...baseItems,
    ];
  }

  // ##############################
  // Static Reference Items
  // ##############################

  function staticPrintEstimatePurchaseItems(estimate: StaticPrintEstimate | undefined): readonly PurchaseListItem[] {
    if (estimate === undefined) {
      return [];
    }
    return [
      {
        category: "Filament",
        label: `${estimate.recommendedSpoolCount} x 1 kg ${estimate.assumptions.material}`,
        detail: `${formatKilograms(estimate.estimatedFilamentKilograms)} used at ${estimate.assumptions.infillPercent}% infill; about ${formatUsd(staticPrintUsedFilamentCostUsd(estimate))} used or ${formatUsd(staticPrintSpoolBudgetUsd(estimate))} with margin`,
        url: webSearchUrl("1 kg PLA PETG filament spool"),
      },
      {
        category: "Print time",
        label: `About ${formatHourRange(estimate.printTimeHours)} h`,
        detail: `${estimate.assumptions.nozzleMm} mm nozzle, ${estimate.assumptions.layerHeightMm} mm layers, ${estimate.assumptions.wallThicknessMm} mm walls. ${estimate.note}`,
      },
    ];
  }

  function staticPrintUsedFilamentCostUsd(estimate: StaticPrintEstimate): number {
    return estimate.estimatedFilamentKilograms * estimate.filamentCostUsdPerKilogram;
  }

  function staticPrintSpoolBudgetUsd(estimate: StaticPrintEstimate): number {
    return estimate.recommendedSpoolCount * estimate.filamentCostUsdPerKilogram;
  }

  function staticReferenceFilesUrl(currentLayout: LayoutResult): string {
    const sourceUrl =
      staticPrintReferenceForPreset(currentLayout.configuration.printDesign)?.sourceUrl ??
      currentLayout.configuration.printDesign.sourceUrl;
    if (sourceUrl === undefined) {
      return "https://www.printables.com/";
    }
    return sourceUrl.endsWith("/files") ? sourceUrl : `${sourceUrl}/files`;
  }

  function webSearchUrl(query: string): string {
    const params = new URLSearchParams({ q: query });
    return `https://www.google.com/search?${params.toString()}`;
  }

  // #######################################
  // Corsi-Rosenthal Controls
  // #######################################

  function createCorsiFaceAssignments(currentLayout: LayoutResult): readonly CorsiFaceRoleAssignment[] {
    const model = createCorsiRosenthalModel(currentLayout);
    return corsiFaceSides.map((side) => {
      const assignment = model.faceRoles.find((entry) => entry.side === side);
      return assignment ?? { side, role: "sealed" };
    });
  }

  function corsiFanCountFitsLayout(mode: CorsiRosenthalMode, fanCount: number, currentLayout: LayoutResult): boolean {
    if (fanCount === automaticFanCount) {
      return true;
    }
    if (!Number.isFinite(fanCount) || fanCount <= 0 || (mode === "side-exhaust" && fanCount % 2 !== 0)) {
      return false;
    }
    return corsiFanCountFits({
      mode,
      fanCount,
      filterDimensions: filterSelectionDimensions(currentLayout.configuration.filter),
      fanDiameter: currentLayout.configuration.fan.spec.diameter,
    });
  }

  function corsiFanCountOptionLabel(fanCount: number, isAvailable: boolean): string {
    const label = fanCountOptionLabel(fanCount);
    return isAvailable || fanCount === automaticFanCount ? label : `${label} - too large`;
  }

  function corsiFanCountOptionTitle(isAvailable: boolean, isAllowed: boolean): string {
    if (isAvailable) {
      return "";
    }
    return isAllowed ? "Too large for this filter and fan size" : "Unavailable for this Corsi mode";
  }

  function fanCountOptionLabel(fanCount: number): string {
    if (fanCount === automaticFanCount) {
      return "Auto";
    }
    return fanCount === 0 ? "None" : String(fanCount);
  }

  function corsiFaceLabel(side: CorsiFaceSide): string {
    return side.charAt(0).toUpperCase() + side.slice(1);
  }

  function corsiFaceRoleLabel(assignment: CorsiFaceRoleAssignment): string {
    if (assignment.role === "fan") {
      return `${assignment.fanCount} fan${assignment.fanCount === 1 ? "" : "s"}`;
    }
    return assignment.role === "filter" ? "Filter" : "Sealed";
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

  function createActivePrintSheetPlan(
    currentLayout: LayoutResult,
    currentPrintVolumePresetId: PrintVolumePresetId,
    currentGeneratedPlan: PrintableSheetPlan | null,
  ): PrintSheetThreePreviewPlan {
    if (isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      const reference = staticPrintReferenceForPreset(currentLayout.configuration.printDesign);
      if (reference === undefined) {
        throw new Error("createActivePrintSheetPlan: Static reference design is missing source file metadata");
      }
      const preset = findPrintVolumePreset(currentPrintVolumePresetId);
      return {
        type: "static-reference",
        reference,
        bed: preset.bed,
        bedLabel: preset.label,
      };
    }
    return requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createActivePrintSheetPlan");
  }

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

  function generatedPrintSheetPlanCacheKey(
    rawSettings: RawPurifierSettings,
    currentPrintVolumePresetId: PrintVolumePresetId,
  ): string {
    return JSON.stringify({
      printVolumePresetId: currentPrintVolumePresetId,
      printDesign: rawSettings.printDesign,
      filterPreset: rawSettings.filterPreset,
      filterWidth: rawSettings.filterWidth,
      filterDepth: rawSettings.filterDepth,
      filterThickness: rawSettings.filterThickness,
      rim: rawSettings.rim,
      fanPreset: rawSettings.fanPreset,
      fanDiameter: rawSettings.fanDiameter,
      filters: rawSettings.filters,
      splitFrames: rawSettings.splitFrames,
      fansLeft: rawSettings.fansLeft,
      fansRight: rawSettings.fansRight,
      fansTop: rawSettings.fansTop,
      fansBottom: rawSettings.fansBottom,
      corsiMode: rawSettings.corsiMode,
      corsiFilterCount: rawSettings.corsiFilterCount,
      corsiFanCount: rawSettings.corsiFanCount,
      tempestArrangement: rawSettings.tempestArrangement,
      donutFilterPreset: rawSettings.donutFilterPreset,
      donutFilterOuterDiameter: rawSettings.donutFilterOuterDiameter,
      donutFilterLength: rawSettings.donutFilterLength,
      donutFilterHoleDiameter: rawSettings.donutFilterHoleDiameter,
      donutAdapterInsertLength: rawSettings.donutAdapterInsertLength,
      donutCapRim: rawSettings.donutCapRim,
      donutCapEnabled: rawSettings.donutCapEnabled,
      screwHoleDiameter: rawSettings.screwHoleDiameter,
      materialThickness: rawSettings.materialThickness,
      kerfFit: rawSettings.kerfFit,
      fingerWidthMultiplier: rawSettings.fingerWidthMultiplier,
      fingerSpaceMultiplier: rawSettings.fingerSpaceMultiplier,
      fingerPlayMultiplier: rawSettings.fingerPlayMultiplier,
      fingerHoleWidthMultiplier: rawSettings.fingerHoleWidthMultiplier,
      fingerHoleOffsetMultiplier: rawSettings.fingerHoleOffsetMultiplier,
      dovetailSizeMultiplier: rawSettings.dovetailSizeMultiplier,
      dovetailDepthMultiplier: rawSettings.dovetailDepthMultiplier,
      dovetailTaper: rawSettings.dovetailTaper,
    });
  }

  function createGeneratedPrintSheetPlanFromLayout(
    currentLayout: LayoutResult,
    currentPrintVolumePresetId: PrintVolumePresetId,
  ): PrintableSheetPlan {
    return createPrintableSheetPlanFromKit(createPrintDesignKit(currentLayout, currentPrintVolumePresetId));
  }

  function createActiveAssemblyPrintSeamPlan(
    currentLayout: LayoutResult,
    currentPreviewMode: PreviewMode,
    currentFabricationMethod: FabricationMethod,
    currentSettings: RawPurifierSettings,
    currentGeneratedPlan: PrintableSheetPlan | null,
  ): PrintableSheetPlan | null {
    if (
      currentPreviewMode !== "enclosure" ||
      currentFabricationMethod !== "print-3mf" ||
      !currentSettings.showPrintSeams ||
      isTempestPrintDesignId(currentLayout.configuration.printDesign.id) ||
      isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)
    ) {
      return null;
    }
    return requireGeneratedPrintSheetPlan(currentGeneratedPlan, "createActiveAssemblyPrintSeamPlan");
  }

  function requireGeneratedPrintSheetPlan(plan: PrintableSheetPlan | null, context: string): PrintableSheetPlan {
    if (plan === null) {
      throw new Error(`${context}: Expected generated print sheet plan`);
    }
    return plan;
  }

  // #######################################
  // Labels and Formatting
  // #######################################

  function fabricationMethodLabel(method: FabricationMethod): string {
    return method === "print-3mf" ? "3D print" : "Laser cut";
  }

  function corsiModeLabel(mode: CorsiRosenthalMode): string {
    return mode === "side-exhaust" ? "Flipped side exhaust" : "Classic top exhaust";
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

  function tempestArrangementLabel(arrangement: string): string {
    if (arrangement === "single-horizontal-top-filter") {
      return "Single horizontal filter";
    }
    if (arrangement === "four-side-filter-tower") {
      return "Four-filter tower";
    }
    return "Dual horizontal filters";
  }

  function configuredFanCountFor(currentLayout: LayoutResult, currentFabricationMethod: FabricationMethod): number {
    if (currentFabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(currentLayout.configuration.printDesign.id)) {
      return staticReferenceDefaultsForPreset(currentLayout.configuration.printDesign)?.fanCount ?? 0;
    }
    if (currentFabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(currentLayout.configuration.printDesign.id)) {
      return resolveCorsiRosenthalFanCount(currentLayout);
    }
    if (currentFabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(currentLayout.configuration.printDesign.id)) {
      return currentLayout.configuration.design.type === "donut-filter-adapter" ? currentLayout.configuration.design.fan.count : 0;
    }
    return totalConfiguredFans(currentLayout.summary.fans);
  }

  function totalConfiguredFans(fans: LayoutResult["summary"]["fans"]): number {
    if (fans.type === "wall-banks") {
      return fans.resolvedFans.left + fans.resolvedFans.right + fans.resolvedFans.top + fans.resolvedFans.bottom;
    }
    return fans.fanCount;
  }

  function requireCutPanelFabricationSummary(
    currentLayout: LayoutResult,
    caller: string,
  ): Extract<LayoutResult["summary"]["fabrication"], { readonly type: "cut-panel-source" }> {
    if (currentLayout.summary.fabrication.type !== "cut-panel-source") {
      throw new Error(`${caller}: ${currentLayout.configuration.printDesign.label} does not have cut-panel fabrication`);
    }
    return currentLayout.summary.fabrication;
  }

  function formatKilograms(value: number): string {
    return `${trimNumber(value)} kg`;
  }

  function formatUsd(value: number): string {
    return `$${trimNumber(value)}`;
  }

  function formatHourRange(range: StaticPrintEstimate["printTimeHours"]): string {
    return `${trimNumber(range.min)}-${trimNumber(range.max)}`;
  }

  function trimNumber(value: number): string {
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
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
                {#if !isCorsiRosenthalPrintDesignId(settings.printDesign)}
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
                {/if}
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
                {#if fabricationMethod === "print-3mf" && !isCorsiRosenthalPrintDesignId(settings.printDesign) && !isTempestPrintDesignId(settings.printDesign) && !isStaticReferenceControlsActive}
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

                  {#if isCorsiControlsActive}
                    <div data-corsi-layout>
                      <label class="field">
                        <span>Mode</span>
                        <select name="corsiMode" onchange={updateCorsiMode}>
                          {#each corsiRosenthalModes as mode}
                            <option value={mode} selected={settings.corsiMode === mode}>{corsiModeLabel(mode)}</option>
                          {/each}
                        </select>
                      </label>
                      <label class="field">
                        <span>Filters</span>
                        <select name="corsiFilterCount" onchange={updateCorsiFilterCount}>
                          {#each ["1", "2", "3", "4", "5"] as count}
                            <option value={count} disabled={Number(count) > corsiFilterCountMax} selected={settings.corsiFilterCount === Number(count)}>
                              {count}
                            </option>
                          {/each}
                        </select>
                      </label>
                      <label class="field compact-field">
                        <span>{settings.corsiMode === "side-exhaust" ? "Side fans" : "Top fans"}</span>
                        <select name="corsiFanCount" onchange={(event) => updateFanCountSetting("corsiFanCount", event)}>
                          {#each [automaticFanCount, ...fixedFanCountOptions] as fanCount}
                            {@const isAllowed = allowedCorsiFanCounts.has(fanCount)}
                            {@const fitsLayout = isAllowed && corsiFanCountFitsLayout(settings.corsiMode, fanCount, layout)}
                            {@const isAvailable = isAllowed && fitsLayout}
                            <option
                              value={fanCount}
                              disabled={!isAvailable}
                              title={corsiFanCountOptionTitle(isAvailable, isAllowed)}
                              selected={settings.corsiFanCount === fanCount}
                            >
                              {isAllowed ? corsiFanCountOptionLabel(fanCount, fitsLayout) : fanCountOptionLabel(fanCount)}
                            </option>
                          {/each}
                        </select>
                      </label>
                      <div class="corsi-topology-summary" id="corsiTopologySummary" aria-label="Corsi-Rosenthal face roles">
                        {#each corsiFaceAssignments as assignment}
                          <span class={`corsi-face-role is-${assignment.role}`} title={`${corsiFaceLabel(assignment.side)} face: ${corsiFaceRoleLabel(assignment)}`}>
                            <small>{corsiFaceLabel(assignment.side)}</small>
                            <strong>{corsiFaceRoleLabel(assignment)}</strong>
                          </span>
                        {/each}
                      </div>
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
                        <details class="selector-info">
                          <summary aria-label="Filter details" title="Filter details">
                            <span>Details</span>
                          </summary>
                          <div class="selector-info-panel">
                            <div class="filter-preset-card" id="filterPresetDetail">
                              <strong>{selectedFilterDimensionsText}</strong>
                              <span>{selectedFilterDetailText}</span>
                            </div>
                          </div>
                        </details>
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
                        <details class="selector-info">
                          <summary aria-label="Round filter details" title="Round filter details">
                            <span>Details</span>
                          </summary>
                          <div class="selector-info-panel">
                            <div class="filter-preset-card" id="donutFilterPresetDetail">
                              <strong>{selectedDonutFilterDimensionsText}</strong>
                              <span>{selectedDonutFilterPreset.detail} · {selectedDonutFilterPreset.measurementNote}</span>
                              <small>
                                {selectedDonutFilterPreset.source}
                                {#if selectedDonutFilterPreset.sourceUrl !== undefined}
                                  <a href={selectedDonutFilterPreset.sourceUrl} target="_blank" rel="noreferrer">Source</a>
                                {/if}
                              </small>
                            </div>
                          </div>
                        </details>
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
                      <details class="selector-info">
                        <summary aria-label="Fan model details" title="Fan model details">
                          <span>Details</span>
                        </summary>
                        <div class="selector-info-panel">
                          <div class="fan-preset-card" id="fanPresetDetail">
                            <div class="fan-card-header">
                              <div>
                                <strong>{selectedFanProductPreset.label}</strong>
                                <span>{selectedFanDetailText}</span>
                              </div>
                              <div class="fan-color-swatches" aria-label="Fan colors">
                                <span style:--swatch-color={swatchColor(selectedFanProductPreset.appearance.frameColor)}></span>
                                <span style:--swatch-color={swatchColor(selectedFanProductPreset.appearance.bladeColor)}></span>
                                <span style:--swatch-color={swatchColor(selectedFanProductPreset.appearance.hubColor)}></span>
                              </div>
                            </div>
                            <small>
                              {selectedFanProductPreset.source}
                              {#if selectedFanProductPreset.productUrl !== undefined}
                                <a href={selectedFanProductPreset.productUrl} target="_blank" rel="noreferrer">Source</a>
                              {/if}
                            </small>
                          </div>
                        </div>
                      </details>
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
