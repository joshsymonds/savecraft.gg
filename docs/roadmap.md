# Roadmap

Planned features and unimplemented designs. Nothing here is built yet.

## Server-Side Game Adapters

### Why Not WASM

The daemon plugin model is designed around local file parsing: read bytes from stdin, write ndjson to stdout, no network, no secrets, no ambient authority. API-backed games (PoE2, WoW via Battle.net, FFXIV) break every one of those constraints:

- **Network access** to hit game APIs
- **Secrets** (OAuth tokens, API keys) that should never touch the user's machine
- **Rate limiting / retry logic** better handled server-side
- **No daemon dependency** — the whole point of API games is the user doesn't need local software

These are not plugins. They're **server-side game adapters**: TypeScript modules that run in the SaveHub DO, with access to credentials and outbound `fetch()`.

### Adapter Interface

```typescript
interface GameAdapter {
  gameId: string;
  gameName: string;
  fetchSave(credentials: GameCredentials, characterId?: string): Promise<GameState>;
  listCharacters(credentials: GameCredentials): Promise<CharacterInfo[]>;
}

interface GameCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface CharacterInfo {
  characterId: string;
  name: string;
  summary: string;  // e.g. "Level 95 Witch — Occultist"
}
```

Each adapter is a plain TypeScript module in `worker/src/adapters/`. No WASM, no sandbox, no signing. They're first-party server code, deployed with the Worker.

The output is the same `GameState` shape that daemon plugins produce — sections with arbitrary JSON per game. R2 storage, D1 metadata, MCP tools, search — all identical downstream.

### Credential Management

Game API credentials are stored in D1, encrypted at rest with a Worker-level secret (`CREDENTIAL_KEY` in `wrangler.toml` secrets).

```sql
CREATE TABLE game_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,    -- encrypted
  refresh_token_enc TEXT,            -- encrypted, nullable
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_uuid) REFERENCES users(uuid),
  UNIQUE(user_uuid, game_id)
);
```

**OAuth flows:** Each game has its own OAuth provider (Battle.net, GGG, etc.). The web UI initiates the OAuth dance, the Worker handles the callback, and the resulting tokens are encrypted and stored. Token refresh happens automatically when the adapter detects expiry.

**No tokens on the user's machine.** The daemon never sees game API credentials.

### Refresh Flow

When `refresh_save` targets an API-backed save:

```
MCP client → Worker → SaveHub DO → adapter.fetchSave(credentials, characterId)
                                  → game API (e.g. api.pathofexile.com)
                                  ← GameState JSON
                                  → write to R2 (same layout as daemon pushes)
                                  → update D1 metadata (save row, summary)
                                  → emit status event to UI WebSocket
                                  ← { refreshed: true, timestamp: "..." }
```

### Rate Limiting

Game APIs have rate limits (GGG: ~45 req/min, Battle.net: varies by endpoint). Adapters must respect these. Since adapters run in the SaveHub DO (one per user, single-threaded), there's a natural serialization per user. Cross-user rate limiting (shared API key limits) requires a separate rate limiter — a small DO keyed by game ID that tracks request counts.

## Reference Data System

### Three Categories of Knowledge

Savecraft serves game knowledge across three categories with different architectural needs:

1. **Things the AI already knows** — game mechanics, quest walkthroughs, general strategy. No architecture needed.
2. **Lookup tables with computation** — drop rates, item stats, crop profitability, breakpoint tables, runeword recipes. The AI knows these *approximately* but gets specifics wrong. These need exact computation from authoritative data tables.
3. **Strategy and build guides** — already handled by Notes.

Category 2 is the gap that reference data fills: the AI combines the player's *actual* MF stat from their save with *exact* drop probability math from the reference module.

### Architecture: Second WASM Build Target

Reference modules are a second WASM binary shipped by each plugin, running server-side in the Worker under the same sandbox guarantees as daemon-side parsers. Each plugin optionally ships two WASM targets from shared source:

```
plugins/d2r/
├── parser/              # Daemon-side: save file parsing (existing)
│   ├── main.go
│   └── Justfile
├── reference/           # Worker-side: query computation (new)
│   ├── main.go
│   └── Justfile
├── data/                # Shared lookup tables (both targets import)
│   ├── treasure_classes.go
│   ├── runewords.go
│   └── breakpoints.go
└── plugin.toml
```

The reference contract: JSON query on stdin, JSON result on stdout. An empty query (`{}`) returns the module's self-describing parameter schema.

### Worker-Side WASI Shim

The Worker executes reference WASM via `WebAssembly.instantiate` with a minimal WASI shim that provides only stdin reads and stdout writes. No filesystem, no network, no environment access. Same sandbox guarantee as the daemon-side wazero runtime. ~100 lines of shim code.

### MCP Tools: Reference Data

Two read-only tools:

- **`list_references(game_id?)`** — Discovery tool. Returns available reference modules with parameter documentation and attribution.
- **`query_reference(game_id, module_id, query)`** — Computation tool. Passes query to the reference WASM module, returns results with attribution.

### plugin.toml Reference Section

The `[reference]` section is optional. Plugins without it work exactly as before.

```toml
[reference.modules.drop_calc]
name = "Drop Calculator"
description = "Compute drop probabilities for any item from any farmable source."

[reference.modules.drop_calc.attribution]
author = "Josh Symonds"
data_sources = [
  { name = "TreasureClassEx.txt", origin = "Diablo II game data tables", license = "community-extracted" },
]
note = "Drop formulas based on community-documented game mechanics."
```

## Game Support Roadmap

### Tier 1: Proof of Concept

| Game | Save Format | Notes |
|------|------------|-------|
| Diablo II: Resurrected | `.d2s` binary | Dogfood game. Binary format, well-documented, battle-tested parsers. |

### Tier 2: First Expansion

| Game | Save Format | Notes |
|------|------------|-------|
| Stardew Valley | XML (plain text) | Trivial to parse. Massive audience. Completionist culture. |
| Paradox games (Stellaris, CK3) | Clausewitz text | Deep strategy, dozens of systems to optimize. |

### Tier 3: High Value, More Complex

| Game | Save Format | Notes |
|------|------------|-------|
| Bethesda games (Skyrim, Fallout 4) | `.ess` binary | Inventory, skills, quest flags. Huge modding community. |
| Elden Ring | `.sl2` binary (encrypted) | Build optimization natural fit. |
| Baldur's Gate 3 | `.lsv` (Larian format) | Large saves (~100MB) but compressible. |
| Civilization VI | `.Civ6Save` (compressed binary) | Amazing advisory angle: "is my science output on track?" |

### Tier 4: API-Based (Server-Side Adapters)

| Game | Data Source | Notes |
|------|-----------|-------|
| Path of Exile 2 | GGG OAuth API | Character profiles, passive tree, equipped items, stash tabs. |
| WoW (via API) | Battle.net OAuth API | Character profiles, gear, stats, achievements, mythic+ scores. |
| WoW (via addons) | `SavedVariables/*.lua` local files | Daemon-backed parser — Tier 3 complexity, not an adapter. |
| FFXIV | Lodestone / XIVAPI (unofficial) | No local save data. Community APIs, fragile but viable. |

## Monetization

### Why Ads Don't Work

Savecraft is headless. Value delivery happens inside someone else's UI (Claude, ChatGPT, Gemini). No surface for traditional ads.

### Freemium Tiers

| | Free | Paid ($3-5/month or $30-40/year) |
|---|---|---|
| Games | 1 game | Multiple games |
| State queries | Basic (what's my gear, stats) | Full access |
| Notes | 3 per save | 10 per save |
| Strategy comparison | — | Compare build to meta (partner content) |
| Historical tracking | — | Snapshots, diffs, "show build changes over last week" |
| Sync frequency | Standard | Faster |

Free tier generous enough for word-of-mouth. Paid tier unlocks infrastructure-intensive features.

### Future Revenue

- **Affiliate/referral:** Measurable traffic to strategy sites.
- **Aggregated data insights (at scale):** Anonymized meta-analysis valuable to strategy sites, publishers. Requires 50K+ users.

## Open Decisions

These are policy decisions, not architecture decisions. Nothing about them changes the shape of the system.

- **Snapshot retention policy:** Keep everything for now. Implement thinning later.
- **Free tier game locking:** Can the user switch their one free game? Locked on first push? TBD.
- **Daemon auto-update mechanism:** Self-update is implemented (`internal/selfupdate/`). Pre-release version comparison not yet handled.
- **Strategy site partnerships:** Approach Maxroll/Icy Veins as distribution partners or build scraper pipeline? TBD.
- **Anthropic Connectors Directory submission:** After dogfooding or immediately?
- **Multi-device support:** What happens when a user has the daemon on both a Windows PC and a Steam Deck? The DO hub supports multiple daemon connections per user, but the UX for choosing "which device's save" in the MCP needs thought.

## Platform-Specific Installation (Not Yet Implemented)

### Windows

**MSI installer** built with WiX or go-msi. Installs to `C:\Program Files\Savecraft\`, registers Windows Service, opens `savecraft.gg/setup`.

**Code signing:** EV code signing certificate (~$300-400/year). Required to avoid SmartScreen warnings.

### macOS

**`.pkg` installer** + launchd service. Apple notarization required ($99/year). Homebrew tap as secondary option.

### Console

- **PS5:** No access to save data. Dead end.
- **Xbox / Game Pass PC:** Xbox Play Anywhere syncs saves to PC — falls out naturally from supporting PC versions.
- **Nintendo Switch:** Completely sealed. No path.

## Partner Content Pipeline

When strategy site partnerships materialize, partner-sourced content would:
- Arrive via a content feed/API rather than user paste
- Carry `"source": "maxroll"` with attribution metadata (author, URL, last_updated)
- Auto-update when the partner publishes changes
- Display with partner branding in the web UI
- Potentially be available to all users of that game (not per-save)

This is additive. No architecture changes needed — just a new content ingestion path that writes the same note objects.
