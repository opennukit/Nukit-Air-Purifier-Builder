import "./app/styles.css";
import { mount } from "svelte";
import App from "./App.svelte";
import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";
import { initManifoldKernel } from "@/fabrication/printing/modeling/manifoldKernel";

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot === null) {
  throw new Error("main: App root not found");
}

// The Tempest print kit builds its geometry synchronously through the Manifold
// WASM kernel, so it must be loaded before any component can request a kit.
async function bootstrap(root: HTMLElement): Promise<void> {
  await initManifoldKernel(() => manifoldWasmUrl);
  mount(App, { target: root });
}

void bootstrap(appRoot);
