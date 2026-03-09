# RimWorld Integration

## Overview

RimWorld is the first Mod-as-Source game for Savecraft. A C# Harmony mod runs inside the game process, connects directly to Savecraft's WebSocket endpoint, and pushes structured colony state on save. No daemon required.

RimWorld is a natural fit for AI advisory: it's a deeply complex colony sim where players constantly face optimization questions (work priorities, wealth management, mood spirals, defense readiness, food planning) and explanation questions ("why did this happen?", "what does this mechanic mean?"). The AI's value is combining knowledge of RimWorld's mechanics with the player's actual colony state.

## Source Type

**Mod-as-Source (Tier 5).** The mod is the source. It authenticates with a source token, maintains a WebSocket connection to SourceHub, and sends `PushSave` proto messages. From the server's perspective, it's indistinguishable from a daemon push.

See `docs/roadmap.md` §Mod-as-Source for the general architecture.

## Save Identity

`(source_uuid, "rimworld", colony_name)`

- **Colony name** is the display name set by the player at game start (e.g., "New Arctopia").
- **World seed** (`Find.World.info.seedString`) is stored in `identity.extra.seed` as the stable colony identifier. The seed is set at world generation and never changes.
- **Collision handling:** If two colonies share the same name but different seeds, the mod appends a seed suffix to disambiguate: `"New Arctopia (seed abc12)"`. In practice this is extremely rare — players almost never run two identically-named colonies simultaneously.
- **No time component.** Players reload saves, time-travel via dev mode, and maintain multiple save files for the same colony. Time is volatile and not part of identity.

## Mod Architecture

### Distribution

Steam Workshop. User subscribes, RimWorld loads the mod. One click install, zero friction.

### Dependencies

The mod ships two DLLs in `Assemblies/`:

- `SavecraftRimWorld.dll` — the mod itself
- `Google.Protobuf.dll` — protobuf serialization (compiled against NuGet package at build time, shipped as DLL)

No runtime NuGet resolution. No additional dependencies beyond what ships.

### Network Stack

- **WebSocket:** `System.Net.WebSockets.ClientWebSocket` (built into .NET 4.7.2, which RimWorld targets on Unity 2022). If Mono TLS issues arise, `websocket-sharp` (single DLL) is the fallback.
- **Protocol:** Binary protobuf over WebSocket — same `Message` envelope as the daemon. `PushSave` messages carry the serialized `GameState`.
- **Connection lifecycle:** Same as daemon — connect to `/ws/register` on first launch, get source token + link code, persist token locally, reconnect on subsequent launches via `/ws/daemon`.

### Save Hook

Harmony-patch `GameDataSaveLoader.SaveGame` to trigger data collection on save. This fires on both autosave (configurable interval, default every season ~15 minutes real-time) and manual save.

No timer-based pushing. Save events are the natural coherence point — game state is consistent and the player expects a checkpoint.

### Thread Safety

The mod receives WebSocket messages on a background thread but must read game state on Unity's main thread. Standard pattern: enqueue work items, process them in `GameComponent.GameComponentUpdate()` (runs every frame), post results back to the WebSocket thread. One frame of latency (~16ms at 60fps) — invisible to the user.

## GameState Schema

### Design Principles

- **Token-efficient sections.** Anthropic enforces a 25,000 token limit per MCP tool result. Each section should be 1-3 KB (~250-800 tokens). The AI pulls only the sections it needs.
- **Per-colonist sections.** Colonist data is split into a roster overview and individual `colonist:{name}` sections. The AI requests specific colonists rather than loading all 20 at once.
- **Rich descriptions.** Each section's `description` field tells the AI exactly what questions this section answers, enabling surgical section selection.
- **No spatial data.** Map coordinates, terrain grids, and fog-of-war data are meaningless without a visual rendering. Omit them.
- **Mod-authored summaries.** The `summary` field gives a human-readable colony snapshot: `"New Arctopia — 12 colonists, Year 3 Aprimay, Cassandra Rough — Colony Wealth 89,420"`.

### Identity

```json
{
  "identity": {
    "saveName": "New Arctopia",
    "gameId": "rimworld",
    "extra": {
      "seed": "abc123def",
      "storyteller": "Cassandra",
      "difficulty": "Rough",
      "year": 5503,
      "quadrum": "Aprimay",
      "day": 12,
      "colonist_count": 12,
      "colony_wealth": 89420
    }
  },
  "summary": "New Arctopia — 12 colonists, Year 3 Aprimay, Cassandra Rough — Colony Wealth 89,420"
}
```

### Sections

#### Core Sections (always present)

| Section | Est. Size | Description | Key Data |
|---------|-----------|-------------|----------|
| `colony_overview` | ~2 KB | Colony identity, global stats, and game settings | Colony name, seed, biome, storyteller, difficulty, date (day/quadrum/year), wealth breakdown (items/buildings/creatures), adaptation factor, colonist/prisoner/animal counts, active DLCs, active mod count |
| `colonist_roster` | ~3 KB | Summary of all colonists for quick comparison | Per pawn: name, age, best skill (with passion), mood (value + worst modifier), current job, health status (healthy/injured/sick) |
| `colonist:{name}` | ~1-2 KB | Full detail for one colonist (dynamic, one per pawn) | Backstory, all traits, all skills (level + passion), mood value + all modifiers, all hediffs (injuries/diseases/implants/prosthetics with severity), equipment + apparel (with quality), needs breakdown, current job, schedule |
| `resources` | ~2 KB | Stockpile inventory totals by category | Food (raw + meals + nutrition-days estimate), medicine (by type), steel, components, advanced components, plasteel, gold, silver, cloth, chemfuel, uranium, jade, wood, stone blocks |
| `research` | ~3 KB | Research tree state | Current project + progress %, completed list, available (prerequisites met), categorized by tech level |
| `skills_and_work` | ~3 KB | Work assignment optimization data | Per colonist: all 12 skills with passion indicator, work priority per work type (1-4 or disabled), incapable-of flags |
| `mood_report` | ~2 KB | Mood status across the colony | Per colonist: mood value, mental break threshold, top 3-5 mood modifiers (positive and negative), mental break risk (safe/minor/major/extreme) |
| `health_report` | ~2 KB | Medical status across the colony | Per colonist: hediff list (injuries, diseases, chronic conditions, implants), immunity progress for diseases, bleeding rate, pain level, consciousness |

#### Infrastructure Sections

| Section | Est. Size | Description | Key Data |
|---------|-----------|-------------|----------|
| `power` | ~1 KB | Electrical grid status | Generators (type, output), batteries (stored/max), total consumption, net surplus/deficit |
| `farming` | ~2 KB | Agricultural state | Per growing zone: crop type, growth progress, expected yield, soil fertility, sowing status, infected plants |
| `defenses` | ~1 KB | Military infrastructure | Turrets (type, count), traps (type, count), wall material, embrasures, shield generators — counts and types only |
| `rooms` | ~2 KB | Key room quality | Per room: role (bedroom/dining/rec/hospital/prison/throne), temperature, impressiveness, beauty, cleanliness, space, bed count. Only enclosed rooms with a role — not every 1-tile hallway segment |

#### World Sections

| Section | Est. Size | Description | Key Data |
|---------|-----------|-------------|----------|
| `factions` | ~1 KB | Diplomatic relations | Per faction: name, type (pirate/tribal/outlander/empire/mechanoid), goodwill value, hostile flag |
| `threats` | ~1 KB | Threat context for raid readiness | Storyteller wealth points, pawn combat points, difficulty multiplier, adaptation factor, recent major incidents (last 3-5 with type and date) |
| `animals` | ~2 KB | Colony animals and livestock | Per animal: species, name (if named), bonded colonist, training (obedience/release/rescue/haul), pregnancy status, nuzzle interval |

#### Optional Section

| Section | Est. Size | Description | Key Data |
|---------|-----------|-------------|----------|
| `notable_items` | ~2-3 KB | High-value items and their locations | Items above Normal quality, or specific categories (weapons, armor, bionics, artifacts): item name, quality, location ("equipped by Engie" / "stockpile: west armory" / "ground (forbidden)") |

### Section Counts

- **Fixed sections:** 14 (colony_overview through notable_items)
- **Dynamic sections:** 1 per colonist (colonist:{name})
- **Typical total:** 14 + 12 colonists = **26 sections**
- **Big colony:** 14 + 20 colonists = **34 sections**
- **Total push size:** ~30-40 KB across all sections
- **No single section exceeds 3 KB (~800 tokens)**

### DLC Data

DLC-specific data folds into existing sections rather than creating separate sections:

- **Royalty:** Royal titles, permits, psycasts, neural heat → `colonist:{name}`
- **Ideology:** Active precepts, memes, roles, ritual quality → `colony_overview`
- **Biotech:** Xenotype, endogenes, xenogenes → `colonist:{name}`
- **Anomaly:** Entity containment, anomaly research → `research` + `defenses`

The `colony_overview` section lists active DLCs so the AI knows which mechanics are in play.

## Target Use Cases

### Optimization

- **"Who should do what?"** — `skills_and_work` shows skill+passion matrix vs. current priorities. AI spots mismatches: "Engie has major passion for Crafting at level 14 but you have her on priority 4. Move her to 1."
- **"Am I ready for a raid?"** — `threats` gives raid point inputs, `defenses` shows infrastructure, `colonist_roster` gives combat-ready pawn count.
- **"What should I research next?"** — `research` shows what's available + prerequisites, AI combines with colony needs from other sections.
- **"Will I have enough food for winter?"** — `farming` (expected yield, growth progress) + `resources` (current food + nutrition-days) + `colony_overview` (current date, biome).
- **"Why are raids so hard?"** — `threats` shows wealth points. `colony_overview` shows wealth breakdown. AI explains the wealth-raid scaling mechanic with the player's actual numbers.

### Explanation

- **"Why is Engie having a mental break?"** — `colonist:Engie` shows full mood stack. AI identifies the cause: "She has -25 from 'Ate without table', -10 from 'Disturbed sleep', and -15 from her brother dying. The table thing is the easy fix."
- **"What does this hediff mean?"** — `health_report` shows hediff, AI explains the mechanic from training data.
- **"Why isn't anything getting built?"** — `skills_and_work` shows nobody has Construction enabled, or the best constructor is injured per `health_report`.

### Companion

- **"My colony is falling apart."** — AI reads `mood_report` (three pawns near break), `resources` (food critically low), `health_report` (two pawns with plague). Prioritizes: "Food first — you have 2 days of nutrition. Then deal with the plague patients before the mood spiral gets worse."
- **"I just survived a massive raid!"** — AI reads `health_report` (injuries), `resources` (depleted steel/components from turret damage), `defenses` (destroyed traps). Helps plan recovery.

## Push Frequency and Data Costs

### Push Frequency

- Autosave default: every season (4 per in-game year, roughly every 15 minutes real-time at 1x speed)
- Manual saves: player-initiated
- Estimated: ~10-15 saves per play session, ~180 pushes/month for an active player

### D1 Costs at Scale

| Users | Rows Written/mo | Write Cost | Storage (latest state) | Storage Cost |
|-------|-----------------|------------|----------------------|--------------|
| 1,000 | 2.7M | free | 40 MB | free |
| 10,000 | 27M | free | 400 MB | free |
| 50,000 | 135M | $85/mo | 2 GB | free |
| 100,000 | 270M | $220/mo | 4 GB | free |

Storage stays flat because sections are overwritten on each push (latest state only, no history).

## Reference Materials

Reference code for understanding RimWorld's data model and existing serialization patterns. Cloned to `.reference/` (gitignored). **Clean-room implementation only — do not copy code from these projects.**

- **RIMAPI** (GPL v3) — `.reference/RIMAPI/` — REST API mod with 145 endpoints. Valuable for understanding which data is worth exposing and how to serialize it. GPL license means we study patterns only, write our own code.
- **RimWorld Decompiled** — `.reference/RimWorldDecompiled/` — Decompiled game source (personal use). The definitive reference for `Pawn`, `Map`, `Find`, and other game classes. Key directories: `Verse/` (core types), `RimWorld/` (game logic).

## Future: Live Queries

**Deferred — not part of the initial RimWorld implementation.** Captured here for future reference.

The mod's WebSocket connection to SourceHub is bidirectional, but currently only used for push (mod → server). A future enhancement could allow the MCP layer to send queries *down* the WebSocket to the mod, which would execute them against live game state and return results.

### Why This Matters

Live queries access **transient runtime state** that doesn't exist in save files:

- Trader inventories (gone when the caravan leaves)
- Active mental break details
- Current combat state (who's fighting whom)
- Active inspiration status (timed buffs)
- Real-time temperature readings
- Visitor/quest pawn carried items

Sections capture save-time snapshots. Live queries would see the game *right now*.

### How It Would Work

```
AI → MCP tool → Worker → SourceHub DO (holds WS) → mod
                                ↑
                         pending request map
                         keyed by query_id
                         timeout 5-10s
                                ↓
mod → LiveQueryResult → SourceHub resolves → Worker → AI
```

The mod would register its supported query types on connect. The MCP layer would expose them as parameters on existing tools (e.g., `get_section("colonist:Engie", live=true)`) or via a dedicated `query_game` tool for ad-hoc queries.

### Applicability Beyond RimWorld

Live queries are only valuable for mod-as-source games where: (a) the mod framework has unrestricted network access, (b) meaningful state exists at runtime that doesn't persist to disk, and (c) the game is complex enough for ad-hoc queries to matter.

| Game | Live Queries Valuable? | Why |
|------|----------------------|-----|
| RimWorld | Yes | Traders, mental breaks, combat, inspiration |
| Minecraft | Yes | Chest contents, entity positions, redstone state |
| Cities: Skylines II | Yes | Real-time traffic, service coverage, per-tick budget |
| KSP | Somewhat | Active flight telemetry, but most useful state persists |
| Terraria | No | Save file captures nearly everything |

Games with sandboxed mod frameworks (Factorio, Paradox games) cannot support live queries — no outbound network access. Games with plaintext saves that capture full state (Stardew Valley, Paradox) don't need them.

### Decision to Defer

Sections-only delivers ~90% of the advisory value. Live queries add significant infrastructure (new proto messages, SourceHub query broker with timeout handling, MCP tool changes, per-mod query handler) for a narrow set of use cases. The WebSocket connection is already there — nothing built now precludes adding live queries later.

**Signal to revisit:** If real users frequently ask questions that sections can't answer (especially "where is X" and trader-related queries), that's the trigger to build the query channel.

## Open Questions

- **Mod settings UI:** Should the mod have in-game settings (server URL, connection status, link code display)? Or keep it minimal (link code shown once, status in log)?
- **Error recovery:** If the WebSocket disconnects mid-session, how aggressively should the mod reconnect? Exponential backoff with jitter, same as the daemon.
- **Large colony performance:** Serializing 20+ colonists with full detail on every save adds processing time. Profile and optimize — likely needs to run on a background thread with a snapshot of game state.
- **Mod compatibility:** Some popular mods add new pawn trackers, skills, or needs. Should the Savecraft mod detect and serialize modded data? Initially no — ship vanilla support, add mod compatibility based on demand.
- **Schema versioning:** How does the mod signal its schema version to the server? Probably a field in the `PushSave` message or `Register` message. The server needs to know what sections to expect.
