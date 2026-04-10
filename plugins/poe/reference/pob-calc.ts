/**
 * PoE pob_calc — native reference module.
 *
 * Bridges the headless Path of Building calc service (pob-server) into the
 * MCP reference module system. Supports two workflows:
 *
 *   1. Analyze: pass a build URL → get structured calc results + buildId
 *   2. Modify: pass a buildId + operations → get updated results + new buildId
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
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const url = sections ? `${pobUrl}${path}?sections=${encodeURIComponent(sections)}` : `${pobUrl}${path}`;
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(POB_TIMEOUT_MS),
  });
}

export const pobCalcModule: NativeReferenceModule = {
  id: "pob_calc",
  name: "PoB Build Calculator",
  description:
    "Analyze or modify a Path of Exile build via Path of Building. "
    + "First call returns a compact summary (DPS, life, resists, attributes) and a section_index listing available detail sections. "
    + "To drill deeper, call again with the buildId and sections parameter (e.g. sections='offense,defense'). "
    + "For modifications, pass buildId + operations + sections to see before/after comparison on the stats you care about. "
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
        "Build ID from a previous pob_calc response. Use this to modify or re-analyze a build without a URL. Omit on first call.",
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
        + '- {"op":"allocate_node","name":"Unwavering Stance"} — Allocate a notable or keystone by name.\n'
        + '- {"op":"deallocate_node","name":"Phase Acrobatics"} — Deallocate a notable or keystone by name.\n'
        + '- {"op":"equip_unique","name":"Abyssus","slot":"Helmet"} — Equip a unique item by name. Slots: Weapon 1, Weapon 2, Helmet, Body Armour, Gloves, Boots, Belt, Ring 1, Ring 2, Amulet.\n'
        + '- {"op":"set_item","slot":"Body Armour","text":"Astral Plate\\nRarity: Rare\\n..."} — Equip a rare/custom item using PoB item text format.',
    },
    sections: {
      type: "string",
      description:
        "Comma-separated section names to include in the response (e.g. 'offense,defense'). "
        + "Omit for a compact summary with a section index listing available sections. "
        + "Available: offense, ailments, defense, resistances, ehp, recovery, charges, limits, "
        + "socket_groups, items, keystones, tree, minion_offense, minion_defense.",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const build = query.build as string | undefined;
    const buildId = query.build_id as string | undefined;
    const operations = query.operations as string | undefined;
    const sections = query.sections as string | undefined;

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

    // Step 1: Resolve the build (from URL or existing buildId)
    let resolvedBuildId = buildId;

    if (build) {
      // Resolve URL → buildId + calc results
      let response: Response;
      try {
        response = await pobFetch(pobUrl, "/resolve", { url: build }, env.POB_API_KEY, sections);
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
