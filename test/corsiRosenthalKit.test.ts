import { describe, expect, test } from "bun:test";
import { applyPrintDesignPreset, createLayout, defaultSettings } from "../src/airPurifier";
import { createCorsiRosenthalModel } from "../src/corsiRosenthalModel";
import type { CorsiFaceSide } from "../src/corsiRosenthalModel";
import { createPrintDesignKit } from "../src/printDesignKit";
import {
  partFitsPrintBed,
  printVolumePresets,
  type PrintableKit,
  type PrintablePart,
} from "../src/printableKit";

describe("Corsi-Rosenthal printable kit geometry", () => {
  test("puts receiver notches in modular split rails for connector keys", () => {
    const layout = createLayout(applyPrintDesignPreset(defaultSettings, "corsi-rosenthal"));
    const kit = createPrintDesignKit(layout, "bed-256");
    const connector = requiredPart(kit, (part) => part.name === "Modular rail connector 1");
    const splitRailParts = kit.parts.filter(
      (part) => part.name.startsWith("Modular ") && part.name.includes("frame unit") && !part.name.endsWith("1.1"),
    );
    const firstSplitRail = requiredPart(kit, (part) => part.name.includes("frame unit") && part.name.endsWith("1.2"));
    const secondSplitRail = requiredPart(kit, (part) => part.name.includes("frame unit") && part.name.endsWith("2.2"));

    expect(splitRailParts.length).toBeGreaterThan(0);
    expect(splitRailParts.every((part) => part.cutFeatureCount > 0)).toBe(true);
    expect(hasRightReceiverSlot(firstSplitRail, connector)).toBe(true);
    expect(hasLeftReceiverSlot(secondSplitRail, connector)).toBe(true);

    const receiverSlotCount = splitRailParts.reduce((total, part) => total + part.cutFeatureCount, 0);
    const connectorCount = kit.parts.filter((part) => part.name.startsWith("Modular rail connector")).length;
    expect(connectorCount).toBeGreaterThanOrEqual(receiverSlotCount / 2);
  });

  test("tiles fan-panel seals around cassette openings and keeps bounded beds safe", () => {
    const layout = createLayout(applyPrintDesignPreset(defaultSettings, "corsi-rosenthal"));
    const model = createCorsiRosenthalModel(layout);
    const boundedPresetIds = printVolumePresets
      .filter((preset) => preset.bed.type === "bounded")
      .map((preset) => preset.id);

    for (const presetId of boundedPresetIds) {
      const kit = createPrintDesignKit(layout, presetId);

      expect(kit.summary.oversizedPartCount).toBe(0);
      expect(kit.parts.every((part) => partFitsPrintBed(part, kit.preset.bed))).toBe(true);
    }

    const kit = createPrintDesignKit(layout, "bed-256");
    const sealParts = kit.parts.filter((part) => part.sourcePanelId?.endsWith("fan-panel-seal") === true);
    const sealedFaceParts = kit.parts.filter((part) => part.sourcePanelId?.endsWith("sealed-face") === true);
    const fanFaceArea = model.fanPanels.reduce((total, panel) => total + facePanelArea(model, panel.side), 0);
    const cassetteArea = model.fanCount * model.fanCassetteOuter * model.fanCassetteOuter;
    const sealArea = sealParts.reduce((total, part) => total + part.width * part.depth, 0);
    const sealedFaceArea = model.sealedFaces.reduce((total, face) => total + facePanelArea(model, face.side), 0);
    const sealedPartArea = sealedFaceParts.reduce((total, part) => total + part.width * part.depth, 0);

    expect(sealParts.length).toBeGreaterThan(0);
    expect(sealParts.every((part) => part.kind === "panel-tile")).toBe(true);
    expect(Math.abs(sealArea - (fanFaceArea - cassetteArea))).toBeLessThan(0.001);
    expect(sealedFaceParts.length).toBeGreaterThan(0);
    expect(sealedFaceParts.every((part) => part.kind === "panel-tile")).toBe(true);
    expect(Math.abs(sealedPartArea - sealedFaceArea)).toBeLessThan(0.001);
  });

  test("includes sealed face tiles for the flipped Corsi topology", () => {
    const layout = createLayout({
      ...applyPrintDesignPreset(defaultSettings, "corsi-rosenthal"),
      corsiMode: "side-exhaust",
      corsiFilterCount: 3,
    });
    const model = createCorsiRosenthalModel(layout);
    const kit = createPrintDesignKit(layout, "bed-256");
    const sealedFaceParts = kit.parts.filter((part) => part.sourcePanelId?.endsWith("sealed-face") === true);

    expect(model.sealedFaces.map((face) => face.side)).toEqual(["bottom"]);
    expect(sealedFaceParts.length).toBeGreaterThan(0);
    expect(kit.summary.oversizedPartCount).toBe(0);
    expect(kit.parts.every((part) => partFitsPrintBed(part, kit.preset.bed))).toBe(true);
  });
});

function requiredPart(kit: PrintableKit, predicate: (part: PrintablePart) => boolean): PrintablePart {
  const part = kit.parts.find(predicate);
  if (part === undefined) {
    throw new Error("requiredPart: Missing printable kit part");
  }
  return part;
}

function hasLeftReceiverSlot(part: PrintablePart, connector: PrintablePart): boolean {
  return hasReceiverSlot(part, connector, (x) => x > 0.001 && x < connector.width / 2 + 2);
}

function hasRightReceiverSlot(part: PrintablePart, connector: PrintablePart): boolean {
  return hasReceiverSlot(part, connector, (x) => x > part.width - connector.width / 2 - 2 && x < part.width - 0.001);
}

function hasReceiverSlot(part: PrintablePart, connector: PrintablePart, isSlotX: (x: number) => boolean): boolean {
  const receiverVertices = part.mesh.vertices.filter(
    (vertex) => isSlotX(vertex.x) && vertex.y > 0.001 && vertex.y < part.depth - 0.001,
  );
  if (receiverVertices.length === 0) {
    return false;
  }
  const minY = Math.min(...receiverVertices.map((vertex) => vertex.y));
  const maxY = Math.max(...receiverVertices.map((vertex) => vertex.y));
  return maxY - minY >= connector.depth - 0.001;
}

function facePanelArea(model: ReturnType<typeof createCorsiRosenthalModel>, side: CorsiFaceSide): number {
  return model.frameOuterWidth * (side === "top" || side === "bottom" ? model.frameOuterWidth : model.frameOuterHeight);
}
