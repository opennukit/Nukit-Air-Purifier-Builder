import type { TempestChunkGrid, TempestFanLayout, TempestFilterLayout, TempestModel } from "@/domain/designs/tempest/model";
import type { TempestExtrudeAxis } from "@/domain/designs/tempest/shared";
import { matchTopology } from "@/domain/designs/tempest/topology";
import type { GeometryContext } from "./context";
import { CORD_CYLINDER_SEGMENTS, EPSILON_LIP, SHELL_OVERLAP_MM } from "./context";
import { cylinderAlong, cylinderAlongFromStart, orientZExtrusion, unionAll } from "./primitives";
import { towerCornerChamfer } from "./quadAssembly";

type AlignmentPinSpec = { readonly diameter: number; readonly holeDepth: number; readonly spacing: number };

// #######################################
// Cord Pass-Through
// #######################################

const CORD_BOSS_DEPTH_MM = 4;
const CORD_BOSS_FACE_MEAT_MM = 4;

export function cordHoleCylinders<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid[] {
  const cord = model.cordPassThrough;
  if (cord.type === "none") {
    return [];
  }
  if (cord.type === "top-cylinder") {
    return [cylinderAlong(ctx, "z", [cord.x, cord.y, cord.zStart + cord.depth / 2], cord.depth + 2 * EPSILON_LIP, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }

  // The bore pierces the wall AND the drillable boss on its inside face
  // (cordBossCones), so the drilled span centers on wall + boss.
  const boredDepth = model.frame.wallThickness + CORD_BOSS_DEPTH_MM;
  const wallCenter = boredDepth / 2;
  const oppositeWallCenter = cord.wall === "front" || cord.wall === "back" ? model.box.depth - wallCenter : model.box.width - wallCenter;
  const length = boredDepth + 2 * SHELL_OVERLAP_MM;
  if (cord.wall === "front") {
    return [cylinderAlong(ctx, "y", [cord.positionAlongWall, wallCenter, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  if (cord.wall === "back") {
    return [cylinderAlong(ctx, "y", [cord.positionAlongWall, oppositeWallCenter, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  if (cord.wall === "left") {
    return [cylinderAlong(ctx, "x", [wallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
  }
  return [cylinderAlong(ctx, "x", [oppositeWallCenter, cord.positionAlongWall, cord.verticalCenter], length, cord.diameter / 2, CORD_CYLINDER_SEGMENTS)];
}

// DRILLABLE_CORD_BOSS_TAG: extra meat around the wall cord bore so a builder can
// drill it out for a larger connector without breaking through a bare 5mm wall.
// A 45 degree truncated cone on the wall's inside face: in the upright print pose
// the bore axis lies horizontal, so every boss surface slopes at 45 degrees or
// steeper and prints without support. The tower's top-cylinder cord passes
// through the 10mm top plate, which already has drilling headroom.
export function cordBossCones<Solid, Region>(ctx: GeometryContext<Solid, Region>, model: TempestModel): Solid[] {
  const cord = model.cordPassThrough;
  if (cord.type !== "wall-cylinder") {
    return [];
  }
  const faceRadius = cord.diameter / 2 + CORD_BOSS_FACE_MEAT_MM;
  const baseRadius = faceRadius + CORD_BOSS_DEPTH_MM;
  const wall = model.frame.wallThickness;
  // The base end starts SHELL_OVERLAP_MM inside the wall so the union never
  // leaves a coincident-face sliver against the interior wall surface.
  const height = CORD_BOSS_DEPTH_MM + SHELL_OVERLAP_MM;
  const halfway = height / 2 - SHELL_OVERLAP_MM; // base face to cone center

  // orientZExtrusion maps the cone's local -z (bottomRadius) end to: axis "x" ->
  // global -x, axis "y" -> global +y. Pick bottom/top radii so the wide end
  // always sits at the wall's interior face.
  const cone = (axis: "x" | "y", center: readonly [number, number, number], wideEndAt: "negative" | "positive"): Solid => {
    const wideAtBottom = (axis === "x" && wideEndAt === "negative") || (axis === "y" && wideEndAt === "positive");
    return ctx.modeling.transforms.translate(
      center,
      orientZExtrusion(
        ctx,
        axis,
        ctx.modeling.primitives.cone({
          height,
          bottomRadius: wideAtBottom ? baseRadius : faceRadius,
          topRadius: wideAtBottom ? faceRadius : baseRadius,
          segments: CORD_CYLINDER_SEGMENTS,
        }),
      ),
    );
  };

  if (cord.wall === "front") {
    return [cone("y", [cord.positionAlongWall, wall + halfway, cord.verticalCenter], "negative")];
  }
  if (cord.wall === "back") {
    return [cone("y", [cord.positionAlongWall, model.box.depth - wall - halfway, cord.verticalCenter], "positive")];
  }
  if (cord.wall === "left") {
    return [cone("x", [wall + halfway, cord.positionAlongWall, cord.verticalCenter], "negative")];
  }
  return [cone("x", [model.box.width - wall - halfway, cord.positionAlongWall, cord.verticalCenter], "positive")];
}

// #######################################
// Alignment Pin Placements (pure)
// #######################################

// One alignment-pin site in source (as-modelled) millimeters: the pin's center
// point on the seam plane; the pin hole runs holeDepth into each chunk from
// here along `axis`. This is the single source of the pin-candidate math —
// pinHoles turns these into CSG cylinders, and the exploded preview renders
// them as filament pins.
export type TempestAlignmentPinPlacement = {
  readonly position: readonly [number, number, number];
  readonly axis: TempestExtrudeAxis;
  // Optional shallower half-depth into each chunk (millimeters). Absent means the
  // full pin.holeDepth. Set for top-plate pins that must stop short of a
  // perpendicular hole (fan-grid opening or screw hole).
  readonly holeDepth?: number;
};

export function tempestAlignmentPinPlacements(model: TempestModel, chunkGrid: TempestChunkGrid): readonly TempestAlignmentPinPlacement[] {
  if (model.settings.alignmentPins.type === "disabled") {
    return [];
  }
  const pin = model.settings.alignmentPins;
  if (
    pin.diameter <= 0 ||
    pin.holeDepth <= 0 ||
    pin.spacing <= 0 ||
    (chunkGrid.countX <= 1 && chunkGrid.countY <= 1 && chunkGrid.countZ <= 1)
  ) {
    return [];
  }

  return matchTopology(model, {
    sandwich: (m) => pinPlacementsSandwich(m, m.filterLayout, m.fanLayout, chunkGrid, pin),
    quad: (m) => pinPlacementsQuad(m, m.filterLayout, m.fanLayout, chunkGrid, pin),
  });
}

// The placements that survive the CSG build, as pure data: the sandwich build
// subtracts the wall fan bores from the pin candidates, so a placement whose
// center sits inside a bore is dropped here too. A pin that merely grazes a
// bore keeps its (still usable) hole in both views.
export function tempestPinPlacementsClearOfFans(model: TempestModel, chunkGrid: TempestChunkGrid): readonly TempestAlignmentPinPlacement[] {
  const placements = tempestAlignmentPinPlacements(model, chunkGrid);
  return matchTopology(model, {
    sandwich: (m) => {
      const bores = sandwichFanBores(m, m.fanLayout);
      // The filter loading slot cuts an opening through one wall, so a seam pin
      // landing on that wall within the slot footprint has no material to grip
      // and the CSG cuts no hole there — it would float in the exploded preview.
      const slots = sandwichLoadingSlots(m, m.filterLayout);
      const pinSpec = m.settings.alignmentPins.type === "enabled" ? m.settings.alignmentPins : null;
      const seamClearance = perpendicularSeamClearance(pinSpec);
      // A pin whose hole reaches the round fan bore breaks out through its curved
      // face. Its socket runs the full holeDepth along the pin axis, so even a pin
      // centred outside the bore can sweep into it — test the socket segment, and
      // drop anything within (bore radius + pin radius) of it.
      const boreClearance = pinSpec === null ? 0 : pinSpec.diameter / 2 + 0.5;
      const boreReach = pinSpec === null ? 0 : pinSpec.holeDepth;
      return placements.filter(
        (placement) =>
          !bores.some((bore) => boreSwallowsPin(bore, placement, m.frame.wallThickness, boreClearance, boreReach)) &&
          !slots.some((slot) => loadingSlotSwallowsPin(slot, placement, pinSpec)) &&
          !pinBreachesPerpendicularSeam(placement, chunkGrid, seamClearance),
      );
    },
    quad: (m) => {
      // Drop any pin centered in an open region — it would have no material to
      // bite into and the CSG cuts no hole there, so the exploded preview would
      // float it. Three open regions: the side filter windows, the filter
      // pocket/slot columns (open up through the top plate), and the bevelled
      // outer corners.
      const windows = quadSideWindows(m, m.filterLayout);
      const pockets = quadFilterPocketColumns(m, m.filterLayout);
      const chamfer = towerCornerChamfer(
        m.frame.towerCornerPostChamfer,
        m.filterLayout.structuralOffset,
        m.frame.outsideFlangeThickness,
      );
      // Widen the bevel exclusion by the pin's reach so a hole near the corner
      // never grazes (breaks out of) the 45° chamfer face, only its centre.
      const pinReach = m.settings.alignmentPins.type === "enabled" ? m.settings.alignmentPins.diameter / 2 : 0;
      const bevelClearance = chamfer + pinReach * Math.SQRT2 + 0.5;
      // Drop pins whose socket radius would graze into a side window even though
      // their centre sits just outside the cut edge.
      const windowClearance = pinReach + 0.5;
      const seamClearance = perpendicularSeamClearance(
        m.settings.alignmentPins.type === "enabled" ? m.settings.alignmentPins : null,
      );
      return placements.filter(
        (placement) =>
          !windows.some((window) => windowSwallowsPin(window, placement, windowClearance)) &&
          !pockets.some((pocket) => boxSwallowsPin(pocket, placement)) &&
          !cornerBevelSwallowsPin(placement, m.box.width, m.box.depth, bevelClearance) &&
          !pinBreachesPerpendicularSeam(placement, chunkGrid, seamClearance),
      );
    },
  });
}

// #######################################
// Solid-Aware Pin Set (air filter + coverage)
// #######################################

// True when solid material fills a tiny box at `point`. The single geometry query
// the solid-aware pin passes share (air-only filtering and per-piece coverage).
function probeHasMaterial<Solid, Region>(
  modeling: GeometryContext<Solid, Region>["modeling"],
  solid: Solid,
  point: readonly [number, number, number],
): boolean {
  return !modeling.analysis.isEmpty(modeling.booleans.intersect(solid, modeling.primitives.cuboid({ center: point, size: [0.6, 0.6, 0.6] })));
}

// A pin whose socket lies entirely in open space (e.g. a base-plate seam pin that
// falls in the bottom-filter pocket) drills nothing and just floats in the
// exploded preview. Keep a pin only when its socket meets material somewhere
// along its length.
function pinCutsMaterial<Solid, Region>(
  modeling: GeometryContext<Solid, Region>["modeling"],
  solid: Solid,
  placement: TempestAlignmentPinPlacement,
  fullDepth: number,
): boolean {
  const axisIndex = placement.axis === "x" ? 0 : placement.axis === "y" ? 1 : 2;
  const depth = placement.holeDepth ?? fullDepth;
  for (const t of [-0.9, -0.45, 0, 0.45, 0.9]) {
    const point: [number, number, number] = [...placement.position];
    point[axisIndex] = placement.position[axisIndex] + t * depth;
    if (probeHasMaterial(modeling, solid, point)) {
      return true;
    }
  }
  return false;
}

// The pin set actually drilled into (and shown on) the assembled shell: the
// seam-band placements minus any that float in open space, plus per-piece
// coverage pins so no disconnected printed piece is left unpinned. Both the CSG
// drilling (pinHoles) and the exploded-preview diagram derive from this ONE
// computation, so the drawn pins and the drilled holes always agree.
export function tempestFinalPinPlacements<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  assembledSolid: Solid,
  model: TempestModel,
  chunkGrid: TempestChunkGrid,
): TempestAlignmentPinPlacement[] {
  const pin = model.settings.alignmentPins;
  if (pin.type !== "enabled") {
    return [];
  }
  const base = tempestPinPlacementsClearOfFans(model, chunkGrid).filter((placement) =>
    pinCutsMaterial(ctx.modeling, assembledSolid, placement, pin.holeDepth),
  );
  // Drop base pins whose socket would break through thin material (a through-hole),
  // BEFORE coverage, so coverage then re-fastens any piece a dropped pin had held.
  // Coverage pins are already embedded (socketEmbedded), so they need no clamp.
  const blindBase = blindDepthClampedPlacements(ctx, assembledSolid, base, pin.holeDepth, pin.diameter / 2);
  const coverage = tempestCoveragePins(ctx, assembledSolid, model, chunkGrid, blindBase);
  // Shorten (don't drop) any socket near a perpendicular seam so no two crossing
  // sockets meet at a shared chunk edge, the last source of pin through-holes.
  return clampPinDepthToPerpendicularSeams([...blindBase, ...coverage], chunkGrid, pin);
}

// #######################################
// Socket Containment
// #######################################

// Extra clearance beyond the pin radius the socket wall must keep from open space,
// so a socket that merely grazes a face (its wall tangent to a void) is rejected too.
const SOCKET_LATERAL_MARGIN_MM = 0.5;

// Is the whole pin socket buried in material, not just its tip along the axis? The
// socket is a cylinder reaching `depth` into the chunk on EACH side of the seam. Point
// sampling its wall misses a void that sits off a diagonal, so this tests it EXACTLY:
// build the socket cylinder (grown by a margin) and subtract the solid; anything left
// is socket wall or tip standing in open space, a through-hole along the axis or a
// side breakout into an internal void, so the pin is rejected. One boolean per pin,
// and exact, which the earlier tip-only probe was not: it let base pins in the housing
// corners bore sideways into the bottom-filter pocket and air chamber (original-cube on
// small beds). Both the base band and the coverage grid gate on this same test.
function socketFullyEmbedded<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  solid: Solid,
  position: readonly [number, number, number],
  axis: TempestExtrudeAxis,
  depth: number,
  radius: number,
): boolean {
  const socket = cylinderAlong(ctx, axis, position, 2 * depth, radius, CORD_CYLINDER_SEGMENTS);
  return ctx.modeling.analysis.isEmpty(ctx.modeling.booleans.subtract(socket, solid));
}

// #######################################
// Blind-Socket Depth Clamp
// #######################################

// Drop any pin whose socket would break through material, out a thin wall along its
// axis OR sideways into an internal void, so every drilled socket stays a blind
// pocket instead of a through-hole. Bites on small beds where the housing splits into
// thin pieces; coverage still fastens any piece a dropped pin would have held.
function blindDepthClampedPlacements<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  solid: Solid,
  placements: readonly TempestAlignmentPinPlacement[],
  fullDepth: number,
  radius: number,
): TempestAlignmentPinPlacement[] {
  return placements.filter((placement) =>
    socketFullyEmbedded(ctx, solid, placement.position, placement.axis, placement.holeDepth ?? fullDepth, radius + SOCKET_LATERAL_MARGIN_MM),
  );
}

// #######################################
// Per-Piece Pin Coverage
// #######################################

// A chunk can split into several disconnected printed pieces (e.g. a window cut
// or the outer-flange skirt separates a plate from the body). The seam-band
// placement above pins the chunk as a whole, but a stray piece can end up with
// no pin, so it cannot be glued to anything. This closes that gap: it clips the
// assembled solid to each chunk cell, decomposes it into its separate pieces,
// and for any piece that no kept pin already reaches, adds one pin on an
// interior seam the piece spans, verifying solid material on BOTH sides of that
// seam (so the socket bites into the piece and its neighbour). Topology-agnostic
// and self-verifying, so it holds for every design, not just the one that
// surfaced it.
export function tempestCoveragePins<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  assembledSolid: Solid,
  model: TempestModel,
  chunkGrid: TempestChunkGrid,
  basePlacements: readonly TempestAlignmentPinPlacement[],
): TempestAlignmentPinPlacement[] {
  const pin = model.settings.alignmentPins;
  if (pin.type !== "enabled") {
    return [];
  }
  const { boundariesX: bx, boundariesY: by, boundariesZ: bz } = chunkGrid;
  const interior: Readonly<Record<0 | 1 | 2, readonly number[]>> = {
    0: bx.slice(1, -1),
    1: by.slice(1, -1),
    2: bz.slice(1, -1),
  };
  if (interior[0].length + interior[1].length + interior[2].length === 0) {
    return []; // single chunk: nothing to pin together
  }
  const { modeling } = ctx;
  const SEAM_TOL_MM = 0.1;
  // How far out (in the seam plane) to require material around the socket, so a
  // coverage pin never grazes out through the side of a piece: the pin radius plus
  // a small margin.
  const lateralReach = pin.diameter / 2 + 0.5;
  // Target in-plane spacing between coverage pins on a seam face, so a large stray
  // face gets a row of pins (like the walls) instead of one at its centre.
  const MIN_PIN_GAP_MM = pin.spacing * 0.6;
  const axisName = (index: 0 | 1 | 2): TempestExtrudeAxis => (index === 0 ? "x" : index === 1 ? "y" : "z");
  const placed: TempestAlignmentPinPlacement[] = basePlacements.map((p) => ({ position: p.position, axis: p.axis }));
  const coverage: TempestAlignmentPinPlacement[] = [];

  // Is the whole pin socket embedded in material, not just at its centre? Uses the
  // same exact cylinder-minus-solid test the base band gates on, so a coverage pin
  // never grazes out through a face or bores into an internal void on a thin or
  // curved piece (e.g. the top exhaust ring).
  const socketEmbedded = (position: readonly [number, number, number], axisIndex: 0 | 1 | 2): boolean =>
    socketFullyEmbedded(ctx, assembledSolid, position, axisName(axisIndex), pin.holeDepth, lateralReach);

  // Is there already a pin (base or coverage) crossing `seam` within MIN_PIN_GAP of
  // this spot, in the seam's plane? Used to fill a face to the target spacing
  // without duplicating pins a base band already placed there.
  const pinnedNearOnSeam = (
    point: readonly [number, number, number],
    axisIndex: 0 | 1 | 2,
    seam: number,
  ): boolean =>
    placed.some((p) => {
      if (p.axis !== axisName(axisIndex) || Math.abs(p.position[axisIndex] - seam) > SEAM_TOL_MM) {
        return false;
      }
      let sq = 0;
      for (const k of [0, 1, 2] as const) {
        if (k !== axisIndex) {
          sq += (p.position[k] - point[k]) ** 2;
        }
      }
      return sq < MIN_PIN_GAP_MM * MIN_PIN_GAP_MM;
    });

  for (let ix = 0; ix < bx.length - 1; ix += 1) {
    for (let iy = 0; iy < by.length - 1; iy += 1) {
      for (let iz = 0; iz < bz.length - 1; iz += 1) {
        const center: [number, number, number] = [(bx[ix] + bx[ix + 1]) / 2, (by[iy] + by[iy + 1]) / 2, (bz[iz] + bz[iz + 1]) / 2];
        const size: [number, number, number] = [bx[ix + 1] - bx[ix] + 0.02, by[iy + 1] - by[iy] + 0.02, bz[iz + 1] - bz[iz] + 0.02];
        const cellSolid = modeling.booleans.intersect(assembledSolid, modeling.primitives.cuboid({ center, size }));
        if (modeling.analysis.isEmpty(cellSolid)) {
          continue;
        }
        for (const piece of modeling.analysis.decompose(cellSolid)) {
          const { min, max } = modeling.analysis.boundingBox(piece);
          // Coverage only fills DISCONNECTED stray pieces that no base pin reaches;
          // connected pieces (walls, plates) already get their density from the
          // base seam bands. Skipping the pinned pieces keeps this pass fast (it
          // otherwise re-probes every well-covered face).
          const pinnedByBase = basePlacements.some(
            (p) =>
              p.position[0] >= min[0] - MIN_PIN_GAP_MM && p.position[0] <= max[0] + MIN_PIN_GAP_MM &&
              p.position[1] >= min[1] - MIN_PIN_GAP_MM && p.position[1] <= max[1] + MIN_PIN_GAP_MM &&
              p.position[2] >= min[2] - MIN_PIN_GAP_MM && p.position[2] <= max[2] + MIN_PIN_GAP_MM,
          );
          if (pinnedByBase) {
            continue;
          }
          // FILL each seam the stray spans to the normal spacing (not a single pin
          // at its centre): step a grid across the face's two in-plane axes and add
          // a pin wherever the socket is fully embedded and no pin sits within
          // MIN_PIN_GAP. So a stray bridging two neighbours is fastened on both
          // ends and a large stray face gets a full row.
          for (const axisIndex of [0, 1, 2] as const) {
            for (const seam of interior[axisIndex]) {
              if (seam < min[axisIndex] - 0.6 || seam > max[axisIndex] + 0.6) {
                continue;
              }
              const [u, v] = ([0, 1, 2] as const).filter((k) => k !== axisIndex) as [0 | 1 | 2, 0 | 1 | 2];
              for (const gu of rimPositions(min[u], max[u], pin.spacing)) {
                for (const gv of rimPositions(min[v], max[v], pin.spacing)) {
                  const position: [number, number, number] = [0, 0, 0];
                  position[axisIndex] = seam;
                  position[u] = gu;
                  position[v] = gv;
                  if (pinnedNearOnSeam(position, axisIndex, seam)) {
                    continue;
                  }
                  if (socketEmbedded(position, axisIndex)) {
                    const placement: TempestAlignmentPinPlacement = { position, axis: axisName(axisIndex) };
                    coverage.push(placement);
                    placed.push(placement);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return coverage;
}

// #######################################
// Alignment Pin Holes (CSG)
// #######################################

export function pinHoles<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  chunkGrid: TempestChunkGrid,
  assembledSolid?: Solid,
): Solid[] {
  if (model.settings.alignmentPins.type === "disabled") {
    return [];
  }
  const pin = model.settings.alignmentPins;
  // With the assembled shell in hand, drill the solid-aware set: the seam-band
  // placements minus any floating in open space, plus per-piece coverage pins.
  // Without it (no shell passed), fall back to the seam-band filter alone — the
  // same set the exploded preview used before, so behaviour never regresses.
  const placements =
    assembledSolid === undefined
      ? tempestPinPlacementsClearOfFans(model, chunkGrid)
      : tempestFinalPinPlacements(ctx, assembledSolid, model, chunkGrid);
  if (placements.length === 0) {
    return [];
  }
  const candidates = placements.map((placement) => pinHoleCylinder(ctx, placement, pin));

  return matchTopology(model, {
    sandwich: (m) => {
      // Keep pins clear of the fan bodies so a seam pin never lands in a fan bore.
      const fanZones = fanBodyZones(ctx, m, m.fanLayout);
      const candidateGeometry = unionAll(ctx, candidates);
      return [fanZones.length === 0 ? candidateGeometry : ctx.modeling.booleans.subtract(candidateGeometry, unionAll(ctx, fanZones))];
    },
    quad: () => [unionAll(ctx, candidates)],
  });
}

function pinHoleCylinder<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  placement: TempestAlignmentPinPlacement,
  pin: AlignmentPinSpec,
): Solid {
  const [x, y, z] = placement.position;
  const depth = placement.holeDepth ?? pin.holeDepth;
  const start: readonly [number, number, number] =
    placement.axis === "x" ? [x - depth, y, z] : placement.axis === "y" ? [x, y - depth, z] : [x, y, z - depth];
  return cylinderAlongFromStart(ctx, placement.axis, start, 2 * depth, pin.diameter / 2);
}

function pinPlacementsSandwich(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>,
  chunkGrid: TempestChunkGrid,
  pin: AlignmentPinSpec,
): TempestAlignmentPinPlacement[] {
  const placements: TempestAlignmentPinPlacement[] = [];
  // The "Back" fan grid bores circular holes through the solid bottom plate, so a
  // seam pin running along that plate must stop short of (or skip) them — the same
  // treatment the tower's top-plate fan grid gets. Null when there is no grid.
  const bottomHoles = sandwichBottomPlateHoles(model, fanLayout);
  // A bottom-plate pin at (sx, sy) along `axis`: full depth when there are no back
  // holes, otherwise clamped to stop short of them (null = skip this pin).
  const bottomPinDepth = (sx: number, sy: number, axis: "x" | "y"): number | null =>
    bottomHoles === null ? pin.holeDepth : clampedTopPinDepth(bottomHoles, sx, sy, axis, pin.holeDepth);
  const pushBottomPin = (position: readonly [number, number, number], axis: "x" | "y", depth: number): void => {
    placements.push(depth < pin.holeDepth ? { position, axis, holeDepth: depth } : { position, axis });
  };
  // Planar (bottom-plate / top-frame) pins run along a seam; their free
  // coordinate must clear the 4-way chunk corners (the perpendicular interior
  // seams) and the outer perimeter, so a pin never lands on a piece edge or
  // corner where it has too little material around it.
  const interiorSeamsX = chunkGrid.boundariesX.slice(1, -1);
  const interiorSeamsY = chunkGrid.boundariesY.slice(1, -1);
  const cornerClearance = pin.holeDepth + pin.diameter;
  const planarCoordClear = (coord: number, perpendicularSeams: readonly number[], extent: number): boolean =>
    coord > cornerClearance &&
    coord < extent - cornerClearance &&
    !perpendicularSeams.some((seam) => Math.abs(coord - seam) < cornerClearance);

  if (chunkGrid.countX > 1) {
    for (let index = 1; index < chunkGrid.countX; index += 1) {
      const seamX = chunkGrid.boundariesX[index];
      for (const wallY of [model.frame.wallThickness / 2, model.box.depth - model.frame.wallThickness / 2]) {
        for (const gridZ of rimPositions(model.frame.outsideFlangeThickness, model.box.height - model.frame.outsideFlangeThickness, pin.spacing)) {
          placements.push({ position: [seamX, wallY, gridZ], axis: "x" });
        }
      }
      for (const frameZ of horizontalFrameMidlinesWithOpening(model, filterLayout)) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.frame.rim, pin.spacing)) {
          if (planarCoordClear(gridY, interiorSeamsY, model.box.depth)) {
            placements.push({ position: [seamX, gridY, frameZ], axis: "x" });
          }
        }
        for (const gridY of rimPositions(model.box.depth - model.frame.rim, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          if (planarCoordClear(gridY, interiorSeamsY, model.box.depth)) {
            placements.push({ position: [seamX, gridY, frameZ], axis: "x" });
          }
        }
      }
      for (const frameZ of horizontalSolidPlateMidlines(model, filterLayout)) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          if (!planarCoordClear(gridY, interiorSeamsY, model.box.depth)) {
            continue;
          }
          const depth = bottomPinDepth(seamX, gridY, "x");
          if (depth !== null) {
            pushBottomPin([seamX, gridY, frameZ], "x", depth);
          }
        }
      }
    }
  }

  if (chunkGrid.countY > 1) {
    for (let index = 1; index < chunkGrid.countY; index += 1) {
      const seamY = chunkGrid.boundariesY[index];
      for (const wallX of [model.frame.wallThickness / 2, model.box.width - model.frame.wallThickness / 2]) {
        for (const gridZ of rimPositions(model.frame.outsideFlangeThickness, model.box.height - model.frame.outsideFlangeThickness, pin.spacing)) {
          placements.push({ position: [wallX, seamY, gridZ], axis: "y" });
        }
      }
      for (const frameZ of horizontalFrameMidlinesWithOpening(model, filterLayout)) {
        for (const gridX of rimPositions(model.frame.wallThickness, model.frame.rim, pin.spacing)) {
          if (planarCoordClear(gridX, interiorSeamsX, model.box.width)) {
            placements.push({ position: [gridX, seamY, frameZ], axis: "y" });
          }
        }
        for (const gridX of rimPositions(model.box.width - model.frame.rim, model.box.width - model.frame.wallThickness, pin.spacing)) {
          if (planarCoordClear(gridX, interiorSeamsX, model.box.width)) {
            placements.push({ position: [gridX, seamY, frameZ], axis: "y" });
          }
        }
      }
      for (const frameZ of horizontalSolidPlateMidlines(model, filterLayout)) {
        for (const gridX of rimPositions(model.frame.wallThickness, model.box.width - model.frame.wallThickness, pin.spacing)) {
          if (!planarCoordClear(gridX, interiorSeamsX, model.box.width)) {
            continue;
          }
          const depth = bottomPinDepth(gridX, seamY, "y");
          if (depth !== null) {
            pushBottomPin([gridX, seamY, frameZ], "y", depth);
          }
        }
      }
    }
  }

  if (chunkGrid.countZ > 1) {
    for (let index = 1; index < chunkGrid.countZ; index += 1) {
      const seamZ = chunkGrid.boundariesZ[index];
      for (const wallY of [model.frame.wallThickness / 2, model.box.depth - model.frame.wallThickness / 2]) {
        for (const gridX of rimPositions(0, model.box.width, pin.spacing)) {
          placements.push({ position: [gridX, wallY, seamZ], axis: "z" });
        }
      }
      for (const wallX of [model.frame.wallThickness / 2, model.box.width - model.frame.wallThickness / 2]) {
        for (const gridY of rimPositions(model.frame.wallThickness, model.box.depth - model.frame.wallThickness, pin.spacing)) {
          placements.push({ position: [wallX, gridY, seamZ], axis: "z" });
        }
      }
    }
  }

  return placements;
}

function pinPlacementsQuad(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
  chunkGrid: TempestChunkGrid,
  pin: AlignmentPinSpec,
): TempestAlignmentPinPlacement[] {
  const placements: TempestAlignmentPinPlacement[] = [];
  const wallZLow = filterLayout.bottomPlateThickness;
  const wallZHigh = model.box.height - filterLayout.topPlateThickness;
  const topPlateMidZ = model.box.height - filterLayout.topPlateThickness / 2;
  // The outer flange is a continuous exterior skirt that runs the FULL height of
  // the box, including down over the base and feet. Pin it across that whole span
  // at the normal spacing (not just the wall region above the bottom plate) so the
  // large exterior glue faces of the base chunks carry a full row of pins like the
  // walls above them, instead of the lone pin left below the filter window.
  // pinCutsMaterial drops any that land in the window opening or open air.
  const outerFlangeZLow = model.frame.outsideFlangeThickness;
  // Holes a top-plate pin must not pierce (fan-grid grills + their screw holes).
  const topHoles = quadTopPlateHoles(model, fanLayout);
  // A central top-plate pin this close to a perpendicular seam would collide with
  // the perpendicular pin at that grid corner; drop it (other pins still align the
  // pieces). Clearance covers the perpendicular pin's reach plus its width.
  const cornerClearance = pin.holeDepth + pin.diameter;
  const interiorSeamsX = chunkGrid.boundariesX.slice(1, -1);
  const interiorSeamsY = chunkGrid.boundariesY.slice(1, -1);
  const nearSeam = (coordinate: number, seams: readonly number[]): boolean =>
    seams.some((seam) => Math.abs(coordinate - seam) < cornerClearance);
  // The structural wall between each filter pocket and the air chamber: its inner
  // face is the carried chamber-face plane, so its midline sits half a wall in.
  // (All four rects share innerPlaneOffset === structuralOffset.)
  const innerWallMidlineLow = filterLayout.wallRects.front.innerPlaneOffset - model.frame.wallThickness / 2;
  const innerWallMidlineHighX = model.box.width - innerWallMidlineLow;
  const innerWallMidlineHighY = model.box.depth - innerWallMidlineLow;
  // The bottom plate is a continuous solid floor (no bottom filter pocket, not the
  // loading face) so its central seam band can carry a normal pin row. The default
  // central band mirrors the TOP plate's surviving pins so the two rows line up,
  // but a box-exhaust top has NO central pins, which would otherwise strip the
  // solid base bare. When the base is solid, place its central pins on their own.
  const solidBottomPlate =
    filterLayout.bottomPlateThickness > 0 && !filterLayout.bottomFilter && filterLayout.loading.type !== "bottom-plate-slots";

  if (chunkGrid.countX > 1) {
    for (let index = 1; index < chunkGrid.countX; index += 1) {
      const seamX = chunkGrid.boundariesX[index];
      for (const wallY of [model.frame.outsideFlangeThickness / 2, model.box.depth - model.frame.outsideFlangeThickness / 2]) {
        for (const gridZ of rimPositions(outerFlangeZLow, wallZHigh, pin.spacing)) {
          placements.push({ position: [seamX, wallY, gridZ], axis: "x" });
        }
      }
      for (const wallY of [innerWallMidlineLow, innerWallMidlineHighY]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          placements.push({ position: [seamX, wallY, gridZ], axis: "x" });
        }
      }
      // Bottom plate: mirror the top plate's placement (structural-ring edge
      // bands + central positions kept where the top keeps them) so the bottom
      // pins sit directly under the top ones instead of as a dense full-width row.
      const bottomZx = filterLayout.bottomPlateThickness / 2;
      for (const gridY of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        placements.push({ position: [seamX, gridY, bottomZx], axis: "x" });
      }
      for (const gridY of rimPositions(model.box.depth - filterLayout.structuralOffset, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
        placements.push({ position: [seamX, gridY, bottomZx], axis: "x" });
      }
      for (const gridY of rimPositions(filterLayout.structuralOffset, model.box.depth - filterLayout.structuralOffset, pin.spacing)) {
        if (nearSeam(gridY, interiorSeamsY)) {
          continue;
        }
        // Solid base: place the central pin outright. Otherwise mirror the top
        // plate so the rows line up (and skip where the top has no pin there).
        if (!solidBottomPlate && clampedTopPinDepth(topHoles, seamX, gridY, "x", pin.holeDepth) === null) {
          continue;
        }
        placements.push({ position: [seamX, gridY, bottomZx], axis: "x" });
      }
      for (const gridY of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        placements.push({ position: [seamX, gridY, model.box.height - filterLayout.topPlateThickness / 2], axis: "x" });
      }
      for (const gridY of rimPositions(model.box.depth - filterLayout.structuralOffset, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
        placements.push({ position: [seamX, gridY, model.box.height - filterLayout.topPlateThickness / 2], axis: "x" });
      }
      // Central top plate (over the air chamber): pin between fan grills/screws,
      // each shortened to stop short of the holes it would otherwise pierce.
      for (const gridY of rimPositions(filterLayout.structuralOffset, model.box.depth - filterLayout.structuralOffset, pin.spacing)) {
        if (nearSeam(gridY, interiorSeamsY)) {
          continue;
        }
        const depth = clampedTopPinDepth(topHoles, seamX, gridY, "x", pin.holeDepth);
        if (depth !== null) {
          placements.push({ position: [seamX, gridY, topPlateMidZ], axis: "x", holeDepth: depth });
        }
      }
    }
  }

  if (chunkGrid.countY > 1) {
    for (let index = 1; index < chunkGrid.countY; index += 1) {
      const seamY = chunkGrid.boundariesY[index];
      for (const wallX of [model.frame.outsideFlangeThickness / 2, model.box.width - model.frame.outsideFlangeThickness / 2]) {
        for (const gridZ of rimPositions(outerFlangeZLow, wallZHigh, pin.spacing)) {
          placements.push({ position: [wallX, seamY, gridZ], axis: "y" });
        }
      }
      for (const wallX of [innerWallMidlineLow, innerWallMidlineHighX]) {
        for (const gridZ of rimPositions(wallZLow, wallZHigh, pin.spacing)) {
          placements.push({ position: [wallX, seamY, gridZ], axis: "y" });
        }
      }
      // Bottom plate: mirror the top plate's placement (see the x-seam comment).
      const bottomZy = filterLayout.bottomPlateThickness / 2;
      for (const gridX of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        placements.push({ position: [gridX, seamY, bottomZy], axis: "y" });
      }
      for (const gridX of rimPositions(model.box.width - filterLayout.structuralOffset, model.box.width - model.frame.outsideFlangeThickness, pin.spacing)) {
        placements.push({ position: [gridX, seamY, bottomZy], axis: "y" });
      }
      for (const gridX of rimPositions(filterLayout.structuralOffset, model.box.width - filterLayout.structuralOffset, pin.spacing)) {
        if (nearSeam(gridX, interiorSeamsX)) {
          continue;
        }
        // Solid base: place the central pin outright. Otherwise mirror the top
        // plate so the rows line up (and skip where the top has no pin there).
        if (!solidBottomPlate && clampedTopPinDepth(topHoles, gridX, seamY, "y", pin.holeDepth) === null) {
          continue;
        }
        placements.push({ position: [gridX, seamY, bottomZy], axis: "y" });
      }
      for (const gridX of rimPositions(model.frame.outsideFlangeThickness, filterLayout.structuralOffset, pin.spacing)) {
        placements.push({ position: [gridX, seamY, model.box.height - filterLayout.topPlateThickness / 2], axis: "y" });
      }
      for (const gridX of rimPositions(model.box.width - filterLayout.structuralOffset, model.box.width - model.frame.outsideFlangeThickness, pin.spacing)) {
        placements.push({ position: [gridX, seamY, model.box.height - filterLayout.topPlateThickness / 2], axis: "y" });
      }
      for (const gridX of rimPositions(filterLayout.structuralOffset, model.box.width - filterLayout.structuralOffset, pin.spacing)) {
        if (nearSeam(gridX, interiorSeamsX)) {
          continue;
        }
        const depth = clampedTopPinDepth(topHoles, gridX, seamY, "y", pin.holeDepth);
        if (depth !== null) {
          placements.push({ position: [gridX, seamY, topPlateMidZ], axis: "y", holeDepth: depth });
        }
      }
    }
  }

  if (chunkGrid.countZ > 1) {
    for (let index = 1; index < chunkGrid.countZ; index += 1) {
      const seamZ = chunkGrid.boundariesZ[index];
      for (const wallY of [model.frame.outsideFlangeThickness / 2, model.box.depth - model.frame.outsideFlangeThickness / 2]) {
        for (const gridX of rimPositions(0, model.box.width, pin.spacing)) {
          placements.push({ position: [gridX, wallY, seamZ], axis: "z" });
        }
      }
      for (const wallX of [model.frame.outsideFlangeThickness / 2, model.box.width - model.frame.outsideFlangeThickness / 2]) {
        for (const gridY of rimPositions(model.frame.outsideFlangeThickness, model.box.depth - model.frame.outsideFlangeThickness, pin.spacing)) {
          placements.push({ position: [wallX, gridY, seamZ], axis: "z" });
        }
      }
      for (const wallY of [innerWallMidlineLow, innerWallMidlineHighY]) {
        for (const gridX of rimPositions(filterLayout.structuralOffset, model.box.width - filterLayout.structuralOffset, pin.spacing)) {
          placements.push({ position: [gridX, wallY, seamZ], axis: "z" });
        }
      }
      for (const wallX of [innerWallMidlineLow, innerWallMidlineHighX]) {
        for (const gridY of rimPositions(filterLayout.structuralOffset, model.box.depth - filterLayout.structuralOffset, pin.spacing)) {
          placements.push({ position: [wallX, gridY, seamZ], axis: "z" });
        }
      }
      // Corner-post z-pins: sit them in the MIDDLE of the solid corner block —
      // between the 45° outer bevel and the air-chamber edge — so they bite into
      // material. The old `structuralOffset - wallThickness` hugged the chamber
      // edge and could float just outside the solid.
      const cornerChamfer = towerCornerChamfer(
        model.frame.towerCornerPostChamfer,
        filterLayout.structuralOffset,
        model.frame.outsideFlangeThickness,
      );
      const pinXY = Math.min(
        filterLayout.structuralOffset - model.frame.wallThickness,
        Math.max(cornerChamfer / 2 + model.frame.wallThickness, (cornerChamfer / 2 + filterLayout.structuralOffset) / 2),
      );
      for (const centerX of [pinXY, model.box.width - pinXY]) {
        for (const centerY of [pinXY, model.box.depth - pinXY]) {
          placements.push({ position: [centerX, centerY, seamZ], axis: "z" });
        }
      }
    }
  }

  return placements;
}

// #######################################
// Top-Plate Pin Hole Clamping
// #######################################

// How far a shortened top-plate pin hole stops before a perpendicular hole.
const TOP_PIN_HOLE_STANDOFF_MM = 1;
// The shallowest hole still worth a pin; anything less is dropped.
const TOP_PIN_MIN_DEPTH_MM = 3;

type TopPlateHoleCircle = { readonly cx: number; readonly cy: number; readonly r: number };

// The perpendicular holes a top-plate pin must avoid: each fan's grill opening
// and its four screw holes (fan-grid top), OR the single central exhaust opening
// plus its screw rings (box-exhaust top). Returning the box-exhaust opening as a
// circle (instead of null) keeps the top-plate pins that sit in the SOLID FRAME
// between that opening and the walls; only pins over the opening are dropped.
function quadTopPlateHoles(
  model: TempestModel,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "quad" }>,
): readonly TopPlateHoleCircle[] | null {
  if (fanLayout.topExhaust === "box-exhaust") {
    const box = model.settings.fan.boxExhaust;
    if (box.fanHoleSize <= 0) {
      return null;
    }
    const cx = model.box.width / 2;
    const cy = model.box.depth / 2;
    // Mirror towerBoxExhaustCuts: a central opening of fanHoleSize plus up to two
    // screw rings (angleOffset PI/n seats a 4-hole ring at the corners).
    const circles: TopPlateHoleCircle[] = [{ cx, cy, r: box.fanHoleSize / 2 }];
    for (const ring of [box.ringOne, box.ringTwo]) {
      if (ring.screwHoles <= 0 || ring.screwDiameter <= 0 || ring.radius <= 0) {
        continue;
      }
      const angleOffset = Math.PI / ring.screwHoles;
      for (let index = 0; index < ring.screwHoles; index += 1) {
        const angle = angleOffset + (index * 2 * Math.PI) / ring.screwHoles;
        circles.push({ cx: cx + ring.radius * Math.cos(angle), cy: cy + ring.radius * Math.sin(angle), r: ring.screwDiameter / 2 });
      }
    }
    return circles;
  }
  if (fanLayout.topExhaust !== "fan-grid") {
    return null;
  }
  const grillRadius = model.settings.fan.diameter / 2;
  const screwRadius = model.settings.fan.screwHoleDiameter / 2;
  const screwDelta = fanLayout.screwPitch / 2;
  const circles: TopPlateHoleCircle[] = [];
  for (const fx of fanLayout.positionsX) {
    for (const fy of fanLayout.positionsY) {
      circles.push({ cx: fx, cy: fy, r: grillRadius });
      for (const sx of [fx - screwDelta, fx + screwDelta]) {
        for (const sy of [fy - screwDelta, fy + screwDelta]) {
          circles.push({ cx: sx, cy: sy, r: screwRadius });
        }
      }
    }
  }
  return circles;
}

// The perpendicular holes a sandwich bottom-plate ("Back" fan) pin must avoid:
// each back fan's grill opening and its four screw holes, as circles in the plate
// plane. Null when there is no back grid, which keeps the plate pins full-depth.
function sandwichBottomPlateHoles(
  model: TempestModel,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>,
): readonly TopPlateHoleCircle[] | null {
  if (fanLayout.bottomPlate.fanCount === 0) {
    return null;
  }
  const grillRadius = model.settings.fan.diameter / 2;
  const screwRadius = model.settings.fan.screwHoleDiameter / 2;
  const screwDelta = fanLayout.screwPitch / 2;
  const circles: TopPlateHoleCircle[] = [];
  for (const { x, y } of fanLayout.bottomPlate.positions) {
    circles.push({ cx: x, cy: y, r: grillRadius });
    for (const sx of [x - screwDelta, x + screwDelta]) {
      for (const sy of [y - screwDelta, y + screwDelta]) {
        circles.push({ cx: sx, cy: sy, r: screwRadius });
      }
    }
  }
  return circles;
}

// The deepest (symmetric) half-depth a top-plate pin at (sx, sy) running along
// `axis` can reach before coming within the standoff of any hole, on either
// side of the seam. Returns null when the pin would start inside a hole or can't
// reach the minimum useful depth.
function clampedTopPinDepth(
  holes: readonly TopPlateHoleCircle[] | null,
  sx: number,
  sy: number,
  axis: "x" | "y",
  fullDepth: number,
): number | null {
  if (holes === null) {
    return null;
  }
  let depth = fullDepth;
  for (const direction of [1, -1] as const) {
    for (const hole of holes) {
      const perpendicularOffset = axis === "x" ? sy - hole.cy : sx - hole.cx;
      if (Math.abs(perpendicularOffset) >= hole.r) {
        continue;
      }
      const halfChord = Math.sqrt(hole.r * hole.r - perpendicularOffset * perpendicularOffset);
      const center = axis === "x" ? hole.cx : hole.cy;
      const start = axis === "x" ? sx : sy;
      const low = center - halfChord;
      const high = center + halfChord;
      if (start > low && start < high) {
        return null;
      }
      const nearEdge = direction > 0 ? low : high;
      const aheadDistance = (nearEdge - start) * direction;
      if (aheadDistance >= 0) {
        depth = Math.min(depth, aheadDistance - TOP_PIN_HOLE_STANDOFF_MM);
      }
    }
  }
  return depth >= TOP_PIN_MIN_DEPTH_MM ? depth : null;
}

// #######################################
// Wall Fan Bores
// #######################################

// FAN_BORE_PLACEMENT: fanBodyZones (CSG) and sandwichFanBores (pure) describe
// the same wall fan bores — keep their placement math in lockstep.

function fanBodyZones<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  model: TempestModel,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>,
): Solid[] {
  const { transforms } = ctx.modeling;
  const oneWall = (positions: readonly number[]) =>
    positions.map((position) =>
      cylinderAlongFromStart(ctx, "y", [position, -1, fanLayout.localVerticalCenter], model.frame.wallThickness + 2, model.settings.fan.diameter / 2),
    );

  return [
    ...oneWall(fanLayout.walls.front.positionsAlongWall).map((geometry) =>
      transforms.translate([0, 0, model.frame.outsideFlangeThickness], geometry),
    ),
    ...oneWall(fanLayout.walls.back.positionsAlongWall).map((geometry) =>
      transforms.translate([model.box.width, model.box.depth, model.frame.outsideFlangeThickness], transforms.rotateZ(Math.PI, geometry)),
    ),
    ...oneWall(fanLayout.walls.left.positionsAlongWall).map((geometry) =>
      transforms.translate([0, model.box.depth, model.frame.outsideFlangeThickness], transforms.rotateZ(-Math.PI / 2, geometry)),
    ),
    ...oneWall(fanLayout.walls.right.positionsAlongWall).map((geometry) =>
      transforms.translate([model.box.width, 0, model.frame.outsideFlangeThickness], transforms.rotateZ(Math.PI / 2, geometry)),
    ),
  ];
}

// A wall fan bore as data: its center in source millimeters, the wall-normal
// axis it runs along, and the fan radius.
type SandwichFanBore = {
  readonly normalAxis: "x" | "y";
  readonly center: readonly [number, number, number];
  readonly radius: number;
};

function sandwichFanBores(
  model: TempestModel,
  fanLayout: Extract<TempestFanLayout, { readonly topology: "sandwich" }>,
): SandwichFanBore[] {
  const radius = model.settings.fan.diameter / 2;
  const z = model.frame.outsideFlangeThickness + fanLayout.localVerticalCenter;
  const wallMid = model.frame.wallThickness / 2;
  const { width, depth } = model.box;
  return [
    ...fanLayout.walls.front.positionsAlongWall.map((position): SandwichFanBore => ({ normalAxis: "y", center: [position, wallMid, z], radius })),
    ...fanLayout.walls.back.positionsAlongWall.map((position): SandwichFanBore => ({ normalAxis: "y", center: [width - position, depth - wallMid, z], radius })),
    ...fanLayout.walls.left.positionsAlongWall.map((position): SandwichFanBore => ({ normalAxis: "x", center: [wallMid, depth - position, z], radius })),
    ...fanLayout.walls.right.positionsAlongWall.map((position): SandwichFanBore => ({ normalAxis: "x", center: [width - wallMid, position, z], radius })),
  ];
}

function boreSwallowsPin(
  bore: SandwichFanBore,
  placement: TempestAlignmentPinPlacement,
  wallThickness: number,
  clearance = 0,
  reach = 0,
): boolean {
  const position = placement.position;
  const center = bore.center;
  const normalIndex = bore.normalAxis === "x" ? 0 : 1;
  if (Math.abs(position[normalIndex] - center[normalIndex]) > wallThickness / 2 + 1) {
    return false;
  }
  // The bore's circular cross-section spans the two axes other than its normal.
  const axisIndex = placement.axis === "x" ? 0 : placement.axis === "y" ? 1 : 2;
  const planeAxes: readonly [number, number] = normalIndex === 0 ? [1, 2] : [0, 2];
  // If the socket runs IN the bore's circle plane, it sweeps ±reach along its axis,
  // so clamp that coordinate to the segment's nearest point to the bore centre.
  const planar = planeAxes.map((axis) => {
    if (axis === axisIndex) {
      return Math.max(position[axis] - reach, Math.min(center[axis], position[axis] + reach));
    }
    return position[axis];
  });
  const planarDistance = Math.hypot(planar[0] - center[planeAxes[0]], planar[1] - center[planeAxes[1]]);
  return planarDistance < bore.radius + clearance;
}

// #######################################
// Sandwich Filter Loading Slots
// #######################################

// One wall's filter loading slot as data: the open band along the wall's length
// axis and Z, sitting at the wall midline along the wall normal. A seam pin whose
// center lands in this band has no wall material to grip. The cut math mirrors
// horizontalFilterSlotHole (endMargin..wallLength-endMargin along the wall) and
// the slot's wall-local z is lifted into model space by the outside flange.
type SandwichLoadingSlot = {
  readonly lengthAxis: "x" | "y";
  readonly lengthMin: number;
  readonly lengthMax: number;
  readonly normalAxis: "x" | "y";
  readonly normalPosition: number;
  readonly zMin: number;
  readonly zMax: number;
};

function sandwichLoadingSlots(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): SandwichLoadingSlot[] {
  const wallMid = model.frame.wallThickness / 2;
  const endMargin = Math.max(model.settings.filterSlot.endMargin, model.frame.chamferSize);
  const { width, depth } = model.box;
  const frontBack = model.settings.filterSlot.wall === "front" || model.settings.filterSlot.wall === "back";
  const wallLength = frontBack ? width : depth;
  const lengthMin = endMargin;
  const lengthMax = wallLength - endMargin;
  if (lengthMax <= lengthMin) {
    return [];
  }
  const lengthAxis: "x" | "y" = frontBack ? "x" : "y";
  const normalAxis: "x" | "y" = frontBack ? "y" : "x";
  const normalPosition =
    model.settings.filterSlot.wall === "front"
      ? wallMid
      : model.settings.filterSlot.wall === "back"
        ? depth - wallMid
        : model.settings.filterSlot.wall === "left"
          ? wallMid
          : width - wallMid;
  return filterLayout.loading.slots.flatMap((slot) => {
    const zMin = model.frame.outsideFlangeThickness + slot.localZBottom;
    const zMax = model.frame.outsideFlangeThickness + slot.localZTop;
    return zMax <= zMin ? [] : [{ lengthAxis, lengthMin, lengthMax, normalAxis, normalPosition, zMin, zMax }];
  });
}

// Extra standoff beyond the pin radius so a hole never even grazes the slot edge.
const SLOT_PIN_CLEARANCE_MM = 0.5;

function loadingSlotSwallowsPin(
  slot: SandwichLoadingSlot,
  placement: TempestAlignmentPinPlacement,
  pin: AlignmentPinSpec | null,
): boolean {
  const [x, y, z] = placement.position;
  const normalCoordinate = slot.normalAxis === "x" ? x : y;
  // Seam wall pins sit exactly on the wall midline; a 1 mm tolerance keeps the
  // test robust to rounding without reaching pins on the opposite wall.
  if (Math.abs(normalCoordinate - slot.normalPosition) > 1) {
    return false;
  }
  // The pin hole is a cylinder of radius pin.diameter/2 along `placement.axis`,
  // reaching holeDepth each way. Its footprint in the wall plane (length axis x z)
  // must clear the slot opening, or the hole breaks into it and leaves a paper-thin
  // web at the slot edge. A pin whose CENTER sits just outside the strict slot
  // bounds was previously kept, so its hole punched through there — inflate the
  // slot by the hole's reach (full depth along the pin's own axis, the radius
  // across it) plus a small standoff.
  const radius = pin === null ? 0 : pin.diameter / 2 + SLOT_PIN_CLEARANCE_MM;
  const depth = (placement.holeDepth ?? pin?.holeDepth ?? 0) + (pin === null ? 0 : SLOT_PIN_CLEARANCE_MM);
  const lengthReach = placement.axis === slot.lengthAxis ? depth : radius;
  const zReach = placement.axis === "z" ? depth : radius;
  const lengthCoordinate = slot.lengthAxis === "x" ? x : y;
  if (lengthCoordinate + lengthReach <= slot.lengthMin || lengthCoordinate - lengthReach >= slot.lengthMax) {
    return false;
  }
  return z + zReach > slot.zMin && z - zReach < slot.zMax;
}

// #######################################
// Quad Side Filter Windows
// #######################################

// One side wall's open filter window as data: the in-plane rectangle (along the
// wall's length axis and Z) and the wall+pocket band along the wall normal. A pin
// whose center sits inside this volume has no material to grip, so it is dropped.
type QuadSideWindow = {
  readonly lengthAxis: "x" | "y";
  readonly lengthMin: number;
  readonly lengthMax: number;
  readonly normalAxis: "x" | "y";
  readonly normalMin: number;
  readonly normalMax: number;
  readonly zMin: number;
  readonly zMax: number;
};

function quadSideWindows(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): QuadSideWindow[] {
  // The cut matches towerSideOpening: the filter face minus the rim on every side.
  const openWidth = filterLayout.filter.faceWidth - 2 * model.frame.rim;
  const openHeight = filterLayout.filter.faceHeight - 2 * model.frame.rim;
  if (openWidth <= 0 || openHeight <= 0) {
    return [];
  }
  const centerZ = filterLayout.bottomPlateThickness + filterLayout.filter.faceHeight / 2;
  const zMin = centerZ - openHeight / 2;
  const zMax = centerZ + openHeight / 2;
  const offset = filterLayout.structuralOffset;
  const { width, depth } = model.box;
  const lengthSpan = (center: number) => ({ lengthMin: center - openWidth / 2, lengthMax: center + openWidth / 2 });

  return [
    { lengthAxis: "x", ...lengthSpan(width / 2), normalAxis: "y", normalMin: 0, normalMax: offset, zMin, zMax },
    { lengthAxis: "x", ...lengthSpan(width / 2), normalAxis: "y", normalMin: depth - offset, normalMax: depth, zMin, zMax },
    { lengthAxis: "y", ...lengthSpan(depth / 2), normalAxis: "x", normalMin: 0, normalMax: offset, zMin, zMax },
    { lengthAxis: "y", ...lengthSpan(depth / 2), normalAxis: "x", normalMin: width - offset, normalMax: width, zMin, zMax },
  ];
}

// `clearance` widens the opening by the pin's reach on its in-plane (length and
// height) edges, so a socket whose CENTRE sits just outside the cut still counts
// as swallowed when its radius would graze into the opening. Without it a z-pin
// landing one wall-frame-pixel outside the window edge breaks out sideways into
// the opening (the centre test alone misses it).
function windowSwallowsPin(window: QuadSideWindow, placement: TempestAlignmentPinPlacement, clearance = 0): boolean {
  const [x, y, z] = placement.position;
  if (z <= window.zMin - clearance || z >= window.zMax + clearance) {
    return false;
  }
  const lengthCoordinate = window.lengthAxis === "x" ? x : y;
  if (lengthCoordinate <= window.lengthMin - clearance || lengthCoordinate >= window.lengthMax + clearance) {
    return false;
  }
  const normalCoordinate = window.normalAxis === "x" ? x : y;
  return normalCoordinate > window.normalMin && normalCoordinate < window.normalMax;
}

// Each filter pocket is an open column from above the bottom plate up through the
// top-plate loading slot, so a pin anywhere in that footprint floats. (The slots
// sit above the side windows' z-range, which is why the window filter misses them.)
type QuadPocketColumn = {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly zMin: number;
  readonly zMax: number;
};

function quadFilterPocketColumns(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "quad" }>,
): QuadPocketColumn[] {
  // The open column reaches through whichever cap plate carries the loading
  // slots: up through the top plate for top loading, down through the bottom
  // plate for bottom loading. Pins in that footprint would otherwise float.
  const bottomLoading = filterLayout.loading.type === "bottom-plate-slots";
  const zMin = bottomLoading ? 0 : filterLayout.bottomPlateThickness;
  const zMax = bottomLoading ? model.box.height - filterLayout.topPlateThickness : model.box.height;
  return Object.values(filterLayout.wallRects).map((rect) => ({
    xMin: rect.xMin,
    xMax: rect.xMax,
    yMin: rect.yMin,
    yMax: rect.yMax,
    zMin,
    zMax,
  }));
}

function boxSwallowsPin(box: QuadPocketColumn, placement: TempestAlignmentPinPlacement): boolean {
  const [x, y, z] = placement.position;
  return x > box.xMin && x < box.xMax && y > box.yMin && y < box.yMax && z > box.zMin && z < box.zMax;
}

// How much solid material to keep between a pin socket and a perpendicular cut.
const PIN_SEAM_MATERIAL_MM = 1.5;

// A pin socket runs along its axis and is meant to open ONLY on the seam it
// crosses. If the pin sits within (radius + standoff) of an INTERIOR chunk seam
// that runs PERPENDICULAR to its axis (a cut plane the socket lies alongside),
// the socket breaks out through that cut face, leaving an open trench in the
// part edge. The planar (frame/plate) pins already clear perpendicular seams via
// planarCoordClear; this is the matching guard for the wall pins, which span the
// full wall length and would otherwise land right beside a crossing seam.
// A pin's free coordinate must clear a perpendicular interior seam by its radius plus
// a sliver of material, so the socket's SIDE never breaks out through that cut. (The
// separate crossing hazard, two perpendicular sockets meeting at a shared chunk edge
// is handled by clamping socket depth, not by dropping the pin; see
// clampPinDepthToPerpendicularSeams.)
const perpendicularSeamClearance = (pin: AlignmentPinSpec | null): number =>
  (pin === null ? 0 : pin.diameter / 2) + PIN_SEAM_MATERIAL_MM;

// Below this a clamped socket is too shallow to grip, so the pin is dropped instead
// (coverage still fastens the piece elsewhere).
const MIN_PIN_DEPTH_MM = 1.5;

// Two pins on perpendicular seams that share a chunk edge cross, merging into one
// cavity open on both seam faces, i.e. a through-hole, when each socket reaches far
// enough along its axis to meet the other. A pin sits `g` from the nearest
// perpendicular seam (its free coordinate); clamping its socket to reach at most
// `g - (radius + margin)` guarantees no such pair can meet: if pin A must reach B's
// position it needs gA >= gB + (r+margin), and B needs gB >= gA + (r+margin), both
// cannot hold. This keeps the pin (only shorter) rather than dropping it, so no chunk
// is left unpinned. Applied uniformly to base and coverage pins.
function clampPinDepthToPerpendicularSeams(
  placements: readonly TempestAlignmentPinPlacement[],
  chunkGrid: TempestChunkGrid,
  pin: AlignmentPinSpec,
): TempestAlignmentPinPlacement[] {
  const reachMargin = pin.diameter / 2 + PIN_SEAM_MATERIAL_MM;
  const interiorSeams: readonly (readonly number[])[] = [
    chunkGrid.boundariesX.slice(1, -1),
    chunkGrid.boundariesY.slice(1, -1),
    chunkGrid.boundariesZ.slice(1, -1),
  ];
  const kept: TempestAlignmentPinPlacement[] = [];
  for (const placement of placements) {
    const axisIndex = placement.axis === "x" ? 0 : placement.axis === "y" ? 1 : 2;
    let nearest = Infinity;
    for (let perp = 0; perp < 3; perp += 1) {
      if (perp === axisIndex) {
        continue;
      }
      for (const seam of interiorSeams[perp]) {
        nearest = Math.min(nearest, Math.abs(placement.position[perp] - seam));
      }
    }
    const full = placement.holeDepth ?? pin.holeDepth;
    const depth = Math.min(full, nearest - reachMargin);
    if (depth >= MIN_PIN_DEPTH_MM) {
      kept.push(depth < full ? { ...placement, holeDepth: depth } : placement);
    }
  }
  return kept;
}

function pinBreachesPerpendicularSeam(
  placement: TempestAlignmentPinPlacement,
  chunkGrid: TempestChunkGrid,
  clearance: number,
): boolean {
  const axisIndex = placement.axis === "x" ? 0 : placement.axis === "y" ? 1 : 2;
  const interiorSeams: readonly (readonly number[])[] = [
    chunkGrid.boundariesX.slice(1, -1),
    chunkGrid.boundariesY.slice(1, -1),
    chunkGrid.boundariesZ.slice(1, -1),
  ];
  for (let perp = 0; perp < 3; perp += 1) {
    if (perp === axisIndex) {
      continue;
    }
    const coordinate = placement.position[perp];
    if (interiorSeams[perp].some((seam) => Math.abs(coordinate - seam) < clearance)) {
      return true;
    }
  }
  return false;
}

// The outer vertical corners are bevelled at 45° (chamferedPrism), so a pin whose
// combined distance from the two meeting outer faces is inside the bevel has no
// material — it would float past the corner post.
function cornerBevelSwallowsPin(
  placement: TempestAlignmentPinPlacement,
  width: number,
  depth: number,
  chamfer: number,
): boolean {
  if (chamfer <= 0) {
    return false;
  }
  const [x, y] = placement.position;
  const distanceFromNearestXFace = Math.min(x, width - x);
  const distanceFromNearestYFace = Math.min(y, depth - y);
  return distanceFromNearestXFace + distanceFromNearestYFace < chamfer;
}

// #######################################
// Seam Frame Midlines
// #######################################

function horizontalFrameMidlinesWithOpening(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): readonly number[] {
  return [
    model.box.height - model.frame.outsideFlangeThickness / 2,
    ...(filterLayout.bottomPanel === "open-frame" ? [model.frame.outsideFlangeThickness / 2] : []),
    ...filterLayout.flanges.map((flange) => (flange.zBottom + flange.zTop) / 2),
  ];
}

function horizontalSolidPlateMidlines(
  model: TempestModel,
  filterLayout: Extract<TempestFilterLayout, { readonly topology: "sandwich" }>,
): readonly number[] {
  return filterLayout.bottomPanel === "solid-plate" ? [model.frame.outsideFlangeThickness / 2] : [];
}

function rimPositions(low: number, high: number, spacing: number): readonly number[] {
  const width = high - low;
  const count = width <= 0 ? 0 : Math.max(1, Math.floor(width / spacing));
  const step = count > 0 ? width / count : 0;
  return count === 0 ? [] : Array.from({ length: count }, (_, index) => low + (index + 0.5) * step);
}
