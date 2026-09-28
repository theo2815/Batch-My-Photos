import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "batch-naming-dev",
      apply: "serve",
      transform(code, id) {
        if (id.endsWith("/src/utils/batchNaming.js")) {
          return code.replace("module.exports = { generateBatchFolderName };", "export default { generateBatchFolderName };");
        }
      },
    },
  ],
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
