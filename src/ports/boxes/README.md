# `ports/boxes`

This layer owns the **cut-document model** — the 2D laser shape vocabulary the
Nukit laser path uses — plus its SVG renderer. It is named `boxes` because the
data model and the original geometry both trace back to the Python
[`boxes.py`](https://github.com/florianfesti/boxes) generator we ported from.

## Live (shipped in the app)

| File | Role |
| --- | --- |
| `cutDocument.ts` | The shared data model: `Point`, `Shape`, `BoxesDocument`, `ShapeColor`. Produced by the native geometry in `@/fabrication/laser`, consumed by the renderer below. |
| `svg.ts` | `renderBoxesDocumentSvg(document)` → Inkscape-layered SVG for laser export. The live `Download SVG` path goes through here. |

The app's actual cut geometry lives in `@/fabrication/laser/cutGeometry` and
`panels` — not here. Those modules import only the *types* from `cutDocument.ts`.

## Not shipped — correctness oracle

`reference/` holds an executable 1:1 port of boxes.py kept solely to prove the
native geometry stays a correct port. It is imported only by tests and
`scripts/boxes-port/*`, never by the app. See [`reference/README.md`](./reference/README.md).
**If you are hunting dead code: `reference/` is intentional, not legacy.**
