---
name: debugging-durable-objects
description: Debugs Savecraft Durable Objects (SourceHub, UserHub) using the admin introspection API. Use when investigating source connectivity issues, events not reaching UI, DO state problems, daemon connection failures, stale sources, or internal errors. Triggers on "source not online", "events missing", "DO state", "debug source", "debug user", "admin API", "ring buffer", "internal error", or any DO troubleshooting.
---

# Debugging Durable Objects

Use the admin introspection API to diagnose SourceHub and UserHub issues. Full architecture details in `docs/worker.md` under "Debug Introspection".

## Auth

All admin endpoints require `Authorization: Bearer $ADMIN_API_KEY`.

| Environment | Where the key lives |
|-------------|-------------------|
| Production | `wrangler secret` (set via `wrangler secret put ADMIN_API_KEY --env production`) |
| Staging | `wrangler secret` (set via `wrangler secret put ADMIN_API_KEY --env staging`) |
| Local dev | `worker/.dev.vars` → `ADMIN_API_KEY=...` |
| Tests | `worker/vitest.config.ts` miniflare bindings |

Base URLs: production `https://api.savecraft.gg`, staging `https://staging-api.savecraft.gg`, local `http://localhost:8787`.

## Endpoints

### Discovery (D1)

| Endpoint | Returns |
|----------|---------|
| `GET /admin/sources` | All sources: `source_uuid`, `user_uuid`, `hostname`, `source_kind`, timestamps. Capped at 200. |
| `GET /admin/source/:uuid/events?limit=N` | D1 `source_events` rows (default 50, max 500). Includes `event_type`, `event_data`, `created_at`. |

### SourceHub Debug (per-source DO)

| Endpoint | Returns |
|----------|---------|
| `GET /admin/source/:uuid/debug/state` | `sourceState` (sources array with online/lastSeen/games), `sourceUuid`, `userUuid`, `sourceMeta`, `alarm` timestamp |
| `GET /admin/source/:uuid/debug/connections` | `daemonCount`, `connections` array with tags per socket |
| `GET /admin/source/:uuid/debug/log?level=X&limit=N` | Ring buffer entries (newest first). Levels: `debug`, `info`, `warn`, `error`. Limit capped at 200. |
| `GET /admin/source/:uuid/debug/storage` | All DO transactional storage key names |

### UserHub Debug (per-user DO)

| Endpoint | Returns |
|----------|---------|
| `GET /admin/user/:uuid/debug/state` | `mergedState` (all sources merged), `userUuid` |
| `GET /admin/user/:uuid/debug/connections` | `uiCount` (active UI WebSocket count) |
| `GET /admin/user/:uuid/debug/log?level=X&limit=N` | Ring buffer entries. Same filters as SourceHub. |
| `GET /admin/user/:uuid/debug/storage` | All DO storage key names |

## Two Data Sources

| Source | What it captures | Lifetime | Use for |
|--------|-----------------|----------|---------|
| **Ring buffer** (`/debug/log`) | All DO activity: connections, mutations, forwarding, errors | In-memory, 200 entries, lost on DO eviction/deploy | Live debugging, recent activity |
| **D1 events** (`/events`) | Protocol events + `internalError` catch-block failures | Persistent, last 100 per source | Post-mortem, historical patterns |

Ring buffer entries also emit to `console.log` as structured JSON — use `wrangler tail --env production --format json` for real-time streaming.

## Debugging Workflows

### Source not showing online

```
1. GET /admin/sources → find source_uuid
2. GET /admin/source/:uuid/debug/connections
   → daemonCount: 0? Daemon WS never connected or was dropped.
     Check daemon logs for connection errors.
   → daemonCount: 1+? DO thinks daemon is connected. Continue.
3. GET /admin/source/:uuid/debug/state
   → sources[].online: false? State mutation failed.
     Check /debug/log?level=error for "state mutation failed".
   → userUuid: null? SourceHub doesn't know which user owns this source.
     Source may not be linked. Check D1: source has user_uuid?
4. GET /admin/user/:uuid/debug/state
   → Source missing from mergedState? SourceHub→UserHub forwarding broken.
     Check SourceHub /debug/log for "forward state to UserHub failed".
5. GET /admin/user/:uuid/debug/connections
   → uiCount: 0? No browser connected. UI issue, not DO issue.
```

### Events not reaching UI

```
1. GET /admin/source/:uuid/debug/log
   → Look for "message received" entries — daemon IS sending events.
   → Look for "forwarding event to UI" — SourceHub IS forwarding to UserHub.
2. GET /admin/source/:uuid/debug/state → check userUuid is set
3. GET /admin/user/:uuid/debug/log
   → Look for "forwarding event to UI" with uiCount > 0.
   → uiCount: 0 means no UI client to receive.
4. GET /admin/source/:uuid/events
   → Events in D1? Then persistence works but forwarding doesn't.
   → No events? Check SKIP_PERSIST set — some event types are intentionally skipped.
```

### Internal errors / silent failures

```
1. GET /admin/source/:uuid/debug/log?level=error
   → Shows all catch-block errors with context
2. GET /admin/source/:uuid/events?limit=50
   → Filter for event_type = "internalError"
   → Each has: context (which method), error message, stack trace
3. Common internal errors:
   - "forward state to UserHub failed" → UserHub DO unreachable
   - "event persistence failed" → D1 write error (NOT retried to avoid recursion)
   - "config push failed" → D1 source_configs query or WS send failed
   - "state mutation failed" → DO storage read/write error
```

### Stale source (shows online but daemon is gone)

```
1. GET /admin/source/:uuid/debug/state
   → Check sources[].lastSeen — how old?
   → Check alarm — is the reaper alarm scheduled?
2. The alarm fires every 30s (ALARM_INTERVAL_MS).
   Sources with lastSeen > 90s (STALE_THRESHOLD_MS) get evicted.
3. If alarm is null and source shows online → alarm was deleted prematurely.
   Check /debug/log for "alarm fired" / "alarm rescheduled" entries.
```

## Security

- API key comparison uses `crypto.subtle.timingSafeEqual` (not `===`)
- Debug subpaths are allowlisted: only `state`, `connections`, `log`, `storage`
- Admin endpoints are read-only — no state mutation possible through them
- The admin router is in `worker/src/admin.ts`
