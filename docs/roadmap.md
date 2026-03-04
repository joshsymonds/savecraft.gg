# Roadmap

Planned features and unimplemented designs. Nothing here is built yet.

## Server-Side Game Adapters

See `docs/adapters.md` for the full design. Summary: TypeScript modules in `worker/src/adapters/` that fetch game state from external APIs and produce the same `GameState` shape as daemon WASM plugins. First target is WoW (public profiles via Battle.net API, no per-user token storage needed).

## Reference Data System

### Status

**Infrastructure complete. D2R drop calculator not yet implemented.**

Phases 1 and 2 are done — dual WASM build targets, Workers for Platforms dispatch, MCP tools. Phase 3 (D2R drop calculator with full treasure class resolution) is next.

### Three Categories of Knowledge

Savecraft serves game knowledge across three categories with different architectural needs:

1. **Things the AI already knows** — game mechanics, quest walkthroughs, general strategy. No architecture needed.
2. **Lookup tables with computation** — drop rates, item stats, crop profitability, breakpoint tables, runeword recipes. The AI knows these *approximately* but gets specifics wrong. These need exact computation from authoritative data tables.
3. **Strategy and build guides** — already handled by Notes.

Category 2 is the gap that reference data fills: the AI combines the player's *actual* MF stat from their save with *exact* drop probability math from the reference module.

### Architecture: Workers for Platforms

Reference modules execute server-side via Workers for Platforms (WfP). Each game's reference WASM deploys as its own Worker with a static import (pre-compiled at deploy time). The main Worker dispatches via `env.REFERENCE_PLUGINS.get("{game_id}-reference").fetch(request)`.

**Why WfP?** `WebAssembly.compile()` is blocked by workerd's V8 security policy everywhere. WfP is the Cloudflare-endorsed pattern for dynamically-deployed WASM (used by Shopify, Grafbase, etc.).

See `docs/plugins.md` for reference Worker structure, `docs/worker.md` for dispatch namespace binding, and `docs/mcp.md` for MCP tools.

### What's Built

- **Dual WASM targets:** `plugins/d2r/parser/` and `plugins/d2r/reference/` build separately, sharing `plugins/d2r/d2s/` data code
- **Reference Worker:** `reference/` — shared WASI shim Worker that executes any game's reference WASM module
- **Dispatch namespaces:** `savecraft-reference-plugins` (production) and `savecraft-reference-plugins-staging` (staging) created
- **MCP tools:** Reference modules discovered via `list_games`, computed via `query_reference(game_id, module, query)`
- **plugin.toml:** `[reference.modules.*]` section with name, description, attribution
- **Manifest generator:** Handles dual binaries (parser.wasm + reference.wasm)

### What's Next: D2R Drop Calculator (Phase 3)

Full treasure class resolution in Go, compiled to `reference.wasm`:
- TC data tables from CASC extraction (TreasureClassEx.txt, ItemRatio.txt, etc.)
- TC traversal algorithm: recursive resolution with NoDrop reduction
- Item ratio application with MF scaling
- Player count effects on NoDrop
- End-to-end integration test with known drop probabilities

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
