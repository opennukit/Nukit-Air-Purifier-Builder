# Nukit Open Air Purifier Builder

Browser-based builder for DIY clean-air purifier designs. Enter a few filter and fan measurements and it produces a live 3D preview, ready-to-fabricate files, and a parts list, all from explicit parametric models.

**Live app: [filterboxbuilder.com](https://filterboxbuilder.com)**

![FilterBoxBuilder UI preview](./public/ui-filterboxbuilder.png)

## What It Builds

Three ways to fabricate the same enclosure, chosen per project:

- **3D print**: a watertight, slicer-ready model split into bed-sized chunks with alignment pins, exported as a single multi-plate 3MF or a per-chunk STL/3MF ZIP.
- **Laser cut**: finger-jointed panels exported as kerf-corrected SVG and DXF cut sheets (layout adapted from Boxes.py).
- **Hand cut**: the same layout as plain taped foamcore panels, with dimensioned SVG/DXF drawings and no fingers or flanges, for building without a laser.


## Features:

Interactive tools:

- **Live 3D preview** of the assembled enclosure, with an exploded assembly view for split prints.
- **Shareable links**: the full configuration is encoded in the URL, so a design round-trips just by copying the address.
- **Parts list**: filters, fans, fasteners, a filament estimate, and seam consumables for split prints.
- **Multiple exports**: a single multi-plate 3MF, a per-chunk STL/3MF ZIP, and laser or hand-cut SVG/DXF.

As you edit, the builder estimates performance: clean-air delivery rate (CADR, in m³/h and CFM), air changes per hour for a room you size, estimated noise, and power draw with operating cost. Advisories flag problems before you export.

Companion tools (standalone pages on the same site):

- **Room ventilation (ACH) calculator**: measures how well a room already ventilates using a CO2 decay test. Enter an outdoor baseline and two indoor CO2 readings taken a set time apart, with no fresh CO2 added in between, and it returns the room's air changes per hour.
- **Filter box CADR calculator**: estimates a finished box's clean-air delivery rate from its filter pressure drop. Pick the filter layout and size you built, enter two pressure readings taken with a phone sealed inside the box, and it works out the CADR.
- **PC fan gauge (P-Q)**: a limited-accuracy pressure-versus-flow tester for PC fans, so you can gauge how a fan holds up against back pressure before designing around it.

## Requirements

- Bun. The repo uses `bun.lock`, `bun test`, and Bun script execution.
- A modern browser with WebGL for the Three.js preview.

## Quick Start

Install dependencies:

```sh
bun install
```

Run the app:

```sh
bun run dev
```

Open the local app at `http://127.0.0.1:5173`.

## Validation

Run core checks:

```sh
bun test
bun run build
```

Optional port checks against the Boxes.py reference port:

```sh
bun run port:audit
bun run oracle:airpurifier
```

## Model Correctness

- Browser previews use Three.js for display.
- Generated laser files come from the laser fabrication model.
- Generated 3MF and STL files come from the parametric model built on the Manifold CSG kernel, which guarantees watertight, slicer-ready meshes.
- Performance numbers (CADR, ACH, noise, power, and cost) are engineering estimates derived from the fan and filter specs, not measured values.

## Repository Layout

- `src/app/`: browser workbench, URL state, tabs, controls, and styles.
- `src/domain/`: purifier settings, presets, units, performance estimation, and specialized printable design models.
- `src/fabrication/`: laser panels, cut geometry, assembly model, print kit planning, and 3MF export.
- `src/ports/boxes/`: small Boxes.py-inspired drawing/kernel port used for SVG generation.
- `src/rendering/`: Three.js previews for assembled models and fabrication sheets.
- `src/resources/`: static reference metadata used by the app.
- `public/vendor/`: browser-deployable preview assets with their own provenance notes.
- `references/`: upstream source/reference material that is not loaded directly by the app.
- `scripts/`: comparison and audit scripts.
- `test/`: Bun tests covering URL parsing, fabrication workflows, generated print kits, and 3MF output.

## License and Reuse

Copyright (C) 2026 [OpenNukit](https://github.com/opennukit). Dual-licensed by component:

- **Software** (the builder's source code) is licensed under **GPL-3.0**; see [LICENSE](./LICENSE). This matches the upstream Nukit open hardware repository.
- **Designs and output** (the laser-cut SVG/DXF drawings, 3MF print kits, and the box designs) and **documentation** are licensed under **CC BY-SA 4.0**: <https://creativecommons.org/licenses/by-sa/4.0/>.

Reuse or adapt either part with attribution; derivative works must stay under the same license (share-alike).

Browser preview assets under `public/vendor/` keep their own source and license notes; see [docs/assets-and-licenses.md](./docs/assets-and-licenses.md).

## Safety

This app generates fabrication files, not a certified appliance. Verify material safety, fan wiring, filter fit, laser kerf, printer tolerances, and local electrical requirements before building or deploying an air purifier.
