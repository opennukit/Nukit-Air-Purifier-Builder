// Public API of the parametric Tempest geometry. See ./buildTempest for the entry
// point and ./context for how the modeling backend is threaded through the helpers.
export { buildTempestGeometry } from "./buildTempest";
export { towerCornerChamfer } from "./quadAssembly";
export { clipPrintChunk, posePrintableAssembly, type ChunkBounds } from "./chunking";
export { tempestPinPlacementsClearOfFans, type TempestAlignmentPinPlacement } from "./pins";
