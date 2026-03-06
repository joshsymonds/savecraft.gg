import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, getOAuthToken, seedSource } from "./helpers";

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

  it("returns connected: true after tools/list (no initialize)", async () => {
    await SELF.fetch(mcpRequest("tools/list", 1));

    const resp = await SELF.fetch("https://test-host/api/v1/mcp-status", {
      headers: { Authorization: `Bearer ${TEST_USER}` },
    });
    const body = await resp.json<{ connected: boolean }>();
    expect(body.connected).toBe(true);
  });

  it("requires authentication", async () => {
    const resp = await SELF.fetch("https://test-host/api/v1/mcp-status");
    expect(resp.status).toBe(401);
  });

  it("get_setup_help includes configured_games with config status", async () => {
    // Seed a source linked to our test user
    const { sourceUuid } = await seedSource(TEST_USER);

    // Insert config rows with different statuses
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, config_status, resolved_path, last_error, result_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(sourceUuid, "d2r", "/saves/d2r", "success", "/saves/d2r", "", "2025-01-01T00:00:00Z"),
      env.DB.prepare(
        `INSERT INTO source_configs (source_uuid, game_id, save_path, config_status, resolved_path, last_error, result_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        sourceUuid,
        "bg3",
        "/saves/bg3",
        "error",
        "/saves/bg3",
        "path not found",
        "2025-01-01T00:00:00Z",
      ),
    ]);

    // Call get_setup_help via MCP
    const resp = await SELF.fetch(
      mcpRequest("tools/call", 2, { name: "get_setup_help", arguments: {} }),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json<{ result: { content: { type: string; text: string }[] } }>();
    const text = body.result.content[0]!.text;
    const data = JSON.parse(text);

    // Should have one source with two configured games
    expect(data.sources).toHaveLength(1);
    const source = data.sources[0];
    expect(source.configured_games).toHaveLength(2);

    const d2r = source.configured_games.find((g: { game_id: string }) => g.game_id === "d2r");
    expect(d2r).toMatchObject({
      game_id: "d2r",
      save_path: "/saves/d2r",
      config_status: "success",
      resolved_path: "/saves/d2r",
      last_error: "",
    });

    const bg3 = source.configured_games.find((g: { game_id: string }) => g.game_id === "bg3");
    expect(bg3).toMatchObject({
      game_id: "bg3",
      save_path: "/saves/bg3",
      config_status: "error",
      last_error: "path not found",
    });
  });
});
