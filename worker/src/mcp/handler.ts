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

const TOOLS: ToolDefinition[] = [
  {
    name: "list_saves",
    description:
      "List all saves for the current user with metadata (game, character name, summary, last updated)",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_save_sections",
    description:
      "List available sections and their descriptions for a specific save. Use this to discover what data is available before fetching specific sections.",
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
    name: "get_section",
    description:
      "Get a specific section's full data from a save. Optionally pass a timestamp for historical queries.",
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
      "Compare a section between two snapshots. Returns a list of changed fields with old and new values.",
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
  {
    name: "get_save_summary",
    description:
      "Get a quick overview of a save: summary string and the overview/character section data",
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
    name: "list_notes",
    description:
      "List all notes attached to a save. Returns metadata (title, source, size) without content.",
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
    description: "Get a note's full content by ID",
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
    description: "Create a new note attached to a save. Use for build guides, goals, or reminders.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        title: { type: "string", description: "Note title" },
        content: { type: "string", description: "Note content (markdown)" },
      },
      required: ["save_id", "title", "content"],
    },
  },
  {
    name: "update_note",
    description: "Update an existing note's title and/or content",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        note_id: { type: "string", description: "The note ID from list_notes" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional)" },
      },
      required: ["save_id", "note_id"],
    },
  },
  {
    name: "delete_note",
    description: "Delete a note. This action cannot be undone.",
    inputSchema: {
      type: "object",
      properties: {
        save_id: { type: "string", description: "The save UUID from list_saves" },
        note_id: { type: "string", description: "The note ID from list_notes" },
      },
      required: ["save_id", "note_id"],
    },
  },
  {
    name: "search",
    description:
      "Full-text search across all saves and notes. Returns ranked matches with snippets. Optionally scope to a single save.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (supports FTS5 syntax)" },
        save_id: {
          type: "string",
          description: "Optional save UUID to scope search to a single save",
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
      return getSaveSections(env.DB, env.SNAPSHOTS, userUuid, args.save_id as string);
    }
    case "get_section": {
      return getSection(
        env.DB,
        env.SNAPSHOTS,
        userUuid,
        args.save_id as string,
        args.section as string,
        args.timestamp as string | undefined,
      );
    }
    case "get_section_diff": {
      return getSectionDiff(
        env.DB,
        env.SNAPSHOTS,
        userUuid,
        args.save_id as string,
        args.section as string,
        args.from_timestamp as string,
        args.to_timestamp as string,
      );
    }
    case "get_save_summary": {
      return getSaveSummary(env.DB, env.SNAPSHOTS, userUuid, args.save_id as string);
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
