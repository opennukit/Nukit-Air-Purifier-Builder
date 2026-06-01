import { describe, expect, test } from "bun:test";
import {
  applyPrintDesignPreset,
  applyTempestArrangement,
  automaticFanCount,
  createPurifierDraft,
  decodePurifierDraftSettings,
  defaultSettings,
  normalizePurifierDraft,
  normalizeSettings,
  serializePurifierDraft,
} from "@/domain/purifier/airPurifier";

describe("Purifier draft model", () => {
  test("keeps donut filter dimensions in the donut design variant", () => {
    const draft = createPurifierDraft(applyPrintDesignPreset(defaultSettings, "donut-hepa-adapter"));

    expect(draft.design.type).toBe("donut-filter-adapter");
    if (draft.design.type !== "donut-filter-adapter") {
      throw new Error("expected donut draft");
    }

    expect(draft.design.filter.outerDiameter).toBe(125);
    expect(draft.design.filter.length).toBe(150);
    expect(draft.design.filter.holeDiameter).toBe(92);

    const serialized = serializePurifierDraft(draft);
    expect(serialized.filterPreset).toBe("custom");
    expect(serialized.filterWidth).toBe(draft.design.filter.outerDiameter);
    expect(serialized.filterDepth).toBe(draft.design.filter.length);
    expect(serialized.filterThickness).toBe(draft.design.filter.holeDiameter);
  });

  test("keeps static references as fixed source-file designs", () => {
    const draft = createPurifierDraft(applyPrintDesignPreset(defaultSettings, "static-cr-14x20-base"));

    expect(draft.design.type).toBe("static-reference");
    if (draft.design.type !== "static-reference") {
      throw new Error("expected static reference draft");
    }

    expect(draft.design.reference.printablesId).toBe("955827");
    expect(draft.design.fanCount).toBe(4);

    const settings = normalizeSettings(draft);
    expect(settings.design.type).toBe("static-reference");
    expect(settings.design.type === "static-reference" ? settings.design.reference.printablesId : "").toBe("955827");
  });

  test("keeps Tempest arrangements explicit in the draft variant", () => {
    const draft = createPurifierDraft(
      applyTempestArrangement(applyPrintDesignPreset(defaultSettings, "nukit-tempest"), "four-side-filter-tower"),
    );

    expect(draft.design.type).toBe("tempest");
    if (draft.design.type !== "tempest") {
      throw new Error("expected Tempest draft");
    }

    expect(draft.design.arrangement).toBe("four-side-filter-tower");
    expect(serializePurifierDraft(draft).printDesign).toBe("nukit-tempest");
    expect(serializePurifierDraft(draft).tempestArrangement).toBe("four-side-filter-tower");
  });

  test("canonicalizes impossible Corsi fan counts inside the draft variant", () => {
    const raw = {
      ...applyPrintDesignPreset(defaultSettings, "corsi-rosenthal"),
      corsiMode: "side-exhaust" as const,
      corsiFanCount: 3,
    };

    const draft = normalizePurifierDraft(raw);

    expect(draft.design.type).toBe("corsi-rosenthal");
    if (draft.design.type !== "corsi-rosenthal") {
      throw new Error("expected Corsi draft");
    }

    expect(draft.design.configuration.fanCount).toEqual({ type: "auto" });
    expect(serializePurifierDraft(draft).corsiFanCount).toBe(automaticFanCount);
  });

  test("parses shared URLs into the draft model at the boundary", () => {
    const draft = decodePurifierDraftSettings("printDesign=donut-hepa-adapter&donutFilterHoleDiameter=86&donutCapEnabled=false");

    expect(draft.design.type).toBe("donut-filter-adapter");
    if (draft.design.type !== "donut-filter-adapter") {
      throw new Error("expected donut draft");
    }

    expect(draft.design.filter.holeDiameter).toBe(86);
    expect(draft.design.filter.cap).toEqual({ type: "none" });
  });
});
