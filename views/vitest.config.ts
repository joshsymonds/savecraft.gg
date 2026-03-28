import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    // Use browser/client bundle for Svelte (not server) so mount() works in happy-dom
    conditions: ["browser"],
  },
  test: {
    environment: "happy-dom",
    include: ["src/components/**/*.test.ts"],
  },
});
