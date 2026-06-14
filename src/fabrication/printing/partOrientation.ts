import type { MeshTriangle, MeshVertex } from "@/fabrication/printing/threeMf";

// #######################################
// Print-Bed Auto-Orientation
// #######################################
//
// Pick how a print chunk rests on the plate so it needs as little support as
// possible.
//
// Every Tempest chunk spans the full assembly depth — the Y axis in the posed
// export frame — so the only sensible print orientations are the four
// quarter-turns about that depth axis. They keep the depth running flat along
// the bed and just spin the width/height cross-section that faces the plate;
// turning about any other axis would stand the full ~210 mm depth up on end.
//
// Each candidate is scored by the steep downward-facing ("overhang") area it
// leaves stranded above the bed, minus a reward for resting a large flat face
// on the plate. The lower the score the less support the slicer must add.
//
// The 0° (identity) orientation is always a candidate and wins ties, so this
// can never produce MORE support than the un-rotated export — it only matches
// or improves it. That is what lets the same rule apply safely to every
// configuration: worst case, a chunk keeps its current orientation.

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

type DepthAxisRotation = (vertex: MeshVertex) => MeshVertex;

// The four quarter-turns about the depth (Y) axis, in identity-first order so
// identity wins score ties. Integer coefficients keep them numerically exact.
const depthAxisRotations: readonly DepthAxisRotation[] = [
  ({ x, y, z }) => ({ x, y, z }), //                    0°
  ({ x, y, z }) => ({ x: z, y, z: -x }), //            90°
  ({ x, y, z }) => ({ x: -x, y, z: -z }), //          180°
  ({ x, y, z }) => ({ x: -z, y, z: x }), //           270°
];

// Return the chunk's vertices rotated into the lowest-support orientation about
// the depth axis. Triangles are unchanged: every candidate is a proper
// rotation (determinant +1), so winding — and therefore the facet normals — is
// preserved.
export function orientChunkVerticesForPrinting(
  vertices: readonly MeshVertex[],
  triangles: readonly MeshTriangle[],
): readonly MeshVertex[] {
  let best: { readonly score: number; readonly vertices: readonly MeshVertex[] } | undefined;

  for (const rotate of depthAxisRotations) {
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
