import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll, getOAuthToken, seedSource } from "./helpers";

const TEST_USER = "mcp-proto-user";
const SAVE_UUID_HOLDER: { value: string } = { value: "" };
const TOKEN_HOLDER: { value: string } = { value: "" };
const SOURCE_TOKEN_HOLDER: { value: string } = { value: "" };

/**
 * Seed a save by pushing through the actual push API.
 * Uses source token auth since push now uses authenticateSource.
 */
async function pushSave(): Promise<string> {
  const resp = await SELF.fetch("https://test-host/api/v1/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SOURCE_TOKEN_HOLDER.value}`,
      "X-Game": "d2r",
      "X-Parsed-At": "2026-02-25T21:30:00Z",
    },
    body: JSON.stringify({
      identity: {
        saveName: "Hammerdin",
        gameId: "d2r",
        extra: { class: "Paladin", level: 89 },
      },
      summary: "Hammerdin, Level 89 Paladin",
      sections: {
        character_overview: {
          description: "Level, class, difficulty, play time",
          data: { name: "Hammerdin", class: "Paladin", level: 89, difficulty: "Hell" },
        },
        equipped_gear: {
          description: "All equipped items with stats, sockets, runewords",
          data: {
            helmet: { name: "Harlequin Crest", base: "Shako" },
            body_armor: { name: "Enigma", base: "Mage Plate" },
          },
        },
      },
    }),
  });
  expect(resp.status).toBe(201);
  const body = await resp.json<{ save_uuid: string }>();
  return body.save_uuid;
}

function mcpRequest(method: string, id?: number, params?: unknown): Request {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (id !== undefined) body.id = id;
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
  const contentType = resp.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    return resp.json();
  }

  // Streamable HTTP may return SSE — parse the first data event
  if (contentType.includes("text/event-stream")) {
    const text = await resp.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        return JSON.parse(line.slice(6));
      }
    }
    throw new Error(`No data event in SSE response: ${text}`);
  }

  throw new Error(`Unexpected content type: ${contentType}`);
}

describe("MCP Protocol", () => {
  beforeEach(async () => {
    await cleanAll();
    const source = await seedSource(TEST_USER);
    SOURCE_TOKEN_HOLDER.value = source.sourceToken;
    TOKEN_HOLDER.value = await getOAuthToken(TEST_USER);
    SAVE_UUID_HOLDER.value = await pushSave();
  });

  it("handles initialize handshake", async () => {
    const resp = await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );
    expect(resp.status).toBe(200);

    const body = (await parseJsonResponse(resp)) as {
      jsonrpc: string;
      id: number;
      result: { protocolVersion: string; capabilities: unknown; serverInfo: unknown };
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.protocolVersion).toBeDefined();
    expect(body.result.serverInfo).toEqual({ name: "savecraft", version: "dev" });
    expect(body.result.capabilities).toBeDefined();
  });

  it("accepts initialized notification", async () => {
    // Initialize first
    await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );

    const resp = await SELF.fetch(mcpRequest("notifications/initialized"));
    // Notifications return 202 or 200 with no body
    expect([200, 202, 204]).toContain(resp.status);
  });

  it("lists tools via tools/list", async () => {
    // Initialize first
    await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );

    const resp = await SELF.fetch(mcpRequest("tools/list", 2));
    expect(resp.status).toBe(200);

    const body = (await parseJsonResponse(resp)) as {
      result: { tools: { name: string; description: string }[] };
    };
    const toolNames = body.result.tools.map((t) => t.name).toSorted((a, b) => a.localeCompare(b));
    expect(toolNames).toEqual([
      "create_note",
      "delete_note",
      "get_note",
      "get_save",
      "get_section",
      "get_section_diff",
      "get_setup_help",
      "list_games",
      "query_reference",
      "refresh_save",
      "search_saves",
      "update_note",
    ]);
  });

  it("calls list_games and returns seeded data grouped by game", async () => {
    // Initialize
    await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );

    const resp = await SELF.fetch(
      mcpRequest("tools/call", 3, {
        name: "list_games",
        arguments: {},
      }),
    );
    expect(resp.status).toBe(200);

    const body = (await parseJsonResponse(resp)) as {
      result: { content: { type: string; text: string }[] };
    };
    const data = JSON.parse(body.result.content[0]!.text) as {
      games: {
        game_id: string;
        game_name: string;
        saves: { save_id: string; name: string }[];
      }[];
    };
    expect(data.games.length).toBeGreaterThanOrEqual(1);

    const d2r = data.games.find((g) => g.game_id === "d2r");
    expect(d2r).toBeDefined();
    const save = d2r!.saves.find((s) => s.save_id === SAVE_UUID_HOLDER.value);
    expect(save).toBeDefined();
    expect(save!.name).toBe("Hammerdin");
  });

  it("calls get_section and returns section data", async () => {
    // Initialize
    await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );

    const resp = await SELF.fetch(
      mcpRequest("tools/call", 4, {
        name: "get_section",
        arguments: {
          save_id: SAVE_UUID_HOLDER.value,
          sections: ["equipped_gear"],
        },
      }),
    );
    expect(resp.status).toBe(200);

    const body = (await parseJsonResponse(resp)) as {
      result: { content: { type: string; text: string }[]; isError?: boolean };
    };
    expect(body.result.isError).toBeUndefined();

    const data = JSON.parse(body.result.content[0]!.text) as {
      data: { helmet: { name: string } };
    };
    expect(data.data.helmet.name).toBe("Harlequin Crest");
  });

  it("rejects MCP requests without auth", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      }),
    );
    expect(resp.status).toBe(401);
  });

  it("list_games includes reference modules from seeded manifest", async () => {
    // Seed a manifest with reference modules
    const manifest = {
      game_id: "d2r",
      name: "Diablo II: Resurrected",
      reference: {
        modules: {
          drop_calc: {
            name: "Drop Calculator",
            description: "Compute drop probabilities",
          },
        },
      },
    };
    await env.PLUGINS.put("plugins/d2r/manifest.json", JSON.stringify(manifest));

    await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );

    const resp = await SELF.fetch(
      mcpRequest("tools/call", 10, {
        name: "list_games",
        arguments: {},
      }),
    );
    expect(resp.status).toBe(200);

    const body = (await parseJsonResponse(resp)) as {
      result: { content: { type: string; text: string }[]; isError?: boolean };
    };
    expect(body.result.isError).toBeUndefined();

    const data = JSON.parse(body.result.content[0]!.text) as {
      games: {
        game_id: string;
        references?: { id: string; name: string }[];
      }[];
    };
    const d2r = data.games.find((g) => g.game_id === "d2r");
    expect(d2r).toBeDefined();
    expect(d2r!.references).toBeDefined();
    expect(d2r!.references).toHaveLength(1);
    expect(d2r!.references![0]!.id).toBe("drop_calc");
    expect(d2r!.references![0]!.name).toBe("Drop Calculator");
  });

  it("list_games filters by game name substring", async () => {
    // Seed two manifests with reference modules
    const d2rManifest = {
      game_id: "d2r",
      name: "Diablo II",
      reference: { modules: { drop_calc: { name: "Drop Calc", description: "..." } } },
    };
    const otherManifest = {
      game_id: "poe",
      name: "Path of Exile",
      reference: { modules: { dps_calc: { name: "DPS Calc", description: "..." } } },
    };
    await env.PLUGINS.put("plugins/d2r/manifest.json", JSON.stringify(d2rManifest));
    await env.PLUGINS.put("plugins/poe/manifest.json", JSON.stringify(otherManifest));

    await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );

    const resp = await SELF.fetch(
      mcpRequest("tools/call", 12, {
        name: "list_games",
        arguments: { filter: "diablo" },
      }),
    );
    expect(resp.status).toBe(200);

    const body = (await parseJsonResponse(resp)) as {
      result: { content: { type: string; text: string }[] };
    };
    const data = JSON.parse(body.result.content[0]!.text) as {
      games: { game_id: string }[];
    };
    expect(data.games).toHaveLength(1);
    expect(data.games[0]!.game_id).toBe("d2r");
  });

  it("query_reference returns error for unknown game", async () => {
    await SELF.fetch(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );

    const resp = await SELF.fetch(
      mcpRequest("tools/call", 13, {
        name: "query_reference",
        arguments: { game_id: "nonexistent", module: "drop_calc", query: "{}" },
      }),
    );
    expect(resp.status).toBe(200);

    const body = (await parseJsonResponse(resp)) as {
      result: { content: { type: string; text: string }[]; isError?: boolean };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]!.text).toContain("No reference module found");
  });
});
