import type { PurifierSettings } from "@/domain/purifier/settingsModel";
import type { FilterCount } from "@/domain/purifier/designPresets";
import type { FanCountRequest, FanDiameter } from "@/domain/purifier/fans";
import { createAirPurifierGeometry, fanCenterYForWall } from "@/domain/purifier/geometry";
import {
  cutPanelsToDocument,
  edgeSections,
  fingerHoleCutsAt,
  layoutCutPanelsInColumn,
  rectangularPanel,
  type CutPanelAssembly,
  type CutPanelDraft,
  type CutFeature,
  type EdgeSection,
  type FilterRailKey,
  type LaidOutCutPanel,
} from "@/fabrication/laser/cutGeometry";
import type { BoxesDocument } from "@/ports/boxes/cutDocument";

// #######################################
// Public Cut-Sheet API
// #######################################

type AirPurifierCutSheet = {
  panels: LaidOutCutPanel[];
  document: BoxesDocument;
};

type FilterFingerHoleRow = {
  y: number;
  alignment: readonly EdgeSection[];
};

export function createAirPurifierCutSheet(settings: PurifierSettings): AirPurifierCutSheet {
  const panels = layoutCutPanelsInColumn(createAirPurifierCutPanels(settings), boxesPartSpacing(settings));
  return {
    panels,
    document: cutPanelsToDocument(
      panels,
      settings.cutting.referenceScale,
      settings.cutting.labels,
      settings.cutting.kerfFit,
    ),
  };
}

export function createAirPurifierCutPanels(settings: PurifierSettings): CutPanelDraft[] {
  const geometry = createAirPurifierGeometry(settings);
  const width = geometry.filterDimensions.width;
  const fanDiameter = settings.fan.spec.diameter;
  const thickness = geometry.materialThickness;
  const rim = geometry.rim;
  const workingDepth = geometry.workingDepth;
  const filterHeight = geometry.filterDimensions.thickness;
  const chamberHeight = geometry.chamberHeight;
  const filterCount = settings.filterCount;
  const usesSplitRails = settings.frameConstruction.type === "split-rails";
  const panels: CutPanelDraft[] = [];
  const fanWallFilterRows = createFilterFingerHoleRows(geometry.filterFingerHoleYs, edgeSections("f"), edgeSections("f"));
  const rearFanWallY = rearFanWallCenterY(filterCount, chamberHeight, fanDiameter);

  panels.push(
    createFanWallPanel({
      id: "top-fan-wall",
      name: "Top fan wall",
      width,
      height: fanDiameter,
      requestedFans: settings.fan.banks.top,
      fanCenterY: fanDiameter / 2,
      settings,
      assembly: {
        type: "placed",
        role: "rear-fan-wall",
        placement: {
          position: [0, rearFanWallY, workingDepth / 2],
          rotation: [0, 0, 0],
        },
      },
    }),
  );

  panels.push(
    createFanWallPanel({
      id: "bottom-fan-wall",
      name: "Bottom fan wall",
      width,
      height: chamberHeight,
      requestedFans: settings.fan.banks.bottom,
      fanCenterY: fanCenterYForWall(filterCount, chamberHeight, thickness, filterHeight),
      settings,
      cuts: createFilterFingerHoleCuts(width, settings, fanWallFilterRows),
      assembly: {
        type: "placed",
        role: "front-fan-wall",
        placement: {
          position: [0, 0, -workingDepth / 2],
          rotation: [0, 0, 0],
        },
      },
    }),
  );

  const bottomEdge = usesSplitRails ? compound("fff", [rim, workingDepth - 2 * rim, rim]) : edgeSections("f");
  let topEdge = bottomEdge;
  const leftEdge =
    filterCount === 2
      ? compound("EFE", [filterHeight + thickness, fanDiameter + 2, filterHeight + thickness])
      : compound("FE", [fanDiameter + 2, filterHeight + thickness]);
  if (filterCount === 1) {
    topEdge = edgeSections("f");
  }

  panels.push(
    createSideWallPanel({
      id: "left-side-wall",
      name: "Left side wall",
      width: workingDepth,
      height: chamberHeight,
      requestedFans: settings.fan.banks.left,
      edgeSpec: [bottomEdge, edgeSections("h"), topEdge, leftEdge],
      settings,
      filterFingerHoleRows: createFilterFingerHoleRows(geometry.filterFingerHoleYs, bottomEdge, topEdge),
      assembly: {
        type: "placed",
        role: "left-side-wall",
        placement: {
          // Flipped top-to-bottom (180 deg about its own normal axis) while still
          // facing outward, so the left wall is no longer upside down.
          position: [-width / 2, 0, 0],
          rotation: [Math.PI, -Math.PI / 2, 0],
        },
      },
    }),
  );

  panels.push(
    createSideWallPanel({
      id: "right-side-wall",
      name: "Right side wall",
      width: workingDepth,
      height: chamberHeight,
      requestedFans: settings.fan.banks.right,
      edgeSpec: [bottomEdge, edgeSections("h"), topEdge, leftEdge],
      settings,
      filterFingerHoleRows: createFilterFingerHoleRows(geometry.filterFingerHoleYs, bottomEdge, topEdge),
      assembly: {
        type: "placed",
        role: "right-side-wall",
        placement: {
          position: [width / 2, 0, 0],
          rotation: [0, Math.PI / 2, 0],
        },
      },
    }),
  );

  if (usesSplitRails) {
    const longEdge = compound("DeD", [rim, width - 2 * rim, rim]);
    for (let filterIndex = 0; filterIndex < filterCount; filterIndex += 1) {
      const labelPrefix = filterCount === 1 ? "Filter frame" : `Filter ${filterIndex + 1}`;
      panels.push(
        createRailPanel(
          `${labelPrefix} front long rail`,
          width,
          rim,
          [edgeSections("h"), edgeSections("h"), longEdge, edgeSections("h")],
          settings,
          filterRailAssembly(filterIndex, "front-long"),
        ),
      );
      panels.push(
        createRailPanel(
          `${labelPrefix} rear long rail`,
          workingDepth - 2 * rim,
          rim,
          edgeSectionsFor("hded"),
          settings,
          filterRailAssembly(filterIndex, "rear-long"),
        ),
      );
      panels.push(
        createRailPanel(
          `${labelPrefix} left short rail`,
          workingDepth - 2 * rim,
          rim,
          edgeSectionsFor("hded"),
          settings,
          filterRailAssembly(filterIndex, "left-short"),
        ),
      );
      panels.push(
        createRailPanel(
          `${labelPrefix} right short rail`,
          width,
          rim,
          [longEdge, edgeSections("h"), edgeSections("h"), edgeSections("h")],
          settings,
          filterRailAssembly(filterIndex, "right-short"),
        ),
      );

      panels.push(
        createRailPanel(
          `${labelPrefix} inner long rail`,
          width,
          rim,
          // Wall-facing edge uses gender-A fingers ("f") like the side rails, so
          // its teeth land on the same comb segments as the fan wall's interior
          // finger-hole row (gender "F" sat on the opposite segments, leaving one
          // tooth floating at the end).
          [edgeSections("f"), edgeSections("f"), longEdge, edgeSections("f")],
          settings,
          filterRailAssembly(filterIndex, "inner-long"),
        ),
      );
      panels.push(
        createRailPanel(
          `${labelPrefix} outer long rail`,
          workingDepth - 2 * rim,
          rim,
          edgeSectionsFor("fded"),
          settings,
          filterRailAssembly(filterIndex, "outer-long"),
        ),
      );
      panels.push(
        createRailPanel(
          `${labelPrefix} inner short rail`,
          workingDepth - 2 * rim,
          rim,
          edgeSectionsFor("fded"),
          settings,
          filterRailAssembly(filterIndex, "inner-short"),
        ),
      );
      panels.push(
        createRailPanel(
          `${labelPrefix} outer short rail`,
          width,
          rim,
          [longEdge, edgeSections("f"), edgeSections("f"), edgeSections("f")],
          settings,
          filterRailAssembly(filterIndex, "outer-short"),
        ),
      );
    }
  } else {
    for (const layer of geometry.filterLayers) {
      panels.push(
        createFullFilterFramePanel(`Filter ${layer.index + 1} front frame`, width, workingDepth, "Ffff", settings, rim, {
          type: "placed",
          role: "filter-frame-panel",
          placement: {
            position: [0, layer.outerFrameY, 0],
            rotation: [Math.PI / 2, 0, 0],
          },
        }),
      );
      panels.push(
        createFullFilterFramePanel(`Filter ${layer.index + 1} rear frame`, width, workingDepth, "Ehhh", settings, rim, {
          type: "placed",
          role: "filter-frame-panel",
          placement: {
            position: [0, layer.innerFrameY, 0],
            rotation: [Math.PI / 2, 0, 0],
          },
        }),
      );
    }
  }

  if (filterCount === 1) {
    panels.push(
      rectangularPanel({
        id: "closed-back-panel",
        name: "Closed back panel",
        width,
        height: workingDepth,
        edges: edgeSectionsFor("hhhh"),
        thickness,
        kerfFit: settings.cutting.kerfFit,
        jointSettings: settings.cutting.joints,
        assembly: {
          type: "placed",
          role: "closed-back",
          placement: {
            position: [0, chamberHeight / 2 - thickness / 2, 0],
            rotation: [Math.PI / 2, 0, 0],
          },
        },
      }),
    );
  }

  return panels;
}

// #######################################
// Fan Wall Panels
// #######################################

export function resolveFanCount(requestedFans: FanCountRequest, length: number, fanDiameter: FanDiameter): number {
  const maxFans = Math.max(0, Math.floor((length - 20) / (fanDiameter + 10)));
  if (requestedFans.type === "auto") {
    return maxFans;
  }
  return Math.min(maxFans, Math.max(0, requestedFans.count));
}

function createFanWallPanel(input: {
  id: string;
  name: string;
  width: number;
  height: number;
  requestedFans: FanCountRequest;
  fanCenterY: number;
  settings: PurifierSettings;
  cuts?: CutFeature[];
  assembly: CutPanelAssembly;
}): CutPanelDraft {
  return rectangularPanel({
    id: input.id,
    name: input.name,
    width: input.width,
    height: input.height,
    edges: edgeSectionsFor("ffff"),
    thickness: input.settings.cutting.materialThickness,
    kerfFit: input.settings.cutting.kerfFit,
    jointSettings: input.settings.cutting.joints,
    cuts: [
      ...createFanCuts(input.width, input.height, input.requestedFans, input.settings, input.fanCenterY),
      ...(input.cuts ?? []),
    ],
    assembly: input.assembly,
  });
}

// #######################################
// Side Wall Panels
// #######################################

function createSideWallPanel(input: {
  id: string;
  name: string;
  width: number;
  height: number;
  requestedFans: FanCountRequest;
  edgeSpec: RectPanelEdges;
  settings: PurifierSettings;
  filterFingerHoleRows: readonly FilterFingerHoleRow[];
  assembly: CutPanelAssembly;
}): CutPanelDraft {
  const fanCenterY =
    fanCenterYForWall(
      input.settings.filterCount,
      input.height,
      input.settings.cutting.materialThickness,
      input.settings.filter.thickness,
    );
  return rectangularPanel({
    id: input.id,
    name: input.name,
    width: input.width,
    height: input.height,
    edges: input.edgeSpec,
    thickness: input.settings.cutting.materialThickness,
    kerfFit: input.settings.cutting.kerfFit,
    jointSettings: input.settings.cutting.joints,
    cuts: [
      ...createFanCuts(input.width, input.height, input.requestedFans, input.settings, fanCenterY),
      ...createFilterFingerHoleCuts(
        input.width,
        input.settings,
        input.filterFingerHoleRows,
      ),
    ],
    assembly: input.assembly,
  });
}

// #######################################
// Filter Rails and Frames
// #######################################

function createRailPanel(
  name: string,
  width: number,
  height: number,
  edges: RectPanelEdges,
  settings: PurifierSettings,
  assembly: CutPanelAssembly,
): CutPanelDraft {
  return rectangularPanel({
    id: slugify(name),
    name,
    width: Math.max(1, width),
    height: Math.max(1, height),
    edges,
    thickness: settings.cutting.materialThickness,
    kerfFit: settings.cutting.kerfFit,
    jointSettings: settings.cutting.joints,
    assembly,
  });
}

function createFullFilterFramePanel(
  name: string,
  width: number,
  height: number,
  edges: string,
  settings: PurifierSettings,
  rim: number,
  assembly: CutPanelAssembly,
): CutPanelDraft {
  const kerfFit = settings.cutting.kerfFit;
  return rectangularPanel({
    id: slugify(name),
    name,
    width,
    height,
    edges: edgeSectionsFor(edges),
    thickness: settings.cutting.materialThickness,
    kerfFit,
    jointSettings: settings.cutting.joints,
    cuts: [
      {
        type: "rect",
        x: rim / 2 + kerfFit,
        y: rim / 2 + kerfFit,
        width: width - rim - 2 * kerfFit,
        height: height - rim - 2 * kerfFit,
        radius: Math.max(0, 10 - kerfFit),
        role: "window",
      },
    ],
    assembly,
  });
}

// #######################################
// Fan Cuts
// #######################################

function createFanCuts(
  length: number,
  height: number,
  requestedFans: FanCountRequest,
  settings: PurifierSettings,
  centerY: number,
): CutFeature[] {
  const fanDiameter = settings.fan.spec.diameter;
  const kerfFit = settings.cutting.kerfFit;
  const fanCount = resolveFanCount(requestedFans, length, fanDiameter);
  if (fanCount === 0) {
    return [];
  }

  const cuts: CutFeature[] = [];
  const segment = (length - 20) / fanCount;
  const screwOffset = settings.fan.spec.screwSpacing / 2;
  const minCenter = fanDiameter / 2 + 4;
  const maxCenter = height - fanDiameter / 2 - 4;
  const center = minCenter <= maxCenter ? clamp(centerY, minCenter, maxCenter) : height / 2;

  for (let index = 0; index < fanCount; index += 1) {
    const cx = 10 + segment / 2 + index * segment;
    cuts.push({
      type: "circle",
      cx,
      cy: center,
      radius: kerfCorrectedRadius(Math.max(4, (fanDiameter - 4) / 2), kerfFit),
      role: "fan",
    });
    for (const dx of [-screwOffset, screwOffset]) {
      for (const dy of [-screwOffset, screwOffset]) {
        cuts.push({
          type: "circle",
          cx: cx + dx,
          cy: center + dy,
          radius: kerfCorrectedRadius(settings.cutting.screwHoleDiameter / 2, kerfFit),
          role: "screw",
        });
      }
    }
  }

  return cuts;
}

// #######################################
// Filter Finger Holes
// #######################################

function createFilterFingerHoleCuts(
  width: number,
  settings: PurifierSettings,
  holeRows: readonly FilterFingerHoleRow[],
): CutFeature[] {
  const cuts: CutFeature[] = [];
  const { joints, materialThickness, kerfFit } = settings.cutting;

  for (const row of holeRows) {
    cuts.push(...fingerHoleCutsForAlignedRow(width, row, materialThickness, kerfFit, joints));
  }

  return cuts;
}

function createFilterFingerHoleRows(
  holeYs: readonly number[],
  lowerAlignment: readonly EdgeSection[],
  upperAlignment: readonly EdgeSection[],
): FilterFingerHoleRow[] {
  return holeYs.map((y, index) => ({
    y,
    alignment: index === 0 ? lowerAlignment : upperAlignment,
  }));
}

function fingerHoleCutsForAlignedRow(
  width: number,
  row: FilterFingerHoleRow,
  materialThickness: number,
  kerfFit: number,
  jointSettings: PurifierSettings["cutting"]["joints"],
): CutFeature[] {
  const sections = normalizeAlignmentSections(row.alignment, width);
  const cuts: CutFeature[] = [];
  let cursor = 0;

  for (const section of sections) {
    if (shouldCutFingerHolesForSection(section)) {
      cuts.push(...fingerHoleCutsAt(cursor, row.y, section.length, 0, materialThickness, kerfFit, jointSettings));
    }
    cursor += section.length;
  }

  return cuts;
}

function normalizeAlignmentSections(sections: readonly EdgeSection[], width: number): EdgeSection[] {
  const specifiedLength = sections.reduce((total, section) => total + section.length, 0);
  if (specifiedLength > 0) {
    return [...sections];
  }

  const section = sections.find(shouldCutFingerHolesForSection);
  return section === undefined ? [] : [{ ...section, length: width }];
}

function shouldCutFingerHolesForSection(section: EdgeSection): boolean {
  return section.kind === "finger" || section.kind === "finger-counter" || section.kind === "finger-holes";
}

// #######################################
// Edge Patterns
// #######################################

type RectPanelEdges = readonly [readonly EdgeSection[], readonly EdgeSection[], readonly EdgeSection[], readonly EdgeSection[]];

function edgeSectionsFor(pattern: string): RectPanelEdges {
  if (pattern.length !== 4) {
    throw new Error("edgeSectionsFor: four edge chars required");
  }
  return [
    edgeSections(pattern[0] ?? "e"),
    edgeSections(pattern[1] ?? "e"),
    edgeSections(pattern[2] ?? "e"),
    edgeSections(pattern[3] ?? "e"),
  ];
}

function compound(pattern: string, lengths: readonly number[]): EdgeSection[] {
  return edgeSections(pattern, lengths);
}

// #######################################
// Small Geometry Helpers
// #######################################

function filterRailAssembly(filterIndex: number, railKey: FilterRailKey): CutPanelAssembly {
  return {
    type: "filter-rail",
    filterIndex,
    railKey,
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rearFanWallCenterY(filterCount: FilterCount, chamberHeight: number, fanDiameter: number): number {
  if (filterCount === 1) {
    return (chamberHeight - fanDiameter) / 2;
  }
  return 0;
}

// Upstream boxes.py folds 2*burn into its part spacing because its drawn parts
// grow by burn per side; our panel outlines bake that growth into their own
// bounds, so only the material-based clearance remains here.
function boxesPartSpacing(settings: PurifierSettings): number {
  return settings.cutting.materialThickness * 0.5;
}

function kerfCorrectedRadius(radius: number, kerfFit: number): number {
  return Math.max(0.001, radius - kerfFit);
}
