import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

// #######################################
// Print-Bed Auto-Orientation
// #######################################
//
// Pick how a print chunk rests on the plate so it needs as little support as
// possible.
//
// A chunk can rest on the bed in any of the 24 axis-aligned orientations (the
// cube's rotation group). We try them all and keep the one that needs the least
// support. Reorienting only changes how the part rests on the plate; the solid
// itself is unchanged, so any of these is safe to print.
//
// (An earlier version only tried the four quarter-turns about the depth axis,
// assuming every chunk spans the full assembly depth. That is false for thin
// plate chunks such as a top/back panel only a few mm deep: spinning solely
// about the depth axis can never tip them flat, so they were exported standing
// on edge. Considering every axis-aligned resting face fixes that.)
//
// Each candidate is scored by the steep downward-facing ("overhang") area it
// leaves stranded above the bed, minus a reward for resting a large flat face
// on the plate. The lower the score the less support the slicer must add.
//
// The 0° (identity) orientation is always the first candidate and wins ties, so
// this can never produce MORE support than the un-rotated export — it only
// matches or improves it.

// A facet counts as an overhang once its downward tilt passes this angle from
// horizontal — the usual ~45° rule of thumb for FDM printing without support.
const overhangThresholdDegrees = 45;

// How much resting area on the bed is worth, relative to a unit of overhang
// area. Tuned (and cross-checked against a hand-oriented reference kit) so that
// a near-flat-but-large face beats standing a part up to shave a sliver of
// overhang. Stable for any weight in roughly 0.03–0.1.
const bedContactReward = 0.05;

// How close to the lowest point a facet must sit to count as "on the bed".
const bedPlaneEpsilonMm = 0.5;

// A facet flatter-than-this against the plate counts as bed contact.
const flatFaceCosineThreshold = 0.99;

const overhangCosineThreshold = Math.cos((overhangThresholdDegrees * Math.PI) / 180);

type AxisRotation = (vertex: MeshVertex) => MeshVertex;

// All 24 axis-aligned proper rotations (the cube's rotation group), built as
// signed axis permutations with determinant +1 (so they are rotations, never
// mirrors — winding and therefore facet normals are preserved). The identity
// (first permutation, all-positive signs) is generated first, so it leads the
// list and wins score ties. Integer coefficients keep every rotation exact.
const axisAlignedRotations: readonly AxisRotation[] = buildAxisAlignedRotations();

function buildAxisAlignedRotations(): readonly AxisRotation[] {
  // Each output axis takes one input component (the permutation) with a sign.
  const permutations: readonly (readonly [number, number, number])[] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const signTriples: readonly (readonly [number, number, number])[] = [
    [1, 1, 1],
    [1, 1, -1],
    [1, -1, 1],
    [1, -1, -1],
    [-1, 1, 1],
    [-1, 1, -1],
    [-1, -1, 1],
    [-1, -1, -1],
  ];
  const permutationParity = (perm: readonly [number, number, number]): number => {
    let inversions = 0;
    for (let i = 0; i < perm.length; i += 1) {
      for (let j = i + 1; j < perm.length; j += 1) {
        if (perm[i] > perm[j]) {
          inversions += 1;
        }
      }
    }
    return inversions % 2 === 0 ? 1 : -1;
  };

  const rotations: AxisRotation[] = [];
  for (const perm of permutations) {
    for (const signs of signTriples) {
      const determinant = permutationParity(perm) * signs[0] * signs[1] * signs[2];
      if (determinant !== 1) {
        continue;
      }
      rotations.push(({ x, y, z }) => {
        const components = [x, y, z] as const;
        return {
          x: signs[0] * components[perm[0]],
          y: signs[1] * components[perm[1]],
          z: signs[2] * components[perm[2]],
        };
      });
    }
  }
  return rotations;
}

// Return the chunk's vertices rotated into the lowest-support resting
// orientation. Triangles are unchanged: every candidate is a proper rotation
// (determinant +1), so winding — and therefore the facet normals — is
// preserved.
export function orientChunkVerticesForPrinting(
  vertices: readonly MeshVertex[],
  triangles: readonly MeshTriangle[],
): readonly MeshVertex[] {
  let best: { readonly score: number; readonly vertices: readonly MeshVertex[] } | undefined;

  for (const rotate of axisAlignedRotations) {
    const rotated = vertices.map(rotate);
    const score = supportScore(rotated, triangles);
    if (best === undefined || score < best.score - 1e-6) {
      best = { score, vertices: rotated };
    }
  }

  return best?.vertices ?? vertices;
}

// Lower is better: overhang area the slicer would have to prop up, discounted
// by the flat area resting on the bed.
function supportScore(vertices: readonly MeshVertex[], triangles: readonly MeshTriangle[]): number {
  const minZ = vertices.reduce((lowest, vertex) => Math.min(lowest, vertex.z), Infinity);
  let overhangArea = 0;
  let bedContactArea = 0;

  for (const { v1, v2, v3 } of triangles) {
    const a = vertices[v1];
    const b = vertices[v2];
    const c = vertices[v3];
    if (a === undefined || b === undefined || c === undefined) {
      continue;
    }

    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const twiceArea = Math.hypot(nx, ny, nz);
    if (twiceArea < 1e-9) {
      continue;
    }

    const unitNormalZ = nz / twiceArea;
    const centroidZ = (a.z + b.z + c.z) / 3;

    if (-unitNormalZ > overhangCosineThreshold && centroidZ > minZ + bedPlaneEpsilonMm) {
      overhangArea += twiceArea / 2;
    } else if (unitNormalZ < -flatFaceCosineThreshold && centroidZ < minZ + bedPlaneEpsilonMm) {
      bedContactArea += twiceArea / 2;
    }
  }

  return overhangArea - bedContactReward * bedContactArea;
}
