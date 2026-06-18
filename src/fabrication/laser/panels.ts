import type { CordHoleWall, PurifierSettings } from "@/domain/purifier/settingsModel";
import type { FilterCount } from "@/domain/purifier/designPresets";
import type { FanCountRequest, FanDiameter } from "@/domain/purifier/fans";
import { createAirPurifierGeometry, fanCenterYForWall, type AirPurifierGeometry } from "@/domain/purifier/geometry";
import {
  cutPanelsToDocument,
  edgeSections,
  fingerHoleCutsAt,
  layoutCutPanelsInColumn,
  rectangularPanel,
  type CircleCut,
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
  const cordCut = (wall: CordHoleWall): CircleCut | null => createCordHoleCut(wall, geometry, settings);
  const fanWallFilterRows = createFilterFingerHoleRows(geometry.filterFingerHoleYs, edgeSections("f"), edgeSections("f"));
  // The side walls carry the front fan wall's joint as FingerHoleEdge ("h")
  // slots set in from their edge by edge_width + thickness/2. So the front fan
  // wall seats that far inside the side walls' front edges, its teeth passing
  // through those slots. This is a placement (lap-joint) offset, not a geometry
  // change. (The rear fan wall mates the "EFE" edge notch and stays flush.)
  const fingerHoleInset = (settings.cutting.joints.finger.holeOffsetMultiplier + 0.5) * thickness;
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
      cordHole: cordCut("back"),
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
      cordHole: cordCut("front"),
      assembly: {
        type: "placed",
        role: "front-fan-wall",
        placement: {
          position: [0, 0, -workingDepth / 2 + fingerHoleInset],
          rotation: [0, 0, 0],
        },
      },
    }),
  );

  // boxes.py: side walls = [be, "h", te, le]. be = te = "fff" compound (split) or
  // "f"; le = "EFE" (2 filters) / "FE" (1 filter), where the "F" counterpart
  // section spans the back fan wall (d + 2) and the "E" plain sections cover the
  // open filter regions.
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
      // Named for where it reads in the standing 3D view (this wall sits at -x,
      // which the default camera shows on the right). The id/role keep the
      // geometric -x ("left") sense.
      name: "Right side wall",
      width: workingDepth,
      height: chamberHeight,
      requestedFans: settings.fan.banks.left,
      edgeSpec: [bottomEdge, edgeSections("h"), topEdge, leftEdge],
      settings,
      filterFingerHoleRows: createFilterFingerHoleRows(geometry.filterFingerHoleYs, bottomEdge, topEdge),
      cordHole: cordCut("left"),
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
      // Named for the view (+x reads on the left at the default camera).
      name: "Left side wall",
      width: workingDepth,
      height: chamberHeight,
      requestedFans: settings.fan.banks.right,
      edgeSpec: [bottomEdge, edgeSections("h"), topEdge, leftEdge],
      settings,
      filterFingerHoleRows: createFilterFingerHoleRows(geometry.filterFingerHoleYs, bottomEdge, topEdge),
      cordHole: cordCut("right"),
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
      // Stable ids keep their original boxes.py rail-key slug; only the display
      // name was re-mapped to the part's position in the 3D view.
      const idBase = slugify(labelPrefix);
      panels.push(
        createRailPanel(
          `${idBase}-front-long-rail`,
          `${labelPrefix} outer top rail`,
          width,
          rim,
          [edgeSections("E"), edgeSections("h"), longEdge, edgeSections("h")],
          settings,
          filterRailAssembly(filterIndex, "front-long"),
        ),
      );
      panels.push(
        createRailPanel(
          `${idBase}-rear-long-rail`,
          `${labelPrefix} outer right rail`,
          workingDepth - 2 * rim,
          rim,
          edgeSectionsFor("hded"),
          settings,
          filterRailAssembly(filterIndex, "rear-long"),
        ),
      );
      panels.push(
        createRailPanel(
          `${idBase}-left-short-rail`,
          `${labelPrefix} outer left rail`,
          workingDepth - 2 * rim,
          rim,
          edgeSectionsFor("hded"),
          settings,
          filterRailAssembly(filterIndex, "left-short"),
        ),
      );
      panels.push(
        createRailPanel(
          `${idBase}-right-short-rail`,
          `${labelPrefix} outer bottom rail`,
          width,
          rim,
          [longEdge, edgeSections("h"), edgeSections("h"), edgeSections("h")],
          settings,
          filterRailAssembly(filterIndex, "right-short"),
        ),
      );

      panels.push(
        createRailPanel(
          `${idBase}-inner-long-rail`,
          `${labelPrefix} inner top rail`,
          width,
          rim,
          [edgeSections("F"), edgeSections("f"), longEdge, edgeSections("f")],
          settings,
          filterRailAssembly(filterIndex, "inner-long"),
        ),
      );
      panels.push(
        createRailPanel(
          `${idBase}-outer-long-rail`,
          `${labelPrefix} inner right rail`,
          workingDepth - 2 * rim,
          rim,
          edgeSectionsFor("fded"),
          settings,
          filterRailAssembly(filterIndex, "outer-long"),
        ),
      );
      panels.push(
        createRailPanel(
          `${idBase}-inner-short-rail`,
          `${labelPrefix} inner left rail`,
          workingDepth - 2 * rim,
          rim,
          edgeSectionsFor("fded"),
          settings,
          filterRailAssembly(filterIndex, "inner-short"),
        ),
      );
      panels.push(
        createRailPanel(
          `${idBase}-outer-short-rail`,
          `${labelPrefix} inner bottom rail`,
          width,
          rim,
          // Inner flange rear rail keeps its fingers (only the OUTER-frame rear
          // flange is plain on the loading side).
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
  cordHole?: CircleCut | null;
  assembly: CutPanelAssembly;
}): CutPanelDraft {
  const fanCuts = createFanCuts(input.width, input.height, input.requestedFans, input.settings, input.fanCenterY);
  const cord = input.cordHole
    ? [resolveCordAgainstFans(input.cordHole, fanCuts, input.width, input.height, input.settings.cutting.materialThickness)]
    : [];
  return rectangularPanel({
    id: input.id,
    name: input.name,
    width: input.width,
    height: input.height,
    edges: edgeSectionsFor("ffff"),
    thickness: input.settings.cutting.materialThickness,
    kerfFit: input.settings.cutting.kerfFit,
    jointSettings: input.settings.cutting.joints,
    cuts: [...fanCuts, ...(input.cuts ?? []), ...cord],
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
  cuts?: CutFeature[];
  cordHole?: CircleCut | null;
  assembly: CutPanelAssembly;
}): CutPanelDraft {
  const fanCenterY =
    fanCenterYForWall(
      input.settings.filterCount,
      input.height,
      input.settings.cutting.materialThickness,
      input.settings.filter.thickness,
    );
  const fanCuts = createFanCuts(input.width, input.height, input.requestedFans, input.settings, fanCenterY);
  const cord = input.cordHole
    ? [resolveCordAgainstFans(input.cordHole, fanCuts, input.width, input.height, input.settings.cutting.materialThickness)]
    : [];
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
      ...fanCuts,
      ...createFilterFingerHoleCuts(
        input.width,
        input.settings,
        input.filterFingerHoleRows,
      ),
      ...(input.cuts ?? []),
      ...cord,
    ],
    assembly: input.assembly,
  });
}

// Power-cord pass-through bore for one wall, mirroring the 3D-print cord rules.
// Returns null unless this wall is the chosen cord wall and the bore is real.
//   - left/right side walls: the hole sits `cornerOffset` along the depth, and
//     "Cord position" (side) slides it vertically inside the fan chamber, clear
//     of the filter flanges (center = chamber midline, left/right = the ends).
//   - front/back fan walls: centred vertically; "Cord position" slides it along
//     the wall width.
function createCordHoleCut(wall: CordHoleWall, geometry: AirPurifierGeometry, settings: PurifierSettings): CircleCut | null {
  const cord = settings.cutting.cordHole;
  if (cord.wall !== wall || cord.diameter <= 0) {
    return null;
  }
  const t = settings.cutting.materialThickness;
  const r = cord.diameter / 2;
  const margin = r + t;
  const radius = kerfCorrectedRadius(r, settings.cutting.kerfFit);
  const width = geometry.filterDimensions.width;
  const workingDepth = geometry.workingDepth;
  const chamberHeight = geometry.chamberHeight;
  const filterHeight = geometry.filterDimensions.thickness;

  if (wall === "left" || wall === "right") {
    const cx = clamp(Math.max(cord.cornerOffset, margin), margin, workingDepth - margin);
    const low = filterHeight + t + r;
    const high = chamberHeight - (settings.filterCount > 1 ? filterHeight + t : t) - r;
    const cy =
      cord.side === "center"
        ? clamp(chamberHeight / 2, Math.min(low, high), Math.max(low, high))
        : cord.side === "left"
          ? Math.min(low, high)
          : Math.max(low, high);
    return { type: "circle", cx, cy, radius, role: "cord" };
  }

  // The back (top) fan wall is only as tall as the fan band.
  const panelHeight = wall === "back" ? settings.fan.spec.diameter : chamberHeight;
  const along = cord.side === "center" ? width / 2 : cord.side === "left" ? Math.max(cord.cornerOffset, margin) : width - Math.max(cord.cornerOffset, margin);
  const cx = clamp(along, margin, width - margin);
  return { type: "circle", cx, cy: panelHeight / 2, radius, role: "cord" };
}

// Clearance kept between the cord bore and any fan opening on the same wall (mm),
// matching the 3D-print cord/fan anti-collision.
const cordFanClearance = 1;

// Keep the cord bore clear of the fans on its wall. If the cord overlaps any fan
// footprint, slide it the SHORTEST distance to a clear spot: first along the wall
// (same height) into the nearest gap between/beside the fans — which keeps the
// cord on its chosen line and reads cleanly — and only if no clear spot exists at
// that height does it slide vertically instead.
function resolveCordAgainstFans(
  cord: CircleCut,
  fanCuts: readonly CutFeature[],
  panelWidth: number,
  panelHeight: number,
  thickness: number,
): CircleCut {
  const fans = fanCuts.filter((cut): cut is CircleCut => cut.type === "circle" && cut.role === "fan");
  const hits = (cx: number, cy: number): boolean =>
    fans.some((fan) => Math.hypot(fan.cx - cx, fan.cy - cy) < fan.radius + cord.radius + cordFanClearance);
  if (!hits(cord.cx, cord.cy)) {
    return cord;
  }
  const margin = cord.radius + thickness;
  // Nearest value of the moving axis (held at `fixed` on the other axis) that
  // clears every fan, by stepping just outside each fan's forbidden interval.
  const nearestClear = (desired: number, fixed: number, lo: number, hi: number, axis: "x" | "y"): number | null => {
    const candidates = [desired, lo, hi];
    for (const fan of fans) {
      const reach = fan.radius + cord.radius + cordFanClearance;
      const off = (axis === "x" ? fan.cy : fan.cx) - fixed;
      const span = reach * reach - off * off;
      if (span <= 0) continue;
      const half = Math.sqrt(span);
      const center = axis === "x" ? fan.cx : fan.cy;
      candidates.push(center - half - 0.05, center + half + 0.05);
    }
    const ok = candidates
      .filter((value) => value >= lo && value <= hi)
      .filter((value) => (axis === "x" ? !hits(value, fixed) : !hits(fixed, value)))
      .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
    return ok.length > 0 ? ok[0] : null;
  };

  const cx = nearestClear(cord.cx, cord.cy, margin, panelWidth - margin, "x");
  if (cx !== null) {
    return { ...cord, cx };
  }
  const cy = nearestClear(cord.cy, cord.cx, margin, panelHeight - margin, "y");
  return cy !== null ? { ...cord, cy } : cord;
}

// #######################################
// Filter Rails and Frames
// #######################################

function createRailPanel(
  id: string,
  name: string,
  width: number,
  height: number,
  edges: RectPanelEdges,
  settings: PurifierSettings,
  assembly: CutPanelAssembly,
): CutPanelDraft {
  return rectangularPanel({
    id,
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
