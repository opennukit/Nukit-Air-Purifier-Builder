import { mount } from "svelte";
import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";
import { initManifoldKernel } from "@/fabrication/printing/modeling/manifoldKernel";
import Playground from "./Playground.svelte";

// The geometry-design playground: a separate entry from the main Builder so both
// run side-by-side in dev. It builds the parametric Tempest geometry on the same
// Manifold backend the Builder ships, so what you preview is what you'd export.
const root = document.querySelector<HTMLElement>("#playground");
if (root === null) {
  throw new Error("playground/main: #playground root not found");
}

async function bootstrap(target: HTMLElement): Promise<void> {
  await initManifoldKernel(() => manifoldWasmUrl);
  mount(Playground, { target });
}

void bootstrap(root);
