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
  getNote,
  getSave,
  getSection,
  getSectionDiff,
  getSetupHelp,
  listGames,
  queryReference,
  refreshSave,
  searchSaves,
  updateNote,
} from "./tools";
import type { ToolResult } from "./tools";

const PROTOCOL_VERSION = "2025-11-25";

const SERVER_INSTRUCTIONS = `Savecraft gives you access to the player's actual game state — their characters, gear, progress, and goals — parsed from real save files. You are their gaming companion.

Two interaction modes (same tools, different intent):
- Companion: The player is talking, venting, or celebrating. React with empathy and context from their actual state. "I FOUND A BER" means more when you know it was on their farming list.
- Optimizer: The player wants specific advice. Analyze their sections and notes, compare to game knowledge, give personalized recommendations.

Start with list_games to see what's available — it returns all games, saves (with note titles), and reference modules (with parameter schemas) in one call. Use get_save to orient on a character — it returns a summary, overview data, all available section names, and attached notes. Notes contain the player's goals, build guides, and context from previous sessions — they are your memory across conversations. Use get_note to read the full content of relevant notes before giving advice. Only then fetch specific sections via get_section as needed for the question.

When the player says something just changed ("I just found a Ber rune", "I just finished the quest"), call refresh_save first to pull fresh data, then re-read the relevant sections.

Results from search_saves distinguish between save data (what the player actually has in-game) and notes (what the player wrote, plans, or guides they're following). This distinction matters: "you have Enigma" vs "your guide recommends Enigma" are very different.

When the player shares something worth remembering — a goal, a milestone, a plan — offer to save it as a note via create_note. Keep notes current with update_note when circumstances change. The player shouldn't have to repeat themselves across sessions.

For questions about game mechanics (drop rates, build calculations, treasure classes), use query_reference. The list_games response includes available reference modules and their parameter schemas, so you already know what queries are possible — no extra discovery step needed. These computations use actual game data tables and are more reliable than AI estimation.

If the player has no saves, asks about installing Savecraft, mentions a pairing code, or seems confused about why their data isn't showing up, use get_setup_help. It returns their device status, can look up a pairing code, and provides platform-specific installation instructions.`;

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
    title: "List Games",
    description:
      "List all games the player has, with their saves, notes, and available reference modules. Start here to orient yourself. Each game includes its saves (with note titles per save), and reference modules with parameter schemas showing what computations are available. Use the returned save_id with other tools. Optionally filter by game name or ID.",
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
    title: "Get Save",
    description:
      "Get a save's summary, overview data, available sections, and attached notes. Use this when the player mentions a character or you need to orient yourself. The overview includes key stats (level, class, etc.). Notes contain the player's goals, build guides, and context from previous sessions — check them before giving advice. Section names and contents vary by game — use the returned section names with get_section to fetch detailed data.",
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
    title: "Get Section Data",
    description:
      "Fetch detailed section data from a save. Pass one or more section names to retrieve. Only fetch sections relevant to the question — don't load everything. Supports historical queries via optional timestamp.",
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
        timestamp: {
          type: "string",
          description:
            "ISO 8601 timestamp to fetch a historical snapshot instead of the latest data. Timestamps are visible in list_games last_updated field.",
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
  {
    name: "get_section_diff",
    title: "Compare Section Changes",
    description:
      'Compare a section\'s data between now and a past point in time. Returns specific fields with old and new values. Use when the player asks about progression, recent changes, or "what\'s different since last session." Specify a time period like "24 hours", "3 days", "1 week", or "last session".',
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
        section: { type: "string", description: "Section name to compare (from get_save)" },
        period: {
          type: "string",
          description:
            'How far back to compare. Examples: "24 hours", "3 days", "1 week", "last session", "this week".',
        },
      },
      required: ["save_id", "section", "period"],
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
    title: "Get Note",
    description:
      "Fetch a note's full content. Read relevant notes before giving advice — if the player has a build guide saved, compare their actual state to it rather than suggesting a generic build.",
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
      "Create a note attached to a save. Use for build guides, farming goals, session memories, or anything the player might want recalled later. When a player shares something worth remembering — a goal, a frustration, a milestone, a plan — offer to save it as a note so you can reference it in future sessions. The player shouldn't have to repeat themselves. Maximum 10 notes per save.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "Save UUID returned by list_games" },
        title: {
          type: "string",
          description:
            "Short descriptive title (e.g. 'Enigma Farming Goals', 'Maxroll Hammerdin Guide')",
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
      "Update a note's title or content. Keep notes current — when the player achieves a goal, finds a drop, or changes plans, update the relevant note so it stays accurate. Don't let notes go stale.",
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
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "delete_note",
    title: "Delete Note",
    description:
      "Delete a note permanently. Confirm with the player before deleting — notes may contain context they'll want later even if it seems outdated now.",
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
      "Request fresh data for a save from the player's device or game API. Use when the player says something just changed ('I just found a Ber rune', 'I just equipped a new item', 'I just finished the quest'). The server handles whether this goes to the local daemon or a game API — you don't need to know which. After refreshing, re-read the relevant sections to see the updated state.",
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
      'Full-text search across all saves and notes. Use when you need to find something specific (an item, a quest, a goal) and don\'t know which save or section contains it. Especially useful for cross-character queries like "which of my characters has Enigma?" Results distinguish between save data (what the player has) and notes (what the player wrote or is planning) — this distinction matters.',
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keywords to search for. Supports prefix matching (hamm*) and boolean operators (enigma OR grief).",
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
    title: "Query Reference Module",
    description:
      "Execute a reference data computation for a game. Returns authoritative results computed from actual game data tables — more reliable than AI estimation. The list_games response includes each game's available reference modules and their parameter schemas, so check there first to see what queries are possible.",
    inputSchema: {
      type: "object",
      properties: {
        game_id: {
          type: "string",
          description: "Game ID from list_games (e.g. 'd2r').",
        },
        module: {
          type: "string",
          description: "Reference module ID from list_games (e.g. 'drop_calc').",
        },
        query: {
          type: "string",
          description:
            "JSON query string with module-specific parameters. See the module's parameter schema from list_games for available fields.",
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
  // ── Setup Help ──────────────────────────────────────────────
  {
    name: "get_setup_help",
    title: "Setup Help",
    description:
      "Check the player's device and installation status, look up a pairing code, and get platform-specific installation instructions. Use this when the player asks about installing Savecraft, when list_games returns no saves, when the player mentions a pairing code or device code, or when the player is confused about why their game data isn't appearing. Returns the player's linked devices with activity status, optional link code or source lookup results, and a full installation guide. If you know the player's operating system, pass it as the platform parameter to get targeted instructions.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description:
            "Operating system for targeted install instructions. Infer from conversation context (e.g. Windows paths, Linux commands).",
          enum: ["linux", "windows", "macos"],
        },
        link_code: {
          type: "string",
          description:
            "6-digit pairing code displayed by the Savecraft daemon during setup. Look this up to check if the device is registered, paired, or has an expired code.",
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

function jsonRpcResponse(id: number | string, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: number | string | null, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
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
      return getSave(env.DB, env.SAVES, userUuid, saveId);
    }
    case "get_section": {
      return getSection(
        env.DB,
        env.SAVES,
        userUuid,
        saveId,
        parseSectionsArgument(args.sections) ?? [],
        args.timestamp as string | undefined,
      );
    }
    case "get_section_diff": {
      return getSectionDiff(
        env.DB,
        env.SAVES,
        userUuid,
        saveId,
        args.section as string,
        args.period as string,
      );
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
      return refreshSave(env.DB, env.SOURCE_HUB, userUuid, saveId);
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
    case "get_setup_help": {
      return getSetupHelp(env.DB, userUuid, args.platform as string | undefined, args.link_code as string | undefined, args.source_uuid as string | undefined);
    }
    default: {
      return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
    }
  }
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
      return Promise.resolve(new Response(null, { status: 202 }));
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
    return new Response(null, { status: 200 });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
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
