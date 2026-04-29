import "./styles.css";
import {
  applyFilterPreset,
  automaticFanCount,
  cameraPresets,
  createLaserSvg,
  createLayout,
  customFilterPresetId,
  decodeSettings,
  defaultSettings,
  encodeSettings,
  fanDiameters,
  fixedFanCountOptions,
  filterPresets,
  findFilterPreset,
  formatMillimeters,
  normalizeRawSettings,
  type FilterPresetId,
  type PreviewMode,
  type RawPurifierSettings,
} from "./airPurifier";
import { evaluateBuildDiagnostics, summarizeBuildReadiness, type BuildDiagnostic } from "./buildDiagnostics";
import { PurifierThreePreview } from "./threePreview";

type FieldName = keyof RawPurifierSettings;
type ControlsTab = "build" | "cutting";

const app = requireElement(document.querySelector<HTMLElement>("#app"), "App root not found");
const initialUrlParams = new URLSearchParams(window.location.search);

let settings = decodeSettings(window.location.search);
let previewMode: PreviewMode = readPreviewMode(initialUrlParams.get("previewMode"));
let controlsTab: ControlsTab = readControlsTab(initialUrlParams.get("controlsTab"));
let threePreview: PurifierThreePreview | null = null;
const transientLabelTimers = new WeakMap<HTMLElement, number>();

renderShell();
syncControlTabs();
syncControls();
renderPreview();

function renderShell(): void {
  app.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Browser generator</p>
          <h1>Nukit Open Air Purifier</h1>
        </div>
        <div class="topbar-actions">
          <button class="ghost-button" type="button" data-action="copy-url">Copy URL</button>
          <button class="primary-button" type="button" data-action="export-drawing">Export Drawing</button>
        </div>
      </header>

      <section class="workspace" aria-label="Open air purifier builder">
        <section class="preview-pane" aria-label="Live preview">
          <div class="preview-toolbar" aria-label="Preview mode">
            <div class="preview-mode-group">
              <button class="mode-button" type="button" data-mode="enclosure">3D enclosure</button>
              <button class="mode-button" type="button" data-mode="cut-sheet">Cut sheet</button>
            </div>
            <button class="ghost-button preview-maximize-button" type="button" data-action="maximize-cut-sheet" hidden>
              Maximize
            </button>
          </div>

          <div class="preview-stage" id="previewStage"></div>

          <div class="summary-grid" id="summaryGrid"></div>

        </section>

        <aside class="controls-pane" aria-label="Build settings">
          <div class="controls-tabs" role="tablist" aria-label="Control groups">
            <button class="controls-tab" id="build-controls-tab" type="button" role="tab" data-controls-tab="build" aria-controls="build-controls-panel">Build</button>
            <button class="controls-tab" id="cutting-controls-tab" type="button" role="tab" data-controls-tab="cutting" aria-controls="cutting-controls-panel">Cutting</button>
          </div>

          <div class="tab-panel build-controls" id="build-controls-panel" role="tabpanel" aria-labelledby="build-controls-tab" data-controls-panel="build">
            <section class="control-section build-section">
              <div class="section-heading">
                <p class="eyebrow">Build</p>
                <h2>Filter and fan</h2>
              </div>
              ${selectField("filterPreset", "Filter", filterPresets.map((preset) => [preset.id, preset.label]))}
              <div class="filter-preset-card" id="filterPresetDetail"></div>
              <div class="custom-dimensions" data-custom-filter-dimensions>
                ${numberField("filterWidth", "Filter width", "mm", 1)}
                ${numberField("filterDepth", "Filter depth", "mm", 1)}
                ${numberField("filterThickness", "Filter thickness", "mm", 0.1)}
              </div>
              ${selectField("fanDiameter", "Fan size", fanDiameters.map((diameter) => [String(diameter), `${diameter} mm`]))}
              ${segmentedField("filters", "Filters", [
                ["1", "One side"],
                ["2", "Both sides"],
              ])}
            </section>

            <div class="secondary-controls-column">
              <section class="control-section layout-section">
                <div class="section-heading">
                  <p class="eyebrow">Layout</p>
                  <h2>Fan placement</h2>
                </div>
                <div class="fan-grid">
                  ${fanField("fansLeft", "Left")}
                  ${fanField("fansRight", "Right")}
                  ${fanField("fansTop", "Top")}
                  ${fanField("fansBottom", "Bottom")}
                </div>
              </section>

              <section class="control-section view-section">
                <div class="section-heading">
                  <p class="eyebrow">View</p>
                  <h2>3D render</h2>
                </div>
                ${selectField("cameraPreset", "Camera", cameraPresets.map((preset) => [preset, cameraPresetLabel(preset)]))}
                ${toggleField("showFilterMedia", "Show filters")}
                ${toggleField("showFans", "Show fans")}
                ${toggleField("showFilterFrame", "Show filter frame")}
                ${toggleField("transparentWalls", "Transparent walls")}
                ${toggleField("explodedView", "Exploded view")}
                ${toggleField("showDimensions", "Show dimensions")}
              </section>
            </div>
          </div>

          <div class="tab-panel cutting-controls" id="cutting-controls-panel" role="tabpanel" aria-labelledby="cutting-controls-tab" data-controls-panel="cutting">
            <section class="control-section cutting-section">
              <div class="section-heading">
                <p class="eyebrow">Cutting</p>
                <h2>Material and fit</h2>
              </div>
              ${numberField("materialThickness", "Material thickness", "mm", 0.1)}
              ${numberField("rim", "Filter rim", "mm", 1)}
              ${numberField("screwHoleDiameter", "Fan screw holes", "mm", 0.1)}
              ${numberField("kerfFit", "Kerf fit allowance", "mm", 0.01)}
              ${toggleField("splitFrames", "Split frames for smaller laser beds")}
              ${toggleField("labels", "Engrave part labels")}
              ${numberField("referenceScale", "Reference scale", "mm", 1)}
            </section>
            <section class="control-section export-section">
              <div class="section-heading">
                <p class="eyebrow">Export</p>
                <h2>Cut readiness</h2>
              </div>
              <div class="export-diagnostics" id="exportDiagnostics"></div>
              <div class="export-drawing-card">
                <div>
                  <span>File format</span>
                  <strong>SVG drawing</strong>
                  <small>Cut paths, labels, and scale marker for laser software.</small>
                </div>
                <button class="primary-button export-drawing-button" type="button" data-action="export-drawing">
                  Export Drawing
                </button>
              </div>
            </section>
          </div>
        </aside>
      </section>

      <dialog class="cut-sheet-dialog" id="cutSheetDialog" aria-labelledby="cutSheetDialogTitle">
        <div class="cut-sheet-dialog-surface">
          <header class="cut-sheet-dialog-bar">
            <div>
              <p class="eyebrow">Cut sheet</p>
              <h2 id="cutSheetDialogTitle">Laser layout</h2>
            </div>
            <button class="ghost-button" type="button" data-action="close-cut-sheet-dialog">Close</button>
          </header>
          <div class="cut-sheet-dialog-preview" id="cutSheetDialogPreview"></div>
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
}

function syncControls(): void {
  for (const [key, value] of Object.entries(settings)) {
    const controls = app.querySelectorAll(`[name="${key}"]`);
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
  syncFilterPresetUi();
}

function renderPreview(): void {
  settings = normalizeRawSettings(settings);
  const layout = createLayout(settings);
  const stage = requireElement(app.querySelector("#previewStage"), "Preview stage not found");
  const summary = requireElement(app.querySelector("#summaryGrid"), "Summary grid not found");

  if (previewMode === "enclosure") {
    stage.classList.add("is-three-preview");
    let host = stage.querySelector<HTMLElement>(".three-preview-host");
    if (host === null) {
      stage.innerHTML = `<div class="three-preview-host" aria-label="Interactive 3D enclosure preview"></div>`;
      host = requireElement(stage.querySelector<HTMLElement>(".three-preview-host"), "Three preview host not found");
    }
    if (threePreview === null) {
      threePreview = new PurifierThreePreview(host);
    }
    threePreview.update(layout);
  } else {
    threePreview?.destroy();
    threePreview = null;
    stage.classList.remove("is-three-preview");
    stage.innerHTML = `<div class="cut-sheet-preview">${createLaserSvg(layout)}</div>`;
  }

  summary.innerHTML = `
    ${summaryItem("Panels", String(layout.summary.panelCount))}
    ${summaryItem("Chamber height", formatMillimeters(layout.summary.chamberHeight))}
    ${summaryItem("Working depth", formatMillimeters(layout.summary.workingDepth))}
    ${summaryItem("Fans", `${totalResolvedFans(layout.summary.resolvedFans)}`)}
    ${summaryItem("Sheet", `${formatMillimeters(layout.summary.sheetWidth)} x ${formatMillimeters(layout.summary.sheetHeight)}`)}
  `;

  for (const button of app.querySelectorAll("[data-mode]")) {
    button.classList.toggle("is-active", button.getAttribute("data-mode") === previewMode);
  }
  const maximizeButton = app.querySelector<HTMLButtonElement>('[data-action="maximize-cut-sheet"]');
  if (maximizeButton !== null) {
    maximizeButton.hidden = previewMode !== "cut-sheet";
  }
  syncOpenCutSheetDialog(layout);
  syncExportDiagnostics(layout);
}

function handleInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }

  const name = target.name as FieldName;
  if (!(name in settings)) {
    return;
  }

  if (name === "filterPreset") {
    settings = applyFilterPreset(settings, readFilterPresetControlValue(target));
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
  }

  settings = normalizeRawSettings(settings);
  syncControls();
  syncUrl();
  renderPreview();
}

function handleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.id === "cutSheetDialog") {
    closeCutSheetDialog();
    return;
  }

  const mode = target.closest("[data-mode]");
  if (mode instanceof HTMLElement) {
    previewMode = readPreviewMode(mode.getAttribute("data-mode"));
    syncUrl();
    renderPreview();
    return;
  }

  const tab = target.closest("[data-controls-tab]");
  if (tab instanceof HTMLElement) {
    controlsTab = readControlsTab(tab.getAttribute("data-controls-tab"));
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
  }

  if (actionName === "copy-url") {
    void copyUrl(action);
  }

  if (actionName === "maximize-cut-sheet") {
    openCutSheetDialog();
  }

  if (actionName === "close-cut-sheet-dialog") {
    closeCutSheetDialog();
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
  return value === "cut-sheet" ? "cut-sheet" : "enclosure";
}

function readFilterPresetControlValue(target: HTMLInputElement | HTMLSelectElement): FilterPresetId {
  const preset = filterPresets.find((entry) => entry.id === target.value);
  return preset?.id ?? defaultSettings.filterPreset;
}

function readControlsTab(value: string | null): ControlsTab {
  return value === "cutting" ? "cutting" : "build";
}

function isFilterDimensionName(name: FieldName): name is "filterWidth" | "filterDepth" | "filterThickness" {
  return name === "filterWidth" || name === "filterDepth" || name === "filterThickness";
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

function syncFilterPresetUi(): void {
  const preset = findFilterPreset(settings.filterPreset);
  const detail = app.querySelector<HTMLElement>("#filterPresetDetail");
  if (detail !== null) {
    const layout = createLayout(settings);
    const totalFans = totalResolvedFans(layout.summary.resolvedFans);
    const dimensions = `${formatMillimeters(settings.filterWidth)} x ${formatMillimeters(settings.filterDepth)} x ${formatMillimeters(settings.filterThickness)}`;
    const examples = formatExamples(preset.examples);
    detail.innerHTML = `
      <strong>${escapeHtml(dimensions)}</strong>
      <span>${escapeHtml(preset.detail)}${escapeHtml(examples)}</span>
      <dl>
        <div>
          <dt>Nominal</dt>
          <dd>${escapeHtml(preset.nominalSize)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>${escapeHtml(preset.source)}</dd>
        </div>
        <div>
          <dt>Fans</dt>
          <dd>${totalFans}</dd>
        </div>
      </dl>
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

function formatExamples(examples: readonly string[]): string {
  return examples.length > 0 ? ` (${examples.join(", ")})` : "";
}

function syncExportDiagnostics(layout: ReturnType<typeof createLayout>, mode: "normal" | "attention" = "normal"): void {
  const diagnostics = evaluateBuildDiagnostics(layout);
  const readiness = summarizeBuildReadiness(layout);
  const container = app.querySelector<HTMLElement>("#exportDiagnostics");
  if (container === null) {
    return;
  }

  container.classList.toggle("needs-attention", mode === "attention" && diagnostics.length > 0);
  container.innerHTML = `
    ${diagnosticItem(readiness)}
    ${diagnostics.map((diagnostic) => diagnosticItem(diagnostic)).join("")}
  `;
}

function diagnosticItem(diagnostic: BuildDiagnostic): string {
  return `<div class="diagnostic-item ${diagnostic.severity}">
    <strong>${escapeHtml(diagnostic.title)}</strong>
    <span>${escapeHtml(diagnostic.detail)}</span>
  </div>`;
}

function exportDrawing(): void {
  const layout = createLayout(settings);
  const diagnostics = evaluateBuildDiagnostics(layout);
  syncExportDiagnostics(layout, diagnostics.length > 0 ? "attention" : "normal");
  if (diagnostics.length > 0 && controlsTab !== "cutting") {
    controlsTab = "cutting";
    syncControlTabs();
    syncUrl();
    flashDownloadButtons("Review checks");
    return;
  }

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

function openCutSheetDialog(): void {
  const dialog = requireElement(
    app.querySelector<HTMLDialogElement>("#cutSheetDialog"),
    "Cut sheet dialog not found",
  );
  syncCutSheetDialog(createLayout(settings));
  if (!dialog.open) {
    dialog.showModal();
  }
}

function closeCutSheetDialog(): void {
  const dialog = requireElement(
    app.querySelector<HTMLDialogElement>("#cutSheetDialog"),
    "Cut sheet dialog not found",
  );
  dialog.close();
}

function syncOpenCutSheetDialog(layout: ReturnType<typeof createLayout>): void {
  const dialog = app.querySelector<HTMLDialogElement>("#cutSheetDialog");
  if (dialog?.open === true) {
    syncCutSheetDialog(layout);
  }
}

function syncCutSheetDialog(layout: ReturnType<typeof createLayout>): void {
  const preview = requireElement(
    app.querySelector<HTMLElement>("#cutSheetDialogPreview"),
    "Cut sheet dialog preview not found",
  );
  preview.innerHTML = createLaserSvg(layout);
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
  params.set("previewMode", previewMode);
  params.set("controlsTab", controlsTab);
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

function totalResolvedFans(resolvedFans: ReturnType<typeof createLayout>["summary"]["resolvedFans"]): number {
  return resolvedFans.left + resolvedFans.right + resolvedFans.top + resolvedFans.bottom;
}

function requireElement<T extends Element>(element: T | null, message: string): T {
  if (element === null) {
    throw new Error(message);
  }
  return element;
}
