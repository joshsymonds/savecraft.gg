import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { commanderDeckbuildModule } from "../../plugins/magic/reference/commander-deckbuild";
import { registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";

describe("commander_deckbuild native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("magic", commanderDeckbuildModule);
  });

  async function seedAtraxa(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Atraxa, Praetors' Voice", "atraxa-praetors-voice", '["W","U","B","G"]', 40000, 3),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        ATRAXA_ID,
        "Atraxa, Praetors' Voice",
      ),

      // Budget tier metadata
      env.DB.prepare(
        `INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", 174, 4072, 84),
      env.DB.prepare(
        `INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "optimized", 2456, 1948, 93),

      // Optimized tier deck — small set so tests targeting tier='optimized'
      // have at least one card to confirm tier_used in the response.
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "optimized", "Mana Crypt", 1, "Artifact"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "optimized", "Forest", 5, "Land"),

      // Budget tier deck — includes a game changer (Cyclonic Rift) for filter test
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Sol Ring", 1, "Artifact"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Cultivate", 1, "Sorcery"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Birds of Paradise", 1, "Creature"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Cyclonic Rift", 1, "Instant"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Forest", 8, "Land"),

      // Game-changers table (Cyclonic Rift is on the WotC list)
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind("Cyclonic Rift"),

      // Prices via EDHREC TCGPlayer
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Sol Ring", 1.5),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Cultivate", 0.5),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Birds of Paradise", 7.0),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Cyclonic Rift", 32.0),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Forest", 0.1),
    ]);
  }

  it("happy path: returns a deck under max_price", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100 },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as {
      commander: { tier_used: string };
      budget: { max_price: number; total_price: number };
      deck: { card_name: string }[];
      slots_remaining: number;
    };
    expect(data.commander.tier_used).toBe("budget");
    expect(data.budget.max_price).toBe(100);
    expect(data.budget.total_price).toBeLessThanOrEqual(100);
    expect(data.deck.length).toBeGreaterThan(0);
  });

  it("excludes named cards", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, excludes: ["Sol Ring"] },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { deck: { card_name: string }[] };
    expect(data.deck.map((c) => c.card_name)).not.toContain("Sol Ring");
  });

  it("must_include pins cards even when over budget", async () => {
    await seedAtraxa();
    // Budget too low to include Cyclonic Rift naturally ($32 > $20),
    // but must_include forces it in.
    const result = await commanderDeckbuildModule.execute(
      {
        commander: "Atraxa",
        max_price: 20,
        must_include: ["Cyclonic Rift"],
        exclude_game_changers: false,
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      deck: { card_name: string; source: string }[];
      budget: { total_price: number };
    };
    const rift = data.deck.find((c) => c.card_name === "Cyclonic Rift");
    expect(rift).toBeDefined();
    expect(rift!.source).toBe("must_include");
  });

  it("exclude_game_changers (default at budget tier) drops Cyclonic Rift", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100 }, // tier auto-picks budget; default exclude_game_changers=true
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { deck: { card_name: string }[] };
    expect(data.deck.map((c) => c.card_name)).not.toContain("Cyclonic Rift");
  });

  it("exclude_game_changers=false keeps game changers", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, exclude_game_changers: false },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { deck: { card_name: string; game_changer?: boolean }[] };
    const rift = data.deck.find((c) => c.card_name === "Cyclonic Rift");
    expect(rift).toBeDefined();
    expect(rift!.game_changer).toBe(true);
  });

  it("tier auto-pick: max_price=200 → 'budget'", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 200 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { commander: { tier_used: string } };
    expect(data.commander.tier_used).toBe("budget");
  });

  it("tier auto-pick: max_price=2500 → 'optimized'", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 2500 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { commander: { tier_used: string } };
    expect(data.commander.tier_used).toBe("optimized");
  });

  it("explicit tier overrides auto-pick", async () => {
    await seedAtraxa();
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 100, tier: "optimized" },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { commander: { tier_used: string } };
    expect(data.commander.tier_used).toBe("optimized");
  });

  it("warns when max_price < tier.avg_price (below empirical floor)", async () => {
    await seedAtraxa();
    // Budget tier avg is $174; $50 is well below floor.
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", max_price: 50 },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { warnings: string[] };
    const hasFloor = data.warnings.some((w) => w.toLowerCase().includes("floor"));
    expect(hasFloor).toBe(true);
  });

  it("returns text response when commander has no data for the chosen tier", async () => {
    await seedAtraxa();
    // 'cedh' tier wasn't seeded for Atraxa — should fall back to text.
    const result = await commanderDeckbuildModule.execute(
      { commander: "Atraxa", tier: "cedh" },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content.toLowerCase()).toContain("cedh");
  });
});
