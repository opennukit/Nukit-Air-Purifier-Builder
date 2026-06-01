// ============================================================================
//   Parametric Air-Purifier Housing for 3D Printing  (pure OpenSCAD)
// ============================================================================
//   Open this file in OpenSCAD, tweak parameters in the Customizer panel on
//   the right, F5 to preview / F6 to render / File→Export→STL to slice.
//
//   Geometry summary:
//     * X, Y in the Filter group = FILTER outer footprint.  The box outer
//       is computed = filter + 2 * Wall_thickness on each axis.
//     * 5 mm walls + inner flange; 10 mm outside frame on top + bottom.
//       Both controlled by separate variables; defaults match a 20" HVAC
//       filter housing.
//     * One Rim variable -- measured from the OUTSIDE of the box -- sets
//       the visible frame rim AND the inner flange ring at the same
//       distance from the box exterior.
//     * Each filter is sandwiched between an outer frame (with chamfered
//       air opening) and an inner flange (with a matching opening that
//       holds the filter from below).
//     * 1-filter mode puts the single filter at the TOP, right under the
//       open frame, with a solid plate sealing the bottom.
//     * Fan layout leaves enough end margin that fans on perpendicular
//       walls cannot collide at the corners.
//     * Fans are also positioned so the top edge of the fan body sits at
//       least 2 * Cord_hole_diameter below the inside ceiling, leaving
//       room to thread a nut onto a DC barrel jack in the cord hole.
//     * Cord pass-through sits at the box vertical centre on a chosen
//       wall + side (4 walls x left/right = 8 placement points).
//     * Whole-assembly 3D chunking: pick a single chunk by world grid
//       index for direct STL export.
//     * Alignment-pin holes (1.8 mm x 18 mm COTS pins) drilled at every
//       chunk seam so chunks can be glued together with positive align-
//       ment.  Pins only land on solid wall / frame / flange material --
//       never in the hex grill, fan body, or air opening.
//
//   Coordinate convention:
//     * Box footprint on the XY plane, +Z up.
//     * "front" = y=0 face, "back" = y=Y face, "left" = x=0, "right" = x=X.
//     * Fan and slot params keep the original Python source's naming:
//         Fans_top    = FRONT wall (y=0)
//         Fans_bottom = BACK  wall (y=Y)
//         Slot_wall "top" = front face, "bottom" = back face
// ============================================================================


// ============================================================================
//   PARAMETERS  (Customizer)
// ============================================================================

// NOTE: Each variable below is preceded by a SINGLE-line comment.  The
// OpenSCAD Customizer only renders the last "//" line above a variable
// as its description, so multi-line comments would lose all but the
// final line.  Longer explanations live in the header doc-block above.

/* [Filter] */
// Filter outer X dimension (mm). For Filters=1/2 horizontal width; for Filters=4 the face width of each side filter (box has square footprint, all 4 filters share this width).
X = 495;
// Filter outer Y dimension (mm). For Filters=1/2 horizontal Y; for Filters=4 it's the VERTICAL height of each side filter.
Y = 495;
// Filter thickness in the air-flow direction (mm). Vertical for Filters=1/2; horizontal (perpendicular to each face) for Filters=4.
Filter_height = 45;
// Rim / edge-flange width (mm), measured from the OUTSIDE of the box. Sets the air opening AND the inside supporting flange (they line up).
Rim = 30;
// Filter arrangement: 1 = single horizontal filter at top, 2 = top+bottom sandwich, 4 = vertical tower (one filter per side).
Filters = 2; // [1, 2, 4]

/* [Fans] */
// PC-fan body diameter (mm). Supported: 120 or 140.
Fan_diameter = 140; // [120, 140]
// Fan mounting-screw hole diameter (mm).
Screw_holes = 5;
// Fans on LEFT wall. -1 = as many as fit, 0 = none, N = exactly N.
Fans_left = -1;
// Fans on RIGHT wall. -1 = as many as fit, 0 = none, N = exactly N.
Fans_right = -1;
// Fans on FRONT wall (y=0). -1 = as many as fit, 0 = none, N = exactly N.
Fans_top = 0;
// Fans on BACK wall (y=Y). -1 = as many as fit, 0 = none, N = exactly N.
Fans_bottom = 0;

/* [Hex Fan Grill] */
// Add a honeycomb grill across each fan opening.
Hex_grill = true;
// Flat-to-flat distance of one hex hole (mm).
Hex_size = 10;
// Rib thickness between adjacent hex holes (mm).
Hex_spacing = 1.6;

/* [Filter Slot] */
// Which wall carries the filter-insertion slot(s).
Slot_wall = "bottom"; // [left, right, top, bottom]
// Clearance around the filter inside the slot (mm).
Slot_clearance = 1;
// Wall material left at each end of the slot (mm). Must be <= Wall_thickness - Slot_clearance so the filter can slide through.
Slot_end_margin = 4;

/* [Walls / Frame] */
// Vertical wall thickness (mm). Also controls the inside filter-flange thickness.
Wall_thickness = 5;
// Top+bottom outer frame thickness (mm). Independent of wall thickness so the frame can be beefier for filter retention.
Outside_flange_thickness = 10;
// 45-deg chamfer (mm) on outer vertical edges AND the filter air opening.
Chamfer_size = 2;
// 4-filter ONLY: 45-deg chamfer (mm) cut into each outer corner of the
// tower box.  Big chamfer for a finished look; 0 disables.  Cuts only the
// outer-wall material -- the rectangular corner post inside stays intact.
Corner_post_chamfer = 55;

/* [Cord Pass-Through] */
// Cord-hole diameter (mm). 0 = no cord hole.
Cord_hole_diameter = 8;
// Which wall the cord hole sits on. "none" disables it.
Cord_hole_wall = "right"; // [none, front, back, left, right]
// Where along the wall: "left"/"right" end (viewed from outside) or "center".
Cord_hole_side = "right"; // [left, center, right]
// Distance (mm) from the chosen corner to the cord-hole centre. Ignored when Cord_hole_side = "center".
Cord_hole_corner_offset = 17;

/* [Alignment Pins] */
// Pin/hole diameter (mm) for COTS alignment pins inserted at chunk seams. 0 = disabled.
Pin_diameter = 1.8;
// Hole depth on EACH side of the seam (mm). Total cylinder length = 2x this. For an 18 mm pin use 10.
Pin_hole_depth = 10;
// Spacing between pin holes along a seam (mm).
Pin_spacing = 30;

/* [3D-Print Chunking] */
// Print bed X (mm). Whole assembly is sliced into a grid of Bed_x x Bed_y x Bed_z chunks.
Bed_x = 256;
// Print bed Y (mm).
Bed_y = 256;
// Print bed Z / printer max object height (mm).
Bed_z = 256;

/* [Render / Print] */
// What to render: full assembly (visualisation) or one printable chunk (export).
Render_part = "assembly"; // [assembly, chunk]
// Chunk index along world X (0..n_x-1). See console for n_x.
Chunk_ix = 0;
// Chunk index along world Y (0..n_y-1).
Chunk_iy = 0;
// Chunk index along world Z (0..n_z-1).
Chunk_iz = 0;
// True = shift the chunk to the origin (ready for STL export). False = leave it in its assembly position.
Chunk_to_origin = true;

/* [Render Quality] */
// Circle facet count. Higher = smoother circles but slower preview.
$fn = 48;


// ============================================================================
//   DERIVED  (don't edit unless you know what you're doing)
// ============================================================================

t   = Wall_thickness;            // walls + inner flange thickness
oft = Outside_flange_thickness;  // top + bottom frame thickness
fh  = Filter_height;
fl  = Wall_thickness;            // inner flange thickness
sc  = Slot_clearance;
cf  = Chamfer_size;
eps = 0.05;                      // tiny overlap to force boolean merges

// Box exterior.
//   Filters=1,2: filter outer + 2 * wall thickness.
//   Filters=4:   SQUARE footprint (X + 2*(oft+fh+t)) on each axis --
//                outer wall (oft) + filter pocket (fh) + corner-block
//                margin (t) on each side.  The extra t mm of corner block
//                gives a Wall_thickness-wide structural strip between
//                adjacent filter slots so the 3D print is not corner-to-
//                corner.  Y is repurposed as the VERTICAL filter height.
box_x = (Filters == 4) ? X + 2 * (oft + fh + t) : X + 2 * t;
box_y = (Filters == 4) ? X + 2 * (oft + fh + t) : Y + 2 * t;
frame_thickness = oft;

// Total housing height + intrinsic wall height.
//   Filters=1,2: H = 2*OFT + Filters*(FH+FL) + fan-chamber (df + 2)
//   Filters=4 (tower): H = Wall_thickness (bottom plate) + Y (filter
//                      height) + OFT (top plate).  Top plate carries the
//                      fans (10 mm default), bottom plate is just t.
h_box = (Filters == 4)
          ? (t + Y + oft)
          : (Fan_diameter + 2 + 2 * frame_thickness + Filters * (fh + fl));
hw    = h_box - 2 * frame_thickness;

// Tower-mode geometry shorthands.
//   bp_thk = bottom-plate thickness (5 mm default).
//   tp_thk = top-plate thickness (10 mm default; carries the fans).
//   ofs    = how far the corner block extends inward from each box edge:
//            outer wall (oft) + filter pocket (fh) + corner-margin (t).
//   The air chamber starts at ofs in both X and Y, and the inner flange is
//   the t-thick strip at [oft+fh, ofs] on each side, between the corner
//   blocks.
bp_thk      = t;
tp_thk      = oft;
ofs         = oft + fh + t;
air_x_min   = ofs;
air_x_max   = box_x - ofs;
air_y_min   = ofs;
air_y_max   = box_y - ofs;

// Fan body depth (mm) for the supported PC-fan sizes.
function fan_body_depth(d) =
      d == 120 ? 25
    : d == 140 ? 27
    : d * 0.19;

// Fan-screw pitch (mm) for the same set of sizes.
function fan_hole_pitch(d) =
      d == 120 ? 105
    : d == 140 ? 125
    : d * 0.85;

sp = fan_hole_pitch(Fan_diameter);


// ============================================================================
//   FILTER + INNER-FLANGE Z POSITIONS
//   Filters == 1: single filter sits at the TOP (next to the open frame).
//   Filters == 2: bottom + top filter as usual.
// ============================================================================

function filter_z(idx) =
    (Filters == 1) ? h_box - frame_thickness - fh :
    (idx == 0)     ? frame_thickness :
                     h_box - frame_thickness - fh;

function flange_above_z(idx) = filter_z(idx) + fh;
function flange_below_z(idx) = filter_z(idx) - fl;


// ============================================================================
//   FAN-LAYOUT MATHS
// ============================================================================
//
// Corner-collision rule.  A fan body sticks INTO the box by fan_body_depth
// (25 mm for 120 mm, 27 mm for 140 mm).  For the body NOT to overlap a fan
// body on the perpendicular wall, the fan's CENTRE on this wall must be at
// least  (wall_thickness + fan_body_depth + fan_radius)  in from the end.
// That guarantees the body's near edge (centre - radius) clears the
// perpendicular wall's body footprint (wall_thickness + fan_body_depth).
//
// We also keep the centre at least Cord_hole_diameter in from each end so
// the screw-hole pattern doesn't punch into the corner radius / chamfer.

// Minimum centre position (mm) for the first or last fan on a wall.
function fan_corner_safe_min() =
    t + fan_body_depth(Fan_diameter) + Fan_diameter / 2;

// Maximum number of equally-spaced fans (centre-to-centre = Fan_diameter+10)
// that fit on a wall of length L, with first and last centres respecting
// fan_corner_safe_min().
//   span_between_outer_centres = L - 2 * mc
//   (n - 1) * spacing <= span   =>   n <= 1 + span / spacing
function max_fans(L) =
    let (mc       = fan_corner_safe_min(),
         spacing  = Fan_diameter + 10,
         span     = L - 2 * mc)
        (span < 0) ? 0 : max(0, floor(1 + span / spacing));

function actual_fans(n, L) =
    let (m = max_fans(L))
        (n < 0 || n > m) ? m : n;

// Vertical centre of fans on a wall of local height hwl.
//   Two filters: centred (fan chamber = middle of wall).
//   One filter:  centred in the fan chamber, which now sits BELOW the
//                single top filter -- so the natural fan position is
//                lower than the wall midpoint.
//   Both cases are then capped so the fan's TOP edge sits at least
//   2 * Cord_hole_diameter below the inside top, leaving room for a nut
//   to thread onto a DC barrel jack inserted through the cord hole.
function fan_posy_local(hwl) =
    let (natural = (Filters == 2)
                     ? hwl / 2
                     : (hwl - fh - fl) / 2,
         fan_radius = Fan_diameter / 2,
         max_safe   = hwl - 2 * Cord_hole_diameter - fan_radius)
        min(natural, max_safe);

// TOP-PLATE fan-grid maths (Filters=4 tower).  Fans sit on the top plate
// looking down into the air chamber.  Min centre from box edge =
// (outer wall + filter + inner flange) + Fan_diameter/2 so the fan body
// (axis vertical) sits inside the air chamber and clears the inner flange.

function top_fan_min_centre() =
    oft + fh + t + Fan_diameter / 2;

function top_fans_per_side(L) =
    let (mc      = top_fan_min_centre(),
         spacing = Fan_diameter + 10,
         span    = L - 2 * mc)
        (span < 0) ? 0 : max(0, floor(1 + span / spacing));

// Centre coords along ONE axis for n fans on a top-plate length L.
function top_fan_positions(n, L) =
    let (mc      = top_fan_min_centre(),
         spacing = Fan_diameter + 10,
         total   = (n <= 1) ? 0 : (n - 1) * spacing,
         first   = (n == 1) ? L / 2 : (L - total) / 2)
        (n <= 0) ? [] : [ for (i = [0 : n - 1]) first + i * spacing ];


// Centre coordinates (along the wall) of n fans on a wall of length L.
// Fans are SPREAD OUT to fill the available wall, with the first and last
// fans sitting at fan_corner_safe_min() from each end (so the perpendicular-
// wall collision rule still holds).  The minimum spacing is Fan_diameter+10
// mm so fan bodies never touch; the actual spacing only exceeds that when
// the wall is long enough to give us extra room.
function fan_positions(n, L) =
    let (n_act    = actual_fans(n, L),
         mc       = fan_corner_safe_min(),
         min_sp   = Fan_diameter + 10,
         spread   = (n_act <= 1) ? min_sp : (L - 2 * mc) / (n_act - 1),
         spacing  = max(min_sp, spread),
         total    = (n_act <= 1) ? 0 : (n_act - 1) * spacing,
         first    = (n_act == 1) ? L / 2 : (L - total) / 2)
        (n_act == 0) ? [] : [ for (i = [0 : n_act - 1]) first + i * spacing ];


// ============================================================================
//   2D PRIMITIVES
// ============================================================================

module hex_2d(size_ff) {
    r = size_ff / sqrt(3);
    polygon([ for (k = [0:5]) [r * cos(60*k + 30), r * sin(60*k + 30)] ]);
}

module hex_grill_2d(d_outer, size_ff, spacing) {
    pitch_x = size_ff + spacing;
    pitch_y = (size_ff + spacing) * sqrt(3) / 2;
    n_col   = ceil(d_outer / pitch_x) + 2;
    n_row   = ceil(d_outer / pitch_y) + 2;
    intersection() {
        circle(d = d_outer - 2 * spacing);
        union() {
            for (j = [-n_row : n_row]) {
                for (i = [-n_col : n_col]) {
                    off_x = (j % 2 == 0) ? 0 : pitch_x / 2;
                    translate([i * pitch_x + off_x, j * pitch_y])
                        hex_2d(size_ff);
                }
            }
        }
    }
}

module fan_pattern_2d() {
    if (Hex_grill) hex_grill_2d(Fan_diameter - 4, Hex_size, Hex_spacing);
    else           circle(d = Fan_diameter - 4);
    delta = sp / 2;
    for (dx = [-delta, delta], dy = [-delta, delta])
        translate([dx, dy]) circle(d = Screw_holes);
}

// Air-flow opening centred on the box plate (box_x x box_y).  The opening
// is Rim mm in from every outside edge.
module filter_opening_2d() {
    ow = box_x - 2 * Rim;
    oh = box_y - 2 * Rim;
    if (ow > 0 && oh > 0) {
        r = min(10, ow / 2, oh / 2);
        translate([Rim, Rim])
            offset(r = r) offset(r = -r)
                square([ow, oh]);
    }
}

// ============================================================================
//   3D PRIMITIVES
// ============================================================================

// Rectangular prism dx x dy x dz with the 4 vertical edges chamfered at 45 deg.
module chamfered_prism(dx, dy, dz, c) {
    if (c <= 0) {
        cube([dx, dy, dz]);
    } else {
        cc = min(c, dx / 2 - 0.01, dy / 2 - 0.01);
        linear_extrude(height = dz)
            polygon([
                [cc, 0],          [dx - cc, 0],
                [dx, cc],         [dx, dy - cc],
                [dx - cc, dy],    [cc, dy],
                [0, dy - cc],     [0, cc]
            ]);
    }
}


// ============================================================================
//   FRAME / PLATE / FLANGE
// ============================================================================

// Top or bottom frame (the OUTSIDE filter flange).  Chamfered opening + edge.
module frame_panel() {
    difference() {
        chamfered_prism(box_x, box_y, frame_thickness, cf);
        if (cf > 0) {
            hull() {
                translate([0, 0, -0.5])
                    linear_extrude(0.01) offset(r = cf) filter_opening_2d();
                translate([0, 0, cf])
                    linear_extrude(0.01) filter_opening_2d();
            }
            translate([0, 0, cf])
                linear_extrude(height = frame_thickness - 2 * cf)
                    filter_opening_2d();
            hull() {
                translate([0, 0, frame_thickness - cf])
                    linear_extrude(0.01) filter_opening_2d();
                translate([0, 0, frame_thickness + 0.5])
                    linear_extrude(0.01) offset(r = cf) filter_opening_2d();
            }
        } else {
            translate([0, 0, -0.5])
                linear_extrude(height = frame_thickness + 1) filter_opening_2d();
        }
    }
}

// Solid bottom plate (used as the bottom when Filters == 1).
module plate_panel() {
    chamfered_prism(box_x, box_y, frame_thickness, cf);
}

// INSIDE filter flange ring.
//
// Outer profile MATCHES the box outer profile exactly (same chamfered_prism
// geometry as frame_panel / plate_panel), so the flange's chamfered corners
// line up perfectly with the wall material and there's no triangular gap
// between flange and wall at the corners.  Placed at world origin like the
// frame.  Air-flow opening cut out using the same filter_opening_2d() so the
// opening matches the top/bottom frame.
module flange_panel() {
    difference() {
        chamfered_prism(box_x, box_y, fl, cf);
        translate([0, 0, -0.5])
            linear_extrude(height = fl + 1) filter_opening_2d();
    }
}


// ============================================================================
//   WALL  (one side, full height between the two frames)
//   Wall-local frame:
//     X = 0..L (along the wall)
//     Y = 0..t (through-wall thickness, +Y into the box)
//     Z = 0..hw (height; world Z = frame_thickness..h_box - frame_thickness)
// ============================================================================

module wall(L, fans_n, with_slot) {
    difference() {
        chamfered_prism(L, t, hw, cf);

        // Fan cut-outs
        for (fx = fan_positions(fans_n, L)) {
            translate([fx, -0.5, fan_posy_local(hw)])
                rotate([-90, 0, 0])
                    linear_extrude(height = t + 1)
                        fan_pattern_2d();
        }

        // Filter-loading slots (only if this wall is the slot wall)
        if (with_slot) {
            for (idx = [0 : Filters - 1]) {
                zb = max(0,  filter_z(idx) - sc - frame_thickness);
                zt = min(hw, filter_z(idx) + fh + sc - frame_thickness);
                if (zt > zb)
                    translate([Slot_end_margin, -0.5, zb])
                        cube([L - 2 * Slot_end_margin, t + 1, zt - zb]);
            }
        }
    }
}


// ============================================================================
//   3D-CHUNKING grid sizing helpers
// ============================================================================
function n_chunks_x() = max(1, ceil(box_x / Bed_x));
function n_chunks_y() = max(1, ceil(box_y / Bed_y));
function n_chunks_z() = max(1, ceil(h_box / Bed_z));

function chunk_size_x() = box_x / n_chunks_x();
function chunk_size_y() = box_y / n_chunks_y();
function chunk_size_z() = h_box / n_chunks_z();


// ============================================================================
//   TOWER (Filters=4) GEOMETRY
// ============================================================================
// Layout in plan view (X-Y, looking down):
//
//      x=0      x=oft   x=ofs   x=ofs+t            ...
//       |        |       |       |
//       v        v       v       v
//   +----+======+========+========+====+====+
//   |OW  | CB   |  IF    |              |      <- y=box_y (back)
//   |    +======+========+====+   ...
//   |    |                    |
//   |    |     air chamber    |
//   |    |                    |
//   |    +========+========+====+
//   |    |  IF    |  CB   |OW  |
//   +----+========+=======+====+    <- y=0 (front)
//
//   OW = outer wall (oft = 10 mm), with one rectangular air opening per side
//   CB = corner block (fh thick, filling the gap between OW and IF)
//   IF = inner flange (t = 5 mm), with one matching air opening per side
//   Filter pockets sit in the air openings between OW and IF.
//
//   Air enters through the outer-wall opening, passes through the filter
//   media, exits through the inner-flange opening into the air chamber,
//   and is pulled up through the NxN fan grid in the top plate.

// One NxN fan grid centred over the top plate / air chamber.
module tower_fan_grid() {
    nx = top_fans_per_side(box_x);
    ny = top_fans_per_side(box_y);
    z0 = h_box - tp_thk - eps;
    h  = tp_thk + 2 * eps;
    for (cx = top_fan_positions(nx, box_x))
        for (cy = top_fan_positions(ny, box_y))
            translate([cx, cy, z0])
                linear_extrude(height = h)
                    fan_pattern_2d();
}

// Filter-loading slots through the top plate -- one per filter.  Each slot
// MATCHES the filter pocket exactly on both axes, so the slot never cuts
// into the corner block (X axis) or into the top plate above the inner
// flange (Y axis).  Filter clearance for drop-in comes from the filter
// being slightly smaller than the pocket, not from oversizing the slot.
module tower_filter_slots() {
    z0  = h_box - tp_thk;
    h   = tp_thk + eps;
    // Front
    translate([ofs, oft, z0]) cube([X, fh, h]);
    // Back
    translate([ofs, box_y - oft - fh, z0]) cube([X, fh, h]);
    // Left
    translate([oft, ofs, z0]) cube([fh, X, h]);
    // Right
    translate([box_x - oft - fh, ofs, z0]) cube([fh, X, h]);
}

// 2D rounded rectangle (centred at origin) used for the tower air openings.
//   w, h    = nominal opening dimensions
//   expand  = grow the rounded rect by this much in every direction (used
//             by the chamfered-tube hull() to build the 45-deg frustum)
module tower_opening_2d(w, h, expand = 0) {
    r = min(10, w / 2, h / 2);
    if (w > 0 && h > 0)
        offset(r = expand)
            offset(r =  r)
                offset(r = -r)
                    translate([-w / 2, -h / 2]) square([w, h]);
}

// Z-axis-aligned chamfered tube cut.  The 2D shape (rounded rectangle)
// lies on the XY plane centred at origin.  The cut runs from z=0 to z=depth.
// Both ends have a 45-deg chamfer of size `chamfer` that EXPANDS the opening
// outward, mirroring the chamfered frame opening from the 2-filter design.
module tower_chamfered_opening_cut(w, h, depth, chamfer) {
    if (chamfer > 0 && depth > 2 * chamfer) {
        // Entry chamfer: oversized at z=0 -> normal at z=chamfer
        hull() {
            linear_extrude(0.01) tower_opening_2d(w, h, chamfer);
            translate([0, 0, chamfer])
                linear_extrude(0.01) tower_opening_2d(w, h);
        }
        // Straight middle
        translate([0, 0, chamfer])
            linear_extrude(depth - 2 * chamfer)
                tower_opening_2d(w, h);
        // Exit chamfer: normal at z=depth-chamfer -> oversized at z=depth
        hull() {
            translate([0, 0, depth - chamfer])
                linear_extrude(0.01) tower_opening_2d(w, h);
            translate([0, 0, depth - 0.01])
                linear_extrude(0.01) tower_opening_2d(w, h, chamfer);
        }
    } else {
        // No chamfer (or depth too small) -- straight cut
        linear_extrude(depth) tower_opening_2d(w, h);
    }
}

// Air opening (one per side), rounded-corner + chamfered, cut through a
// depth range along the wall normal.  Used both for the OUTER WALL cut
// (depth_lo, depth_hi span the outer wall thickness) and for the INNER
// FLANGE cut (span the inner flange thickness).  Rotate-and-translate
// pattern: build the cut as a Z-extruded tube and rotate so its Z axis
// aligns with the wall's outward normal.
module tower_side_opening(side, depth_lo, depth_hi) {
    w     = X - 2 * Rim;
    h     = Y - 2 * Rim;
    depth = depth_hi - depth_lo;
    cz    = bp_thk + Y / 2;          // vertical centre of opening
    if (side == "front")
        translate([box_x / 2, depth_lo + depth, cz])
            rotate([90, 0, 0])
                tower_chamfered_opening_cut(w, h, depth, cf);
    else if (side == "back")
        translate([box_x / 2, box_y - depth_lo - depth, cz])
            rotate([-90, 0, 0])
                tower_chamfered_opening_cut(w, h, depth, cf);
    else if (side == "left")
        translate([depth_lo + depth, box_y / 2, cz])
            rotate([0, -90, 0])
                // (h,w) swap: after rotate the 2D X axis becomes world +Z
                // (vertical) and the 2D Y axis becomes world +Y (wall-long
                // axis), so we pass (h, w) instead of (w, h).
                tower_chamfered_opening_cut(h, w, depth, cf);
    else if (side == "right")
        translate([box_x - depth_lo - depth, box_y / 2, cz])
            rotate([0, 90, 0])
                tower_chamfered_opening_cut(h, w, depth, cf);
}

// Filter pocket cut-out (one per filter) -- the slot in which a filter
// sits between the outer wall (oft thick) and the inner flange (t thick).
//   Front filter pocket: x in [ofs, box_x-ofs], y in [oft, oft+fh].
module tower_filter_pocket(side) {
    z_lo = bp_thk - eps;
    h    = h_box - bp_thk - tp_thk + 2 * eps;
    if (side == "front")
        translate([ofs, oft, z_lo]) cube([box_x - 2 * ofs, fh, h]);
    else if (side == "back")
        translate([ofs, box_y - oft - fh, z_lo])
            cube([box_x - 2 * ofs, fh, h]);
    else if (side == "left")
        translate([oft, ofs, z_lo]) cube([fh, box_y - 2 * ofs, h]);
    else if (side == "right")
        translate([box_x - oft - fh, ofs, z_lo])
            cube([fh, box_y - 2 * ofs, h]);
}

// Whole 4-filter tower: start from a solid chamfered prism the full box
// size with the big Corner_post_chamfer cut at each outer corner.  The
// chamfer cuts through everything at the corner -- outer wall + corner
// post material -- producing a single seamless chamfered face at each of
// the 4 outer corners.  Then carve out the air chamber, 4 filter pockets,
// 4 outer-wall air openings, 4 inner-flange air openings, the top fan
// grid, and the top filter-loading slots.
module assembly_tower() {
    color("Gainsboro") difference() {
        chamfered_prism(box_x, box_y, h_box, Corner_post_chamfer);
        // Air chamber (between the inner flange faces, between the plates)
        translate([air_x_min, air_y_min, bp_thk - eps])
            cube([air_x_max - air_x_min, air_y_max - air_y_min,
                  h_box - bp_thk - tp_thk + 2 * eps]);
        // 4 filter pockets
        for (s = [ "front", "back", "left", "right" ])
            tower_filter_pocket(s);
        // 4 outer-wall air openings (cut from outside, through the oft wall)
        for (s = [ "front", "back", "left", "right" ])
            tower_side_opening(s, -eps, oft + eps);
        // 4 inner-flange air openings (cut through the t-thick inner flange
        // which sits at y in [oft+fh, oft+fh+t] = [oft+fh, ofs] on each side).
        // We start the cut eps *inside* the filter pocket cube so the two
        // cuts overlap at y = oft+fh; without this overlap, a zero-thickness
        // material layer would remain at the boundary and CGAL would render
        // it as a closed face -- which is exactly the "inner flange is
        // closed off" failure mode.
        for (s = [ "front", "back", "left", "right" ])
            tower_side_opening(s, oft + fh - eps, ofs + eps);
        // Top plate cut-outs
        tower_fan_grid();
        tower_filter_slots();
    }
}


// ============================================================================
//   ASSEMBLY (the whole box -- everything unioned together)
// ============================================================================
// Top-level dispatcher: picks the geometry for the selected Filters mode.
module assembly() {
    if (Filters == 4) assembly_tower();
    else              assembly_horizontal();
}

// --- 1 / 2 filter (horizontal) layout -- the original design --------------
module assembly_horizontal() {
    // Bottom face: frame for 2-filter case, solid plate for 1-filter case.
    color("Gainsboro") {
        if (Filters == 2) frame_panel();
        else              plate_panel();
    }

    // Top frame (z = h_box - frame_thickness .. h_box)
    color("Gainsboro")
        translate([0, 0, h_box - frame_thickness]) frame_panel();

    // Inner flange(s) -- positions depend on filter count.
    //   1 filter:  flange BELOW the (top) filter only.
    //   2 filters: flange ABOVE the bottom filter + BELOW the top filter.
    // Outer footprint = full box (chamfered), placed at world origin so the
    // flange edges fuse seamlessly with the walls -- no triangular gaps.
    color("DimGray") {
        if (Filters == 1) {
            translate([0, 0, flange_below_z(0)]) flange_panel();
        } else {
            translate([0, 0, flange_above_z(0)]) flange_panel();
            translate([0, 0, flange_below_z(1)]) flange_panel();
        }
    }

    // 4 side walls (sit BETWEEN the two frames).
    color("LightSteelBlue") {
        translate([0, 0, frame_thickness])
            wall(box_x, Fans_top, Slot_wall == "top");
        translate([box_x, box_y, frame_thickness]) rotate([0, 0, 180])
            wall(box_x, Fans_bottom, Slot_wall == "bottom");
        translate([0, box_y, frame_thickness]) rotate([0, 0, -90])
            wall(box_y, Fans_left, Slot_wall == "left");
        translate([box_x, 0, frame_thickness]) rotate([0, 0, 90])
            wall(box_y, Fans_right, Slot_wall == "right");
    }
}

// --- 4-filter tower layout ------------------------------------------------
// The actual tower geometry lives in assembly_tower() defined in the
// "TOWER (Filters=4) GEOMETRY" section above; this stub left blank
// intentionally.


// ============================================================================
//   CORD-HOLE CYLINDER
//   Wall = front / back / left / right (which wall it pierces).
//   Side = left / center / right (where along that wall, viewed from OUTSIDE).
//     - "center" puts the hole on the wall midline.
//     - "left"   puts the hole Cord_hole_corner_offset in from the LEFT corner
//                of the wall as seen from outside.
//     - "right"  puts it the same distance from the RIGHT corner.
//   "Left" and "right" refer to the viewer's left/right when facing the wall
//   from OUTSIDE the box.
// ============================================================================

// Compute the position-along-the-wall (in world coords for the wall's
// long axis) for the chosen side.
function cord_pos_along(L, side, off) =
      (side == "center") ? L / 2
    : (side == "left")   ? off
    :                      L - off;   // "right"

// (world_x, world_y) of the cord-hole centre for each wall.
// "left"/"right" semantics, as seen from OUTSIDE:
//   FRONT wall (y=0):     looking +Y; viewer's LEFT  = world +X large? NO --
//                         looking toward +Y, viewer's LEFT is at world -X,
//                         so LEFT corner = world x=box_x, RIGHT = world x=0.
//                         BUT users intuitively read it as "left = world x=0"
//                         when looking at a plan view from above.  We use the
//                         plan-view convention: LEFT = low world-X for front/
//                         back walls, LEFT = low world-Y for left/right walls.
//                         (i.e., the corner nearer the +0 origin of the wall's
//                         long axis.)

module cord_hole_cylinder() {
    if (Filters == 4) cord_hole_cylinder_tower();
    else              cord_hole_cylinder_horizontal();
}

// 1/2-filter cord hole: horizontal cylinder through one side wall,
// vertically centred on the box (fan-chamber midline).
module cord_hole_cylinder_horizontal() {
    cz   = h_box / 2;
    off  = max(Cord_hole_diameter / 2 + t + 1, Cord_hole_corner_offset);

    if (Cord_hole_wall == "front") {
        cx = cord_pos_along(box_x, Cord_hole_side, off);
        translate([cx, -0.5, cz])
            rotate([-90, 0, 0])
                cylinder(d = Cord_hole_diameter, h = t + 1);
    } else if (Cord_hole_wall == "back") {
        cx = cord_pos_along(box_x, Cord_hole_side, off);
        translate([cx, box_y + 0.5, cz])
            rotate([90, 0, 0])
                cylinder(d = Cord_hole_diameter, h = t + 1);
    } else if (Cord_hole_wall == "left") {
        cy = cord_pos_along(box_y, Cord_hole_side, off);
        translate([-0.5, cy, cz])
            rotate([0, 90, 0])
                cylinder(d = Cord_hole_diameter, h = t + 1);
    } else if (Cord_hole_wall == "right") {
        cy = cord_pos_along(box_y, Cord_hole_side, off);
        translate([box_x + 0.5, cy, cz])
            rotate([0, -90, 0])
                cylinder(d = Cord_hole_diameter, h = t + 1);
    }
}

// 4-filter cord hole: VERTICAL cylinder through the top plate at one of
// the 4 corners.  The corner is picked from Cord_hole_wall + Cord_hole_side:
//   wall=front/back picks the Y end (low/high); side adds the X end
//   wall=left/right picks the X end; side adds the Y end
// Either way you can reach all 4 corners.  Cord_hole_corner_offset (clamped
// to a safe minimum) sets the distance from the corner.
module cord_hole_cylinder_tower() {
    // The cord hole must drop the cord into the open AIR CHAMBER below the
    // top plate -- NOT through a solid corner post (which is solid material
    // all the way down to the bottom plate).  So we measure the corner
    // offset from the AIR CHAMBER corner (= corner post's inner corner)
    // instead of the box outer corner.  Offset is clamped to keep the hole
    // a few mm inside the air-chamber edge.
    off = max(Cord_hole_diameter / 2 + 2, Cord_hole_corner_offset);
    cx  = ((Cord_hole_wall == "right") ||
           ((Cord_hole_wall == "front" || Cord_hole_wall == "back")
              && Cord_hole_side == "right"))
          ? air_x_max - off : air_x_min + off;
    cy  = ((Cord_hole_wall == "back") ||
           ((Cord_hole_wall == "left" || Cord_hole_wall == "right")
              && Cord_hole_side == "right"))
          ? air_y_max - off : air_y_min + off;
    translate([cx, cy, h_box - tp_thk - eps])
        cylinder(d = Cord_hole_diameter, h = tp_thk + 2 * eps);
}


// ============================================================================
//   ALIGNMENT PINS  (chunk-seam dowel holes for COTS pins)
//
// Strategy: pins are placed AT the centreline of each wall/frame/flange piece
// (not on a global box grid), so candidates always land inside material even
// though the walls are only 5 mm thick.  Each candidate is a 2*Pin_hole_depth
// cylinder centred on the seam, axis perpendicular to the seam plane.  We
// then subtract the fan-body envelope so we never drill through the hex grill
// or fan opening.
// ============================================================================

// Evenly-spaced positions inside an axis range [lo, hi].
//   width < s   -> 1 pin at the centre
//   width >= s  -> floor(width / s) pins, evenly distributed (actual spacing
//                  = width / n, slightly < s when the rim isn't an exact
//                  multiple of s)
function rim_positions(lo, hi, s) =
    let (w = hi - lo,
         n = (w <= 0) ? 0 : max(1, floor(w / s)),
         step = (n > 0) ? w / n : 0)
        (n == 0) ? [] : [ for (i = [0 : n - 1]) lo + (i + 0.5) * step ];

// Cylinders covering every fan body (d = Fan_diameter, axis perpendicular
// to its wall).  Subtracted from pin_candidates so no pin lands on the hex
// grill / fan window.
module fan_body_zones() {
    module one_wall(L, fans_n) {
        for (fx = fan_positions(fans_n, L))
            translate([fx, -1, fan_posy_local(hw)])
                rotate([-90, 0, 0])
                    cylinder(d = Fan_diameter, h = t + 2);
    }
    translate([0, 0, frame_thickness])
        one_wall(box_x, Fans_top);
    translate([box_x, box_y, frame_thickness]) rotate([0, 0, 180])
        one_wall(box_x, Fans_bottom);
    translate([0, box_y, frame_thickness]) rotate([0, 0, -90])
        one_wall(box_y, Fans_left);
    translate([box_x, 0, frame_thickness]) rotate([0, 0, 90])
        one_wall(box_y, Fans_right);
}

// Midlines of horizontal pieces (1/2-filter mode) that have an AIR OPENING in
// the middle -- pins must be restricted to the rim around the opening.
//   Top frame: always has opening
//   Bottom frame: has opening for Filters=2 only
//   Each inner flange: always has opening
function frame_midlines_opening() =
    concat(
        [ h_box - frame_thickness / 2 ],
        (Filters == 2) ? [ frame_thickness / 2 ] : [],
        (Filters == 1)
            ? [ flange_below_z(0) + fl / 2 ]
            : [ flange_above_z(0) + fl / 2,
                flange_below_z(1) + fl / 2 ]
    );

// Midlines of horizontal pieces that are SOLID (no opening) -- pins can be
// placed anywhere in the plate.  For Filters=1 the bottom is a solid plate;
// for Filters=2 both frames have openings (no solid plate).
function plate_midlines_solid() =
    (Filters == 1) ? [ frame_thickness / 2 ] : [];

// Top-level pin candidate dispatcher.
module pin_candidates() {
    if (Filters == 4) pin_candidates_tower();
    else              pin_candidates_horizontal();
}

// All candidate pin cylinders for 1/2-filter (horizontal) mode.  Pins are
// placed AT wall / frame / flange centrelines so they're guaranteed to be
// inside material.
module pin_candidates_horizontal() {
    nx  = n_chunks_x();
    ny  = n_chunks_y();
    nz  = n_chunks_z();
    csx = chunk_size_x();
    csy = chunk_size_y();
    csz = chunk_size_z();
    len = 2 * Pin_hole_depth;
    s   = Pin_spacing;

    // ----- X-SEAMS : pin axis = +X -----
    if (nx > 1) for (i = [1 : nx - 1]) {
        xs = i * csx;

        // Front + back walls: pin centred at the wall's Y midline, stepped
        // by Pin_spacing along the wall's height (Z).
        for (wy = [ t / 2, box_y - t / 2 ])
            for (gz = rim_positions(frame_thickness, h_box - frame_thickness, s))
                translate([xs - Pin_hole_depth, wy, gz])
                    rotate([0, 90, 0])
                        cylinder(d = Pin_diameter, h = len);

        // Horizontal pieces WITH an opening -- pins only in the rim.
        for (fz = frame_midlines_opening()) {
            for (gy = rim_positions(t, Rim, s))
                translate([xs - Pin_hole_depth, gy, fz])
                    rotate([0, 90, 0])
                        cylinder(d = Pin_diameter, h = len);
            for (gy = rim_positions(box_y - Rim, box_y - t, s))
                translate([xs - Pin_hole_depth, gy, fz])
                    rotate([0, 90, 0])
                        cylinder(d = Pin_diameter, h = len);
        }

        // SOLID plates (1-filter bottom) -- pins span the full plate width.
        for (fz = plate_midlines_solid())
            for (gy = rim_positions(t, box_y - t, s))
                translate([xs - Pin_hole_depth, gy, fz])
                    rotate([0, 90, 0])
                        cylinder(d = Pin_diameter, h = len);
    }

    // ----- Y-SEAMS : pin axis = +Y -----
    if (ny > 1) for (j = [1 : ny - 1]) {
        ys = j * csy;

        for (wx = [ t / 2, box_x - t / 2 ])
            for (gz = rim_positions(frame_thickness, h_box - frame_thickness, s))
                translate([wx, ys - Pin_hole_depth, gz])
                    rotate([-90, 0, 0])
                        cylinder(d = Pin_diameter, h = len);

        for (fz = frame_midlines_opening()) {
            for (gx = rim_positions(t, Rim, s))
                translate([gx, ys - Pin_hole_depth, fz])
                    rotate([-90, 0, 0])
                        cylinder(d = Pin_diameter, h = len);
            for (gx = rim_positions(box_x - Rim, box_x - t, s))
                translate([gx, ys - Pin_hole_depth, fz])
                    rotate([-90, 0, 0])
                        cylinder(d = Pin_diameter, h = len);
        }

        for (fz = plate_midlines_solid())
            for (gx = rim_positions(t, box_x - t, s))
                translate([gx, ys - Pin_hole_depth, fz])
                    rotate([-90, 0, 0])
                        cylinder(d = Pin_diameter, h = len);
    }

    // ----- Z-SEAMS : pin axis = +Z -----
    if (nz > 1) for (k = [1 : nz - 1]) {
        zs = k * csz;
        for (wy = [ t / 2, box_y - t / 2 ])
            for (gx = rim_positions(0, box_x, s))
                translate([gx, wy, zs - Pin_hole_depth])
                    cylinder(d = Pin_diameter, h = len);
        for (wx = [ t / 2, box_x - t / 2 ])
            for (gy = rim_positions(t, box_y - t, s))
                translate([wx, gy, zs - Pin_hole_depth])
                    cylinder(d = Pin_diameter, h = len);
    }
}

// All candidate pin cylinders for 4-filter (tower) mode.  Pins are placed in
// the outer wall, top + bottom plates, inner flange segments, and corner
// posts.
module pin_candidates_tower() {
    nx  = n_chunks_x();
    ny  = n_chunks_y();
    nz  = n_chunks_z();
    csx = chunk_size_x();
    csy = chunk_size_y();
    csz = chunk_size_z();
    len = 2 * Pin_hole_depth;
    s   = Pin_spacing;
    // Wall-height range (between plates) used by side-wall and flange pins.
    wz_lo = bp_thk;
    wz_hi = h_box - tp_thk;

    // ----- X-SEAMS : pin axis = +X -----
    if (nx > 1) for (i = [1 : nx - 1]) {
        xs = i * csx;

        // Front + back outer walls (oft thick), at Y centreline.
        for (wy = [ oft / 2, box_y - oft / 2 ])
            for (gz = rim_positions(wz_lo, wz_hi, s))
                translate([xs - Pin_hole_depth, wy, gz])
                    rotate([0, 90, 0])
                        cylinder(d = Pin_diameter, h = len);

        // Front + back inner flange segments (t thick), at Y centreline.
        for (wy = [ oft + fh + t / 2, box_y - oft - fh - t / 2 ])
            for (gz = rim_positions(wz_lo, wz_hi, s))
                translate([xs - Pin_hole_depth, wy, gz])
                    rotate([0, 90, 0])
                        cylinder(d = Pin_diameter, h = len);

        // Bottom plate (solid) at its midline -- pins span full Y width.
        for (gy = rim_positions(t, box_y - t, s))
            translate([xs - Pin_hole_depth, gy, bp_thk / 2])
                rotate([0, 90, 0])
                    cylinder(d = Pin_diameter, h = len);

        // Top plate at its midline -- pins only in the two side "rim" strips
        // outside the filter-slot Y-ranges and outside the fan grid.  Easy
        // safe zone: the 5 mm-wide strip between corner post and inner flange
        // (y in [oft, ofs] = [10, 60]) is OUTSIDE both slot and fans.  And
        // similarly [box_y-ofs, box_y-oft] = [555, 605].
        for (gy = rim_positions(oft, ofs, s))
            translate([xs - Pin_hole_depth, gy, h_box - tp_thk / 2])
                rotate([0, 90, 0])
                    cylinder(d = Pin_diameter, h = len);
        for (gy = rim_positions(box_y - ofs, box_y - oft, s))
            translate([xs - Pin_hole_depth, gy, h_box - tp_thk / 2])
                rotate([0, 90, 0])
                    cylinder(d = Pin_diameter, h = len);
    }

    // ----- Y-SEAMS : pin axis = +Y (mirror of X-seams) -----
    if (ny > 1) for (j = [1 : ny - 1]) {
        ys = j * csy;

        for (wx = [ oft / 2, box_x - oft / 2 ])
            for (gz = rim_positions(wz_lo, wz_hi, s))
                translate([wx, ys - Pin_hole_depth, gz])
                    rotate([-90, 0, 0])
                        cylinder(d = Pin_diameter, h = len);

        for (wx = [ oft + fh + t / 2, box_x - oft - fh - t / 2 ])
            for (gz = rim_positions(wz_lo, wz_hi, s))
                translate([wx, ys - Pin_hole_depth, gz])
                    rotate([-90, 0, 0])
                        cylinder(d = Pin_diameter, h = len);

        for (gx = rim_positions(t, box_x - t, s))
            translate([gx, ys - Pin_hole_depth, bp_thk / 2])
                rotate([-90, 0, 0])
                    cylinder(d = Pin_diameter, h = len);

        for (gx = rim_positions(oft, ofs, s))
            translate([gx, ys - Pin_hole_depth, h_box - tp_thk / 2])
                rotate([-90, 0, 0])
                    cylinder(d = Pin_diameter, h = len);
        for (gx = rim_positions(box_x - ofs, box_x - oft, s))
            translate([gx, ys - Pin_hole_depth, h_box - tp_thk / 2])
                rotate([-90, 0, 0])
                    cylinder(d = Pin_diameter, h = len);
    }

    // ----- Z-SEAMS : pin axis = +Z -----
    // Vertical pieces (walls + corner posts + inner flange segments) have
    // plenty of Z extent for a 10 mm-deep hole on each side.
    if (nz > 1) for (k = [1 : nz - 1]) {
        zs = k * csz;

        // Front + back outer walls (along X).
        for (wy = [ oft / 2, box_y - oft / 2 ])
            for (gx = rim_positions(0, box_x, s))
                translate([gx, wy, zs - Pin_hole_depth])
                    cylinder(d = Pin_diameter, h = len);

        // Left + right outer walls (along Y, between front/back).
        for (wx = [ oft / 2, box_x - oft / 2 ])
            for (gy = rim_positions(oft, box_y - oft, s))
                translate([wx, gy, zs - Pin_hole_depth])
                    cylinder(d = Pin_diameter, h = len);

        // Inner flange segments (front/back along X, left/right along Y).
        for (wy = [ oft + fh + t / 2, box_y - oft - fh - t / 2 ])
            for (gx = rim_positions(ofs, box_x - ofs, s))
                translate([gx, wy, zs - Pin_hole_depth])
                    cylinder(d = Pin_diameter, h = len);
        for (wx = [ oft + fh + t / 2, box_x - oft - fh - t / 2 ])
            for (gy = rim_positions(ofs, box_y - ofs, s))
                translate([wx, gy, zs - Pin_hole_depth])
                    cylinder(d = Pin_diameter, h = len);

        // 4 corner posts -- 1 pin each, placed just inside the inner corner
        // (away from both the chamfered outer corner and the air chamber).
        pin_xy = ofs - t;
        for (cx = [ pin_xy, box_x - pin_xy ])
            for (cy = [ pin_xy, box_y - pin_xy ])
                translate([cx, cy, zs - Pin_hole_depth])
                    cylinder(d = Pin_diameter, h = len);
    }
}

// Final pin holes = candidates with fan-body cylinders cut out, so no pin
// punches through the hex grill or the fan window.
module pin_holes() {
    if (Pin_diameter > 0 && Pin_hole_depth > 0 && Pin_spacing > 0
        && (n_chunks_x() > 1 || n_chunks_y() > 1 || n_chunks_z() > 1)) {
        difference() {
            pin_candidates();
            fan_body_zones();
        }
    }
}


// ============================================================================
//   FINAL MODEL (assembly with cord pass-through + alignment pins subtracted)
// ============================================================================
module final_model() {
    difference() {
        assembly();
        union() {
            if (Cord_hole_diameter > 0 && Cord_hole_wall != "none")
                cord_hole_cylinder();
            pin_holes();
        }
    }
}


// ============================================================================
//   ONE PRINT CHUNK (intersect final assembly with a chunk-sized cube)
// ============================================================================
module print_chunk(ix, iy, iz) {
    nx = n_chunks_x();
    ny = n_chunks_y();
    nz = n_chunks_z();
    six = max(0, min(ix, nx - 1));
    siy = max(0, min(iy, ny - 1));
    siz = max(0, min(iz, nz - 1));

    csx = chunk_size_x();
    csy = chunk_size_y();
    csz = chunk_size_z();

    cx = six * csx;
    cy = siy * csy;
    cz = siz * csz;

    if (Chunk_to_origin) {
        translate([-cx, -cy, -cz])
            intersection() {
                final_model();
                translate([cx, cy, cz])
                    cube([csx, csy, csz]);
            }
    } else {
        intersection() {
            final_model();
            translate([cx, cy, cz])
                cube([csx, csy, csz]);
        }
    }
}


// ============================================================================
//   RENDER DISPATCHER
// ============================================================================
module render_dispatcher() {
    if      (Render_part == "assembly") final_model();
    else if (Render_part == "chunk")    print_chunk(Chunk_ix, Chunk_iy, Chunk_iz);
    else                                final_model();
}


// Chunk-grid summary on every render so the user knows the index range.
echo("FILTER outer:     ", X, "x", Y, "x", fh, "mm");
echo("BOX outer:        ", box_x, "x", box_y, "x", h_box, "mm");
echo("Wall thickness:   ", t, "mm; outside flange thickness: ", oft, "mm");
echo("Bed:              ", Bed_x, "x", Bed_y, "x", Bed_z, "mm");
echo("Chunk grid:       ", n_chunks_x(), "x ", n_chunks_y(), "x ", n_chunks_z(),
     "= ", n_chunks_x() * n_chunks_y() * n_chunks_z(), "chunks total");
echo("Chunk size:       ", chunk_size_x(), "x", chunk_size_y(), "x", chunk_size_z(), "mm");
echo("Fan corner min:   ", fan_corner_safe_min(),
     "mm  (min first/last fan centre from corner for ",
     Fan_diameter, "mm fans, ", fan_body_depth(Fan_diameter), "mm body)");
echo("Max fans / wall:  F/B=", max_fans(box_x), " L/R=", max_fans(box_y));
echo("Fan positions:    F=", fan_positions(Fans_top,   box_x),
                      " B=", fan_positions(Fans_bottom, box_x),
                      " L=", fan_positions(Fans_left,   box_y),
                      " R=", fan_positions(Fans_right,  box_y));
echo("Cord hole:        wall=", Cord_hole_wall, " side=", Cord_hole_side,
     " corner-offset=", Cord_hole_corner_offset, "mm  cz=", h_box / 2,
     "mm (box vertical centre)");
echo("Alignment pins:   d=", Pin_diameter, "mm  hole-depth=", Pin_hole_depth,
     "mm/side  total=", 2 * Pin_hole_depth, "mm  spacing=", Pin_spacing, "mm");
echo("Current chunk:    ix=", Chunk_ix, " iy=", Chunk_iy, " iz=", Chunk_iz);


render_dispatcher();
