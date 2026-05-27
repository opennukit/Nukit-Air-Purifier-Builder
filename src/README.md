# Source Layout

The browser app is organized by the concepts it owns:

- `app/`: DOM app shell, workbench navigation state, and browser-only UI helpers.
- `domain/`: product settings, purifier constraints, and printable design models.
- `fabrication/`: generated layout, laser, print-bed, 3MF, and export-oriented transformations.
- `ports/`: compatibility layers for external systems. `ports/boxes` is the TypeScript Boxes.py port.
- `rendering/`: Three.js and visual preview code.
- `resources/`: typed metadata for deployable public assets.

Keep browser DOM work in `app/`, export/layout transformations in `fabrication/`, and rendering-specific code out of `domain/`.
