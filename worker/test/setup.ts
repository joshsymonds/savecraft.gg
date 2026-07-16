import { env } from "cloudflare:test";
import { afterEach } from "vitest";

import { CLEANUP_TABLES, flushWorkerd } from "./helpers";
import { SCHEMA_STATEMENTS } from "./schema";

// No per-test DurableObject teardown. abortAllDurableObjects() interacted
// badly with workerd's WebSocket pool — it triggered cascading "Network
// connection lost" / "WebSocket peer connection unexpectedly closed"
// errors that bled into the next test and (after enough tests) destabilised
// the workerd pool such that vitest's WS to the runner pool emitted an
// UnexpectedExit. The natural isolation comes from each test using a
// unique sourceUuid/userUuid (so each test exercises fresh DurableObject
// IDs with empty storage); ALARM_INTERVAL_MS is set to 600_000ms in tests
// so natural alarm activity doesn't fire either.

// Apply the consolidated D1 schema before tests run.
// Using individual prepare().run() calls because D1.exec() has metadata
// aggregation bugs in certain workerd versions.
for (const sql of SCHEMA_STATEMENTS) {
  await env.DB.prepare(sql).run();
}

// Clean all data at startup. Each test's describe block uses beforeEach(cleanAll)
// for per-test cleanup; this module-level pass provides a clean baseline when
// the suite begins.
for (const table of CLEANUP_TABLES) {
  await env.DB.prepare(`DELETE FROM ${table}`).run();
}

// Clean R2 between test files
for (const bucket of [env.PLUGINS]) {
  const listed = await bucket.list();
  for (const object of listed.objects) {
    await bucket.delete(object.key);
  }
}

// Drain workerd's queued fire-and-forget work after every test. Handlers like
// webSocketMessage/alarm spawn async DO work (e.g. SourceHub → UserHub event
// forwarding via a cross-DO stub.fetch) that the test body never awaits. Without
// this pump, such a forward can still be in flight when vitest tears down the
// workerd environment between files — the closing RPC then rejects with
// "EnvironmentTeardownError: Closing rpc while ... pending", which vitest
// surfaces as an unhandled error and fails the whole shard intermittently (most
// visible under `just check`'s heavy parallel load). Draining is always safe and
// cheap, so it runs globally here rather than being mounted per-suite.
afterEach(async () => {
  await flushWorkerd();
});
