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
  getSaveSections,
  getSection,
  getSectionDiff,
  listNotes,
  listSaves,
  refreshSave,
  searchSaves,
  updateNote,
} from "./tools";

const SERVER_INFO = { name: "savecraft", version: "1.0.0" };
const PROTOCOL_VERSION = "2025-11-25";

const SERVER_INSTRUCTIONS = `Savecraft gives you access to the player's actual game state — their characters, gear, progress, and goals — parsed from real save files. You are their gaming companion.

Two interaction modes (same tools, different intent):
- Companion: The player is talking, venting, or celebrating. React with empathy and context from their actual state. "I FOUND A BER" means more when you know it was on their farming list.
- Optimizer: The player wants specific advice. Analyze their sections and notes, compare to game knowledge, give personalized recommendations.

Start with list_saves to see what's available. Use get_save_sections to orient on a character — it returns a summary, overview data, and all available section names. Check list_notes and get_note early — notes contain the player's goals, build guides, and context from previous sessions. They are your memory across conversations. Only then fetch specific sections via get_section as needed for the question.

When the player says something just changed ("I just found a Ber rune", "I just finished the quest"), call refresh_save first to pull fresh data, then re-read the relevant sections.

Results from search_saves distinguish between save data (what the player actually has in-game) and notes (what the player wrote, plans, or guides they're following). This distinction matters: "you have Enigma" vs "your guide recommends Enigma" are very different.

When the player shares something worth remembering — a goal, a milestone, a plan — offer to save it as a note via create_note. Keep notes current with update_note when circumstances change. The player shouldn't have to repeat themselves across sessions.`;

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

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  annotations: ToolAnnotations;
}

// Tool descriptions serve double duty: they tell the AI what each tool does,
// and they guide *when* and *why* to use it. The AI has no system prompt for
// Savecraft — these descriptions are its entire playbook.
//
// Progressive disclosure order:
//   1. list_saves → orient (what characters/games exist)
//   2. get_save_sections → context on a character (summary, overview, section listing)
//   3. list_notes → check player's own goals/guides FIRST
//   4. get_note → read the player's context before giving advice
//   5. get_section → fetch specific game data as needed
//   6. refresh_save → pull fresh data when player reports changes
//   7. search_saves → cross-save or "I don't know where this is" queries
//
// Two interaction modes (same tools, different intent):
//   - Companion: player is talking, venting, celebrating. React with context.
//   - Optimizer: player wants specific advice. Analyze sections + notes.

const TOOLS: ToolDefinition[] = [
  // ── Discovery ─────────────────────────────────────────────
  {
    name: "list_saves",
    title: "List Saves",
    description:
      "List all of the player's saves. Start here to see what characters and games are available. Returns game, character name, a short summary, and when the save was last updated.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_save_sections",
    title: "Get Save Sections",
    description:
      "Get full context on a save: summary line, overview data, and a listing of all available sections. Use this when the player mentions a character or you need to orient yourself before fetching specific sections. Section names and contents vary by game.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
      },
      required: ["save_id"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  // ── Reading save data ─────────────────────────────────────
  {
    name: "get_section",
    title: "Get Section Data",
    description:
      "Fetch section data from a save. Use 'section' for a single section or 'sections' for multiple at once (more efficient than calling repeatedly). Only fetch what's relevant to the question. Supports historical queries via optional timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        section: { type: "string", description: "A single section name from get_save_sections" },
        sections: { type: "string", description: "Array of section names to fetch multiple sections at once (JSON array of strings)" },
        timestamp: {
          type: "string",
          description: "Optional ISO 8601 timestamp for a historical snapshot",
        },
      },
      required: ["save_id"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_section_diff",
    title: "Compare Section Snapshots",
    description:
      'Compare a section between two snapshots to see what changed. Returns specific fields with old and new values. Use when the player asks about progression, recent changes, or "what\'s different since last time."',
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        section: { type: "string", description: "The section name to diff" },
        from_timestamp: { type: "string", description: "ISO 8601 timestamp of the older snapshot" },
        to_timestamp: { type: "string", description: "ISO 8601 timestamp of the newer snapshot" },
      },
      required: ["save_id", "section", "from_timestamp", "to_timestamp"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  // ── Notes (player context — check these first!) ───────────
  //
  // Notes are the player's goals, build guides, farming lists, and session
  // memories. When responding to a player, check notes BEFORE looking up
  // external information — the player's own context is more relevant than
  // generic advice. Notes are also how you remember things across sessions.
  {
    name: "list_notes",
    title: "List Notes",
    description:
      "List notes attached to a save — the player's build guides, goals, farming lists, and memories. Check notes early in any conversation: they contain context the player has already shared (what they're working toward, what build they're following, what happened last session). Returns titles and sizes without content.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
      },
      required: ["save_id"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_note",
    title: "Get Note",
    description:
      "Fetch a note's full content. Read relevant notes before giving advice — if the player has a build guide saved, compare their actual state to it rather than suggesting a generic build.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        note_id: { type: "string", description: "The note ID from list_notes" },
      },
      required: ["save_id", "note_id"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "create_note",
    title: "Create Note",
    description:
      "Create a note attached to a save. Use for build guides, farming goals, session memories, or anything the player might want recalled later. When a player shares something worth remembering — a goal, a frustration, a milestone, a plan — offer to save it as a note so you can reference it in future sessions. The player shouldn't have to repeat themselves.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        title: { type: "string", description: "Short descriptive title" },
        content: {
          type: "string",
          description:
            "Note content (markdown). Be structured and specific — future-you will read this to understand context.",
        },
      },
      required: ["save_id", "title", "content"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "update_note",
    title: "Update Note",
    description:
      "Update a note's title or content. Keep notes current — when the player achieves a goal, finds a drop, or changes plans, update the relevant note so it stays accurate. Don't let notes go stale.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        note_id: { type: "string", description: "The note ID from list_notes" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional, markdown)" },
      },
      required: ["save_id", "note_id"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "delete_note",
    title: "Delete Note",
    description:
      "Delete a note permanently. Confirm with the player before deleting — notes may contain context they'll want later even if it seems outdated now.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        note_id: { type: "string", description: "The note ID from list_notes" },
      },
      required: ["save_id", "note_id"],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  // ── Refresh ───────────────────────────────────────────────
  {
    name: "refresh_save",
    title: "Refresh Save",
    description:
      "Request fresh data for a save. Use when the player says something just changed ('I just found a Ber rune', 'I just equipped a new item', 'I just finished the quest'). The server handles whether this goes to the local daemon or a game API — you don't need to know which. After refreshing, re-read the relevant sections to see the updated state.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
      },
      required: ["save_id"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
          description: "Search query (supports prefix matching and boolean operators like OR)",
        },
        save_id: {
          type: "string",
          description:
            "Optional: scope search to a single save instead of searching across all saves",
        },
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    case "list_saves": { return listSaves(env.DB, userUuid); }
    case "get_save_sections": { return getSaveSections(env.DB, env.SAVES, userUuid, saveId); }
    case "get_section": {
      return getSection(
        env.DB, env.SAVES, userUuid, saveId,
        args.section as string | undefined,
        parseSectionsArgument(args.sections),
        args.timestamp as string | undefined,
      );
    }
    case "get_section_diff": {
      return getSectionDiff(
        env.DB, env.SAVES, userUuid, saveId,
        args.section as string, args.from_timestamp as string, args.to_timestamp as string,
      );
    }
    case "list_notes": { return listNotes(env.DB, userUuid, saveId); }
    case "get_note": { return getNote(env.DB, userUuid, saveId, args.note_id as string); }
    case "create_note": {
      return createNote(env.DB, userUuid, saveId, args.title as string, args.content as string);
    }
    case "update_note": {
      return updateNote(
        env.DB, userUuid, saveId, args.note_id as string,
        args.content as string | undefined, args.title as string | undefined,
      );
    }
    case "delete_note": { return deleteNote(env.DB, userUuid, saveId, args.note_id as string); }
    case "refresh_save": { return refreshSave(env.DB, env.DAEMON_HUB, userUuid, saveId); }
    case "search_saves": {
      return searchSaves(env.DB, userUuid, args.query as string, args.save_id as string | undefined);
    }
    default: {
      return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
    }
  }
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
          serverInfo: SERVER_INFO,
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

  return routeRpc(rpc, env, userUuid);
}
