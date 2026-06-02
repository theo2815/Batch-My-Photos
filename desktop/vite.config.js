import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    commonjsOptions: {
      // Include local CJS modules that are imported with ESM syntax
      include: [/src\/utils\/batchNaming\.js/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
  server: {
    port: 5173,
  },
});
