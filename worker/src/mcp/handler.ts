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
  getSaveSummary,
  getSection,
  getSectionDiff,
  listNotes,
  listSaves,
  search,
  updateNote,
} from "./tools";

const SERVER_INFO = { name: "savecraft", version: "1.0.0" };
const PROTOCOL_VERSION = "2025-11-25";

interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  annotations?: { readOnlyHint?: boolean };
}

// Tool descriptions serve double duty: they tell the AI what each tool does,
// and they guide *when* and *why* to use it. The AI has no system prompt for
// Savecraft — these descriptions are its entire playbook.
//
// Progressive disclosure order:
//   1. list_saves → orient (what characters/games exist)
//   2. get_save_summary → context on a specific character
//   3. list_notes → check player's own goals/guides FIRST
//   4. get_note → read the player's context before giving advice
//   5. get_save_sections / get_section → fetch game data as needed
//   6. search → cross-save or "I don't know where this is" queries
//
// Two interaction modes (same tools, different intent):
//   - Companion: player is talking, venting, celebrating. React with context.
//   - Optimizer: player wants specific advice. Analyze sections + notes.

const TOOLS: ToolDefinition[] = [
  // ── Discovery ─────────────────────────────────────────────
  {
    name: "list_saves",
    description:
      "List all of the player's saves. Start here to see what characters and games are available. Returns game, character name, a short summary, and when the save was last updated.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_save_summary",
    description:
      "Quick overview of a save — the summary line and overview section data. Good for getting context on a character before diving deeper. Use this when the player mentions a character or you need to orient yourself.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
      },
      required: ["save_id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_save_sections",
    description:
      "List the available data sections for a save and what each contains. Check this before fetching sections so you know what's available — section names and contents vary by game.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
      },
      required: ["save_id"],
    },
    annotations: { readOnlyHint: true },
  },
  // ── Reading save data ─────────────────────────────────────
  {
    name: "get_section",
    description:
      "Fetch a specific section's full data from a save. Only fetch the sections relevant to the player's question — don't load everything. Supports historical queries via optional timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        section: { type: "string", description: "The section name from get_save_sections" },
        timestamp: {
          type: "string",
          description: "Optional ISO 8601 timestamp for a historical snapshot",
        },
      },
      required: ["save_id", "section"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_section_diff",
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
    annotations: { readOnlyHint: true },
  },
  // ── Notes (player context — check these first!) ───────────
  //
  // Notes are the player's goals, build guides, farming lists, and session
  // memories. When responding to a player, check notes BEFORE looking up
  // external information — the player's own context is more relevant than
  // generic advice. Notes are also how you remember things across sessions.
  {
    name: "list_notes",
    description:
      "List notes attached to a save — the player's build guides, goals, farming lists, and memories. Check notes early in any conversation: they contain context the player has already shared (what they're working toward, what build they're following, what happened last session). Returns titles and sizes without content.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
      },
      required: ["save_id"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_note",
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
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_note",
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
  },
  {
    name: "update_note",
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
  },
  {
    name: "delete_note",
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
  },
  // ── Search ────────────────────────────────────────────────
  {
    name: "search",
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
    annotations: { readOnlyHint: true },
  },
];

function jsonRpcResponse(id: number | string, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: number | string | null, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleToolCall(
  params: Record<string, unknown>,
  env: Env,
  userUuid: string,
): Promise<unknown> {
  const toolName = params.name as string;
  const args = (params.arguments ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case "list_saves": {
      return listSaves(env.DB, userUuid);
    }
    case "get_save_sections": {
      return getSaveSections(env.DB, env.SAVES, userUuid, args.save_id as string);
    }
    case "get_section": {
      return getSection(
        env.DB,
        env.SAVES,
        userUuid,
        args.save_id as string,
        args.section as string,
        args.timestamp as string | undefined,
      );
    }
    case "get_section_diff": {
      return getSectionDiff(
        env.DB,
        env.SAVES,
        userUuid,
        args.save_id as string,
        args.section as string,
        args.from_timestamp as string,
        args.to_timestamp as string,
      );
    }
    case "get_save_summary": {
      return getSaveSummary(env.DB, env.SAVES, userUuid, args.save_id as string);
    }
    case "list_notes": {
      return listNotes(env.DB, userUuid, args.save_id as string);
    }
    case "get_note": {
      return getNote(env.DB, userUuid, args.save_id as string, args.note_id as string);
    }
    case "create_note": {
      return createNote(
        env.DB,
        userUuid,
        args.save_id as string,
        args.title as string,
        args.content as string,
      );
    }
    case "update_note": {
      return updateNote(
        env.DB,
        userUuid,
        args.save_id as string,
        args.note_id as string,
        args.content as string | undefined,
        args.title as string | undefined,
      );
    }
    case "delete_note": {
      return deleteNote(env.DB, userUuid, args.save_id as string, args.note_id as string);
    }
    case "search": {
      return search(env.DB, userUuid, args.query as string, args.save_id as string | undefined);
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
