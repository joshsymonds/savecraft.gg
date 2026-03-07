# Worker (Cloudflare)

## Push API

### `POST /api/v1/push`

Daemon pushes parsed game state to the cloud.

**Headers:**
```
Authorization: Bearer sct_<source-token>
Content-Type: application/json
X-Game: d2r
X-Parsed-At: 2026-02-25T21:30:00Z
```

**Body:** Full GameState JSON (all sections in one push). The `identity` block in the body is used by the server to resolve or create the save UUID.

**Server validation:**
1. Authenticate source token → resolve source UUID (SHA-256 hash lookup in D1 `sources` table).
2. Validate: is body valid JSON? Is it under 5MB?
3. Validate structure: does top-level have `identity` and `sections` keys?
4. Validate `X-Game` matches a known plugin.
5. Look up save UUID from identity in D1: `(source_uuid, game_id, save_name)`. Create if first push.
6. Write snapshot to `sources/{source_uuid}/saves/{save_uuid}/snapshots/{timestamp}.json` in R2.
7. Compare `X-Parsed-At` to current `latest.json` timestamp. Only update latest pointer if incoming is newer.
8. Re-index save sections in FTS5 (DELETE old rows for this save, INSERT new rows per section).

**Response:** `201 Created` with save UUID and snapshot timestamp, or appropriate error.

**Why single push, not per-section:**
- Most game states are 10-500KB of JSON. Overhead is negligible.
- One push = one atomic snapshot. No partial state, no ordering issues, no "daemon crashed mid-section-push."
- Simpler daemon code, simpler server code, simpler mental model.

## Real-Time Communication

### Overview

The daemon and web UI maintain persistent WebSocket connections to Durable Objects that coordinate real-time status. The daemon connects to a per-source SourceHub DO; the web UI connects to a per-user UserHub DO. SourceHub forwards events and state to UserHub for UI broadcast. This enables real-time config delivery, live status reporting, and an interactive setup experience where users see immediate feedback as the daemon discovers and parses saves.

### Architecture: SourceHub + UserHub Durable Objects

Real-time communication uses two Durable Object classes that separate concerns:

**SourceHub** — one per source, keyed by source UUID (`env.SOURCE_HUB.get(env.SOURCE_HUB.idFromName(sourceUUID))`). Handles daemon WebSocket connections and source-specific logic.

- Holds daemon WebSocket connections (tagged `"daemon"`, with a unique `conn:{id}` tag per connection).
- Maintains per-source state in DO transactional storage: online/offline status, game detection, parse results, push completions.
- Processes daemon messages: resolves state mutations, persists events to D1, pushes config updates.
- Auto-enables newly detected games (creates config entries, pushes config to daemon).
- Checks for daemon updates on `SourceOnline` and sends `SourceUpdateAvailable` if newer version exists.
- Forwards all events and state updates to the user's UserHub DO for UI broadcast.
- Uses an alarm to evict stale connections (sources that stop sending heartbeats).

**UserHub** — one per user, keyed by user UUID (`env.USER_HUB.get(env.USER_HUB.idFromName(userUUID))`). Handles UI WebSocket connections and aggregates state from all of the user's sources.

- Holds UI WebSocket connections (tagged `"ui"`).
- Receives forwarded events from SourceHub DOs and broadcasts to connected UI clients with `_sourceId` and `_ts` metadata injected.
- Stores per-source state snapshots (keyed by source UUID) and merges them into a single `SourceState` envelope when sending to UI clients.
- On UI connect, sends the merged state snapshot and recent events from D1 for cold-start rendering.

**Data flow:** Daemon → SourceHub (per-source) → UserHub (per-user) → UI WebSocket. Save data still flows via HTTP POST to the push API — the WebSocket carries only lightweight status events (~200 bytes each).

**Why two DOs (not one per user)?** The original design used a single per-user DO for both daemon and UI connections. Splitting to per-source SourceHub + per-user UserHub provides cleaner separation: SourceHub handles source-specific concerns (config push, game auto-enable, update checks) without needing to route between multiple sources, while UserHub simply aggregates and broadcasts. A user with two sources (PC + Steam Deck) gets two SourceHub DOs and one UserHub DO. Both hibernate when idle and incur zero cost.

### WebSocket Hibernation

Both DOs use Cloudflare's WebSocket Hibernation API. The platform holds WebSocket connections at the infrastructure level while the DO sleeps. The DO only wakes when an application-level message arrives. Protocol-level pings/pongs (keepalive) are handled by Cloudflare automatically and do not wake the DO.

Critical: no application-layer heartbeats. The UI must not send periodic pings. WebSocket protocol keepalive handles liveness. Application messages are the only things that wake the DO.

### Message Protocol

All messages use binary protobuf encoding on the wire. The canonical schema lives in `proto/protocol.proto`. Go types are generated to `internal/proto/`, TypeScript types to `worker/src/proto/` and `web/src/lib/proto/`. No mirrored types — all three targets codegen from the same `.proto` file via `buf generate`.

Two envelope types:

- **`Message`** — daemon↔server communication (both directions). Uses a protobuf `oneof` envelope (`Message.payload`). Field numbers grouped by category with gaps for future additions.
- **`RelayedMessage`** — server→browser only. Wraps a `Message` with required `source_id` and `server_timestamp` fields for event attribution. UserHub constructs this when forwarding to UI clients.

```
daemon --[binary ws, Message]--> SourceHub --[binary http, Message]--> UserHub --[binary ws, RelayedMessage]--> browser
                                     |                                    |
                                D1 (JSON)                           DO storage (JSON)
```

JSON is used only at storage boundaries (D1 event persistence, DO per-source state). All transport is binary proto.

**Save data does not flow through the WebSocket.** The daemon pushes parsed GameState JSON to the server via HTTP POST (`/api/v1/push`). The WebSocket carries only lightweight status events (~200 bytes each). This keeps the Durable Object cheap and simple.

**Full lifecycle for a save update (daemon → server → UI):**

```
ScanStarted       → "Scanning /home/deck/.local/share/D2R/..."
ScanCompleted     → "Found 3 files: Hammerdin.d2s, Sorceress.d2s, SharedStash.d2i"
ParseStarted      → "Parsing Hammerdin.d2s..."
PluginStatus      → "Decoding inventory (247 items)"     [optional, from plugin stdout]
ParseCompleted    → "Parsed: Hammerdin, Level 89 Paladin (8 sections, 47KB)"
PushStarted       → "Uploading Hammerdin (47KB)..."
PushCompleted     → "✓ Uploaded Hammerdin (47KB) in 340ms"
```

**On parse failure:**

```
ParseStarted      → "Parsing SharedStash.d2i..."
ParseFailed       → "✗ Parse failed: unsupported format version 0x62"
```

**On push failure with retry:**

```
PushStarted       → "Uploading Hammerdin (47KB)..."
PushFailed        → "✗ Upload failed: 503 — will retry in 2s"
PushStarted       → "Uploading Hammerdin (47KB)..."
PushCompleted     → "✓ Uploaded Hammerdin (47KB) in 280ms"
```

**Message categories:**

| Range | Direction | Category | Messages |
|-------|-----------|----------|----------|
| 1-9 | daemon → server | Source lifecycle | `SourceOnline`, `SourceOffline`, `SourceHeartbeat` |
| 10-19 | daemon → server | Game discovery | `ScanStarted`, `ScanCompleted`, `GameDetected`, `GameNotFound`, `Watching`, `GamesDiscovered` |
| 20-29 | daemon → server | Parse lifecycle | `ParseStarted`, `PluginStatus`, `ParseCompleted`, `ParseFailed` |
| 30-39 | daemon → server | Push lifecycle | `PushStarted`, `PushCompleted`, `PushFailed` |
| 40 | daemon → server | Plugin mgmt | `PluginUpdated` |
| 41-43 | server → daemon | Source updates | `SourceUpdateAvailable`, `SourceUpdateStarted`, `SourceUpdateFailed` |
| 44-45 | daemon → server | Plugin errors | `PluginUpdateCheckFailed`, `PluginDownloadFailed` |
| 50-53 | server → daemon | Commands | `ConfigUpdate`, `RescanGame`, `PluginAvailable`, `DiscoverGames` |
| 54 | daemon → server | Config results | `ConfigResult` |
| 60-69 | server → UI | State | `SourceState` (cold-start snapshot) |
| 70-79 | UI → server → daemon | User actions | `TestPath`, `TestPathResult` |

SourceHub forwards all daemon status events (ranges 1-45, 54) to UserHub as binary proto via internal HTTP POST. UserHub wraps each event in a `RelayedMessage` (stamping `source_id` and `server_timestamp`) and sends binary to connected UI WebSockets. On UI connect, UserHub sends a merged `SourceState` snapshot (aggregated from all of the user's SourceHub DOs) and recent events from D1, all wrapped in `RelayedMessage`.

**Coordination:** The daemon sends `PushStarted` before the HTTP POST, `PushCompleted`/`PushFailed` after. It only sends `PushStarted` after a successful parse. If the push fails and will be retried, the daemon sends `PushFailed` with `will_retry: true`, then `PushStarted` again on retry.

### Status Persistence

SourceHub writes status events to a `source_events` table in D1 (last 100 events per source, older rows pruned on insert). This serves two purposes:

1. **UI cold start:** When the web UI connects to UserHub, it loads recent events from D1 and sends them as initial state, so the page isn't blank even if the daemon hasn't sent anything recently.
2. **Diagnostics:** Persisted events can be queried for debugging ("when did my daemon last successfully parse?").

## Reference Query API (Workers for Platforms)

### `POST /api/v1/reference/{game_id}/query`

Dispatches a reference data query to a game's reference Worker via Workers for Platforms. Authenticated.

**How it works:** The main Worker calls `env.REFERENCE_PLUGINS.get("{game_id}-reference")` to get a `Fetcher` for the reference Worker, then forwards the request body as a POST. The reference Worker executes the WASM module with the query on stdin and returns ndjson on stdout.

**Response:** The reference Worker's response is passed through — typically `application/x-ndjson` with status 200 (success) or 422 (query error).

**404:** Returned if no reference Worker is deployed for the given game ID.

This endpoint is also accessible via the `query_reference` MCP tool (see `docs/mcp.md`).

### Dispatch Namespace Binding

```toml
# wrangler.toml
[[dispatch_namespaces]]
binding = "REFERENCE_PLUGINS"
namespace = "savecraft-reference-plugins"        # production
# staging uses "savecraft-reference-plugins-staging"
```

The `DispatchNamespace` binding provides `.get(scriptName)` which returns a `Fetcher`. Each reference plugin Worker is deployed to the namespace with the naming convention `{game_id}-reference`.

**Cost:** Workers for Platforms is $25/month flat, included in the Workers Paid plan. No per-dispatch charges beyond standard Workers pricing.

## D1 Schemas

**Sources table (source registration + linking):**

```sql
CREATE TABLE sources (
  source_uuid TEXT PRIMARY KEY,
  user_uuid TEXT,                    -- NULL until linked to a user
  user_email TEXT,                   -- set during linking
  user_display_name TEXT,            -- set during linking
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of sct_* token
  link_code TEXT,                    -- 6-digit code, NULL after linking
  link_code_expires_at TEXT,         -- 20-minute TTL
  hostname TEXT,                     -- set during registration
  os TEXT,                           -- e.g. "linux", "windows", "darwin"
  arch TEXT,                         -- e.g. "amd64", "arm64"
  source_kind TEXT NOT NULL DEFAULT 'daemon',  -- "daemon" or "mod"
  can_rescan INTEGER NOT NULL DEFAULT 1,
  can_receive_config INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_push_at TEXT
);
```

Sources start unlinked (`user_uuid IS NULL`) with a 6-digit `link_code`. When the user enters the code in the web UI, the source is linked (`user_uuid` set, `link_code` cleared). The daemon can refresh an expired link code via `POST /api/v1/source/link-code`.

**Saves table (identity → save UUID mapping):**

```sql
CREATE TABLE saves (
  uuid TEXT PRIMARY KEY,
  source_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  save_name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_uuid, game_id, save_name),
  FOREIGN KEY (source_uuid) REFERENCES sources(source_uuid)
);
```

Saves belong to sources. To find all saves for a user, JOIN through sources: `saves JOIN sources ON saves.source_uuid = sources.source_uuid WHERE sources.user_uuid = ?`.

**Source events table (status persistence):**

```sql
CREATE TABLE source_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_uuid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_source_events_source ON source_events(source_uuid, created_at DESC);
```

## Source API Endpoints

### `POST /api/v1/source/register` (unauthenticated)

Daemon calls this on first boot to self-register. Returns a source token and 6-digit link code.

**Request body:**
```json
{ "source_name": "Josh's PC" }
```

**Response (201):**
```json
{
  "source_uuid": "d1e2f3a4-...",
  "token": "sct_abc123...",
  "link_code": "482913",
  "link_code_expires_at": "2026-03-03T12:20:00Z"
}
```

The daemon persists the `source_uuid` and `token` locally. The token is the only credential — it authenticates all subsequent API calls.

### `POST /api/v1/source/link` (Clerk session auth)

Web UI calls this when the user enters a 6-digit code. Links the source to the authenticated user.

**Request body:**
```json
{
  "code": "482913",
  "email": "josh@example.com",
  "display_name": "Josh"
}
```

**Response (200):**
```json
{ "source_uuid": "d1e2f3a4-..." }
```

Linking is idempotent — a source can be re-linked to a different user (overwrites the previous association).

### `POST /api/v1/source/link-code` (source token auth)

Daemon calls this to refresh an expired link code. Returns a new 6-digit code with a fresh 20-minute TTL.

**Response (200):**
```json
{
  "link_code": "719284",
  "expires_at": "2026-03-03T12:40:00Z"
}
```

### `GET /api/v1/source/status` (source token auth)

Returns the source's current state: whether it's linked, the associated user, and any active link code.

**Response (200):**
```json
{
  "linked": true,
  "user": { "email": "josh@example.com", "display_name": "Josh" },
  "link_code": null,
  "link_code_expires_at": null
}
```

## Orphan Source Reaper

A daily Cron Trigger (4 AM UTC) cleans up orphan sources — unlinked sources with no push activity for 7+ days. The reaper:

1. Finds sources where `user_uuid IS NULL` and both `created_at` and `last_push_at` are older than 7 days
2. Deletes R2 data under `sources/{source_uuid}/`
3. Deletes D1 saves belonging to the source
4. Deletes the source row

This prevents abandoned registrations from accumulating. Active unlinked sources (still pushing) and linked sources (regardless of activity) are never reaped.

## Cost

Durable Objects require the Workers Paid plan ($5/month), which you'd hit anyway at any real traffic level.

**Per-request pricing:** $0.15 per million DO requests. Each WebSocket message that wakes a hibernating DO counts as one request.

At 1K users with active daemons:
- Config pushes: ~2-3 per user per month (rare)
- Status events per active play session: ~10-50 parse events + watching notifications
- Heartbeats: none (protocol-level keepalive, no DO wake)
- Web UI connections: sporadic, only when user is on the status page

Estimated ~300K DO requests/day at 1K active users → ~9M/month → **$1.35/month**. Duration charges are pennies (each handler runs <5ms). At 10K users: ~$13.50/month. Negligible.

## Debug Introspection

Admin endpoints for inspecting Durable Object internal state, connections, and logs. Designed for CLI/curl access and AI agent debugging.

### Architecture

Three complementary layers:

1. **In-memory ring buffer** — Each DO holds the last 200 structured log entries (`{ ts, level, msg, ctx }`). Fast, zero storage cost, lost on DO eviction. Queryable via `/debug/log`. Also emits structured JSON to `console.log` for `wrangler tail`.
2. **Admin HTTP endpoints** — Worker-level router at `/admin/*` with API key auth. Fans out to the correct DO for state/connection/log inspection, or queries D1 directly for source listing and event history.
3. **D1 event persistence** — Protocol events and internal errors stored in `source_events` for post-mortem debugging. Internal errors (catch block failures) persisted as `internalError` event type with context and stack trace.

### Auth Setup

```bash
# Set the admin API key (production)
wrangler secret put ADMIN_API_KEY --env production

# Set for staging
wrangler secret put ADMIN_API_KEY --env staging

# For local dev, add to .dev.vars:
# ADMIN_API_KEY=your-local-dev-key
```

All admin requests require `Authorization: Bearer <ADMIN_API_KEY>`.

### Endpoints

#### Discovery

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/sources` | List all sources from D1 (uuid, user, hostname, kind, timestamps) |
| `GET` | `/admin/source/:uuid/events` | D1 source_events for a source. `?limit=N` (default 50, max 500) |

#### SourceHub Debug (per-source DO)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/source/:uuid/debug/state` | Full state snapshot: sourceState, sourceUuid, userUuid, sourceMeta, alarm |
| `GET` | `/admin/source/:uuid/debug/connections` | Active daemon WebSocket count and connection tags |
| `GET` | `/admin/source/:uuid/debug/log` | Ring buffer entries. `?level=error&limit=50` |
| `GET` | `/admin/source/:uuid/debug/storage` | List all DO transactional storage keys |

#### UserHub Debug (per-user DO)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/user/:uuid/debug/state` | Merged source state, userUuid |
| `GET` | `/admin/user/:uuid/debug/connections` | Active UI WebSocket count |
| `GET` | `/admin/user/:uuid/debug/log` | Ring buffer entries. `?level=error&limit=50` |
| `GET` | `/admin/user/:uuid/debug/storage` | List all DO transactional storage keys |

### Example Debugging Workflow

```bash
KEY="your-admin-api-key"
API="https://api.savecraft.gg"

# 1. Find the source UUID
curl -s -H "Authorization: Bearer $KEY" "$API/admin/sources" | jq '.sources[] | {source_uuid, user_uuid, hostname}'

# 2. Check if daemon is connected
curl -s -H "Authorization: Bearer $KEY" "$API/admin/source/$UUID/debug/connections" | jq .

# 3. Inspect current state
curl -s -H "Authorization: Bearer $KEY" "$API/admin/source/$UUID/debug/state" | jq .

# 4. Check recent errors in the ring buffer
curl -s -H "Authorization: Bearer $KEY" "$API/admin/source/$UUID/debug/log?level=error" | jq '.entries[]'

# 5. Check D1 event history (post-mortem)
curl -s -H "Authorization: Bearer $KEY" "$API/admin/source/$UUID/events?limit=20" | jq '.events[] | {event_type, created_at}'

# 6. Check internal errors specifically
curl -s -H "Authorization: Bearer $KEY" "$API/admin/source/$UUID/events?limit=50" | jq '.events[] | select(.event_type == "internalError")'

# 7. Check DO storage keys
curl -s -H "Authorization: Bearer $KEY" "$API/admin/source/$UUID/debug/storage" | jq .

# 8. Real-time tailing (structured JSON via console.log)
wrangler tail --env production --format json
```

### Ring Buffer Behavior

- **Size:** 200 entries per DO instance (configurable)
- **Ordering:** Newest first when queried
- **Persistence:** In-memory only — survives WebSocket Hibernation sleep but lost on DO eviction or deployment
- **Output:** Each entry also written to `console.log` as structured JSON for `wrangler tail`
- **Levels:** `debug`, `info`, `warn`, `error`

### What Gets Logged

**SourceHub:** daemon WebSocket accepted/closed/error, message received (with payload type), state mutations applied/failed, alarm fired/rescheduled, stale source eviction, UserHub forwarding failures, D1 persistence failures, config push failures, source update availability, game auto-enable events.

**UserHub:** UI WebSocket accepted/closed/error, event forwarding to UI clients, state updates per source, source removal, recent events load failures.

### Internal Error Events

Previously silent `catch {}` blocks now persist `internalError` events to D1 `source_events` with:
- `context`: which method failed (e.g. `applySourceState`, `forwardEventToUserHub`)
- `error`: error message
- `stack`: stack trace (when available)

These are best-effort — if D1 itself is down, the ring buffer still has the error.
