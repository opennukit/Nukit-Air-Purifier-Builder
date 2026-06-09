import type { TempestPrintablePose } from "@/domain/designs/tempest/model";
import type { GeometryContext } from "./context";
import { cuboidFromMinSize } from "./primitives";

// #######################################
// Print-Chunk Geometry (kernel-agnostic)
// #######################################

// Posing the assembly on the bed and clipping it into bed-sized chunks are pure
// solid -> solid operations, so they belong behind the same ModelingApi seam the
// parametric shape is built against — not against the concrete Manifold backend.
// printableKit.ts stays the Manifold-bound layer only for mesh EXTRACTION
// (getMesh, which is inherently kernel-specific); the construction here threads
// the same GeometryContext every other geometry helper does.

// A box that fully contains a chunk overlaps its neighbours by this on every face
// so the rough intersect can't miss a boundary triangle; a second exact clip then
// trims back to the true chunk size.
const CHUNK_OVERLAP_MM = 0.05;

// The chunk's min corner in assembly space and its true (overlap-free) extent.
export type ChunkBounds = {
  readonly origin: readonly [number, number, number];
  readonly size: readonly [number, number, number];
};

// Orient the assembly the way it prints on the bed: kept as-modelled, or stood
// upright for the dual-filter sandwich (rotated onto its side, then lifted back
// above the bed by the rotated depth).
export function posePrintableAssembly<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  pose: TempestPrintablePose,
  assembly: Solid,
): Solid {
  if (pose.type === "source") {
    return assembly;
  }
  const { transforms } = ctx.modeling;
  return transforms.translate([0, pose.envelope.depth, 0], transforms.rotateX(Math.PI / 2, assembly));
}

// Cut one bed-sized chunk out of the posed assembly and move it to the origin so
// it sits ready to print. The overlap-grown box catches every boundary triangle;
// the exact box then trims the chunk to its true size.
export function clipPrintChunk<Solid, Region>(
  ctx: GeometryContext<Solid, Region>,
  assembly: Solid,
  bounds: ChunkBounds,
): Solid {
  const { booleans, transforms } = ctx.modeling;
  const [originX, originY, originZ] = bounds.origin;
  const [sizeX, sizeY, sizeZ] = bounds.size;
  const overlapBox = cuboidFromMinSize(
    ctx,
    originX - CHUNK_OVERLAP_MM,
    originY - CHUNK_OVERLAP_MM,
    originZ - CHUNK_OVERLAP_MM,
    sizeX + 2 * CHUNK_OVERLAP_MM,
    sizeY + 2 * CHUNK_OVERLAP_MM,
    sizeZ + 2 * CHUNK_OVERLAP_MM,
  );
  const roughChunk = transforms.translate(
    [-originX, -originY, -originZ],
    booleans.intersect(assembly, overlapBox),
  );
  const exactBox = cuboidFromMinSize(ctx, 0, 0, 0, sizeX, sizeY, sizeZ);
  return booleans.intersect(roughChunk, exactBox);
}
