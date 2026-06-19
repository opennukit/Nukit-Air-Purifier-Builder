import type { CordHoleWall, PurifierSettings } from "@/domain/purifier/settingsModel";
import type { FilterCount } from "@/domain/purifier/designPresets";
import type { FanCountRequest, FanDiameter } from "@/domain/purifier/fans";
import { createAirPurifierGeometry, fanCenterYForWall, oneSideBackFanBoxDepth, type AirPurifierGeometry } from "@/domain/purifier/geometry";
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
  // One-side "Back" fans: the closed back panel gets a fan grid (the rest of the
  // box is unchanged). 0 = off, -1 = auto fill, >0 = exact count.
  const backPlateFans = settings.design.type === "laser-cut" ? settings.design.backPlateFans : 0;
  // When the one-side Back box sets a Box depth, the chamber (and so the rear wall
  // that covers it) is that deep instead of the fan diameter.
  const rearWallHeight = oneSideBackFanBoxDepth(settings) ?? fanDiameter;
  const panels: CutPanelDraft[] = [];
  const cordCut = (wall: CordHoleWall): CircleCut | null => createCordHoleCut(wall, geometry, settings);
  const fanWallFilterRows = createFilterFingerHoleRows(geometry.filterFingerHoleYs, edgeSections("f"), edgeSections("f"));
  // The side walls carry the front fan wall's joint as FingerHoleEdge ("h")
  // slots set in from their edge by edge_width + thickness/2. So the front fan
  // wall seats that far inside the side walls' front edges, its teeth passing
  // through those slots. This is a placement (lap-joint) offset, not a geometry
  // change. (The rear fan wall mates the "EFE" edge notch and stays flush.)
  const fingerHoleInset = (settings.cutting.joints.finger.holeOffsetMultiplier + 0.5) * thickness;
  const rearFanWallY = rearFanWallCenterY(filterCount, chamberHeight, rearWallHeight);

  panels.push(
    createFanWallPanel({
      id: "top-fan-wall",
      name: "Top fan wall",
      width,
      height: rearWallHeight,
      requestedFans: settings.fan.banks.top,
      fanCenterY: rearWallHeight / 2,
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
  // section spans the chamber (back fan wall) and the "E" plain sections cover the
  // open filter regions. The chamber-clear span is the fan-diameter chamber, or
  // the user's Box depth for the one-side Back box.
  const chamberClear = chamberHeight - filterCount * (filterHeight + thickness);
  const bottomEdge = usesSplitRails ? compound("fff", [rim, workingDepth - 2 * rim, rim]) : edgeSections("f");
  let topEdge = bottomEdge;
  const leftEdge =
    filterCount === 2
      ? compound("EFE", [filterHeight + thickness, chamberClear, filterHeight + thickness])
      : compound("FE", [chamberClear, filterHeight + thickness]);
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
      // This panel is DISPLAYED as "Right side wall" (the id keeps the geometric
      // -x sense), so the user's "right" cord selection belongs here.
      cordHole: cordCut("right"),
      assembly: {
        type: "placed",
        role: "left-side-wall",
        placement: {
          // Preview only. The two-filter side wall is symmetric, so the 180deg
          // flip reads correctly. The one-filter wall is asymmetric, so it must be
          // a true mirror (reflection) of the right wall — rotation alone can't do
          // that, so reflect it (mirrored) and place it un-flipped.
          position: [-width / 2, 0, 0],
          rotation: filterCount === 1 ? [0, -Math.PI / 2, 0] : [Math.PI, -Math.PI / 2, 0],
          mirrored: filterCount === 1,
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
      // This panel is DISPLAYED as "Left side wall", so the user's "left" cord
      // selection belongs here.
      cordHole: cordCut("left"),
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
        name: backPlateFans !== 0 ? "Back plate (fans)" : "Closed back panel",
        width,
        height: workingDepth,
        edges: edgeSectionsFor("hhhh"),
        thickness,
        kerfFit: settings.cutting.kerfFit,
        jointSettings: settings.cutting.joints,
        cuts: backPlateFans !== 0 ? createBackPlateFanGrid(width, workingDepth, backPlateFans, settings) : [],
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
// Back-Plate Fan Grid (one-side "Back" fans)
// #######################################

// A centred grid of fan bores (+ four screw holes each) over the closed back
// panel, kept a fan-radius-plus-wall in from each edge. `requested` < 0 fills the
// grid; a positive count lays out as a centred near-square block. Mirrors the
// 3D-Print bottom-plate grid.
function createBackPlateFanGrid(width: number, height: number, requested: number, settings: PurifierSettings): CutFeature[] {
  const fanDiameter = settings.fan.spec.diameter;
  const t = settings.cutting.materialThickness;
  const minEdge = t + fanDiameter / 2;
  const pitch = fanDiameter + repackedFanGap;
  const maxCols = backFansPerSide(width, minEdge, pitch);
  const maxRows = backFansPerSide(height, minEdge, pitch);
  const maximum = maxCols * maxRows;
  if (maximum <= 0) {
    return [];
  }
  const target = requested < 0 ? maximum : Math.min(requested, maximum);
  if (target <= 0) {
    return [];
  }

  const centers: { cx: number; cy: number }[] = [];
  if (target >= maximum) {
    const xs = centeredGridPositions(maxCols, width, pitch);
    const ys = centeredGridPositions(maxRows, height, pitch);
    for (const cy of ys) {
      for (const cx of xs) {
        centers.push({ cx, cy });
      }
    }
  } else {
    const { rows } = chooseBackGrid(target, maxCols, maxRows);
    const rowCounts = distributeBackRows(target, rows);
    const ys = centeredGridPositions(rows, height, pitch);
    rowCounts.forEach((rowCount, rowIndex) => {
      for (const cx of centeredGridPositions(rowCount, width, pitch)) {
        centers.push({ cx, cy: ys[rowIndex] });
      }
    });
  }

  const kerfFit = settings.cutting.kerfFit;
  const screwOffset = settings.fan.spec.screwSpacing / 2;
  const cuts: CutFeature[] = [];
  for (const { cx, cy } of centers) {
    cuts.push({ type: "circle", cx, cy, radius: kerfCorrectedRadius(Math.max(4, (fanDiameter - 4) / 2), kerfFit), role: "fan" });
    for (const dx of [-screwOffset, screwOffset]) {
      for (const dy of [-screwOffset, screwOffset]) {
        cuts.push({ type: "circle", cx: cx + dx, cy: cy + dy, radius: kerfCorrectedRadius(settings.cutting.screwHoleDiameter / 2, kerfFit), role: "screw" });
      }
    }
  }
  return cuts;
}

function backFansPerSide(length: number, minEdge: number, pitch: number): number {
  const span = length - 2 * minEdge;
  return span < 0 ? 0 : Math.max(0, Math.floor(1 + span / pitch));
}

function centeredGridPositions(count: number, length: number, pitch: number): number[] {
  if (count <= 0) {
    return [];
  }
  const total = count <= 1 ? 0 : (count - 1) * pitch;
  const first = count === 1 ? length / 2 : (length - total) / 2;
  return Array.from({ length: count }, (_, index) => first + index * pitch);
}

// Squarest rows x cols block holding `count` (4 -> 2x2, 6 -> 3x2, 3 -> 1x3),
// preferring more columns than rows on a tie.
function chooseBackGrid(count: number, maxCols: number, maxRows: number): { cols: number; rows: number } {
  let best: { cols: number; rows: number; score: number[] } | null = null;
  for (let cols = 1; cols <= maxCols; cols += 1) {
    for (let rows = 1; rows <= maxRows; rows += 1) {
      if (cols * rows < count) {
        continue;
      }
      const score = [cols * rows - count, Math.abs(cols - rows), -cols, -rows];
      if (best === null || backGridLess(score, best.score)) {
        best = { cols, rows, score };
      }
    }
  }
  return best === null ? { cols: Math.max(1, Math.min(count, maxCols)), rows: 1 } : { cols: best.cols, rows: best.rows };
}

// Split `count` across `rows` evenly, heavier rows symmetric about the centre.
function distributeBackRows(count: number, rows: number): number[] {
  const base = Math.floor(count / rows);
  const counts = new Array<number>(rows).fill(base);
  let remaining = count - base * rows;
  if (remaining % 2 === 1 && rows % 2 === 1) {
    counts[(rows - 1) / 2] += 1;
    remaining -= 1;
  }
  let low = 0;
  let high = rows - 1;
  while (remaining >= 2 && low < high) {
    counts[low] += 1;
    counts[high] += 1;
    low += 1;
    high -= 1;
    remaining -= 2;
  }
  const centreOut = [...counts.keys()].sort((a, b) => Math.abs(a - (rows - 1) / 2) - Math.abs(b - (rows - 1) / 2));
  let index = 0;
  while (remaining > 0) {
    counts[centreOut[index % rows]] += 1;
    remaining -= 1;
    index += 1;
  }
  return counts;
}

function backGridLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return false;
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
  const fanCuts = createFanCuts(input.width, input.height, input.requestedFans, input.settings, input.fanCenterY, input.cordHole);
  return rectangularPanel({
    id: input.id,
    name: input.name,
    width: input.width,
    height: input.height,
    edges: edgeSectionsFor("ffff"),
    thickness: input.settings.cutting.materialThickness,
    kerfFit: input.settings.cutting.kerfFit,
    jointSettings: input.settings.cutting.joints,
    cuts: [...fanCuts, ...(input.cuts ?? []), ...(input.cordHole ? [input.cordHole] : [])],
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
  const fanCuts = createFanCuts(input.width, input.height, input.requestedFans, input.settings, fanCenterY, input.cordHole);
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
      ...(input.cordHole ? [input.cordHole] : []),
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
    // Corner offset is measured from the far (bottom) end of the wall, so the
    // cord defaults to the bottom corner rather than the top.
    const cx = clamp(workingDepth - Math.max(cord.cornerOffset, margin), margin, workingDepth - margin);
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
// Gap left between adjacent fans when they are re-packed to make room for a cord.
const repackedFanGap = 10;

// Fan-centre positions along a wall. Normally the fans are spread evenly, but if
// they would collide with the cord, they are re-packed closer together (minimum
// spacing, centred) and slid clear of the cord — exactly like the 3D print model
// (which keeps its corner-safe spread, leaving the corner cord untouched). The
// cord itself never moves.
function fanCenterXs(
  length: number,
  fanCount: number,
  fanDiameter: number,
  keepOut: { x: number; reach: number } | null,
): number[] {
  const segment = (length - 20) / fanCount;
  const spread = Array.from({ length: fanCount }, (_, index) => 10 + segment / 2 + index * segment);
  if (keepOut === null || !spread.some((cx) => Math.abs(cx - keepOut.x) < keepOut.reach)) {
    return spread;
  }
  const pitch = fanDiameter + repackedFanGap;
  const groupWidth = (fanCount - 1) * pitch;
  const edge = fanDiameter / 2 + 4;
  const loFirst = edge;
  const hiFirst = length - edge - groupWidth;
  if (hiFirst < loFirst) {
    return spread; // not enough room to re-pack; leave the even spread
  }
  const centeredFirst = (length - groupWidth) / 2;
  const positions = (first: number): number[] => Array.from({ length: fanCount }, (_, index) => first + index * pitch);
  const hits = (first: number): boolean => positions(first).some((cx) => Math.abs(cx - keepOut.x) < keepOut.reach);
  const first =
    [centeredFirst, keepOut.x + keepOut.reach, keepOut.x - keepOut.reach - groupWidth]
      .map((value) => clamp(value, loFirst, hiFirst))
      .filter((value) => !hits(value))
      .sort((a, b) => Math.abs(a - centeredFirst) - Math.abs(b - centeredFirst))[0] ?? clamp(centeredFirst, loFirst, hiFirst);
  return positions(first);
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
  cord?: CircleCut | null,
): CutFeature[] {
  const fanDiameter = settings.fan.spec.diameter;
  const kerfFit = settings.cutting.kerfFit;
  const fanCount = resolveFanCount(requestedFans, length, fanDiameter);
  if (fanCount === 0) {
    return [];
  }

  const cuts: CutFeature[] = [];
  const screwOffset = settings.fan.spec.screwSpacing / 2;
  const minCenter = fanDiameter / 2 + 4;
  const maxCenter = height - fanDiameter / 2 - 4;
  const center = minCenter <= maxCenter ? clamp(centerY, minCenter, maxCenter) : height / 2;
  // Only avoid the cord horizontally if it actually shares the fan row's height.
  const reach = fanDiameter / 2 + (cord?.radius ?? 0) + cordFanClearance;
  const keepOut = cord && Math.abs(cord.cy - center) < reach ? { x: cord.cx, reach } : null;
  const xs = fanCenterXs(length, fanCount, fanDiameter, keepOut);

  for (let index = 0; index < fanCount; index += 1) {
    const cx = xs[index];
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
