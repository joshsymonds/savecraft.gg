# API Game Adapters

## What Adapters Are

Adapters are server-side TypeScript modules that fetch game state from external APIs and produce the same `GameState` shape that daemon WASM plugins produce. They exist because some games expose character data via web APIs rather than local save files.

The daemon is not involved. There are no local files to watch, no WASM to run, no plugin binary to sign and distribute. Adapters are first-party code that runs in the Worker.

## Why Not WASM

The daemon plugin model is built around untrusted community code processing local files: sandboxed WASM, Ed25519 signatures, no network access. API adapters break every one of those constraints:

- **Network access** to hit game APIs
- **Credentials** (OAuth tokens, API keys) that must be handled server-side
- **Rate limiting** shared across all users of the same app credentials
- **No daemon dependency** — the user doesn't need local software for API-backed games

The trust model is also different. Daemon plugins are community-contributed WASM binaries that run on the user's machine — the sandbox is essential. Adapters are TypeScript modules in the Savecraft codebase, reviewed via PR, deployed with the Worker. The code review is the trust boundary, not a sandbox.

## Plugin Directory Structure

API plugins are structurally parallel to WASM plugins. They live in `plugins/{game_id}/` with a `plugin.toml`, adapter TypeScript code, and a Justfile:

```
plugins/wow/
  plugin.toml              # Game metadata + [adapter] section
  adapter/
    index.ts               # Implements ApiAdapter interface
    types.ts               # Battle.net / Raider.io API response types
    sections.ts            # Maps API responses -> GameState sections
  Justfile                 # just build -> manifest.json
```

This mirrors the WASM plugin layout:

```
plugins/d2r/
  plugin.toml              # Game metadata
  parser/
    main.go                # stdin bytes -> ndjson stdout
  reference/
    main.go                # JSON query -> ndjson result
  d2s/                     # Shared parsing code
  Justfile                 # just build -> parser.wasm + reference.wasm
```

A new API plugin is one directory. The plugin.toml `source` field distinguishes the two types: `"wasm"` for daemon plugins, `"api"` for API adapters.

### plugin.toml for API Plugins

```toml
game_id = "wow"
source = "api"
icon = "icon.svg"
name = "World of Warcraft"
description = "Character profiles via Battle.net API with Raider.io ranking enrichment"
channel = "beta"
coverage = "partial"
file_extensions = []       # Empty — no local files
homepage = "https://savecraft.gg/plugins/wow"

limitations = [
  "Character data updates on logout, not in real-time",
  "Bag and bank inventory not available (API limitation)",
  "Combat performance data not included (see Warcraft Logs integration roadmap)",
]

[author]
name = "Josh Symonds"
github = "joshsymonds"

[default_paths]            # Empty — no local files

[adapter]
auth_provider = "battlenet"
auth_flow = "oauth2_code"
scopes = ["wow.profile", "openid"]
regions = ["us", "eu", "kr", "tw"]
```

The `[adapter]` section declares:

| Field | Purpose |
|-------|---------|
| `auth_provider` | Identifies the OAuth provider (used by Worker OAuth routes) |
| `auth_flow` | OAuth grant type (`oauth2_code` for authorization code flow) |
| `scopes` | OAuth scopes to request |
| `regions` | Supported API regions (used in OAuth URL construction and API calls) |

### Manifest Generation

`just build` in the plugin directory runs `cmd/plugin-manifest`, which reads `plugin.toml` and generates `manifest.json`. For API plugins (`source = "api"`), the manifest generator:

- Skips WASM file hashing (no `parser.wasm` or `reference.wasm`)
- Omits `sha256` and `url` fields
- Includes the `[adapter]` section in the manifest JSON
- Deploys to R2 at `plugins/{game_id}/manifest.json`, same as WASM plugins

The web UI and MCP `list_games` tool discover API games through the same manifest scan as WASM games. The `source` field tells consumers whether a game is daemon-backed or API-backed.

## Architecture

```
MCP tool call (refresh_save / get_section / etc.)
  -> Worker identifies save as API-backed (source_kind='adapter' in D1)
  -> Worker looks up adapter in registry by game_id
  -> Worker calls adapter.fetchState(credentials, characterId, env)
      -> adapter fetches from game API (Battle.net, Raider.io, etc.)
      -> adapter transforms responses -> GameState
  -> Worker stores via existing R2/D1/FTS pipeline (storePush)
  -> MCP tool returns data to AI client
```

### Worker Registry

The Worker imports adapters at build time via a static registry:

```typescript
// worker/src/adapters/registry.ts
import { wowAdapter } from '../../../plugins/wow/adapter';

export const adapters: Record<string, ApiAdapter> = {
  wow: wowAdapter,
};
```

Adding a new API plugin = one new directory under `plugins/` + one import line in the registry.

The shared adapter interface and types live in `worker/src/adapters/adapter.ts`. This is the only adapter code in the Worker — all game-specific logic is in the plugin directory.

### Adapter Interface

```typescript
// worker/src/adapters/adapter.ts

type AdapterErrorCode =
  | "token_expired"      // User's OAuth token invalid, needs re-auth
  | "rate_limited"       // API budget exhausted, try later
  | "api_unavailable"    // Primary API is down (transient)
  | "character_not_found" // Character deleted or transferred
  | "partial_failure";   // Some data sources failed (enrichment degraded)

class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly retryAfter?: number;   // Seconds until retry (for rate_limited)
  readonly userAction?: string;   // What the user should do (for token_expired)
}

interface EnrichmentStatus {
  source: string;              // e.g. "raiderio"
  available: boolean;
  crawledAt?: string;          // ISO 8601, when the source last crawled this data
  unavailableReason?: string;  // Human-readable reason if unavailable
}

interface GameStateSection {
  description: string;
  data: unknown;
  enrichment?: EnrichmentStatus[];  // Status of non-primary data sources
}

interface ApiAdapter {
  gameId: string;
  gameName: string;

  /** OAuth configuration for the auth redirect flow. */
  getOAuthConfig(region: string, env: Env): OAuthConfig;

  /**
   * Discover saves (characters/profiles) after OAuth.
   * Called during setup and when refreshing the character list.
   * Returns all trackable entities; caller handles reconciliation.
   * @throws {AdapterError} code=token_expired | api_unavailable
   */
  discoverSaves(accessToken: string, region: string): Promise<DiscoveredSave[]>;

  /**
   * Fetch full game state for one save.
   * When an enrichment source is unavailable, MUST still return primary data
   * with enrichment status on affected sections.
   * @throws {AdapterError} code=token_expired | rate_limited | character_not_found | api_unavailable
   */
  fetchState(params: FetchParams, env: Env): Promise<GameState>;
}

interface DiscoveredSave {
  saveName: string;                    // "Thrallgar-Illidan-US"
  characterId: string;                 // Stable ID surviving renames/transfers
  displayName: string;                 // "Thrallgar"
  metadata: Record<string, unknown>;   // { class: "Warrior", level: 80, realm: "Illidan" }
}

interface FetchParams {
  characterId: string;
  region: string;
  credentials: GameCredentials;
}

interface GameCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}
```

The output is the same `GameState` that daemon plugins produce — `identity`, `summary`, `sections`. Everything downstream is identical: R2 snapshots, D1 metadata, FTS indexing, MCP tools, notes, search.

### Error Handling

Adapter errors are typed via `AdapterError` so the Worker and MCP layer can give the AI actionable information.

| Error Code | Meaning | MCP Response |
|------------|---------|--------------|
| `token_expired` | OAuth token invalid, refresh failed | "Your Battle.net connection expired. Reconnect at savecraft.gg/settings." |
| `rate_limited` | API budget exhausted | "Too many refreshes. Try again in {retryAfter} seconds." |
| `api_unavailable` | Primary API is down | "Blizzard's API is temporarily unavailable. Try again shortly." |
| `character_not_found` | Character deleted or transferred | "Character not found. They may have been deleted or transferred." |
| `partial_failure` | Enrichment source failed | Not thrown — handled via `enrichment` field on sections |

**Token refresh failure path:** Before calling `fetchState`, the Worker checks `game_credentials.expires_at`. If expired, it attempts a refresh using the stored refresh token. If refresh fails (token revoked, user changed password), the Worker throws `AdapterError` with `code: "token_expired"` and `userAction: "Reconnect your Battle.net account at savecraft.gg/settings"`. The MCP layer passes this message to the AI, which relays it to the user.

**Partial failure (enrichment degradation):** When Raider.io (or any enrichment source) is unavailable, the adapter does NOT throw. Instead, it returns the GameState with primary data fully populated and sets `enrichment` on affected sections:

```json
{
  "description": "Mythic+ season scores, per-dungeon bests, and rankings",
  "data": { "rating": 2340, "best_runs": [...] },
  "enrichment": [{
    "source": "raiderio",
    "available": false,
    "unavailableReason": "Raider.io API returned 503"
  }]
}
```

The AI sees the enrichment status and can tell the user: "I have your M+ scores from Blizzard but Raider.io rankings aren't available right now."

### Character Lifecycle

WoW characters get deleted, transferred to other realms, and renamed. The adapter handles this through reconciliation during character discovery.

**Stable identity:** Blizzard provides a stable numeric character ID that survives transfers and renames. The `linked_characters.character_id` stores this stable ID, not the realm-name slug.

**Reconciliation:** When `discoverSaves()` runs (initial setup or user clicks "Refresh Characters"), the Worker compares the API response against `linked_characters` by stable character ID:

| Situation | API returns | linked_characters has | Action |
|-----------|------------|----------------------|--------|
| New character | `char_id: 12345` | nothing | Insert into `linked_characters`, create save |
| Unchanged | `char_id: 12345, name: Thrallgar, realm: Illidan` | same | Update metadata (level, etc.) |
| Transferred | `char_id: 12345, realm: Stormrage` | `realm: Illidan` | Update realm, update save name |
| Renamed | `char_id: 12345, name: Grommash` | `name: Thrallgar` | Update name, update save name |
| Deleted | — | `char_id: 12345` | Set `active = 0` (soft-delete, preserves history) |

**Save name updates:** When a character's realm or name changes, the save's `save_name` is updated via `UPDATE` on the saves table. The save UUID, R2 snapshots, and notes are preserved — the name is just a key that can be changed.

### Convergence Point

| | File Parsers (Daemon) | API Adapters (Worker) |
|---|---|---|
| **Code location** | `plugins/{game_id}/parser/` (Go) | `plugins/{game_id}/adapter/` (TypeScript) |
| **Runtime** | WASM via wazero | TypeScript in Worker |
| **Trigger** | Filesystem event | On-demand (MCP tool / web UI) |
| **Input** | Raw file bytes | Game API response(s) |
| **Trust model** | Sandboxed, community code | Reviewed, first-party code |
| **Output** | GameState | GameState |
| **Storage** | Push API -> R2/D1/FTS | Direct -> R2/D1/FTS (same `storePush`) |
| **Manifest** | `source = "wasm"`, has sha256/url | `source = "api"`, has adapter config |

## Source Model

API-backed games use the existing source-centric ownership model. When a user connects a game API account, a source is created with `source_kind = 'adapter'`.

**One source per user per API game.** A WoW user with 15 characters has one source (`Battle.net . Josh#1234`) with 15 saves (one per character). This matches how daemon sources work: one daemon per machine, many saves.

**Source capabilities:**

| Capability | Value | Reason |
|------------|-------|--------|
| `can_rescan` | 0 | No filesystem to scan |
| `can_receive_config` | 0 | No save path to configure |

The web UI uses these flags to hide filesystem-specific UI (path editor, rescan button) for adapter sources.

**Ownership chain:** `User -> Source (adapter) -> Saves (characters)`. Same JOIN path as daemon sources. MCP and web UI access saves transparently regardless of source kind.

### Source Lifecycle

1. User clicks "Add WoW" in GamePickerModal
2. Web UI detects `source = "api"` in manifest, renders adapter-specific setup
3. User picks region, clicks "Link Battle.net" -> OAuth redirect
4. Callback: Worker exchanges code for tokens, stores encrypted in `game_credentials`
5. Worker calls `adapter.discoverSaves(token, region)` -> character list
6. User selects characters to track (level 70+ shown by default)
7. Worker creates source (`source_kind = 'adapter'`, name = `Battle.net . BattleTag`)
8. Worker stores selected characters in `linked_characters` table
9. Worker calls `adapter.fetchState()` for each selected character -> initial data load
10. Source appears in SourceStrip, saves appear in GamePanel

## Staleness and Refresh

### Data Staleness Characteristics

**Blizzard API:** Character data updates on logout (or character switch), not on equip, quest completion, or dungeon clear. During a 3-hour raid session, the API profile is frozen. The API returns a `Last-Modified` header indicating when the data was last updated.

**Raider.io:** Crawls Blizzard's M+ leaderboards continuously. A completed key typically takes 30-60 minutes to appear. Ranking percentiles shift as the crawl processes new runs across all players.

### Staleness Metadata

Every section includes timestamps so the AI can reason about freshness:

- `data_as_of` — Blizzard API's `Last-Modified` timestamp (when the player last logged out)
- `raiderio_crawled_at` — when Raider.io last crawled this data (where applicable)

The AI uses these to decide when to suggest a refresh: "This data is from when you last logged out 4 hours ago — want me to refresh?"

### v1 Strategy: On-Demand Only

No background polling. `refresh_save` is the sole trigger.

- **Explicit refresh:** Player says "I just logged out, check my new gear." AI calls `refresh_save`.
- **Staleness-aware conversation:** AI reads `data_as_of`, sees it's hours old, proactively calls `refresh_save` before giving advice.
- **Initial load:** On OAuth connection, full refresh of all discovered characters.
- **No-op detection:** If the player hasn't logged out since last refresh, the Blizzard API returns identical data. The AI should not repeatedly refresh without reason.

### Future: Activity-Gated Background Polling (v2)

If stale data at conversation start proves to be a friction point, add periodic background refresh — but only for characters the user has queried via MCP in the last 24-48 hours. Unqueried alts should not burn API budget.

## Rate Limiting

### Blizzard API

36,000 requests/hour (100/sec burst), per-application. A full character fetch is ~6-7 API calls.

| Scale | Calls | Budget Impact |
|-------|-------|---------------|
| 1 user, 10 characters | 60-70 | Negligible |
| 1,000 users simultaneously | 60,000-70,000 | Exceeds hourly budget |

**Implementation:** Two layers:
1. **Per-user rate limiter:** Max 1 full refresh per character per 5 minutes. Prevents runaway refresh loops.
2. **Shared rate limiter DO:** Keyed by `"wow"`. Throttles total outbound requests to stay within app budget. Prevents thundering herd on popular events (patch day, season start).

### Raider.io

300 requests/minute per IP. Comfortable for individual refreshes. Batch operations (initial account scan of 15+ characters) should pace requests with a short delay between characters.

## Web UI Setup Flow

GameConfigModal detects API games (`source = "api"` in manifest) and renders an adapter-specific setup view instead of the filesystem path editor.

**WoW setup flow:**

1. GamePickerModal shows WoW with description from manifest
2. User selects WoW -> modal shows region picker + "Link Battle.net" button
3. OAuth redirect -> Battle.net -> callback
4. Callback discovers characters, redirects back to web UI with character list
5. Character picker: checkboxes for each character (level 70+), showing name, realm, class, level
6. User confirms -> source created, characters linked, initial fetch begins
7. Success state shows in GamePanel with character saves appearing in real time

For v1, the setup component is built directly in the web app — not a plugin-provided Svelte component. If many API plugins with diverse setup flows emerge later, a generic schema-driven system can be extracted.

## WoW (Battle.net + Raider.io) — First Adapter

### Data Sources

**Blizzard API (primary):**
- Auth: Battle.net OAuth 2.0 with stored tokens (encrypted in D1, automatic refresh)
- Rate limit: 36,000 req/hour (100/sec burst), per-application
- Namespaces: `profile-{region}` for character data, `static-{region}` / `dynamic-{region}` for game data
- Character data updates on logout, not in real-time
- Multi-character: single OAuth grant returns all characters via account profile endpoint

**Raider.io (enrichment):**
- Auth: None (unauthenticated REST API)
- Rate limit: 300 req/min per IP
- Endpoint: `https://raider.io/api/v1/characters/profile` with field selectors
- Adds pre-computed rankings, percentiles, and score context
- Lags Blizzard by 30-60 minutes for new M+ completions

### Authentication Model

OAuth tokens are stored encrypted in `game_credentials` with automatic refresh. This differs from the "discard token" approach initially considered — the account profile endpoint requires a user token, and token refresh avoids forcing users to re-authorize every 24 hours.

**OAuth flow:**

1. User clicks "Connect Battle.net" in web UI
2. Redirect to `https://oauth.battle.net/authorize` with scopes `wow.profile` + `openid`
3. User authenticates with Battle.net
4. Callback receives authorization code
5. Worker exchanges code for access + refresh tokens (server-to-server)
6. Tokens encrypted and stored in D1 keyed by `(user_uuid, "wow")`
7. Worker calls account profile to discover characters
8. Worker triggers initial refresh for all discovered characters

Token refresh is automatic — the adapter checks `expires_at` before each API call.

**Worker routes:**

| Route | Purpose |
|-------|---------|
| `GET /oauth/battlenet/authorize?region=us` | Redirect to Battle.net OAuth |
| `GET /oauth/battlenet/callback` | Exchange code, discover characters, redirect to web UI |
| `POST /api/v1/adapters/wow/characters` | Select characters to track (creates source + linked_characters) |
| `POST /api/v1/adapters/{gameId}/refresh/{saveId}` | Explicit refresh trigger |

### GameState Schema

**Identity:**

```json
{
  "identity": {
    "saveName": "Thrallgar-Illidan-US",
    "gameId": "wow",
    "extra": {
      "class": "Warrior",
      "spec": "Arms",
      "level": 80,
      "realm": "Illidan",
      "region": "us",
      "faction": "Horde",
      "race": "Orc",
      "item_level": 623
    }
  },
  "summary": "Thrallgar, 623 Arms Warrior — Illidan (US)"
}
```

Unique identity: `(user_uuid, "wow", "Thrallgar-Illidan-US")`. Realm and region are required because character names are only unique per realm.

### Sections

| Section | Blizzard Endpoint | Raider.io | Description |
|---------|------------------|-----------|-------------|
| `character_overview` | Profile Summary | — | Level, class, spec, race, faction, realm, item level, guild |
| `equipped_gear` | Character Equipment | — | All 16 slots: item name, ilvl, quality, stats, gems, enchants, sockets |
| `character_stats` | Character Statistics | — | All primary/secondary stats with ratings and percentages |
| `talents` | Character Specializations | — | Active talent loadout: class tree, spec tree, hero specialization |
| `mythic_plus` | Mythic Keystone Profile | M+ scores, rankings, per-dungeon bests | Season scores, per-dungeon bests, server/region/global rankings by class+spec |
| `raid_progression` | Character Encounters | Guild raid ranking | Boss kills by difficulty (LFR/Normal/Heroic/Mythic) |
| `professions` | Character Professions | — | Profession skill levels and known recipe counts |

All Blizzard endpoints use the pattern `/profile/wow/character/{realmSlug}/{characterName}/{resource}` with `namespace=profile-{region}`.

### Multi-Source Composition

The WoW adapter is the first to composite multiple API sources into a single GameState:

1. `refresh_save` triggers the adapter
2. Adapter calls Blizzard API: profile, equipment, stats, M+ season, raids, talents, professions (~6-7 calls)
3. Adapter calls Raider.io: character profile with `gear,mythic_plus_scores_by_season,mythic_plus_best_runs,raid_progression` fields (1 call)
4. Adapter merges Raider.io ranking data into `mythic_plus` and `raid_progression` sections
5. GameState written via existing `storePush` pipeline

### Target Use Cases

**Gear diagnostics:** Are all slots enchanted? Gems filled? Stat distribution aligned with spec? Any weak slots dragging ilvl down?

**Upgrade pathing:** Weakest slot(s), where upgrades come from (dungeons, raids, crafting). LLM knows loot tables from training data.

**M+ progress:** Per-dungeon bests, overall score, which dungeons to push. Raider.io adds percentile context: "Your 2,400 puts you in top 8% of Arms Warriors on Illidan."

**Raid progression:** Boss kills by difficulty, next steps, ilvl context relative to content.

**Alt management:** Compare characters across the account. "Which alt has the highest M+ score?" Falls naturally out of the multi-save architecture.

**Build comparison (via Notes):** User pastes an Icy Veins / Wowhead / Archon build guide as a Note. AI compares actual talents and gear against the guide.

### Non-Goals for v1

- Combat log analysis (Warcraft Logs integration — v2)
- Local addon or daemon (bag scanning, SimC, real-time combat)
- Reference data engine (LLM's WoW knowledge is sufficient)
- PvP data (available but not priority)
- Auction house / gold-making

## PoE2 (Future — Requires Per-User OAuth)

PoE2 character profiles are **private**. Every API call requires a user access token. The adapter interface is identical — `getOAuthConfig()`, `discoverSaves()`, `fetchState()` — but the authentication plumbing differs:

- Every API call uses the user's token (not app-level credentials)
- Stricter rate limits (~45 req/min)
- Token refresh critical (GGG tokens expire)
- Same `game_credentials` table, same encrypted storage

The plugin structure would be:

```
plugins/poe2/
  plugin.toml              # source = "api", [adapter] with auth_provider = "ggg"
  adapter/
    index.ts
    types.ts
    sections.ts
  Justfile
```

## D1 Schema

### Character registration

Stores discovered characters from OAuth-based game APIs. Used by the web UI character picker and by the adapter to know which characters to refresh.

```sql
CREATE TABLE linked_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  character_id TEXT NOT NULL,      -- stable game-specific ID (e.g. Blizzard numeric ID)
  character_name TEXT NOT NULL,    -- display name (updated on rename)
  realm TEXT,                      -- WoW realm (updated on transfer), nullable for non-realm games
  region TEXT,                     -- us, eu, kr, tw
  metadata TEXT,                   -- JSON: class, level, etc. from discovery
  source_uuid TEXT NOT NULL,       -- FK to the adapter source
  active INTEGER NOT NULL DEFAULT 1,  -- 0 = soft-deleted (character removed, history preserved)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_uuid) REFERENCES users(uuid),
  UNIQUE(user_uuid, game_id, character_id)
);
```

### Game credentials

Stores encrypted OAuth tokens for API-backed games. Used by WoW (token refresh for account profile) and future games like PoE2.

```sql
CREATE TABLE game_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_uuid) REFERENCES users(uuid),
  UNIQUE(user_uuid, game_id)
);
```

## What the AI Companion Gets

The same MCP tools work for API-backed saves as for daemon-pushed saves. The AI doesn't know or care where the data came from — it just sees GameState sections with staleness timestamps.

For WoW, the killer questions become:

- **"Is my gear ready for Mythic raid?"** — equipped_gear shows every item with ilvl, enchants, gems; character_stats shows computed ratings
- **"Which M+ dungeons should I push?"** — mythic_plus section shows per-dungeon bests + Raider.io percentiles
- **"What's my weakest gear slot?"** — equipped_gear shows ilvl per slot, AI spots the outlier
- **"Compare my characters"** — all characters are separate saves, cross-save queries work naturally
- **"Am I following my build guide?"** — talents section vs. user-pasted guide note

## Licensing

- [ ] Register Blizzard API application at developer portal
- [ ] Review Blizzard Developer API Terms of Use (free-tier restriction, privacy policy, attribution, 30-day refresh)
- [ ] Contact RaiderIO, Inc. for commercial use permission (required by ToS for non-personal use)
- [ ] Add privacy policy covering Battle.net OAuth data handling
- [ ] Add Blizzard attribution per requirements (without implying endorsement)
