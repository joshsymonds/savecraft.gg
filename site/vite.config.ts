import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: "..",
  plugins: [sveltekit()],
  server: { port: 5174 },
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["./vitest-setup.ts"],
  },
});
