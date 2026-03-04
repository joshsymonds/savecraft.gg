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

The daemon and web UI maintain persistent WebSocket connections to a per-user Durable Object (DO) that acts as a message hub. This enables real-time config delivery, live status reporting, and an interactive setup experience where users see immediate feedback as the daemon discovers and parses saves.

### Architecture: DaemonHub Durable Object

Each user gets a single Durable Object (`DaemonHub`), keyed by user UUID (`env.DAEMON_HUB.get(env.DAEMON_HUB.idFromName(userUUID))`). The DaemonHub is the per-user coordination point for all save updates, regardless of source.

**Two roles:**

1. **WebSocket relay** for daemon-backed saves. Holds up to two tagged WebSocket connections:
   - **`"daemon"` connection:** One per source. The daemon connects on startup and maintains the connection for the lifetime of the process.
   - **`"ui"` connection:** One per active web UI session. The browser connects when the user opens the device status page and disconnects when they navigate away.
   - Receives messages from one side, inspects the tag, forwards to the other. For `refresh_save` on daemon-backed games, sends `RescanGame` to the daemon.

2. **API fetch coordinator** for API-backed saves. When `refresh_save` targets an API-backed game, the DaemonHub calls the game adapter directly — fetches from the game API, shapes the response into GameState, writes to R2, and updates D1. Status events flow to the UI WebSocket the same as daemon events.

When no connections are active and no fetches are in progress, the DO hibernates and incurs zero cost.

**Why one DO per user (not shared):** Durable Objects are actors — single-threaded, pinned to a region. A shared DO serving 500 users would need internal routing tables and creates a single point of failure. Per-user DOs have zero routing logic, zero cross-user concerns, and cost nothing when idle thanks to WebSocket Hibernation. Cloudflare designed DOs for the "millions of tiny actors" pattern.

### WebSocket Hibernation

The DO uses Cloudflare's WebSocket Hibernation API. The platform holds WebSocket connections at the infrastructure level while the DO sleeps. The DO only wakes when an application-level message arrives. Protocol-level pings/pongs (keepalive) are handled by Cloudflare automatically and do not wake the DO.

Critical: no application-layer heartbeats. The UI must not send periodic pings. WebSocket protocol keepalive handles liveness. Application messages are the only things that wake the DO.

### Message Protocol

All messages are protobuf-defined with JSON encoding on the wire. The canonical schema lives in `proto/protocol.proto`. Go types are generated to `internal/proto/`, TypeScript types to `worker/src/proto/`. No mirrored types — both languages codegen from the same `.proto` file via `buf generate`.

Messages use a protobuf `oneof` envelope (`Message.payload`). Field numbers are grouped by category with gaps for future additions. Each side processes the variants it cares about and ignores the rest.

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
| 1-9 | daemon → server | Daemon lifecycle | `DaemonOnline`, `DaemonOffline` |
| 10-19 | daemon → server | Game discovery | `ScanStarted`, `ScanCompleted`, `GameDetected`, `GameNotFound`, `Watching`, `GamesDiscovered` |
| 20-29 | daemon → server | Parse lifecycle | `ParseStarted`, `PluginStatus`, `ParseCompleted`, `ParseFailed` |
| 30-39 | daemon → server | Push lifecycle | `PushStarted`, `PushCompleted`, `PushFailed` |
| 40-49 | daemon → server | Plugin mgmt | `PluginUpdated` |
| 50-59 | server → daemon | Commands | `ConfigUpdate`, `RescanGame`, `PluginAvailable`, `DiscoverGames` |
| 60-69 | server → UI | State | `SourceState` (cold-start snapshot) |
| 70-79 | UI → server → daemon | User actions | `TestPath`, `TestPathResult` |

The DO forwards all daemon status events (ranges 1-49) to the UI WebSocket if connected. On UI connect, the DO sends a `SourceState` snapshot constructed from D1 persisted events.

**Coordination:** The daemon sends `PushStarted` before the HTTP POST, `PushCompleted`/`PushFailed` after. It only sends `PushStarted` after a successful parse. If the push fails and will be retried, the daemon sends `PushFailed` with `will_retry: true`, then `PushStarted` again on retry.

### Status Persistence

The DO writes status events to a `source_events` table in D1 (last 100 events per source, older rows pruned on insert). This serves two purposes:

1. **UI cold start:** When the web UI connects, the DO loads recent events from D1 and sends them as initial state, so the page isn't blank even if the daemon hasn't sent anything recently.
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
  token_hash TEXT NOT NULL UNIQUE,   -- SHA-256 of sct_* token
  source_name TEXT NOT NULL DEFAULT '',
  link_code TEXT,                    -- 6-digit code, NULL after linking
  link_code_expires_at TEXT,         -- 20-minute TTL
  user_email TEXT,                   -- set during linking
  user_display_name TEXT,            -- set during linking
  last_push_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  user_uuid TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_source_events_user_source ON source_events(user_uuid, source_id, created_at DESC);
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
