# Printer Bed And Model Reference

Research date: 2026-04-30

This note records the first pass on printable-air-filter references and common 3D printer build volumes. The downloaded third-party files live under `references/external-models/` locally and are intentionally git-ignored because they are large binary/reference artifacts with separate licenses.

## Recommended Bed Presets

These are the presets worth exposing in the UI before a fully custom print-volume option.

| Preset | Print volume | Representative printers | Why it matters |
| --- | ---: | --- | --- |
| Mini | 180 x 180 x 180 mm | Bambu Lab A1 mini, Original Prusa MINI+ | Small classroom/home printers. Forces aggressive splitting. |
| Ender common | 220 x 220 x 240 mm | Creality Ender-3 V3 KE, Sovol SV06 class | The safest common low-cost FDM target. |
| 225 plate | 225 x 225 x 265 mm | Elegoo Neptune 4 Pro | Close to Ender, but common enough to keep if we support exact-fit placement. |
| Prusa MK | 250 x 210 x 220 mm | Original Prusa MK4S | Important because Y is the limiting axis, not X. |
| Bambu standard | 256 x 256 x 256 mm | Bambu Lab A1, P1S/P1P, X1 Carbon/X1E | The most useful default for modern enclosed and AMS-capable printers. |
| Medium cube | 300 x 300 x 300 mm | Creality K1 Max class | Useful for fewer seams without requiring very large printers. |
| H2 safe | 320 x 320 x 325 mm | Bambu Lab H2D/H2S family safe bucket | Conservative bucket for the H2D single-nozzle and H2S volumes. H2D dual-nozzle printing is narrower on X. |
| Large enclosed | 350 x 350 x 350 mm | Creality K2 Plus, Sovol SV08 class | Big enough to reduce most wall splitting. |
| Prusa XL | 360 x 360 x 360 mm | Original Prusa XL | Large, high-quality multi-tool user base. |
| Large format | 420 x 420 x 480 mm | Elegoo Neptune 4 Max, Anycubic Kobra 3 Max class | Lets the generator produce very large pieces, but should still offer split parts for reliability. |

Default recommendation: keep `256 x 256 x 256 mm` as the default print preset. It covers the Bambu A/P/X family, and community purifier designs commonly target a 256 mm plate while warning that larger panels leave little skirt room.

## Downloaded References

### MakerWorld 2470181 - Nukit Tempest Euro Frame Air Purifier (STARKVIND)

Source: https://makerworld.com/en/models/2470181-nukit-tempest-euro-frame-air-purifier-starkvind

Local metadata: `references/external-models/makerworld-2470181-nukit-tempest-starkvind-next-data.json`

The model page was reachable, but the raw STL download was not available anonymously. The page metadata names `PURIFIER_Tempest_Euro_FRAME.stl` as a 10,622,584 byte STL, with an empty `modelUrl`.

Important design notes from the page metadata:

- Printable adaptation of Nukit Tempest Euro for 2 IKEA STARKVIND HEPA filters.
- Uses 4 140 mm fans as exhaust.
- Straight FDM adaptation of the laser-cut design, not a redesign.
- Large faces are split for typical printer volumes.
- Split panels do not include mechanical alignment or connection features; the page recommends soldering, 3D pen welding, shim plates, epoxy, or adhesive.
- License shown in metadata: `BY-NC`.

Integration consequence: use this as a design reference, but do not copy geometry into the app without explicit permission and license review. Our generator should improve on the seam problem by generating dovetails, keyed laps, screw tabs, or spline pockets.

### Printables 610219 - Modular 20x20 Air Filter

Source: https://www.printables.com/model/610219-modular-20x20-air-filter

Local archive: `references/external-models/printables-610219-modular-20x20-air-filter.zip`

Downloaded bundle contents:

- Corner bracket with cord pass-through.
- Blank piece.
- Corner bracket.
- Connector.
- 140 mm fan bracket.
- PDF documentation.

Important design notes:

- Modular frame for 20x20x1 MERV 13 filters.
- Variable fan count up to 8 140 mm fans.
- Bill of materials is based on corner brackets, connectors, fan brackets, and blanks.
- License shown on page: Creative Commons BY-NC-SA 4.0.

Integration consequence: the module grammar is useful, but the non-commercial/share-alike license makes direct geometry reuse risky for this project unless we intentionally accept those license terms or get permission.

### Nukit Open Upper Room UVGI OpenSCAD Reference

Source: https://github.com/opennukit/Nukit-Open-Upper-Room-UVGI/tree/main/3D%20Printed

Local clone: `references/external-models/Nukit-Open-Upper-Room-UVGI`

Current local commit: `cfe1da3 Update README.md`

Relevant files:

- `3D Printed/Nukit Open UR-UVGI-3DP.scad`
- `3D Printed/quickthread.scad`
- FDM STL outputs targeting `220x220x220`.
- Resin STL outputs targeting `120x120x120`.

Integration consequence: this is the best source for the repo's OpenSCAD style and parameterization, but the geometry domain is UVGI rather than filter boxes.

## Printer Volume Sources

Bambu Lab:

- A1 mini: official specs list `180 x 180 x 180 mm`.
- A1: official specs list `256 x 256 x 256 mm`.
- P1S/P1P/X1 family: official specs list `256 x 256 x 256 mm`.
- H2D: official specs list `325 x 320 x 325 mm` for single-nozzle printing, `300 x 320 x 325 mm` for dual-nozzle printing, and `350 x 320 x 325 mm` total volume for both nozzles.
- H2S: official specs list `340 x 320 x 340 mm`.

Prusa:

- Original Prusa MINI+: `180 x 180 x 180 mm`.
- Original Prusa MK4S: `250 x 210 x 220 mm`.
- Original Prusa CORE One: `250 x 220 x 270 mm`.
- Original Prusa XL: `360 x 360 x 360 mm`.

Creality:

- Ender-3 V3 SE: `220 x 220 x 250 mm`.
- Ender-3 V3 KE: `220 x 220 x 240 mm`.
- K1: `220 x 220 x 250 mm`.
- K1 Max: `300 x 300 x 300 mm`.
- K2 Plus: `350 x 350 x 350 mm`.

Anycubic:

- Kobra 3: `250 x 250 x 260 mm`.
- Kobra 3 Max: `420 x 420 x 500 mm`.

Elegoo:

- Neptune 4 Pro: `225 x 225 x 265 mm`.
- Neptune 4 Max: `420 x 420 x 480 mm`.

Sovol:

- SV06 class: `220 x 220 x 250 mm`.
- SV08 class: `350 x 350 x 345 mm`.

## Source Links

Printer specs:

- Bambu A1 mini: https://us.store.bambulab.com/products/a1-mini
- Bambu A1: https://us.store.bambulab.com/en/products/a1
- Bambu P1S quick-start/spec PDF: https://cdn1.bambulab.com/documentation/quick-start-59b0cefdc0fc4/P1S/English%20version-Quick%20Start%20Guide%20for%20P1S.pdf
- Bambu X1 Carbon tech spec PDF: https://public-cdn.bambulab.com/store/bambulab-X1-carbon-tech-specs.pdf
- Bambu H2D product page: https://us.store.bambulab.com/products/h2d
- Bambu H2S product page: https://us.store.bambulab.com/products/h2s
- Prusa MK4S: https://www.prusa3d.com/product/original-prusa-mk4s-3d-printer-kit/
- Prusa CORE One: https://www.prusa3d.com/en/product/prusa-core-one-kit/
- Prusa XL: https://www.prusa3d.com/en/product/original-prusa-xl-7/
- Prusa MINI+: https://www.prusa3d.com/product/original-prusa-mini-2/
- Creality Ender-3 V3 series comparison: https://www.creality.com/compare/compare-ender-3-v3-series
- Creality K1 Max: https://store.creality.com/products/k1-max-3d-printer
- Creality K2 series buying guide: https://www.creality.com/campaigns/k2-series-buying-guide
- Anycubic Kobra 3: https://store.anycubic.com/collections/3d-printers/products/anycubic-kobra-3
- Anycubic Kobra 3 Max: https://store.anycubic.com/products/kobra-3-max
- Elegoo Neptune 4 Pro: https://www.elegoo.com/en-gb/products/elegoo-neptune-4-pro-fdm-3d-printer
- Elegoo Neptune 4 Max: https://www.elegoo.com/en-gb/collections/elegoo-product-ex-s4/products/neptune-4-max-fdm-3d-printer
- Sovol SV06: https://www.sovol3d.com/products/sovol-sv06-best-budget-3d-printer-for-beginner
- Sovol SV08: https://www.sovol3d.com/products/sovol-sv08-3d-printer

Model references:

- MakerWorld 2470181: https://makerworld.com/en/models/2470181-nukit-tempest-euro-frame-air-purifier-starkvind
- Printables 610219: https://www.printables.com/model/610219-modular-20x20-air-filter
- Nukit Open Upper Room UVGI OpenSCAD folder: https://github.com/opennukit/Nukit-Open-Upper-Room-UVGI/tree/main/3D%20Printed

## Product Direction

The browser app should cover two fabrication modes:

1. Laser cut mode: current SVG export and assembled 3D preview.
2. 3D print mode: generated plates/parts for selected printer volume, exported as 3MF.

The 3D print mode should not just thicken laser-cut panels. It should generate FDM-native parts:

- Split panels by the selected printer volume.
- Add positive alignment features at splits.
- Add screw, dovetail, keyed-lap, or spline connectors.
- Add filter gasket/seal allowances.
- Add fan brackets as separate reusable modules where practical.
- Produce a plate manifest with part names, quantities, and print orientation.

The next implementation step is to turn the preset table above into explicit `PrinterVolumePreset` data in the app and make the 3MF export choose splits from that preset rather than the current small fixed set.
