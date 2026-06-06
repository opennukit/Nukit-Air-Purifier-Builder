import { initManifoldKernel } from "@/fabrication/printing/modeling/manifoldKernel";

// Print-kit tests build geometry synchronously through the Manifold WASM kernel.
// In the Node/bun environment the loader resolves the bundled wasm itself, so no
// locateFile override is needed.
await initManifoldKernel();
