import "./app/styles.css";
import { mount } from "svelte";
import App from "./App.svelte";
import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";
import { initManifoldKernel } from "@/fabrication/printing/modeling/manifoldKernel";

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot === null) {
  throw new Error("main: App root not found");
}

// Kit geometry normally builds in the kit worker, which initializes its own
// Manifold kernel in its own heap. This main-thread kernel backs only the
// fallback paths — the kit channel's no-Worker sync build and the preview's
// synchronous tempest build — which can run as soon as a component mounts, so
// it must still be ready before the app does.
async function bootstrap(root: HTMLElement): Promise<void> {
  await initManifoldKernel(() => manifoldWasmUrl);
  mount(App, { target: root });
}

void bootstrap(appRoot);
