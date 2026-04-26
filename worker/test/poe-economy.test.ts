import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  economyModule,
  resetEconomyCache,
} from "../../plugins/poe/reference/economy";
import type { Env } from "../src/types";

// ---------------------------------------------------------------------------
// Fake poe.ninja responses
// ---------------------------------------------------------------------------

const FAKE_INDEX_STATE = {
  economyLeagues: [
    { name: "Mirage", url: "mirage", displayName: "Mirage" },
    { name: "Hardcore Mirage", url: "miragehc", displayName: "Hardcore Mirage" },
    { name: "Standard", url: "standard", displayName: "Standard" },
    { name: "Hardcore", url: "hardcore", displayName: "Hardcore" },
  ],
  oldEconomyLeagues: [
    { name: "Phrecia 2.0", url: "phrecia2.0", displayName: "Phrecia 2.0" },
    { name: "Keepers", url: "keepers", displayName: "Keepers" },
  ],
  snapshotVersions: [],
};

const FAKE_ITEM_OVERVIEW = {
  lines: [
    {
      id: 1,
      name: "Headhunter",
      icon: "https://example.com/hh.png",
      baseType: "Leather Belt",
      levelRequired: 40,
      itemClass: 5,
      itemType: "Belt",
      sparkLine: { totalChange: 12.5, data: [0, 1, 2, 3, 4, 5, 12.5] },
      lowConfidenceSparkLine: { totalChange: 12.5, data: [0, 1, 2, 3, 4, 5, 12.5] },
      explicitModifiers: [
        { text: "+(50-65) to all Attributes", optional: false },
      ],
      implicitModifiers: [],
      mutatedModifiers: [],
      flavourText: "We were strong once.",
      chaosValue: 800,
      exaltedValue: 60,
      divineValue: 4.0,
      count: 50,
      detailsId: "headhunter",
      tradeInfo: [],
      listingCount: 100,
    },
    {
      id: 2,
      name: "Inpulsa's Broken Heart",
      icon: "https://example.com/inpulsa.png",
      baseType: "Sadist Garb",
      sparkLine: { totalChange: -2.0, data: [0, null, -1, -1.5, null, -2, -2] },
      lowConfidenceSparkLine: { totalChange: -2.0, data: [] },
      explicitModifiers: [],
      implicitModifiers: [],
      mutatedModifiers: [],
      chaosValue: 5,
      exaltedValue: 0.4,
      divineValue: 0.025,
      count: 5,
      detailsId: "inpulsas",
      listingCount: 5,
    },
  ],
};

const FAKE_CURRENCY_OVERVIEW = {
  lines: [
    {
      currencyTypeName: "Mirror of Kalandra",
      pay: { value: 0.000001, count: 30, listing_count: 50 },
      receive: { value: 1000000, count: 20, listing_count: 90 },
      paySparkLine: { totalChange: 0, data: [] },
      receiveSparkLine: { totalChange: -5.0, data: [0, 1, -2, -5] },
      lowConfidencePaySparkLine: { totalChange: 0, data: [] },
      lowConfidenceReceiveSparkLine: { totalChange: -5.0, data: [0, 1, -2, -5] },
      chaosEquivalent: 950000,
      detailsId: "mirror-of-kalandra",
    },
    {
      currencyTypeName: "Chaos Orb",
      pay: { value: 1, count: 100, listing_count: 1000 },
      receive: { value: 1, count: 100, listing_count: 1000 },
      paySparkLine: { totalChange: 0, data: [0, 0, 0] },
      receiveSparkLine: { totalChange: 0, data: [0, 0, 0] },
      lowConfidencePaySparkLine: { totalChange: 0, data: [0, 0, 0] },
      lowConfidenceReceiveSparkLine: { totalChange: 0, data: [0, 0, 0] },
      chaosEquivalent: 1,
      detailsId: "chaos-orb",
    },
  ],
  currencyDetails: [],
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
    const url = typeof input === "string" ? input : input.toString();
    if (errorOn.some((p) => url.includes(p))) {
      throw new TypeError("simulated network error");
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (url.includes("/poe1/api/data/index-state")) {
      return Response.json(FAKE_INDEX_STATE, { status: 200 });
    }
    if (url.includes("/poe1/api/economy/stash/current/currency/overview")) {
      return Response.json(FAKE_CURRENCY_OVERVIEW, { status: 200 });
    }
    if (url.includes("/poe1/api/economy/stash/current/item/overview")) {
      return Response.json(FAKE_ITEM_OVERVIEW, { status: 200 });
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
    throw new Error(
      `expected structured result, got: ${JSON.stringify(result)}`,
    );
  }
  return result as StructuredResult;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("economy reference module — path routing", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes Currency type to /currency/overview", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "Mirror", type: "Currency", league: "Standard" },
      testEnv,
    );

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/economy/stash/current/"),
    );
    expect(overviewCalls.length).toBe(1);
    expect(String(overviewCalls[0]![0])).toContain("/currency/overview");
    expect(String(overviewCalls[0]![0])).not.toContain("/item/overview");
  });

  it("routes Fragment type to /currency/overview", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "Voidborn", type: "Fragment", league: "Standard" },
      testEnv,
    );

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/economy/stash/current/"),
    );
    expect(overviewCalls.length).toBe(1);
    expect(String(overviewCalls[0]![0])).toContain("/currency/overview");
  });

  it.each([
    "UniqueArmour",
    "UniqueWeapon",
    "UniqueAccessory",
    "UniqueFlask",
    "UniqueJewel",
    "SkillGem",
    "DivinationCard",
    "Oil",
    "Fossil",
    "Essence",
    "Scarab",
  ])("routes non-currency type %s to /item/overview", async (type) => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "x", type, league: "Standard" },
      testEnv,
    );

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/economy/stash/current/"),
    );
    expect(overviewCalls.length).toBe(1);
    expect(String(overviewCalls[0]![0])).toContain("/item/overview");
    expect(String(overviewCalls[0]![0])).not.toContain("/currency/overview");
    expect(String(overviewCalls[0]![0])).toContain(`type=${type}`);
  });

  it("URL-encodes league and type values", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "x", type: "UniqueArmour", league: "Hardcore Mirage" },
      testEnv,
    );

    const overviewCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("/economy/stash/current/"),
    );
    expect(overviewCall).toBeDefined();
    expect(String(overviewCall![0])).toContain("league=Hardcore%20Mirage");
  });
});

describe("economy reference module — league discovery", () => {
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
      { query: "Headhunter", type: "UniqueArmour" },
      testEnv,
    );

    const indexCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/poe1/api/data/index-state"),
    );
    expect(indexCalls.length).toBe(1);

    const data = asStructured(result).data;
    expect(data.league).toBe("Mirage");

    const overviewCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes("/economy/stash/current/"),
    );
    expect(String(overviewCall![0])).toContain("league=Mirage");
  });

  it("caches index-state across calls within TTL", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute({ query: "a", type: "UniqueArmour" }, testEnv);
    await economyModule.execute({ query: "b", type: "UniqueArmour" }, testEnv);

    const indexCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/poe1/api/data/index-state"),
    );
    expect(indexCalls.length).toBe(1);
  });

  it("returns a text error listing valid leagues when supplied league is invalid", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "x", type: "UniqueArmour", league: "Settlers" },
      testEnv,
    );

    expect(result.type).toBe("text");
    const content = (result as { type: "text"; content: string }).content;
    expect(content.toLowerCase()).toContain("settlers");
    expect(content).toContain("Mirage");
    expect(content).toContain("Standard");
    // No overview fetch attempted.
    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/economy/stash/current/"),
    );
    expect(overviewCalls.length).toBe(0);
  });

  it("returns instructive text when league is omitted and index-state is unreachable", async () => {
    const mockFetch = vi.fn(makeFakeFetch({ errorOn: ["/poe1/api/data/index-state"] }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "x", type: "UniqueArmour" },
      testEnv,
    );

    expect(result.type).toBe("text");
    const content = (result as { type: "text"; content: string }).content;
    expect(content.toLowerCase()).toMatch(/specify.*league|league.*explicitly/);
  });
});

describe("economy reference module — response normalization", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes item shape: name, chaos_value, divine_value, change_7d from sparkLine.totalChange, sparkline nulls→0, confidence from listingCount", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "Headhunter", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );

    const data = asStructured(result).data;
    const items = data.items as Record<string, unknown>[];
    expect(items.length).toBe(1);
    const hh = items[0]!;
    expect(hh.name).toBe("Headhunter");
    expect(hh.type).toBe("UniqueArmour");
    expect(hh.base_type).toBe("Leather Belt");
    expect(hh.chaos_value).toBe(800);
    expect(hh.divine_value).toBe(4.0);
    expect(hh.change_7d).toBe(12.5);
    expect(hh.confidence).toBe("high");
    expect(hh.listings).toBe(100);
    expect(hh.icon_url).toBe("https://example.com/hh.png");
    expect(hh.sparkline).toEqual([0, 1, 2, 3, 4, 5, 12.5]);
    expect(hh.level_required).toBe(40);
    const mods = hh.mods as {
      implicit: string[];
      explicit: string[];
      mutated: string[];
      flavour?: string;
    };
    expect(mods.explicit).toEqual(["+(50-65) to all Attributes"]);
    expect(mods.implicit).toEqual([]);
    expect(mods.mutated).toEqual([]);
    expect(mods.flavour).toBe("We were strong once.");
  });

  it("normalizes item with low listing count to confidence='low' and replaces sparkline nulls with 0", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "Inpulsa", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    const items = asStructured(result).data.items as Record<string, unknown>[];
    const inpulsa = items[0]!;
    expect(inpulsa.confidence).toBe("low");
    expect(inpulsa.sparkline).toEqual([0, 0, -1, -1.5, 0, -2, -2]);
    expect(inpulsa.change_7d).toBe(-2.0);
    expect(inpulsa.mods).toBeUndefined();
    expect(inpulsa.level_required).toBeUndefined();
  });

  it("normalizes currency shape: currencyTypeName→name, chaosEquivalent→chaos_value, no divine_value, change_7d from receiveSparkLine.totalChange, listings from receive.listing_count", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "Mirror", type: "Currency", league: "Standard" },
      testEnv,
    );

    const data = asStructured(result).data;
    const items = data.items as Record<string, unknown>[];
    expect(items.length).toBe(1);
    const mirror = items[0]!;
    expect(mirror.name).toBe("Mirror of Kalandra");
    expect(mirror.type).toBe("Currency");
    expect(mirror.chaos_value).toBe(950000);
    expect(mirror.divine_value).toBeUndefined();
    expect(mirror.change_7d).toBe(-5.0);
    expect(mirror.listings).toBe(90);
    expect(mirror.confidence).toBe("high");
    expect(mirror.sparkline).toEqual([0, 1, -2, -5]);
    expect(mirror.level_required).toBeUndefined();
    expect(mirror.mods).toBeUndefined();
  });

  it("substring-matches case-insensitively across both shapes", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const a = await economyModule.execute(
      { query: "head", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    expect((asStructured(a).data.items as unknown[]).length).toBe(1);

    const b = await economyModule.execute(
      { query: "ORB", type: "Currency", league: "Standard" },
      testEnv,
    );
    expect((asStructured(b).data.items as unknown[]).length).toBe(1);
  });
});

describe("economy reference module — caching + singleflight", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches overview by (path, league, type) within TTL", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    await economyModule.execute(
      { query: "Headhunter", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    const beforeSecond = mockFetch.mock.calls.length;
    await economyModule.execute(
      { query: "different", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    expect(mockFetch.mock.calls.length).toBe(beforeSecond);
  });

  it("does NOT collide currency and item caches for the same league", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    // Item endpoint fetch
    await economyModule.execute(
      { query: "Headhunter", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    // Currency endpoint fetch — different path; must hit network despite same league.
    await economyModule.execute(
      { query: "Mirror", type: "Currency", league: "Standard" },
      testEnv,
    );

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/economy/stash/current/"),
    );
    expect(overviewCalls.length).toBe(2);
    expect(String(overviewCalls[0]![0])).toContain("/item/overview");
    expect(String(overviewCalls[1]![0])).toContain("/currency/overview");
  });

  it("singleflight: concurrent calls with the same key trigger one fetch", async () => {
    const mockFetch = vi.fn(makeFakeFetch({ delayMs: 50 }));
    vi.stubGlobal("fetch", mockFetch);

    const [r1, r2] = await Promise.all([
      economyModule.execute(
        { query: "Headhunter", type: "UniqueArmour", league: "Standard" },
        testEnv,
      ),
      economyModule.execute(
        { query: "Inpulsa", type: "UniqueArmour", league: "Standard" },
        testEnv,
      ),
    ]);

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/economy/stash/current/item/overview"),
    );
    expect(overviewCalls.length).toBe(1);

    expect(asStructured(r1).data.query).toBe("Headhunter");
    expect(asStructured(r2).data.query).toBe("Inpulsa");
  });
});

describe("economy reference module — error paths", () => {
  beforeEach(() => {
    resetEconomyCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a text error when the overview endpoint throws", async () => {
    const mockFetch = vi.fn(
      makeFakeFetch({ errorOn: ["/economy/stash/current/item/overview"] }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "x", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    expect(result.type).toBe("text");
    const content = (result as { type: "text"; content: string }).content;
    expect(content.toLowerCase()).toMatch(/unavailable|error/);
  });

  it("does not poison cache after a network failure — next call retries", async () => {
    let shouldFail = true;
    const mockFetch = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        if (
          shouldFail &&
          url.includes("/economy/stash/current/item/overview")
        ) {
          throw new TypeError("simulated network error");
        }
        return makeFakeFetch()(input);
      },
    );
    vi.stubGlobal("fetch", mockFetch);

    const failed = await economyModule.execute(
      { query: "x", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    expect(failed.type).toBe("text");

    shouldFail = false;
    const ok = await economyModule.execute(
      { query: "Headhunter", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    expect(ok.type).toBe("structured");
    expect(
      (asStructured(ok).data.items as unknown[]).length,
    ).toBeGreaterThan(0);
  });

  it("returns a text error when the overview endpoint returns non-OK", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/poe1/api/data/index-state")) {
        return Response.json(FAKE_INDEX_STATE, { status: 200 });
      }
      return new Response("server err", { status: 500 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute(
      { query: "x", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    expect(result.type).toBe("text");
  });

  it("negative-caches non-OK overview responses so repeated callers don't slam upstream", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/poe1/api/data/index-state")) {
        return Response.json(FAKE_INDEX_STATE, { status: 200 });
      }
      return new Response("server err", { status: 500 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const r1 = await economyModule.execute(
      { query: "x", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    const r2 = await economyModule.execute(
      { query: "y", type: "UniqueArmour", league: "Standard" },
      testEnv,
    );
    expect(r1.type).toBe("text");
    expect(r2.type).toBe("text");

    const overviewCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/economy/stash/current/"),
    );
    expect(overviewCalls.length).toBe(1);
  });

  it("returns text error when query parameter is missing", async () => {
    const mockFetch = vi.fn(makeFakeFetch());
    vi.stubGlobal("fetch", mockFetch);

    const result = await economyModule.execute({}, testEnv);
    expect(result.type).toBe("text");
    const content = (result as { type: "text"; content: string }).content;
    expect(content).toContain("query");
    // No fetches at all.
    expect(mockFetch.mock.calls.length).toBe(0);
  });
});
