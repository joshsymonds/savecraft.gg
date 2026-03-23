/**
 * MCP Streamable HTTP handler. Implements the JSON-RPC 2.0 protocol
 * for MCP tool serving without the heavy @modelcontextprotocol/sdk
 * (which depends on ajv/express/hono — incompatible with Workers runtime).
 *
 * Supports: initialize, notifications/initialized, tools/list, tools/call.
 * Transport: Streamable HTTP (POST with JSON responses, no SSE needed for sync tools).
 */
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
  searchSaves,
  updateNote,
} from "./tools";
import type { ToolResult } from "./tools";

const PROTOCOL_VERSION = "2025-11-25";

const SERVER_INSTRUCTIONS = `Savecraft gives you access to the player's actual game state — characters, gear, progress, and goals — parsed from real save files. You are their gaming companion.

Only fetch data relevant to the player's current question. When they mention a specific game, use list_games with the filter parameter — don't load all games. Fetch sections selectively: only request sections you'll actually reference in your response.

Notes are the player's memory across conversations — goals, build guides, session context. Always read relevant notes (via get_note) before giving advice, so you build on what's already been discussed. When the player shares something worth remembering, offer to save it as a note. Keep notes current with update_note when circumstances change.

Results from search_saves distinguish between save data (what the player actually has in-game) and notes (what the player wrote or planned). This distinction matters: "player owns this item" vs "guide recommends this item" are very different.

Removed saves and games: Players can remove individual saves or entire games from Savecraft. list_games includes a removed_saves field per game showing the names of removed saves. If a player asks about a character you can't find but it appears in removed_saves, tell them it was removed and they can restore it from the game detail screen on savecraft.gg. Removed games won't appear in list_games at all — if the player asks about a game that's missing entirely, suggest they check their game settings on savecraft.gg to see if it was removed.

All timestamps returned by Savecraft are UTC.

When working with tool results, write down any important information you might need later in your response, as the original tool result may be cleared later.`;

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
}

// Tool descriptions serve double duty: they tell the AI what each tool does,
// and they guide *when* and *why* to use it. The AI has no system prompt for
// Savecraft — these descriptions are its entire playbook.
//
// Progressive disclosure order:
//   1. list_games → orient (what games, characters, saves, references exist)
//   2. get_save → context on a character (summary, overview, sections, notes)
//   3. get_note → read the player's goals/guides before giving advice
//   4. get_section → fetch specific game data as needed
//   5. refresh_save → pull fresh data when player reports changes
//   6. search_saves → cross-save or "I don't know where this is" queries
//   7. query_reference → authoritative game calculations (drop rates, builds)
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
      "Returns the player's games with their saves (including note titles), removed save names, and reference modules. Use the returned save_id values with other tools. When the player is asking about a specific game, pass the filter parameter to avoid loading unrelated data. Call without filter only when the player wants to see all their games. Check the removed_saves field if the player asks about a character you can't find — it may have been removed.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description:
            "Filter games by name or ID (case-insensitive substring match). Omit to see all games.",
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
      "Get a save's summary, overview data, available section names, and attached notes. Use when the player mentions a specific character or save. Section names and contents vary by game — use the returned names with get_section to fetch detailed data.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
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
      "Fetch detailed section data from a save. Call get_save first to see available section names — section names and their contents vary by game. Only request sections you will directly reference in your response; do not preload all sections.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
        sections: {
          type: "array",
          description:
            "Section names to fetch (from get_save's section listing). Pass one name or several.",
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
      "Fetch the full content of a note. Use when get_save or search_saves returns note metadata and the note is relevant to the player's question.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
        note_id: { type: "string", description: "Note UUID returned by get_save or search_saves" },
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
      "Create a note attached to a save. Use for build guides, goals, session memories, or anything the player might want recalled in future sessions. Maximum 10 notes per save.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
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
      "Update a note's title or content. Use when the player's plans, goals, or save state has changed and an existing note is outdated. Pass only the fields to change — omit title or content to leave them unchanged.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
        note_id: { type: "string", description: "Note UUID returned by get_save or search_saves" },
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
      "Permanently delete a note from a save. Use only when the player explicitly asks to remove a note — prefer update_note to revise outdated content rather than deleting.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
        note_id: { type: "string", description: "Note UUID returned by get_save or search_saves" },
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
      "Request fresh data for a save from the player's source or game API. Use when the player says something just changed ('I just found a rare item', 'I just equipped new gear', 'I just finished the quest'). The server handles whether this goes to the local daemon or a game API — you don't need to know which.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
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
      "Full-text search across all saves and notes. Use when you need to find something specific and don't know which save or section contains it — especially useful for cross-character queries. Results distinguish between save data (what the player has) and notes (what the player wrote or planned).",
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
      "Execute a reference data computation for a game — use for authoritative quantitative results (drop rates, stat calculations, build thresholds) where AI estimation would be unreliable. Available modules and their parameter schemas are returned by list_games.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: {
          type: "string",
          description: "Game ID from list_games.",
        },
        module: {
          type: "string",
          description: "Reference module ID from list_games.",
        },
        query: {
          type: "string",
          description:
            "JSON-encoded query object with module-specific parameters. The exact structure is defined by the module's parameter schema in the list_games response — build from that schema, do not guess field names.",
        },
      },
      required: ["game_id", "module", "query"],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  // ── Savecraft Info ──────────────────────────────────────────
  {
    name: "get_savecraft_info",
    title: "Savecraft Setup & Info",
    description:
      "Get information about the player's Savecraft setup or the project itself. Use when list_games returns no saves, the player mentions a pairing code or connecting a game, asks about privacy/security, or wants to know what Savecraft is. Always returns the player's source list. Omit category for a topic menu; pass a category for focused content.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Topic to drill into. Omit to get the category menu. 'games': supported games, source types, setup instructions. 'setup': install instructions, pairing, API game setup. 'privacy': data collection, security, what's NOT collected. 'about': open source links, author, architecture.",
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
      return listGames(env.DB, env.PLUGINS, userUuid, args.filter as string | undefined);
    }
    case "get_save": {
      return getSave(env.DB, userUuid, saveId);
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
      return handleQueryReference(env, args);
    }
    case "get_savecraft_info": {
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

function handleQueryReference(
  env: Env,
  args: Record<string, unknown>,
): Promise<ToolResult> | ToolResult {
  let queryObject: Record<string, unknown>;
  try {
    queryObject = JSON.parse(args.query as string) as Record<string, unknown>;
  } catch {
    return {
      content: [{ type: "text", text: "Invalid query: must be a valid JSON object string." }],
      isError: true,
    };
  }
  return queryReference(
    env.REFERENCE_PLUGINS,
    args.game_id as string,
    args.module as string,
    queryObject,
    env,
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
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "savecraft", version: env.VERSION ?? "dev" },
          instructions: SERVER_INSTRUCTIONS,
        }),
      );
    }

    case "notifications/initialized": {
      return Promise.resolve(new Response(null, { status: 202, headers: MCP_HEADERS }));
    }

    case "tools/list": {
      return Promise.resolve(jsonRpcResponse(id, { tools: TOOLS }));
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
