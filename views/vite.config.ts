import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

/**
 * Vite config for building MCP App view components.
 * Used by scripts/build.ts programmatically — not invoked directly.
 *
 * Key settings:
 * - emitCss: false → CSS is injected by JS at runtime (self-contained bundles)
 * - IIFE format → works in sandboxed iframes without module support
 */
export default defineConfig({
  plugins: [
    svelte({
      emitCss: false,
    }),
  ],
});
