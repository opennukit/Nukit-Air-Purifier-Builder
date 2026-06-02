import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds the standalone editor into ONE self-contained HTML (all JS inlined),
// so it can be shared and opened from file:// with no server or toolchain.
// It uses the JSCAD backend, so there is no WASM to inline.
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  publicDir: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-standalone",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    rollupOptions: {
      input: fileURLToPath(new URL("./standalone.html", import.meta.url)),
    },
  },
});
