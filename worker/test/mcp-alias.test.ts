import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, getOAuthToken, seedSource } from "./helpers";

const TEST_USER = "mcp-alias-user";
const TOKEN_HOLDER: { value: string } = { value: "" };

function mcpRequest(method: string, id: number, params?: unknown): Request {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method, id };
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

async function parseJsonResponse(resp: Response): Promise<unknown> {
  const ct = resp.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) return resp.json();
  if (ct.includes("text/event-stream")) {
    const text = await resp.text();
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) return JSON.parse(line.slice(6));
    }
    throw new Error(`No data event in SSE response: ${text}`);
  }
  throw new Error(`Unexpected content type: ${ct}`);
}

interface CallResult {
  content?: { type: string; text: string }[];
  isError?: boolean;
  structuredContent?: unknown;
}

async function initialize(): Promise<void> {
  await SELF.fetch(
    mcpRequest("initialize", 1, {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "alias-test", version: "1.0.0" },
    }),
  );
}

async function callTool(
  id: number,
  name: string,
  args: Record<string, unknown>,
): Promise<CallResult> {
  const resp = await SELF.fetch(mcpRequest("tools/call", id, { name, arguments: args }));
  const body = (await parseJsonResponse(resp)) as { result: CallResult };
  return body.result;
}

/** Extract the error text from a single-query error response (collapsed by unwrapSingleQueryResult). */
function singleQueryError(result: CallResult): string {
  expect(result.isError).toBe(true);
  return result.content?.[0]?.text ?? "";
}

describe("MCP game_id alias normalization", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedSource(TEST_USER);
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
    await initialize();
  });

  it("query_reference normalizes mtga to magic before dispatch", async () => {
    // Pick a module that does NOT exist for magic so we get the not-found error,
    // which echoes the canonical game_id back. If the alias is wired, we see "magic";
    // if not, we'd see "mtga" because normalization didn't happen.
    const result = await callTool(10, "query_reference", {
      game_id: "mtga",
      module: "_does_not_exist_alias_probe",
      queries: [{ label: "probe" }],
    });

    const err = singleQueryError(result);
    expect(err).toContain('for game "magic"');
    expect(err).not.toContain('for game "mtga"');
  });

  it("query_reference normalizes mtg typo to magic before dispatch", async () => {
    const result = await callTool(11, "query_reference", {
      game_id: "mtg",
      module: "_does_not_exist_alias_probe",
      queries: [{ label: "probe" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain('for game "magic"');
    expect(err).not.toContain('for game "mtg"');
  });

  it("show_reference normalizes mtga to magic before dispatch", async () => {
    // evolution_tracker is in VISUAL_MODULES (factorio's), so show_reference passes
    // the visual gate and delegates to handleQueryReference. The not-found error
    // then surfaces the (post-normalization) gameId.
    const result = await callTool(12, "show_reference", {
      game_id: "mtga",
      module: "evolution_tracker",
      queries: [{ label: "probe" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain('for game "magic"');
    expect(err).not.toContain('for game "mtga"');
  });

  it("query_reference leaves canonical magic untouched", async () => {
    const result = await callTool(13, "query_reference", {
      game_id: "magic",
      module: "_does_not_exist_alias_probe",
      queries: [{ label: "probe" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain('for game "magic"');
  });

  it("query_reference leaves unrelated game_id untouched", async () => {
    const result = await callTool(14, "query_reference", {
      game_id: "rimworld",
      module: "_does_not_exist_alias_probe",
      queries: [{ label: "probe" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain('for game "rimworld"');
  });
});
