import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

const TEST_USER = "mcp-status-user";

function mcpRequest(method: string, id: number, params?: unknown): Request {
  const body: Record<string, unknown> = { jsonrpc: "2.0", id, method };
  if (params !== undefined) body.params = params;
  return new Request("https://test-host/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_USER}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

describe("MCP Status", () => {
  beforeEach(cleanAll);

  it("returns connected: false with no MCP activity", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/mcp-status", {
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    expect(resp.status).toBe(200);
    const body = await resp.json<{ connected: boolean }>();
    expect(body.connected).toBe(false);
  });

  it("returns connected: true after a tools/call", async () => {
    // First push a save so tools/call has data
    await SELF.fetch("https://test-host/api/v1/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_USER}`,
        "X-Game": "d2r",
        "X-Parsed-At": "2026-02-25T21:30:00Z",
      },
      body: JSON.stringify({
        identity: { saveName: "TestChar", gameId: "d2r" },
        summary: "Test Character",
        sections: { overview: { description: "Overview", data: { level: 1 } } },
      }),
    });

    // Make a tools/call via MCP
    await SELF.fetch(mcpRequest("tools/call", 1, { name: "list_saves", arguments: {} }));

    // Now check status
    const resp = await SELF.fetch("https://test-host/api/v1/mcp-status", {
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    expect(resp.status).toBe(200);
    const body = await resp.json<{ connected: boolean }>();
    expect(body.connected).toBe(true);
  });

  it("does NOT set connected on initialize", async () => {
    await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      }),
    );

    const resp = await SELF.fetch("https://test-host/api/v1/mcp-status", {
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    const body = await resp.json<{ connected: boolean }>();
    expect(body.connected).toBe(false);
  });

  it("does NOT set connected on tools/list", async () => {
    await SELF.fetch(mcpRequest("tools/list", 1));

    const resp = await SELF.fetch("https://test-host/api/v1/mcp-status", {
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    const body = await resp.json<{ connected: boolean }>();
    expect(body.connected).toBe(false);
  });

  it("requires authentication", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/mcp-status");
    expect(resp.status).toBe(401);
  });
});
