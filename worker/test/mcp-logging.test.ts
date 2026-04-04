import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { identifyMcpClient } from "../src/mcp/handler";

import { cleanAll, getOAuthToken } from "./helpers";

const TEST_USER = "mcp-logging-user";
const TOKEN_HOLDER: { value: string } = { value: "" };

function mcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options?: { userAgent?: string },
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN_HOLDER.value}`,
    Accept: "application/json, text/event-stream",
  };
  if (options?.userAgent) headers["User-Agent"] = options.userAgent;
  return new Request("https://test-host/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
}

describe("MCP Tool Call Logging", () => {
  beforeEach(async () => {
    await cleanAll();
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
  });

  it("logs a tool call to mcp_tool_calls", async () => {
    const resp = await SELF.fetch(mcpToolCall("list_games", {}));
    expect(resp.status).toBe(200);

    const rows = await env.DB.prepare(
      "SELECT user_uuid, tool_name, params, response_size, is_error, duration_ms, mcp_client FROM mcp_tool_calls WHERE user_uuid = ?",
    )
      .bind(TEST_USER)
      .all();

    expect(rows.results).toHaveLength(1);
    const row = rows.results[0]!;
    expect(row.user_uuid).toBe(TEST_USER);
    expect(row.tool_name).toBe("list_games");
    expect(row.params).toBe("{}");
    expect(row.response_size).toBeGreaterThan(0);
    expect(row.is_error).toBe(0);
    expect(row.duration_ms).toBeGreaterThanOrEqual(0);
    expect(typeof row.mcp_client).toBe("string");
  });

  it("logs is_error for unknown tools", async () => {
    const resp = await SELF.fetch(mcpToolCall("nonexistent_tool", { foo: "bar" }));
    expect(resp.status).toBe(200);

    const rows = await env.DB.prepare(
      "SELECT tool_name, is_error, params FROM mcp_tool_calls WHERE user_uuid = ?",
    )
      .bind(TEST_USER)
      .all();

    expect(rows.results).toHaveLength(1);
    const row = rows.results[0]!;
    expect(row.tool_name).toBe("nonexistent_tool");
    expect(row.is_error).toBe(1);
    expect(row.params).toBe('{"foo":"bar"}');
  });

  it("logs params as JSON", async () => {
    const resp = await SELF.fetch(mcpToolCall("list_games", { filter: "d2r" }));
    expect(resp.status).toBe(200);

    const rows = await env.DB.prepare("SELECT params FROM mcp_tool_calls WHERE user_uuid = ?")
      .bind(TEST_USER)
      .all();

    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.params).toBe('{"filter":"d2r"}');
  });

  it("does not log for non-tool-call RPC methods", async () => {
    // tools/list should NOT create a log row
    await SELF.fetch(
      new Request("https://test-host/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN_HOLDER.value}`,
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );

    const rows = await env.DB.prepare("SELECT * FROM mcp_tool_calls WHERE user_uuid = ?")
      .bind(TEST_USER)
      .all();

    expect(rows.results).toHaveLength(0);
  });
});

describe("identifyMcpClient", () => {
  it("identifies Claude Desktop", () => {
    expect(identifyMcpClient("ClaudeDesktop/1.2.3")).toBe("claude-desktop");
    expect(identifyMcpClient("Mozilla/5.0 claude-desktop")).toBe("claude-desktop");
  });

  it("identifies Claude (generic)", () => {
    expect(identifyMcpClient("Claude/1.0")).toBe("claude");
  });

  it("identifies ChatGPT/OpenAI", () => {
    expect(identifyMcpClient("ChatGPT-Agent/1.0")).toBe("chatgpt");
    expect(identifyMcpClient("OpenAI-Something/2.0")).toBe("chatgpt");
  });

  it("identifies Gemini/Google", () => {
    expect(identifyMcpClient("Gemini-MCP/1.0")).toBe("gemini");
    expect(identifyMcpClient("Google-AI-Studio/1.0")).toBe("gemini");
  });

  it("identifies Cursor", () => {
    expect(identifyMcpClient("Cursor/0.50")).toBe("cursor");
  });

  it("returns unknown for null or unrecognized", () => {
    expect(identifyMcpClient(null)).toBe("unknown");
    expect(identifyMcpClient("Mozilla/5.0")).toBe("unknown");
    expect(identifyMcpClient("")).toBe("unknown");
  });
});
