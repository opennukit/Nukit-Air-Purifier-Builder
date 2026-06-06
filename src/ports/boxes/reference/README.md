# `ports/boxes/reference` — the boxes.py correctness oracle

**This folder is not part of the shipped app.** Nothing under `src/` outside this
folder imports it, and a production build tree-shakes it away. It is a test
fixture that happens to live next to the code it validates.

## Why it exists

The Nukit laser cut sheet is derived from the upstream Python
[`boxes.py`](https://github.com/florianfesti/boxes) generator
`boxes/generators/airpurifier.py`. We did **not** keep using boxes.py at runtime —
the app builds its cut sheets with a native, app-idiomatic pipeline
(`@/fabrication/laser/cutGeometry` → `panels` → `@/ports/boxes/svg`) that emits
typed `CutPanel`s usable for both SVG export and the 3D assembly preview.

That rewrite needs to stay faithful to boxes.py's geometry (fan/screw burn
correction, finger-hole placement, panel layout direction). To prove it does, we
keep an **executable golden reference**: a faithful 1:1 port of boxes.py that the
tests can run and compare against.

## What's here

| File | Role |
| --- | --- |
| `airPurifierGenerator.ts` | Line-for-line port of `boxes/generators/airpurifier.py`. Reads like the Python source on purpose. |
| `boxes.ts` | Minimal port of the `boxes.Boxes` framework (procedural `rectangularWall`/`hole`/`fingerHolesAt`, edge-code strings) the generator draws through. |
| `edges.ts` | Port of the boxes.py edge registry (finger joints, dovetails, compound edges). |
| `drawingContext.ts` | Port of the boxes.py turtle/canvas — accumulates shapes under a translate stack. |

All of these speak the shared cut-document model in `../cutDocument.ts`, the same
vocabulary the live renderer and native geometry use.

## Who consumes it

- `test/ports/boxes/airPurifierCutSheetEquivalence.test.ts` — runs
  `generateAirPurifier(...)` as the golden reference and asserts the native path
  matches its layout/burn/finger-hole behavior.
- `scripts/boxes-port/airpurifier-oracle.ts` — cross-checks the native SVG against
  the **real** Python boxes.py (needs a checkout via `BOXES_PY_PATH`).
- `scripts/boxes-port/boxes-port-audit.ts` — tracks port coverage vs upstream.

## Rules

- **Keep it in lockstep with upstream boxes.py.** Do not "fix" it to match our
  native output — that would defeat the entire purpose. If upstream changes,
  re-port; if our native output should change, change `@/fabrication/laser` and
  let the equivalence test catch any drift.
- It is not dead code. If you are pruning legacy, leave this folder alone.
