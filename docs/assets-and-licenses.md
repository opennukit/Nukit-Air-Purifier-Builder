# Assets And Licenses

Copyright (C) 2026 OpenNukit (https://github.com/opennukit). The project is dual-licensed by component: the app source code is GPL-3.0, and the designs and output it generates (laser-cut SVG/DXF, 3MF print kits, box designs) plus documentation are CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Some browser preview assets have their own upstream sources and licenses, listed below.

## README Preview Image

- `public/ui-filterboxbuilder.png`
- Source: project UI screenshot.
- Purpose: README preview image.
- License: project documentation, CC BY-SA 4.0.

## Fan Preview Assets

- `public/vendor/fan-preview/noctua/nf-a14-public-cad-preview.json`
- Source: Noctua public CAD model page, `https://www.noctua.at/en/3d-cad-models`.
- Purpose: preview-only visualization for the "140 mm — beige/brown" fan preset (Noctua NF-A14 public CAD).
- The exported 3MF intentionally does not embed this CAD asset.

## Scale Reference Assets

- `public/vendor/scale-reference/banana/banana.glb`
- Purpose: optional visual scale reference in the browser preview.

## Static Print Reference Assets

No third-party static reference files are mirrored in this repository. The modular 20x20 reference is intentionally not mirrored because its Printables license is CC-BY-NC-SA. The UI links to the upstream files instead.

## Reference Folder

`references/` contains upstream and research material for development comparison. Browser code should load deployable assets from `public/`, not from `references/`.
