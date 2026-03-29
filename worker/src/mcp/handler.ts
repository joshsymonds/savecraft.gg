/**
 * MCP Streamable HTTP handler. Implements the JSON-RPC 2.0 protocol
 * for MCP tool serving without the heavy @modelcontextprotocol/sdk
 * (which depends on ajv/express/hono — incompatible with Workers runtime).
 *
 * Supports: initialize, notifications/initialized, tools/list, tools/call.
 * Transport: Streamable HTTP (POST with JSON responses, no SSE needed for sync tools).
 */
import { getNativeModule } from "../reference/registry";
import { resolveSectionParams, type VerifiedSaveCache } from "../reference/section-resolution";
import type { Env } from "../types";

import {
  createNote,
  deleteNote,
  getInfo,
  getNote,
  getSave,
  getSection,
  listGames,
  queryReference,
  refreshSave,
  resolveIconUrl,
  searchSaves,
  updateNote,
  viewResult,
} from "./tools";
import type { ToolResult, ViewToolResult } from "./tools";
import { VIEWS } from "./views.gen.js";

const PROTOCOL_VERSION = "2025-06-18";

const SERVER_INSTRUCTIONS = `Savecraft gives you access to the player's actual game state — characters, gear, progress, and goals — parsed from real save files. You are their gaming companion.

Always fetch live data — never assume you know a player's saves, characters, or game state from memory or prior conversations. Save data changes constantly as players play. Fetch only what's relevant: use the filter parameter on list_games, and request only the sections you'll actually reference. Memory is useful for player goals and preferences, but never for game state.

Tool workflow: Start with list_games to see the player's games, characters, and saves. Use get_save for a specific character, then get_section for detailed data like equipment, skills, or stats — section names vary by game. search_saves for cross-character or cross-game queries when you don't know which save contains something. Always read relevant notes (get_note) before giving advice — they contain goals, builds, and session context from prior conversations. When the player shares something worth remembering, offer to save it as a note. Keep notes current with update_note when circumstances change. refresh_save when the player says something just changed in-game. setup_help when the player has no saves, mentions a pairing code, or asks how to connect a game.

Results from search_saves distinguish between save data (what the player actually has in-game) and notes (what the player wrote or planned). This distinction matters: "player owns this item" vs "guide recommends this item" are very different.

Removed saves and games: list_games shows removed_saves per game. If a player asks about a missing character, check removed_saves — if it's there, tell them they can restore it from savecraft.gg. If an entire game is missing from list_games, suggest they check their game settings on savecraft.gg.

All timestamps returned by Savecraft are UTC.

Spoiler-free by default: Ground your responses in what the save data contains — the characters, items, locations, quests, and abilities that are present in the player's save represent what they've actually experienced. You may use your game knowledge to analyze, explain, and optimize anything visible in the save data, but do not volunteer information about content, characters, events, or mechanics that aren't represented there. If the player asks a direct question that can only be answered with information beyond their save state, give a minimal answer to their specific question without elaborating into broader story or progression details. The player can always ask for more — let them lead.

When working with tool results, write down any important information you might need later in your response, as the original tool result may be cleared later.`;

const RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

/** Build resource list from discovered views. */
const VIEW_CSP = {
  resourceDomains: [
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://api.savecraft.gg",
    "https://staging-api.savecraft.gg",
  ],
};

function viewDomain(env: Env): string {
  return env.ENVIRONMENT === "production"
    ? "https://savecraft.gg"
    : "https://staging.savecraft.gg";
}

/** Cached per-environment results (ENVIRONMENT is constant per Worker instance). */
let cachedToolsWithUi: ToolDefinition[] | undefined;
let cachedResourceList:
  | { uri: string; name: string; mimeType: string; _meta: { ui: { domain: string; csp: typeof VIEW_CSP } } }[]
  | undefined;
let cachedEnvironment: string | undefined;

function buildResourceList(env: Env): {
  uri: string;
  name: string;
  mimeType: string;
  _meta: { ui: { domain: string; csp: typeof VIEW_CSP } };
}[] {
  if (cachedResourceList && cachedEnvironment === env.ENVIRONMENT) return cachedResourceList;
  const domain = viewDomain(env);
  cachedResourceList = Object.keys(VIEWS).map((slug) => ({
    uri: `ui://savecraft/${slug}.html`,
    name: slug,
    mimeType: RESOURCE_MIME_TYPE,
    _meta: { ui: { domain, csp: VIEW_CSP } },
  }));
  return cachedResourceList;
}

/** Look up view HTML by resource URI. */
function readResource(uri: string): string | undefined {
  const prefix = "ui://savecraft/";
  const suffix = ".html";
  if (!uri.startsWith(prefix) || !uri.endsWith(suffix)) return undefined;
  return VIEWS[uri.slice(prefix.length, -suffix.length)];
}

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface SchemaProperty {
  type: string;
  description: string;
  items?: { type: string };
  enum?: string[];
}

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, SchemaProperty>;
    required?: string[];
  };
  annotations: ToolAnnotations;
  _meta?: Record<string, unknown>;
}

// Tool descriptions are optimized for two-stage discovery:
//   1. ToolSearch retrieval — keyword scoring against name + description (name: 12pts, desc: 2pts)
//   2. LLM selection — Claude reads full schema to pick the right tool
//
// Design principles (see docs/mcp-design.md):
//   - Tool descriptions handle SELECTION ("should I pick this tool?")
//   - Parameter descriptions handle INVOCATION ("how do I use it?")
//   - Server instructions (above) handle WORKFLOW ("what order to call tools")
//   - No cross-tool name references in descriptions (creates keyword noise)
//   - Front-load discriminative terms in first sentence (retrieval bait)
//
// Two interaction modes (same tools, different intent):
//   - Companion: player is talking, venting, celebrating. React with context.
//   - Optimizer: player wants specific advice. Analyze sections + notes.

const TOOLS: ToolDefinition[] = [
  // ── Discovery ─────────────────────────────────────────────
  {
    name: "list_games",
    title: "List Games & Saves",
    description:
      "The player's complete game library — all games, characters, saves, notes, and reference modules they have access to. Start here when beginning any conversation about the player's game state. If a character seems missing, check removed_saves — it may have been removed rather than deleted.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description:
            "Filter by game name or ID (case-insensitive substring). Pass this when the player asks about a specific game to avoid loading unrelated data. Omit to see all games.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_save",
    title: "Get Save Details",
    description:
      "Detailed view of a single character or save — summary, overview stats, list of available data sections, and attached notes. Use when the player asks about a specific character, playthrough, or save file.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID from the game listing" },
      },
      required: ["save_id"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Reading save data ─────────────────────────────────────
  {
    name: "get_section",
    title: "Get Save Section Data",
    description:
      "Deep data for specific aspects of a save — equipment, skills, quests, stats, inventory, abilities, or any game-specific section. Returns actual in-game state the player has experienced. Only request sections you will directly reference in your response.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID from the game listing" },
        sections: {
          type: "array",
          description:
            "Section names from the save's section listing. Pass one name or several. Available sections vary by game.",
          items: { type: "string" },
        },
      },
      required: ["save_id", "sections"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Notes ────────────────────────────────────────────────
  //
  // Notes are the player's goals, build guides, farming lists, and session
  // memories. get_save returns note metadata (titles, IDs); use get_note
  // to read full content before giving advice.
  {
    name: "get_note",
    title: "Get Note Content",
    description:
      "Full content of a player's note — build guides, goals, session memories, farming plans, or strategy context they saved for future conversations. Read relevant notes before giving advice so you build on prior discussion.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID from the game listing" },
        note_id: { type: "string", description: "Note UUID from save details or search results" },
      },
      required: ["save_id", "note_id"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "create_note",
    title: "Create Note",
    description:
      "Save information the player wants remembered across conversations — build guides, goals, farming plans, session context, or strategy notes. Attach to a specific save. Maximum 10 notes per save.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID from the game listing" },
        title: {
          type: "string",
          description:
            "Short descriptive title (e.g. 'Farming Goals', 'Build Guide', 'Session Notes')",
        },
        content: {
          type: "string",
          description:
            "Note content in markdown, max 50KB. Be structured and specific — future-you will read this to understand context.",
        },
      },
      required: ["save_id", "title", "content"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_note",
    title: "Update Note",
    description:
      "Revise an existing note when the player's plans, goals, or game state has changed. Preferred over deleting — keeps the note's identity stable across sessions.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID from the game listing" },
        note_id: { type: "string", description: "Note UUID from save details or search results" },
        title: { type: "string", description: "New title (omit to keep current title)" },
        content: {
          type: "string",
          description: "New content in markdown, max 50KB (omit to keep current content)",
        },
      },
      required: ["save_id", "note_id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "delete_note",
    title: "Delete Note",
    description:
      "Permanently remove a note. Only when the player explicitly asks to delete — prefer updating to revise outdated content.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID from the game listing" },
        note_id: { type: "string", description: "Note UUID from save details or search results" },
      },
      required: ["save_id", "note_id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Refresh ───────────────────────────────────────────────
  {
    name: "refresh_save",
    title: "Refresh Save",
    description:
      "Pull the latest game data for a save — re-parse the save file or fetch fresh API data. Use when the player says something just changed in-game: found an item, leveled up, equipped gear, finished a quest.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID from the game listing" },
      },
      required: ["save_id"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  // ── Search ────────────────────────────────────────────────
  {
    name: "search_saves",
    title: "Search Saves & Notes",
    description:
      "Full-text keyword search across all saves and notes — find items, skills, quests, characters, or any game data without knowing which save contains it. Ideal for cross-character and cross-game queries. Results distinguish between save data and player-written notes.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keywords to search for. Supports prefix matching (drag*) and boolean operators (sword OR shield).",
        },
        save_id: {
          type: "string",
          description:
            "Save UUID to scope search to a single save. Omit to search across all saves.",
        },
      },
      required: ["query"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Reference Data ──────────────────────────────────────────
  //
  // Reference modules provide computed game data (drop rates, build
  // calculations) that AIs can't reliably do themselves. These are
  // authoritative — they use the actual game data tables.
  {
    name: "query_reference",
    title: "Query Game Reference Data",
    description:
      "Authoritative game calculations — drop rates, stat thresholds, build comparisons, draft ratings, mana curves, or any quantitative query where estimation would be unreliable. Batch multiple queries in a single call to avoid round-trips. Max 50 queries per call. Modules that accept card/deck lists can also accept a section reference (e.g., deck_section + save_id) to pull data directly from the player's save instead of passing cards inline.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: {
          type: "string",
          description: "Game ID from the game listing.",
        },
        module: {
          type: "string",
          description: "Reference module ID from the game listing.",
        },
        queries: {
          type: "array",
          description:
            "Array of query objects with module-specific parameters. Each object's structure is defined by the module's parameter schema in the game listing — build from that schema, do not guess field names. Results are returned in the same positional order.",
          items: { type: "object" },
        },
      },
      required: ["game_id", "module", "queries"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Setup & Help ──────────────────────────────────────────
  {
    name: "setup_help",
    title: "Setup & Help",
    description:
      "Savecraft setup, installation, pairing, and project information. Use when the player has no saves yet, mentions a pairing code, asks how to connect a game, or asks about privacy and security. Also shows connected sources and their status.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Topic to drill into. Omit for a topic menu; pass a category for focused content. 'games': supported games, source types, setup instructions. 'setup': install instructions, pairing, API game setup. 'privacy': data collection, security, what's NOT collected. 'about': open source links, author, architecture.",
          enum: ["games", "setup", "privacy", "about"],
        },
        platform: {
          type: "string",
          description:
            "Operating system for targeted install instructions (only used with category='setup'). Infer from conversation context.",
          enum: ["linux", "windows", "macos"],
        },
        link_code: {
          type: "string",
          description:
            "6-digit pairing code displayed by the Savecraft daemon during setup. Look this up to check if the source is registered, paired, or has an expired code.",
        },
        source_uuid: {
          type: "string",
          description:
            "Source UUID to check directly. Use if you already have the UUID from a previous interaction.",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

/** Build tools with _meta.ui for views, including env-aware domain. */
function buildToolsWithUi(env: Env): ToolDefinition[] {
  if (cachedToolsWithUi && cachedEnvironment === env.ENVIRONMENT) return cachedToolsWithUi;
  const domain = viewDomain(env);
  cachedEnvironment = env.ENVIRONMENT;
  cachedToolsWithUi = TOOLS.map((tool) => {
    const slug = tool.name === "query_reference" ? "reference" : tool.name.replaceAll("_", "-");
    if (!VIEWS[slug]) return tool;
    return {
      ...tool,
      _meta: {
        ...tool._meta,
        ui: {
          resourceUri: `ui://savecraft/${slug}.html`,
          domain,
          csp: VIEW_CSP,
        },
      },
    };
  });
  return cachedToolsWithUi;
}

const MCP_HEADERS = { "Content-Security-Policy": "default-src 'none'" };

function jsonRpcResponse(id: number | string, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers: MCP_HEADERS });
}

function jsonRpcError(id: number | string | null, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: MCP_HEADERS });
}

/**
 * Parse a sections argument from an LLM: may arrive as a JSON array string,
 * a native array, or a single string. Returns undefined if not provided.
 */
function parseSectionsArgument(raw: unknown): string[] | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [raw];
    }
  }
  if (Array.isArray(raw)) return raw as string[];
  return undefined;
}

async function handleToolCall(
  params: Record<string, unknown>,
  env: Env,
  userUuid: string,
): Promise<unknown> {
  const toolName = params.name as string;
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const saveId = args.save_id as string;

  switch (toolName) {
    case "list_games": {
      return listGames(
        env.DB,
        env.PLUGINS,
        userUuid,
        args.filter as string | undefined,
        env.SERVER_URL,
      );
    }
    case "get_save": {
      return getSave(env.DB, userUuid, saveId, env.PLUGINS, env.SERVER_URL);
    }
    case "get_section": {
      const sections = parseSectionsArgument(args.sections) ?? [];
      return getSection(env.DB, userUuid, saveId, sections);
    }
    case "get_note": {
      return getNote(env.DB, userUuid, saveId, args.note_id as string);
    }
    case "create_note": {
      return createNote(env.DB, userUuid, saveId, args.title as string, args.content as string);
    }
    case "update_note": {
      return updateNote(
        env.DB,
        userUuid,
        saveId,
        args.note_id as string,
        args.content as string | undefined,
        args.title as string | undefined,
      );
    }
    case "delete_note": {
      return deleteNote(env.DB, userUuid, saveId, args.note_id as string);
    }
    case "refresh_save": {
      return refreshSave(env, userUuid, saveId);
    }
    case "search_saves": {
      return searchSaves(
        env.DB,
        userUuid,
        args.query as string,
        args.save_id as string | undefined,
      );
    }
    case "query_reference": {
      return handleQueryReference(env, userUuid, args);
    }
    case "setup_help": {
      return handleGetInfo(env, userUuid, args);
    }
    default: {
      return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
    }
  }
}

function handleGetInfo(
  env: Env,
  userUuid: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return getInfo(
    env,
    userUuid,
    args.category as string | undefined,
    args.platform as string | undefined,
    args.link_code as string | undefined,
    args.source_uuid as string | undefined,
  );
}

const MAX_BATCH_QUERIES = 50;

/** Extract data from a tool result, handling both ViewToolResult and ToolResult. */
function extractResultData(result: ToolResult | ViewToolResult): unknown {
  if (result.isError) {
    return { error: result.content[0]?.text ?? "Unknown error" };
  }
  if ("structuredContent" in result) {
    return result.structuredContent;
  }
  const dataBlock = result.content.length > 1 ? result.content[1] : result.content[0];
  try {
    return JSON.parse(dataBlock?.text ?? "null") as unknown;
  } catch {
    return dataBlock?.text ?? null;
  }
}

async function handleQueryReference(
  env: Env,
  userUuid: string,
  args: Record<string, unknown>,
): Promise<ToolResult | ViewToolResult> {
  const queries = args.queries;
  if (!Array.isArray(queries) || queries.length === 0) {
    return {
      content: [
        { type: "text", text: "Invalid queries: must be a non-empty array of query objects." },
      ],
      isError: true,
    };
  }
  if (queries.length > MAX_BATCH_QUERIES) {
    return {
      content: [
        {
          type: "text",
          text: `Too many queries: maximum ${String(MAX_BATCH_QUERIES)}, got ${String(queries.length)}.`,
        },
      ],
      isError: true,
    };
  }

  const gameId = args.game_id as string;
  const moduleId = args.module as string;

  // Look up the native module for section-reference resolution.
  // WASM modules don't support section references (no sectionMappings).
  const nativeModule = getNativeModule(gameId, moduleId);

  // Cache verified save ownership across queries in this batch to avoid
  // redundant D1 lookups when multiple queries reference the same save_id.
  const verifiedSaves: VerifiedSaveCache = new Set();

  const responses = await Promise.allSettled(
    queries.map(async (q) => {
      let enrichedQuery = { ...(q as Record<string, unknown>), user_id: userUuid };

      // Resolve section references before dispatching to the module
      if (nativeModule) {
        enrichedQuery = await resolveSectionParams(
          env.DB,
          userUuid,
          nativeModule,
          enrichedQuery,
          verifiedSaves,
        );
      }

      return queryReference(env.REFERENCE_PLUGINS, gameId, moduleId, enrichedQuery, env);
    }),
  );

  const results = responses.map((outcome) =>
    outcome.status === "rejected"
      ? { error: String(outcome.reason) }
      : extractResultData(outcome.value),
  );

  // Resolve game icon URL for view rendering (uses per-isolate manifest cache, typically warm)
  const iconUrl = env.SERVER_URL
    ? await resolveIconUrl(env.PLUGINS, env.SERVER_URL, gameId)
    : undefined;

  // Single-query shortcut: unwrap the array
  if (results.length === 1) {
    const data = results[0] as Record<string, unknown>;
    if ("error" in data) {
      return { content: [{ type: "text", text: String(data.error) }], isError: true };
    }
    const first = responses[0];
    const narrative =
      first?.status === "fulfilled" && "content" in first.value
        ? (first.value.content[0]?.text ?? `Reference data for ${moduleId}.`)
        : `Reference data for ${moduleId}.`;
    // Include module ID so the bundled reference view knows which component to mount
    return viewResult(
      { module: moduleId, ...(iconUrl ? { icon_url: iconUrl } : {}), ...data },
      narrative,
    );
  }

  // Multi-query: wrap in { results } array
  return viewResult(
    { module: moduleId, ...(iconUrl ? { icon_url: iconUrl } : {}), results },
    `${String(results.length)} reference query results for ${moduleId}.`,
  );
}

function parseRpc(request: Request): Promise<JsonRpcRequest> {
  return request.json<JsonRpcRequest>();
}

function routeRpc(rpc: JsonRpcRequest, env: Env, userUuid: string): Promise<Response> {
  const id = rpc.id ?? 0;

  switch (rpc.method) {
    case "initialize": {
      return Promise.resolve(
        jsonRpcResponse(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
            extensions: {
              "io.modelcontextprotocol/ui": {},
            },
          },
          serverInfo: { name: "savecraft", version: env.VERSION ?? "dev" },
          instructions: SERVER_INSTRUCTIONS,
        }),
      );
    }

    case "notifications/initialized": {
      return Promise.resolve(new Response(null, { status: 202, headers: MCP_HEADERS }));
    }

    case "tools/list": {
      return Promise.resolve(jsonRpcResponse(id, { tools: buildToolsWithUi(env) }));
    }

    case "resources/list": {
      return Promise.resolve(jsonRpcResponse(id, { resources: buildResourceList(env) }));
    }

    case "resources/read": {
      const uri = rpc.params?.uri as string | undefined;
      if (!uri) {
        return Promise.resolve(jsonRpcError(id, -32_602, "Missing uri parameter"));
      }
      const html = readResource(uri);
      if (!html) {
        return Promise.resolve(jsonRpcError(id, -32_602, `Resource not found: ${uri}`));
      }
      return Promise.resolve(
        jsonRpcResponse(id, {
          contents: [
            {
              uri,
              mimeType: RESOURCE_MIME_TYPE,
              text: html,
              _meta: { ui: { domain: viewDomain(env), csp: VIEW_CSP } },
            },
          ],
        }),
      );
    }

    case "tools/call": {
      if (!rpc.params) {
        return Promise.resolve(jsonRpcError(id, -32_602, "Missing params for tools/call"));
      }
      return handleToolCall(rpc.params, env, userUuid).then((result) =>
        jsonRpcResponse(id, result),
      );
    }

    default: {
      return Promise.resolve(
        jsonRpcError(rpc.id ?? null, -32_601, `Method not found: ${rpc.method}`),
      );
    }
  }
}

/**
 * Handle an MCP request over Streamable HTTP.
 * Each POST carries a JSON-RPC 2.0 message.
 */
export async function handleMcpRequest(
  request: Request,
  env: Env,
  userUuid: string,
): Promise<Response> {
  if (request.method === "DELETE") {
    return new Response(null, { status: 200, headers: MCP_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: MCP_HEADERS });
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = await parseRpc(request);
  } catch {
    return jsonRpcError(null, -32_700, "Parse error");
  }

  if (rpc.jsonrpc !== "2.0") {
    return jsonRpcError(rpc.id ?? null, -32_600, "Invalid Request: expected jsonrpc 2.0");
  }

  // Track MCP activity on every request — some clients (e.g. Claude.ai)
  // skip the initialize handshake, so we can't rely on it alone.
  env.DB.prepare("INSERT OR IGNORE INTO mcp_activity (user_uuid) VALUES (?)")
    .bind(userUuid)
    .run()
    .catch(Function.prototype as () => void);

  return routeRpc(rpc, env, userUuid);
}
