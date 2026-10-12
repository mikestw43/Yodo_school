import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// One plain web app (no server rendering); the Express server in ../server serves the build and the API.
// No per-page code splitting: over the NAS link every first visit of a page waited for its own file (owner 12/10/2026: slow).
export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: false }), react(), tailwindcss(), tsconfigPaths()],
  server: { proxy: { "/api": "http://localhost:3000" } },
  build: { outDir: "dist", sourcemap: false },
});
