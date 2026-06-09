import { describe, expect, test } from "bun:test";
import {
  applyFanProductPreset,
  applyFilterPreset,
  applyDonutFilterPreset,
  applyPrintDesignPreset,
  applyTempestArrangementDefaults,
  decodeSettings,
  defaultSettings,
  encodeSettings,
  donutFilterPresets,
  findDonutFilterPreset,
  isStaticReferencePrintDesignId,
  normalizeSettings,
  printDesignPresets,
  publicPrintDesignPresets,
  publicThreeDimensionalPrintDesignPresets,
  staticPrintReferenceForPreset,
} from "@/domain/purifier/airPurifier";
import { customFanProductPresetId } from "@/domain/purifier/fanProducts";
import { createLaserSvg, createLayout, requireCutPanelFabricationPlan } from "@/fabrication/purifierLayout";
import { customFilterPresetId, filterPresets, filterSelectionDimensions } from "@/domain/purifier/filter";
import { createAssemblyModel } from "@/fabrication/assemblyModel";
import { evaluateBuildDiagnostics, summarizeBuildReadiness } from "@/fabrication/buildDiagnostics";
import {
  createPrintableKit,
  createPrintableThreeMfExport,
  findPrintVolumePreset,
  partFitsPrintBed,
  printVolumePresets,
  type PrintVolumePresetId,
} from "@/fabrication/printing/printableKit";
import { createPrintDesignKit, createPrintDesignThreeMfExport } from "@/fabrication/printing/printDesignKit";
import { createDonutFilterModel, donutAdapterTotalHeight, donutCapTotalHeight } from "@/domain/designs/donut-filter/model";
import { createTempestModel } from "@/domain/designs/tempest/model";
import { createPrintableSheetPlan } from "@/fabrication/printing/printableKit";
import { createTempestSettingsFromLayout } from "@/fabrication/printing/designs/tempest/printableKit";
import { createThreeMfPackage, type MeshObject } from "@/fabrication/printing/threeMf";
import {
  staticPrintReferenceHasAssembledPreview,
  staticPrintReferenceHasPlatePreview,
} from "@/resources/static-print-references/references";

// #######################################
// Workflow Tests
// #######################################

describe("FilterBoxBuilder purifier workflow", () => {
  // ##############################
  // Settings and Catalogs
  // ##############################

  test("can hide installed filter media without changing the cut sheet", () => {
    const withFilters = createLayout({ ...defaultSettings, showFilterMedia: true, showFans: true, showBananaScale: false });
    const withoutFilters = createLayout({ ...defaultSettings, showFilterMedia: false, showFans: false, showBananaScale: true });
    const encoded = encodeSettings(withoutFilters.rawSettings);

    expect(withoutFilters.rawSettings.showFilterMedia).toBe(false);
    expect(withoutFilters.rawSettings.showFans).toBe(false);
    expect(withoutFilters.rawSettings.showBananaScale).toBe(true);
    expect(cutSheet(withoutFilters)).toEqual(cutSheet(withFilters));
    expect(decodeSettings(encoded).showFilterMedia).toBe(false);
    expect(decodeSettings(encoded).showFans).toBe(false);
    expect(decodeSettings(encoded).showBananaScale).toBe(true);
  });

  test("drops the removed transparent wall preview URL setting", () => {
    const decoded = decodeSettings("transparentWalls=1");
    const previewOptions = createLayout(decoded).configuration.preview.enclosure;

    expect("transparentWalls" in decoded).toBe(false);
    expect("transparentWalls" in previewOptions).toBe(false);
    expect(encodeSettings(decoded)).not.toContain("transparentWalls");
  });

  test("uses purchasable filter presets while preserving custom measured dimensions", () => {
    const luggablePreset = requiredFilterPreset("merv13-20x25x1");
    const luggableSettings = createLayout(applyFilterPreset(defaultSettings, luggablePreset.id)).rawSettings;

    expect(luggableSettings.filterPreset).toBe("merv13-20x25x1");
    expect(luggableSettings.filterWidth).toBeCloseTo(luggablePreset.dimensions.width);
    expect(luggableSettings.filterDepth).toBeCloseTo(luggablePreset.dimensions.depth);
    expect(luggableSettings.filterThickness).toBeCloseTo(luggablePreset.dimensions.thickness);

    const customSettings = decodeSettings("filterWidth=300&filterDepth=240&filterThickness=22");
    expect(customSettings.filterPreset).toBe(customFilterPresetId);
    expect(customSettings.filterWidth).toBe(300);
    expect(customSettings.filterDepth).toBe(240);
    expect(customSettings.filterThickness).toBe(22);

    const encodedCustom = encodeSettings(customSettings);
    expect(decodeSettings(encodedCustom).filterPreset).toBe(customFilterPresetId);
  });

  test("includes the Air Fanta compatible replacement filter as an exact rectangular preset", () => {
    const preset = requiredFilterPreset("air-fanta-compatible");
    const settings = createLayout(applyFilterPreset(defaultSettings, preset.id)).rawSettings;
    const presetTower = createLayout(decodeSettings("printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower"));
    const customTower = createLayout(
      decodeSettings(
        "printDesign=nukit-tempest&tempestArrangement=four-side-filter-tower&filterPreset=custom&filterWidth=290&filterDepth=290&filterThickness=25",
      ),
    );

    expect(preset.label).toBe("Air Fanta compatible");
    expect(preset.nominalSize).toBe("29 x 29 x 2.5 cm");
    expect(settings.filterPreset).toBe("air-fanta-compatible");
    expect(settings.filterWidth).toBe(290);
    expect(settings.filterDepth).toBe(290);
    expect(settings.filterThickness).toBe(25);
    expect(customTower.rawSettings.filterThickness).toBe(25);
    expect(createTempestModel(createTempestSettingsFromLayout(customTower)).box).toEqual(
      createTempestModel(createTempestSettingsFromLayout(presetTower)).box,
    );
  });

  test("uses fan product presets for product help, cut hole size, and encoded URLs", () => {
    const mobiusSettings = applyFanProductPreset(defaultSettings, "cleanairkits-mobius-120p");
    const layout = createLayout(mobiusSettings);
    const fanPanel = requiredFanPanel(layout);
    const fanCut = requiredCircleCut(fanPanel, "fan");
    const encoded = encodeSettings(layout.rawSettings);
    const decoded = decodeSettings(encoded);

    expect(layout.rawSettings.fanPreset).toBe("cleanairkits-mobius-120p");
    expect(layout.rawSettings.fanDiameter).toBe(120);
    expect(layout.configuration.fan.productSelection.type).toBe("preset");
    expect(layout.configuration.fan.productSelection.product.appearance.accentColor).toBe(0x50b8ff);
    expect(fanCut.radius).toBeCloseTo((120 - 4) / 2 - defaultSettings.kerfFit);
    expect(decoded.fanPreset).toBe("cleanairkits-mobius-120p");
    expect(decoded.fanDiameter).toBe(120);
  });

  test("preserves legacy custom fan diameters and lets fan presets own their diameter", () => {
    const legacyCustom = decodeSettings("fanDiameter=120");
    const legacyCustom92 = decodeSettings("fanDiameter=92");
    const noctuaUrl = decodeSettings("fanPreset=noctua-nf-a14&fanDiameter=120");
    const noctuaLayout = createLayout(noctuaUrl);
    const noctuaPrintExport = createPrintableThreeMfExport(noctuaLayout, "bed-256");
    const noctuaPrintContent = new TextDecoder("latin1").decode(noctuaPrintExport.bytes);

    expect(legacyCustom.fanPreset).toBe(customFanProductPresetId);
    expect(legacyCustom.fanDiameter).toBe(120);
    expect(legacyCustom92.fanPreset).toBe(customFanProductPresetId);
    expect(legacyCustom92.fanDiameter).toBe(92);
    expect(noctuaUrl.fanPreset).toBe("noctua-nf-a14");
    expect(noctuaUrl.fanDiameter).toBe(140);
    expect(noctuaLayout.configuration.fan.productSelection.type).toBe("preset");
    expect(noctuaLayout.configuration.fan.productSelection.product.appearance.previewCadModel).toEqual({
      type: "noctua-nf-a14-public-cad",
      sourceUrl: "https://www.noctua.at/en/3d-cad-models",
      assetUrl: "/vendor/fan-preview/noctua/nf-a14-public-cad-preview.json",
      usage: "preview-only",
    });
    expect(noctuaPrintContent).not.toContain("A14_Frame_Public");
    expect(noctuaPrintContent).not.toContain("Noctua NF-A14 Public CAD");
  });

  test("keeps URL boundary parsing valid for booleans, fan counts, and constrained rims", () => {
    const malformedBoolean = decodeSettings("showFans=maybe");
    const explicitFalse = decodeSettings("showFans=0");
    const rotationDisabled = decodeSettings("autoRotate=0");
    const bananaEnabled = decodeSettings("showBananaScale=1");
    const printSeamsEnabled = decodeSettings("showPrintSeams=1");
    const previewEdgesEnabled = decodeSettings("showPreviewEdges=1");
    const defaultPreviewColor = decodeSettings("");
    const grayPreviewColor = decodeSettings("previewMaterialColor=matte-gray");
    const previewColor = decodeSettings("previewMaterialColor=natural-tan");
    const invalidPreviewColor = decodeSettings("previewMaterialColor=neon");
    const removedPrintPlateLabels = decodeSettings("showPrintPlateLabels=1");
    const highFanCount = decodeSettings("fansLeft=8");
    const emptyNumericParams = decodeSettings("filterPreset=custom&filterWidth=&filterDepth=%20&filterThickness=&rim=%20");
    const smallCustomLayout = createLayout({
      ...defaultSettings,
      filterPreset: customFilterPresetId,
      filterWidth: 120,
      filterDepth: 120,
      materialThickness: 9,
      rim: 90,
    });

    expect(malformedBoolean.showFans).toBe(defaultSettings.showFans);
    expect(explicitFalse.showFans).toBe(false);
    expect(rotationDisabled.autoRotate).toBe(false);
    expect(bananaEnabled.showBananaScale).toBe(true);
    expect(printSeamsEnabled.showPrintSeams).toBe(true);
    expect(previewEdgesEnabled.showPreviewEdges).toBe(true);
    expect(defaultPreviewColor.previewMaterialColor).toBe("matte-black");
    expect(grayPreviewColor.previewMaterialColor).toBe("matte-gray");
    expect(previewColor.previewMaterialColor).toBe("natural-tan");
    expect(invalidPreviewColor.previewMaterialColor).toBe(defaultSettings.previewMaterialColor);
    expect("showPrintPlateLabels" in removedPrintPlateLabels).toBe(false);
    expect(encodeSettings(removedPrintPlateLabels)).not.toContain("showPrintPlateLabels");
    expect(highFanCount.fansLeft).toBe(8);
    expect(emptyNumericParams.filterWidth).toBe(defaultSettings.filterWidth);
    expect(emptyNumericParams.filterDepth).toBe(defaultSettings.filterDepth);
    expect(emptyNumericParams.filterThickness).toBe(defaultSettings.filterThickness);
    expect(emptyNumericParams.rim).toBe(defaultSettings.rim);
    expect(smallCustomLayout.rawSettings.rim).toBeLessThanOrEqual((smallCustomLayout.summary.workingDepth - 1) / 2);
    expect(cutPanels(smallCustomLayout).every((panel) => panel.width > 0 && panel.height > 0)).toBe(true);
  });

  test("imports useful legacy FilterBoxBuilder parameters as canonical settings", () => {
    const decoded = decodeSettings(
      [
        "x=300",
        "y=240",
        "filter_height=22",
        "fan_diameter=120",
        "filters=1",
        "split_frames=0",
        "fans_left=2",
        "fans_right=1",
        "fans_top=0",
        "fans_bottom=0",
        "thickness=5",
        "burn=0.2",
        "screw_holes=4",
        "reference=50",
        "FingerJoint_finger=3",
        "FingerJoint_space=2.5",
        "FingerJoint_play=0.1",
        "FingerJoint_width=1.2",
        "FingerJoint_edge_width=1.8",
        "DoveTail_size=2.5",
        "DoveTail_depth=1.3",
        "DoveTail_angle=40",
      ].join("&"),
    );
    const encoded = encodeSettings(decoded);

    expect(decoded.filterPreset).toBe(customFilterPresetId);
    expect(decoded.filterWidth).toBe(300);
    expect(decoded.filterDepth).toBe(240);
    expect(decoded.filterThickness).toBe(22);
    expect(decoded.fanPreset).toBe(customFanProductPresetId);
    expect(decoded.fanDiameter).toBe(120);
    expect(decoded.filters).toBe(1);
    expect(decoded.splitFrames).toBe(false);
    expect(decoded.fansLeft).toBe(2);
    expect(decoded.fansRight).toBe(1);
    expect(decoded.materialThickness).toBe(5);
    expect(decoded.kerfFit).toBe(0.2);
    expect(decoded.screwHoleDiameter).toBe(4);
    expect(decoded.referenceScale).toBe(50);
    expect(decoded.fingerWidthMultiplier).toBe(3);
    expect(decoded.fingerSpaceMultiplier).toBe(2.5);
    expect(decoded.fingerPlayMultiplier).toBe(0.1);
    expect(decoded.fingerHoleWidthMultiplier).toBe(1.2);
    expect(decoded.fingerHoleOffsetMultiplier).toBe(1.8);
    expect(decoded.dovetailSizeMultiplier).toBe(2.5);
    expect(decoded.dovetailDepthMultiplier).toBe(1.3);
    expect(decoded.dovetailTaper).toBe(40);
    expect(encoded).toContain("filterWidth=300");
    expect(encoded).toContain("fingerWidthMultiplier=3");
    expect(encoded).not.toContain("FingerJoint_finger");
  });

  test("uses advanced joint tuning for slots and dovetail rail profiles", () => {
    const baseline = createLayout(defaultSettings);
    const tuned = createLayout({
      ...defaultSettings,
      fingerWidthMultiplier: 3,
      fingerSpaceMultiplier: 2.5,
      fingerPlayMultiplier: 0.2,
      fingerHoleWidthMultiplier: 1.4,
      fingerHoleOffsetMultiplier: 2,
      dovetailSizeMultiplier: 1.5,
      dovetailDepthMultiplier: 1.4,
      dovetailTaper: 20,
    });
    const baselinePanel = requiredPanel(cutPanels(baseline), "left-side-wall");
    const tunedPanel = requiredPanel(cutPanels(tuned), "left-side-wall");
    const baselineSlot = requiredRectCut(baselinePanel, "finger-hole");
    const tunedSlot = requiredRectCut(tunedPanel, "finger-hole");
    const baselineRail = requiredPanel(cutPanels(baseline), "filter-1-front-long-rail");
    const tunedRail = requiredPanel(cutPanels(tuned), "filter-1-front-long-rail");

    expect(tuned.configuration.cutting.joints.finger.widthMultiplier).toBe(3);
    expect(tuned.configuration.cutting.joints.dovetail.depthMultiplier).toBe(1.4);
    expect(tunedSlot.height).toBeCloseTo(defaultSettings.materialThickness * (1.4 + 0.2) - 2 * defaultSettings.kerfFit);
    expect(tunedSlot.y).not.toBeCloseTo(baselineSlot.y);
    expect(tunedPanel.cuts.filter((cut) => cut.type === "rect" && cut.role === "finger-hole").length).toBeLessThan(
      baselinePanel.cuts.filter((cut) => cut.type === "rect" && cut.role === "finger-hole").length,
    );
    expect(roundedInteriorYValues(tunedRail)).not.toEqual(roundedInteriorYValues(baselineRail));
    expect(Math.min(...roundedInteriorYValues(tunedRail))).toBeCloseTo(
      defaultSettings.rim - defaultSettings.materialThickness * 1.4,
    );
  });

  test("keeps preset dimensions derived from the preset id", () => {
    const normalized = normalizeSettings(defaultSettings);
    const normalizedAgain = normalizeSettings(normalized);
    const dimensions = filterSelectionDimensions(normalized.filter);

    expect(normalized.filter).toEqual({ type: "preset", presetId: "merv13-20x25x1" });
    expect(dimensions).toEqual({
      width: defaultSettings.filterWidth,
      depth: defaultSettings.filterDepth,
      thickness: defaultSettings.filterThickness,
    });
    Object.assign(dimensions, { width: 1 });
    expect(filterSelectionDimensions(normalized.filter).width).toBe(defaultSettings.filterWidth);
    expect(normalizedAgain).toEqual(normalized);
  });

  test("keeps structured design variants stable when normalized again", () => {
    for (const printDesign of ["donut-hepa-adapter", "static-cr-14x20-base"] as const) {
      const normalized = normalizeSettings(applyPrintDesignPreset(defaultSettings, printDesign));
      const normalizedAgain = normalizeSettings(normalized);

      expect(normalizedAgain.printDesign.id).toBe(printDesign);
      expect(normalizedAgain.design).toEqual(normalized.design);
    }
  });

  // ##############################
  // Assembly and Diagnostics
  // ##############################

  test("builds explicit assembly parts for walls, filter frames, media, and dimensions", () => {
    const layout = createLayout(defaultSettings);
    const assembly = createAssemblyModel(layout);
    const frontRailPanel = requiredPanel(cutPanels(layout), "filter-1-front-long-rail");
    const frontRail = assembly.filterRails.find((part) => part.id === "filter-1-front-long-rail");
    const innerRail = assembly.filterRails.find((part) => part.id === "filter-1-inner-long-rail");
    const lowerFilterY = -layout.summary.chamberHeight / 2 + defaultSettings.filterThickness / 2;
    const upperFilterY = layout.summary.chamberHeight / 2 - defaultSettings.filterThickness / 2;
    const lowerOuterFrameY = -layout.summary.chamberHeight / 2 + defaultSettings.materialThickness / 2;
    const lowerInnerFrameY =
      -layout.summary.chamberHeight / 2 + defaultSettings.filterThickness + defaultSettings.materialThickness / 2;

    expect(assembly.panels.map((part) => part.role).sort()).toEqual([
      "front-fan-wall",
      "left-side-wall",
      "rear-fan-wall",
      "right-side-wall",
    ]);
    expect(assembly.filterRails).toHaveLength(16);
    expect(assembly.filterRails.every((part) => part.role === "filter-rail" && part.panel.outline.length > 4)).toBe(true);
    expect(assembly.filterFrames).toHaveLength(8);
    expect(assembly.filterMedia).toHaveLength(2);
    expect(assembly.seams).toHaveLength(12);
    expect(assembly.dimensions.map((dimension) => dimension.label)).toEqual(["W", "H", "D"]);
    expect(assembly.dimensions.map((dimension) => dimension.measurement.description)).toEqual([
      "outside width",
      "outside height",
      "outside depth",
    ]);
    expect(assembly.dimensions[0]?.measurement.value).toBe(layout.rawSettings.filterWidth);
    expect(assembly.dimensions[1]?.measurement.value).toBe(layout.summary.chamberHeight);
    expect(assembly.dimensions[2]?.measurement.value).toBe(layout.summary.workingDepth);
    expect(assembly.dimensions.every((dimension) => dimension.labelOffset.length === 3)).toBe(true);
    expect(frontRailPanel.assembly).toEqual({ type: "filter-rail", filterIndex: 0, railKey: "front-long" });
    expect(frontRail?.position[1]).toBeCloseTo(lowerOuterFrameY);
    expect(frontRail?.position[2]).toBeCloseTo(-layout.summary.workingDepth / 2 + defaultSettings.rim / 2);
    expect(frontRail?.rotation).toEqual([Math.PI / 2, 0, 0]);
    expect(innerRail?.position[1]).toBeCloseTo(lowerInnerFrameY);
    expect(innerRail?.position[2]).toBeCloseTo(-layout.summary.workingDepth / 2 + defaultSettings.rim / 2);
    expect(innerRail?.rotation).toEqual([Math.PI / 2, 0, 0]);
    expect(assembly.filterMedia[0]?.position[1]).toBeCloseTo(lowerFilterY);
    expect(assembly.filterMedia[1]?.position[1]).toBeCloseTo(upperFilterY);
    expect(assembly.filterMedia[0]?.size[0]).toBeCloseTo(defaultSettings.filterWidth);
    expect(assembly.filterMedia[0]?.size[1]).toBeCloseTo(defaultSettings.filterThickness);
    expect(assembly.filterMedia[0]?.size[2]).toBeCloseTo(defaultSettings.filterDepth);
  });

  test("assembles unsplit filter frame panels on horizontal filter faces", () => {
    const layout = createLayout({ ...defaultSettings, splitFrames: false });
    const assembly = createAssemblyModel(layout);
    const lowerOuterFrameY = -layout.summary.chamberHeight / 2 + defaultSettings.materialThickness / 2;
    const lowerInnerFrameY =
      -layout.summary.chamberHeight / 2 + defaultSettings.filterThickness + defaultSettings.materialThickness / 2;
    const frontFrame = assembly.filterRails.find((part) => part.id === "filter-1-front-frame");
    const rearFrame = assembly.filterRails.find((part) => part.id === "filter-1-rear-frame");

    expect(assembly.filterRails).toHaveLength(4);
    expect(frontFrame?.role).toBe("filter-frame-panel");
    expect(frontFrame?.position[0]).toBe(0);
    expect(frontFrame?.position[1]).toBeCloseTo(lowerOuterFrameY);
    expect(frontFrame?.position[2]).toBe(0);
    expect(rearFrame?.position[0]).toBe(0);
    expect(rearFrame?.position[1]).toBeCloseTo(lowerInnerFrameY);
    expect(rearFrame?.position[2]).toBe(0);
    expect(frontFrame?.rotation).toEqual([Math.PI / 2, 0, 0]);
    expect(rearFrame?.rotation).toEqual([Math.PI / 2, 0, 0]);
  });

  test("assembles the one-filter closed back as the opposite horizontal face", () => {
    const layout = createLayout({ ...defaultSettings, filters: 1 });
    const assembly = createAssemblyModel(layout);
    const closedBack = assembly.panels.find((part) => part.id === "closed-back-panel");
    const closedBackY = layout.summary.chamberHeight / 2 - defaultSettings.materialThickness / 2;
    const filterMedia = assembly.filterMedia.find((part) => part.id === "filter-media-1");

    expect(closedBack?.role).toBe("closed-back");
    expect(closedBack?.position[0]).toBe(0);
    expect(closedBack?.position[1]).toBeCloseTo(closedBackY);
    expect(closedBack?.position[2]).toBe(0);
    expect(closedBack?.rotation).toEqual([Math.PI / 2, 0, 0]);
    expect(filterMedia?.size).toEqual([
      defaultSettings.filterWidth,
      defaultSettings.filterThickness,
      defaultSettings.filterDepth,
    ]);
  });

  test("keeps one-filter top teeth aligned around the closed-back face", () => {
    const layout = createLayout({ ...defaultSettings, filters: 1 });
    const assembly = createAssemblyModel(layout);
    const frontWall = requiredAssemblyPanel(assembly, "bottom-fan-wall");
    const rearWall = requiredAssemblyPanel(assembly, "top-fan-wall");
    const leftWall = requiredAssemblyPanel(assembly, "left-side-wall");
    const rightWall = requiredAssemblyPanel(assembly, "right-side-wall");

    expect(panelTopToothY(rearWall)).toBeCloseTo(panelTopToothY(frontWall));
    expect(panelTopToothY(leftWall)).toBeCloseTo(panelTopToothY(frontWall));
    expect(panelTopToothY(rightWall)).toBeCloseTo(panelTopToothY(frontWall));
  });

  test("reports export readiness warnings before drawing export", () => {
    const defaultLayout = createLayout(defaultSettings);
    expect(evaluateBuildDiagnostics(defaultLayout)).toEqual([]);
    expect(summarizeBuildReadiness(defaultLayout).severity).toBe("info");

    const noFanLayout = createLayout({
      ...defaultSettings,
      fansLeft: 0,
      fansRight: 0,
      fansTop: 0,
      fansBottom: 0,
    });
    expect(evaluateBuildDiagnostics(noFanLayout).map((diagnostic) => diagnostic.id)).toContain("no-fans");

    const customLayout = createLayout({
      ...defaultSettings,
      filterPreset: customFilterPresetId,
      filterWidth: 130,
      filterDepth: 130,
      filterThickness: 10,
    });
    expect(evaluateBuildDiagnostics(customLayout).map((diagnostic) => diagnostic.id)).toContain("custom-filter-range");
  });

  test("keeps generated print designs out of wall-bank fan diagnostics", () => {
    const donutLayout = createLayout(applyPrintDesignPreset(defaultSettings, "donut-hepa-adapter"));

    expect(donutLayout.summary.fans).toEqual({ type: "donut-filter-adapter", fanCount: 1 });
    expect(evaluateBuildDiagnostics(donutLayout).map((diagnostic) => diagnostic.id)).not.toContain("no-fans");
  });

  test("models fabrication artifacts as explicit layout variants", () => {
    const cutPanelLayout = createLayout(defaultSettings);
    const donutLayout = createLayout(applyPrintDesignPreset(defaultSettings, "donut-hepa-adapter"));
    const staticLayout = createLayout(applyPrintDesignPreset(defaultSettings, "static-cr-14x20-base"));

    expect(cutPanelLayout.fabrication.type).toBe("cut-panel-source");
    expect(cutPanelLayout.summary.fabrication.type).toBe("cut-panel-source");
    expect(donutLayout.fabrication).toEqual({ type: "generated-print-design", designType: "donut-filter-adapter" });
    expect(donutLayout.summary.fabrication).toEqual({ type: "generated-print-design", designType: "donut-filter-adapter" });
    expect(staticLayout.fabrication.type).toBe("static-print-reference");
    expect(staticLayout.summary.fabrication).toEqual({
      type: "static-print-reference",
      sourceFileCount: staticPrintReferenceForPreset(staticLayout.configuration.printDesign)?.previewAssets.length ?? 0,
      localPlatePreviewCount: staticPrintReferenceForPreset(staticLayout.configuration.printDesign)?.platePreviewAssets.length ?? 0,
    });
    expect(() => createLaserSvg(donutLayout)).toThrow("does not have cut-panel fabrication");
  });

  // ##############################
  // Printable Beds and Static Designs
  // ##############################

  test("splits printable kits to fit common desktop printer beds", () => {
    const layout = createLayout(defaultSettings);
    const boundedPresetIds = printVolumePresets
      .filter((preset) => preset.bed.type === "bounded")
      .map((preset) => preset.id);

    expect(boundedPresetIds).toEqual([
      "bed-180",
      "bed-220",
      "bed-225",
      "bed-prusa-mk",
      "bed-256",
      "bed-300",
      "bed-h2-safe",
      "bed-350",
      "bed-prusa-xl",
      "bed-420",
    ] satisfies readonly PrintVolumePresetId[]);

    for (const presetId of boundedPresetIds) {
      const kit = createPrintableKit(layout, presetId);

      expect(kit.summary.partCount).toBeGreaterThan(cutPanels(layout).length);
      expect(kit.summary.splitPanelCount).toBeGreaterThan(0);
      expect(kit.summary.glueKeyCount).toBeGreaterThan(0);
      expect(kit.summary.retainedPrintCriticalCutFeatureCount).toBe(kit.summary.sourcePrintCriticalCutFeatureCount);
      if (presetId === "bed-180") {
        expect(kit.summary.oversizedPartCount).toBeGreaterThan(0);
      } else {
        expect(kit.summary.oversizedPartCount).toBe(0);
        expect(kit.parts.every((part) => partFitsPrintBed(part, kit.preset.bed))).toBe(true);
      }
      expect(kit.parts.some((part) => part.kind === "dovetail-glue-key")).toBe(true);
      expect(
        kit.parts
          .filter((part) => part.kind === "panel-tile")
          .some((part) => part.sourceTile !== undefined && part.sourceTile.columnCount + part.sourceTile.rowCount > 2),
      ).toBe(true);
    }
  });

  test("keeps the 256 mm print bed as the default and redirects the legacy 320 mm URL", () => {
    expect(findPrintVolumePreset(null).id).toBe("bed-256");
    expect(findPrintVolumePreset("bed-320").id).toBe("bed-h2-safe");
  });

  test("keeps public print designs split between generated and curated static models", () => {
    expect(publicPrintDesignPresets.map((preset) => preset.id)).toEqual([
      "nukit-open-air",
      "nukit-tempest",
      "static-cr-14x20-base",
    ]);
    expect(publicThreeDimensionalPrintDesignPresets.map((preset) => preset.id)).toEqual([
      "nukit-tempest",
      "static-cr-14x20-base",
    ]);
    expect(printDesignPresets.map((preset) => preset.id)).toContain("donut-hepa-adapter");
    expect(printDesignPresets.map((preset) => preset.id)).toContain("nukit-tempest");
    expect(publicPrintDesignPresets[0]?.detail).toContain("dovetail lap keys");
    expect(publicPrintDesignPresets.filter((preset) => isStaticReferencePrintDesignId(preset.id))).toHaveLength(1);
    expect(publicPrintDesignPresets.find((preset) => preset.id === "static-cr-14x20-base")).toBeDefined();
    const staticCr16x20Preset = printDesignPresets.find((preset) => preset.id === "static-cr-16x20-140");
    const staticCr14x20Preset = printDesignPresets.find((preset) => preset.id === "static-cr-14x20-base");
    const staticCr16x20Reference = staticCr16x20Preset === undefined ? undefined : staticPrintReferenceForPreset(staticCr16x20Preset);
    const staticCr14x20Reference = staticCr14x20Preset === undefined ? undefined : staticPrintReferenceForPreset(staticCr14x20Preset);

    expect(staticCr16x20Preset?.releaseVisibility).toBe("internal");
    expect(staticCr14x20Preset?.releaseVisibility).toBe("public");
    expect(staticPrintReferenceHasPlatePreview(staticCr16x20Reference)).toBe(true);
    expect(staticPrintReferenceHasAssembledPreview(staticCr16x20Reference)).toBe(false);
    expect(staticPrintReferenceHasPlatePreview(staticCr14x20Reference)).toBe(true);
    expect(staticPrintReferenceHasAssembledPreview(staticCr14x20Reference)).toBe(true);
    expect(staticCr16x20Reference?.previewAssets).toHaveLength(15);
    expect(staticCr14x20Reference?.assembledPreview).toEqual({
      type: "source-part-set",
      assets: expect.any(Array),
    });
    expect(staticCr14x20Reference?.assembledPreviewOrientation).toBe("source-fans-up");
    expect(
      staticCr14x20Reference?.assembledPreview?.type === "source-part-set"
        ? staticCr14x20Reference.assembledPreview.assets
        : [],
    ).toHaveLength(12);
    expect(staticCr14x20Reference?.platePreviewAssets).toHaveLength(19);
    expect(staticCr14x20Reference?.previewAssets).toHaveLength(20);
    expect(staticCr14x20Preset?.implementation.type).toBe("static-reference");
    expect(staticCr14x20Preset?.implementation.type === "static-reference" ? staticCr14x20Preset.implementation.defaults.fanCount : undefined).toBe(4);
    expect(staticCr14x20Preset?.implementation.type === "static-reference" ? staticCr14x20Preset.implementation.defaults.filterCount : undefined).toBe(2);
    expect(staticCr14x20Preset?.implementation.type === "static-reference" ? staticCr14x20Preset.implementation.defaults.filterPreset : undefined).toBe(
      "merv13-14x20x1",
    );
    expect(staticCr14x20Reference?.printEstimate?.estimatedFilamentKilograms).toBe(1);
    expect(staticCr14x20Reference?.printEstimate?.assumptions.infillPercent).toBe(15);
    const externalStaticReferencePreset = printDesignPresets.find((preset) => preset.id === "static-modular-20x20-reference");
    const externalStaticReference =
      externalStaticReferencePreset === undefined ? undefined : staticPrintReferenceForPreset(externalStaticReferencePreset);
    expect(externalStaticReference?.usePolicy.type).toBe("external-only");
    expect(externalStaticReferencePreset?.releaseVisibility).toBe("internal");
    expect(staticPrintReferenceHasPlatePreview(externalStaticReference)).toBe(false);
    expect(staticPrintReferenceHasAssembledPreview(externalStaticReference)).toBe(false);
    expect(defaultSettings.materialThickness).toBe(6);
  });

  test("applies Tempest printable design defaults and exports generated chunks", () => {
    const horizontalSettings = applyPrintDesignPreset(defaultSettings, "nukit-tempest");
    const towerSettings = applyTempestArrangementDefaults(horizontalSettings, "four-side-filter-tower");
    const horizontalLayout = createLayout(horizontalSettings);
    const towerLayout = createLayout(towerSettings);
    const horizontalKit = createPrintDesignKit(horizontalLayout, "bed-256");
    const towerModel = createTempestModel(createTempestSettingsFromLayout(towerLayout));
    const printExport = createPrintDesignThreeMfExport(horizontalLayout, "bed-256");

    expect(horizontalSettings.filterPreset).toBe("merv13-20x20x2");
    expect(horizontalSettings.tempestArrangement).toBe("dual-horizontal-sandwich");
    expect(towerSettings.filterPreset).toBe("air-fanta-compatible");
    expect(towerSettings.filterWidth).toBe(290);
    expect(towerSettings.filterDepth).toBe(290);
    expect(towerSettings.filterThickness).toBe(25);
    expect(horizontalSettings.fanPreset).toBe("nukit-arctic-p14");
    expect(horizontalSettings.materialThickness).toBe(5);
    expect(horizontalLayout.configuration.design.type).toBe("tempest");
    expect(horizontalLayout.summary.fans.type).toBe("tempest");
    expect(horizontalLayout.summary.fans.type === "tempest" ? horizontalLayout.summary.fans.arrangement : undefined).toBe(
      "dual-horizontal-sandwich",
    );
    // Feature-aware slicing splits the fan-dense axis into 3, so 2×2×3 = 12.
    expect(horizontalKit.parts).toHaveLength(12);
    expect(horizontalKit.parts.every((part) => part.kind === "tempest-print-chunk")).toBe(true);
    expect(towerLayout.configuration.design.type).toBe("tempest");
    expect(towerLayout.summary.fans.type === "tempest" ? towerLayout.summary.fans.arrangement : undefined).toBe("four-side-filter-tower");
    expect(towerModel.box.width).toBe(370);
    expect(towerModel.box.height).toBe(305);
    expect(towerLayout.summary.fans.type === "tempest" ? towerLayout.summary.fans.fanCount : undefined).toBe(4);
    expect(towerModel.chunkGrid.totalCount).toBe(8);
    expect(printExport.filename).toBe("nukit-tempest-print-kit.3mf");
    expect(printExport.mimeType).toBe("model/3mf");
  }, 10000);

  test("applies static reference defaults without making them parametric generators", () => {
    const settings = applyPrintDesignPreset(defaultSettings, "static-cr-16x20-140");
    const decoded = decodeSettings(encodeSettings(settings));
    const layout = createLayout(settings);

    expect(settings.printDesign).toBe("static-cr-16x20-140");
    expect(settings.filterPreset).toBe("merv13-16x20x1");
    expect(settings.fanPreset).toBe("nukit-arctic-p14");
    expect(settings.fansTop).toBe(5);
    expect(settings.splitFrames).toBe(false);
    expect(decoded.printDesign).toBe("static-cr-16x20-140");
    expect(layout.configuration.design.type).toBe("static-reference");
    expect(layout.configuration.design.type === "static-reference" ? layout.configuration.design.fanCount : undefined).toBe(5);
    expect(layout.configuration.design.type === "static-reference" ? layout.configuration.design.capabilities.localPrintPlatePreview.type : undefined).toBe(
      "available",
    );
    expect(staticPrintReferenceForPreset(layout.configuration.printDesign)?.printablesId).toBe("1251061");
    expect(() => createPrintDesignKit(layout, "bed-256")).toThrow(/Static reference designs/);
  });

  // ##############################
  // Donut HEPA Print Design
  // ##############################

  test("generates the donut HEPA fan adaptor from explicit round-filter settings", () => {
    const settings = applyPrintDesignPreset(defaultSettings, "donut-hepa-adapter");
    const layout = createLayout(settings);
    const model = createDonutFilterModel(layout);
    const kit = createPrintDesignKit(layout, "bed-256");
    const printExport = createPrintDesignThreeMfExport(layout, "bed-256");
    const content = new TextDecoder("latin1").decode(printExport.bytes);

    expect(settings.printDesign).toBe("donut-hepa-adapter");
    expect(settings.fanPreset).toBe("arctic-p12-pwm-pst");
    expect(settings.fanDiameter).toBe(120);
    expect(settings.donutFilterPreset).toBe("silentnight-92-reference");
    expect(settings.donutFilterHoleDiameter).toBe(92);
    expect(settings.donutCapEnabled).toBe(true);
    expect(layout.configuration.design.type).toBe("donut-filter-adapter");
    expect(layout.configuration.design.type === "donut-filter-adapter" ? layout.configuration.design.filter.cap : undefined).toEqual({
      type: "printed-cap",
      rim: 10,
    });
    expect(layout.configuration.design.type === "donut-filter-adapter" ? layout.configuration.design.fan.count : undefined).toBe(1);
    expect(model.filter).toEqual({ outerDiameter: 125, length: 150, holeDiameter: 92 });
    expect(model.adapter.screwCenters).toEqual([
      { x: 7.5, y: 7.5 },
      { x: 112.5, y: 7.5 },
      { x: 112.5, y: 112.5 },
      { x: 7.5, y: 112.5 },
    ]);
    expect(donutAdapterTotalHeight(model)).toBeGreaterThan(28);
    expect(donutCapTotalHeight(model)).toBe(11.5);
    expect(kit.parts.map((part) => part.name)).toEqual([
      "Donut filter fan adaptor",
      "Printed fan guard",
      "Press-fit filter blanking cap",
    ]);
    expect(kit.summary.oversizedPartCount).toBe(0);
    expect(kit.parts.every((part) => partFitsPrintBed(part, kit.preset.bed))).toBe(true);
    expect(printExport.filename).toBe("donut-hepa-adapter-print-kit.3mf");
    expect(printExport.mimeType).toBe("model/3mf");
    expect(content).toContain("Donut HEPA fan adaptor print kit");
    expect(content).toContain("Donut filter fan adaptor");
  });

  test("applies donut HEPA defaults for sparse URLs while preserving measured filter edits", () => {
    const defaults = decodeSettings("printDesign=donut-hepa-adapter");
    const measured = decodeSettings("printDesign=donut-hepa-adapter&donutFilterHoleDiameter=86&donutFilterLength=180&donutCapEnabled=false");
    const measuredLayout = createLayout(measured);
    const disabledCapWithRim = decodeSettings("printDesign=donut-hepa-adapter&donutCapEnabled=false&donutCapRim=12");
    const cappedRim = decodeSettings(
      "printDesign=donut-hepa-adapter&donutFilterOuterDiameter=70&donutFilterHoleDiameter=62&donutCapRim=40",
    );
    const presetWithMeasuredLength = decodeSettings(
      "printDesign=donut-hepa-adapter&donutFilterPreset=levoit-core-mini&donutFilterLength=180",
    );
    const preset = decodeSettings("printDesign=donut-hepa-adapter&donutFilterPreset=levoit-core-mini");
    const encoded = encodeSettings(measured);

    expect(defaults.printDesign).toBe("donut-hepa-adapter");
    expect(defaults.donutFilterPreset).toBe("silentnight-92-reference");
    expect(defaults.donutFilterOuterDiameter).toBe(125);
    expect(defaults.donutFilterLength).toBe(150);
    expect(defaults.donutFilterHoleDiameter).toBe(92);
    expect(defaults.fanPreset).toBe("arctic-p12-pwm-pst");
    expect(preset.donutFilterPreset).toBe("levoit-core-mini");
    expect(preset.donutFilterOuterDiameter).toBe(159);
    expect(preset.donutFilterLength).toBe(135);
    expect(measured.donutFilterHoleDiameter).toBe(86);
    expect(measured.donutFilterLength).toBe(180);
    expect(measured.donutCapEnabled).toBe(false);
    expect(disabledCapWithRim.donutCapRim).toBe(12);
    expect(cappedRim.donutCapRim).toBe(4);
    expect(presetWithMeasuredLength.donutFilterPreset).toBe("custom");
    expect(presetWithMeasuredLength.donutFilterOuterDiameter).toBe(159);
    expect(presetWithMeasuredLength.donutFilterLength).toBe(180);
    expect(presetWithMeasuredLength.donutFilterHoleDiameter).toBe(92);
    expect(
      measuredLayout.configuration.design.type === "donut-filter-adapter"
        ? measuredLayout.configuration.design.filter.cap
        : undefined,
    ).toEqual({ type: "none" });
    expect(donutCapTotalHeight(createDonutFilterModel(measuredLayout))).toBe(0);
    expect(measured.donutFilterPreset).toBe("custom");
    expect(encoded).toContain("donutFilterHoleDiameter=86");
    expect(encoded).toContain("donutFilterPreset=custom");
    expect(encoded).toContain("donutCapEnabled=false");
  });

  test("uses explicit round-filter presets and does not clamp large measured cartridges to 320 mm", () => {
    const levoitCore300 = applyDonutFilterPreset(applyPrintDesignPreset(defaultSettings, "donut-hepa-adapter"), "levoit-core-300");
    const measuredLarge = decodeSettings(
      "printDesign=donut-hepa-adapter&donutFilterOuterDiameter=360&donutFilterLength=440&donutFilterHoleDiameter=128",
    );

    expect(donutFilterPresets.map((preset) => preset.id)).toContain("levoit-core-300");
    expect(findDonutFilterPreset("levoit-core-300").productUrl ?? "").toContain("core300");
    expect(levoitCore300.donutFilterOuterDiameter).toBe(193);
    expect(levoitCore300.donutFilterLength).toBe(147);
    expect(levoitCore300.donutFilterHoleDiameter).toBe(120);
    expect(measuredLarge.donutFilterPreset).toBe("custom");
    expect(measuredLarge.donutFilterOuterDiameter).toBe(360);
    expect(measuredLarge.donutFilterLength).toBe(440);
    expect(measuredLarge.donutFilterHoleDiameter).toBe(128);
  });

  // ##############################
  // 3MF Export
  // ##############################

  test("keeps the unsplit print preset as one printable part per cut panel", () => {
    const layout = createLayout(defaultSettings);
    const kit = createPrintableKit(layout, "unsplit");

    expect(kit.summary.partCount).toBe(cutPanels(layout).length);
    expect(kit.summary.panelTileCount).toBe(cutPanels(layout).length);
    expect(kit.summary.glueKeyCount).toBe(0);
    expect(kit.summary.splitPanelCount).toBe(0);
    expect(kit.summary.oversizedPartCount).toBe(0);
    expect(kit.summary.retainedCutFeatureCount).toBe(kit.summary.sourceCutFeatureCount);
    expect(kit.summary.retainedPrintCriticalCutFeatureCount).toBe(kit.summary.sourcePrintCriticalCutFeatureCount);
  });

  test("lays printable kit parts onto previewable print sheets", () => {
    const layout = createLayout(defaultSettings);
    const plan = createPrintableSheetPlan(layout, "bed-256");

    expect(plan.kit.preset.id).toBe("bed-256");
    expect(plan.sheets.length).toBeGreaterThan(1);
    expect(plan.sheets.every((sheet) => sheet.placements.length > 0)).toBe(true);
    expect(plan.sheets.every((sheet) => sheet.placements.every((placement) => placement.fit.type === "fits"))).toBe(true);
    expect(
      plan.sheets.every((sheet) =>
        sheet.placements.every(
          (placement) =>
            placement.x + placement.part.width <= sheet.width + 0.001 &&
            placement.y + placement.part.depth <= sheet.depth + 0.001,
        ),
      ),
    ).toBe(true);
  });

  test("exports panel outlines in single-sheet 3MF packages", () => {
    const layout = createLayout(defaultSettings);
    const printExport = createPrintableThreeMfExport(layout, "unsplit");
    const model = parseThreeMfModel(printExport.bytes);
    const sourcePanel = requiredPanel(cutPanels(layout), "bottom-fan-wall");
    const exportedPanel = requiredThreeMfObject(model, "Bottom fan wall print panel");
    const bounds = meshBounds(exportedPanel.vertices);

    expect(printExport.filename).toBe("nukit-open-air-purifier-print-kit.3mf");
    expect(printExport.mimeType).toBe("model/3mf");
    expect(bounds.width).toBeCloseTo(sourcePanel.width);
    expect(bounds.depth).toBeCloseTo(sourcePanel.height);
    expect(exportedPanel.triangles.length).toBeGreaterThan(12);
    expectTriangleIndicesValid(exportedPanel);
  });

  test("exports bounded-bed print kits as one multi-plate 3MF package", () => {
    const layout = createLayout(defaultSettings);
    const printExport = createPrintableThreeMfExport(layout, "bed-256");
    const model = parseThreeMfModel(printExport.bytes);
    const modelSettings = parseThreeMfModelSettings(printExport.bytes);
    let nextObjectId = 1;
    const expectedPlates = printExport.sheetPlan.sheets.map((sheet) => ({
      name: `Print plate ${sheet.index}`,
      instances: sheet.placements.map((placement) => ({
        objectId: nextObjectId++,
        instanceId: 0,
        objectName: placement.part.name,
        x: placement.x,
        y: placement.y,
      })),
    }));
    const expectedPlacements = expectedPlates.flatMap((plate) => plate.instances);

    expect(printExport.filename).toBe("nukit-open-air-purifier-print-kit.3mf");
    expect(printExport.mimeType).toBe("model/3mf");
    expect(printExport.bytes[0]).toBe(0x50);
    expect(printExport.bytes[1]).toBe(0x4b);
    expect(listStoredZipFileNames(printExport.bytes)).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "3D/3dmodel.model",
      "Metadata/model_settings.config",
    ]);
    expect(new TextDecoder().decode(readStoredZipEntry(printExport.bytes, "[Content_Types].xml"))).toContain(
      '<Override PartName="/Metadata/model_settings.config" ContentType="application/xml"/>',
    );
    expect(printExport.kit.preset.id).toBe("bed-256");
    expect(model.unit).toBe("millimeter");
    expect(model.objects.map((object) => object.name)).toEqual(expectedPlacements.map((placement) => placement.objectName));
    expect(model.buildItems.map((item) => item.position.x)).toEqual(expectedPlacements.map((placement) => placement.x));
    expect(model.buildItems.map((item) => item.position.y)).toEqual(expectedPlacements.map((placement) => placement.y));

    expect(modelSettings.plates.map((plate) => plate.name)).toEqual(expectedPlates.map((plate) => plate.name));
    expect(modelSettings.plates.map((plate) => plate.instances)).toEqual(
      expectedPlates.map((plate) =>
        plate.instances.map((instance) => ({
          objectId: instance.objectId,
          instanceId: instance.instanceId,
        })),
      ),
    );

    for (const [plateIndex, plate] of modelSettings.plates.entries()) {
      const sheet = printExport.sheetPlan.sheets[plateIndex];
      if (sheet === undefined) {
        throw new Error(`exports bounded-bed print kits: Missing sheet for plate ${plate.name}`);
      }

      for (const instance of plate.instances) {
        const item = model.buildItems.find((entry) => entry.objectId === instance.objectId);
        if (item === undefined) {
          throw new Error(`exports bounded-bed print kits: Missing build item ${instance.objectId}`);
        }
        const object = requiredThreeMfObjectById(model, instance.objectId);
        expectTriangleIndicesValid(object);
        const bounds = transformedBounds(meshBounds(object.vertices), item.position);
        expect(bounds.minX).toBeGreaterThanOrEqual(-0.01);
        expect(bounds.minY).toBeGreaterThanOrEqual(-0.01);
        expect(bounds.maxX).toBeLessThanOrEqual(sheet.width + 0.01);
        expect(bounds.maxY).toBeLessThanOrEqual(sheet.depth + 0.01);
      }
    }
  });

  test("rejects invalid 3MF plate object assignments", () => {
    const objects = [minimalThreeMfObject("A"), minimalThreeMfObject("B")];
    const cases = [
      {
        objectIndices: [0.5, 1],
        message: "createThreeMfPackage: MeshPlate.objectIndices[0][0] must be an integer, got 0.5",
      },
      {
        objectIndices: [0, 2],
        message: "createThreeMfPackage: MeshPlate.objectIndices[0][1] 2 is out of range for 2 objects",
      },
      {
        objectIndices: [0, 0],
        message: "createThreeMfPackage: MeshPlate.objectIndices object 0 is assigned more than once",
      },
      {
        objectIndices: [0],
        message: "createThreeMfPackage: MeshPlate.objectIndices missing object index 1",
      },
    ];

    for (const testCase of cases) {
      expect(() =>
        createThreeMfPackage("Invalid package", objects, [{ name: "Plate 1", objectIndices: testCase.objectIndices }]),
      ).toThrow(testCase.message);
    }
  });
});

// #######################################
// Domain Assertion Helpers
// #######################################

function requiredFilterPreset(id: string) {
  const preset = filterPresets.find((entry) => entry.id === id);
  if (preset === undefined) {
    throw new Error(`requiredFilterPreset: Missing ${id}`);
  }
  return preset;
}

function minimalThreeMfObject(name: string): MeshObject {
  return {
    name,
    vertices: [],
    triangles: [],
    position: { x: 0, y: 0, z: 0 },
  };
}

function cutPanels(layout: ReturnType<typeof createLayout>) {
  return requireCutPanelFabricationPlan(layout, "cutPanels").cutPanels;
}

function cutSheet(layout: ReturnType<typeof createLayout>) {
  return requireCutPanelFabricationPlan(layout, "cutSheet").cutSheet;
}

function requiredPanel(panels: ReturnType<typeof cutPanels>, id: string) {
  const panel = panels.find((entry) => entry.id === id);
  if (panel === undefined) {
    throw new Error(`requiredPanel: Missing ${id}`);
  }
  return panel;
}

function requiredFanPanel(layout: ReturnType<typeof createLayout>) {
  const panel = cutPanels(layout).find((entry) => entry.cuts.some((cut) => cut.type === "circle" && cut.role === "fan"));
  if (panel === undefined) {
    throw new Error("requiredFanPanel: Missing fan panel");
  }
  return panel;
}

function requiredCircleCut(panel: ReturnType<typeof requiredPanel>, role: "fan" | "screw") {
  const cut = panel.cuts.find((entry) => entry.type === "circle" && entry.role === role);
  if (cut === undefined || cut.type !== "circle") {
    throw new Error(`requiredCircleCut: Missing ${role} on ${panel.id}`);
  }
  return cut;
}

function requiredRectCut(panel: ReturnType<typeof requiredPanel>, role: "finger-hole" | "slot" | "window") {
  const cut = panel.cuts.find((entry) => entry.type === "rect" && entry.role === role);
  if (cut === undefined || cut.type !== "rect") {
    throw new Error(`requiredRectCut: Missing ${role} on ${panel.id}`);
  }
  return cut;
}

function requiredAssemblyPanel(assembly: ReturnType<typeof createAssemblyModel>, id: string) {
  const panel = [...assembly.panels, ...assembly.filterRails].find((part) => part.id === id);
  if (panel === undefined) {
    throw new Error(`requiredAssemblyPanel: Missing ${id}`);
  }
  return panel;
}

function panelTopToothY(part: ReturnType<typeof requiredAssemblyPanel>): number {
  const top = Math.max(...part.panel.outline.map((point) => point.y));
  return roundCoordinate(part.position[1] + top - part.panel.assemblyCenter.y);
}

function roundedInteriorYValues(panel: ReturnType<typeof requiredPanel>): number[] {
  const minY = Math.min(...panel.outline.map((point) => point.y));
  const maxY = Math.max(...panel.outline.map((point) => point.y));
  const values = panel.outline
    .map((point) => roundCoordinate(point.y))
    .filter((y) => y > minY && y < maxY);
  return [...new Set(values)].sort((left, right) => left - right);
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

// #######################################
// Parsed 3MF Model
// #######################################

type ParsedThreeMfModel = {
  readonly unit: string;
  readonly objects: readonly ParsedThreeMfObject[];
  readonly buildItems: readonly ParsedThreeMfBuildItem[];
};

type ParsedThreeMfModelSettings = {
  readonly plates: readonly ParsedThreeMfPlate[];
};

type ParsedThreeMfPlate = {
  readonly name: string;
  readonly instances: readonly ParsedThreeMfPlateInstance[];
};

type ParsedThreeMfPlateInstance = {
  readonly objectId: number;
  readonly instanceId: number;
};

type ParsedThreeMfObject = {
  readonly id: number;
  readonly name: string;
  readonly vertices: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  readonly triangles: readonly { readonly v1: number; readonly v2: number; readonly v3: number }[];
};

type ParsedThreeMfBuildItem = {
  readonly objectId: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
};

type Bounds3 = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly width: number;
  readonly depth: number;
};

// #######################################
// 3MF Parsing Helpers
// #######################################

function parseThreeMfModel(bytes: Uint8Array): ParsedThreeMfModel {
  const modelXml = new TextDecoder().decode(readStoredZipEntry(bytes, "3D/3dmodel.model"));
  const unit = /<model unit="([^"]+)"/u.exec(modelXml)?.[1];
  if (unit === undefined) {
    throw new Error("parseThreeMfModel: Missing model unit");
  }

  const objects = Array.from(modelXml.matchAll(/<object id="(\d+)" type="model" name="([^"]+)">([\s\S]*?)<\/object>/gu)).map(
    (match) => ({
      id: Number(match[1]),
      name: unescapeXml(match[2] ?? ""),
      vertices: Array.from((match[3] ?? "").matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/gu)).map(
        (vertexMatch) => ({
          x: Number(vertexMatch[1]),
          y: Number(vertexMatch[2]),
          z: Number(vertexMatch[3]),
        }),
      ),
      triangles: Array.from((match[3] ?? "").matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/gu)).map(
        (triangleMatch) => ({
          v1: Number(triangleMatch[1]),
          v2: Number(triangleMatch[2]),
          v3: Number(triangleMatch[3]),
        }),
      ),
    }),
  );
  const buildItems = Array.from(modelXml.matchAll(/<item objectid="(\d+)" transform="([^"]+)"\/>/gu)).map((match) => {
    const transform = (match[2] ?? "").split(" ").map(Number);
    return {
      objectId: Number(match[1]),
      position: {
        x: transform[9] ?? 0,
        y: transform[10] ?? 0,
        z: transform[11] ?? 0,
      },
    };
  });

  return { unit, objects, buildItems };
}

function parseThreeMfModelSettings(bytes: Uint8Array): ParsedThreeMfModelSettings {
  const modelSettingsXml = new TextDecoder().decode(readStoredZipEntry(bytes, "Metadata/model_settings.config"));
  const plates = Array.from(modelSettingsXml.matchAll(/<plate>([\s\S]*?)<\/plate>/gu)).map((plateMatch) => {
    const plateXml = plateMatch[1] ?? "";
    const name = readMetadataValue(plateXml, "plater_name");
    const instances = Array.from(plateXml.matchAll(/<model_instance>([\s\S]*?)<\/model_instance>/gu)).map((instanceMatch) => {
      const instanceXml = instanceMatch[1] ?? "";
      return {
        objectId: Number(readMetadataValue(instanceXml, "object_id")),
        instanceId: Number(readMetadataValue(instanceXml, "instance_id")),
      };
    });
    return { name, instances };
  });
  return { plates };
}

function readMetadataValue(xml: string, key: string): string {
  const match = new RegExp(`<metadata key="${key}" value="([^"]*)"/>`, "u").exec(xml);
  if (match?.[1] === undefined) {
    throw new Error(`readMetadataValue: Missing ${key}`);
  }
  return unescapeXml(match[1]);
}

function listStoredZipFileNames(bytes: Uint8Array): string[] {
  const names: string[] = [];
  visitStoredZipEntries(bytes, (name) => {
    names.push(name);
  });
  return names;
}

function readStoredZipEntry(bytes: Uint8Array, expectedName: string): Uint8Array {
  let found: Uint8Array | null = null;
  visitStoredZipEntries(bytes, (name, content) => {
    if (name === expectedName) {
      found = content;
    }
  });
  if (found === null) {
    throw new Error(`readStoredZipEntry: Missing ${expectedName}`);
  }
  return found;
}

function visitStoredZipEntries(bytes: Uint8Array, visit: (name: string, content: Uint8Array) => void): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressionMethod = view.getUint16(offset + 8, true);
    if (compressionMethod !== 0) {
      throw new Error(`visitStoredZipEntries: Unsupported compression method ${compressionMethod}`);
    }
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));
    visit(name, bytes.slice(contentStart, contentEnd));
    offset = contentEnd;
  }
}

function requiredThreeMfObject(model: ParsedThreeMfModel, name: string): ParsedThreeMfObject {
  const object = model.objects.find((entry) => entry.name === name);
  if (object === undefined) {
    throw new Error(`requiredThreeMfObject: Missing ${name}`);
  }
  return object;
}

function requiredThreeMfObjectById(model: ParsedThreeMfModel, id: number): ParsedThreeMfObject {
  const object = model.objects.find((entry) => entry.id === id);
  if (object === undefined) {
    throw new Error(`requiredThreeMfObjectById: Missing ${id}`);
  }
  return object;
}

function meshBounds(vertices: ParsedThreeMfObject["vertices"]): Bounds3 {
  return boundsFromExtents({
    minX: Math.min(...vertices.map((vertex) => vertex.x)),
    maxX: Math.max(...vertices.map((vertex) => vertex.x)),
    minY: Math.min(...vertices.map((vertex) => vertex.y)),
    maxY: Math.max(...vertices.map((vertex) => vertex.y)),
    minZ: Math.min(...vertices.map((vertex) => vertex.z)),
    maxZ: Math.max(...vertices.map((vertex) => vertex.z)),
  });
}

function transformedBounds(bounds: Bounds3, position: ParsedThreeMfBuildItem["position"]): Bounds3 {
  return boundsFromExtents({
    minX: bounds.minX + position.x,
    maxX: bounds.maxX + position.x,
    minY: bounds.minY + position.y,
    maxY: bounds.maxY + position.y,
    minZ: bounds.minZ + position.z,
    maxZ: bounds.maxZ + position.z,
  });
}

function boundsFromExtents(extents: Omit<Bounds3, "width" | "depth">): Bounds3 {
  return {
    ...extents,
    width: extents.maxX - extents.minX,
    depth: extents.maxY - extents.minY,
  };
}

function expectTriangleIndicesValid(object: ParsedThreeMfObject): void {
  for (const triangle of object.triangles) {
    expect(triangle.v1).toBeGreaterThanOrEqual(0);
    expect(triangle.v2).toBeGreaterThanOrEqual(0);
    expect(triangle.v3).toBeGreaterThanOrEqual(0);
    expect(triangle.v1).toBeLessThan(object.vertices.length);
    expect(triangle.v2).toBeLessThan(object.vertices.length);
    expect(triangle.v3).toBeLessThan(object.vertices.length);
  }
}

function unescapeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}
