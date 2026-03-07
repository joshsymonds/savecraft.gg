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

## Mod-as-Source (Direct Push)

A new data source type alongside daemon parsers and API adapters. For games with unsandboxed modding frameworks, a Savecraft mod runs inside the game, pairs as a source, and pushes state directly over WebSocket. No daemon involved at all.

The mod *is* a source. From the server's perspective, there's no difference between a push from the daemon and a push from a RimWorld mod — they both authenticate with a source token and send `PushSave` proto messages over WebSocket.

### How It Works

1. **Install:** User installs the Savecraft mod from the game's mod portal (Steam Workshop, CurseForge, etc.). One click.
2. **Register + Link:** Mod connects to `/ws/register` on first launch, sends a `Register` proto, gets a source token and 6-digit link code. User enters the code at `savecraft.gg/setup`. Same source linking flow the daemon uses.
3. **Push:** Mod hooks the game's save event (Forge's `WorldEvent.Save`, Harmony's save patch). On save, mod serializes game state and sends `PushSave` proto over WebSocket. For games without a save hook, a conservative timer (60s) with server-side timestamp dedup.
4. **Done.** No daemon, no system service, no OS-specific installer.

### Why This Exists

- **Zero friction beyond the mod.** The daemon is the biggest install hurdle for Savecraft. Mod-as-source eliminates it entirely for supported games.
- **Complete access.** Mods see runtime state that never hits disk — active production rates, logistics throughput, circuit network state.
- **Correct by construction.** The game's own API guarantees data accuracy. No reverse-engineering binary formats.
- **Survives format changes.** Mods use stable APIs. Save format changes don't matter.
- **Works everywhere the game runs.** Steam Deck, Linux, anywhere — no daemon platform support needed.

### Candidate Games

| Game | Mod Framework | Network API | Notes |
|------|--------------|------------|-------|
| Rimworld | C# (Harmony) | `HttpClient` | Colony state, pawn skills/health, research, wealth tracker. |
| Minecraft (Java) | Java (Fabric/Forge) | `java.net` | Inventory, advancements, world stats. |
| Kerbal Space Program | C# (Unity mods) | `UnityWebRequest` | Vessel stats, science progress, contracts, funds. |
| Cities: Skylines II | C# (PDX Mods) | `HttpClient` | City stats, budget, services, traffic. |
| Terraria | C# (tModLoader) | `HttpClient` | Character gear, boss progress, world state. |

### Open Questions

- **Distribution:** Ship via each game's mod portal. This is the natural discovery channel.
- **Versioning:** How does the mod signal its schema version? Probably a header on the push request.
- **Rate limiting:** Mods are user-installed code making HTTP calls. Need per-source rate limits to prevent runaway mods from hammering the server.

## Mod-as-Emitter (Daemon-Assisted)

A variant of the existing daemon parser pipeline for games with sandboxed modding frameworks that block network access. The mod writes pre-structured GameState JSON to the game's output directory. The daemon watches that directory and pushes on change — same pipeline as save file parsing, but the WASM plugin step is replaced by the mod's output.

This is not a new architecture. It's an optimization of the parser path: instead of the daemon running a WASM plugin to transform an opaque binary save, the mod inside the game does the transformation and writes structured output that the daemon pushes as-is.

### How It Works

1. **Install:** User installs both the Savecraft mod (from the game's mod portal) and the daemon.
2. **Configure:** Daemon watches the game's mod output directory (e.g. Factorio's `script-output/savecraft/`).
3. **Emit:** Mod hooks the game's save event (Factorio's `on_game_saved`). On save, mod serializes game state to JSON and writes it via the game's file output API (`game.write_file()`).
4. **Push:** Daemon detects the file change via fsnotify, reads the pre-structured JSON, and pushes to the push API. Same debounce + hash dedup as save files. No WASM plugin execution.

### Why Not Just Parse the Save?

Some save formats are not practically parseable:

- **Factorio's `level.dat`:** Compressed, versioned binary format that changes every major update. The mod API exposes everything the save contains and more (runtime production stats, logistics network state). A standalone parser would be thousands of lines and perpetually broken.
- **Any game with encrypted or proprietary saves:** If the game exposes state via mod API but locks down the save format, the emitter path is the only viable option.

### Candidate Games

| Game | Mod Framework | Output API | Notes |
|------|--------------|-----------|-------|
| Factorio | Lua (official API) | `game.write_file()` → `script-output/` | Strict sandbox: no `socket`, no `io`, no `os`. File output is the only way out. |

Factorio is currently the only identified candidate. If other sandboxed frameworks emerge, they'd use this same pattern.

### Open Questions

- **Directory convention:** The mod writes to its game's natural output directory (Factorio's `script-output/savecraft/`). The daemon config needs to know this per-game. Could be part of the game's plugin metadata even though no WASM plugin is involved.
- **Schema contract:** The mod writes the same GameState JSON shape that a WASM plugin would produce. Should this be validated by the daemon before push, or trust the mod?

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

### Tier 5: Mod-as-Source (No Daemon)

| Game | Mod Framework | Notes |
|------|--------------|-------|
| Rimworld | C# (Harmony) | Colony sim — pawns, research, wealth. Natural advisory fit. |
| Minecraft (Java) | Java (Fabric/Forge) | Inventory, advancements, world stats. |
| Terraria | C# (tModLoader) | Gear, boss progress, world state. |

Mod pairs as a source, pushes directly over WebSocket. No daemon required. See [Mod-as-Source](#mod-as-source-direct-push).

### Tier 6: Mod-as-Emitter (Daemon-Assisted)

| Game | Mod Framework | Notes |
|------|--------------|-------|
| Factorio | Lua (official API) | Production stats, research, logistics. Sandboxed — needs daemon relay. |

Mod writes structured JSON to disk; daemon watches and pushes. For games with sandboxed modding frameworks. See [Mod-as-Emitter](#mod-as-emitter-daemon-assisted).

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
- **Multi-source support:** Solved by source-centric architecture. Each source self-registers and pushes saves under its own `source_uuid`. A user with a Windows PC and Steam Deck sees saves from both via the source→user JOIN. The MCP and web UI surface saves from all linked sources transparently.

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
