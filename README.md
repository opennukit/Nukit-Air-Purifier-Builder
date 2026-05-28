# Nukit Open Air Purifier Builder

Browser-based generator for Nukit-style open air purifier builds. It creates live 3D previews, laser-cut SVG drawings, and printable 3MF kits from one shared parametric model.

![Nukit Open Air Purifier preview](./public/nukit-open-air-purifier.jpg)

## What It Builds

- Parametric Nukit open-air filter boxes using HVAC filters, PC fans, laser-cut panels, and optional printable split-frame parts.
- Generated printable kits for desktop printer beds, including panel tiling and dovetail glue keys.
- Specialized printable references: a generated modular Corsi-Rosenthal box, a generated donut HEPA fan adaptor, and curated static Printables references where the source design is intentionally fixed.
- Shareable URLs that preserve design, parts, fabrication method, preview mode, and advanced fit settings.

## FilterBoxBuilder Parity

This app keeps the FilterBoxBuilder settings that are useful for safe builds and shareable fabrication output:

- filter dimensions, fan size, filter count, wall fan banks, material thickness, kerf/fit allowance, screw holes, reference scale, and split-frame choice;
- advanced finger-slot and dovetail tuning for builders who need to match a specific material or cutter;
- legacy FilterBoxBuilder URL aliases such as `x`, `y`, `filter_height`, `fan_diameter`, `thickness`, `burn`, `screw_holes`, `FingerJoint_*`, and `DoveTail_*`.

Some upstream-style controls are intentionally not first-path UI. The default workflow asks for design, parts, and print/laser setup first; advanced joint tuning is available in the Advanced tab. Fixed external designs stay fixed instead of pretending to be parametric.

See [docs/filterboxbuilder-parity.md](./docs/filterboxbuilder-parity.md) for the kept/advanced/removed story.

## Local Development

Install dependencies:

```sh
bun install
```

Run the app:

```sh
bun run dev
```

Validate before publishing:

```sh
bun test
bun run build
```

Optional port checks against the Boxes.py reference port:

```sh
bun run port:audit
bun run oracle:airpurifier
```

## Repository Layout

- `src/app/`: browser workbench, URL state, tabs, controls, and styles.
- `src/domain/`: purifier settings, presets, units, and specialized printable design models.
- `src/fabrication/`: laser panels, cut geometry, assembly model, print kit planning, and 3MF export.
- `src/ports/boxes/`: small Boxes.py-inspired drawing/kernel port used for SVG generation.
- `src/rendering/`: Three.js previews for assembled models and fabrication sheets.
- `src/resources/`: static reference metadata used by the app.
- `public/vendor/`: browser-deployable preview assets with their own provenance notes.
- `references/`: upstream source/reference material that is not loaded directly by the app.
- `scripts/`: comparison and audit scripts.
- `test/`: Bun tests covering URL parsing, fabrication workflows, generated print kits, and 3MF output.

## Assets And Licenses

The project code is GPL-3.0, matching the upstream Nukit open hardware repository. Browser preview assets under `public/vendor/` keep their own source and license notes; see [docs/assets-and-licenses.md](./docs/assets-and-licenses.md).

## Safety

This app generates fabrication files, not a certified appliance. Verify material safety, fan wiring, filter fit, laser kerf, printer tolerances, and local electrical requirements before building or deploying an air purifier.
