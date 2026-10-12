import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// One plain web app (no server rendering); the Express server in ../server serves the build and the API.
export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss(), tsconfigPaths()],
  server: { proxy: { "/api": "http://localhost:3000" } },
  build: { outDir: "dist", sourcemap: false },
});
