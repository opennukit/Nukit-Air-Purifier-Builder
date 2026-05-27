import "./styles.css";
import {
  applyFanProductPreset,
  applyFilterPreset,
  applyDonutFilterPreset,
  applyPrintDesignPreset,
  automaticFanCount,
  cameraPresets,
  corsiFanCountFits,
  corsiRosenthalFilterCountRange,
  corsiRosenthalFanCountOptions,
  corsiRosenthalModes,
  customDonutFilterPresetId,
  customFanProductPresetId,
  decodeSettings,
  defaultSettings,
  defaultCorsiRosenthalFilterCount,
  encodeSettings,
  fanDiameters,
  fanProductPresets,
  fixedFanCountOptions,
  donutFilterPresets,
  findFanProductPreset,
  findDonutFilterPreset,
  findPrintDesignPreset,
  formatMillimeters,
  isCorsiRosenthalPrintDesignId,
  isDonutFilterPrintDesignId,
  isPublicPrintDesignId,
  isStaticReferencePrintDesignId,
  normalizeRawSettings,
  publicPrintDesignPresets,
  resolveCorsiRosenthalLayout,
  resolveCorsiRosenthalFanCount,
  staticPrintReferenceForPreset,
  type CorsiRosenthalMode,
  type DonutFilterPresetId,
  type FanProductPresetId,
  type PrintDesignId,
  type RawPurifierSettings,
} from "@/domain/purifier/airPurifier";
import { createLaserSvg, createLayout } from "@/fabrication/purifierLayout";
import {
  customFilterPresetId,
  filterPresets,
  filterSelectionDimensions,
  findFilterPreset,
  type FilterPresetId,
} from "@/domain/purifier/filter";
import type { PreviewMode } from "@/app/workbench/previewMode";
import { evaluateBuildDiagnostics, summarizeBuildReadiness, type BuildDiagnostic } from "@/fabrication/buildDiagnostics";
import {
  createPrintableSheetPlanFromKit,
  exportFormats as fabricationMethods,
  findPrintVolumePreset,
  printVolumePresets,
  readExportFormat,
  type ExportFormat,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import { createPrintDesignKit, createPrintDesignThreeMfExport } from "@/fabrication/printing/printDesignKit";
import {
  createPrintDesignSettingsMemory,
  rememberPrintDesignSettings,
  switchPrintDesignSettings,
  type PrintDesignSettingsMemory,
} from "@/app/state/printDesignSettingsMemory";
import { PrintSheetThreePreview } from "@/rendering/three/printSheetThreePreview";
import { staticPrintReferenceHasPlatePreview, type StaticPrintEstimate } from "@/resources/static-print-references/references";
import { PurifierThreePreview } from "@/rendering/three/purifierThreePreview";
import {
  decodeWorkbenchState,
  encodeWorkbenchState,
  fabricationMethodForWorkbenchState,
  previewModeForWorkbenchState,
  printVolumePresetIdForWorkbenchState,
  readControlsTab,
  withControlsTab,
  withFabricationMethod,
  withPreviewMode,
  withPrintVolumePreset,
  type ControlsTab,
  type WorkbenchState,
} from "@/app/workbench/workbenchState";
import { createDonutFilterModel } from "@/domain/designs/donut-filter/model";
import { corsiFaceSides, createCorsiRosenthalModel, type CorsiFaceRole, type CorsiFaceSide } from "@/domain/designs/corsi-rosenthal/model";

type FieldName = keyof RawPurifierSettings;
type FabricationMethod = ExportFormat;

const app = requireElement(document.querySelector<HTMLElement>("#app"), "App root not found");
const initialUrlParams = new URLSearchParams(window.location.search);

let settings = decodeSettings(window.location.search);
let workbenchState: WorkbenchState = decodeWorkbenchState(initialUrlParams);
let previewMode: PreviewMode = previewModeForWorkbenchState(workbenchState);
let controlsTab: ControlsTab = workbenchState.controlsTab;
let fabricationMethod: FabricationMethod = fabricationMethodForWorkbenchState(workbenchState);
let printVolumePresetId: PrintVolumePresetId = printVolumePresetIdForWorkbenchState(workbenchState);
let printDesignSettingsMemory: PrintDesignSettingsMemory = createPrintDesignSettingsMemory(settings);
let threePreview: PurifierThreePreview | null = null;
let printSheetPreview: PrintSheetThreePreview | null = null;
let dialogPrintSheetPreview: PrintSheetThreePreview | null = null;
const transientLabelTimers = new WeakMap<HTMLElement, number>();

settings = normalizePublicPrintDesignSettings(settings);
printDesignSettingsMemory = createPrintDesignSettingsMemory(settings);
syncWorkbenchState();
renderShell();
syncControlTabs();
syncControls();
renderPreview();
syncUrl();

function renderShell(): void {
  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Browser generator</p>
          <h1>FilterBoxBuilder: DIY clean air</h1>
        </div>
        <div class="topbar-actions">
          <button class="ghost-button" type="button" data-action="copy-url">Copy URL</button>
        </div>
      </header>

      <section class="method-workbench" aria-label="Manufacturing workspace">
        ${fabricationMethodField()}
        <section class="workspace" aria-label="Open air purifier builder">
          <section class="preview-pane" aria-label="Live preview">
            <div class="preview-toolbar" aria-label="Preview mode">
              <div class="preview-mode-group">
                <button class="mode-button" type="button" data-mode="enclosure">Assembled box</button>
                <button class="mode-button" type="button" data-mode="cut-sheet" data-method-preview="laser-svg">Laser drawing</button>
                <button class="mode-button" type="button" data-mode="print-sheets" data-method-preview="print-3mf">Print plates</button>
              </div>
              <span class="preview-toolbar-action-slot">
                <button class="ghost-button preview-large-view-button" type="button" data-action="maximize-preview">
                  Open large view
                </button>
              </span>
            </div>

            <div class="preview-stage" id="previewStage"></div>

            <div class="summary-grid" id="summaryGrid"></div>

          </section>

          <aside class="controls-pane" aria-label="Build settings">
            <section class="persistent-output-panel" data-persistent-output-panel aria-label="Build output">
              <div class="export-readiness-summary" id="exportReadinessSummary"></div>
              <div class="persistent-export-actions">
                ${exportActionsHtml()}
              </div>
            </section>

            <div class="controls-tabs" role="tablist" aria-label="Builder steps">
              <button class="controls-tab" id="design-controls-tab" type="button" role="tab" data-controls-tab="design" aria-controls="design-controls-panel">Design</button>
              <button class="controls-tab" id="parts-controls-tab" type="button" role="tab" data-controls-tab="parts" aria-controls="parts-controls-panel">Parts</button>
              <button class="controls-tab" id="setup-controls-tab" type="button" role="tab" data-controls-tab="setup" aria-controls="setup-controls-panel">Print setup</button>
            </div>

            <div class="tab-panel design-controls" id="design-controls-panel" role="tabpanel" aria-labelledby="design-controls-tab" data-controls-panel="design">
              <section class="control-section design-model-section" data-print-design-control>
                <div class="section-heading">
                  <p class="eyebrow">Design</p>
                  <h2>Printable model</h2>
                </div>
                ${printDesignField()}
              </section>

              <section class="control-section layout-section" data-generated-layout-controls>
                <div class="section-heading">
                  <p class="eyebrow">Layout</p>
                  <h2 id="layoutSectionTitle">Fan placement</h2>
                </div>
                <div class="fan-grid">
                  <div data-nukit-fan-placement>
                    ${fanField("fansLeft", "Left")}
                    ${fanField("fansRight", "Right")}
                    ${fanField("fansTop", "Top")}
                    ${fanField("fansBottom", "Bottom")}
                  </div>
                  <div data-corsi-layout>
                    ${selectField("corsiMode", "Mode", corsiRosenthalModes.map((mode) => [mode, corsiModeLabel(mode)]))}
                    ${selectField("corsiFilterCount", "Filters", ["1", "2", "3", "4", "5"].map((count) => [count, count]))}
                    ${fanField("corsiFanCount", "Fans")}
                    <div class="corsi-topology-summary" id="corsiTopologySummary" aria-label="Corsi-Rosenthal face roles"></div>
                  </div>
                  <div data-donut-layout>
                    ${numberField("donutAdapterInsertLength", "Insert length", "mm", 0.1)}
                    ${toggleField("donutCapEnabled", "Print back cap")}
                    ${numberField("donutCapRim", "Back cap rim", "mm", 0.1)}
                  </div>
                </div>
                <div data-nukit-filter-count>
                  ${segmentedField("filters", "Filters", [
                    ["1", "One side"],
                    ["2", "Both sides"],
                  ])}
                </div>
              </section>
            </div>

            <div class="tab-panel parts-controls" id="parts-controls-panel" role="tabpanel" aria-labelledby="parts-controls-tab" data-controls-panel="parts">
              <section class="control-section parts-section">
                <div class="section-heading">
                  <p class="eyebrow">Parts</p>
                  <h2 id="partsSectionTitle">Filter and fan</h2>
                </div>
                <div data-generated-part-controls>
                  <div data-rectangular-filter-controls>
                    ${selectFieldWithInfo(
                      "filterPreset",
                      "Filter",
                      filterPresets.map((preset) => [preset.id, preset.label]),
                      { detailId: "filterPresetDetail", detailClassName: "filter-preset-card" },
                    )}
                    <div class="custom-dimensions" data-custom-filter-dimensions>
                      ${numberField("filterWidth", "Filter width", "mm", 1)}
                      ${numberField("filterDepth", "Filter depth", "mm", 1)}
                      ${numberField("filterThickness", "Filter thickness", "mm", 0.1)}
                    </div>
                  </div>
                  <div class="donut-filter-controls" data-donut-filter-controls>
                    ${selectFieldWithInfo(
                      "donutFilterPreset",
                      "Round filter",
                      donutFilterPresets.map((preset) => [preset.id, preset.label]),
                      { detailId: "donutFilterPresetDetail", detailClassName: "filter-preset-card" },
                    )}
                    <div class="donut-filter-dimensions">
                      ${numberField("donutFilterOuterDiameter", "Outer diameter", "mm", 1)}
                      ${numberField("donutFilterLength", "Length", "mm", 1)}
                      ${numberField("donutFilterHoleDiameter", "Center hole", "mm", 0.1)}
                    </div>
                  </div>
                  ${selectFieldWithInfo(
                    "fanPreset",
                    "Fan type",
                    fanProductPresets.map((preset) => [preset.id, preset.label]),
                    { detailId: "fanPresetDetail", detailClassName: "fan-preset-card" },
                  )}
                  <div data-custom-fan-size>
                    ${selectField("fanDiameter", "Fan size", fanDiameters.map((diameter) => [String(diameter), `${diameter} mm`]))}
                  </div>
                </div>
              </section>

              <section class="control-section geometry-section" data-generated-geometry-controls>
                <div class="section-heading">
                  <p class="eyebrow">Geometry</p>
                  <h2>Material and fit</h2>
                </div>
                ${numberField("materialThickness", "Material thickness", "mm", 0.1)}
                ${numberField("screwHoleDiameter", "Fan screw holes", "mm", 0.1)}
                <div data-nukit-panel-fit-controls>
                  ${numberField("rim", "Filter rim", "mm", 1)}
                  ${numberField("kerfFit", "Fit allowance", "mm", 0.01)}
                </div>
              </section>
              <section class="control-section purchase-section">
                <div class="purchase-list-card" id="purchaseList"></div>
              </section>
            </div>

            <div class="tab-panel setup-controls" id="setup-controls-panel" role="tabpanel" aria-labelledby="setup-controls-tab" data-controls-panel="setup">
              <section class="control-section print-volume-section" data-print-volume-section>
                <div class="section-heading">
                  <p class="eyebrow">Printer</p>
                  <h2>Print setup</h2>
                </div>
                <div data-print-volume-control>
                  ${exportControlField("printVolume", "Print volume", printVolumePresets.map((preset) => [preset.id, preset.label]))}
                </div>
                <div data-nukit-print-split-control>
                  ${toggleField("splitFrames", "Split large frame panels")}
                </div>
              </section>
              <section class="control-section laser-output-section" data-laser-output-controls>
                <div class="section-heading">
                  <p class="eyebrow">Laser setup</p>
                  <h2>Drawing output</h2>
                </div>
                ${toggleField("labels", "Engrave part labels")}
                ${numberField("referenceScale", "Reference scale", "mm", 1)}
              </section>
            </div>

          </aside>
        </section>
      </section>

      <dialog class="sheet-dialog" id="sheetDialog" aria-labelledby="sheetDialogTitle">
        <div class="sheet-dialog-surface">
          <header class="sheet-dialog-bar">
            <div>
              <p class="eyebrow" id="sheetDialogEyebrow">Fabrication preview</p>
              <h2 id="sheetDialogTitle">Layout</h2>
            </div>
            <button class="ghost-button" type="button" data-action="close-preview-dialog">Close</button>
          </header>
          <div class="sheet-dialog-preview" id="sheetDialogPreview"></div>
        </div>
      </dialog>

      <nav class="mobile-action-bar" aria-label="Export actions">
        <button class="ghost-button" type="button" data-action="copy-url">Copy URL</button>
        <button class="primary-button" type="button" data-action="export-drawing" data-export-primary>Export Drawing</button>
      </nav>
    </main>
  `;

  app.addEventListener("input", handleInput);
  app.addEventListener("change", handleInput);
  app.addEventListener("click", handleClick);
  requireElement(app.querySelector<HTMLDialogElement>("#sheetDialog"), "Sheet dialog not found").addEventListener(
    "close",
    destroyDialogPrintSheetPreview,
  );
}

function syncControls(): void {
  syncSettingsControls(app);
  syncFilterPresetUi();
  syncDonutFilterPresetUi();
  syncFanPresetUi();
  syncPrintDesignUi();
  syncExportControls(createLayout(settings));
  syncControlTabs();
}

function syncSettingsControls(root: ParentNode): void {
  for (const [key, value] of Object.entries(settings)) {
    const controls = root.querySelectorAll(`[name="${key}"]`);
    for (const control of controls) {
      if (control instanceof HTMLInputElement) {
        if (control.type === "checkbox") {
          control.checked = Boolean(value);
        } else if (control.type === "radio") {
          control.checked = control.value === String(value);
        } else {
          control.value = String(value);
        }
      } else if (control instanceof HTMLSelectElement) {
        control.value = String(value);
      }
    }
  }
}

function renderPreview(): void {
  settings = normalizeRawSettings(settings);
  syncWorkbenchState();
  if (previewMode === "print-sheets" && !canUsePrintSheetPreview()) {
    applyWorkbenchState(withPreviewMode(workbenchState, "enclosure"));
  }
  const layout = createLayout(settings);
  const stage = requireElement(app.querySelector("#previewStage"), "Preview stage not found");
  const summary = requireElement(app.querySelector("#summaryGrid"), "Summary grid not found");

  if (previewMode === "enclosure") {
    destroyPrintSheetPreview();
    stage.classList.add("is-three-preview");
    stage.classList.remove("is-sheet-preview", "is-print-sheet-three-preview");
    let host = stage.querySelector<HTMLElement>(".three-preview-host");
    if (host === null) {
      stage.innerHTML = `
        ${previewViewControlsHtml()}
        <div class="three-preview-host" aria-label="Interactive 3D enclosure preview"></div>
      `;
      host = requireElement(stage.querySelector<HTMLElement>(".three-preview-host"), "Three preview host not found");
    }
    if (threePreview === null) {
      threePreview = new PurifierThreePreview(host);
    }
    syncPreviewViewControls(stage);
    threePreview.update(layout, activeAssemblyPrintSeamPlan(layout));
  } else if (previewMode === "print-sheets") {
    destroyThreePreview();
    stage.classList.remove("is-three-preview", "is-sheet-preview");
    stage.classList.add("is-print-sheet-three-preview");
    let host = stage.querySelector<HTMLElement>(".print-sheet-three-host");
    if (host === null) {
      stage.innerHTML = `
        ${printSheetViewControlsHtml()}
        <div class="print-sheet-three-host" aria-label="3D print plate preview"></div>
      `;
      host = requireElement(stage.querySelector<HTMLElement>(".print-sheet-three-host"), "Print sheet preview host not found");
    }
    if (printSheetPreview === null) {
      printSheetPreview = new PrintSheetThreePreview(host);
    }
    syncPrintSheetViewControls(stage);
    printSheetPreview.update(createActivePrintSheetPlan(layout), printSheetPreviewSettings());
  } else {
    destroyThreePreview();
    destroyPrintSheetPreview();
    stage.classList.remove("is-three-preview");
    stage.classList.remove("is-print-sheet-three-preview");
    stage.classList.add("is-sheet-preview");
    stage.innerHTML = `<div class="sheet-preview laser-sheet-preview">${createLaserSvg(layout)}</div>`;
  }

  summary.innerHTML = previewSummaryHtml(layout);

  syncPreviewModeButtons();
  syncPreviewLargeViewButton();
  syncOpenSheetDialog(layout);
  syncExportDiagnostics(layout);
  syncExportControls(layout);
}

function handleInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (event.type === "input" && target instanceof HTMLInputElement && target.type === "number") {
    return;
  }

  if (target.name === "fabricationMethod") {
    applyFabricationMethod(readExportFormat(target.value));
    syncUrl();
    renderPreview();
    return;
  }

  if (target.name === "printVolume") {
    applyWorkbenchState(withPrintVolumePreset(workbenchState, findPrintVolumePreset(target.value).id));
    syncExportControls(createLayout(settings));
    syncUrl();
    renderPreview();
    return;
  }

  if (target.name === "printDesign") {
    applyPrintDesignSelection(readPrintDesignControlValue(target));
    return;
  }

  const name = target.name as FieldName;
  if (!(name in settings)) {
    return;
  }

  if (name === "filterPreset") {
    settings = applyFilterPreset(settings, readFilterPresetControlValue(target));
  } else if (name === "donutFilterPreset") {
    settings = applyDonutFilterPreset(settings, readDonutFilterPresetControlValue(target));
  } else if (name === "fanPreset") {
    settings = applyFanProductPreset(settings, readFanProductPresetControlValue(target));
  } else if (name === "corsiMode") {
    const corsiMode = readCorsiModeControlValue(target);
    settings = {
      ...settings,
      corsiMode,
      corsiFilterCount: defaultCorsiRosenthalFilterCount(corsiMode),
    };
  } else {
    settings = {
      ...settings,
      [name]: readControlValue(target, name),
    };
    if (isFilterDimensionName(name)) {
      settings = {
        ...settings,
        filterPreset: customFilterPresetId,
      };
    }
    if (isDonutFilterSettingName(name)) {
      settings = {
        ...settings,
        donutFilterPreset: customDonutFilterPresetId,
      };
    }
    if (name === "fanDiameter") {
      settings = {
        ...settings,
        fanPreset: customFanProductPresetId,
      };
    }
  }

  settings = normalizeRawSettings(settings);
  printDesignSettingsMemory = rememberPrintDesignSettings(printDesignSettingsMemory, settings);
  syncControls();
  syncUrl();
  renderPreview();
}

function handleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.id === "sheetDialog") {
    closeSheetDialog();
    return;
  }

  const mode = target.closest("[data-mode]");
  if (mode instanceof HTMLElement) {
    applyWorkbenchState(withPreviewMode(workbenchState, readPreviewMode(mode.getAttribute("data-mode"))));
    syncUrl();
    renderPreview();
    return;
  }

  const tab = target.closest("[data-controls-tab]");
  if (tab instanceof HTMLElement) {
    applyWorkbenchState(withControlsTab(workbenchState, readControlsTab(tab.getAttribute("data-controls-tab"))));
    syncControlTabs();
    syncUrl();
    return;
  }

  const action = target.closest("[data-action]");
  if (!(action instanceof HTMLElement)) {
    return;
  }

  const actionName = action.getAttribute("data-action");
  if (actionName === "export-drawing") {
    exportDrawing(action);
    return;
  }

  if (actionName === "copy-url") {
    void copyUrl(action);
    return;
  }

  if (actionName === "maximize-preview") {
    openSheetDialog();
    return;
  }

  if (actionName === "close-preview-dialog") {
    closeSheetDialog();
    return;
  }

  if (actionName === "toggle-rotation") {
    settings = {
      ...settings,
      autoRotate: !settings.autoRotate,
    };
    printDesignSettingsMemory = rememberPrintDesignSettings(printDesignSettingsMemory, settings);
    syncPreviewViewControls(app);
    threePreview?.setAutoRotate(settings.autoRotate);
    syncUrl();
    return;
  }
}

function readControlValue(
  target: HTMLInputElement | HTMLSelectElement,
  name: FieldName,
): RawPurifierSettings[FieldName] {
  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    return target.checked;
  }

  if (name === "fanDiameter") {
    const parsed = Number(target.value);
    const fanDiameter = fanDiameters.find((diameter) => diameter === parsed);
    return fanDiameter ?? defaultSettings.fanDiameter;
  }

  if (name === "filters") {
    return target.value === "1" ? 1 : 2;
  }

  if (name === "cameraPreset") {
    const preset = cameraPresets.find((entry) => entry === target.value);
    return preset ?? defaultSettings.cameraPreset;
  }

  if (name === "corsiMode") {
    return readCorsiModeControlValue(target);
  }

  if (typeof settings[name] === "number") {
    if (target.value.trim() === "") {
      return settings[name];
    }
    const parsed = Number(target.value);
    return Number.isFinite(parsed) ? parsed : settings[name];
  }

  throw new Error(`readControlValue: Unsupported control ${name}`);
}

function readPreviewMode(value: string | null): PreviewMode {
  if (value === "cut-sheet" || value === "print-sheets") {
    return value;
  }
  return "enclosure";
}

function readFilterPresetControlValue(target: HTMLInputElement | HTMLSelectElement): FilterPresetId {
  const preset = filterPresets.find((entry) => entry.id === target.value);
  return preset?.id ?? defaultSettings.filterPreset;
}

function readDonutFilterPresetControlValue(target: HTMLInputElement | HTMLSelectElement): DonutFilterPresetId {
  return findDonutFilterPreset(target.value).id;
}

function readFanProductPresetControlValue(target: HTMLInputElement | HTMLSelectElement): FanProductPresetId {
  const preset = fanProductPresets.find((entry) => entry.id === target.value);
  return preset?.id ?? defaultSettings.fanPreset;
}

function readPrintDesignControlValue(target: HTMLInputElement | HTMLSelectElement): PrintDesignId {
  const preset = publicPrintDesignPresets.find((entry) => entry.id === target.value);
  return preset?.id ?? defaultSettings.printDesign;
}

function readCorsiModeControlValue(target: HTMLInputElement | HTMLSelectElement): CorsiRosenthalMode {
  const mode = corsiRosenthalModes.find((entry) => entry === target.value);
  return mode ?? defaultSettings.corsiMode;
}

function applyWorkbenchState(nextState: WorkbenchState): void {
  workbenchState = nextState;
  syncWorkbenchState();
}

function applyFabricationMethod(nextMethod: FabricationMethod): void {
  applyWorkbenchState(withFabricationMethod(workbenchState, nextMethod));
  if (nextMethod === "laser-svg" && settings.printDesign !== "nukit-open-air") {
    const switched = switchPrintDesignSettings(printDesignSettingsMemory, settings, "nukit-open-air");
    settings = switched.settings;
    printDesignSettingsMemory = switched.memory;
  }
  syncControls();
}

function applyPrintDesignSelection(printDesign: PrintDesignId): void {
  const switched = switchPrintDesignSettings(printDesignSettingsMemory, settings, publicPrintDesignId(printDesign));
  settings = normalizeRawSettings(switched.settings);
  printDesignSettingsMemory = switched.memory;
  if (previewMode === "print-sheets" && !canUsePrintSheetPreview()) {
    applyWorkbenchState(withPreviewMode(workbenchState, "enclosure"));
  }
  if (isStaticReferencePrintDesignActive() && !activeStaticReferenceHasPlatePreview() && controlsTab === "setup") {
    applyWorkbenchState(withControlsTab(workbenchState, "design"));
  }
  syncControls();
  syncUrl();
  renderPreview();
}

function normalizePublicPrintDesignSettings(input: RawPurifierSettings): RawPurifierSettings {
  if (isPublicPrintDesignId(input.printDesign)) {
    return input;
  }
  return applyPrintDesignPreset(defaultSettings, defaultSettings.printDesign);
}

function publicPrintDesignId(printDesign: PrintDesignId): PrintDesignId {
  return isPublicPrintDesignId(printDesign) ? printDesign : defaultSettings.printDesign;
}

function isStaticReferencePrintDesignActive(): boolean {
  return fabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(settings.printDesign);
}

function activeStaticReferenceHasPlatePreview(): boolean {
  return (
    isStaticReferencePrintDesignActive() &&
    staticPrintReferenceHasPlatePreview(staticPrintReferenceForPreset(findPrintDesignPreset(settings.printDesign)))
  );
}

function canUsePrintSheetPreview(): boolean {
  return fabricationMethod === "print-3mf" && (!isStaticReferencePrintDesignActive() || activeStaticReferenceHasPlatePreview());
}

function syncWorkbenchState(): void {
  previewMode = previewModeForWorkbenchState(workbenchState);
  controlsTab = workbenchState.controlsTab;
  fabricationMethod = fabricationMethodForWorkbenchState(workbenchState);
  printVolumePresetId = printVolumePresetIdForWorkbenchState(workbenchState);
}

function isFilterDimensionName(name: FieldName): name is "filterWidth" | "filterDepth" | "filterThickness" {
  return name === "filterWidth" || name === "filterDepth" || name === "filterThickness";
}

function isDonutFilterSettingName(name: FieldName): boolean {
  return (
    name === "donutFilterOuterDiameter" ||
    name === "donutFilterLength" ||
    name === "donutFilterHoleDiameter" ||
    name === "donutAdapterInsertLength" ||
    name === "donutCapRim" ||
    name === "donutCapEnabled"
  );
}

function syncControlTabs(): void {
  if (isStaticReferencePrintDesignActive() && !activeStaticReferenceHasPlatePreview() && controlsTab === "setup") {
    applyWorkbenchState(withControlsTab(workbenchState, "design"));
  }

  for (const tab of app.querySelectorAll<HTMLElement>("[data-controls-tab]")) {
    const tabName = readControlsTab(tab.getAttribute("data-controls-tab"));
    tab.hidden = tabName === "setup" && isStaticReferencePrintDesignActive() && !activeStaticReferenceHasPlatePreview();
    const isActive = tab.getAttribute("data-controls-tab") === controlsTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of app.querySelectorAll<HTMLElement>("[data-controls-panel]")) {
    panel.hidden = panel.getAttribute("data-controls-panel") !== controlsTab;
  }
}

function syncPreviewModeButtons(): void {
  for (const button of app.querySelectorAll<HTMLElement>("[data-mode]")) {
    const mode = button.getAttribute("data-mode");
    button.classList.toggle("is-active", mode === previewMode);
    const methodPreview = button.dataset.methodPreview;
    button.hidden =
      (methodPreview !== undefined && methodPreview !== fabricationMethod) ||
      (mode === "print-sheets" && !canUsePrintSheetPreview());
  }
}

function syncPreviewLargeViewButton(): void {
  const button = app.querySelector<HTMLButtonElement>('[data-action="maximize-preview"]');
  if (button === null) {
    return;
  }
  const isAvailable = previewMode !== "enclosure";
  button.disabled = !isAvailable;
  button.setAttribute("aria-hidden", String(!isAvailable));
  button.tabIndex = isAvailable ? 0 : -1;
}

function syncPreviewViewControls(root: ParentNode = app): void {
  syncSettingsControls(root);
  const isCorsi = isCorsiRosenthalPrintDesignId(settings.printDesign);
  const isStaticReference = isStaticReferencePrintDesignActive();
  setPreviewToggleVisible(root, "explodedView", !isCorsi);
  setPreviewToggleVisible(root, "showDimensions", !isCorsi);
  setPreviewToggleVisible(root, "showPrintSeams", fabricationMethod === "print-3mf" && !isCorsi && !isStaticReference);
  const rotationButton = root.querySelector<HTMLElement>('[data-action="toggle-rotation"]');
  if (rotationButton === null) {
    return;
  }
  rotationButton.innerHTML = rotationButtonContentHtml(settings.autoRotate);
  rotationButton.setAttribute("aria-pressed", String(settings.autoRotate));
  rotationButton.setAttribute("aria-label", settings.autoRotate ? "Pause auto rotate" : "Start auto rotate");
  rotationButton.setAttribute("data-tooltip", settings.autoRotate ? "Pause rotation" : "Rotate");
  rotationButton.title = settings.autoRotate ? "Pause rotation" : "Rotate";
}

function syncPrintSheetViewControls(root: ParentNode = app): void {
  syncSettingsControls(root);
}

function setPreviewToggleVisible(root: ParentNode, name: FieldName, visible: boolean): void {
  const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
  const label = input?.closest<HTMLElement>("label");
  if (input !== null && label !== null && label !== undefined) {
    label.hidden = !visible;
    input.disabled = !visible;
  }
}

function syncFilterPresetUi(): void {
  const preset = findFilterPreset(settings.filterPreset);
  const detail = app.querySelector<HTMLElement>("#filterPresetDetail");
  if (detail !== null) {
    const layout = createLayout(settings);
    const totalFans = configuredFanCount(layout);
    const dimensions = `${formatMillimeters(settings.filterWidth)} x ${formatMillimeters(settings.filterDepth)} x ${formatMillimeters(settings.filterThickness)}`;
    const examples = formatExamples(preset.examples);
    detail.innerHTML = `
      <strong>${escapeHtml(dimensions)}</strong>
      <span>${escapeHtml(`${preset.detail}${examples} · ${preset.nominalSize} · ${totalFans} fans`)}</span>
    `;
  }

  const customDimensions = app.querySelector<HTMLElement>("[data-custom-filter-dimensions]");
  if (customDimensions === null) {
    return;
  }

  const isCustom = settings.filterPreset === customFilterPresetId;
  customDimensions.hidden = !isCustom;
  for (const control of customDimensions.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
    control.disabled = !isCustom;
  }
}

function syncDonutFilterPresetUi(): void {
  const preset = findDonutFilterPreset(settings.donutFilterPreset);
  const detail = app.querySelector<HTMLElement>("#donutFilterPresetDetail");
  if (detail !== null) {
    const sourceLink =
      preset.sourceUrl === undefined
        ? ""
        : ` <a href="${escapeHtml(preset.sourceUrl)}" target="_blank" rel="noreferrer">Source</a>`;
    detail.innerHTML = `
      <strong>${escapeHtml(
        `${formatMillimeters(settings.donutFilterOuterDiameter)} dia x ${formatMillimeters(settings.donutFilterLength)} · ${formatMillimeters(settings.donutFilterHoleDiameter)} hole`,
      )}</strong>
      <span>${escapeHtml(`${preset.detail} · ${preset.measurementNote}`)}</span>
      <small>${escapeHtml(preset.source)}${sourceLink}</small>
    `;
  }
}

function formatExamples(examples: readonly string[]): string {
  return examples.length > 0 ? ` (${examples.join(", ")})` : "";
}

function syncFanPresetUi(): void {
  const layout = createLayout(settings);
  const product = findFanProductPreset(settings.fanPreset);
  const totalFans = configuredFanCount(layout);
  const detail = app.querySelector<HTMLElement>("#fanPresetDetail");
  if (detail !== null) {
    const sourceLink =
      product.productUrl === undefined
        ? ""
        : ` <a href="${escapeHtml(product.productUrl)}" target="_blank" rel="noreferrer">Source</a>`;
    detail.innerHTML = `
      <div class="fan-card-header">
        <div>
          <strong>${escapeHtml(product.label)}</strong>
          <span>${escapeHtml(`${totalFans} x ${layout.configuration.fan.spec.diameter} mm · ${product.detail} · ${product.powerNote}`)}</span>
        </div>
        <div class="fan-color-swatches" aria-label="Fan colors">
          <span style="--swatch-color: #${hexColor(product.appearance.frameColor)}"></span>
          <span style="--swatch-color: #${hexColor(product.appearance.bladeColor)}"></span>
          <span style="--swatch-color: #${hexColor(product.appearance.hubColor)}"></span>
        </div>
      </div>
      <small>${escapeHtml(product.source)}${sourceLink}</small>
    `;
  }

  const customFanSize = app.querySelector<HTMLElement>("[data-custom-fan-size]");
  if (customFanSize === null) {
    return;
  }

  const isCustom = settings.fanPreset === customFanProductPresetId;
  customFanSize.hidden = !isCustom;
  for (const control of customFanSize.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
    control.disabled = !isCustom;
  }
}

function syncPrintDesignUi(): void {
  const preset = findPrintDesignPreset(settings.printDesign);
  const detail = app.querySelector<HTMLElement>("#printDesignDetail");
  if (detail === null) {
    return;
  }
  const designSelect = app.querySelector<HTMLSelectElement>('[name="printDesign"]');
  if (designSelect !== null) {
    designSelect.value = settings.printDesign;
  }

  const sourceLink =
    preset.sourceUrl === undefined
      ? ""
      : ` <a href="${escapeHtml(preset.sourceUrl)}" target="_blank" rel="noreferrer">Source</a>`;
  const reference = staticPrintReferenceForPreset(preset);
  const referenceMeta =
    reference === undefined
      ? ""
      : `<span>${escapeHtml(`${reference.fileSummary} · ${reference.attribution}`)}</span>
         <small>${escapeHtml(reference.usePolicy.note)}</small>`;
  detail.innerHTML = `
    <strong>${escapeHtml(preset.detail)}</strong>
    ${referenceMeta}
    <small>${escapeHtml(preset.source)}${sourceLink}</small>
  `;
}

function hexColor(color: number): string {
  return color.toString(16).padStart(6, "0");
}

function syncExportDiagnostics(layout: ReturnType<typeof createLayout>): void {
  const diagnostics = evaluateActiveExportDiagnostics(layout);
  const readiness = summarizeActiveBuildReadiness(layout, diagnostics);
  const summaryContainer = app.querySelector<HTMLElement>("#exportReadinessSummary");
  if (summaryContainer !== null) {
    summaryContainer.innerHTML = diagnosticItem(readiness);
  }
}

function syncExportControls(layout: ReturnType<typeof createLayout>): void {
  const isStaticReference = isStaticReferencePrintDesignActive();
  const canSelectPrintVolume = fabricationMethod === "print-3mf" && (!isStaticReference || activeStaticReferenceHasPlatePreview());
  for (const control of app.querySelectorAll<HTMLInputElement>('[name="fabricationMethod"]')) {
    control.checked = control.value === fabricationMethod;
  }

  syncFabricationSetupLabels();

  const printVolumeControl = app.querySelector<HTMLElement>("[data-print-volume-control]");
  if (printVolumeControl !== null) {
    printVolumeControl.hidden = !canSelectPrintVolume;
  }

  const printVolumeSection = app.querySelector<HTMLElement>("[data-print-volume-section]");
  if (printVolumeSection !== null) {
    printVolumeSection.hidden = !canSelectPrintVolume;
  }

  const printDesignControl = app.querySelector<HTMLElement>("[data-print-design-control]");
  if (printDesignControl !== null) {
    printDesignControl.hidden = fabricationMethod !== "print-3mf";
    for (const control of printDesignControl.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
      control.disabled = fabricationMethod !== "print-3mf";
    }
  }

  const laserOutputControls = app.querySelector<HTMLElement>("[data-laser-output-controls]");
  if (laserOutputControls !== null) {
    laserOutputControls.hidden = fabricationMethod !== "laser-svg";
    for (const control of laserOutputControls.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
      control.disabled = fabricationMethod !== "laser-svg";
    }
  }

  const volumeSelect = app.querySelector<HTMLSelectElement>('[name="printVolume"]');
  if (volumeSelect !== null) {
    volumeSelect.value = printVolumePresetId;
    volumeSelect.disabled = !canSelectPrintVolume;
  }

  const designSelect = app.querySelector<HTMLSelectElement>('[name="printDesign"]');
  if (designSelect !== null) {
    designSelect.value = settings.printDesign;
    designSelect.disabled = fabricationMethod !== "print-3mf";
  }

  syncDesignSpecificControls(layout);
  const purchaseList = app.querySelector<HTMLElement>("#purchaseList");
  if (purchaseList !== null) {
    purchaseList.innerHTML = purchaseListHtml(layout);
  }

  for (const button of app.querySelectorAll<HTMLElement>("[data-export-primary]")) {
    setButtonLabel(button, exportActionLabel());
  }
}

function syncFabricationSetupLabels(): void {
  const setupTab = app.querySelector<HTMLElement>("#setup-controls-tab");
  if (setupTab !== null) {
    setupTab.textContent = fabricationMethod === "print-3mf" ? "Print setup" : "Laser setup";
  }
}

function syncDesignSpecificControls(layout: ReturnType<typeof createLayout>): void {
  const useCorsiControls = fabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(settings.printDesign);
  const useDonutControls = fabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(settings.printDesign);
  const useStaticReference = isStaticReferencePrintDesignActive();
  const useNukitControls = !useCorsiControls && !useDonutControls && !useStaticReference;
  setControlGroupVisible("[data-generated-layout-controls]", !useStaticReference);
  setControlGroupVisible("[data-generated-part-controls]", !useStaticReference);
  setControlGroupVisible("[data-generated-geometry-controls]", !useStaticReference);
  setControlGroupVisible("[data-rectangular-filter-controls]", !useDonutControls && !useStaticReference);
  setControlGroupVisible("[data-donut-filter-controls]", useDonutControls);
  setControlGroupVisible("[data-nukit-fan-placement]", useNukitControls);
  setControlGroupVisible("[data-corsi-layout]", useCorsiControls);
  setControlGroupVisible("[data-donut-layout]", useDonutControls);
  setControlGroupVisible("[data-nukit-filter-count]", useNukitControls);
  setControlGroupVisible("[data-nukit-panel-fit-controls]", useNukitControls);
  setControlGroupVisible("[data-nukit-print-split-control]", fabricationMethod === "print-3mf" && useNukitControls);
  const layoutSectionTitle = app.querySelector<HTMLElement>("#layoutSectionTitle");
  if (layoutSectionTitle !== null) {
    layoutSectionTitle.textContent = useCorsiControls
      ? "Corsi layout"
      : useDonutControls
        ? "Adaptor"
        : useStaticReference
          ? "Source files"
          : "Fan placement";
  }
  const partsSectionTitle = app.querySelector<HTMLElement>("#partsSectionTitle");
  if (partsSectionTitle !== null) {
    partsSectionTitle.textContent = useStaticReference ? "Source and license" : "Filter and fan";
  }
  if (useCorsiControls) {
    syncCorsiLayoutControls(layout);
  }
}

function syncCorsiLayoutControls(layout: ReturnType<typeof createLayout>): void {
  const corsiLayout = resolveCorsiRosenthalLayout(layout);
  const range = corsiRosenthalFilterCountRange(settings.corsiMode);
  const filterCountControl = app.querySelector<HTMLSelectElement>('[name="corsiFilterCount"]');
  if (filterCountControl !== null) {
    for (const option of filterCountControl.options) {
      option.disabled = Number(option.value) > range.max;
    }
    filterCountControl.value = String(settings.corsiFilterCount);
  }

  const fanControl = app.querySelector<HTMLSelectElement>('[name="corsiFanCount"]');
  const fanLabel = fanControl?.closest("label")?.querySelector("span");
  if (fanLabel !== null && fanLabel !== undefined) {
    fanLabel.textContent = settings.corsiMode === "side-exhaust" ? "Side fans" : "Top fans";
  }
  if (fanControl !== null) {
    const allowedFanCounts = new Set(corsiRosenthalFanCountOptions(settings.corsiMode).map(String));
    for (const option of fanControl.options) {
      const fanCount = Number(option.value);
      const isAllowed = allowedFanCounts.has(option.value);
      const fitsLayout = isAllowed && corsiFanCountFitsLayout(layout, corsiLayout.mode, fanCount);
      const isAvailable = isAllowed && fitsLayout;
      option.disabled = !isAvailable;
      option.textContent = isAllowed ? corsiFanCountOptionLabel(fanCount, fitsLayout) : fanCountOptionLabel(fanCount);
      option.title = corsiFanCountOptionTitle(isAvailable, isAllowed);
    }
    fanControl.value = String(settings.corsiFanCount);
  }

  const topologySummary = app.querySelector<HTMLElement>("#corsiTopologySummary");
  if (topologySummary !== null) {
    topologySummary.innerHTML = corsiTopologySummaryHtml(layout);
  }
}

function setControlGroupVisible(selector: string, visible: boolean): void {
  const group = app.querySelector<HTMLElement>(selector);
  if (group === null) {
    return;
  }
  group.hidden = !visible;
  for (const control of group.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
    control.disabled = !visible;
  }
}

function exportActionsHtml(extraClassName = ""): string {
  const className = ["export-action-menu", extraClassName].filter(Boolean).join(" ");
  return `<div class="${className}" data-export-action-menu>
    <button
      class="primary-button export-primary-button"
      type="button"
      data-action="export-drawing"
      data-export-primary
    >Export Drawing</button>
  </div>`;
}

type PurchaseListItem = {
  readonly category: string;
  readonly label: string;
  readonly detail: string;
  readonly url?: string;
};

function purchaseListHtml(layout: ReturnType<typeof createLayout>): string {
  const items = purchaseListItems(layout);
  return `
    <div class="purchase-list-heading">
      <strong>Purchase list</strong>
      <span>${escapeHtml(fabricationMethod === "print-3mf" ? "Buy parts" : "Cut and build")}</span>
    </div>
    <ul>
      ${items
        .map(
          (item) => `<li class="purchase-list-row">
            <div>
              <small>${escapeHtml(item.category)}</small>
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </div>
            ${purchaseItemAction(item)}
          </li>`,
        )
        .join("")}
    </ul>
  `;
}

function purchaseListItems(layout: ReturnType<typeof createLayout>): readonly PurchaseListItem[] {
  if (fabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(layout.configuration.printDesign);
    if (reference === undefined) {
      return [];
    }
    const fanProduct = findFanProductPreset(settings.fanPreset);
    const fanCount = layout.configuration.printDesign.recommendedFanCount;
    const filterPreset = findFilterPreset(settings.filterPreset);
    const filterCount = layout.configuration.printDesign.recommendedFilterCount;
    return [
      {
        category: "Source files",
        label: layout.configuration.printDesign.label,
        detail: reference.fileSummary,
        url: staticReferenceFilesUrl(layout),
      },
      ...staticPrintEstimatePurchaseItems(reference.printEstimate),
      {
        category: "Filters",
        label: `${filterCount} x ${filterPreset.label}`,
        detail: `${formatMillimeters(settings.filterWidth)} x ${formatMillimeters(settings.filterDepth)} x ${formatMillimeters(settings.filterThickness)} each`,
        url: webSearchUrl(`${filterPreset.label} air filter`),
      },
      {
        category: "Fans",
        label: `${fanCount} x ${layout.configuration.fan.spec.diameter} mm`,
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
        label: layout.configuration.printDesign.license,
        detail: reference.usePolicy.note,
        url: layout.configuration.printDesign.licenseUrl,
      },
    ];
  }

  const fanProduct = findFanProductPreset(settings.fanPreset);
  const fanCount = configuredFanCount(layout);
  const baseItems: PurchaseListItem[] = [
    {
      category: "Fans",
      label: `${fanCount} x ${layout.configuration.fan.spec.diameter} mm`,
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

  if (fabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(layout.configuration.printDesign.id)) {
    const preset = findDonutFilterPreset(settings.donutFilterPreset);
    return [
      {
        category: "Filter",
        label: "Round HEPA filter",
        detail: `${formatMillimeters(settings.donutFilterOuterDiameter)} dia x ${formatMillimeters(settings.donutFilterLength)}`,
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

  const filterPreset = findFilterPreset(settings.filterPreset);
  const isCorsi = fabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id);
  const corsiFilterCount = isCorsi ? resolveCorsiRosenthalLayout(layout).filterCount : null;
  return [
    {
      category: "Filter",
      label: corsiFilterCount === null ? filterPreset.label : `${corsiFilterCount} x ${filterPreset.label}`,
      detail: `${formatMillimeters(settings.filterWidth)} x ${formatMillimeters(settings.filterDepth)} x ${formatMillimeters(settings.filterThickness)}${corsiFilterCount === null ? "" : " each"}`,
      url: webSearchUrl(`${filterPreset.label} air filter`),
    },
    ...baseItems,
  ];
}

function purchaseItemAction(item: PurchaseListItem): string {
  if (item.url === undefined) {
    return "";
  }
  return `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Find</a>`;
}

function webSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `https://www.google.com/search?${params.toString()}`;
}

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

function staticReferenceFilesUrl(layout: ReturnType<typeof createLayout>): string {
  const sourceUrl =
    staticPrintReferenceForPreset(layout.configuration.printDesign)?.sourceUrl ?? layout.configuration.printDesign.sourceUrl;
  if (sourceUrl === undefined) {
    return "https://www.printables.com/";
  }
  return sourceUrl.endsWith("/files") ? sourceUrl : `${sourceUrl}/files`;
}

function corsiTopologySummaryHtml(layout: ReturnType<typeof createLayout>): string {
  const model = createCorsiRosenthalModel(layout);

  return corsiFaceSides
    .map((side) => {
      const assignment = model.faceRoles.find((role) => role.side === side);
      const role = assignment?.role ?? "sealed";
      const fanCount = assignment?.fanCount ?? 0;
      const faceLabel = corsiFaceLabel(side);
      const roleLabel = corsiFaceRoleLabel(role, fanCount);
      return `<span class="corsi-face-role is-${role}" title="${escapeHtml(`${faceLabel} face: ${roleLabel}`)}">
        <small>${escapeHtml(faceLabel)}</small>
        <strong>${escapeHtml(roleLabel)}</strong>
      </span>`;
    })
    .join("");
}

function corsiFanCountFitsLayout(
  layout: ReturnType<typeof createLayout>,
  mode: CorsiRosenthalMode,
  fanCount: number,
): boolean {
  if (fanCount === automaticFanCount) {
    return true;
  }
  if (!Number.isFinite(fanCount) || fanCount <= 0 || (mode === "side-exhaust" && fanCount % 2 !== 0)) {
    return false;
  }

  return corsiFanCountFits({
    mode,
    fanCount,
    filterDimensions: filterSelectionDimensions(layout.configuration.filter),
    fanDiameter: layout.configuration.fan.spec.diameter,
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

function corsiFaceRoleLabel(role: CorsiFaceRole, fanCount: number): string {
  if (role === "fan") {
    return `${fanCount} fan${fanCount === 1 ? "" : "s"}`;
  }
  return role === "filter" ? "Filter" : "Sealed";
}

function diagnosticItem(diagnostic: BuildDiagnostic): string {
  return `<div class="diagnostic-item ${diagnostic.severity}">
    <strong>${escapeHtml(diagnostic.title)}</strong>
    <span>${escapeHtml(diagnostic.detail)}</span>
  </div>`;
}

function exportDrawing(action: HTMLElement | null = null): void {
  const layout = createLayout(settings);
  const diagnostics = evaluateActiveExportDiagnostics(layout);
  syncExportDiagnostics(layout);
  if (diagnostics.length > 0) {
    flashDownloadButtons("Review checks");
    return;
  }

  if (fabricationMethod === "print-3mf") {
    const successLabel = exportPrintKit(layout);
    if (action !== null) {
      showTransientButtonLabel(action, successLabel, 1400);
    }
    return;
  }

  exportSvgDrawing(layout);
  if (action !== null) {
    showTransientButtonLabel(action, "Exported SVG", 1400);
  }
}

function evaluateActiveExportDiagnostics(layout: ReturnType<typeof createLayout>): BuildDiagnostic[] {
  if (fabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    return [];
  }

  const usesGeneratedPrintKit =
    fabricationMethod === "print-3mf" &&
    (isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id) ||
      isDonutFilterPrintDesignId(layout.configuration.printDesign.id));
  const baseDiagnostics =
    usesGeneratedPrintKit
      ? evaluateBuildDiagnostics(layout).filter(
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
      : evaluateBuildDiagnostics(layout);

  if (fabricationMethod !== "print-3mf") {
    return baseDiagnostics;
  }

  const kit = createPrintDesignKit(layout, printVolumePresetId);
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
  layout: ReturnType<typeof createLayout>,
  diagnostics: readonly BuildDiagnostic[],
): BuildDiagnostic {
  if (diagnostics.length > 0) {
    return {
      id: "warnings",
      severity: "warning",
      title: `${diagnostics.length} export check${diagnostics.length === 1 ? "" : "s"}`,
      detail: "Review the fabrication checks before exporting.",
    };
  }
  if (fabricationMethod === "print-3mf") {
    if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
      const reference = staticPrintReferenceForPreset(layout.configuration.printDesign);
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
  return summarizeBuildReadiness(layout);
}

function exportSvgDrawing(layout: ReturnType<typeof createLayout>): void {
  const svg = createLaserSvg(layout);
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

function exportPrintKit(layout: ReturnType<typeof createLayout>): string {
  if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    window.open(staticReferenceFilesUrl(layout), "_blank", "noopener,noreferrer");
    return "Opened source files";
  }
  const printExport = createPrintDesignThreeMfExport(layout, printVolumePresetId);
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

function openSheetDialog(): void {
  const dialog = requireElement(
    app.querySelector<HTMLDialogElement>("#sheetDialog"),
    "Sheet dialog not found",
  );
  syncSheetDialog(createLayout(settings));
  if (!dialog.open) {
    dialog.showModal();
  }
}

function closeSheetDialog(): void {
  const dialog = requireElement(
    app.querySelector<HTMLDialogElement>("#sheetDialog"),
    "Sheet dialog not found",
  );
  dialog.close();
}

function syncOpenSheetDialog(layout: ReturnType<typeof createLayout>): void {
  const dialog = app.querySelector<HTMLDialogElement>("#sheetDialog");
  if (dialog?.open === true) {
    syncSheetDialog(layout);
  }
}

function syncSheetDialog(layout: ReturnType<typeof createLayout>): void {
  const preview = requireElement(
    app.querySelector<HTMLElement>("#sheetDialogPreview"),
    "Sheet dialog preview not found",
  );
  const eyebrow = requireElement(app.querySelector<HTMLElement>("#sheetDialogEyebrow"), "Sheet dialog eyebrow not found");
  const title = requireElement(app.querySelector<HTMLElement>("#sheetDialogTitle"), "Sheet dialog title not found");
  if (previewMode === "print-sheets") {
    eyebrow.textContent = "3D printing";
    title.textContent = "Print plates";
    let host = preview.querySelector<HTMLElement>(".print-sheet-dialog-host");
    if (host === null) {
      preview.innerHTML = `<div class="print-sheet-dialog-host" aria-label="3D print plate dialog preview"></div>`;
      host = requireElement(
        preview.querySelector<HTMLElement>(".print-sheet-dialog-host"),
        "Print sheet dialog host not found",
      );
    }
    if (dialogPrintSheetPreview === null) {
      dialogPrintSheetPreview = new PrintSheetThreePreview(host);
    }
    dialogPrintSheetPreview.update(createActivePrintSheetPlan(layout), printSheetPreviewSettings());
    return;
  }

  destroyDialogPrintSheetPreview();
  eyebrow.textContent = "Laser cutting";
  title.textContent = "Laser drawing";
  preview.innerHTML = createLaserSvg(layout);
}

function destroyThreePreview(): void {
  threePreview?.destroy();
  threePreview = null;
}

function destroyPrintSheetPreview(): void {
  printSheetPreview?.destroy();
  printSheetPreview = null;
}

function destroyDialogPrintSheetPreview(): void {
  dialogPrintSheetPreview?.destroy();
  dialogPrintSheetPreview = null;
}

function flashDownloadButtons(label: string): void {
  for (const button of app.querySelectorAll<HTMLElement>("[data-export-primary]")) {
    showTransientButtonLabel(button, label, 1400);
  }
}

async function copyUrl(action: HTMLElement): Promise<void> {
  const url = new URL(window.location.href);
  url.search = encodeShareState();
  try {
    await navigator.clipboard.writeText(url.toString());
    showTransientButtonLabel(action, "Copied", 1200);
  } catch (error) {
    console.warn("copyUrl: Clipboard write failed", error);
    showTransientButtonLabel(action, "Copy failed", 1600);
  }
}

function showTransientButtonLabel(button: HTMLElement, label: string, durationMs: number): void {
  const defaultLabel = button.dataset.defaultLabel ?? button.textContent ?? "";
  button.dataset.defaultLabel = defaultLabel;
  const previousTimer = transientLabelTimers.get(button);
  if (previousTimer !== undefined) {
    window.clearTimeout(previousTimer);
  }
  button.textContent = label;
  const nextTimer = window.setTimeout(() => {
    button.textContent = defaultLabel;
    transientLabelTimers.delete(button);
  }, durationMs);
  transientLabelTimers.set(button, nextTimer);
}

function setButtonLabel(button: HTMLElement, label: string): void {
  button.dataset.defaultLabel = label;
  button.textContent = label;
}

function syncUrl(): void {
  const url = new URL(window.location.href);
  url.search = encodeShareState();
  window.history.replaceState(null, "", url);
}

function encodeShareState(): string {
  const params = new URLSearchParams(encodeSettings(settings));
  for (const [key, value] of encodeWorkbenchState(workbenchState)) {
    params.set(key, value);
  }
  return params.toString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function numberField(name: FieldName, label: string, suffix: string, step: number): string {
  return `<label class="field">
    <span>${label}</span>
    <span class="input-shell">
      <input type="number" name="${name}" step="${step}" inputmode="decimal" />
      <small>${suffix}</small>
    </span>
  </label>`;
}

function selectField(name: FieldName, label: string, options: Array<[string, string]>): string {
  return `<label class="field">
    <span>${label}</span>
    <select name="${name}">
      ${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}
    </select>
  </label>`;
}

type SelectorInfoOptions = {
  readonly detailId: string;
  readonly detailClassName: string;
};

function selectFieldWithInfo(
  name: FieldName,
  label: string,
  options: Array<[string, string]>,
  info: SelectorInfoOptions,
): string {
  return `<div class="field-with-info">
    ${selectField(name, label, options)}
    <details class="selector-info">
      <summary aria-label="${escapeHtml(label)} details" title="${escapeHtml(label)} details">
        <span>Details</span>
      </summary>
      <div class="selector-info-panel">
        <div class="${info.detailClassName}" id="${info.detailId}"></div>
      </div>
    </details>
  </div>`;
}

function printDesignField(): string {
  return `<label class="field print-design-select">
      <span>Printable design</span>
      <select name="printDesign">
        ${printDesignOptionsHtml()}
      </select>
    </label>
    <div class="print-design-card" id="printDesignDetail"></div>`;
}

function printDesignOptionsHtml(): string {
  const parametricOptions = publicPrintDesignPresets.filter((preset) => !isStaticReferencePrintDesignId(preset.id));
  const staticOptions = publicPrintDesignPresets.filter((preset) => isStaticReferencePrintDesignId(preset.id));
  return [
    printDesignOptionGroup("Parametric generators", parametricOptions),
    printDesignOptionGroup("Curated static references", staticOptions),
  ]
    .filter((group) => group.length > 0)
    .join("");
}

function printDesignOptionGroup(label: string, presets: typeof publicPrintDesignPresets): string {
  if (presets.length === 0) {
    return "";
  }
  return `<optgroup label="${escapeHtml(label)}">
    ${presets.map((preset) => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</option>`).join("")}
  </optgroup>`;
}

function exportControlField(name: "printVolume", label: string, options: Array<[string, string]>): string {
  return `<label class="field">
    <span>${label}</span>
    <select name="${name}">
      ${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}
    </select>
  </label>`;
}

function fabricationMethodField(): string {
  return `<fieldset class="fabrication-method-field">
    <legend>Make with</legend>
    <div>
      ${fabricationMethods
        .map(
          (method) => `<label>
            <input type="radio" name="fabricationMethod" value="${method}" />
            <span>${fabricationMethodLabel(method)}</span>
          </label>`,
        )
        .join("")}
    </div>
  </fieldset>`;
}

function previewViewControlsHtml(): string {
  return `<div class="preview-view-controls" data-preview-view-controls>
    ${previewCameraField()}
    <div class="preview-toggle-strip" aria-label="Preview display options">
      ${previewToggleField("showFilterMedia", "Filters", "Filter")}
      ${previewToggleField("showFans", "Fans", "Fans")}
      ${previewToggleField("explodedView", "Exploded view", "Exploded view")}
      ${previewToggleField("showDimensions", "Show dimensions", "Dims")}
      ${previewToggleField("showBananaScale", "Scale reference", "Scale")}
      ${previewToggleField("showPrintSeams", "Print split lines", "Splits")}
    </div>
    <button class="preview-rotation-button" type="button" data-action="toggle-rotation" aria-pressed="${settings.autoRotate}" data-tooltip="${settings.autoRotate ? "Pause rotation" : "Rotate"}" title="${settings.autoRotate ? "Pause rotation" : "Rotate"}">
      ${rotationButtonContentHtml(settings.autoRotate)}
    </button>
  </div>`;
}

function printSheetViewControlsHtml(): string {
  return `<div class="preview-view-controls" data-preview-view-controls>
    <div class="preview-toggle-strip" aria-label="Print plate display options">
      ${previewToggleField("showPrintPlateLabels", "Show plate labels", "Labels")}
    </div>
  </div>`;
}

function printSheetPreviewSettings() {
  return {
    showPlateLabels: settings.showPrintPlateLabels,
  };
}

function activeAssemblyPrintSeamPlan(layout: ReturnType<typeof createLayout>) {
  if (
    fabricationMethod !== "print-3mf" ||
    !settings.showPrintSeams ||
    isStaticReferencePrintDesignId(layout.configuration.printDesign.id)
  ) {
    return null;
  }
  return createGeneratedPrintSheetPlan(layout);
}

function rotationButtonContentHtml(isAutoRotating: boolean): string {
  const icon = isAutoRotating
    ? `<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
      </svg>`
    : `<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M8 5v14l11-7z" />
      </svg>`;
  return `${icon}<span class="sr-only">${isAutoRotating ? "Pause auto rotate" : "Start auto rotate"}</span>`;
}

function previewCameraField(): string {
  return `<label class="preview-camera-field" title="Camera view">
    <span class="sr-only">Camera</span>
    <span class="preview-camera-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M8.2 6.4 9.8 4h4.4l1.6 2.4H19c1.1 0 2 .9 2 2v8.3c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V8.4c0-1.1.9-2 2-2h3.2Zm3.8 9.2a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Zm0-1.6a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z" />
      </svg>
    </span>
    <select name="cameraPreset" aria-label="Camera view">
      ${cameraPresets.map((preset) => `<option value="${preset}">${previewCameraPresetLabel(preset)}</option>`).join("")}
    </select>
  </label>`;
}

function previewToggleField(name: FieldName, title: string, label: string): string {
  return `<label class="toggle-field preview-toggle-field" title="${escapeHtml(title)}">
    <input type="checkbox" name="${name}" />
    <span>${escapeHtml(label)}</span>
  </label>`;
}

function previewCameraPresetLabel(preset: RawPurifierSettings["cameraPreset"]): string {
  return preset === "official" ? "Official" : cameraPresetLabel(preset);
}

function segmentedField(name: FieldName, label: string, options: Array<[string, string]>): string {
  return `<fieldset class="segmented-field">
    <legend>${label}</legend>
    <div>
      ${options
        .map(
          ([value, text]) => `<label>
            <input type="radio" name="${name}" value="${value}" />
            <span>${text}</span>
          </label>`,
        )
        .join("")}
    </div>
  </fieldset>`;
}

function fanField(name: FieldName, label: string): string {
  return `<label class="field compact-field">
    <span>${label}</span>
    <select name="${name}">
      <option value="${automaticFanCount}">Auto</option>
      ${fixedFanCountOptions
        .map((count) => `<option value="${count}">${count === 0 ? "None" : String(count)}</option>`)
        .join("")}
    </select>
  </label>`;
}

function cameraPresetLabel(preset: RawPurifierSettings["cameraPreset"]): string {
  if (preset === "official") {
    return "Official angle";
  }
  if (preset === "front") {
    return "Front";
  }
  if (preset === "side") {
    return "Side";
  }
  return "Top";
}

function corsiModeLabel(mode: CorsiRosenthalMode): string {
  return mode === "side-exhaust" ? "Flipped side exhaust" : "Classic top exhaust";
}

function fabricationMethodLabel(method: FabricationMethod): string {
  if (method === "print-3mf") {
    return "3D print";
  }
  return "Laser cut";
}

function exportActionLabel(): string {
  if (fabricationMethod !== "print-3mf") {
    return "Export Laser Drawing";
  }
  return isStaticReferencePrintDesignId(settings.printDesign) ? "Open Printables Files" : "Download 3MF";
}

function createActivePrintSheetPlan(layout: ReturnType<typeof createLayout>) {
  if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(layout.configuration.printDesign);
    if (reference === undefined) {
      throw new Error("createActivePrintSheetPlan: Static reference design is missing source file metadata");
    }
    const preset = findPrintVolumePreset(printVolumePresetId);
    return {
      type: "static-reference",
      reference,
      bed: preset.bed,
      bedLabel: preset.label,
    } as const;
  }
  return createGeneratedPrintSheetPlan(layout);
}

function createGeneratedPrintSheetPlan(layout: ReturnType<typeof createLayout>) {
  return createPrintableSheetPlanFromKit(createPrintDesignKit(layout, printVolumePresetId));
}

function toggleField(name: FieldName, label: string): string {
  return `<label class="toggle-field">
    <input type="checkbox" name="${name}" />
    <span>${label}</span>
  </label>`;
}

function summaryItem(label: string, value: string): string {
  return `<div>
    <span>${label}</span>
    <strong>${value}</strong>
  </div>`;
}

function staticPrintEstimateSummaryItems(estimate: StaticPrintEstimate | undefined): string {
  if (estimate === undefined) {
    return "";
  }
  return `
    ${summaryItem("Filament", `${formatKilograms(estimate.estimatedFilamentKilograms)} @ ${estimate.assumptions.infillPercent}%`)}
    ${summaryItem("Print time", `${formatHourRange(estimate.printTimeHours)} h`)}
  `;
}

function previewSummaryHtml(layout: ReturnType<typeof createLayout>): string {
  if (previewMode === "print-sheets") {
    if (isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
      const reference = staticPrintReferenceForPreset(layout.configuration.printDesign);
      return `
        ${summaryItem("Print plates", findPrintVolumePreset(printVolumePresetId).label)}
        ${summaryItem("Source STLs", String(reference?.platePreviewAssets.length ?? 0))}
        ${staticPrintEstimateSummaryItems(reference?.printEstimate)}
        ${summaryItem("License", layout.configuration.printDesign.license)}
        ${summaryItem("Source", reference?.attribution ?? layout.configuration.printDesign.source)}
      `;
    }
    const plan = createGeneratedPrintSheetPlan(layout);
    return `
      ${summaryItem("Print plates", String(plan.sheets.length))}
      ${summaryItem("Panel tiles", String(plan.kit.summary.panelTileCount))}
      ${summaryItem("Glue keys", String(plan.kit.summary.glueKeyCount))}
      ${summaryItem("Split panels", String(plan.kit.summary.splitPanelCount))}
      ${summaryItem("Bed", plan.kit.preset.label)}
    `;
  }

  if (fabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    const reference = staticPrintReferenceForPreset(layout.configuration.printDesign);
    return `
      ${summaryItem("Design", layout.configuration.printDesign.label)}
      ${summaryItem("Type", "Curated static")}
      ${summaryItem("Files", reference?.fileSummary ?? "Original source files")}
      ${staticPrintEstimateSummaryItems(reference?.printEstimate)}
      ${summaryItem("Source", reference?.attribution ?? layout.configuration.printDesign.source)}
    `;
  }

  if (fabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
    const plan = createGeneratedPrintSheetPlan(layout);
    const corsiLayout = resolveCorsiRosenthalLayout(layout);
    return `
      ${summaryItem("Design", layout.configuration.printDesign.label)}
      ${summaryItem("Mode", corsiModeLabel(corsiLayout.mode))}
      ${summaryItem("Filters", `${corsiLayout.filterCount} x ${formatMillimeters(settings.filterWidth)} x ${formatMillimeters(settings.filterDepth)}`)}
      ${summaryItem("Fans", `${corsiLayout.fanCount} x ${settings.fanDiameter} mm`)}
      ${summaryItem("Print parts", String(plan.kit.summary.partCount))}
      ${summaryItem("Bed", plan.kit.preset.label)}
    `;
  }

  if (fabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(layout.configuration.printDesign.id)) {
    const plan = createGeneratedPrintSheetPlan(layout);
    const model = createDonutFilterModel(layout);
    return `
      ${summaryItem("Design", layout.configuration.printDesign.label)}
      ${summaryItem("Filter", `${formatMillimeters(model.filter.outerDiameter)} dia x ${formatMillimeters(model.filter.length)}`)}
      ${summaryItem("Center hole", formatMillimeters(model.filter.holeDiameter))}
      ${summaryItem("Fan", `${model.fanSize} mm`)}
      ${summaryItem("Print parts", String(plan.kit.summary.partCount))}
      ${summaryItem("Bed", plan.kit.preset.label)}
    `;
  }

  return `
    ${summaryItem("Panels", String(layout.summary.panelCount))}
    ${summaryItem("Chamber height", formatMillimeters(layout.summary.chamberHeight))}
    ${summaryItem("Working depth", formatMillimeters(layout.summary.workingDepth))}
    ${summaryItem("Fans", `${totalResolvedFans(layout.summary.resolvedFans)}`)}
    ${summaryItem("Sheet", `${formatMillimeters(layout.summary.sheetWidth)} x ${formatMillimeters(layout.summary.sheetHeight)}`)}
  `;
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

function configuredFanCount(layout: ReturnType<typeof createLayout>): number {
  if (fabricationMethod === "print-3mf" && isStaticReferencePrintDesignId(layout.configuration.printDesign.id)) {
    return layout.configuration.printDesign.recommendedFanCount;
  }
  if (fabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
    return resolveCorsiRosenthalFanCount(layout);
  }
  if (fabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(layout.configuration.printDesign.id)) {
    return 1;
  }
  return totalResolvedFans(layout.summary.resolvedFans);
}

function totalResolvedFans(resolvedFans: ReturnType<typeof createLayout>["summary"]["resolvedFans"]): number {
  return resolvedFans.left + resolvedFans.right + resolvedFans.top + resolvedFans.bottom;
}

function requireElement<T extends Element>(element: T | null, message: string): T {
  if (element === null) {
    throw new Error(message);
  }
  return element;
}
