import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

/**
 * Vite config for MCP App views.
 *
 * Used by Storybook (stories live in worker/ and plugins/, outside this package).
 * Build script (scripts/build.ts) uses its own inline config with configFile: false.
 *
 * resolve.dedupe ensures imports from stories outside views/ resolve from views/node_modules.
 */
export default defineConfig({
  plugins: [
    svelte({
      emitCss: false,
    }),
  ],
  resolve: {
    dedupe: ["svelte", "@storybook/addon-svelte-csf", "@storybook/svelte"],
  },
  server: {
    fs: {
      // Allow serving files from the repo root (stories in worker/ and plugins/)
      allow: [resolve(__dirname, "..")],
    },
  },
});
