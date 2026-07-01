import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Plugin views (plugins/*/reference/views) sit outside this package, so bare
// imports in their test files can't walk up to a node_modules — pin them here.
const local = (pkg: string) => fileURLToPath(new URL(`./node_modules/${pkg}`, import.meta.url));

export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    // Use browser/client bundle for Svelte (not server) so mount() works in happy-dom
    conditions: ["browser"],
    alias: [
      { find: "@testing-library/svelte", replacement: local("@testing-library/svelte") },
    ],
  },
  server: {
    // Plugin views live outside this package root (plugins/*/reference/views).
    fs: { allow: [".."] },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/components/**/*.test.ts",
      "../plugins/*/reference/views/*.test.ts",
    ],
  },
});
