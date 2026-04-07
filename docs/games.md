# Supported Games

Savecraft connects to games through three mechanisms: **WASM plugins** that parse local save files on the daemon, **API adapters** that fetch data from game service APIs on the Worker, and **game mods** that export state for the daemon to relay. Each connector produces structured sections that the AI reads via MCP tools. Many games also ship **reference modules** — server-side computation that gives the AI access to game knowledge: drop tables, recipe databases, production calculators, and more.

This document describes what each game connector reads, what sections it produces, and what its reference modules enable.

## Diablo II: Resurrected

**Source:** WASM plugin — parses `.d2s` character files and `.d2i` shared stash files (binary formats)
**Status:** Beta

The D2R plugin is a complete binary parser for the d2s save format used by D2R Reign of the Warlock (v105). It decodes the full character state: header, attributes, skill allocations, and the item codec (Huffman-compressed bitstream with variable-width property fields). For character saves, the plugin emits `character_overview` (name, class, level, difficulty), `attributes` (base stats, HP/mana/stamina pools, unspent points), `skills` (allocated points by skill name), `equipment` (equipped items with full property lists and socket contents), `inventory` (backpack, stash, and Horadric Cube contents), and `totals` (aggregated stats including resistances, magic find, and FCR/FHR/IAS breakpoints). Optional sections appear when relevant: `mercenary` for hired mercenary equipment, `corpse` for items on a dead character's body, and `golem` for an Iron Golem's source item. Shared stash files produce an `overview` section and one section per stash tab.

### Reference: Drop Calculator

Computes drop probabilities for any item from any farmable source in the game. Given a monster and difficulty, it walks the treasure class hierarchy — factoring in NoDrop weights, player count, party size, and magic find — to produce exact drop rates. Supports both forward lookup (what does this monster drop?) and reverse lookup (where do I farm this item?). The data tables (TreasureClassEx, ItemRatio) are compiled into the WASM binary from game assets.

## Magic: The Gathering Arena

**Source:** WASM plugin — parses `Player.log` (text log file, requires detailed logging enabled in MTGA settings)
**Status:** Beta

The MTGA plugin extracts game state from the detailed output log that MTGA writes during play. It produces a `player_summary` with display name, rank in constructed and limited, inventory totals, deck names, and indexes into match and game log data. Each deck the player owns becomes a `deck:{name}` section with full card lists for main deck, sideboard, and command zone. Completed matches appear as `match:{id}` sections with opponent info, rank, and cards seen. Individual games within matches become `game:{id}` sections with turn-by-turn play logs. Draft sessions produce a `draft_history` section with every pick, the pack contents, and the player's pool at each selection.

MTGA has the richest reference module suite in Savecraft — nine native TypeScript modules running in-process on the Worker with access to D1, Vectorize, and Workers AI. The data pipeline behind them includes Scryfall bulk card data, 17Lands draft statistics, MTG Comprehensive Rules, and community function tags, all indexed into D1 with Vectorize semantic embeddings for hybrid search.

### Reference: Card Search

Searches the Scryfall Oracle Card database by name, oracle text, colors, mana cost, type line, format legality, rarity, and set. Uses FTS5 full-text indexing for keyword queries with optional Vectorize semantic search for natural-language lookups. Returns card details including all printings, legalities, and keywords.

### Reference: Rules Search

Hybrid FTS5 + Vectorize search across the MTG Comprehensive Rules and per-card Scryfall rulings. Supports exact rule number lookup, keyword search across rule text, and card-specific ruling queries. The semantic search layer handles natural-language questions like "can I cast instants during combat?" that keyword search would miss.

### Reference: Draft Advisor

The most complex reference module in Savecraft. Evaluates draft picks across six axes: baseline (raw 17Lands win rate statistics), synergy (how well the card works with the player's current pool based on archetype data), role (whether the deck needs more creatures, removal, or other categories), curve (mana cost distribution health), castability (whether the player's color sources can reliably cast the card), and signal (what the pick timing and pack contents reveal about open colors). Each axis produces a normalized score; the composite ranking uses a weighted blend that dampens bomb-level baseline scores when synergy or castability are poor. Operates in two modes: live pick evaluation (ranking candidates for the current pack) and batch review (analyzing all picks made in a completed draft with full axis breakdowns).

### Reference: Play Advisor

Analyzes gameplay decisions against population baselines from 17Lands Premier Draft data. Five modes: `card_timing` compares when the player deployed each card against the turn it's most commonly played, `mana_efficiency` tracks tempo against per-turn mana spend baselines, `attack_analysis` evaluates creature attack decisions, `mulligan` assesses opening hand quality, and `game_review` produces a post-game summary ranking findings by impact on win probability.

### Reference: Card Stats

Browses 17Lands draft statistics without draft context. Four modes: set listing, set overview (top/bottom cards by games-in-hand win rate, most overperforming cards, undervalued picks), individual card detail with per-archetype breakdowns, and sortable leaderboards filterable by archetype and rarity. For contextual draft evaluation, use Draft Advisor instead.

### Reference: Deckbuilding

Two modes for sealed and draft deck refinement. Health check compares the player's deck composition — land count, creature density, mana curve, color fixing — against empirical set data to flag structural problems. Cut advisor scores every non-land card across baseline power, synergy with the rest of the deck, curve fit, role importance, and castability, then identifies the best candidates for removal.

### Reference: Collection Diff

Calculates the wildcard cost to complete a target decklist given the player's current collection. Compares owned cards against the target, groups missing cards by rarity, and produces a total wildcard budget. Accepts the player's collection directly from their save data via section mapping.

### Reference: Match Stats

Personal constructed match history analysis with five query modes: overview (aggregate win rates), by-deck (per-deck performance), by-format (format breakdowns), by-matchup (archetype-based win rates inferred from opponent cards seen), and trend (recent results over time).

### Reference: Sideboard Analysis

Best-of-three sideboarding effectiveness analysis. Compares pre-board game 1 win rate against post-board games 2 and 3 performance, overall and per-opponent-archetype. Since MTGA doesn't expose actual sideboard changes, effectiveness is inferred from outcome deltas between games.

### Reference: Mana Base

Frank Karsten's mana consistency methodology applied to the player's deck. Given a decklist, computes the probability of having the right colored sources to cast each spell on curve, identifies color-fixing gaps, and recommends land configurations.

## Factorio

**Source:** [Factorio Mod Portal](https://mods.factorio.com/mod/savecraft) + WASM plugin — the Savecraft Export mod writes game state as JSON to Factorio's `script-output/savecraft/` directory; the daemon watches that directory and the WASM parser validates and relays the data
**Status:** Alpha

Factorio's connector is a hybrid: a Lua mod running inside the game collects data that Factorio's API exposes, and the daemon picks up the exported JSON. The mod produces `game_overview` (active mods, surfaces, tick count, difficulty, research queue), `machines` (crafting machines by type with utilization statistics), `power` (generation and consumption by source), `production_flow` (item flow rates between production stages), `resources` (raw material reserves on each surface), `logistics` (belt and inserter network topology), `trains` (train schedule and network layout), and `defenses` (turret placement, wall integrity, damage statistics). Section content is defined by the Lua mod and can expand without changing the WASM parser.

Factorio has the deepest reference module suite for factory planning — eight implemented Go WASM modules with two more declared in the manifest for future implementation. All modules use vanilla game data compiled into the binary; modded recipes are not yet reflected.

### Reference: Recipe & Item Lookup

Forward and reverse lookup for any item, recipe, entity, or technology. Given an item name, returns exact ingredients, products, craft time, machine category, and allowed modules. Reverse queries find all recipes that use or produce a given item, or all technologies that unlock a recipe. Prevents AI hallucination on recipe data by grounding every answer in the actual game tables.

### Reference: Production Ratio Calculator

Given a target item and production rate, builds the full dependency tree: machine counts by tier, belt lane requirements, raw material input rates. Accounts for module effects (productivity, speed, efficiency), beacon transmission with distance falloff, and recipe overrides for items with multiple production paths. When the player's save data is available, compares the calculated ratios against the actual factory to identify bottlenecks and surplus.

### Reference: Oil Processing Balancer

Computes optimal refinery and cracking plant counts for target fluid production rates across all oil processing types (basic, advanced, coal liquefaction). Returns machine counts, water and crude oil input rates, and surplus byproducts. Supports module and beacon effects, and optionally compares against the player's existing setup via section mapping.

### Reference: Tech Tree Navigator

Traverses technology prerequisite chains with cumulative science pack costs. Given a target technology and the player's completed research, computes the shortest research path and total cost by pack type.

### Reference: Blueprint Analyzer

Decodes Factorio blueprint strings (version byte + base64 + zlib + JSON), extracts the entity list, and evaluates production ratios, belt throughput, module usage, and inserter adequacy against baked-in recipe data. Useful for reviewing blueprints from the clipboard or online sources before placing them.

### Reference: Evolution & Threat Tracker

Computes biter evolution factor from time elapsed, pollution generated, and spawner nests destroyed using Factorio's asymptotic squashing formula. Predicts the next enemy tier thresholds and estimates time to reach them at current rates.

### Reference: Power Generation Calculator

Given a power demand in MW, calculates entity counts for steam (boiler/engine ratios with fuel choice), solar (panel/accumulator ratios for day-night cycles), and nuclear (reactor neighbor bonuses, heat exchanger and turbine counts, fuel cell consumption) generation setups.

### Reference: Production Flow Diagnosis

Diagnoses factory health by cross-referencing actual production and consumption rates from the player's save data against recipe requirements and machine capabilities. Computes deficit severity, the number of additional machines needed to close each gap, cascade risks where upstream shortages starve downstream production, and technology unlock recommendations for blocked recipes.

## RimWorld

**Source:** C# Harmony mod (Steam Workshop) — the mod collects game state from RimWorld's runtime and pushes it to the daemon via local network connection
**Status:** Alpha

The RimWorld connector uses a Harmony mod with 13 data collectors that extract colony state from the running game. `ColonyOverview` captures resources, research progress, storyteller settings, and recent events. `ColonistRoster` lists all colonists with skills, traits, and health status, while `ColonistDetail` provides full per-colonist breakdowns. Specialized collectors cover `Health` (injuries, illnesses, chronic conditions), `Mood` (mood factors and mental break thresholds), `SkillsAndWork` (skill progression and work priority assignments), `Farming` (crops, soil quality, growing seasons), `Power` (generation and consumption), `Defenses` (turrets, walls, killbox layout), `Rooms` (cleanliness, beauty, impressiveness), `Factions` (relations and standing), `Threats` (incoming raids and threat level), and `Research` (completed and queued projects).

RimWorld's eight reference modules cover the game's core mechanical systems — the formulas that players need but that the game itself obscures. All modules use vanilla game data extracted via the datagen pipeline and compiled into a Go WASM binary.

### Reference: Surgery Calculator

Computes surgery success probability using RimWorld's actual formula, accounting for doctor skill, manipulation and sight capacities, room cleanliness, lighting, whether the room is outdoors, medicine potency, surgery difficulty, and inspired surgery status. Returns the final success chance with a full factor-by-factor breakdown.

### Reference: Crop Optimizer

Calculates nutrition per day per tile and silver per day per tile for any crop on any soil type at a given temperature. Factors in fertility sensitivity, temperature growth speed curves, and colonist growing skill. Enables direct comparison of crop choices for food production vs. cash cropping.

### Reference: Combat Calculator

Computes ranged DPS at any distance with range interpolation across Rimworld's accuracy curves, and melee true DPS accounting for attack speed, damage, and armor penetration. Armor damage reduction calculations show effective damage against armored targets.

### Reference: Material Lookup

Looks up final stats for any item at any material and quality combination. Combines base item stats with material multipliers and quality scaling factors to produce the actual in-game values — sharp damage, blunt damage, armor rating, insulation, beauty, market value, and more.

### Reference: Drug Analyzer

Computes silver per day for drug production chains including raw material growing time, processing steps, and colonist work requirements. Also provides addiction risk data, tolerance buildup rates, and overdose thresholds for each drug type.

### Reference: Raid Estimator

Converts colony wealth to expected raid points using RimWorld's piecewise wealth-to-threat curve (the StorytellerUtility function). Breaks down building wealth vs. item wealth contributions and shows how wealth changes affect raid difficulty.

### Reference: Gene Builder

Validates xenogerm builds against complexity and metabolism budgets. Detects gene conflicts, calculates total complexity and metabolism impact, and checks against the player's specified limits. Supports searching and filtering the gene database by category.

### Reference: Research Navigator

Traverses the research tree with prerequisite chains and cumulative costs. Given a target technology, shows the full research path, total research points needed, and any techprint requirements.

## Stardew Valley

**Source:** WASM plugin — parses the game's XML save files (extensionless files in the save directory)
**Status:** Beta

The Stardew Valley plugin parses the game's XML save format, which contains the entire farm state in a single file. It produces `player_summary` (farmer identity, date, money, skill levels, perfection percentage, social overview, and a section index for navigation), `character` (skills with XP, chosen professions, and mastery data), `social` (NPC friendship points, hearts, marriage status, children, and gift tracking), `inventory` (backpack contents with tool upgrades, weapons, item stacks, and quality levels), `bundles` (Community Center or Joja bundle completion by room and slot), `collections` (fish caught, cooking and crafting recipes known, shipping log, and museum donations), `progress` (Stardrops found, Golden Walnuts, active quests, special orders, and monster slayer goals), `perfection` (perfection percentage breakdown by category with point values), and `farm` (buildings, active crops, sprinkler zones, scarecrow coverage, and processing machines).

### Reference: Crop Planner

Looks up crop growth data, profitability, and artisan goods values. Given a crop name, returns growth time, valid seasons, base sell price, and gold per day. Given a season, returns all available crops ranked by profitability. Accounts for fertilizer effects and artisan goods processing (kegs, preserves jars) in profit calculations.

### Reference: Gift Preferences

NPC gift preference lookup in both directions. Given a villager name, returns their loved, liked, disliked, and hated items. Given an item name, returns which villagers love, like, dislike, or hate it. Data sourced from Stardew Valley 1.6 gift taste tables.

## World of Warcraft

**Source:** API adapter (TypeScript) — fetches character data from the Blizzard Battle.net API with Raider.io enrichment; no local files or daemon required
**Status:** Beta

The WoW adapter is the first API-backed connector. Players authenticate via Battle.net OAuth, and the adapter fetches character data from nine Blizzard API endpoints in parallel: account profile, character profile, equipment, statistics, specializations, mythic keystone profile (with current season detail), raid encounters, and professions. Raider.io scores are fetched as optional enrichment — if the request fails, the primary data still returns. The adapter produces `character_overview` (name, level, race, class, active spec, faction, guild, achievement points, item level, active title, last login, and Raider.io ranking), `equipped_gear` (all equipped items with item level, stats, enchantments, gems, and set bonuses), `character_stats` (primary, secondary, and tertiary stats plus armor and defensive values), `talents` (active talent build with class, spec, hero, and PvP talent selections plus the loadout import code), `mythic_plus` (best Mythic+ runs, keystone levels, ratings by dungeon, and Raider.io M+ scores), `raid_progression` (boss kills by difficulty across all tracked expansions), and `professions` (primary and secondary professions with skill points and recipe counts).

WoW has no reference modules — the Blizzard API data is self-contained and the game's theorycrafting community maintains external tools that are better suited to simulation-based optimization than static reference lookups.

## Clair Obscur: Expedition 33

**Source:** WASM plugin — parses Unreal Engine 5 GVAS binary save files (`.sav`)
**Status:** Alpha

The Clair Obscur plugin uses a shared GVAS parser (`plugins/gvas/`) that handles Unreal Engine 5's binary save format, including property tag flags, nested structures, and array types with safety limits against malformed data. The plugin produces an `overview` section (playtime, New Game+ cycle, current location, gold, difficulty setting, and a character roster with levels), per-character `character:{name}` sections (level, experience, HP/MP/AP, base stats, equipped skills, gear, and Lumina allocations), `party` (active party composition), `inventory` (item contents), `progression` (story milestones), and `weapons` (equipped and unlocked weapons). The shared GVAS parser is reusable for any future Unreal Engine game plugins.

Clair Obscur has no reference modules yet. Damage formulas and item categorization are planned.

## Stellaris

**Source:** Rust WASM plugin — parses `.sav` files (ZIP containing Clausewitz-format `meta` + `gamestate`)
**Status:** Alpha

The Stellaris plugin is the first Rust WASM plugin, sharing the `clausewitz-core` library with the planned Victoria 3 plugin. It uses the `jomini` crate for Clausewitz format parsing and produces 13 sections: `overview` (empire identity, ethics, civics, authority, origin, rank, resource stockpiles, DLCs, game version), `economy` (income/expense breakdown by resource with category detail, net balance), `technology` (researched techs, in-progress research with progress %, available alternatives, repeatables), `military` (fleet power, fleet size, naval capacity, empire size), `wars` (active wars with participants, war goals, war exhaustion), `diplomacy` (relations sorted by opinion, casus belli), `progression` (traditions, ascension perks, active edicts), `leaders` (ruler, scientists, admirals, generals with traits, level, age), `species` (species traits, founder species), `factions` (faction happiness, support), `exploration` (archaeological sites), `geography` (owned/controlled planet IDs), and `planets` (per-colony: class, size, designation, pops, stability, crime, amenities, housing).

Stellaris has the largest reference module suite by game data volume — nine Rust WASM modules with 4,782 game data entries covering all vanilla and DLC content. The data is generated from the game's `common/` directory by a jomini-based datagen pipeline and embedded at compile time into a 474KB WASM binary. Three modules have interactive views: Technology Search, Ship Component Search, and Technology Path.

### Reference: Technology Search

Searches all 663 technologies by name, area (physics/society/engineering), tier, or category. Returns cost, prerequisites, research weight, and start/repeatable flags. Supports case-insensitive matching. **Has view:** sortable DataTable with area-colored badges.

### Reference: Technology Path

Resolves the full prerequisite chain for a target technology. Accepts an optional `researched` array (from the save's technology section) to annotate each step as completed or remaining. Returns a topologically sorted chain with per-tech area, tier, cost, and researched status, plus total and remaining research cost. **Has view:** Timeline with researched/remaining coloring and remaining cost hero stat.

### Reference: Building Search

Searches 490 buildings by name or category. Returns build time and capital status.

### Reference: Ship Component Search

Searches 1,379 ship components (weapons, utilities, reactors, combat computers) by name, size slot, or component set. Returns power draw and tech prerequisites. **Has view:** sortable DataTable with size badges and power coloring (green for generators, red for consumers).

### Reference: Tradition & Ascension Perk Search

Searches 279 traditions and ascension perks by name or category.

### Reference: Species & Leader Trait Search

Searches 1,098 species traits and leader traits by name or category. Returns trait cost.

### Reference: Civic & Origin Search

Searches 335 civics and origins by name. Distinguishes civics from origins via the `is_origin` flag.

### Reference: Edict & Policy Search

Searches 165 edicts and policies by name or category. Returns edict cost.

### Reference: Pop Job Search

Searches 373 pop jobs by name or category (worker, specialist, ruler).

## Victoria 3 (Planned)

**Source:** Rust WASM plugin — will parse Clausewitz-format save files (ZIP containing text or binary game state)
**Status:** Spec complete, implementation not started

Victoria 3 shares `clausewitz-core` and `jomini` with the Stellaris plugin. The 2MB result cap requires aggressive summarization for late-game saves. Both a `parser.wasm` and `reference.wasm` are planned. The reference module will provide building, law, technology, and goods data lookups to help the AI explain Victoria 3's notoriously opaque economic and political systems.
