/**
 * PoE2 build_planner — native reference module.
 *
 * PoE2 configuration for the shared build_planner core (see
 * worker/src/reference/pob-planner.ts for the game-agnostic plumbing:
 * pobFetch/auth, /resolve /modify /nearby /audit /compare /build/{id}/summary,
 * recoveryXml re-feed, and connected-character snapshot resolution). This
 * file supplies poe2-specific metadata: module id/description/parameters,
 * the poe2_build_snapshot table, and no buy_similar support — pob-server's
 * QueryMods/trade-mod lookup is dumped exclusively from the poe1 process
 * pool (see cmd/pob-server/compare.go's lookupQueryModsLeg), so a poe2
 * caller passing buy_similar gets a clear error rather than a silently
 * best-effort (or empty) trade URL.
 *
 * The operations list also excludes set_bandit/set_pantheon — Path of
 * Exile 2 has no bandit quest or pantheon system, so those ops are simply
 * absent from the documented op set (mirroring build-planner's existing
 * idiom: individual op names are never validated client-side; pob-server /
 * PoB2 rejects unrecognised ops itself).
 */

import { URLS } from "../../../shared/content/facts";
import { createBuildPlannerExecute } from "../../../worker/src/reference/pob-planner";
import type { NativeReferenceModule } from "../../../worker/src/reference/types";

export const buildPlannerModule: NativeReferenceModule = {
  id: "build_planner",
  name: "Build Planner",
  description:
    "Analyze, modify, or explore a Path of Exile 2 build via Path of Building 2. " +
    "First call returns a compact summary (DPS, life, resists, attributes), character info (class, ascendancy, specialisations), and a section_index listing available detail sections. " +
    "The summary includes per-element damage breakdown (PhysicalHitAverage, FireHitAverage, ColdHitAverage, LightningHitAverage, ChaosHitAverage) showing the actual damage type split after all conversion and 'gain as extra' mechanics — " +
    "check these BEFORE recommending element-specific gem or support changes. A skill tagged 'Fire' may deal significant chaos damage via gear conversion. " +
    "The items section includes mod text for rare/magic items — use these to understand gear-based conversion, added-as-extra, and other build-defining mechanics. Unique item mods are not shown (use unique_search to look them up by name). " +
    "Request sections='config' to see active configuration overrides (combat conditions, enemy settings, Wither stacks, etc.). " +
    "To determine Low Life status, check config for conditionLowLife — do NOT rely on LifeUnreservedPercent, which reflects static reservations only, not combat-conditional effects. " +
    "To drill deeper, call again with the buildId and sections parameter (e.g. sections='offense,defense'). " +
    "Stat sections return curated key stats plus _extra_keys listing other available stats — use stat_keys to request specific extras. " +
    "For modifications, pass buildId + operations. The response includes a changes object with {before, after, delta} for every summary stat that changed — " +
    "present the delta to the player, not the full stat dump. " +
    "For tree exploration, pass buildId + nearby_metrics to find the highest-impact nearby nodes ranked by real calc deltas. " +
    "For tree pruning, pass buildId + audit_allocated to find weak branches in the CURRENT allocated tree — ranked by what the player would lose by removing them, with a dead_weight bucket of zero-contribution nodes. Pairs naturally with nearby_metrics: audit identifies underperforming branches, nearby finds replacement directions, you propose the swap. " +
    "To drill into WHY a stat has its value (which item, tree node, skill, or specialisation contributes), pass mod_sources with the stat names. The response carries data.statSources keyed by stat with top-N source rows. " +
    "Decomposable stats (return real per-mod rows): Life, EnergyShield, Mana, Spirit, Armour, Evasion, Strength, Dexterity, Intelligence, resistances, BlockChance, SpellSuppressionChance, LifeRegen, ManaRegen, CritChance, ailment-chance/effect stats, hit-damage component stats — anything stored as a mod against the player's actor. " +
    "Non-decomposable stats (return empty arrays — calc-aggregate / derived): CombinedDPS, TotalDPS, FullDPS, AverageHit, Speed, EHP, MaximumHitTaken variants. PoB computes these from other stats; there is no per-mod attribution to walk. " +
    'When a player asks why two builds diverge on a damage stat, request the underlying decomposable inputs (crit components, hit-damage adders, conversion mods, gear-source life-as-extra-mana, etc.) — NOT CombinedDPS, which will return []. Aggregate stats serve as quick "is this build behaving fundamentally differently?" tells, not as source-decomposable answers. ' +
    'Use nearby_categories on a /resolve or /modify call to focus the inline power_report on a specific node type (e.g. nearby_categories=["Keystone"] when the player asks "any keystone I should grab?") — pair with audit_categories on a follow-up audit_allocated call to get symmetric remove/add suggestions confined to the same category axis. ' +
    "When narrating /compare gear diffs, filter to slots where modsSame is false — modsSame:true means no mechanical divergence even when nameSame:false (rare reroll, RELIC/UNIQUE foil flag), so those slots add noise without insight. " +
    'Each compared socket group carries mainGemLinkCount (link count of the main gem\'s socket), hostItemMaxLink (largest link on the host item), and hostItemName — read these directly to answer "is this skill 6-linked?" instead of re-correlating with sections.gear.items by slot. ' +
    "diffs.tree.allocatedOnlyIn is an array indexed parallel to builds[]; failed builds get [] at their index — index by build position, not buildId. " +
    "Config keys prefixed multiplier (e.g. multiplierRage, multiplierWitheredStackCount, multiplierFrenzyCharges) are user-set knobs the calc reads as inputs; the resulting runtime stats live in offense/defense and may be cap-clamped against gear-derived maxima. Read the runtime stat in offense/defense for the post-calc effect — the config value is what was requested, not what's being applied. " +
    "Every response includes a buildId for follow-up calls. " +
    "If the player has connected their Path of Exile 2 account to Savecraft, pass `character:\"current\"` (their most-recently-played character) or `character:\"<name>\"` instead of a build URL — Savecraft analyzes their live imported character with no copy-paste. The `build` URL remains the fallback for builds that aren't theirs or for players who haven't connected an account. " +
    "PoE2 has no bandit quest and no pantheon system — the operations list has no set_bandit/set_pantheon ops, and there is no bandit/pantheon field in character info. buy_similar trade-search enrichment (available for PoE1 builds) is not supported for PoE2 — pob-server's trade-mod lookup is poe1-only.",
  parameters: {
    character: {
      type: "string",
      description:
        `Analyze the player's own connected Path of Exile 2 character — no URL needed. Pass "current" for their most-recently-played character, or the exact character name. Requires the player to have connected their PoE2 account at ${URLS.app} and run refresh_save for that character. Preferred over \`build\` whenever the player asks about THEIR character/build. Mutually exclusive with \`build\`; ignored if \`build\` or \`build_id\` is also given.`,
    },
    build: {
      type: "string",
      description:
        "URL to a PoB2 build (pobb.in, pastebin, pob.savecraft.gg link). Use for builds that are NOT the player's own connected character (e.g. a guide/build they want to inspect). For the player's own character prefer `character`. Omit when modifying an existing build by buildId.",
    },
    build_id: {
      type: "string",
      description:
        "Build ID from a previous build_planner response. Use this to modify, re-analyze, or explore a build without a URL. Omit on first call.",
    },
    operations: {
      type: "array",
      items: { type: "object" },
      description:
        'Array of modifications to apply to the build. Omit for pure analysis. Each operation is an object with an "op" field and operation-specific parameters. Pass operations as a real JSON array (NOT a JSON-encoded string). Operations are applied in order. Available operations:\n' +
        '- {"op":"set_level","level":95} — Set character level.\n' +
        '- {"op":"swap_gem","socket_group":0,"gem_index":1,"new_gem":"Ruthless Support","level":20,"quality":20} — Replace a gem in a socket group (0-indexed).\n' +
        '- {"op":"add_gem","socket_group":0,"gem":"Inspiration Support","level":20,"quality":20} — Add a gem to a socket group.\n' +
        '- {"op":"remove_gem","socket_group":0,"gem_index":3} — Remove a gem by index from a socket group.\n' +
        '- {"op":"toggle_keystone","name":"Resolute Technique","enabled":false} — Allocate or deallocate a keystone passive.\n' +
        '- {"op":"allocate_node","name":"Unwavering Stance"} — Allocate a notable or keystone by name. Auto-paths through travel nodes. Response includes an allocation_log section showing every node allocated along the path and the total points spent.\n' +
        '- {"op":"deallocate_node","name":"Phase Acrobatics"} — Deallocate a notable or keystone by name. Errors if the node is not currently allocated.\n' +
        '- {"op":"equip_unique","name":"Abyssus","slot":"Helmet"} — Equip a unique item by name. Slots: Weapon 1, Weapon 2, Helmet, Body Armour, Gloves, Boots, Belt, Ring 1, Ring 2, Amulet. For flasks, use equip_flask instead.\n' +
        '- {"op":"equip_flask","name":"Taste of Hate","slot":"Flask 2"} — Equip a unique flask by name and activate it. Slots: Flask 1, Flask 2, Flask 3, Flask 4, Flask 5. The flask is automatically toggled active so its stats are included in calculations.\n' +
        '- {"op":"set_item","slot":"Body Armour","rarity":"Rare","name":"Bramble Song","base":"Astral Plate","mods":["+80 to maximum Life","80% increased Armour"]} — Equip a rare custom item. Required fields: slot (any equipment slot except flask slots), rarity ("Rare" only — use equip_unique for Unique items), name (the rare\'s display name, e.g. "Bramble Song"), base (the base type, e.g. "Astral Plate", "Kinetic Wand"). Optional: mods (array of modifier strings as PoB displays them in-tooltip, e.g. "+80 to maximum Life", "38% increased Critical Strike Chance"). The server constructs PoB\'s item text from these fields — do not pass a "text" field; do not hand-format the PoB skeleton yourself. Magic/Normal rarities are not currently supported by set_item.\n' +
        '- {"op":"set_config","var":"multiplierWitheredStackCount","value":15} — Set any PoB config override. Common vars: multiplierWitheredStackCount, conditionLowLife, conditionStationary, conditionFullLife, resistancePenalty, enemyIsBoss.\n' +
        "PoE2 has no bandit quest and no pantheon system — there are no set_bandit/set_pantheon ops.",
    },
    sections: {
      type: "string",
      description:
        "Comma-separated section names to include in the response (e.g. 'offense,defense'). " +
        "Omit for a top-line summary only — character info plus the canonical summary stats. " +
        "Six sections are valid:\n" +
        "- offense: hit damage, DPS, ailments (bleed/poison/ignite), minion offense, charges, limits.\n" +
        "- defense: armour, evasion, energy shield, resistances, EHP, recovery, minion defense.\n" +
        "- gear: equipped items by slot (gear.items) and skill socket groups (gear.socket_groups).\n" +
        "- tree: allocated passive points (allocated_nodes, available_points = level_points + quest_points + extra_points), tree.version, plus tree.keystones.\n" +
        "- config: active configuration overrides (conditions, enemy settings, combat state).\n" +
        "- summary: same shape returned at the top level when sections is omitted; explicitly request it as part of a multi-section call.\n" +
        "Stat sections (offense, defense) return curated key stats by default plus an _extra_keys array listing other available stat names. " +
        "Use the stat_keys parameter to include specific extra keys alongside the curated defaults. " +
        "After allocate_node, the response includes an allocation_log section showing every node allocated along the path and points spent. " +
        "Unknown or retired section names return an error listing the six valid choices.",
    },
    stat_keys: {
      type: "string",
      description:
        "Comma-separated stat key names to include alongside the curated defaults in stat sections (e.g. 'PierceChance,AreaOfEffectMod'). " +
        "Use this to drill into specific stats discovered via _extra_keys in a previous response. " +
        "Any PoB calc output key is accepted. Only used with sections parameter.",
    },
    nearby_metrics: {
      type: "string",
      description:
        'JSON array of stat names to rank nearby nodes by (e.g. \'["Life","CombinedDPS"]\'). ' +
        "Triggers explore mode: finds unallocated nodes reachable from the current tree and ranks them by real calc impact per passive point. " +
        "Requires build_id. Returns one ranked list per metric, each with baseline value and top nodes including stat deltas, path cost, travel path, and efficiency score. " +
        "Common metrics: Life, EnergyShield, CombinedDPS, FullDPS, Armour, Evasion, BlockChance, " +
        "SpellSuppressionChance, PhysicalMaximumHitTaken, ColdMaximumHitTaken, FireMaximumHitTaken, " +
        "LightningMaximumHitTaken, Str, Dex, Int. Any PoB calc output key is accepted.",
    },
    nearby_radius: {
      type: "number",
      description:
        "Maximum path distance for nearby node search (default 5). " +
        "Increase to discover high-value nodes further from the current tree. Only used with nearby_metrics.",
    },
    nearby_limit: {
      type: "number",
      description:
        "Maximum results per metric (default 10). Only used with nearby_metrics.",
    },
    nearby_delta_stats: {
      type: "string",
      description:
        "JSON array of extra stat names to include in each node's deltas for context " +
        '(default \'["Life","CombinedDPS","EnergyShield"]\'). Only used with nearby_metrics.',
    },
    nearby_sort: {
      type: "string",
      description:
        "Sort order for nearby results: 'desc' (default) ranks nodes with the highest positive impact first " +
        "(best improvements). 'asc' ranks nodes with the most negative impact first " +
        "(useful for finding what would hurt a stat). Only used with nearby_metrics.",
    },
    nearby_categories: {
      type: "array",
      items: { type: "string" },
      description:
        "Restrict node-category ranking to specific PoB types. Use when the player " +
        'asks specifically about keystones ("what keystones could I grab?" → ' +
        '["Keystone"]) or jewel sockets ("any nearby jewel sockets?" → ' +
        '["JewelSocket"]). Valid: Normal, Notable, Keystone, Mastery, JewelSocket, ' +
        "ClusterNotable, ClusterSocket. Default [Normal, Notable, Keystone] — broadly " +
        "applicable for general tree exploration. Used by nearby_metrics AND by the " +
        "inline power_report that auto-attaches to every build resolution / modify " +
        "call — passing this on a /resolve or /modify focuses that report on the " +
        'category the player cares about (e.g. ask "what\'s nearby?" focused on ' +
        "keystones without making a separate nearby call).",
    },
    audit_allocated: {
      type: "string",
      description:
        "Set to 'true' to audit the player's CURRENT allocated passive tree for underperforming branches. " +
        "Inverse of nearby_metrics: instead of suggesting nodes to add, identifies branches to consider removing. " +
        "Returns ranked branches with real per-branch deltas (what you'd lose by cutting), each branch's terminal " +
        "(the notable/keystone the branch was taken for), per-node breakdown of which nodes inside the branch are " +
        "removable in isolation, and a dead_weight bucket of zero-contribution nodes. " +
        "Pairs with nearby_metrics: call this first to find weak branches, then call nearby_metrics to find " +
        "replacement directions, then propose the swap. Requires build_id.",
    },
    audit_metrics: {
      type: "string",
      description:
        'JSON array of stat names to rank weak branches by (default \'["Life","CombinedDPS","EnergyShield"]\'). ' +
        "Branches are ranked by their delta in the FIRST metric. Common metrics: Life, EnergyShield, CombinedDPS, " +
        "FullDPS, Armour, Evasion. Any PoB calc output key is accepted. Only used with audit_allocated.",
    },
    audit_delta_stats: {
      type: "string",
      description:
        "JSON array of additional stat names to include in each branch's deltas for context " +
        "(defaults to audit_metrics). Branches always carry deltas for these AND for audit_metrics. " +
        "Only used with audit_allocated.",
    },
    audit_branch_limit: {
      type: "number",
      description:
        "Maximum branches to return after ranking (default 10, max 50). Only used with audit_allocated.",
    },
    audit_node_limit: {
      type: "number",
      description:
        "Maximum leaf nodes to drill into per scope for the per-node breakdown (default 20, max 100). " +
        "Higher values give richer per-node detail but cost more PoB calc time. Only used with audit_allocated.",
    },
    audit_include_zero: {
      type: "string",
      description:
        "Set to 'false' to suppress the dead_weight bucket (default 'true', meaning zero-contribution nodes " +
        "are flagged). Only used with audit_allocated.",
    },
    audit_sort: {
      type: "string",
      description:
        "Sort order for audit results: 'weakest' (default) puts branches you'd lose the LEAST by removing first " +
        "(closest-to-zero deltas — the cuts to suggest). 'strongest' puts branches you'd lose the MOST by removing first " +
        "(load-bearing branches — what's actually carrying the build). Only used with audit_allocated.",
    },
    audit_scope: {
      type: "string",
      description:
        "Which part of the tree to audit: 'tree' (default, the regular passive tree), 'ascendancy' (only ascendancy nodes — " +
        "for respec analysis), or 'both' (returns parallel tree_branches and ascendancy_branches sections, never merged " +
        "since they suggest structurally different actions). Only used with audit_allocated.",
    },
    audit_categories: {
      type: "array",
      items: { type: "string" },
      description:
        "Restrict audit branches to those terminating in specific categories. Use when " +
        "the player wants to focus on a particular kind of cut — e.g. 'are any of my " +
        'keystones underperforming?\' → ["Keystone"]. Default empty → no filter ' +
        "(every branch surfaces, since segmentation already restricts terminals to " +
        "Notable + Keystone). Valid values mirror nearby_categories. Only used with " +
        "audit_allocated.",
    },
    compare_with: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of additional build URLs or build_ids to compare against the primary build. " +
        "Triggers compare mode: returns per-build summaries plus diffs across summary stats, " +
        "allocated tree nodes, equipped gear, skill socket groups, and configuration overrides " +
        "(diffs.config — only keys that disagree across builds, with heterogeneous values: " +
        "numbers like enemyLevel, booleans like raiseSpectreEnableBuffs, short strings like " +
        "enemyIsBoss). Each diff entry uses perBuild arrays so the response shape is identical " +
        "at N=2 and N=3+. The primary (build or build_id) is iterated alongside compare_with — " +
        "pass at least one additional build here. Compare mode takes precedence over " +
        "modify/nearby/audit when compare_with is set. Note: buy_similar trade-search " +
        "enrichment is NOT available for PoE2 builds (poe1-only).",
    },
    mod_sources: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of stat names to drill into per-modifier sources for. Use when " +
        "explaining WHY a build has a given stat value — e.g. 'why is my Life so low' " +
        '→ pass ["Life"]; \'what\'s contributing to my crit\' → pass ["CritChance"]; ' +
        '\'walk me through this build\'s defenses\' → pass ["Armour","Evasion","EnergyShield","Life"]. ' +
        "Each requested stat returns a top-N list of modifier rows under " +
        "data.statSources[statName], where each row carries source_type " +
        "(Item/Tree/Skill/Spectre/Class/Base), source_name (the " +
        "actual item / passive node / gem / etc. that contributes), mod_name, " +
        "mod_type (BASE/INC/MORE/FLAG/OVERRIDE), and value. " +
        "DECOMPOSABLE stats (mod-backed; return real rows): Life, EnergyShield, Mana, Spirit, " +
        "Armour, Evasion, Strength, Dexterity, Intelligence, FireResist, ColdResist, " +
        "LightningResist, ChaosResist, BlockChance, SpellSuppressionChance, LifeRegen, " +
        "ManaRegen, CritChance, plus most ailment-chance/effect and hit-damage component " +
        "stats. " +
        "NON-DECOMPOSABLE stats (calc-aggregate / derived; return empty arrays []): " +
        "CombinedDPS, TotalDPS, FullDPS, AverageHit, Speed, CombinedAvg, TotalDot, EHP, " +
        "PhysicalMaximumHitTaken / FireMaximumHitTaken / ColdMaximumHitTaken / " +
        "LightningMaximumHitTaken / ChaosMaximumHitTaken. PoB computes these from other " +
        "stats — there's nothing to walk. To explain damage divergence, request the " +
        "underlying decomposable inputs (crit chance/multi, hit-damage adders, conversion " +
        "mods, life-as-extra-mana, etc.), not the aggregate. " +
        "Works with build / build_id / operations / compare_with — when combined with " +
        "compare_with, EVERY build in the response gets its own statSources for the " +
        "requested stats, useful for 'which build has more flat life from items vs tree' " +
        "style cross-build analysis. Heavy field — only request the stats you'll actually " +
        "surface to the user. Default empty.",
    },
    mod_sources_limit: {
      type: "integer",
      description:
        "Top-N limit per stat for mod_sources, sorted by abs(value) descending. " +
        "Default 10. Range 1-50; the cap exists because a single high-DPS stat can " +
        "have 50+ contributing mods and the response payload would balloon.",
    },
  },

  execute: createBuildPlannerExecute({
    gameId: "poe2",
    snapshotTable: "poe2_build_snapshot",
    gameLabel: "Path of Exile 2",
    gameAbbrev: "PoE2",
    supportsBuySimilar: false,
  }),
};
