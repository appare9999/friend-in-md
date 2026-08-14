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
  },
  server: {
    port: 5180,
    open: true,
    proxy: {
      "/api": "http://localhost:4317",
    },
  },
});
