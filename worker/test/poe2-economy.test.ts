import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { economyModule, resetEconomyCache } from "../../plugins/poe2/reference/economy";
import { listGames } from "../src/mcp/tools";
import type { Env } from "../src/types";

// ---------------------------------------------------------------------------
// urlOf: extract a URL string from any RequestInfo | URL value the fetch mock
// receives. Avoids unsafe-stringification lint hits on Request objects.
// ---------------------------------------------------------------------------

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

// ---------------------------------------------------------------------------
// Fake poe.ninja (PoE2) responses
// ---------------------------------------------------------------------------

const FAKE_INDEX_STATE = {
  economyLeagues: [
    { name: "Runes of Aldur" },
    { name: "Hardcore Runes of Aldur" },
    { name: "Standard" },
    { name: "Hardcore" },
  ],
  oldEconomyLeagues: [{ name: "Dawn of the Hunt" }],
  snapshotVersions: [],
  buildLeagues: [],
};

const FAKE_EXCHANGE_OVERVIEW = {
  core: {
    items: [],
    rates: { exalted: 0.02, chaos: 0.01 },
    primary: "divine",
    secondary: "chaos",
  },
  lines: [
    { id: "divine", primaryValue: 1, sparkline: { totalChange: 0, data: [1, 1, 1] } },
    {
      id: "exalted",
      primaryValue: 0.02,
      sparkline: { totalChange: 5, data: [0.018, null, 0.02] },
    },
    { id: "chaos", primaryValue: 0.01, sparkline: { totalChange: -1, data: [0.011, 0.01] } },
  ],
};

const FAKE_STASH_OVERVIEW = {
  core: {
    items: [],
    primary: "divine",
    secondary: "chaos",
  },
  lines: [
    { name: "Doomsday", primaryValue: 12.5, sparkline: { totalChange: 2, data: [10, 11, 12.5] } },
    {
      name: "Widowhail",
      primaryValue: 3,
      sparkline: { totalChange: -0.5, data: [3.5, null, 3] },
    },
  ],
};

/** Contract-mismatch fixture: lines[] entries are missing primaryValue. */
const FAKE_CONTRACT_MISMATCH_OVERVIEW = {
  core: { primary: "divine", secondary: "chaos" },
  lines: [{ id: "divine", sparkline: { totalChange: 0, data: [1] } }],
};

// ---------------------------------------------------------------------------
// Fake fetch
// ---------------------------------------------------------------------------

interface FakeFetchOptions {
  /** URL substrings whose requests should reject with a network error. */
  errorOn?: string[];
  /** Optional delay (ms) before resolving — useful for singleflight tests. */
  delayMs?: number;
}

function makeFakeFetch(options: FakeFetchOptions = {}) {
  const { errorOn = [], delayMs } = options;
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);
    if (errorOn.some((p) => url.includes(p))) {
      throw new TypeError("simulated network error");
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (url.includes("/poe2/api/data/index-state")) {
      return Response.json(FAKE_INDEX_STATE, { status: 200 });
    }
    if (url.includes("/poe2/api/economy/exchange/current/overview")) {
      return Response.json(FAKE_EXCHANGE_OVERVIEW, { status: 200 });
    }
    if (url.includes("/poe2/api/economy/stash/current/item/overview")) {
      return Response.json(FAKE_STASH_OVERVIEW, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
}

const testEnv = {} as Env;

interface StructuredResult {
  type: "structured";
  data: Record<string, unknown>;
}

function asStructured(result: unknown): StructuredResult {
  if ((result as { type?: string }).type !== "structured") {
    throw new Error(`expected structured result, got: ${JSON.stringify(result)}`);
  }
  return result as StructuredResult;
}

function textOf(result: { type: string }): string {
  if (result.type !== "text") {
    throw new Error(`expected text result, got: ${JSON.stringify(result)}`);
  }
  return (result as unknown as { content: string }).content;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("poe2 economy reference module — routing", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes Currency (exchange type) to /economy/exchange/current/overview", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "exalted", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      urlOf(c[0]).includes("/economy/exchange/"),
    );
    expect(overviewCalls.length).toBe(1);
    expect(urlOf(overviewCalls[0]![0])).toContain("type=Currency");
  });

  it("routes UniqueWeapons (stash type) to /economy/stash/current/item/overview", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "doomsday", type: "UniqueWeapons", league: "Runes of Aldur" },
      testEnv,
    );

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      urlOf(c[0]).includes("/economy/stash/current/item/overview"),
    );
    expect(overviewCalls.length).toBe(1);
    expect(urlOf(overviewCalls[0]![0])).toContain("type=UniqueWeapons");
  });

  it("URL-encodes league and type values", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "x", type: "UniqueWeapons", league: "Hardcore Runes of Aldur" },
      testEnv,
    );

    const overviewCall = mockFetch.mock.calls.find((c) =>
      urlOf(c[0]).includes("/economy/stash/current/item/overview"),
    );
    expect(overviewCall).toBeDefined();
    expect(urlOf(overviewCall![0])).toContain("league=Hardcore%20Runes%20of%20Aldur");
  });

  it("returns a helpful error listing valid types when type is missing", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute({ query: "x" }, testEnv);
    const content = textOf(result);
    expect(content).toContain("Currency");
    expect(content).toContain("UniqueWeapons");
    expect(mockFetch.mock.calls.length).toBe(0);
  });

  it("returns a helpful error listing valid types when type is unrecognized", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "x", type: "NotARealType", league: "Runes of Aldur" },
      testEnv,
    );
    const content = textOf(result);
    expect(content).toContain("NotARealType");
    // Lists both endpoint families since we can't infer which the caller meant.
    expect(content).toContain("Currency");
    expect(content).toContain("UniqueWeapons");
    expect(mockFetch.mock.calls.length).toBe(0);
  });

  it("returns text error when query parameter is missing", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute({ type: "Currency" }, testEnv);
    const content = textOf(result);
    expect(content).toContain("query");
    expect(mockFetch.mock.calls.length).toBe(0);
  });
});

describe("poe2 economy reference module — league discovery", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("auto-detects current league from index-state when league is omitted", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "doomsday", type: "UniqueWeapons" },
      testEnv,
    );

    const indexCalls = mockFetch.mock.calls.filter((c) =>
      urlOf(c[0]).includes("/poe2/api/data/index-state"),
    );
    expect(indexCalls.length).toBe(1);

    const data = asStructured(result).data;
    expect(data.league).toBe("Runes of Aldur");

    const overviewCall = mockFetch.mock.calls.find((c) =>
      urlOf(c[0]).includes("/economy/stash/current/item/overview"),
    );
    expect(urlOf(overviewCall![0])).toContain("league=Runes%20of%20Aldur");
  });

  it("passes an explicit league through verbatim, case preserved", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "doomsday", type: "UniqueWeapons", league: "Hardcore Runes of Aldur" },
      testEnv,
    );

    const data = asStructured(result).data;
    expect(data.league).toBe("Hardcore Runes of Aldur");
    const overviewCall = mockFetch.mock.calls.find((c) =>
      urlOf(c[0]).includes("/economy/stash/current/item/overview"),
    );
    expect(urlOf(overviewCall![0])).toContain("league=Hardcore%20Runes%20of%20Aldur");
  });

  it("rejects a league whose case does not match exactly (case-sensitive names)", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "x", type: "UniqueWeapons", league: "runes of aldur" },
      testEnv,
    );
    const content = textOf(result);
    expect(content.toLowerCase()).toContain("unknown league");
    expect(content).toContain("Runes of Aldur");
    const overviewCalls = mockFetch.mock.calls.filter((c) => urlOf(c[0]).includes("/economy/"));
    expect(overviewCalls.length).toBe(0);
  });

  it("caches index-state across calls within TTL", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute({ query: "a", type: "UniqueWeapons" }, testEnv);
    await economyModule.execute({ query: "b", type: "UniqueWeapons" }, testEnv);

    const indexCalls = mockFetch.mock.calls.filter((c) =>
      urlOf(c[0]).includes("/poe2/api/data/index-state"),
    );
    expect(indexCalls.length).toBe(1);
  });

  it("trusts a supplied league verbatim when index-state is unreachable", async () => {
    const mockFetch = vi.fn(makeFakeFetch({ errorOn: ["/poe2/api/data/index-state"] }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "doomsday", type: "UniqueWeapons", league: "Some League" },
      testEnv,
    );
    const data = asStructured(result).data;
    expect(data.league).toBe("Some League");
  });

  it("returns the unavailable error when league is omitted and index-state is unreachable", async () => {
    const mockFetch = vi.fn(makeFakeFetch({ errorOn: ["/poe2/api/data/index-state"] }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute({ query: "x", type: "UniqueWeapons" }, testEnv);
    const content = textOf(result);
    expect(content.toLowerCase()).toContain("unavailable");
  });
});

describe("poe2 economy reference module — price lookup + normalization", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns divine-labeled, league-attributed exchange prices from fixtures", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "exalted", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );

    const data = asStructured(result).data;
    expect(data.league).toBe("Runes of Aldur");
    expect(data.denomination).toBe("divine");

    const items = data.items as Record<string, unknown>[];
    expect(items.length).toBe(1);
    const exalted = items[0]!;
    expect(exalted.name).toBe("exalted");
    expect(exalted.price).toBe(0.02);
    expect(exalted.denomination).toBe("divine");
    expect(exalted.change_7d).toBe(5);
    expect(exalted.sparkline).toEqual([0.018, 0, 0.02]);
  });

  it("returns divine-labeled, league-attributed stash prices from fixtures", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "doomsday", type: "UniqueWeapons", league: "Runes of Aldur" },
      testEnv,
    );

    const data = asStructured(result).data;
    expect(data.league).toBe("Runes of Aldur");
    expect(data.denomination).toBe("divine");

    const items = data.items as Record<string, unknown>[];
    expect(items.length).toBe(1);
    const doomsday = items[0]!;
    expect(doomsday.name).toBe("Doomsday");
    expect(doomsday.price).toBe(12.5);
    expect(doomsday.denomination).toBe("divine");
    expect(doomsday.change_7d).toBe(2);
    expect(doomsday.sparkline).toEqual([10, 11, 12.5]);
  });

  it("substring-matches case-insensitively across both endpoint families", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const exchangeResult = await economyModule.execute(
      { query: "EXALT", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    expect((asStructured(exchangeResult).data.items as unknown[]).length).toBe(1);

    const stashResult = await economyModule.execute(
      { query: "doom", type: "UniqueWeapons", league: "Runes of Aldur" },
      testEnv,
    );
    expect((asStructured(stashResult).data.items as unknown[]).length).toBe(1);
  });

  it("replaces null sparkline entries with 0", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "widowhail", type: "UniqueWeapons", league: "Runes of Aldur" },
      testEnv,
    );
    const items = asStructured(result).data.items as Record<string, unknown>[];
    expect(items[0]!.sparkline).toEqual([3.5, 0, 3]);
  });
});

describe("poe2 economy reference module — contract validation", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the unavailable error when the overview response fails contract validation (missing primaryValue)", async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url.includes("/poe2/api/data/index-state")) {
        return Promise.resolve(Response.json(FAKE_INDEX_STATE, { status: 200 }));
      }
      return Promise.resolve(Response.json(FAKE_CONTRACT_MISMATCH_OVERVIEW, { status: 200 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "x", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    const content = textOf(result);
    expect(content.toLowerCase()).toContain("unavailable");
  });

  it("returns the unavailable error when the overview endpoint returns non-OK (mocked 500), and negative-caches the failure", async () => {
    const mockFetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = urlOf(input);
      if (url.includes("/poe2/api/data/index-state")) {
        return Promise.resolve(Response.json(FAKE_INDEX_STATE, { status: 200 }));
      }
      return Promise.resolve(new Response("server err", { status: 500 }));
    });
    vi.stubGlobal("fetch", mockFetch);

    const r1 = await economyModule.execute(
      { query: "x", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    const r2 = await economyModule.execute(
      { query: "y", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    expect(textOf(r1).toLowerCase()).toContain("unavailable");
    expect(textOf(r2).toLowerCase()).toContain("unavailable");

    // Second call within the failure TTL must not trigger a new overview fetch.
    const overviewCalls = mockFetch.mock.calls.filter((c) => urlOf(c[0]).includes("/economy/"));
    expect(overviewCalls.length).toBe(1);
  });

  it("returns the unavailable error when the overview endpoint throws (network error), without poisoning the cache", async () => {
    let shouldFail = true;
    const mockFetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = urlOf(input);
      if (shouldFail && url.includes("/economy/exchange/current/overview")) {
        throw new TypeError("simulated network error");
      }
      return makeFakeFetch()(input);
    });
    vi.stubGlobal("fetch", mockFetch);

    const failed = await economyModule.execute(
      { query: "x", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    expect(textOf(failed).toLowerCase()).toContain("unavailable");

    shouldFail = false;
    const ok = await economyModule.execute(
      { query: "exalted", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    expect((asStructured(ok).data.items as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("poe2 economy reference module — success caching + singleflight", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches overview by (family, league, type) within TTL", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "exalted", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    const beforeSecond = mockFetch.mock.calls.length;
    await economyModule.execute(
      { query: "divine", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    expect(mockFetch.mock.calls.length).toBe(beforeSecond);
  });

  it("does NOT collide exchange and stash caches for the same league", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "exalted", type: "Currency", league: "Runes of Aldur" },
      testEnv,
    );
    await economyModule.execute(
      { query: "doomsday", type: "UniqueWeapons", league: "Runes of Aldur" },
      testEnv,
    );

    const overviewCalls = mockFetch.mock.calls.filter((c) => urlOf(c[0]).includes("/economy/"));
    expect(overviewCalls.length).toBe(2);
  });

  it("singleflight: concurrent calls with the same key trigger one fetch", async () => {
    const mockFetch = vi.fn(makeFakeFetch({ delayMs: 50 }));
    vi.stubGlobal("fetch", mockFetch);

    const [r1, r2] = await Promise.all([
      economyModule.execute(
        { query: "exalted", type: "Currency", league: "Runes of Aldur" },
        testEnv,
      ),
      economyModule.execute(
        { query: "divine", type: "Currency", league: "Runes of Aldur" },
        testEnv,
      ),
    ]);

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      urlOf(c[0]).includes("/economy/exchange/current/overview"),
    );
    expect(overviewCalls.length).toBe(1);

    expect(asStructured(r1).data.query).toBe("exalted");
    expect(asStructured(r2).data.query).toBe("divine");
  });
});

// ---------------------------------------------------------------------------
// list_games (MCP): the poe2 economy module must surface via the native
// module registry, with a full parameter schema when the caller filters.
// ---------------------------------------------------------------------------

interface ListedReference {
  module: string;
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

interface ListedGame {
  game_id: string;
  saves: unknown[];
  references?: ListedReference[];
  reference_schemas?: string;
}

function gamesFrom(result: { content: { text: string }[] }): ListedGame[] {
  return (JSON.parse(result.content[0]!.text) as { games: ListedGame[] }).games;
}

describe("poe2 economy reference module — list_games (MCP)", () => {
  it("appears filtered by game with a full parameter schema", async () => {
    const result = await listGames(env.DB, "no-saves-user-poe2", "poe2");
    const poe2 = gamesFrom(result).find((g) => g.game_id === "poe2");
    expect(poe2).toBeDefined();
    expect(poe2!.saves).toEqual([]);

    const economy = poe2!.references?.find((r) => r.module === "economy");
    expect(economy).toBeDefined();
    expect(economy!.name).toBe("Economy Prices");
    expect(economy!.parameters).toBeDefined();
    expect(economy!.parameters).toHaveProperty("query");
    expect(economy!.parameters).toHaveProperty("type");
    expect(economy!.parameters).toHaveProperty("league");
  });

  it("omits the parameter schema (but not the module) when unfiltered", async () => {
    const result = await listGames(env.DB, "no-saves-user-poe2");
    const poe2 = gamesFrom(result).find((g) => g.game_id === "poe2");
    expect(poe2).toBeDefined();

    const economy = poe2!.references?.find((r) => r.module === "economy");
    expect(economy).toBeDefined();
    expect(economy!.parameters).toBeUndefined();
    expect(poe2!.reference_schemas).toContain("filter");
  });
});
