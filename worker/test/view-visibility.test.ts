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

describe("query_reference visible_to_user", () => {
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

  it("returns ViewToolResult when view_default is visible and visible_to_user omitted", async () => {
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

  it("returns textResult when view_default is hidden and visible_to_user omitted", async () => {
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

  it("visible_to_user: true overrides hidden default", async () => {
    const result = await callTool("query_reference", {
      game_id: "testgame",
      module: "hid_mod",
      queries: [{ label: "Test" }],
      visible_to_user: true,
    });
    expect(result).toHaveProperty("structuredContent");
  });

  it("visible_to_user: false overrides visible default", async () => {
    const result = await callTool("query_reference", {
      game_id: "testgame",
      module: "vis_mod",
      queries: [{ label: "Test" }],
      visible_to_user: false,
    });
    expect(result).not.toHaveProperty("structuredContent");
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.score).toBe(42);
  });

  it("hidden result contains same data as visible result", async () => {
    const visibleResult = await callTool("query_reference", {
      game_id: "testgame",
      module: "vis_mod",
      queries: [{ label: "Test" }],
      visible_to_user: true,
    });
    const hiddenResult = await callTool("query_reference", {
      game_id: "testgame",
      module: "vis_mod",
      queries: [{ label: "Test" }],
      visible_to_user: false,
    });

    const visibleData = visibleResult.structuredContent;
    const hiddenContent = hiddenResult.content as { type: string; text: string }[];
    const hiddenData = JSON.parse(hiddenContent[0]!.text);
    expect(hiddenData).toEqual(visibleData);
  });

  it("works with multi-query batches", async () => {
    const result = await callTool("query_reference", {
      game_id: "testgame",
      module: "vis_mod",
      queries: [{ label: "A" }, { label: "B" }],
      visible_to_user: false,
    });
    expect(result).not.toHaveProperty("structuredContent");
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed._multiQuery).toBe(true);
    expect(parsed.results).toHaveLength(2);
  });
});

// ── search_saves visibility tests ────────────────────────────

describe("search_saves visible_to_user", () => {
  beforeEach(async () => {
    await cleanAll();
    const source = await seedSource(TEST_USER);
    await seedPush(
      TEST_USER,
      source.sourceUuid,
      "d2r",
      "TestChar",
      "Test Character",
      "2026-01-01T00:00:00Z",
      {
        equipment: { description: "Gear", data: { weapon: "Shako" } },
      },
    );
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
  });

  it("returns textResult by default (view_default: hidden)", async () => {
    const result = await callTool("search_saves", { query: "Shako" });
    expect(result).not.toHaveProperty("structuredContent");
  });

  it("returns ViewToolResult when visible_to_user: true", async () => {
    const result = await callTool("search_saves", {
      query: "Shako",
      visible_to_user: true,
    });
    expect(result).toHaveProperty("structuredContent");
  });
});

// ── list_games visibility tests ──────────────────────────────

describe("list_games visible_to_user", () => {
  beforeEach(async () => {
    await cleanAll();
    const source = await seedSource(TEST_USER);
    await seedPush(
      TEST_USER,
      source.sourceUuid,
      "d2r",
      "TestChar",
      "Test",
      "2026-01-01T00:00:00Z",
      {
        overview: { description: "Overview", data: {} },
      },
    );
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
  });

  it("returns textResult by default (view_default: hidden)", async () => {
    const result = await callTool("list_games", {});
    expect(result).not.toHaveProperty("structuredContent");
    // Data still present in content text
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.games).toBeDefined();
  });

  it("returns ViewToolResult when visible_to_user: true", async () => {
    const result = await callTool("list_games", { visible_to_user: true });
    expect(result).toHaveProperty("structuredContent");
  });
});

// ── get_save visibility tests ────────────────────────────────

describe("get_save visible_to_user", () => {
  let saveUuid: string;

  beforeEach(async () => {
    await cleanAll();
    const source = await seedSource(TEST_USER);
    saveUuid = await seedPush(
      TEST_USER,
      source.sourceUuid,
      "d2r",
      "TestChar",
      "Test",
      "2026-01-01T00:00:00Z",
      {
        overview: { description: "Overview", data: {} },
      },
    );
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
  });

  it("returns textResult by default (view_default: hidden)", async () => {
    const result = await callTool("get_save", { save_id: saveUuid });
    expect(result).not.toHaveProperty("structuredContent");
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.save_id).toBe(saveUuid);
  });

  it("returns ViewToolResult when visible_to_user: true", async () => {
    const result = await callTool("get_save", { save_id: saveUuid, visible_to_user: true });
    expect(result).toHaveProperty("structuredContent");
  });
});
