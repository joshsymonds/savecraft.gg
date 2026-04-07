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
| Fields of Mistria | Zlib-compressed binary (JSON + farm buffer) | See [Fields of Mistria notes](#fields-of-mistria) below. |
| Hollow Knight | AES-ECB encrypted JSON | See [Hollow Knight notes](#hollow-knight--silksong) below. |
| Hollow Knight: Silksong | AES-ECB encrypted JSON | See [Hollow Knight notes](#hollow-knight--silksong) below. |
| Slay the Spire 1 & 2 | XOR+Base64 JSON (StS1) / plain JSON (StS2) | See [Slay the Spire notes](#slay-the-spire) below. |
| Stardew Valley | XML (plain text) | Trivial to parse. Massive audience. Completionist culture. |
| Paradox games (CK3, HOI4) | Clausewitz text | Deep strategy, dozens of systems to optimize. Stellaris already implemented. |

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

## Game-Specific Notes

### Fields of Mistria

**Engine:** GameMaker. **Format:** `.sav` — zlib-compressed binary containing interleaved variable names + JSON objects + binary farm buffer data. Not encrypted.

**Save location:** `%LOCALAPPDATA%\FieldsOfMistria\saves\` (Windows). Steam App ID `2142790`. Files: `game-*.sav`, autosaves as `*-autosave.sav` (written on day transitions).

**How it works:** Zlib-decompress the `.sav` to get a mixed binary/text stream. Variable names (null-terminated strings) precede JSON payloads, separated by binary control bytes (GameMaker buffer framing). The JSON blocks are the game state; the binary "Farm Buffer" portions contain spatial/grid data for locations.

**Data richness (from vaultc unpack output):**
- `player.json` — skill_xp, inventory, cosmetics, mount, quests, recipes, items, spells, armor
- `npcs.json` — per-NPC heart_points, gifts_given, location, routine
- `header.json` — farm_name, playtime, calendar_time, weather, player name
- `gamedata.json` — museum_progress, world_facts, weather, date, daycare
- `game_stats.json` — 30+ metrics (fish_caught, enemies_killed, gifts_given logs, etc.)
- `quests.json` — quest state
- Location files (farm.json, town.json, mines_entry.json, etc.) — object_list, inventories

**Parsing approach:** Zlib decompress, then extract named JSON sections from the binary stream. [HozBlic's progress tracker](https://github.com/HozBlic/hozblic.github.io) already does this in JavaScript (pako.inflate → regex extraction of JSON blocks). For Savecraft, a proper binary framing parser is better — hex-dump a real decompressed save to identify the framing pattern (likely type bytes + length prefixes + null-terminated strings per GameMaker buffer conventions). Read-only extraction is straightforward; the Farm Buffer binary data (tile layouts) can be skipped since Savecraft doesn't need spatial grid state.

**Format stability risk:** Early Access game. Format has changed 3 times already (v0.11.5, v0.13, v0.14). Expect continued changes until 1.0. The closed-source official unpacker (vaultc) tracks these — its release history is a canary for format breaks.

**Summary string examples:** `"Year 2, Spring 15, Sunflower Farm, 12,500g"` or `"Year 1, Fall 3, 6 hearts with Juniper"`

**Existing art:**
- [NPC-Studio/vaultc](https://github.com/NPC-Studio/vaultc) (~19 stars) — official unpack/pack/edit tool by the game developer. Rust, **closed source** (binary-only releases, Windows only). MIT licensed.
- [lordp/VaultGo](https://github.com/lordp/VaultGo) — Go reimplementation of vaultc for Linux. Also **closed source**.
- [AlbusNoir/FoMSE](https://github.com/AlbusNoir/FoMSE) — Python/Qt GUI save editor, wraps vaultc. GPLv3. Edits player stats (gold, health, stamina).
- [HozBlic/hozblic.github.io](https://github.com/HozBlic/hozblic.github.io) — browser-based progress tracker that parses `.sav` files client-side via pako.inflate + regex JSON extraction. **Best format reference** — proves the approach works without vaultc.
- [andyruwruw/fieldsofmistria.app](https://github.com/andyruwruw/fieldsofmistria.app) — TypeScript type definitions for the full unpacked save structure.
- [Agent4-1333/fommodding wiki](https://github.com/Agent4-1333/fommodding/wiki) — modding docs covering world fact variables, dialogue system, NPC state model.

### Hollow Knight / Silksong

Both are **AES-ECB encrypted JSON** — decrypt, strip BinaryFormatter wrapper, and you get flat JSON with hundreds of fields. The format is a direct dump of Unity's `PlayerData` class.

**Crypto:** AES-128-ECB, hardcoded key `UKu52ePUBwetZ9wNX88o54dnfKRu0T1l`, PKCS#7 padding, Base64 encoded. Go's `crypto/aes` + `crypto/cipher` handles this natively. Silksong uses the same algorithm family.

**Save locations:** `%APPDATA%\LocalLow\Team Cherry\Hollow Knight\user1.dat` through `user4.dat` (Windows). Standard Unity paths on Mac/Linux. Silksong identical but under `Hollow Knight Silksong\`.

**Data richness:** Abilities (dash, wall jump, double jump, etc.), spells (3 tiers each), 40 charms with equip state, boss kill flags, map completion per area, collectibles (grubs, mask shards, vessel fragments, essence), NPC quest state, completion percentage (up to 112% for HK). Silksong adds silk as a resource and has different ability sets (brolly, needle arts).

**Reference data:** Probably not needed for HK — LLMs know it cold (2017 game, massively popular). Silksong postdates most training cutoffs (released Sept 2025), so a progression/completion reference may be valuable if the LLM gives bad "where to go next" answers. Start without and add if needed.

**Summary string examples:** `"Steel Soul, 97% completion, 31 charms, Crystal Peak"` or `"Hornet, Act 2, 72% completion, Greymoor"`

**Plugin design:** A single plugin could handle both games — shared AES decryption layer + game-specific field mapping. Or two separate plugins sharing a crypto package if the field structures diverge enough.

**Existing art:**
- [bloodorca/hollow](https://github.com/bloodorca/hollow) (~317 stars) — browser-based HK save editor, most popular
- [ReznoRMichael/hollow-knight-completion-check](https://github.com/ReznoRMichael/hollow-knight-completion-check) (~130 stars) — 112% completion analyzer
- [nakami/Hollow-Knight-Save-Crypto](https://github.com/nakami/Hollow-Knight-Save-Crypto) — cleanest crypto reference (~50 lines Python)
- [moeakwak/silksong-save-editor](https://github.com/moeakwak/silksong-save-editor) — Silksong editor
- [just-addwater/silksong-saveeditor](https://github.com/just-addwater/silksong-saveeditor) — forked from HK editor
- [PlayerData API docs](https://radiance.synthagen.net/apidocs/_images/PlayerData.html) — comprehensive HK field reference
- [HK Wiki - Save Data (Silksong)](https://hollowknight.wiki/w/Save_Data_(Silksong)) — community Silksong field docs

### Slay the Spire

**StS1:** XOR-obfuscated JSON. Each byte XORed with cycling `"key"` string, then Base64 encoded. ~10 lines to decode. The game also accepts unobfuscated JSON. Card/relic IDs are human-readable strings (`Strike_R`, `Bash`, `PureWater`).

**StS2:** Plain JSON, no obfuscation. Godot engine. Released Early Access March 2026 — format may shift during EA.

**Save files:** StS1: `IRONCLAD.autosave`, `SILENT.autosave`, etc. in `%APPDATA%\Local\Slay the Spire\`. Written every floor — real-time tracking works. Run history as `.run` files in `runs/` subdirectory. StS2: `%APPDATA%\SlayTheSpire2\` with similar structure.

**Data richness:** Current deck (cards with upgrade counts), relics, potions, HP, gold, floor number, act, map state, ascension level. Run history includes final deck, score, victory flag, playtime.

**Reference data: Yes, worth building.** Card mechanical data (name, cost, type, rarity, effect) follows the same pattern as D2R's unique item stats — functional/mechanical data generated from game files. StS1's data is decompilable from the Java JAR, StS2 from Godot resources. A `datagen` tool emitting Go structs matches the D2R precedent exactly. Relic data too. This enables queries like "is Snecko Eye good with my deck's cost distribution?" or "what does Corruption do with my current relics?" where exact card text matters.

**IP risk:** Same category as D2R — mechanical stats, no flavor text or art. StS community is extremely mod-friendly (Steam Workshop, official mod support). Mega Crit has never taken action against data tools. Risk is negligible.

**Summary string examples:** `"Ironclad, Floor 32 Act 2, A20, 12 cards"` or `"Watcher, Victory A15, Score 1,247"`

**Existing art:**
- [spireslayer](https://github.com/rnazali/spireslayer) — Python save editor, decode/edit/re-encode
- [spire-save-editor](https://tymofij.github.io/spire-save-editor/) — browser-based editor
- [spirescope](https://github.com/thequantumfalcon/spirescope) — StS2 local dashboard, run stats, Pydantic models
- [spire-codex](https://github.com/ptrlrd/spire-codex) — StS2 decompiled data as API
- [Reverse Engineering Slay The Spire](https://2a1b.com/article/reverse-engineering-slay-the-spire) — format walkthrough

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

## Platform-Specific Installation

### Windows (signed MSI shipped)

Signed MSI installer served by the install worker (302 redirect to R2). Installs daemon and tray to `%LOCALAPPDATA%\Savecraft\`, registers HKCU Run key for autostart, launches tray on completion for pairing. Authenticode-signed via Azure Trusted Signing (Public Trust certificate profile) — immediate SmartScreen reputation, no manual unblocking.

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
