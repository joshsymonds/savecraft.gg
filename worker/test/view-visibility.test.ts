import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { registerNativeModule } from "../src/reference/registry";
import type { NativeReferenceModule } from "../src/reference/types";
import { VISUAL_MODULES } from "../src/mcp/views.gen.js";

import { cleanAll, getOAuthToken, seedPush, seedSource } from "./helpers";

const TEST_USER = "view-vis-user";
const TOKEN_HOLDER: { value: string } = { value: "" };

function mcpRequest(method: string, id: number, params?: unknown): Request {
  return new Request("https://test-host/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN_HOLDER.value}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

async function parseJsonResponse(resp: Response): Promise<unknown> {
  const contentType = resp.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) return resp.json();
  if (contentType.includes("text/event-stream")) {
    const text = await resp.text();
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) return JSON.parse(line.slice(6));
    }
    throw new Error(`No data event in SSE response: ${text}`);
  }
  throw new Error(`Unexpected content type: ${contentType}`);
}

async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resp = await SELF.fetch(mcpRequest("tools/call", 1, { name: toolName, arguments: args }));
  const rpc = (await parseJsonResponse(resp)) as { result: Record<string, unknown> };
  return rpc.result;
}

async function listTools(): Promise<Record<string, unknown>[]> {
  const resp = await SELF.fetch(mcpRequest("tools/list", 2));
  const rpc = (await parseJsonResponse(resp)) as { result: { tools: Record<string, unknown>[] } };
  return rpc.result.tools;
}

// ── query_reference vs show_reference split ─────────────────

describe("query_reference and show_reference tools", () => {
  // Pick a real visual module ID from the built view bundle so show_reference accepts it.
  const visualModuleId = [...VISUAL_MODULES][0]!; // e.g. "card_search"

  const testModule: NativeReferenceModule = {
    id: visualModuleId,
    name: "Visual Test Module",
    description: "A module with a compiled view component",
    execute: () => Promise.resolve({ type: "structured", data: { result: "data", score: 42 } }),
  };

  const noViewModule: NativeReferenceModule = {
    id: "noview_mod",
    name: "No View Module",
    description: "A module without a view",
    execute: () => Promise.resolve({ type: "structured", data: { result: "lookup", count: 5 } }),
  };

  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("testgame", testModule);
    registerNativeModule("testgame", noViewModule);
    const source = await seedSource(TEST_USER);
    await seedPush(
      TEST_USER,
      source.sourceUuid,
      "testgame",
      "TestSave",
      "Test",
      "2026-01-01T00:00:00Z",
      {
        overview: { description: "Overview", data: {} },
      },
    );
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
  });

  describe("tools/list", () => {
    it("query_reference has no _meta.ui", async () => {
      const tools = await listTools();
      const qr = tools.find((t) => t.name === "query_reference");
      expect(qr).toBeDefined();
      const meta = qr!._meta as Record<string, unknown> | undefined;
      expect(meta?.ui).toBeUndefined();
    });

    it("show_reference has _meta.ui", async () => {
      const tools = await listTools();
      const sr = tools.find((t) => t.name === "show_reference");
      expect(sr).toBeDefined();
      const meta = sr!._meta as Record<string, unknown> | undefined;
      expect(meta?.ui).toBeDefined();
    });
  });

  describe("query_reference", () => {
    it("never returns structuredContent", async () => {
      const result = await callTool("query_reference", {
        game_id: "testgame",
        module: visualModuleId,
        queries: [{ label: "Test" }],
      });
      expect(result).not.toHaveProperty("structuredContent");
      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(content[0]!.text);
      expect(parsed.module).toBe(visualModuleId);
      expect(parsed.score).toBe(42);
    });

    it("works for modules without views", async () => {
      const result = await callTool("query_reference", {
        game_id: "testgame",
        module: "noview_mod",
        queries: [{ label: "Test" }],
      });
      expect(result).not.toHaveProperty("structuredContent");
      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(content[0]!.text);
      expect(parsed.count).toBe(5);
    });

    it("works with multi-query batches", async () => {
      const result = await callTool("query_reference", {
        game_id: "testgame",
        module: visualModuleId,
        queries: [{ label: "A" }, { label: "B" }],
      });
      expect(result).not.toHaveProperty("structuredContent");
      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse(content[0]!.text);
      expect(parsed._multiQuery).toBe(true);
      expect(parsed.results).toHaveLength(2);
    });
  });

  describe("show_reference", () => {
    it("returns structuredContent for visual modules", async () => {
      const result = await callTool("show_reference", {
        game_id: "testgame",
        module: visualModuleId,
        queries: [{ label: "Test" }],
      });
      expect(result).toHaveProperty("structuredContent");
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.module).toBe(visualModuleId);
      expect(sc.score).toBe(42);
    });

    it("returns error for non-visual modules", async () => {
      const result = await callTool("show_reference", {
        game_id: "testgame",
        module: "noview_mod",
        queries: [{ label: "Test" }],
      });
      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]!.text).toContain("does not support visual display");
    });
  });
});
