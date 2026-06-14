# Printing & parametric-model architecture

This folder turns a user's purifier configuration into printable geometry and a
sliceable 3MF file. The defining decision is the **kernel-agnostic seam**: the
parametric shape is written *once*, against an abstract modeling interface, with
the Manifold CSG kernel behind it for watertight, sliceable output. The shape
makes no kernel-specific assumptions, so a different kernel could be slotted in
without touching the model.

## The pipeline at a glance

```
 domain config                         this folder
 ─────────────                         ───────────
 PurifierSettings / LayoutResult
        │
        │  designs/tempest/settings.ts          (config → TempestSettings)
        ▼
 TempestSettings ──► createTempestModel ──►  TempestModel        [domain/designs/tempest/model.ts]
        │                                     (box dims, fan/filter layout, chunk grid — pure data)
        │
        │  designs/tempest/geometry/   buildTempestGeometry(modeling, model)
        ▼
   ModelingApi<Solid, Region>   ◄── the seam [modeling/modelingApi.ts]
     └─ manifoldModeling  (modeling/manifoldOps.ts + manifoldKernel.ts)  → watertight Geom3
        │
        │  designs/tempest/printableKit.ts
        ▼
   chunk into bed-sized parts (chunkSlicing.ts avoids cutting fan grills)
   weld Manifold mesh → PrintableMesh
        │
        │  printableKit.ts (generic) + printDesignKit.ts (per-design dispatch)
        ▼
   PrintableKit ──► createPrintDesignThreeMfZip ──► threeMf.ts ──► .zip of per-chunk .3mf
                    (one single-object 3MF per chunk, each centered on
                     the bed; carries enclosure colour as a 3MF displaycolor)
```

The download is **one 3MF per print chunk, bundled in a ZIP** rather than a
single multi-plate 3MF. Slicers that ignore Bambu/Orca plate metadata
(PrusaSlicer, Cura) otherwise stack every chunk on one bed, so the kit was
unprintable there; a lone single-object 3MF places cleanly in every slicer.
`createPrintDesignThreeMfExport` (the single multi-plate `.3mf`) is retained —
the in-app print-sheet preview still builds on its sheet plan.

Each chunk is **auto-oriented for the bed** before export (`partOrientation.ts`):
chunks are split full-depth along the assembly's Y axis, so the candidate
orientations are the four quarter-turns about that depth axis. Each is scored by
the steep downward (overhang) area it would strand above the bed, minus a reward
for resting a large flat face on the plate, and the lowest-support one is kept.
The 0° orientation is always a candidate and wins ties, so orientation can only
reduce support versus the as-modelled pose, never add it — which is what lets the
same rule apply to every configuration. Orientation is applied only on the export
path, so the assembled/print-sheet previews still show chunks in assembly pose.

The geometry layer never names a kernel. `buildTempestGeometry` is generic over
`<Solid, Region>` and takes a `ModelingApi<Solid, Region>`; whichever backend you
pass decides what `Solid` is. This is Parnas' rule in the type system: the
general (the shape) cannot depend on the specific (a kernel).

## Folder map

```
printing/
├── modeling/                  the seam + the Manifold backend
│   ├── modelingApi.ts         ModelingApi<Solid,Region> — the abstract CSG interface
│   ├── manifoldOps.ts         Manifold backend (watertight output); mesh extraction
│   └── manifoldKernel.ts      Manifold WASM init + withGeometryArena (handle lifetime)
│
├── designs/tempest/           the Tempest purifier, the one parametric design
│   ├── settings.ts            PurifierSettings/LayoutResult → TempestSettings
│   ├── geometry/              the parametric shape (see below)
│   ├── chunkSlicing.ts        split the posed model into bed-sized, grill-safe chunks
│   └── printableKit.ts        build on Manifold, pose, chunk, weld → PrintableKit
│
├── worker/                    off-thread kit builds
│   ├── kitBuild.ts            the one sync build core both threads can run
│   ├── kitWorkerProtocol.ts   the structured-clone message contract (types only)
│   ├── kitWorker.ts           Web Worker shell: own kernel init + FIFO builds
│   └── kitWorkerClient.ts     latest-wins channels, dedupe, worker lifecycle
│
├── partOrientation.ts         auto-orient a chunk on the bed (min support; rotations about the depth axis)
├── printableKit.ts            generic PrintableKit type; 3MF export + per-chunk 3MF-in-ZIP export from a kit
├── printDesignKit.ts          dispatch by design id; kit cache key; enclosure colour; ZIP/3MF exporters
└── threeMf.ts                 write the 3MF package (objects, plates, basematerials) + stored-ZIP writer
```

## designs/tempest/geometry/ — the parametric shape

One file per layer. Imports only ever point *down* this list, so there are no
cycles and you can read it top-to-bottom:

| File | Responsibility |
|---|---|
| `context.ts` | `GeometryContext<Solid,Region>` (the modeling backend + a per-build fan-pattern cache) and tuning constants (`EPSILON_LIP`, `CSG_SEGMENTS`, `SHELL_OVERLAP_MM`). |
| `primitives.ts` | Kernel-agnostic 3D/2D shapes (chamfered prisms, cylinders-along-axis, thin extrudes) and the boolean helpers (`unionAll`, `subtractAll`). Knows nothing about purifiers. |
| `patterns2d.ts` | 2D cross-sections — hex grill, fan pattern, filter/tower openings — and `fanPatternCut`, which lifts the fan profile into a cutting solid. |
| `pins.ts` | Alignment-pin and cord-pass-through hole sets — the holes subtracted at the very end. `pinHoles` dispatches via `matchTopology`. |
| `sandwichAssembly.ts` | Step implementations for the 1/2-filter sandwich box (panels + walls) — the timeline's nodes. |
| `quadAssembly.ts` | Step implementations for the 4-filter quad tower (air chamber, pockets, openings, fan grid, slots) + `towerCornerChamfer`. |
| `buildTempest.ts` | **The build timeline — start here.** Reads top to bottom as the recipe: dispatches to the quad or sandwich recipe via `matchTopology(model.topology, …)`, then subtracts the through-holes (cord + alignment pins). Each numbered step is a call into the files above; the call *is* one timeline node. The per-topology placement math now lives on the derived model (`src/domain/designs/tempest/{model,sandwich,quad}.ts`), so there is no separate `layout.ts`. |
| `index.ts` | Public API: `buildTempestGeometry`, `towerCornerChamfer`. |

### Why GeometryContext is threaded explicitly

The geometry was originally one large generic function whose inner helpers
*closed over* the destructured modeling ops and the fan-pattern cache. Splitting
it into files means those helpers become top-level functions — so the former
closure state is now passed as an explicit first argument:

```ts
export type GeometryContext<Solid, Region> = {
  readonly modeling: ModelingApi<Solid, Region>;
  readonly fanPatternCache: Map<string, Region>; // per-build; never outlives the build
};
```

Every helper is `f<Solid, Region>(ctx, …)`. The cache is created fresh per build
and discarded with it — under Manifold the `withGeometryArena` wrapping the build
owns and frees the underlying handles, so there is no cross-build state to dangle.

## The Manifold backend

`ModelingApi`'s operation shapes follow JSCAD's modeling conventions (small,
explicit ops); 2D operations are split out (`transforms2d` / `booleans2d`) so the
backend never has to branch on a runtime dimension.

**Manifold** (`manifoldModeling`) produces watertight, T-junction-free solids —
required for slicing. Both the in-browser preview and the STL/3MF export build on
it, then weld coincident vertices into a compact `PrintableMesh`, so what you see
is what you print. Allocation is bounded by `withGeometryArena`, which frees every
intermediate handle on exit.

Manifold is the only backend, but the geometry is still written against the
abstract `ModelingApi` rather than Manifold's concrete types — that keeps it free
of kernel-specific assumptions, so a different kernel could be dropped in without
touching the model.

A reflection caveat worth knowing when rendering: mapping a build vertex
`(x, y, z)` into a Y-up scene as `(x, z, y)` is a reflection (determinant −1) that
reverses triangle winding. Renderers that cull front-faces will show shells
inside-out unless the winding is flipped (`v1, v3, v2`). The geometry itself is
correct; this only bites at the three.js boundary.

## worker/ — off-thread kit builds

Kit builds are expensive, so the app runs them in one shared, lazily spawned
Web Worker. `kitWorker.ts` is a thin shell around the same sync build core
(`kitBuild.ts`) the main thread can also run directly; requests are answered
FIFO, one build at a time.

The client side (`kitWorkerClient.ts`) exposes **latest-wins channels**: each
consumer (the print-sheet plan, the assembled tempest preview) owns one
channel; a new request supersedes the channel's in-flight one — settling its
caller with `"superseded"` — and at most one request queues behind the build in
progress, so a burst of edits costs at most two builds. Channels are
parameterized over a small build port (`{ post }`), with the shared worker as
the production port, a synchronous on-thread port as the no-Worker fallback,
and hand-driven fakes in the unit tests. Geometry-identical requests from
different channels share one build through the deduping port, keyed by
`printKitCacheKey`.

Messages cross the boundary via structured clone (`kitWorkerProtocol.ts`), so
everything on the wire is plain data: `RawPurifierSettings` in, `PrintableKit`
(extracted meshes, no WASM handles) out. Each thread owns its own Manifold
kernel — the worker initializes one in its own heap, while the main-thread
kernel (initialized at bootstrap) backs only the fallback paths.

## Adding another design

Designs live under `designs/<name>/` with their own `printableKit.ts` exporting a
`create…PrintableKit(layout, presetId): PrintableKit`. Wire it into the dispatch
in `printDesignKit.ts`. If the design is parametric, build it against
`ModelingApi` so it inherits both backends for free; reuse `geometry/primitives`
rather than re-deriving chamfers and cylinders.
