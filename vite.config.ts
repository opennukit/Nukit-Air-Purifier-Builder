import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? "676f-85-242-148-33.ngrok-free.app")
  .split(",")
  .map((host) => host.trim())
  .filter((host) => host.length > 0);

export default defineConfig({
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
