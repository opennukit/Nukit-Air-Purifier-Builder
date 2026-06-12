import { describe, expect, test } from "bun:test";
import {
  createPurifierDraft,
  normalizeSettings,
  serializePurifierDraft,
} from "@/domain/purifier/airPurifier";
import { decodePurifierDraftSettings } from "@/domain/purifier/settingsCodec";
import {
  applyPrintDesignPreset,
  applyTempestArrangement,
  defaultSettings,
} from "@/domain/purifier/settingsModel";

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
    expect(serialized.filterWidth).toBe(draft.design.filter.outerDiameter);
    expect(serialized.filterDepth).toBe(draft.design.filter.length);
    expect(serialized.filterThickness).toBe(draft.design.filter.holeDiameter);
  });

  test("keeps static references as fixed source-file designs", () => {
    const draft = createPurifierDraft(applyPrintDesignPreset(defaultSettings, "static-modular-20x20-reference"));

    expect(draft.design.type).toBe("static-reference");
    if (draft.design.type !== "static-reference") {
      throw new Error("expected static reference draft");
    }

    expect(draft.design.reference.printablesId).toBe("610219");
    expect(draft.design.fanCount).toBe(4);

    const settings = normalizeSettings(draft);
    expect(settings.design.type).toBe("static-reference");
    expect(settings.design.type === "static-reference" ? settings.design.reference.printablesId : "").toBe("610219");
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
    expect(draft.design.cordHole).toEqual({ placement: "right", diameter: 8 });
    expect(serializePurifierDraft(draft).printDesign).toBe("nukit-tempest");
    expect(serializePurifierDraft(draft).tempestArrangement).toBe("four-side-filter-tower");
    expect(serializePurifierDraft(draft).cordHolePlacement).toBe("right");
    expect(serializePurifierDraft(draft).cordHoleDiameter).toBe(8);
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
