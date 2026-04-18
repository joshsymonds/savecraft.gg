import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { registerNativeModule } from "../src/reference/registry";
import type { NativeReferenceModule } from "../src/reference/types";

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

interface ListGamesResult {
  games: { game_id: string; game_name: string }[];
}

/** Parse the games payload from list_games. listGames returns textResult — JSON serialized in content[0].text. */
function listGamesData(result: CallResult): ListGamesResult {
  expect(result.isError).toBeFalsy();
  const text = result.content?.[0]?.text;
  if (text === undefined) throw new Error("expected text content from list_games");
  return JSON.parse(text) as ListGamesResult;
}

describe("MCP list_games filter tokenization", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedSource(TEST_USER);
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
    await initialize();
  });

  it("matches a single canonical game_id (rimworld regression)", async () => {
    const result = await callTool(20, "list_games", { filter: "rimworld" });
    const data = listGamesData(result);
    expect(data.games.map((g) => g.game_id)).toContain("rimworld");
  });

  it("matches a verbose multi-token filter via any token", async () => {
    // Production-observed filter that previously errored: no game has the full
    // string in id or name, but the "Magic" token alone substring-matches.
    const result = await callTool(21, "list_games", {
      filter: "Magic The Gathering Arena MTG deck cards draft",
    });
    const data = listGamesData(result);
    expect(data.games.map((g) => g.game_id)).toContain("magic");
  });

  it("matches case-insensitively across multi-word filters", async () => {
    const result = await callTool(22, "list_games", { filter: "magic the gathering" });
    const data = listGamesData(result);
    expect(data.games.map((g) => g.game_id)).toContain("magic");
  });

  it("matches an aliased single-token filter (mtga -> magic)", async () => {
    const result = await callTool(23, "list_games", { filter: "mtga" });
    const data = listGamesData(result);
    expect(data.games.map((g) => g.game_id)).toContain("magic");
  });

  it("matches when only one token in a multi-token filter is an alias", async () => {
    const result = await callTool(24, "list_games", { filter: "mtga arena cards" });
    const data = listGamesData(result);
    expect(data.games.map((g) => g.game_id)).toContain("magic");
  });

  it("returns the no-match error for a filter with zero matching tokens", async () => {
    const result = await callTool(25, "list_games", {
      filter: "totally_nonexistent_game_xyz",
    });
    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("No games matching");
  });

  it("returns the full catalog when filter is empty string", async () => {
    const result = await callTool(26, "list_games", { filter: "" });
    const data = listGamesData(result);
    // Empty filter behaves like no filter — full catalog with multiple entries.
    expect(data.games.length).toBeGreaterThan(1);
  });

  it("returns the full catalog when filter is whitespace only", async () => {
    const result = await callTool(27, "list_games", { filter: "   " });
    const data = listGamesData(result);
    expect(data.games.length).toBeGreaterThan(1);
  });
});

describe("MCP missing-queries enriched error", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedSource(TEST_USER);
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
    await initialize();
  });

  it("query_reference with no queries field returns enriched error with game_id", async () => {
    const result = await callTool(30, "query_reference", {
      game_id: "poe",
      module: "build_planner",
    });
    const err = singleQueryError(result);
    expect(err).toContain("queries is required");
    expect(err).toContain("[{label");
    expect(err).toContain('list_games(filter="poe")');
  });

  it("query_reference with empty queries array returns the same enriched error", async () => {
    const result = await callTool(31, "query_reference", {
      game_id: "poe",
      module: "build_planner",
      queries: [],
    });
    const err = singleQueryError(result);
    expect(err).toContain("queries is required");
    expect(err).toContain("[{label");
    expect(err).toContain('list_games(filter="poe")');
  });

  it("query_reference with no game_id falls back to a placeholder filter hint", async () => {
    const result = await callTool(32, "query_reference", {
      module: "build_planner",
      queries: [],
    });
    const err = singleQueryError(result);
    expect(err).toContain("queries is required");
    expect(err).toContain('list_games(filter="<game_id>")');
  });

  it("show_reference inherits the enriched error via delegation", async () => {
    const result = await callTool(33, "show_reference", {
      game_id: "poe",
      module: "build_planner",
    });
    const err = singleQueryError(result);
    expect(err).toContain("queries is required");
    expect(err).toContain('list_games(filter="poe")');
  });

  it("does not fire on valid one-query call (regression: module-not-found wins)", async () => {
    const result = await callTool(34, "query_reference", {
      game_id: "magic",
      module: "_does_not_exist_queries_probe",
      queries: [{ label: "x" }],
    });
    const err = singleQueryError(result);
    expect(err).not.toContain("queries is required");
    expect(err).toContain("not found for game");
  });
});

/**
 * Inert stub matching the NativeReferenceModule contract — execute is never
 * actually invoked in these tests because we deliberately ask for nearby names
 * that don't match. The registration's only job is to populate getNativeModules
 * so suggestModules has candidates to compare against.
 */
function stubModule(id: string): NativeReferenceModule {
  return {
    id,
    name: id,
    description: `stub module ${id}`,
    execute: () => Promise.resolve({ type: "text", content: "" }),
  };
}

describe("MCP did-you-mean for unknown modules", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedSource(TEST_USER);
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
    await initialize();
    // Production registers magic native modules at Worker boot via side-effect
    // imports; Vitest's pool-workers entry doesn't run those, so register the
    // names this suite probes for. Idempotent — overwrites are fine across runs.
    registerNativeModule("magic", stubModule("rules_search"));
    registerNativeModule("magic", stubModule("card_search"));
  });

  it("suggests rules_search when user types `rules` for magic", async () => {
    const result = await callTool(40, "query_reference", {
      game_id: "magic",
      module: "rules",
      queries: [{ label: "x" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain('not found for game "magic"');
    expect(err).toContain("Did you mean: rules_search");
  });

  it("suggests card_search for the `card_serach` typo", async () => {
    const result = await callTool(41, "query_reference", {
      game_id: "magic",
      module: "card_serach",
      queries: [{ label: "x" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain("Did you mean: card_search");
  });

  it("appends no suggestion when nothing is close enough", async () => {
    const result = await callTool(42, "query_reference", {
      game_id: "magic",
      module: "_xyzzyqqq_unrelated",
      queries: [{ label: "x" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain('not found for game "magic"');
    expect(err).not.toContain("Did you mean");
    // Existing list_games hint preserved.
    expect(err).toContain('list_games(filter="magic")');
  });

  it("matches case-insensitively for the suggestion comparison", async () => {
    const result = await callTool(43, "query_reference", {
      game_id: "magic",
      module: "RULES",
      queries: [{ label: "x" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain("Did you mean: rules_search");
  });

  it("does not suggest cross-game modules", async () => {
    // factorio has evolution_tracker; magic shouldn't get that as a suggestion
    // even when a magic query asks for something Levenshtein-close to it.
    const result = await callTool(44, "query_reference", {
      game_id: "magic",
      module: "evolution",
      queries: [{ label: "x" }],
    });
    const err = singleQueryError(result);
    expect(err).not.toContain("evolution_tracker");
  });

  it("skips suggestions when the module name is absurdly long (DoS guard)", async () => {
    // Pathological input — 2000 chars — must short-circuit before per-id
    // Levenshtein runs, so no "Did you mean" appears.
    const result = await callTool(45, "query_reference", {
      game_id: "magic",
      module: `rules${"x".repeat(2000)}`,
      queries: [{ label: "x" }],
    });
    const err = singleQueryError(result);
    expect(err).toContain("not found for game");
    expect(err).not.toContain("Did you mean");
  });
});
