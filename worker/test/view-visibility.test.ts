import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { registerNativeModule } from "../src/reference/registry";
import type { NativeReferenceModule } from "../src/reference/types";

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

// ── query_reference visibility tests ─────────────────────────

describe("query_reference view_default", () => {
  const visibleModule: NativeReferenceModule = {
    id: "vis_mod",
    name: "Visible Module",
    description: "A module with view_default: visible",
    view_default: "visible",
    execute: () => Promise.resolve({ type: "structured", data: { result: "data", score: 42 } }),
  };

  const hiddenModule: NativeReferenceModule = {
    id: "hid_mod",
    name: "Hidden Module",
    description: "A module with view_default: hidden",
    view_default: "hidden",
    execute: () => Promise.resolve({ type: "structured", data: { result: "lookup", count: 5 } }),
  };

  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("testgame", visibleModule);
    registerNativeModule("testgame", hiddenModule);
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

  it("returns ViewToolResult when view_default is visible", async () => {
    const result = await callTool("query_reference", {
      game_id: "testgame",
      module: "vis_mod",
      queries: [{ label: "Test" }],
    });
    expect(result).toHaveProperty("structuredContent");
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.module).toBe("vis_mod");
    expect(sc.score).toBe(42);
  });

  it("returns textResult when view_default is hidden", async () => {
    const result = await callTool("query_reference", {
      game_id: "testgame",
      module: "hid_mod",
      queries: [{ label: "Test" }],
    });
    expect(result).not.toHaveProperty("structuredContent");
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.module).toBe("hid_mod");
    expect(parsed.count).toBe(5);
  });

  it("hidden result preserves all module data in text content", async () => {
    const result = await callTool("query_reference", {
      game_id: "testgame",
      module: "hid_mod",
      queries: [{ label: "Test" }],
    });
    expect(result).not.toHaveProperty("structuredContent");
    const content = result.content as { type: string; text: string }[];
    const data = JSON.parse(content[0]!.text);
    // All fields from the module's execute result are present
    expect(data.module).toBe("hid_mod");
    expect(data.result).toBe("lookup");
    expect(data.count).toBe(5);
  });

  it("works with multi-query batches and hidden default", async () => {
    const result = await callTool("query_reference", {
      game_id: "testgame",
      module: "hid_mod",
      queries: [{ label: "A" }, { label: "B" }],
    });
    expect(result).not.toHaveProperty("structuredContent");
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed._multiQuery).toBe(true);
    expect(parsed.results).toHaveLength(2);
  });
});
