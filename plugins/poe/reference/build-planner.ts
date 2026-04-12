/**
 * PoE build_planner — native reference module.
 *
 * Bridges the headless Path of Building calc service (pob-server) into the
 * MCP reference module system. Supports three workflows:
 *
 *   1. Analyze: pass a build URL → get structured calc results + buildId
 *   2. Modify: pass a buildId + operations → get updated results + new buildId
 *   3. Explore: pass a buildId + nearby_metrics → get ranked nearby nodes by impact
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

function pobFetch(
  pobUrl: string,
  path: string,
  body: Record<string, unknown>,
  apiKey?: string,
  sections?: string,
  statKeys?: string,
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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
    "Analyze, modify, or explore a Path of Exile build via Path of Building. "
    + "First call returns a compact summary (DPS, life, resists, attributes, LifeUnreservedPercent for Low Life detection) and a section_index listing available detail sections. "
    + "To drill deeper, call again with the buildId and sections parameter (e.g. sections='offense,defense'). "
    + "Stat sections return curated key stats plus _extra_keys listing other available stats — use stat_keys to request specific extras. "
    + "For modifications, pass buildId + operations — the response includes a changes object showing {before, after, delta} for every summary stat that changed. "
    + "For tree exploration, pass buildId + nearby_metrics to find the highest-impact nearby nodes ranked by real calc deltas. "
    + "Every response includes a buildId for follow-up calls.",
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
      type: "string",
      description:
        'JSON array of modifications to apply to the build. Omit for pure analysis. Each operation is an object with an "op" field and operation-specific parameters. Operations are applied in order. Available operations:\n'
        + '- {"op":"set_level","level":95} — Set character level.\n'
        + '- {"op":"swap_gem","socket_group":0,"gem_index":1,"new_gem":"Ruthless Support","level":20,"quality":20} — Replace a gem in a socket group (0-indexed).\n'
        + '- {"op":"add_gem","socket_group":0,"gem":"Inspiration Support","level":20,"quality":20} — Add a gem to a socket group.\n'
        + '- {"op":"remove_gem","socket_group":0,"gem_index":3} — Remove a gem by index from a socket group.\n'
        + '- {"op":"toggle_keystone","name":"Resolute Technique","enabled":false} — Allocate or deallocate a keystone passive.\n'
        + '- {"op":"allocate_node","name":"Unwavering Stance"} — Allocate a notable or keystone by name. Auto-paths through travel nodes. Response includes an allocation_log section showing every node allocated along the path and the total points spent.\n'
        + '- {"op":"deallocate_node","name":"Phase Acrobatics"} — Deallocate a notable or keystone by name. Errors if the node is not currently allocated.\n'
        + '- {"op":"equip_unique","name":"Abyssus","slot":"Helmet"} — Equip a unique item by name. Slots: Weapon 1, Weapon 2, Helmet, Body Armour, Gloves, Boots, Belt, Ring 1, Ring 2, Amulet. For flasks, use equip_flask instead.\n'
        + '- {"op":"equip_flask","name":"Taste of Hate","slot":"Flask 2"} — Equip a unique flask by name and activate it. Slots: Flask 1, Flask 2, Flask 3, Flask 4, Flask 5. The flask is automatically toggled active so its stats are included in calculations.\n'
        + '- {"op":"set_item","slot":"Body Armour","text":"Astral Plate\\nRarity: Rare\\n..."} — Equip a rare/custom item using PoB item text format.',
    },
    sections: {
      type: "string",
      description:
        "Comma-separated section names to include in the response (e.g. 'offense,defense'). "
        + "Omit for a compact summary with a section index listing available sections. "
        + "Available: offense, ailments, defense, resistances, ehp, recovery, charges, limits, "
        + "socket_groups, items, keystones, tree, minion_offense, minion_defense. "
        + "Stat sections return curated key stats by default plus an _extra_keys array listing other available stat names in that section. "
        + "Use the stat_keys parameter to include specific extra keys alongside the curated defaults. "
        + "tree returns allocated/available/remaining passive points with breakdown: available_points = level_points + quest_points (23, all acts) + extra_points. "
        + "After allocate_node, the response includes an allocation_log section showing every node allocated along the path and points spent.",
    },
    stat_keys: {
      type: "string",
      description:
        "Comma-separated stat key names to include alongside the curated defaults in stat sections (e.g. 'PierceChance,AreaOfEffectMod'). "
        + "Use this to drill into specific stats discovered via _extra_keys in a previous response. "
        + "Any PoB calc output key is accepted. Only used with sections parameter.",
    },
    nearby_metrics: {
      type: "string",
      description:
        "JSON array of stat names to rank nearby nodes by (e.g. '[\"Life\",\"CombinedDPS\"]'). "
        + "Triggers explore mode: finds unallocated nodes reachable from the current tree and ranks them by real calc impact per passive point. "
        + "Requires build_id. Returns one ranked list per metric, each with baseline value and top nodes including stat deltas, path cost, travel path, and efficiency score. "
        + "Common metrics: Life, EnergyShield, CombinedDPS, FullDPS, Armour, Evasion, BlockChance, "
        + "SpellSuppressionChance, PhysicalMaximumHitTaken, ColdMaximumHitTaken, FireMaximumHitTaken, "
        + "LightningMaximumHitTaken, Str, Dex, Int. Any PoB calc output key is accepted.",
    },
    nearby_radius: {
      type: "number",
      description:
        "Maximum path distance for nearby node search (default 5). "
        + "Increase to discover high-value nodes further from the current tree. Only used with nearby_metrics.",
    },
    nearby_limit: {
      type: "number",
      description:
        "Maximum results per metric (default 10). Only used with nearby_metrics.",
    },
    nearby_delta_stats: {
      type: "string",
      description:
        "JSON array of extra stat names to include in each node's deltas for context "
        + "(default '[\"Life\",\"CombinedDPS\",\"EnergyShield\"]'). Only used with nearby_metrics.",
    },
    nearby_sort: {
      type: "string",
      description:
        "Sort order for nearby results: 'desc' (default) ranks nodes with the highest positive impact first "
        + "(best improvements). 'asc' ranks nodes with the most negative impact first "
        + "(useful for finding what would hurt a stat). Only used with nearby_metrics.",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const build = query.build as string | undefined;
    const buildId = query.build_id as string | undefined;
    const operations = query.operations as string | undefined;
    const sections = query.sections as string | undefined;
    const statKeys = query.stat_keys as string | undefined;
    const nearbyMetrics = query.nearby_metrics as string | undefined;
    const nearbyRadius = query.nearby_radius as number | undefined;
    const nearbyLimit = query.nearby_limit as number | undefined;
    const nearbyDeltaStats = query.nearby_delta_stats as string | undefined;
    const nearbySort = query.nearby_sort as string | undefined;

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
          return { type: "text", content: "Error: nearby_metrics must be a non-empty JSON array." };
        }
      } catch {
        return { type: "text", content: "Error: nearby_metrics is not valid JSON." };
      }

      let parsedDeltaStats: unknown[] | undefined;
      if (nearbyDeltaStats) {
        try {
          parsedDeltaStats = JSON.parse(nearbyDeltaStats);
          if (!Array.isArray(parsedDeltaStats)) {
            return { type: "text", content: "Error: nearby_delta_stats must be a JSON array." };
          }
        } catch {
          return { type: "text", content: "Error: nearby_delta_stats is not valid JSON." };
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
        response = await pobFetch(pobUrl, "/nearby", nearbyBody, env.POB_API_KEY);
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
        response = await pobFetch(pobUrl, "/resolve", { url: build }, env.POB_API_KEY, sections, statKeys);
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

      const resolveResult = (await response.json()) as { buildId: string; data: unknown };
      resolvedBuildId = resolveResult.buildId;

      // If no operations, return the resolve result directly
      if (!operations) {
        return { type: "structured", data: resolveResult };
      }
    }

    // Step 2: If operations provided, modify the build
    if (operations) {
      if (!resolvedBuildId) {
        return {
          type: "text",
          content: "Error: operations require a build to modify. Provide either build (URL) or build_id.",
        };
      }

      let parsedOps: unknown[];
      try {
        parsedOps = JSON.parse(operations);
        if (!Array.isArray(parsedOps) || parsedOps.length === 0) {
          return { type: "text", content: "Error: operations must be a non-empty JSON array." };
        }
      } catch {
        return { type: "text", content: "Error: operations is not valid JSON." };
      }

      let response: Response;
      try {
        response = await pobFetch(
          pobUrl,
          "/modify",
          { buildId: resolvedBuildId, operations: parsedOps },
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
      const params = new URLSearchParams();
      if (sections) params.set("sections", sections);
      if (statKeys) params.set("stat_keys", statKeys);
      const qs = params.toString();
      const summaryUrl = qs
        ? `${pobUrl}/build/${resolvedBuildId}/summary?${qs}`
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
