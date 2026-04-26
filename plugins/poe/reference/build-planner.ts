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

function pobFetch(
  pobUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey?: string,
  sections?: string,
  statKeys?: string,
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
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(POB_TIMEOUT_MS),
  });
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
    "Every response includes a buildId for follow-up calls.",
  parameters: {
    build: {
      type: "string",
      description:
        "URL to a PoB build (pobb.in, pastebin, pob.savecraft.gg link). Required on first call. Omit when modifying an existing build by buildId.",
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
    compare_with: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of additional build URLs or build_ids to compare against the primary build. " +
        "Triggers compare mode: returns per-build summaries plus diffs across summary stats, " +
        "allocated tree nodes, equipped gear, and skill socket groups. Each diff entry uses " +
        "perBuild arrays so the response shape is identical at N=2 and N=3+. " +
        "The primary (build or build_id) is iterated alongside compare_with — pass at least one " +
        "additional build here. Compare mode takes precedence over modify/nearby/audit when " +
        "compare_with is set.",
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
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const build = query.build as string | undefined;
    const buildId = query.build_id as string | undefined;
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
    const compareWith = query.compare_with;
    const buySimilar = query.buy_similar as boolean | undefined;
    const league = query.league as string | undefined;

    if (!build && !buildId) {
      return {
        type: "text",
        content: "Error: either build (URL) or build_id is required.",
      };
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
            "(e.g. [\"https://pobb.in/abc\", \"def123\"]).",
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

      let response: Response;
      try {
        response = await pobFetch(pobUrl, "/compare", compareBody, env.POB_API_KEY);
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

      let response: Response;
      try {
        response = await pobFetch(pobUrl, "/audit", auditBody, env.POB_API_KEY);
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

      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/nearby",
          nearbyBody,
          env.POB_API_KEY,
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
      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/resolve",
          { url: build },
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
            "Error: operations must be a JSON array (e.g. [{\"op\":\"set_level\",\"level\":95}]). Pass it as a real array, not a JSON-encoded string.",
        };
      }
      if (operations.length === 0) {
        return {
          type: "text",
          content: "Error: operations must be a non-empty array.",
        };
      }

      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/modify",
          { buildId: resolvedBuildId, operations },
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
