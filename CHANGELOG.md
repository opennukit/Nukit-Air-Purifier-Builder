# Changelog — `port-tempest-features`

All changes on this branch since `main`, grouped by area. The complete
commit-by-commit list is in the Appendix at the bottom. Every change is
committed; the build (`bun run build`) and full test suite (`bun test`, 210
tests) pass.

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
- Verified the generated cut sheet matches the reference `AirPurifier.svg`.

## 3D preview / assembly
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
- Laser drawing export buttons disabled and relabelled "Export Disabled".
- Number inputs no longer crop their value (spinners removed, min widths added).

## Filter size presets
- Expanded the "Filter size" dropdown to the full catalog (STARKVIND, FORNUFTIG,
  and the standard 16/20/24-inch sizes) with mm-accurate dimensions.

## 3D Print (Tempest) design presets
- Added design presets: Nukit Tempest Euro, Euro Cube, Original, Original Cube,
  and Pro (each applies its full filter/fan/box configuration).

## 3D Print controls & geometry (earlier work)
- Hex grill, cord pass-through (wall/side/offset), Box/Exhaust fan option with
  auto-sized rings, per-wall fan controls, Filter slot placement.
- Two-column Advanced accordion with tooltips; millimetres everywhere (no mm/in
  toggle); whole-mm filter dimensions; width/length swap button.

## Print kit / 3MF
- Export the print kit as one 3MF per chunk in a ZIP; auto-orient chunks on the
  bed; tower alignment pins fixed; chunk/seam matching codes (currently parked).

---

## Appendix — full commit list (newest first)
```
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
