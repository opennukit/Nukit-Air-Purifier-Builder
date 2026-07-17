import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? "676f-85-242-148-33.ngrok-free.app")
  .split(",")
  .map((host) => host.trim())
  .filter((host) => host.length > 0);

// Cloudflare Web Analytics beacon: cookieless, no cookies/IPs/persistent ids, so no
// consent banner. Injected into the production build only (never the dev server or
// preview) and only when a site token is set, so dev stays clean. The token is not a
// secret (it is served in the page HTML); set CF_WEB_ANALYTICS_TOKEN in the build
// environment (e.g. the deploy workflow).
const cloudflareBeaconToken = (process.env.CF_WEB_ANALYTICS_TOKEN ?? "").trim();

function cloudflareWebAnalytics(token: string): Plugin {
  return {
    name: "cloudflare-web-analytics",
    apply: "build",
    transformIndexHtml(html) {
      if (token.length === 0) {
        return html;
      }
      const beacon = `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>`;
      return html.replace("</body>", `    ${beacon}\n  </body>`);
    },
  };
}

export default defineConfig({
  plugins: [svelte(), cloudflareWebAnalytics(cloudflareBeaconToken)],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
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
