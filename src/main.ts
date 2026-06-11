import "./app/styles.css";
import { mount } from "svelte";
import App from "./App.svelte";
import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";
import { initManifoldKernel } from "@/fabrication/printing/modeling/manifoldKernel";

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot === null) {
  throw new Error("main: App root not found");
}

// index.html ships a static loading screen inside #app so slow networks see a
// spinner instead of a blank page; bootstrap replaces it when the app mounts,
// or with the error screen below when loading fails.
type BootstrapPhase = "loading" | "mounted" | "failed";
let bootstrapPhase: BootstrapPhase = "loading";

// BOOTSTRAP_FALLBACK_STYLES: classes defined in index.html's <head>, so this
// screen renders even when the bundled stylesheet never loaded.
function renderBootstrapError(root: HTMLElement): void {
  if (bootstrapPhase !== "loading") {
    return;
  }
  bootstrapPhase = "failed";
  const panel = document.createElement("div");
  panel.className = "bootstrap-fallback";
  panel.setAttribute("role", "alert");
  const message = document.createElement("p");
  message.textContent = "Couldn't load the 3D engine. Check your connection and reload.";
  const reloadButton = document.createElement("button");
  reloadButton.type = "button";
  reloadButton.className = "bootstrap-reload-button";
  reloadButton.textContent = "Reload";
  reloadButton.addEventListener("click", () => window.location.reload());
  panel.append(message, reloadButton);
  root.replaceChildren(panel);
}

// Anything that explodes before the app mounts — the WASM fetch in bootstrap,
// a module chunk that fails to load — would otherwise leave the loading screen
// up forever. Both handlers no-op once the app has mounted (or already
// failed): post-mount errors are handled in-app.
window.addEventListener("error", () => renderBootstrapError(appRoot));
window.addEventListener("unhandledrejection", () => renderBootstrapError(appRoot));

// Kit geometry normally builds in the kit worker, which initializes its own
// Manifold kernel in its own heap. This main-thread kernel backs only the
// fallback paths — the kit channel's no-Worker sync build and the preview's
// synchronous tempest build — which can run as soon as a component mounts, so
// it must still be ready before the app does.
async function bootstrap(root: HTMLElement): Promise<void> {
  try {
    await initManifoldKernel(() => manifoldWasmUrl);
  } catch (error) {
    console.error("bootstrap: Manifold kernel init failed", error);
    renderBootstrapError(root);
    return;
  }
  if (bootstrapPhase !== "loading") {
    return;
  }
  root.replaceChildren();
  mount(App, { target: root });
  bootstrapPhase = "mounted";
}

void bootstrap(appRoot);
