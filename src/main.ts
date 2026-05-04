import "./styles.css";
import {
  applyFanProductPreset,
  applyFilterPreset,
  applyDonutFilterPreset,
  automaticFanCount,
  cameraPresets,
  corsiRosenthalFilterCountRange,
  corsiRosenthalFanCountOptions,
  corsiRosenthalModes,
  createLaserSvg,
  createLayout,
  customDonutFilterPresetId,
  customFilterPresetId,
  customFanProductPresetId,
  decodeSettings,
  defaultSettings,
  defaultCorsiRosenthalFilterCount,
  encodeSettings,
  fanDiameters,
  fanProductPresets,
  fixedFanCountOptions,
  filterPresets,
  donutFilterPresets,
  findFanProductPreset,
  findFilterPreset,
  findDonutFilterPreset,
  findPrintDesignPreset,
  formatMillimeters,
  isCorsiRosenthalPrintDesignId,
  isDonutFilterPrintDesignId,
  normalizeRawSettings,
  printDesignPresets,
  resolveCorsiRosenthalLayout,
  resolveCorsiRosenthalFanCount,
  type CorsiRosenthalMode,
  type DonutFilterPresetId,
  type FanProductPresetId,
  type FilterPresetId,
  type PrintDesignId,
  type PreviewMode,
  type RawPurifierSettings,
} from "./airPurifier";
import { evaluateBuildDiagnostics, summarizeBuildReadiness, type BuildDiagnostic } from "./buildDiagnostics";
import {
  exportFormats as fabricationMethods,
  findPrintVolumePreset,
  printVolumePresets,
  readExportFormat,
  type ExportFormat,
  type PrintVolumePresetId,
} from "./printableKit";
import { createPrintDesignKit, createPrintDesignThreeMfExport } from "./printDesignKit";
import {
  createPrintDesignSettingsMemory,
  rememberPrintDesignSettings,
  switchPrintDesignSettings,
  type PrintDesignSettingsMemory,
} from "./printDesignSettingsMemory";
import { createPrintableSheetPlanFromKit } from "./printSheetPreview";
import { PrintSheetThreePreview } from "./printSheetThreePreview";
import { PurifierThreePreview } from "./threePreview";
import {
  decodeWorkbenchState,
  encodeWorkbenchState,
  fabricationMethodForWorkbenchState,
  previewModeForWorkbenchState,
  printVolumePresetIdForWorkbenchState,
  withControlsTab,
  withFabricationMethod,
  withPreviewMode,
  withPrintVolumePreset,
  type ControlsTab,
  type WorkbenchState,
} from "./workbenchState";
import { createDonutFilterModel } from "./donutFilterModel";

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
        <section class="print-design-selector" data-print-design-control aria-label="Printable design">
          <div>
            <p class="eyebrow">3D print model</p>
            ${printDesignField()}
          </div>
          <div class="print-design-card" id="printDesignDetail"></div>
        </section>
        <section class="workspace" aria-label="Open air purifier builder">
          <section class="preview-pane" aria-label="Live preview">
            <div class="preview-toolbar" aria-label="Preview mode">
              <div class="preview-mode-group">
                <button class="mode-button" type="button" data-mode="enclosure">3D enclosure</button>
                <button class="mode-button" type="button" data-mode="cut-sheet" data-method-preview="laser-svg">Laser sheet</button>
                <button class="mode-button" type="button" data-mode="print-sheets" data-method-preview="print-3mf">Print sheets</button>
              </div>
              <button class="ghost-button preview-maximize-button" type="button" data-action="maximize-preview" hidden>
                Maximize
              </button>
            </div>

            <div class="preview-stage" id="previewStage"></div>

            <div class="summary-grid" id="summaryGrid"></div>

          </section>

          <aside class="controls-pane" aria-label="Build settings">
            <section class="persistent-output-panel" aria-label="Build output">
              <div class="export-readiness-summary" id="exportReadinessSummary"></div>
              <div class="material-list-card" id="materialList"></div>
              <div class="persistent-export-actions">
                <button class="primary-button" type="button" data-action="export-drawing">Export Drawing</button>
              </div>
            </section>

            <div class="controls-tabs" role="tablist" aria-label="Control groups">
              <button class="controls-tab" id="build-controls-tab" type="button" role="tab" data-controls-tab="build" aria-controls="build-controls-panel">Build</button>
              <button class="controls-tab" id="fabrication-controls-tab" type="button" role="tab" data-controls-tab="fabrication" aria-controls="fabrication-controls-panel">Fabrication</button>
            </div>

            <div class="tab-panel build-controls" id="build-controls-panel" role="tabpanel" aria-labelledby="build-controls-tab" data-controls-panel="build">
              <section class="control-section build-section">
                <div class="section-heading">
                  <p class="eyebrow">Build</p>
                  <h2>Filter and fan</h2>
                </div>
                <div data-rectangular-filter-controls>
                  ${selectField("filterPreset", "Filter", filterPresets.map((preset) => [preset.id, preset.label]))}
                  <div class="filter-preset-card" id="filterPresetDetail"></div>
                  <div class="custom-dimensions" data-custom-filter-dimensions>
                    ${numberField("filterWidth", "Filter width", "mm", 1)}
                    ${numberField("filterDepth", "Filter depth", "mm", 1)}
                    ${numberField("filterThickness", "Filter thickness", "mm", 0.1)}
                  </div>
                </div>
                <div class="donut-filter-controls" data-donut-filter-controls>
                  ${selectField("donutFilterPreset", "Round filter", donutFilterPresets.map((preset) => [preset.id, preset.label]))}
                  <div class="filter-preset-card" id="donutFilterPresetDetail"></div>
                  <div class="donut-filter-dimensions">
                    ${numberField("donutFilterOuterDiameter", "Outer diameter", "mm", 1)}
                    ${numberField("donutFilterLength", "Length", "mm", 1)}
                    ${numberField("donutFilterHoleDiameter", "Center hole", "mm", 0.1)}
                  </div>
                </div>
                ${selectField("fanPreset", "Fan type", fanProductPresets.map((preset) => [preset.id, preset.label]))}
                <div class="fan-preset-card" id="fanPresetDetail"></div>
                <div class="purchase-list-card" id="purchaseList"></div>
                <div data-custom-fan-size>
                  ${selectField("fanDiameter", "Fan size", fanDiameters.map((diameter) => [String(diameter), `${diameter} mm`]))}
                </div>
              </section>

              <div class="secondary-controls-column">
                <section class="control-section layout-section">
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
            </div>

            <div class="tab-panel fabrication-controls" id="fabrication-controls-panel" role="tabpanel" aria-labelledby="fabrication-controls-tab" data-controls-panel="fabrication">
              <section class="control-section fabrication-settings-section">
                <div class="section-heading">
                  <p class="eyebrow">Fabrication</p>
                  <h2>Material and fit</h2>
                </div>
                ${numberField("materialThickness", "Material thickness", "mm", 0.1)}
                ${numberField("screwHoleDiameter", "Fan screw holes", "mm", 0.1)}
                <div data-nukit-panel-fit-controls>
                  ${numberField("rim", "Filter rim", "mm", 1)}
                  ${numberField("kerfFit", "Fit allowance", "mm", 0.01)}
                  ${toggleField("splitFrames", "Split large frame panels")}
                </div>
                <div data-laser-output-controls>
                  ${toggleField("labels", "Engrave part labels")}
                  ${numberField("referenceScale", "Reference scale", "mm", 1)}
                </div>
              </section>
              <section class="control-section export-section" data-print-volume-section>
                <div class="section-heading">
                  <p class="eyebrow">Export</p>
                  <h2>Print bed</h2>
                </div>
                <div data-print-volume-control>
                  ${exportControlField("printVolume", "Print volume", printVolumePresets.map((preset) => [preset.id, preset.label]))}
                </div>
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
        <button class="primary-button" type="button" data-action="export-drawing">Export Drawing</button>
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
    threePreview.update(layout);
  } else if (previewMode === "print-sheets") {
    destroyThreePreview();
    stage.classList.remove("is-three-preview", "is-sheet-preview");
    stage.classList.add("is-print-sheet-three-preview");
    let host = stage.querySelector<HTMLElement>(".print-sheet-three-host");
    if (host === null) {
      stage.innerHTML = `<div class="print-sheet-three-host" aria-label="3D print plate preview"></div>`;
      host = requireElement(stage.querySelector<HTMLElement>(".print-sheet-three-host"), "Print sheet preview host not found");
    }
    if (printSheetPreview === null) {
      printSheetPreview = new PrintSheetThreePreview(host);
    }
    printSheetPreview.update(createActivePrintSheetPlan(layout));
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
  const maximizeButton = app.querySelector<HTMLButtonElement>('[data-action="maximize-preview"]');
  if (maximizeButton !== null) {
    maximizeButton.hidden = previewMode === "enclosure";
  }
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
  if (!(target instanceof HTMLElement)) {
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
    exportDrawing();
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
    syncSettingsControls(app);
    syncPreviewViewControls(app);
    threePreview?.setAutoRotate(settings.autoRotate && !(settings.showDimensions && !isCorsiRosenthalPrintDesignId(settings.printDesign)));
    syncUrl();
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
  return findPrintDesignPreset(target.value).id;
}

function readCorsiModeControlValue(target: HTMLInputElement | HTMLSelectElement): CorsiRosenthalMode {
  const mode = corsiRosenthalModes.find((entry) => entry === target.value);
  return mode ?? defaultSettings.corsiMode;
}

function readControlsTab(value: string | null): ControlsTab {
  return value === "fabrication" || value === "cutting" ? "fabrication" : "build";
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
  const switched = switchPrintDesignSettings(printDesignSettingsMemory, settings, printDesign);
  settings = switched.settings;
  printDesignSettingsMemory = switched.memory;
  syncControls();
  syncUrl();
  renderPreview();
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
  for (const tab of app.querySelectorAll<HTMLElement>("[data-controls-tab]")) {
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
    button.classList.toggle("is-active", button.getAttribute("data-mode") === previewMode);
    const methodPreview = button.dataset.methodPreview;
    button.hidden = methodPreview !== undefined && methodPreview !== fabricationMethod;
  }
}

function syncPreviewViewControls(root: ParentNode = app): void {
  syncSettingsControls(root);
  const isCorsi = isCorsiRosenthalPrintDesignId(settings.printDesign);
  setPreviewToggleVisible(root, "transparentWalls", !isCorsi);
  setPreviewToggleVisible(root, "explodedView", !isCorsi);
  setPreviewToggleVisible(root, "showDimensions", !isCorsi);
  const rotationButton = root.querySelector<HTMLElement>('[data-action="toggle-rotation"]');
  if (rotationButton === null) {
    return;
  }
  rotationButton.textContent = settings.autoRotate ? "Stop rotation" : "Auto Rotate";
  rotationButton.setAttribute("aria-pressed", String(settings.autoRotate));
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
  detail.innerHTML = `
    <strong>${escapeHtml(preset.detail)}</strong>
    <small>${escapeHtml(preset.source)}${sourceLink}</small>
  `;
}

function hexColor(color: number): string {
  return color.toString(16).padStart(6, "0");
}

function syncExportDiagnostics(layout: ReturnType<typeof createLayout>, mode: "normal" | "attention" = "normal"): void {
  const diagnostics = evaluateActiveExportDiagnostics(layout);
  const readiness = summarizeActiveBuildReadiness(layout, diagnostics);
  const container = app.querySelector<HTMLElement>("#exportDiagnostics");
  if (container !== null) {
    container.classList.toggle("needs-attention", mode === "attention" && diagnostics.length > 0);
    container.innerHTML = `
      ${diagnosticItem(readiness)}
      ${diagnostics.map((diagnostic) => diagnosticItem(diagnostic)).join("")}
    `;
  }

  const summaryContainer = app.querySelector<HTMLElement>("#exportReadinessSummary");
  if (summaryContainer !== null) {
    summaryContainer.innerHTML = diagnosticItem(readiness);
  }
}

function syncExportControls(layout: ReturnType<typeof createLayout>): void {
  for (const control of app.querySelectorAll<HTMLInputElement>('[name="fabricationMethod"]')) {
    control.checked = control.value === fabricationMethod;
  }

  const printVolumeControl = app.querySelector<HTMLElement>("[data-print-volume-control]");
  if (printVolumeControl !== null) {
    printVolumeControl.hidden = fabricationMethod !== "print-3mf";
  }

  const printVolumeSection = app.querySelector<HTMLElement>("[data-print-volume-section]");
  if (printVolumeSection !== null) {
    printVolumeSection.hidden = fabricationMethod !== "print-3mf";
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
    volumeSelect.disabled = fabricationMethod !== "print-3mf";
  }

  const designSelect = app.querySelector<HTMLSelectElement>('[name="printDesign"]');
  if (designSelect !== null) {
    designSelect.value = settings.printDesign;
    designSelect.disabled = fabricationMethod !== "print-3mf";
  }

  syncDesignSpecificControls();
  const materialList = app.querySelector<HTMLElement>("#materialList");
  if (materialList !== null) {
    materialList.innerHTML = materialListHtml(layout);
  }
  const purchaseList = app.querySelector<HTMLElement>("#purchaseList");
  if (purchaseList !== null) {
    purchaseList.innerHTML = purchaseListHtml(layout);
  }

  for (const button of app.querySelectorAll<HTMLElement>('[data-action="export-drawing"]')) {
    button.textContent = exportActionLabel();
  }
}

function syncDesignSpecificControls(): void {
  const useCorsiControls = fabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(settings.printDesign);
  const useDonutControls = fabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(settings.printDesign);
  const useNukitControls = !useCorsiControls && !useDonutControls;
  setControlGroupVisible("[data-rectangular-filter-controls]", !useDonutControls);
  setControlGroupVisible("[data-donut-filter-controls]", useDonutControls);
  setControlGroupVisible("[data-nukit-fan-placement]", useNukitControls);
  setControlGroupVisible("[data-corsi-layout]", useCorsiControls);
  setControlGroupVisible("[data-donut-layout]", useDonutControls);
  setControlGroupVisible("[data-nukit-filter-count]", useNukitControls);
  setControlGroupVisible("[data-nukit-panel-fit-controls]", useNukitControls);
  const layoutSectionTitle = app.querySelector<HTMLElement>("#layoutSectionTitle");
  if (layoutSectionTitle !== null) {
    layoutSectionTitle.textContent = useCorsiControls ? "Corsi layout" : useDonutControls ? "Adaptor" : "Fan placement";
  }
  if (useCorsiControls) {
    syncCorsiLayoutControls();
  }
}

function syncCorsiLayoutControls(): void {
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
      option.disabled = !allowedFanCounts.has(option.value);
    }
    fanControl.value = String(settings.corsiFanCount);
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

function materialListHtml(layout: ReturnType<typeof createLayout>): string {
  if (fabricationMethod === "print-3mf") {
    const printKit = createPrintDesignKit(layout, printVolumePresetId);
    const printPlan = createPrintableSheetPlanFromKit(printKit);
    return materialListCard("3D print kit", [
      `${printPlan.sheets.length} plates`,
      `${printKit.summary.partCount} parts`,
      printKit.preset.label,
    ]);
  }

  return materialListCard("Laser drawing", [
    `${formatMillimeters(layout.summary.sheetWidth)} x ${formatMillimeters(layout.summary.sheetHeight)}`,
    `${formatMillimeters(settings.materialThickness)} material`,
    settings.labels ? "Labels on" : "Labels off",
  ]);
}

function materialListCard(title: string, items: readonly string[]): string {
  return `
    <strong>${escapeHtml(title)}</strong>
    <span>${items.map(escapeHtml).join(" · ")}</span>
  `;
}

type PurchaseListItem = {
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
          (item) => `<li>
            ${purchaseItemLink(item)}
            <span>${escapeHtml(item.detail)}</span>
          </li>`,
        )
        .join("")}
    </ul>
  `;
}

function purchaseListItems(layout: ReturnType<typeof createLayout>): readonly PurchaseListItem[] {
  const fanProduct = findFanProductPreset(settings.fanPreset);
  const fanCount = configuredFanCount(layout);
  const baseItems: PurchaseListItem[] = [
    {
      label: `${fanCount} x ${layout.configuration.fan.spec.diameter} mm fans`,
      detail: fanProduct.label,
      url: fanProduct.productUrl,
    },
    {
      label: "12 V fan power",
      detail: "PWM power supply or fan hub sized for the fan current",
      url: webSearchUrl(`${fanProduct.label} 12V PWM fan power supply hub`),
    },
  ];

  if (fabricationMethod === "print-3mf" && isDonutFilterPrintDesignId(layout.configuration.printDesign.id)) {
    const preset = findDonutFilterPreset(settings.donutFilterPreset);
    return [
      {
        label: "Round HEPA filter",
        detail: `${formatMillimeters(settings.donutFilterOuterDiameter)} dia x ${formatMillimeters(settings.donutFilterLength)}`,
        url: preset.productUrl ?? webSearchUrl(`${preset.label} replacement filter`),
      },
      ...baseItems,
      {
        label: "Foam gasket tape",
        detail: "Optional seal between adaptor, fan, and filter",
        url: webSearchUrl("foam gasket tape air purifier filter adapter"),
      },
    ];
  }

  const filterPreset = findFilterPreset(settings.filterPreset);
  return [
    {
      label: "Filter",
      detail: `${filterPreset.label} · ${formatMillimeters(settings.filterWidth)} x ${formatMillimeters(settings.filterDepth)}`,
      url: webSearchUrl(`${filterPreset.label} air filter`),
    },
    ...baseItems,
  ];
}

function purchaseItemLink(item: PurchaseListItem): string {
  if (item.url === undefined) {
    return `<strong>${escapeHtml(item.label)}</strong>`;
  }
  return `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a>`;
}

function webSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `https://www.google.com/search?${params.toString()}`;
}

function diagnosticItem(diagnostic: BuildDiagnostic): string {
  return `<div class="diagnostic-item ${diagnostic.severity}">
    <strong>${escapeHtml(diagnostic.title)}</strong>
    <span>${escapeHtml(diagnostic.detail)}</span>
  </div>`;
}

function exportDrawing(): void {
  const layout = createLayout(settings);
  const diagnostics = evaluateActiveExportDiagnostics(layout);
  syncExportDiagnostics(layout, diagnostics.length > 0 ? "attention" : "normal");
  if (diagnostics.length > 0 && controlsTab !== "fabrication") {
    applyWorkbenchState(withControlsTab(workbenchState, "fabrication"));
    syncControlTabs();
    syncUrl();
    flashDownloadButtons("Review checks");
    return;
  }

  if (fabricationMethod === "print-3mf") {
    exportPrintKit(layout);
    return;
  }

  exportSvgDrawing(layout);
}

function evaluateActiveExportDiagnostics(layout: ReturnType<typeof createLayout>): BuildDiagnostic[] {
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

function exportPrintKit(layout: ReturnType<typeof createLayout>): void {
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
    title.textContent = "Print sheets";
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
    dialogPrintSheetPreview.update(createActivePrintSheetPlan(layout));
    return;
  }

  destroyDialogPrintSheetPreview();
  eyebrow.textContent = "Laser cutting";
  title.textContent = "Laser sheet";
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
  for (const button of app.querySelectorAll<HTMLElement>('[data-action="export-drawing"]')) {
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

function printDesignField(): string {
  return `<label class="field">
    <span>Printable design</span>
    <select name="printDesign" aria-label="Printable design">
      ${printDesignPresets.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join("")}
    </select>
  </label>`;
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
    <details class="preview-settings-menu">
      <summary>Settings</summary>
      <div class="preview-settings-panel">
        ${selectField("cameraPreset", "Camera", cameraPresets.map((preset) => [preset, cameraPresetLabel(preset)]))}
        <div class="preview-toggle-grid">
          ${toggleField("showFilterMedia", "Show filters")}
          ${toggleField("showFans", "Show fans")}
          ${toggleField("showFilterFrame", "Show frame")}
          ${toggleField("transparentWalls", "Transparent walls")}
          ${toggleField("explodedView", "Exploded view")}
          ${toggleField("showDimensions", "Show dimensions")}
        </div>
      </div>
    </details>
    <button class="preview-rotation-button" type="button" data-action="toggle-rotation">Stop rotation</button>
  </div>`;
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
  return fabricationMethod === "print-3mf" ? "Export 3D Print Kit" : "Export Laser Drawing";
}

function createActivePrintSheetPlan(layout: ReturnType<typeof createLayout>) {
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

function previewSummaryHtml(layout: ReturnType<typeof createLayout>): string {
  if (previewMode === "print-sheets") {
    const plan = createActivePrintSheetPlan(layout);
    return `
      ${summaryItem("Print sheets", String(plan.sheets.length))}
      ${summaryItem("Panel tiles", String(plan.kit.summary.panelTileCount))}
      ${summaryItem("Glue keys", String(plan.kit.summary.glueKeyCount))}
      ${summaryItem("Split panels", String(plan.kit.summary.splitPanelCount))}
      ${summaryItem("Bed", plan.kit.preset.label)}
    `;
  }

  if (fabricationMethod === "print-3mf" && isCorsiRosenthalPrintDesignId(layout.configuration.printDesign.id)) {
    const plan = createActivePrintSheetPlan(layout);
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
    const plan = createActivePrintSheetPlan(layout);
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

function configuredFanCount(layout: ReturnType<typeof createLayout>): number {
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
