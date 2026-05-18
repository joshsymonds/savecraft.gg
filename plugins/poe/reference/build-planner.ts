/**
 * PoE build_planner — native reference module.
 *
 * Bridges the headless Path of Building calc service (pob-server) into the
 * MCP reference module system. Supports four workflows:
 *
 *   1. Analyze: pass a build URL → get structured calc results + buildId
 *   2. Modify: pass a buildId + operations → get updated results + new buildId
 *   3. Explore: pass a buildId + nearby_metrics → get ranked nearby nodes by impact
 *   4. Audit:   pass a buildId + audit_allocated → get ranked weakest branches +
 *               dead_weight nodes (the inverse of explore — what to cut)
 *
 * Every call returns a buildId that can be used for subsequent modifications,
 * enabling iterative build design without the player exporting build codes.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

/** Timeout for PoB requests (ms). */
const POB_TIMEOUT_MS = 30_000;

/** Minimal URL validation — must have a scheme and host. */
function isURL(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// friendlyBuildLabel collapses a /compare input (URL or buildId) to a
// short identifier suitable for a column header sublabel. Disambiguates
// columns when the per-build class+level happens to match across builds
// (two Scion L99s look identical without this).
//
//   https://pobb.in/OeN3b-6rvLSM       → "pobb.in/OeN3b-6rvLSM"
//   https://www.pathofexile.com/...    → "pathofexile.com/..."
//   21df3afc0a5138821b8f1c071d6523cd   → "21df3afc"
//   <anything else>                    → input truncated to 24 chars
function friendlyBuildLabel(input: string): string {
  if (/^[a-f0-9]{32}$/.test(input)) return input.slice(0, 8);
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/^\/+/, "").split("/").filter(Boolean)[0];
    return path ? `${host}/${path}` : host;
  } catch {
    return input.length > 24 ? input.slice(0, 24) + "…" : input;
  }
}

/**
 * Re-feed a stored PoB XML snapshot to pob-server /calc. The buildId is
 * content-addressed, so this deterministically re-materializes the SAME
 * build that was evicted from pob-server's store — no GGG call, no
 * /import, no buildId drift. Used to transparently recover when a
 * connected-character snapshot's buildId is no longer resident.
 */
function refeedBuild(
  pobUrl: string,
  xml: string,
  apiKey?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return fetch(`${pobUrl}/calc`, {
    method: "POST",
    headers,
    body: JSON.stringify({ buildXml: xml }),
    signal: AbortSignal.timeout(POB_TIMEOUT_MS),
  });
}

async function pobFetch(
  pobUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey?: string,
  sections?: string,
  statKeys?: string,
  recoveryXml?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const params = new URLSearchParams();
  if (sections) params.set("sections", sections);
  if (statKeys) params.set("stat_keys", statKeys);
  const qs = params.toString();
  const url = qs ? `${pobUrl}${path}?${qs}` : `${pobUrl}${path}`;
  const issue = (): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(POB_TIMEOUT_MS),
    });
  const response = await issue();
  // A 404 on a connected-character buildId means pob-server evicted the
  // build from its store. Re-feed the stored XML (deterministic identical
  // buildId) and retry the original call once.
  if (response.status === 404 && recoveryXml) {
    const refed = await refeedBuild(pobUrl, recoveryXml, apiKey);
    if (refed.ok) return issue();
  }
  return response;
}

interface CharacterSnapshot {
  buildId: string;
  xml: string;
}

type SnapshotResolution =
  | { ok: true; snapshot: CharacterSnapshot }
  | { ok: false; guidance: string };

/**
 * Resolve a connected PoE character to its stored PoB snapshot.
 *
 * `character:"current"` → the user's most-recently-played (most recently
 * refreshed) PoE save; otherwise an exact save_name match. Joins
 * poe_build_snapshot so a save with no imported build is treated as
 * "refresh first" guidance, not a hit. NEVER calls GGG or pob-server
 * /import — pure D1 read of state populated by refresh_save (epic req 10).
 */
async function resolvePoeCharacterSnapshot(
  env: Env,
  userUuid: string,
  character: string,
): Promise<SnapshotResolution> {
  const isCurrent = character.toLowerCase() === "current";
  const base =
    `SELECT bs.pob_build_id AS buildId, bs.pob_xml AS xml
       FROM saves s
       JOIN poe_build_snapshot bs ON bs.save_uuid = s.uuid
      WHERE s.user_uuid = ? AND s.game_id = 'poe' AND s.removed_at IS NULL`;
  const row = isCurrent
    ? await env.DB.prepare(`${base} ORDER BY s.last_updated DESC LIMIT 1`)
        .bind(userUuid)
        .first<{ buildId: string; xml: string }>()
    : await env.DB.prepare(`${base} AND s.save_name = ? LIMIT 1`)
        .bind(userUuid, character)
        .first<{ buildId: string; xml: string }>();

  if (row) {
    return { ok: true, snapshot: { buildId: row.buildId, xml: row.xml } };
  }

  // No snapshot. Distinguish "save exists, never refreshed" from "no such
  // connected character" so the guidance points at the right next step.
  const saveExists = isCurrent
    ? await env.DB.prepare(
        "SELECT 1 AS x FROM saves WHERE user_uuid = ? AND game_id = 'poe' AND removed_at IS NULL LIMIT 1",
      )
        .bind(userUuid)
        .first()
    : await env.DB.prepare(
        "SELECT 1 AS x FROM saves WHERE user_uuid = ? AND game_id = 'poe' AND removed_at IS NULL AND save_name = ? LIMIT 1",
      )
        .bind(userUuid, character)
        .first();

  const who = isCurrent
    ? "your most-recently-played character"
    : `character "${character}"`;
  const guidance = saveExists
    ? `No imported Path of Exile build yet for ${who}. Run refresh_save for this PoE character first — that imports the live build into Savecraft — then call build_planner again with the same character.`
    : `No connected Path of Exile character ${isCurrent ? "found" : `named "${character}"`}. Connect your Path of Exile account at savecraft.gg/settings, run refresh_save, then retry. (To analyze a build that isn't yours, pass its URL via the build parameter instead.)`;
  return { ok: false, guidance };
}

export const buildPlannerModule: NativeReferenceModule = {
  id: "build_planner",
  name: "Build Planner",
  description:
    "Analyze, modify, or explore a Path of Exile build via Path of Building. " +
    "First call returns a compact summary (DPS, life, resists, attributes), character info (class, ascendancy, bandit, pantheon), and a section_index listing available detail sections. " +
    "The summary includes per-element damage breakdown (PhysicalHitAverage, FireHitAverage, ColdHitAverage, LightningHitAverage, ChaosHitAverage) showing the actual damage type split after all conversion and 'gain as extra' mechanics — " +
    "check these BEFORE recommending element-specific gem or support changes. A skill tagged 'Fire' may deal significant chaos damage via gear conversion. " +
    "The items section includes mod text for rare/magic items — use these to understand gear-based conversion, added-as-extra, and other build-defining mechanics. Unique item mods are not shown (use unique_search to look them up by name). " +
    "Request sections='config' to see active configuration overrides (combat conditions, enemy settings, Wither stacks, etc.). " +
    "To determine Low Life status, check config for conditionLowLife — do NOT rely on LifeUnreservedPercent, which reflects static reservations only, not combat-conditional effects like Dissolution of the Flesh. " +
    "To drill deeper, call again with the buildId and sections parameter (e.g. sections='offense,defense'). " +
    "Stat sections return curated key stats plus _extra_keys listing other available stats — use stat_keys to request specific extras. " +
    "For modifications, pass buildId + operations. The response includes a changes object with {before, after, delta} for every summary stat that changed — " +
    "present the delta to the player, not the full stat dump. " +
    "For tree exploration, pass buildId + nearby_metrics to find the highest-impact nearby nodes ranked by real calc deltas. " +
    "For tree pruning, pass buildId + audit_allocated to find weak branches in the CURRENT allocated tree — ranked by what the player would lose by removing them, with a dead_weight bucket of zero-contribution nodes. Pairs naturally with nearby_metrics: audit identifies underperforming branches, nearby finds replacement directions, you propose the swap. " +
    "To drill into WHY a stat has its value (which item, tree node, skill, or pantheon contributes), pass mod_sources with the stat names. The response carries data.statSources keyed by stat with top-N source rows. " +
    "Decomposable stats (return real per-mod rows): Life, EnergyShield, Mana, Armour, Evasion, Strength, Dexterity, Intelligence, resistances, BlockChance, SpellSuppressionChance, LifeRegen, ManaRegen, CritChance, ailment-chance/effect stats, hit-damage component stats — anything stored as a mod against the player's actor. " +
    "Non-decomposable stats (return empty arrays — calc-aggregate / derived): CombinedDPS, TotalDPS, FullDPS, AverageHit, Speed, EHP, MaximumHitTaken variants. PoB computes these from other stats; there is no per-mod attribution to walk. " +
    'When a player asks why two builds diverge on a damage stat, request the underlying decomposable inputs (crit components, hit-damage adders, conversion mods, gear-source life-as-extra-mana, etc.) — NOT CombinedDPS, which will return []. Aggregate stats serve as quick "is this build behaving fundamentally differently?" tells, not as source-decomposable answers. After identifying the divergent mods, re-call compare with buy_similar=true and buy_similar_filters populated from those mods to find replacement gear. ' +
    'Use nearby_categories on a /resolve or /modify call to focus the inline power_report on a specific node type (e.g. nearby_categories=["Keystone"] when the player asks "any keystone I should grab?") — pair with audit_categories on a follow-up audit_allocated call to get symmetric remove/add suggestions confined to the same category axis. ' +
    "When narrating /compare gear diffs, filter to slots where modsSame is false — modsSame:true means no mechanical divergence even when nameSame:false (rare reroll, RELIC/UNIQUE foil flag), so those slots add noise without insight. " +
    'Each compared socket group carries mainGemLinkCount (link count of the main gem\'s socket), hostItemMaxLink (largest link on the host item), and hostItemName — read these directly to answer "is this skill 6-linked?" instead of re-correlating with sections.gear.items by slot. ' +
    "diffs.tree.allocatedOnlyIn is an array indexed parallel to builds[]; failed builds get [] at their index — index by build position, not buildId. " +
    "Config keys prefixed multiplier (e.g. multiplierRage, multiplierWitheredStackCount, multiplierFrenzyCharges) are user-set knobs the calc reads as inputs; the resulting runtime stats live in offense/defense (Rage, WitherEffect, FrenzyCharges) and may be cap-clamped against gear-derived maxima. Read the runtime stat in offense/defense for the post-calc effect — the config value is what was requested, not what's being applied. " +
    "Every response includes a buildId for follow-up calls. " +
    "If the player has connected their Path of Exile account to Savecraft, pass `character:\"current\"` (their most-recently-played character) or `character:\"<name>\"` instead of a build URL — Savecraft analyzes their live imported character with no copy-paste. The `build` URL remains the fallback for builds that aren't theirs or for players who haven't connected an account.",
  parameters: {
    character: {
      type: "string",
      description:
        'Analyze the player\'s own connected Path of Exile character — no URL needed. Pass "current" for their most-recently-played character, or the exact character name. Requires the player to have connected their PoE account (savecraft.gg/settings) and run refresh_save for that character. Preferred over `build` whenever the player asks about THEIR character/build. Mutually exclusive with `build`; ignored if `build` or `build_id` is also given.',
    },
    build: {
      type: "string",
      description:
        "URL to a PoB build (pobb.in, pastebin, pob.savecraft.gg link). Use for builds that are NOT the player's own connected character (e.g. a guide/build they want to inspect). For the player's own character prefer `character`. Omit when modifying an existing build by buildId.",
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
        '- {"op":"set_config","var":"multiplierWitheredStackCount","value":15} — Set any PoB config override. Common vars: multiplierWitheredStackCount, conditionLowLife, conditionStationary, conditionFullLife, resistancePenalty, enemyIsBoss (Sirus/Shaper/etc).\n' +
        '- {"op":"set_bandit","bandit":"None"} — Set bandit quest reward. Values: None (Kill All), Oak, Kraityn, Alira.\n' +
        '- {"op":"set_pantheon","major":"Arakaali","minor":"Ralakesh"} — Set pantheon gods. Major: None, TheBrineKing, Lunaris, Solaris, Arakaali. Minor: None, Gruthkul, Yugul, Abberath, Tukohama, Garukhan, Ralakesh, Ryslatha, Shakari. Can set one or both.',
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
        "- tree: allocated passive points (allocated_nodes, available_points = level_points + quest_points (23, all acts) + extra_points), tree.version, plus tree.keystones.\n" +
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
        "modify/nearby/audit when compare_with is set.",
    },
    buy_similar: {
      type: "boolean",
      description:
        "When true alongside compare_with, response includes a buySimilar array with " +
        "pathofexile.com/trade URLs pre-filled to find each item that one build has and " +
        "another lacks (or has a different one in the same slot). Useful for 'how do I match " +
        "this build?' workflows. Defaults to false.",
    },
    league: {
      type: "string",
      description:
        "League name for buy_similar trade URLs (e.g. 'Standard', 'Mirage', 'Mirage Hardcore'). " +
        "Defaults to 'Standard'. Only used when buy_similar is true.",
    },
    buy_similar_filters: {
      type: "object",
      description:
        "Constrain the buy_similar trade-search URLs by per-mod thresholds, " +
        "defence ranges, item-level, realm, and listed status. Use when the " +
        "player wants gear matching specific numbers, not just the same name — " +
        'e.g. "find me a Belly with at least 90 Life" → ' +
        "{mods: [{mod_text: '+# to maximum Life', mod_type: 'Explicit', min: 90}]}. " +
        'Or "a high-armour chest, ilvl 84+" → ' +
        "{armour_min: 800, ilvl_min: 84}. Filter shape: " +
        "{mods: [{mod_text, mod_type, min, max}], armour_min, evasion_min, " +
        "energy_shield_min, ward_min, ilvl_min, ilvl_max, realm, listed}. " +
        "Realm: pc/sony/xbox (default pc). Listed: available/securable/online/any " +
        "(default available). Mod IDs are resolved from the cached PoE trade-API " +
        "dictionary; mods without a cached ID are silently dropped (URL still emits " +
        "the name + non-mod filters). REQUIRES buy_similar=true — passing filters " +
        "without that flag returns an error rather than silently ignoring them.",
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
        "(Item/Tree/Skill/Pantheon/Spectre/Class/Base), source_name (the " +
        "actual item / passive node / gem / etc. that contributes), mod_name, " +
        "mod_type (BASE/INC/MORE/FLAG/OVERRIDE), and value. " +
        "DECOMPOSABLE stats (mod-backed; return real rows): Life, EnergyShield, Mana, " +
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

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const build = query.build as string | undefined;
    let buildId = query.build_id as string | undefined;
    const character = query.character as string | undefined;
    const userUuid = query.user_id as string | undefined;
    const operations = query.operations;
    const sections = query.sections as string | undefined;
    const statKeys = query.stat_keys as string | undefined;
    const nearbyMetrics = query.nearby_metrics as string | undefined;
    const nearbyRadius = query.nearby_radius as number | undefined;
    const nearbyLimit = query.nearby_limit as number | undefined;
    const nearbyDeltaStats = query.nearby_delta_stats as string | undefined;
    const nearbySort = query.nearby_sort as string | undefined;
    const auditAllocated = query.audit_allocated as string | undefined;
    const auditMetrics = query.audit_metrics as string | undefined;
    const auditDeltaStats = query.audit_delta_stats as string | undefined;
    const auditBranchLimit = query.audit_branch_limit as number | undefined;
    const auditNodeLimit = query.audit_node_limit as number | undefined;
    const auditIncludeZero = query.audit_include_zero as string | undefined;
    const auditSort = query.audit_sort as string | undefined;
    const auditScope = query.audit_scope as string | undefined;
    const nearbyCategories = query.nearby_categories;
    const auditCategories = query.audit_categories;
    const compareWith = query.compare_with;
    const buySimilar = query.buy_similar as boolean | undefined;
    const buySimilarFilters = query.buy_similar_filters;
    const league = query.league as string | undefined;
    const modSources = query.mod_sources;
    const modSourcesLimit = query.mod_sources_limit as number | undefined;

    // Validate mod_sources / mod_sources_limit early — keeps the error
    // path off the network and gives the LLM a precise message to act
    // on. Server-side handlers re-validate as defense in depth.
    let modSourcesArray: string[] | undefined;
    if (modSources !== undefined && modSources !== null) {
      if (!Array.isArray(modSources)) {
        return {
          type: "text",
          content:
            'Error: mod_sources must be a JSON array of stat names (e.g. ["Life","CombinedDPS"]). Pass it as a real array, not a JSON-encoded string.',
        };
      }
      const allStrings = modSources.every((s) => typeof s === "string");
      if (!allStrings) {
        return {
          type: "text",
          content:
            "Error: mod_sources entries must all be strings (stat names like Life, CombinedDPS, TotalEHP).",
        };
      }
      if (modSources.length > 0) {
        modSourcesArray = modSources as string[];
      }
    }
    if (modSourcesLimit !== undefined) {
      if (
        typeof modSourcesLimit !== "number" ||
        !Number.isInteger(modSourcesLimit)
      ) {
        return {
          type: "text",
          content:
            "Error: mod_sources_limit must be an integer between 1 and 50.",
        };
      }
      if (modSourcesLimit < 1 || modSourcesLimit > 50) {
        return {
          type: "text",
          content: `Error: mod_sources_limit ${modSourcesLimit} out of range. Must be 1-50 to keep response payloads tractable.`,
        };
      }
    }

    // Connected-character path: resolve `character` → the stored PoB
    // snapshot's buildId, then proceed exactly as if build_id was given.
    // `build`/`build_id` win if also supplied (explicit override).
    // recoveryXml lets pob-server calls transparently re-materialize the
    // build if it was evicted (deterministic identical buildId).
    let recoveryXml: string | undefined;
    if (character && !build && !buildId) {
      if (!userUuid) {
        return {
          type: "text",
          content:
            "Error: the character parameter needs a signed-in player. Connect your Path of Exile account at savecraft.gg/settings, or pass a build URL instead.",
        };
      }
      const resolved = await resolvePoeCharacterSnapshot(
        env,
        userUuid,
        character,
      );
      if (!resolved.ok) {
        return { type: "text", content: resolved.guidance };
      }
      buildId = resolved.snapshot.buildId;
      recoveryXml = resolved.snapshot.xml;
    }

    if (!build && !buildId) {
      return {
        type: "text",
        content:
          "Error: provide character (your connected PoE character), a build URL, or a build_id — one of build/build_id is required.",
      };
    }

    // Validate nearby_categories / audit_categories early so the LLM
    // gets a clean error before any pob-server round-trip. Server-side
    // re-validates as defense in depth.
    let nearbyCategoriesArray: string[] | undefined;
    if (nearbyCategories !== undefined && nearbyCategories !== null) {
      if (!Array.isArray(nearbyCategories)) {
        return {
          type: "text",
          content:
            'Error: nearby_categories must be a JSON array of strings (e.g. ["Keystone","JewelSocket"]).',
        };
      }
      if (!nearbyCategories.every((s) => typeof s === "string")) {
        return {
          type: "text",
          content: "Error: nearby_categories entries must all be strings.",
        };
      }
      if (nearbyCategories.length > 0) {
        nearbyCategoriesArray = nearbyCategories as string[];
      }
    }
    let auditCategoriesArray: string[] | undefined;
    if (auditCategories !== undefined && auditCategories !== null) {
      if (!Array.isArray(auditCategories)) {
        return {
          type: "text",
          content:
            'Error: audit_categories must be a JSON array of strings (e.g. ["Keystone"]).',
        };
      }
      if (!auditCategories.every((s) => typeof s === "string")) {
        return {
          type: "text",
          content: "Error: audit_categories entries must all be strings.",
        };
      }
      if (auditCategories.length > 0) {
        auditCategoriesArray = auditCategories as string[];
      }
    }

    if (build && !isURL(build)) {
      return {
        type: "text",
        content:
          "Error: build must be a URL (e.g. https://pobb.in/abc123). Raw base64 build codes are not accepted — ask the player for a link instead.",
      };
    }

    const pobUrl = env.POB_URL;
    if (!pobUrl) {
      return {
        type: "text",
        content:
          "PoB calc service is not configured. The POB_URL environment variable is not set.",
      };
    }

    // Compare mode: compare_with triggers /compare with the primary build
    // (build URL or build_id) concatenated with the compare_with builds.
    // Takes precedence over modify/nearby/audit/resolve — when compare_with
    // is set, compare is the operation regardless of other flags.
    if (compareWith !== undefined && compareWith !== null) {
      if (!Array.isArray(compareWith)) {
        return {
          type: "text",
          content:
            "Error: compare_with must be a JSON array of build URLs or build_ids " +
            '(e.g. ["https://pobb.in/abc", "def123"]).',
        };
      }
      if (compareWith.length === 0) {
        return {
          type: "text",
          content:
            "Error: compare_with must contain at least one additional build to compare " +
            "against the primary.",
        };
      }
      // Total builds (primary + compare_with) must fit the server cap of
      // 8. Reject early so the user gets faster feedback than waiting for
      // a /compare round-trip that's guaranteed to 400.
      if (compareWith.length + 1 > 8) {
        return {
          type: "text",
          content:
            "Error: compare accepts at most 8 builds per request (primary + compare_with). " +
            "Split the comparison into smaller batches.",
        };
      }
      const primary = build ?? buildId;
      // primary is guaranteed non-empty by the earlier (!build && !buildId) check.
      const buildSources = [primary as string, ...compareWith];
      // Pre-compute friendly per-build labels so the view can disambiguate
      // columns when the auto-generated class+level matches across builds
      // (e.g. two Scion L99s). The server's labelFor fallback only emits
      // the hostname, which is identical for any pair of pobb.in URLs.
      const compareBody: Record<string, unknown> = {
        builds: buildSources,
        labels: buildSources.map(friendlyBuildLabel),
      };
      if (buySimilar) {
        compareBody.buySimilar = true;
      }
      if (league) {
        compareBody.league = league;
      }
      if (buySimilarFilters !== undefined && buySimilarFilters !== null) {
        if (
          typeof buySimilarFilters !== "object" ||
          Array.isArray(buySimilarFilters)
        ) {
          return {
            type: "text",
            content:
              'Error: buy_similar_filters must be a JSON object (e.g. {mods: [{mod_text: "+# to maximum Life", min: 90}]}). Pass it as a real object, not a JSON-encoded string.',
          };
        }
        if (!buySimilar) {
          return {
            type: "text",
            content:
              "Error: buy_similar_filters set without buy_similar=true. Pass buy_similar=true alongside the filters or omit the filters object — silently ignoring filters would be a worse UX.",
          };
        }
        compareBody.buy_similar_filters = buySimilarFilters;
      }
      if (modSourcesArray !== undefined) {
        compareBody.modSources = modSourcesArray;
        if (modSourcesLimit !== undefined) {
          compareBody.modSourcesLimit = modSourcesLimit;
        }
      }

      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/compare",
          compareBody,
          env.POB_API_KEY,
          sections,
          statKeys,
        );
      } catch (e) {
        return {
          type: "text",
          content: `PoB calc service is currently unavailable: ${e instanceof Error ? e.message : "unknown error"}. Try again later.`,
        };
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          type: "text",
          content: `PoB compare error (${String(response.status)}): ${body}`,
        };
      }
      const compareResult = (await response.json()) as Record<string, unknown>;
      // Override the wrapper's default module field so the MCP host
      // mounts build-compare.svelte (not build-planner.svelte). The
      // wrapper at worker/src/mcp/handler.ts spreads the module's
      // returned data after `module: moduleId`, so this key shadows
      // the default.
      compareResult.module = "build_compare";
      return { type: "structured", data: compareResult };
    }

    // Audit mode: audit_allocated triggers /audit (inverse of explore — find
    // what to cut from the current tree). Mutually exclusive with the other
    // modes; checked before nearby/operations/resolve to short-circuit cleanly.
    if (auditAllocated) {
      if (!buildId) {
        return {
          type: "text",
          content: "Error: build_id is required for audit_allocated.",
        };
      }

      // metrics: optional JSON array; defaults applied server-side
      let parsedAuditMetrics: unknown[] | undefined;
      if (auditMetrics) {
        try {
          parsedAuditMetrics = JSON.parse(auditMetrics);
          if (!Array.isArray(parsedAuditMetrics)) {
            return {
              type: "text",
              content: "Error: audit_metrics must be a JSON array.",
            };
          }
        } catch {
          return {
            type: "text",
            content: "Error: audit_metrics is not valid JSON.",
          };
        }
      }

      // delta_stats: optional JSON array; defaults to audit_metrics server-side
      let parsedAuditDeltaStats: unknown[] | undefined;
      if (auditDeltaStats) {
        try {
          parsedAuditDeltaStats = JSON.parse(auditDeltaStats);
          if (!Array.isArray(parsedAuditDeltaStats)) {
            return {
              type: "text",
              content: "Error: audit_delta_stats must be a JSON array.",
            };
          }
        } catch {
          return {
            type: "text",
            content: "Error: audit_delta_stats is not valid JSON.",
          };
        }
      }

      // include_zero: snake-case string param → bool. Default true; pass
      // 'false' / 'no' / '0' to suppress the dead_weight bucket. The Go server
      // distinguishes "field omitted" from "explicitly false" via a *bool, so
      // only forward the field when the player set it explicitly.
      let parsedIncludeZero: boolean | undefined;
      if (auditIncludeZero !== undefined) {
        const lowered = auditIncludeZero.toLowerCase();
        parsedIncludeZero = !(
          lowered === "false" ||
          lowered === "no" ||
          lowered === "0"
        );
      }

      // Snake_case → camelCase translation. The Go server validates and clamps
      // everything (max 10 metrics, max 20 deltaStats, branchLimit ∈ [1,50],
      // nodeLimit ∈ [1,100], scope ∈ {tree,ascendancy,both}, sort ∈
      // {weakest,strongest}); the TS layer just forwards.
      const auditBody: Record<string, unknown> = { buildId };
      if (parsedAuditMetrics !== undefined)
        auditBody.metrics = parsedAuditMetrics;
      if (parsedAuditDeltaStats !== undefined)
        auditBody.deltaStats = parsedAuditDeltaStats;
      if (auditBranchLimit !== undefined)
        auditBody.branchLimit = auditBranchLimit;
      if (auditNodeLimit !== undefined) auditBody.nodeLimit = auditNodeLimit;
      if (parsedIncludeZero !== undefined)
        auditBody.includeZero = parsedIncludeZero;
      if (auditSort) auditBody.sort = auditSort;
      if (auditScope) auditBody.scope = auditScope;
      if (auditCategoriesArray) auditBody.categories = auditCategoriesArray;

      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/audit",
          auditBody,
          env.POB_API_KEY,
          undefined,
          undefined,
          recoveryXml,
        );
      } catch (e) {
        return {
          type: "text",
          content: `PoB calc service is currently unavailable: ${e instanceof Error ? e.message : "unknown error"}. Try again later.`,
        };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          type: "text",
          content: `PoB audit error (${String(response.status)}): ${body}`,
        };
      }

      const auditResult = (await response.json()) as Record<string, unknown>;
      return { type: "structured", data: auditResult };
    }

    // Explore mode: nearby_metrics triggers /nearby search
    if (nearbyMetrics) {
      if (!buildId) {
        return {
          type: "text",
          content: "Error: build_id is required for nearby node search.",
        };
      }

      let parsedMetrics: unknown[];
      try {
        parsedMetrics = JSON.parse(nearbyMetrics);
        if (!Array.isArray(parsedMetrics) || parsedMetrics.length === 0) {
          return {
            type: "text",
            content: "Error: nearby_metrics must be a non-empty JSON array.",
          };
        }
      } catch {
        return {
          type: "text",
          content: "Error: nearby_metrics is not valid JSON.",
        };
      }

      let parsedDeltaStats: unknown[] | undefined;
      if (nearbyDeltaStats) {
        try {
          parsedDeltaStats = JSON.parse(nearbyDeltaStats);
          if (!Array.isArray(parsedDeltaStats)) {
            return {
              type: "text",
              content: "Error: nearby_delta_stats must be a JSON array.",
            };
          }
        } catch {
          return {
            type: "text",
            content: "Error: nearby_delta_stats is not valid JSON.",
          };
        }
      }

      const nearbyBody: Record<string, unknown> = {
        buildId,
        metrics: parsedMetrics,
      };
      if (nearbyRadius) nearbyBody.radius = nearbyRadius;
      if (nearbyLimit) nearbyBody.limit = nearbyLimit;
      if (parsedDeltaStats) nearbyBody.deltaStats = parsedDeltaStats;
      if (nearbySort) nearbyBody.sort = nearbySort;
      if (nearbyCategoriesArray) nearbyBody.categories = nearbyCategoriesArray;

      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/nearby",
          nearbyBody,
          env.POB_API_KEY,
          undefined,
          undefined,
          recoveryXml,
        );
      } catch (e) {
        return {
          type: "text",
          content: `PoB calc service is currently unavailable: ${e instanceof Error ? e.message : "unknown error"}. Try again later.`,
        };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          type: "text",
          content: `PoB nearby error (${String(response.status)}): ${body}`,
        };
      }

      const nearbyResult = (await response.json()) as Record<string, unknown>;
      return { type: "structured", data: nearbyResult };
    }

    // Step 1: Resolve the build (from URL or existing buildId)
    let resolvedBuildId = buildId;

    if (build) {
      // Resolve URL → buildId + calc results
      const resolveBody: Record<string, unknown> = { url: build };
      if (modSourcesArray !== undefined) {
        resolveBody.modSources = modSourcesArray;
        if (modSourcesLimit !== undefined) {
          resolveBody.modSourcesLimit = modSourcesLimit;
        }
      }
      // Forward nearby_categories to focus the inline power_report
      // attached to /resolve responses on the requested category set.
      if (nearbyCategoriesArray)
        resolveBody.nearby_categories = nearbyCategoriesArray;
      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/resolve",
          resolveBody,
          env.POB_API_KEY,
          sections,
          statKeys,
        );
      } catch (e) {
        return {
          type: "text",
          content: `PoB calc service is currently unavailable: ${e instanceof Error ? e.message : "unknown error"}. Try again later.`,
        };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          type: "text",
          content: `PoB resolve error (${String(response.status)}): ${body}`,
        };
      }

      const resolveResult = (await response.json()) as {
        buildId: string;
        data: unknown;
      };
      resolvedBuildId = resolveResult.buildId;

      // If no operations, return the resolve result directly
      if (!operations) {
        return { type: "structured", data: resolveResult };
      }
    }

    // Step 2: If operations provided, modify the build
    if (operations !== undefined && operations !== null) {
      if (!resolvedBuildId) {
        return {
          type: "text",
          content:
            "Error: operations require a build to modify. Provide either build (URL) or build_id.",
        };
      }

      // Pre-launch breaking change: operations must be a real JSON array.
      // Stringified-JSON arrays (the old shape) and non-array values are
      // rejected with a guiding error rather than silently parsed — see
      // the epic anti-pattern "NO backwards-compat for stringified-JSON
      // operations". The MCP manifest declares the array shape; clients
      // that send anything else are out of contract.
      if (!Array.isArray(operations)) {
        return {
          type: "text",
          content:
            'Error: operations must be a JSON array (e.g. [{"op":"set_level","level":95}]). Pass it as a real array, not a JSON-encoded string.',
        };
      }
      if (operations.length === 0) {
        return {
          type: "text",
          content: "Error: operations must be a non-empty array.",
        };
      }

      const modifyBody: Record<string, unknown> = {
        buildId: resolvedBuildId,
        operations,
      };
      if (modSourcesArray !== undefined) {
        modifyBody.modSources = modSourcesArray;
        if (modSourcesLimit !== undefined) {
          modifyBody.modSourcesLimit = modSourcesLimit;
        }
      }
      if (nearbyCategoriesArray)
        modifyBody.nearby_categories = nearbyCategoriesArray;
      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/modify",
          modifyBody,
          env.POB_API_KEY,
          sections,
          statKeys,
          recoveryXml,
        );
      } catch (e) {
        return {
          type: "text",
          content: `PoB calc service is currently unavailable: ${e instanceof Error ? e.message : "unknown error"}. Try again later.`,
        };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          type: "text",
          content: `PoB modify error (${String(response.status)}): ${body}`,
        };
      }

      const modifyResult = (await response.json()) as Record<string, unknown>;
      return { type: "structured", data: modifyResult };
    }

    // Step 3: build_id only, no operations — return stored summary
    let response: Response;
    try {
      const headers: Record<string, string> = {};
      if (env.POB_API_KEY) {
        headers.Authorization = `Bearer ${env.POB_API_KEY}`;
      }
      // stat_keys is not passed here — the summary endpoint serves cached data
      // from SQLite, so stat_keys has no effect. It only applies to live calc
      // paths (/calc, /modify, /resolve).
      const summaryUrl = sections
        ? `${pobUrl}/build/${resolvedBuildId}/summary?sections=${encodeURIComponent(sections)}`
        : `${pobUrl}/build/${resolvedBuildId}/summary`;
      response = await fetch(summaryUrl, {
        headers,
        signal: AbortSignal.timeout(POB_TIMEOUT_MS),
      });
    } catch (e) {
      return {
        type: "text",
        content: `PoB calc service is currently unavailable: ${e instanceof Error ? e.message : "unknown error"}. Try again later.`,
      };
    }

    // Connected-character build evicted from pob-server's store: re-feed
    // the stored XML to /calc. It is content-addressed, so it yields the
    // identical buildId plus a fresh calc result — the analysis the
    // summary lookup would have returned.
    if (response.status === 404 && recoveryXml) {
      let refed: Response;
      try {
        refed = await refeedBuild(pobUrl, recoveryXml, env.POB_API_KEY);
      } catch (e) {
        return {
          type: "text",
          content: `PoB calc service is currently unavailable: ${e instanceof Error ? e.message : "unknown error"}. Try again later.`,
        };
      }
      if (!refed.ok) {
        const body = await refed.text().catch(() => "");
        return {
          type: "text",
          content: `PoB re-feed error (${String(refed.status)}): ${body}`,
        };
      }
      const refedResult = (await refed.json()) as Record<string, unknown>;
      return { type: "structured", data: refedResult };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        type: "text",
        content: `PoB lookup error (${String(response.status)}): ${body}`,
      };
    }

    const summaryResult = (await response.json()) as Record<string, unknown>;
    return { type: "structured", data: summaryResult };
  },
};
