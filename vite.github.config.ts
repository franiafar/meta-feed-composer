import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "static-pages",
  base: "/meta-feed-composer/",
  publicDir: "../public",
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  build: {
    outDir: "../docs",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./static-pages/index.html", import.meta.url)),
        docs: fileURLToPath(new URL("./static-pages/docs/index.html", import.meta.url)),
      },
    },
  },
});
