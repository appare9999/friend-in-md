import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "src/client"),
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-client"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "src/client/index.html"),
        "quick-note": path.resolve(__dirname, "src/client/quick-note.html"),
        presenter: path.resolve(__dirname, "src/client/presenter.html"),
      },
    },
  },
  server: {
    port: 5180,
    open: true,
    proxy: {
      "/api": {
        // Set by scripts/dev.mjs so each dev instance talks to its own API server.
        target: `http://127.0.0.1:${process.env.FRIEND_IN_MD_API_PORT ?? 4317}`,
        configure: (proxy) => {
          // When the API server dies (e.g. `tsx watch` restarting it) the
          // proxy leaves the browser's side of long-lived responses like the
          // /api/events stream open, so the client never notices and never
          // reconnects. Close the browser side along with the upstream.
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            proxyRes.on("close", () => {
              if (!res.writableEnded) res.destroy();
            });
          });
        },
      },
    },
  },
});
