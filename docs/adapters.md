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

## Architecture

```
MCP tool call (refresh_save / get_section / etc.)
  → Worker identifies save as API-backed (game config in D1)
  → Worker calls adapter.fetchState(credentials, characterId)
      → adapter fetches from game API (Battle.net, GGG, etc.)
      → adapter transforms response → GameState
  → Worker stores via existing R2/D1/FTS pipeline
  → MCP tool returns data to AI client
```

Adapters live in `worker/src/adapters/`. Each game gets a directory:

```
worker/src/adapters/
  adapter.ts              ← shared interface, types, utilities
  wow/
    index.ts              ← WoW adapter implementation
    types.ts              ← Battle.net API response types
    sections.ts           ← maps API data → GameState sections
  poe2/
    ...
```

### Adapter Interface

```typescript
interface GameAdapter {
  gameId: string;
  gameName: string;
  fetchState(params: FetchParams): Promise<GameState>;
}

interface FetchParams {
  // Per-game fields. WoW uses realm + characterName.
  // PoE2 uses accessToken + characterId.
  [key: string]: unknown;
}
```

The output is the same `GameState` that daemon plugins produce — `identity`, `summary`, `sections`. Everything downstream is identical: R2 snapshots, D1 metadata, FTS indexing, MCP tools, notes, search.

### Convergence Point

| | File Parsers (Daemon) | API Adapters (Worker) |
|---|---|---|
| **Runtime** | WASM via wazero | TypeScript in Worker |
| **Trigger** | Filesystem event | On-demand (MCP tool / web UI) |
| **Input** | Raw file bytes | Game API response |
| **Trust model** | Sandboxed, community code | Reviewed, first-party code |
| **Output** | GameState | GameState |
| **Storage** | Push API → R2/D1/FTS | Direct → R2/D1/FTS |

## WoW (Battle.net API) — First Adapter

### Why WoW First

WoW character profiles are **public**. Equipment, talents, M+ rating, raid progression — all accessible with app-level credentials (Savecraft's client_id/secret). No per-user OAuth tokens required for data fetching.

This makes WoW the simplest possible adapter: no per-user credential storage, no token refresh, no "link your account" infrastructure beyond character discovery.

### Authentication Model

**App credentials:** Register a Blizzard developer app → client_id + client_secret. Stored as Worker env vars. Used for all API calls via client credentials OAuth flow.

**Character discovery (one-time user OAuth):** The Battle.net account endpoint (`/profile/user/wow`) returns all characters owned by an account. This requires user authorization. The flow:

1. User clicks "Link Battle.net" in web UI
2. Standard OAuth2 redirect to Battle.net
3. User authorizes Savecraft to see their character list
4. Callback receives access token
5. Worker calls account endpoint, gets character list (realm, name, class, level for each)
6. Store character list in D1, associated with Savecraft user
7. **Discard the token** — it's not needed again

To refresh the character list (new characters, server transfers), the user re-does the OAuth flow. No stored tokens, no refresh logic, no expiry handling.

**Data fetching:** All subsequent API calls use app-level credentials against public profile endpoints. The user's Battle.net token is never stored.

### API Endpoints and Sections

All endpoints use the pattern `/profile/wow/character/{realmSlug}/{characterName}/{resource}` with `namespace=profile-{region}`.

| Section | API Endpoint | Description |
|---------|-------------|-------------|
| `character` | Profile Summary | Name, level, race, class, active spec, realm, faction, equipped ilvl |
| `equipment` | Character Equipment | Every slot: item name, ilvl, quality, stats, enchants, gems, sockets |
| `talents` | Character Specializations | Active spec, talent loadout |
| `mythic_plus` | Mythic Keystone Profile | M+ rating, best runs per dungeon (key level, timed, affixes) |
| `raid_progression` | Character Encounters | Kills per boss per difficulty (LFR/Normal/Heroic/Mythic) |
| `professions` | Character Professions | Primary/secondary professions, skill levels |
| `reputations` | Character Reputations | Faction standings |

Lower-priority sections (add later if useful): PvP ratings, collections (mounts/pets), achievements.

### Rate Limits

Battle.net API: 100 requests/second, 36,000 requests/hour per app. Generous, but shared across all Savecraft users. A full character fetch is ~7 API calls, so at 36k/hour the app supports ~5,000 character refreshes per hour before hitting limits.

Rate limiting is per-app, not per-user. Implementation: a rate limiter in the Worker (Durable Object keyed by game API, or a simple KV-based token bucket) that throttles outbound requests.

### Data Freshness

WoW character data updates when the player logs out or the armory refreshes (typically a few minutes after in-game changes). The adapter fetches on demand — when the user asks the AI about their character, or explicitly triggers a refresh.

No polling. No cron. Fetch when asked.

### Reference Data

Not needed initially. WoW theorycrafting lives in external tools (Raidbots, Warcraftlogs, WoWhead). The AI's general WoW knowledge is sufficient for advice — the value Savecraft adds is the player's actual character state, not game mechanics computation.

If a computation-heavy reference module becomes useful later (e.g., stat weight calculations from game data tables), it would follow the existing WfP reference pattern, not the adapter pattern.

## PoE2 (Future — Requires Per-User OAuth)

PoE2 character profiles are **private**. Every API call requires a user access token. This means:

- Full OAuth flow with token storage (encrypted in D1)
- Token refresh logic (GGG tokens expire)
- `game_credentials` table with encrypted access/refresh tokens
- Stricter rate limits (~45 req/min)

The adapter interface is the same — only the authentication plumbing differs. WoW is the right first adapter because it avoids all of this complexity.

## D1 Schema

### Character registration (WoW and similar public-profile games)

```sql
CREATE TABLE linked_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  character_id TEXT NOT NULL,      -- game-specific identifier (e.g. "thrall-stormrage-us")
  character_name TEXT NOT NULL,    -- display name
  realm TEXT,                      -- WoW realm, nullable for games without realms
  region TEXT,                     -- us, eu, kr, tw
  metadata TEXT,                   -- JSON: class, level, etc. from discovery
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_uuid) REFERENCES users(uuid),
  UNIQUE(user_uuid, game_id, character_id)
);
```

### Game credentials (PoE2 and similar private-profile games, future)

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

The same MCP tools work for API-backed saves as for daemon-pushed saves. The AI doesn't know or care where the data came from — it just sees GameState sections.

For WoW, the killer questions become:

- **"What's my weakest gear slot?"** — equipment section shows every item with ilvl, the AI spots the outlier
- **"Am I ready for Heroic raid?"** — ilvl, enchants, gems, empty sockets all visible
- **"Which M+ dungeons should I push?"** — M+ section shows timed/untimed per dungeon
- **"What should I craft?"** — professions section + equipment gaps
- **"Is my talent build good for M+?"** — talents section compared to AI's game knowledge
