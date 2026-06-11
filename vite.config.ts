import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? "676f-85-242-148-33.ngrok-free.app")
  .split(",")
  .map((host) => host.trim())
  .filter((host) => host.length > 0);

export default defineConfig({
  plugins: [svelte()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      // The geometry playground is a dev tool; it is served by the dev server
      // but deliberately excluded from the production build.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    allowedHosts,
  },
  preview: {
    allowedHosts,
  },
});
