---
name: working-on-worker
description: Cloudflare Worker development conventions for Savecraft. Use when working on files in worker/, including the push API, SourceHub/UserHub Durable Objects, WebSocket protocol, D1 schemas, route handling, or Worker tests. Triggers on TypeScript Worker code, Miniflare, Vitest, Durable Objects, wrangler, or Worker deployment.
---

# Working on the Worker

Read `docs/worker.md` for the full architecture reference.

## Verification

```bash
just test-worker   # Vitest + Miniflare
```

## TypeScript Rules

**Type safety:**
- Never use `any` — use `unknown` if type is truly unknown.
- Never use `@ts-ignore` or `@ts-expect-error` — fix the type issue properly.
- Strict mode enabled. Avoid type assertions except after type guards.
- Never use `!` non-null assertion without a preceding check.

**State & data:**
- Discriminated unions for state machines and message types. Never use boolean flags for multiple states.
- Exhaustive checking with `never` type in switch defaults.
- Use `readonly` for properties unless mutation is needed. Never mutate parameters.

**Null handling:**
- Always handle null/undefined explicitly.
- Use optional chaining (`?.`) and nullish coalescing (`??`).

**Error handling:**
- Custom error classes for different error types. Never throw strings — always `Error` objects.
- Never ignore Promise rejections.

**eslint-enforced (CI will fail):**
- `T[]` not `Array<T>` — eslint `array-type` rule.
- `toSorted((a, b) => a.localeCompare(b))` not `sort()` — eslint unicorn/sonarjs rules.
- Max function complexity: 15. Split into helper functions to stay under.

**Never do:**
- Use `any`, `var`, `==`, `@ts-ignore`, bare `!` assertions.
- Mutate function parameters.
- Skip runtime validation for external data (API responses, user input).

## MCP Handler

The MCP server is a **hand-rolled JSON-RPC 2.0 handler**. Do NOT use `@modelcontextprotocol/sdk` — it depends on ajv/express/hono which are CJS and incompatible with the workerd runtime.

- Handler: `src/mcp/handler.ts` (protocol routing)
- Tools: `src/mcp/tools.ts` (pure tool functions)
- The `agents` npm package (v0.6.0) replaces the deprecated `@cloudflare/agents`.

See `docs/mcp.md` for the full tool contracts and OAuth architecture.

## Test Infrastructure

**Sharded parallelism:** `just test-worker` runs 4 vitest shards in parallel (`worker/scripts/test-sharded.mjs`), each with its own Miniflare instance. This sidesteps Miniflare's `isolatedStorage` WAL bug while giving true file-level parallelism. `npm test` still works for single-shard runs.

**Within each shard** (`vitest.config.ts`): `singleWorker: true` + `isolatedStorage: false` + `fileParallelism: false` — files run serially sharing one Miniflare instance per shard.

**Test lifecycle:**

- `setup.ts`: Creates tables (migrations) + one-time cleanup at suite start.
- `helpers.ts`: `cleanAll()` batch-deletes all D1 tables (FK-safe order) + R2 objects.
- **Every `describe` block** must have `beforeEach(cleanAll)` — NOT at module level. Module-level `beforeEach` leaks to all test files in singleWorker mode.
- **Always consume DO fetch responses** (call `.json()` or `.text()`) — unconsumed responses leave SQLite WAL files that break `isolatedStorage` if ever re-enabled.

**DO gotcha:** `DurableObject.ctx.id.toString()` returns a hex hash, NOT the original `idFromName()` string. Pass the real `userUuid` via `X-User-UUID` header if you need it inside the DO.

**Test tokens:** `getOAuthToken(userUuid)` in `test/helpers.ts` uses `getOAuthApi()` to mint real library tokens via KV without Clerk. No dev-mode code in production.

**IDE noise:** `ProvidedEnv` TS errors in tests are IDE-only; runtime works fine via Miniflare.

## Key Paths

```
worker/src/index.ts          # Routes, request handling, OAuthProvider wrapper
worker/src/hub.ts            # SourceHub Durable Object (per-source, daemon WebSocket + state)
worker/src/user-hub.ts       # UserHub Durable Object (per-user, UI WebSocket + aggregation)
worker/src/auth.ts           # Session/daemon auth (stub mode + Clerk mode)
worker/src/oauth.ts          # OAuth endpoint config, OAUTH_ENDPOINTS constant
worker/src/mcp/handler.ts    # JSON-RPC 2.0 protocol handler
worker/src/mcp/tools.ts      # Pure MCP tool functions
worker/test/helpers.ts       # cleanAll(), getOAuthToken(), test utilities
worker/test/setup.ts         # Table creation, one-time cleanup
worker/vitest.config.ts      # Per-shard config (singleWorker + isolatedStorage)
worker/scripts/test-sharded.mjs # Parallel shard runner (4 vitest processes)
worker/wrangler.toml         # Bindings, D1, R2, KV, DO
```
