import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, getOAuthToken } from "./helpers";

const TEST_USER = "mcp-status-user";
const TOKEN_HOLDER: { value: string } = { value: "" };

function mcpRequest(method: string, id: number, params?: unknown): Request {
  const body: Record<string, unknown> = { jsonrpc: "2.0", id, method };
  if (params !== undefined) body.params = params;
  return new Request("https://test-host/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN_HOLDER.value}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

describe("MCP Status", () => {
  beforeEach(async () => {
    await cleanAll();
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
  });

  it("returns connected: false with no MCP activity", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/mcp-status", {
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    expect(resp.status).toBe(200);
    const body = await resp.json<{ connected: boolean }>();
    expect(body.connected).toBe(false);
  });

  it("returns connected: true after initialize", async () => {
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
    expect(resp.status).toBe(200);
    const body = await resp.json<{ connected: boolean }>();
    expect(body.connected).toBe(true);
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
