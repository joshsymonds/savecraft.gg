---
name: working-on-plugins
description: Game plugin and adapter section design for Savecraft. Use when creating new plugins, designing GameState sections, adding sections to existing parsers, or working on section output in plugins/ or worker/src/adapters/. Triggers on section layout, progressive disclosure, GameState output, plugin sections, adapter sections, section sizing, or overview design.
---

# Working on Plugins: Section Design

Both WASM plugins (`plugins/*/parser/`) and API adapters (`worker/src/adapters/`) produce the same `GameState` shape: `identity`, `summary`, and `sections`. This skill covers how to design sections so they work well with the MCP tools and AI consumers.

For the ndjson contract, WASM runtime, and plugin build system, see `docs/plugins.md`. For API adapter architecture, see `docs/adapters.md`.

## Overview Section (Required)

`get_save` embeds one section's data as the overview in its response. It picks the first match from this list:

```
character_overview → player_summary → overview → summary
```

**Every plugin MUST produce a section matching one of these names.** If none match, `get_save` falls back to the first section alphabetically — which may be a 200KB deck list or item dump.

The overview section is the AI's first look at the save. It should contain enough context to answer "what is this character/save?" and guide the AI to the right detailed sections.

### What belongs in the overview

- Identity: name, class, level, rank — whatever defines "who"
- Key stats: currency, progression milestones, win/loss record
- **Index of available sections** with pointers — deck names (not card lists), character names (not inventories), match list (not turn-by-turn logs)
- Anything that helps the AI decide which section to fetch next

### What does NOT belong in the overview

- Full item lists, card lists, or inventories
- Turn-by-turn logs, match replays, or event histories
- Large nested objects that the AI won't use to route

**Target: overview section < 15KB.** A typical overview is 2-10KB.

## Section Size Limits

| Limit | Value | Enforced by |
|-------|-------|-------------|
| Hard max per section | 80KB | `SECTION_SIZE_LIMIT` in `worker/src/mcp/tools.ts` — `get_section` rejects sections over this |
| Overview target | < 15KB | Convention — keeps `get_save` response usable |
| Individual item section | < 10KB typical | Convention — per-deck, per-character sections |

If a section could exceed 80KB with realistic data, it MUST be split.

## Progressive Disclosure Pattern

When a game has a large collection (decks, characters, items, matches), split into per-item sections with an index in the overview.

### Pattern

```
overview section:
  decks: [{name: "Slivers", format: "Brawl", section: "deck:Slivers"}, ...]

deck:Slivers section:    (full card list, ~5KB)
deck:Control section:    (full card list, ~3KB)
```

The AI sees the index in the overview and fetches individual items as needed. This is how D2R shared stash (`overview` + `tab1`, `tab2`, ...) and MTGA (`player_summary` + `deck:*`, `game:*`) work.

### When to split

Split when **any** of these are true:
- Collection has variable size controlled by the player (decks, blueprints, characters)
- A single collection item can be > 5KB (full card lists, turn-by-turn logs)
- Total collection could exceed 80KB (80 decks × 5KB = 400KB)

### Section naming for per-item sections

Use `prefix:human_readable_name` — the AI requests sections by name, so readability matters.

```
deck:[HB] Slivers          (MTGA deck)
game:7a0be838-0033-4e16    (MTGA game log by matchId)
tab1, tab2, tab3            (D2R stash tabs)
character:Warrior            (per-character sections)
```

### Stale section cleanup

The daemon sends `allSectionNames` in every `PushSave` message. The worker deletes any sections NOT in this list. Dynamic section names (deck:*, game:*) work correctly — the parser includes them all in the output, and the worker cleans up sections that no longer exist.

## Section Descriptions

Section descriptions are the AI's guide for when to fetch a section. Write them as directives, not documentation.

**Good** (tells AI when/why to fetch):
```
"Deck list for [HB] Slivers (Brawl) — main deck, sideboard, and command zone cards"
"Turn-by-turn game log for match abc123 — use to analyze play sequencing and identify misplays"
"Aggregated character stats: resistances, magic find, FCR/FHR breakpoints — use to evaluate gear upgrades"
```

**Bad** (explains what it is, not when to use it):
```
"Contains the player's deck data"
"Game log information"
"Character statistics"
```

## Existing Section Patterns by Game

| Game | Overview Section | Per-Item Sections | Reference |
|------|-----------------|-------------------|-----------|
| D2R Character | `character_overview` | None (sections are small) | `plugins/d2r/parser/main.go` |
| D2R Stash | `overview` | `tab1`, `tab2`, ... | `plugins/d2r/parser/main.go:545` |
| MTGA | `player_summary` | `deck:*`, `game:*` | `plugins/mtga/parser/main.go` |
| Clair Obscur | `overview` | `character:*` | `plugins/clair-obscur/parser/` |
| WoW | `character_overview` | None (API data is bounded) | `worker/src/adapters/wow/` |
| SDV | `player_summary` | None (data is naturally bounded) | `plugins/sdv/parser/main.go` |

## Attribution (Required)

Every plugin must declare an `[attribution]` section in `plugin.toml` listing the third-party IP sources whose data it uses. The build pipeline reads this to embed legal disclaimers in views.

```toml
[attribution]
sources = ["wotc", "scryfall", "17lands"]
```

Valid source keys are defined in `views/src/attributions.ts`: `wotc`, `scryfall`, `17lands`, `blizzard`, `raiderio`, `ludeon`, `concernedape`, `kepler`. To add a new source, add it to the `SOURCES` record in that file first.

The build fails if `[attribution]` is missing or uses an unknown key.

## Checklist for New Plugins

- [ ] Overview section name matches `OVERVIEW_SECTION_NAMES`
- [ ] Overview section < 15KB with realistic data
- [ ] All sections < 80KB with realistic data
- [ ] Large collections use per-item sections with index in overview
- [ ] Section descriptions are AI-directive (when/why to fetch)
- [ ] Section data is always a JSON object (not array, string, or scalar)
- [ ] `[attribution]` declared in `plugin.toml` with valid source keys
- [ ] Tested with a real save file — measure actual section sizes
