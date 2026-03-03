import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    poolOptions: {
      workers: {
        // All test files share one Miniflare instance. Without this, each
        // file gets its own instance and SELF.fetch() writes (worker context)
        // are invisible to env.DB reads (test context) across files.
        singleWorker: true,
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            // Override .dev.vars: tests use stub auth (bearer token = user UUID)
            CLERK_ISSUER: "",
            // Short intervals for alarm tests (production defaults: 90000 / 30000)
            STALE_THRESHOLD_MS: 200,
            ALARM_INTERVAL_MS: 100,
          },
        },
        // Disabled because Miniflare's storage frame tracker can't handle
        // Durable Object SQLite WAL files. Tests use beforeEach(cleanAll)
        // inside describe blocks for per-test isolation instead.
        isolatedStorage: false,
      },
    },
  },
});
