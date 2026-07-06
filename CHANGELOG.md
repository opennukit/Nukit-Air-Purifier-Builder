# Changelog — `port-tempest-features`

All changes on this branch since `main`, grouped by area. The complete
commit-by-commit list is in the Appendix at the bottom. Every change is
committed; the build (`bun run build`) and full test suite (`bun test`, 243
tests) pass.

## Fill stray-piece seam faces at the normal pin spacing (v10, in progress, local only)
- A disconnected stray piece got a single coverage pin at each seam's centre, even
  when the face had room for a row. Coverage now steps a grid across each spanned
  seam face at the standard pin spacing and places a pin at every station whose
  socket is fully embedded (a new `socketEmbedded` check samples the socket's
  surface along its whole length, so a denser pin never grazes out of a thin or
  curved piece like the top exhaust ring). Gated to stray pieces only (those no
  base pin reaches) so the pass stays fast; connected faces keep getting their
  density from the base bands. Chunk G's floating plate went from 1 pin per seam
  face to a full row (3 at 30 mm), no break-throughs, and the suite still passes.

## Denser alignment pins on the base/skirt glue faces (v10, in progress, local only)
- The outer flange is a continuous exterior skirt running the full box height, but
  its seam pin band started at the bottom-plate top, so the large exterior glue
  faces of the base chunks got a single pin below the filter window. Ran the outer
  flange seam band down the full height (`outerFlangeZLow`), so those faces now
  carry a full column of pins at the normal spacing; `pinCutsMaterial` drops any
  that fall in the window opening or the open feet region. Bottom vertical seams
  went from 2 pins to ~4 at ~30 mm spacing, no break-throughs; the box-exhaust
  tower is unaffected.

## Air-only pin removal + preview diagram matches drilled holes (v10, in progress, local only)
- Drop "air-only" seam pins whose socket falls entirely in open space (e.g. a
  base-plate pin landing in the bottom-filter pocket): they drilled nothing and
  just floated in the exploded preview. Added `pinCutsMaterial` + a single
  `tempestFinalPinPlacements` (air-filtered seam pins + per-piece coverage) that
  BOTH the CSG drilling (`pinHoles`) and the exploded-preview diagram
  (`createTempestAssemblyPinDiagram`, now built against the shell) derive from, so
  every drawn pin stick maps to a real drilled hole and vice versa.
- Verified on the 495 cube: 168 seam pins to 121 (48 floating pins removed, 1
  coverage pin added); the posed diagram is exactly those same 121; all 26
  connected pieces still carry a pin. 285 tower and the suite unaffected.

## Per-piece alignment-pin coverage guarantee (v10, in progress, local only)
- A chunk can split into several disconnected printed pieces (e.g. a window cut or
  the outer-flange skirt separates a plate from the body). The seam-band placement
  pins the chunk as a whole, but a stray piece could end up with no pin and be
  unglueable. Added `tempestCoveragePins`: after the shell is built it clips each
  chunk cell, decomposes it into its separate pieces (via new read-only
  `analysis.decompose/boundingBox/isEmpty` ops on the modeling API), and for any
  piece adds a pin on EVERY interior seam that piece spans (verifying solid
  material on both sides, skipping seams a base pin already covers), so a stray
  piece bridging two neighbours is fastened on both ends, not just one. Both
  mating chunks get the socket because the pin is a single cylinder across the
  seam. Topology-agnostic, so it holds for every design. Wired through `pinHoles`
  (which now takes the assembled shell) and `finalModel` (builds the shell once).
- Verified on the 495 square cube (bottom filter + feet, fan-grid top): the
  free-floating outer-flange/base plate in chunk G went from 0 pins to a real pin;
  all 26 connected pieces across 21 chunks now carry a pin, with no grazing
  break-throughs. The 285 tower is unchanged (8 single-piece chunks, coverage adds
  nothing).

## Pin fixes for box-exhaust tower, CI fixes, defaults (v10, in progress, local only)
- Alignment pins on the four-side-filter-tower (box-exhaust top, non-square face)
  rebuilt and verified against the actual wall solid with a Manifold + trimesh
  containment harness (every socket sampled for break-out; ground truth, not eyeball):
  - Side-window edge break-through: widened the window pin-exclusion by the pin's
    reach so a socket whose centre sits just outside the cut edge (but whose radius
    grazes in) is dropped. Removed 4 front/back wall break-throughs.
  - Missing central base-plate pins: a SOLID base plate no longer mirrors the open
    box-exhaust top (which has no central pins). The base went from 4 corner pins to
    full central rows on both seams (4 → 20 pins).
  - Unpinned top/fan plate: `quadTopPlateHoles` now returns the box-exhaust opening
    (plus screw rings) as circles instead of `null`, so top-plate pins survive in the
    solid frame around the exhaust hole (0 → 4 pins) instead of being stripped wholesale.
  - Result: 0 break-throughs across all 60 kept pins; no valid seam left unpinned.
- CI green-up: fixed a pre-existing Euro-preset round-trip bug (it listed
  `previewMaterialColor` as a defining field, but `applyTempestDesign` forces the gray
  3D-print preview, so selecting Euro reconciled straight back to Custom); updated two
  stale preview-summary tests and one design test that used a no-op edit value.
- Chunk labels are now ON by default (so every existing 3D-print design ships with
  per-chunk seam codes).
- Bottom-filter toggle no longer auto-raises the corner feet to 100 mm on a
  non-square filter face, where no bottom filter is actually built.
- Help page: acknowledgments link renamed "Nathalie Roussy" → "Nathalie Ventilation".

## Help-page content pass, beta gate, spelling rule (v10, in progress, local only)
- Help page editorial pass: added a Performance section (after Layout & design)
  pointing to the methodology page; added screenshots throughout (hand-cut build,
  updated interface shot, unplugged purifier with photo credit, daisy-chained fans,
  bottom filter, performance panel); linked key terms out to references (MERV 13,
  PWM fan, foamcore, corrugated plastic, gaffer's tape, Gorilla-style tape, calipers,
  circle cutter); de-duplicated repeated card headings (each card now has a distinct
  heading under its category eyebrow); added a "Community" acknowledgments card
  (Rob Wissmann, Nathalie Roussy, Bob Korman, Zack Deis, Joey Fox) placed before the
  License card; removed a brand mention.
- American spelling enforced on all rendered pages (Meters, aluminum, odor); recorded
  as a standing project rule alongside the no-em-dashes rule.
- Added `infra/beta-basic-auth/` (CloudFront Function + README) to password-gate
  beta.filterboxbuilder.com via edge HTTP Basic Auth. Template only; the real
  credential lives in the CloudFront console, never in git.

## Methodology page + clickable Performance tiles (v10, in progress, local only)
- New `public/methodology.html` ("How the Performance estimates are calculated"):
  one anchored section per metric (CADR, infection-risk reduction, total airflow,
  face velocity, system pressure drop, filter efficiency, power/current, cost, ACH,
  noise) with the formula, assumptions/caveats, and citations — matched to the
  actual code in cadr.ts/buildCadr.ts. Sourced and defensible: ANSI/AHAM AC-1 (CADR),
  ANSI/ASHRAE 52.2 (MERV-13 E1–E3 bands), Rudnick & Milton 2003 / Wells-Riley
  (infection risk, with a prominent well-mixed/long-range caveat), the box-fan
  filter-cube studies (Dal Porto 2022 UC Davis, Derk 2023 NIOSH, US EPA), US CDC
  5+ ACH and ASHRAE Standard 241 (clean-air target), and HouseFresh build reviews
  (noise/CADR calibration). Citations reconciled against the calculator's own
  METHODOLOGY source doc.
- Each Performance tile is now a link (`<a class="perf-tile" target="_blank">`) to its
  matching `methodology.html#anchor`, with a hover/focus affordance.
- Added a "Help improve these estimates" section inviting (and offering to credit)
  real CADR / airflow / noise / power measurements on similar builds to anchor the
  model, linked to the contact page. No em-dashes anywhere in the page (site rule).

## Assembled-box summary row (v10, in progress, local only)
- Dropped the "Print chunks"/"Panels" count tile from the Assembled-box (enclosure)
  summary row, added an **Infection risk** tile (−X% vs the baseline-ACH room, from
  the same ach/(baselineAch+ach) estimate), and moved **Fans** to last. Order is now
  CADR · ACH · Noise · Power · Infection risk · Fans. The print-plate and cut-sheet
  drawing views keep their own counts. (`cadrSummaryItems` now takes baselineAch from
  `layout.rawSettings` instead of a trailing count item.)

## Infection-risk reduction metric (v10, in progress, local only)
- New "Infection-risk reduction" tile on the Performance page, beside CADR (the old
  full-width CADR hero tile is now split into two single-column tiles). Shows the
  approximate reduction in long-range airborne transmission risk from adding the
  build: `purifier ACH / (baselineAch + purifier ACH)` — the Wells-Riley / clean-air
  result expressed in ACH so it needs no room volume. Framed as a relative estimate
  ("vs a N ACH room") with an "est." badge; ignores close-range exposure.
- New "Room ventilation" input in the Advanced > Room (ACH) group (the room's own
  ventilation in ACH; default 1). New `baselineAch` setting threaded through
  model/draft/schema/codec like the room/cost fields, so it persists in the URL.

## Advanced-panel layout + Original Cube preset (v10, in progress, local only)
- Advanced panel: "Fan counts" moved to the top, above "Performance" (in both the
  3D-print and laser/hand-cut branches). Order is now Fan counts → Performance →
  Room (ACH) → Operating cost.
- New "3D Print" Advanced group: "Alignment pin size" and "Download format" pulled
  out of the Cord group into their own section.
- Bottom summary tiles: "Fans" now follows "Power" (was before it) in every mode
  that shows both, via the shared `cadrSummaryItems`.
- "Tempest Original Cube" preset defaults updated to the recommended cube build:
  plain circular fan opening (hexGrill off), bottom filter on, 100 mm feet — so
  selecting it from the Design dropdown matches that configuration out of the box.
- Renamed the preset's display label to "Nukit Tempest Original Cube (Big John)".
  The internal id (`nukit-tempest-original-cube`) is unchanged, so saved URLs keep
  working.

## Defaults, labels, and small fixes (v9, local only)
- Per-chunk export filenames now use the assembly letter — `…-01-chunk-a.3mf`
  through `…-NN-chunk-p.3mf` — matching the embossed seam codes, instead of the
  raw `tempest-chunk-X-Y-Z` grid address. (`buildChunkPart` names split chunks
  "Chunk A"…"Chunk P"; the part id is unchanged.)
- Default alignment-pin size is now 2 mm (was 1.8 mm), applied to the global
  default and to the Original / Original Cube design presets.
- The builder loads with **Nukit Tempest Original** selected by default (was Euro).
- Fixed a false "Bottom filter is blocked" advisory: it now only fires on a square
  tower filter (where the bottom filter actually exists), so a stale `bottomFilter`
  flag on a non-square filter no longer warns about something that builds nothing.

## Exploded-view seam pin display (v9, local only)
- Fixed exploded-view alignment pins reading as scattered rods "all over" the
  four-side tower. The preview grew each pin cylinder to span the whole opened seam
  gap; on the tower the gaps are large, so z-seam pins stretched into long rods
  across the exploded view. `addTempestSeamPins` now seats each pin in its low-chunk
  seam hole at its true physical length, so it rides with that chunk and reads as a
  compact pin in the right place. Preview-only — the exported STL/3MF geometry is
  unchanged. Verified live for the four-side tower and the dual-horizontal-sandwich.

## Alignment-pin breakthrough fixes (v9, local only)
Three distinct ways an alignment-pin socket could break out of a chunk, all now guarded:
- **Perpendicular-seam break-out (main fix).** Wall pins span the full wall length
  and could land right beside a crossing interior seam, so the socket opened a trench
  through that cut edge of the part (the defect circled on chunk A). The planar pins
  already cleared perpendicular seams via `planarCoordClear`; `pinBreachesPerpendicularSeam`
  now applies the same clearance (pin radius + 1.5 mm material) to the wall pins in
  both the sandwich and quad branches.
- **Loading-slot graze.** A seam pin sitting on the slot's z-edge was kept but its hole
  grazed the slot opening (chunk N, 0.04 mm web). `loadingSlotSwallowsPin` now inflates
  the slot footprint by the pin's reach plus a 0.5 mm standoff.
- **Fan-bore sweep.** A pin centred outside a round fan bore could still sweep into it,
  because the socket runs the full holeDepth along the pin axis — its far end entered the
  bore opening and broke out the curved face (chunk N). `boreSwallowsPin` now tests the
  socket *segment* (not just its centre) against the bore, clamping the swept coordinate
  to the segment's nearest point, and drops anything within (bore radius + pin radius).

Verified headlessly with a per-pin radial break-out detector on the reported
dual-horizontal-sandwich build: all 16 chunks are break-out free (116 alignment pins
retained, down from 140). Detector also confirmed earlier "see-through" reports on solid
chunks were the recessed seam-code engravings, not holes.

## Operating-cost calculator (v9, in progress, local only)
- New "Operating cost" Advanced group (below Room (ACH)): electricity price per kWh
  plus a currency-symbol selector (symbol only, no conversion). Default
  $0.1765/kWh (US average). Persisted like the room settings (electricityPrice +
  currencySymbol threaded through model/draft/schema/codec).
- The Performance panel gained a "Cost to run (24/7)" tile showing the monthly cost
  (and yearly + rate) to run the build continuously at its max-power draw
  (30.44 days/month, 365.25 days/year).

## Performance view (v8, in progress, local only)
- New third preview tab "Performance" (alongside Assembled box / Print plates /
  drawing) that replaces the canvas toolbar and bottom summary tiles with the
  diy-cadr-calculator "Estimated results" panel, sized to fill the stage without
  scrolling: CADR, total airflow, face velocity, system pressure drop, filter
  efficiency (MERV-13 with the per-size breakdown, single-pass for the box fan),
  total current draw, real-world noise, and room ACH (with verdict + room volume).
- `CadrEstimate` gained `faceVelocityMs`, `pressureDropPa`, `filterEfficiency`,
  `efficiencyBreakdown`, and `noiseRawDbA`, computed for both the PC-fan and
  box-fan paths in cadr.ts.
- CADR/airflow/face-velocity tiles show the imperial equivalent inline; ACH target
  reads 6.
- New build advisory (existing diagnostics panel) when estimated noise exceeds
  45 dBA @ 1 m, with a "More" link to a new Noise section on the help page.
- The four-side tower preview now draws the optional bottom filter when selected.
- In exploded view the box fan now floats 50 mm above the exploded top plate (was a
  fixed offset from the assembled top).

## Box fan 3D model in the preview (v7, in progress, local only)
- The supplied 20" box fan CAD (STEP) was tessellated with OpenCASCADE, the rear
  grille dropped, and the rest kept at clean resolution (~25.8k triangles), shipped
  as `public/vendor/box-fan/box-fan.glb`.
- New `src/rendering/three/preview/boxFanModel.ts`: loads the glb (GLTFLoader,
  cached + shared geometry), stands it up so the airflow axis points up, normalises
  it to the real ~554 mm frame width, and spins the propeller about its hub centroid
  via the shared fan-rotor loop.
- `rebuildTempestModel` now drops the box fan on top of the four-side tower, centred
  over the exhaust hole, only when the build is box/exhaust with a known box-fan
  model (not custom) and filter width >= 495 mm. In exploded view it lifts upward by
  the standard explode distance. The resolved fan-model id is carried on the CADR
  estimate (`CadrEstimate.fanModelId`) so the preview can gate on it.
- A standalone troubleshooting viewer lives at `fan-lab/box-fan-viewer.html` (not
  wired into the app).

## CADR / noise / power estimation (v6, in progress, local only)
- New `src/domain/purifier/cadr.ts`: a faithful TypeScript port of the
  diy-cadr-calculator physics — MERV-13 filter resistance, normalised 120/140 mm fan
  PQ curves, the fan-curve x filter-resistance bisection, the empirical box-fan
  "filter cube" model, and the calibrated noise (Arctic-scale fit, reported at 1 m)
  and power models. PC and box fan databases included. Validated against the
  README anchors (6x Arctic P14 + 2x 20x20x2 -> ~41 dBA @1 m; the example 6-fan
  build -> 0.48 A / 5.8 W).
- New **Fan model** control in the Advanced section (tempest and laser/hand). Its
  list follows the build's fan size: 120 mm or 140 mm PC fans, or the 20" box fans
  when the four-side tower uses Box/Exhaust — each ending in "Custom (enter specs)"
  with airflow / pressure / noise / current(or watts) inputs. Defaults: P14 PWM PST
  (140), P12 PWM PST (120), Lasko B20200 (Box/Exhaust). Box/Exhaust with a filter
  under 485 mm (the Lasko won't fit) defaults to Custom with zero specs.
- `fanModel` + the five custom-spec fields are URL-persisted settings (display-only,
  no geometry impact); every other input is taken from the existing build settings
  (filter size, filter count, fan count, fan size, arrangement, bottom filter).
- `BuildSummary` now carries a `cadr` estimate (computed in `createLayout`).
- The assembled-box (3D) preview tiles now read **CADR**, **Noise**, **Fans**,
  **Power**, and the build count (Print chunks / Panels) for 3D print, Laser cut and
  Hand cut. The Print plates / Laser drawing / Dimensioned drawing views keep their
  existing info. ACH is intentionally omitted.

## Hand cut (foamcore) fabrication mode (v5, in progress, local only)
- New **Hand cut** mode beside 3D print and Laser cut (export format `hand-svg`,
  label "Hand cut"). It reuses the cut-sheet pipeline and the open-air design, so
  it shares the cut-sheet preview, SVG/DXF export, fan/cord controls and thickness
  options, but builds a foamcore box instead of a laser box.
- A `cutStyle` ("laser" | "hand") now lives on the cut-panel (laser-cut) design and
  is URL-persisted; the mode tab sets it (Hand cut = "hand", Laser cut = "laser").
- Hand-cut differences vs laser, all driven by `cutStyle`:
  - **No finger joints**: every panel edge is a plain taped butt edge (outlines are
    plain rectangles).
  - **No filter flanges or rails**: the inner/outer flange panels and filter-tab
    slots are gone (in both the cut sheet AND the 3D enclosure preview, which drew
    flange frames from the geometry independently of the cut panels); the filter is
    held against the fans and taped in.
  - **Plain rectangular box**: the rear (top) fan wall is the full box face like the
    other walls, not just the fan band, so the box is a clean rectangular prism.
  - **Snug box**: the inner footprint equals the filter, and the box depth is the
    fan band + one filter thickness per filter (so a 2-filter sandwich reserves both
    filters and the fans never collide with them). The fan band follows the Box
    depth control when the back-plate fan box is active, otherwise the fan frame.
  - **No honeycomb grill**: fan bores are plain circles (you can't hand-cut a hex
    field in foamcore) and the grill toggle is hidden in Hand cut.
  - **Preview colour**: the foamcore panels in the 3D preview take the chosen
    preview colour (the full 3D-print palette) with a matte finish, instead of the
    laser box's wood material.
  - **Full dimensions (engineering style)**: external overall width/height
    dimensions (extension lines, offset dimension line, arrowheads, value clear of
    the line), PLUS hole positions: a stacked coordinate grid from the panel's
    top-left datum locating every fan and cord centre, centre crosshairs on each
    bore, and arrowed screw-offset dims at one fan corner (the grid repeats). The Ø
    callouts with counts ("2× Ø136 mm fan", "8× Ø5 mm screw", "Ø8 mm cord") drop on
    leaders into the bottom margin, spaced across the width, so the dimensions never
    overlap each other or the cut-outs. The laid-out sheet reserves left/top margins
    per panel. On the annotation layer so both SVG and DXF carry them (annotation
    paths stroke, not fill). Laser cut keeps its original compact name labels.
  - The 3D-print preview colour palette is offered for the hand-cut preview.
- Laser cut is unchanged (still 13 finger-jointed panels for the reference build).

## Four-side tower — bottom filter + box feet (v4, in progress, local only)
- New four-side-filter-tower options: a **bottom (fifth) filter** and a **foot
  length** control. URL params `bottomFilter` (bool) and `feetLength` (mm). The
  Bottom filter toggle sits with the filter layout and shows only for a four-side
  tower with a square filter. Foot length is an independent control in the Advanced
  accordion, shown for any four-side tower (and only the tower): it defaults to 0,
  and switching the bottom filter on raises it to 100 mm (off returns it to 0) so
  air can reach the bottom filter, while staying freely adjustable. The "Fan
  placement" control is hidden for the tower (top is the only exhaust).
- **Box feet**: four corner legs lift the body by `feetLength` (0 = none). The legs
  are the solid corner columns (one structural-offset square), carry the footprint
  bevel, and are baked into the model's z-layout (box height grows downward) so
  chunk splitting stays correct. The leg-to-box junction is square: the new
  `edgeChamferSolid` keeps the chamfer only on the box's top edge and each foot's
  bottom edge, so the feet meet the body flush with no bevel notch.
- **Bottom filter** (square filters only — its footprint is the filter face laid
  flat): the body's bottom stack grows by an outer retaining flange + filter pocket
  beneath the bottom plate. Carved as a rimmed downward intake opening, the filter
  pocket, a rimmed OPEN outlet frame through the bottom plate into the air chamber
  (mirrors the side filters' chamber-side opening — NOT a grille; the only grille
  in the box is the top exhaust, which you see through the open bottom), and a
  loading slot through the chosen `filterSlot.wall` so the filter slides in. The
  bottom filter is gated to square filters in both the fabrication mapping and UI.
- Feet create the airflow standoff a bottom filter needs; the two are independent
  controls (a bottom filter with `feetLength` 0 sits flush).
- Verified headless (Manifold): a 241 mm square tower with feet 100 + bottom filter
  builds as one watertight body at 313×313×386 (matches the supplied sample), with
  zero non-manifold edges; the baseline tower (no feet, no bottom filter) is
  unchanged at 313×313×256.

## Chunk labels — seam-code placement rework (v3, in progress, local only)
- Reworked where the seam-code deboss lands. Each seam now engraves ONE two-letter
  code on the interior face of the chunk beside that seam, driven by the per-seam
  planning anchor, instead of lumping every code onto one "dominant" flat face
  chosen independently of the seam.
- The code reads ALONG the seam line (parallel to the join) and sits at the seam's
  midpoint just inside the cut, instead of crossing the seam or landing on the
  face centre / inside corner.
- A seam is labelled on BOTH the horizontal face it crosses AND the vertical wall it
  runs up, so codes show on the broad floor and on the tall side walls (including
  the vertical-stack z-seams on the four-side tower).
- Placement is material-aware: a face is chosen and positioned by the actual run of
  material in a band along the seam (interval union over triangle extents), not by
  bounding box or triangle centroids. This stops codes landing in open chambers/holes
  or on walls that only graze the seam.
- The code sits inside the box, not in a filter pocket: the wall is chosen as the
  chamber-facing wall (interior plane nearest the box centre, over a slot/outer-flange
  face further out), and within that wall the along-seam run nearest the centre is
  used. So on the four-side tower the z-seam codes land on the chamber side of the
  corner posts.
- Hole clearance: the host face is rasterised to a solid/hole map (flood fill tells
  interior openings from the part's outer/cut edge), and the code is nudged to the
  nearest spot whose footprint stays on material and at least 3 mm from any hole
  (fan grille, screw or filter openings) — preferring to slide along the seam. Also
  kept at least 2 mm from the part's outer/cut edges (a flood-fill tells the part's
  boundary from interior holes, so each gets its own clearance).
- One code per seam, defaulting to the largest flat PANEL the seam reaches (the
  dominant flat face, whatever its orientation), then the next-largest faces (which
  include the side walls) as fallback when the code has no clear room. A label is
  never dropped (best-effort on the largest if nothing has clear room). Within a face
  the code sits on the material nearest the box centre, keeping it inside the box.
- The in-plane orientation (quarter-turn + mirror) is solved from the chosen face
  and the seam direction so it reads correctly viewed from inside the box. The
  mirror uses the cavity viewer's screen-right (up x normal); an earlier convention
  (up x forward) flipped every code, which was masked by a self-consistent preview
  and only caught against a real exported STL.
- Fixed the print-plate 3D preview mirroring every code. The build->scene mapping in
  printableMeshToBufferGeometry used a y<->z reflection (determinant −1), so the
  preview mesh (and its engraved text) was mirror-imaged; the exported STL/3MF was
  unaffected. The print-plate preview now uses a proper rotation (mirrorFree), so the
  preview matches the exported parts. The assembled-housing preview keeps the legacy
  mapping (no chiral content; its parts stay mutually consistent).
- Fixed a frame bug where every chunk except the origin one placed its codes in the
  wrong spot: the chunk mesh is re-seated to its own origin, but the seam anchors
  and box centre were in global posed coords. Converted both into the chunk-local
  frame. Verified headlessly by rendering all seam codes face-on.
- Re-enabled the "Chunk labels" control and let the setting flow through again
  (was force-disabled while parked). Off by default.

## Laser cut — match the boxes.py generator (cut geometry)
- Ported the AirPurifier finger joints to boxes.py exactly: `f` fingers protrude,
  `F` counterparts recess, `h` edges are flat with rectangular finger holes set
  in `edge_width + thickness/2`, all on the same `calcFingers` grid so mating
  edges always mesh.
- Ported boxes.py `DoveTailJoint` exactly (turtle path with rounded corners),
  including the AirPurifier's overrides (dovetail size 2, depth 1, angle 50).
- Aligned app defaults to boxes.py: 3 mm material, finger `edge_width` 1.0,
  dovetail size/depth 2/1.
- Prevented unbuildable finger-hole collisions at panel corners (filter rows vs.
  edge columns) — drops the minimum holes so every pair keeps ≥1 thickness of
  material; verified across 800 dimension/fan/thickness/filter combinations.
- Matched boxes.py part *sizes* exactly via per-edge `spacing()` outsets
  (`startWidth + margin` per edge: e=0, E=t, f/F/h via their profiles) plus
  corner spacers; finger-hole rows shifted to stay aligned with the new edge
  outsets. Fixed the four outer filter-flange rails that were 2×thickness too
  short.
- Verified the generated cut sheet matches the reference `AirPurifier.svg`.

## Laser cut — cord pass-through (ported from 3D Print)
- Added a Cord Pass-Through hole to Laser Cut with the same controls as 3D Print
  (wall, side, corner offset); the hole is punched into the cut sheet and shown
  as a hole in the 3D preview.
- 3D-parity anti-collision: when the cord would land under a fan, the fan bank
  re-packs tighter (min spacing `fanDiameter + 10`) and re-centres to clear the
  cord — the cord stays put — instead of nudging the cord into a corner.
- Side-wall cord defaults to the far (bottom) corner near the floor.
- Cord wall selection maps to the *displayed* (swapped) side-panel names, so the
  control and the drawing always name the same panel.

## Laser cut — one-side "Back" fans
- On the One-side filter layout, a "Back" fan toggle cuts a centred fan grid
  (auto fills the plate; a fixed count lays out as a centred near-square block,
  four screw holes per fan) into the existing closed back panel. Nothing else in
  the box changes — the filter slot and flanges are unaffected.

## Laser cut — Layout "Design" selector
- Added a Design selector under Layout: Nukit Tempest Euro / Original / Pro /
  Custom. It defaults to **Nukit Tempest Original**, switches to **Custom**
  (listed last) whenever an underlying variable is edited, and applies each
  design's filter + fan configuration. The Original laser design uses right +
  top fans.

## Laser cut — Back fans & Box depth (one-side)
- Added a "Back" fan placement that cuts a symmetric fan grid (plus screw holes)
  into the one-side bottom plate, with its own per-side maximum in the selects
  and fan/cord collision avoidance.
- Added a "Box depth" control for one-side + Back builds (default 70 mm), with
  Back-panel seam pins clamped clear of the bottom-plate fan grid.
- Re-enabled the laser drawing export buttons.

## Build diagnostics
- The "No fans" advisory now appears only when the box has no fans on *any*
  surface. Removed the no-side-fans advisory and the large-sheet advisory.

## 3D preview / assembly
- Swapped the two inner filter rails' assembly seats and flipped them 180° about
  their long axis, then renamed them to match their final positions ("inner top
  rail" / "inner bottom rail").
- Hid the per-part name labels in the exploded view.
- Assembled "box" view renders clean nominal walls (no teeth/slots); the
  exploded view shows the real toothed outline + finger/dovetail holes.
- Fixed assembly placement (lap joints): front fan wall seats into the side-wall
  finger holes; front-long/right-short rails swapped to correct faces and flipped
  upright.
- Auto-rotate defaults ON at page load.
- Fan-color picker moved next to the Fans toggle; hidden when fans are hidden.
- Scale reference trimmed to the banana; camera framing stays fixed when toggled.

## Laser Cut control panel (mirrors 3D Print)
- Split the combined "Filter and fan" section into separate Filter and Fan
  sections; Fan placement uses the 3D-Print auto-on/off checkbox style.
- Added a Layout "Design" dropdown (Custom) and removed duplicate bold section
  headings.
- "Advanced" is now a collapsible accordion (Fan counts, Frame, Drawing output,
  Finger joints, Dovetails). Moved "Laser setup" (engrave labels, reference
  scale) plus "Fan screw size" and "Filter rim" into Advanced.
- Filter-layout buttons unified to "One side" / "Both sides" (+ "Four sides" for
  3D Print); balanced the control columns to remove empty gaps.
- Tidied the Advanced layout into balanced columns.
- Number inputs no longer crop their value (spinners removed, min widths added).

## Filter size presets
- Expanded the "Filter size" dropdown to the full catalog with mm-accurate
  dimensions.
- Updated STARKVIND to 365 × 285 × 35 mm and removed FORNUFTIG; updated the real
  dimensions of every layout design that uses STARKVIND (including the Nukit
  Tempest Euro default).
- Added a 10" x 10" x 1" (241 x 241 x 19 mm) filter preset.
- Added STARKVIND 1x2 (730 x 285 x 35 mm) and STARKVIND 2x1 (365 x 570 x 35 mm)
  presets, each two STARKVIND filters side by side. The 3D preview splits the
  filter media into separate tiles with a seam between them so it reads as two
  filters (works in either orientation; only triggers for STARKVIND multiples).

## 3D Print (Tempest) design presets
- Added design presets: Nukit Tempest Euro, Euro Cube, Original, Original Cube,
  and Pro (each applies its full filter/fan/box configuration).

## 3D Print controls & geometry (earlier work)
- Hex grill, cord pass-through (wall/side/offset), Box/Exhaust fan option with
  auto-sized rings, per-wall fan controls, Filter slot placement.
- Two-column Advanced accordion with tooltips; millimetres everywhere (no mm/in
  toggle); whole-mm filter dimensions; width/length swap button.
- Adjustable alignment-pin size in Advanced (default 2 mm; 0 disables the pins;
  clamped to a 2.5 mm maximum).

## Print kit / 3MF
- Export the print kit as one 3MF per chunk in a ZIP; auto-orient chunks on the
  bed; tower alignment pins fixed; chunk/seam matching codes (currently parked).
- Auto-orientation now considers all 24 axis-aligned orientations instead of only
  quarter-turns about the depth axis, so a thin plate chunk (e.g. a top/back panel
  only a few mm deep) lays flat on its large face instead of printing on edge.
  Identity stays first and wins ties, so box-shaped chunks keep their orientation.
- Chunk seams now avoid the thin inside filter flanges as well as fan grills. A
  depth seam could land inside a ~5 mm flange (pushed there by grill avoidance)
  and split it into a weak sliver; the flange's thin extent is now a seam keep-out
  so the cut clears it.
- Every download now uses a single generic base name, `nukit-filterboxbuilder`
  (print-kit ZIP and its per-chunk 3MF entries, the STL ZIP, and the laser
  SVG/DXF), instead of per-design names like `nukit-tempest-print-kit`.
- Added two print-volume presets: 250 x 220 x 270 mm and 300 x 300 x 330 mm
  (labelled by dimensions only).
- Back-plate ("Back") fan grid: when fewer than the maximum fans are requested,
  they are now distributed evenly (each fan at the centre of an equal division of
  the plate, balanced margins and gaps) for uniform airflow, instead of clustering
  at minimum spacing in the centre. The rows x cols split also follows the plate
  shape now, so a deep plate gets more rows than columns (e.g. 6 -> 2 cols x 3
  rows, not 3 x 2). Designs that also use side-wall fans fall back to the centred
  grid that keeps clear of them.

---

## Appendix — full commit list (newest first)
```
df83454 Update Nukit Tempest Original laser design to right + top fans
639281c Drop the no-side-fans and large-sheet advisories
3da3ec1 Add Laser Cut "Design" selector (Euro/Original/Pro/Custom)
fdb729c Map cord wall selection to the displayed panel names
b2da4df Default the side-wall cord to the far (bottom) corner
28d4285 Revert "Default the side-wall cord to the floor, centered along the wall"
da4863e Default the side-wall cord to the floor, centered along the wall
762810f Laser cord/fan: re-pack fans closer together, keep cord put (3D parity)
5e4a2d8 Laser cord/fan anti-collision: move the fans, not the cord (3D parity)
f5d0fb4 Slide laser cord along its wall (into the fan gap) instead of into a corner
141dec5 Keep the laser cord hole clear of fans (anti-collision)
c42d4b7 Add cord pass-through hole to Laser Cut mode
fc506c5 Tidy the Laser Cut Advanced layout into balanced columns
4743b7f Update STARKVIND filter to 365x285x35 and drop FORNUFTIG
c86e0ec Hide part-name labels in the 3D exploded view
fa316b3 Rename inner top/bottom rails to match their swapped seats
b0b27d1 Flip inner top/bottom rails 180deg about their long axis
1d6a15d Swap inner top/bottom rails' assembly seats (not their labels)
23169fe Swap inner top/bottom rail labels to match part positions
f4861fe Align FingerHoleEdge holes with the new edge outsets
c2fd939 Match boxes.py part sizes via per-edge spacing outsets
4732911 Fix outer filter flange rails being 2*thickness too short
59c2486 Rename laser parts to match their position in the 3D view
37f4c2b Re-enable per-part name labels in the exploded 3D view
d2e562f Label cord Front/Back walls as Bottom/Top to match the 3D view
0d97117 Honor cord corner offset on side walls (near the floor) + horizontal slide
255f9ea Cord position slides horizontally on left/right wall panels
662b8ec Center the cord by default and honor side on all walls
aa99766 Lay out a fixed Back fan count symmetrically and centred
640c3c4 Add Back to Fan tuning; show real per-side maxima in the selects
0766f79 Switch Design to "Custom" when a preset variable is edited
c872b76 Keep sandwich plate/frame pins off piece edges and chunk corners
4e396e8 Clamp Back-panel seam pins clear of the bottom-plate fan grid
4dd75f5 Default Back-panel box depth to 70mm
596406c Back panel: fan/cord collision avoidance + Box-depth gating
04bfa4e Add "Box depth" panel control for one-side + Back
b93c8df Phase 2: cut "Back" fan + screw holes into the one-side bottom plate
a12a5ee Fix "Back" fan toggle dropped through draft/raw normalization
9576cb7 Add "Back" fan placement (bottom-plate grid) for one-side tempest
bc2e072 Re-enable laser drawing export buttons
f2e7a82 Document beta deploy without touching main (DEPLOY-BETA.md)
68e76d8 Document port-tempest-features changes in CHANGELOG.md
c5be4b7 Add Nukit Tempest Pro preset; default auto-rotate on
ce5a896 Fix Nukit Tempest Original fan placement
21edcb4 Add Nukit Tempest Original and Original Cube design presets
cc5d485 Move Laser setup, fan screw size and filter rim into Advanced
881ef89 Unify Filter layout labels; drop duplicate Fan heading
220ac78 Tidy Laser Cut control layout
fd776d9 Add Design dropdown (Custom) to Laser Cut Layout
5f95f34 Mirror 3D Print control layout for Laser Cut (split Filter/Fan)
8516027 Make Laser Cut Advanced a grouped accordion like 3D Print
101b13e Expand filter size preset list
d3e9255 Clean assembled laser walls; disable laser drawing export
08c4e8f Stop number inputs from cropping their value
4240803 Hide per-part 3D labels for now
42ef402 Flip front-long and right-short rails 180deg about their long axis
e23274c Swap front-long and right-short rail placements
35ef8bf Default session query to autoRotate=false
0f03933 Default the 3D preview auto-rotate to off
aab2596 Label each part with its name in the exploded 3D view
34e4984 Seat front fan wall into side-wall finger holes (assembly placement)
5ae9971 Show fingers and dovetails in the 3D assembled/exploded views
55f0e7f Keep a full-thickness gap between filter rows and edge columns
2d7c501 Prevent finger-hole collisions at panel corners
f1579a1 Align app defaults to boxes.py defaults
1e7aefc Port boxes.py DoveTailJoint geometry exactly
117b860 Match boxes.py finger-joint geometry; clean assembled preview
abcc739 Revert "Render structural wall corner fingers flush in the preview"
f4ae798 Render structural wall corner fingers flush in the preview
9361dc7 Fix colliding fingers at the back wall corners (align to back fan wall)
e446dce Revert "Render finger corners flush in the 3D preview (cut unchanged)"
5d94f42 Render finger corners flush in the 3D preview (cut unchanged)
5cb04c7 Only the outer-frame rear flange is plain; inner flange keeps fingers
4f51f97 Keep the two rear loading-side filter flanges plain
fa28d28 Give every filter-frame flange edge fingers (match reference joinery)
ea44c7d Flip the left side wall right-side-up in the assembly preview
330964d Align front filter flange fingers with the fan-wall slots
27dfb79 Make filter-frame loading-side flanges plain (no hanging fingers)
dde9413 Flip left-side filter-flange rails so their fingers face the wall
318d592 Show finger joinery in both standard and exploded 3D views
fdea484 Match reference dovetails and show joinery in exploded view
b1ec178 Render laser 3D enclosure as clean solid walls
01942a8 Fix laser finger joints so adjacent panels interlock
b9339fe Add Nukit Tempest Euro Cube design; order Custom last
498224d Add Nukit Tempest Euro design preset and load it by default
4936c35 Fix tower bottom-plate pin row and the floating corner pin
367dab0 Drill only valid alignment-pin holes (stop pins breaking through tower walls)
3f83b8f Force chunk-label deboss off in the app (ignore saved chunkLabels=true)
f14a40b Park the chunk-label deboss: default off, hide the control
12f66c8 Deboss seam codes on each chunk's largest flat face, bigger and deeper
d69bc04 Lay seam codes out centered + spread on the chamber wall's solid band
1328cd5 Mirror chunk/seam codes so they read correctly from inside the chamber
2482f7d Deboss seam codes on the chamber wall, not inside the filter slots
c3508e0 Deboss chunk/seam matching codes into split prints
545e51a Rename the Fan screw holes label to Fan screw size
4dfa3da Extend the tower top/bottom edge chamfer to the corner posts
ab68fdf Chamfer the tower's top and bottom outside edges
5eea98b Add info tooltips to Fan size, Fan placement, Filter slot placement
c1c3a3b Keep camera framing fixed when toggling the scale reference
9446e0b Drop sandwich alignment pins over the filter loading slot
6b29aae fix(tempest): 1-filter wall mount cord exits near the floor like the sandwich
5045d69 feat(tempest): rename "1 top filter" to "1-filter wall mount" and stand it upright
f887584 feat(preview): drop the grey fan option, keep black + beige
b5d499b feat(preview): black and grey fans reuse the CAD model (recoloured)
ad610e5 fix(preview): parent exploded fans to their chunk so they track the opening
0f93e36 fix(preview): explode tempest fans along their wall normal so they stay aligned
7ce01a5 feat(preview): drop the 1 m cube from the scale reference, keep the banana
4e68cfc refactor(controls): show Box/Exhaust ring variables in the Advanced section
72ae468 feat(controls): rename hex grill labels to "Grill hex size/spacing"
b573bfb refactor(controls): two-column Advanced section with tooltips
a0d9de9 feat(tempest): hide Material thickness and Outside flange thickness for now
1f52e2d feat(tempest): expose Outside flange thickness in Advanced
9e5d389 feat(controls): show the stock filter name in the "What you need" Filter row
8fc0b23 fix(controls): keep the filter size when switching Filter layout
76b28de feat(controls): swap button between Filter width and length
55fe993 refactor(controls): tidy the tempest Fan column
babba1f refactor(controls): split tempest controls into Filter (left) and Fan (right)
e4701aa feat(tempest): cord diameter 0 = none; tower cord wall is Top only
32cdc94 feat(tempest): auto-shift the cord hole clear of fans (replaces the warning)
190b2a8 feat(tempest): warn when the cord hole collides with a fan
7f3749a fix(controls): segment cells equal height; break "Box/Exhaust" at the slash
39b7736 fix(controls): wrap long segment labels so text never overflows the button
3c18882 feat(tempest): tower honors Bottom filter slot placement (bottom-plate loading)
005eedc fix(tempest): keep Filter slot placement defaulting to Top in the tower
53be640 feat(tempest): make Filter slot placement a dropdown
1557902 feat(tempest): Filter slot placement selects the slot entry wall
b0f9a5f feat(tempest): wire Filter slot placement to the filter arrangement
ddabaf3 feat(controls): add a Filter slot placement control (placeholder)
5788d47 feat(controls): add a Filter size preset selector above Filter width
e79e175 feat(preview): hide the fan-color picker when fans are hidden
c035c01 feat(preview): move the fan-color picker next to the Fans toggle in the 3D viewer
4ccccff feat(tempest): relabel box/exhaust ring screw controls
6a9aeb9 feat(tempest): box/exhaust ring radii to 50% / 60% of filter width
0bae41b feat(tempest): box/exhaust ring radii relative to the fan-hole radius (55%/60%)
b6dcac8 feat(tempest): box/exhaust ring radii to 42% / 45% of filter width
9b6f41a feat(tempest): retune box/exhaust width percentages (75/35/40)
a81bffa feat(tempest): box/exhaust diameters auto-populate from width; relabel fields
aad906c fix(tempest): tower box follows the entered filter width/length orientation
de83b4b feat(tempest): Fan placement checkboxes outside Advanced; per-wall counts inside
2af753e feat(tempest): collapse advanced controls behind an Advanced accordion
2ab23fb feat(tempest): add a Design selector under Layout (Custom placeholder)
fa5f2b9 feat(tempest): hide fans in Box/Exhaust and drop the "Tempest layout" title
6fb30c9 fix(tempest): map Top/Bottom fan controls to the wall the preview shows
3e434cd feat(tempest): editable per-wall fans for 1-top and sandwich modes
0d457fd refactor(controls): reword the parts section note to filters only
6aedad1 feat(tempest): add Box/Exhaust fan option and ring geometry (drop Custom)
1572be1 feat(tempest): expose Cord Pass-Through wall, side, and corner offset
9623166 feat(tempest): expose Hex Grill settings (honeycomb on/off, size, spacing)
fa2225d feat(controls): drop the mm/in toggle and use millimetres everywhere
7071ed5 fix(preview): stop tower pins floating in open regions of the exploded view
f7ecb1b feat(tempest): add shortened alignment pins across the tower top plate
2b31ab7 refactor(controls): say 'length' not 'depth' in the measured-filter hint
1348fd0 feat(preview): default the enclosure colour to grey and list black last
6dd8cb7 fix(preview): drop the four-filter tower's top fans into the air chamber
8bcac88 feat(controls): show filter dimensions as whole millimeters
3bacee1 fix(controls): keep segmented option labels inside their buttons
8631488 fix(controls): reflow the preview summary strip so values never break mid-word
321c123 fix(controls): stop filter dimension inputs cropping at narrow widths
3aab1fe refactor(controls): rename the Filter depth label to Filter length
00ca64c feat(printing): show auto-oriented chunks in the print-plate preview
0c676dc feat(printing): auto-orient print chunks on the bed to minimize support
ff6af3b feat(printing): export the print kit as one 3MF per chunk in a ZIP
```
