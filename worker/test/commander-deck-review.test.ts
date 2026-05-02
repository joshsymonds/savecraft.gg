import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { commanderDeckReviewModule } from "../../plugins/magic/reference/commander-deck-review";
import { registerNativeModule } from "../src/reference/registry";
import type { Env } from "../src/types";

import { cleanAll } from "./helpers";

const ATRAXA_ID = "atraxa-id";

describe("commander_deck_review native module", () => {
  beforeEach(async () => {
    await cleanAll();
    registerNativeModule("magic", commanderDeckReviewModule);
  });

  async function seedAtraxa(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commanders (scryfall_id, name, slug, color_identity, deck_count, rank)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        ATRAXA_ID,
        "Atraxa, Praetors' Voice",
        "atraxa-praetors-voice",
        '["G","W","U","B"]',
        40_000,
        3,
      ),
      env.DB.prepare(`INSERT INTO magic_edh_commanders_fts (scryfall_id, name) VALUES (?, ?)`).bind(
        ATRAXA_ID,
        "Atraxa, Praetors' Voice",
      ),

      // Top cards (staples) — high inclusion, representing EDHREC consensus picks
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Sol Ring", "topcards", 0, 38_000, 40_000, 0),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Arcane Signet", "topcards", 0, 36_000, 40_000, 0),
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Swords to Plowshares", "topcards", 0, 34_000, 40_000, 0),
      // A fringe card (low inclusion) — should NOT be flagged as missing staple
      env.DB.prepare(
        `INSERT INTO magic_edh_recommendations (commander_id, card_name, category, synergy, inclusion, potential_decks, trend_zscore)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Obscure Card", "topcards", 0, 2000, 40_000, 0),

      // Average decklist (91 entries would be typical — we use a small subset for testing)
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks (commander_id, card_name, quantity, category)
         VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Atraxa, Praetors' Voice", 1, "commander"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks (commander_id, card_name, quantity, category)
         VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Sol Ring", 1, "artifacts"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks (commander_id, card_name, quantity, category)
         VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Arcane Signet", 1, "artifacts"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks (commander_id, card_name, quantity, category)
         VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Swords to Plowshares", 1, "instants"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks (commander_id, card_name, quantity, category)
         VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Cultivate", 1, "sorceries"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks (commander_id, card_name, quantity, category)
         VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Birds of Paradise", 1, "creatures"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks (commander_id, card_name, quantity, category)
         VALUES (?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "Forest", 10, "basics"),
    ]);
  }

  it("detects missing staples (top cards with high inclusion not in deck)", async () => {
    await seedAtraxa();

    // Deck is missing Sol Ring and Arcane Signet — the two most-included top cards.
    const decklist = [
      "Atraxa, Praetors' Voice",
      "Swords to Plowshares",
      "Cultivate",
      "Birds of Paradise",
    ];

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as {
      missing_staples: { card_name: string; inclusion: number; inclusion_pct: number }[];
      commander: { name: string };
    };

    expect(data.commander.name).toBe("Atraxa, Praetors' Voice");
    const missingNames = data.missing_staples.map((m) => m.card_name);
    expect(missingNames).toContain("Sol Ring");
    expect(missingNames).toContain("Arcane Signet");
    // "Obscure Card" has only 5% inclusion — below the staple threshold, should NOT be flagged
    expect(missingNames).not.toContain("Obscure Card");
    // Staples should be ordered by inclusion DESC
    expect(data.missing_staples[0]?.card_name).toBe("Sol Ring");
  });

  it("computes overlap percentage vs average deck", async () => {
    await seedAtraxa();

    // Deck matches 4 of 7 average entries: Atraxa, Sol Ring, Arcane Signet, Cultivate
    // Missing from user deck (but in avg): Swords to Plowshares, Birds of Paradise, Forest
    const decklist = [
      "Atraxa, Praetors' Voice",
      "Sol Ring",
      "Arcane Signet",
      "Cultivate",
      "Extra Card Not In Average",
    ];

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as {
      overlap: { matching_cards: number; total_average: number; percentage: number };
    };
    expect(data.overlap.matching_cards).toBe(4);
    expect(data.overlap.total_average).toBe(7);
    expect(data.overlap.percentage).toBeCloseTo(4 / 7, 2);
  });

  it("identifies extras (cards in deck but not in average)", async () => {
    await seedAtraxa();

    const decklist = ["Atraxa, Praetors' Voice", "Sol Ring", "Homebrew Card A", "Homebrew Card B"];

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as { extras: string[] };
    expect(data.extras).toContain("Homebrew Card A");
    expect(data.extras).toContain("Homebrew Card B");
    expect(data.extras).not.toContain("Sol Ring");
  });

  it("parses '1 Card Name' format alongside plain names", async () => {
    await seedAtraxa();

    // Mix of quantity-prefixed entries ("1 Sol Ring") and plain names
    const decklist = ["1 Atraxa, Praetors' Voice", "1 Sol Ring", "Cultivate", "10 Forest"];

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as {
      overlap: { matching_cards: number };
    };
    // All 4 should match the average (Atraxa, Sol Ring, Cultivate, Forest)
    expect(data.overlap.matching_cards).toBe(4);
  });

  it("returns category breakdown comparing user deck to average", async () => {
    await seedAtraxa();

    const decklist = ["Atraxa, Praetors' Voice", "Sol Ring", "Swords to Plowshares"];

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as {
      category_breakdown: { category: string; user_count: number; average_count: number }[];
    };
    // Should include categories from the average deck
    const categories = data.category_breakdown.map((c) => c.category);
    expect(categories).toContain("artifacts");
    expect(categories).toContain("instants");

    // Both sides count distinct cards, not quantities — verify parity.
    // The seed has "Forest" with quantity 10 in "basics"; if avg side summed
    // quantities this category would be 10, but it should be 1.
    const basics = data.category_breakdown.find((c) => c.category === "basics");
    expect(basics?.average_count).toBe(1);
    // User has Sol Ring (artifacts) and Swords (instants) — both distinct cards.
    const artifacts = data.category_breakdown.find((c) => c.category === "artifacts");
    expect(artifacts?.user_count).toBe(1);
    expect(artifacts?.average_count).toBe(2); // Sol Ring, Arcane Signet
    const instants = data.category_breakdown.find((c) => c.category === "instants");
    expect(instants?.user_count).toBe(1);
    expect(instants?.average_count).toBe(1); // Swords to Plowshares
  });

  it("returns text error when commander not found", async () => {
    await seedAtraxa();

    const result = await commanderDeckReviewModule.execute(
      { commander: "Nonexistent", decklist: ["Sol Ring"] },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toMatch(/not found/i);
  });

  it("returns text error when decklist is missing or empty", async () => {
    await seedAtraxa();

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist: [] },
      env as unknown as Env,
    );
    expect(result.type).toBe("text");
    if (result.type !== "text") return;
    expect(result.content).toMatch(/decklist/i);
  });

  it("includes full average deck when include_average=true", async () => {
    await seedAtraxa();

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist: ["Sol Ring"], include_average: true },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as { average_deck?: { card_name: string; quantity: number }[] };
    expect(data.average_deck).toBeDefined();
    expect(data.average_deck!.length).toBe(7);
  });

  it("excludes average deck by default", async () => {
    await seedAtraxa();

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist: ["Sol Ring"] },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as { average_deck?: unknown[] };
    expect(data.average_deck).toBeUndefined();
  });

  // ── price/budget tests ────────────────────────────────────────

  it("returns total_price summing EDHREC TCGPlayer prices", async () => {
    await seedAtraxa();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Sol Ring", 1.5),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Arcane Signet", 2),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Cultivate", 0.5),
    ]);

    const decklist = ["Sol Ring", "Arcane Signet", "Cultivate"];
    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist },
      env as unknown as Env,
    );
    expect(result.type).toBe("structured");
    if (result.type !== "structured") return;

    const data = result.data as { total_price: number; cards_without_prices: string[] };
    expect(data.total_price).toBeCloseTo(4, 2);
    expect(data.cards_without_prices).toEqual([]);
  });

  it("flags over_budget when total_price exceeds max_price", async () => {
    await seedAtraxa();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Sol Ring", 100),
      env.DB.prepare(
        `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
      ).bind("Arcane Signet", 50),
    ]);

    const result = await commanderDeckReviewModule.execute(
      {
        commander: "Atraxa",
        decklist: ["Sol Ring", "Arcane Signet"],
        max_price: 100,
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");

    const data = result.data as { total_price: number; over_budget: boolean };
    expect(data.total_price).toBeCloseTo(150, 2);
    expect(data.over_budget).toBe(true);
  });

  it("lists cards_without_prices when prices are missing", async () => {
    await seedAtraxa();

    // Only price one card; the other has no price source.
    await env.DB.prepare(
      `INSERT INTO magic_edh_card_prices (card_name, tcgplayer_price) VALUES (?, ?)`,
    )
      .bind("Sol Ring", 1.5)
      .run();

    const result = await commanderDeckReviewModule.execute(
      {
        commander: "Atraxa",
        decklist: ["Sol Ring", "Cultivate", "Birds of Paradise"],
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");

    const data = result.data as { total_price: number; cards_without_prices: string[] };
    expect(data.total_price).toBeCloseTo(1.5, 2);
    expect(data.cards_without_prices).toContain("Cultivate");
    expect(data.cards_without_prices).toContain("Birds of Paradise");
  });

  // ── tier comparison tests ─────────────────────────────────────

  it("compares against tier-specific average deck when tier is set", async () => {
    await seedAtraxa();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", 174, 4072, 84),
      // Budget tier has different cards than the default average
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Sol Ring", 1, "artifacts"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Cultivate", 1, "sorceries"),
      env.DB.prepare(
        `INSERT INTO magic_edh_average_decks_by_tier (commander_id, tier, card_name, quantity, category) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", "Forest", 8, "basics"),
    ]);

    const result = await commanderDeckReviewModule.execute(
      {
        commander: "Atraxa",
        decklist: ["Sol Ring", "Cultivate"],
        tier: "budget",
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");

    const data = result.data as {
      tier_info: { tier: string; avg_price: number };
      overlap: { matching_cards: number; total_average: number };
    };
    expect(data.tier_info.tier).toBe("budget");
    expect(data.tier_info.avg_price).toBe(174);
    // Decklist matches 2 of 3 cards in the tier's average (Sol Ring, Cultivate; Forest absent).
    expect(data.overlap.matching_cards).toBe(2);
    expect(data.overlap.total_average).toBe(3);
  });

  it("returns warning when tier has no data for this commander", async () => {
    await seedAtraxa();
    // No tier rows seeded.

    const result = await commanderDeckReviewModule.execute(
      {
        commander: "Atraxa",
        decklist: ["Sol Ring"],
        tier: "cedh",
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { tier_info: unknown };
    expect(data.tier_info).toBeNull();
  });

  it("flags Game Changers in user deck when tier='budget' is set", async () => {
    await seedAtraxa();
    // Seed game changers and tier metadata.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind(
        "Cyclonic Rift",
      ),
      env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`).bind(
        "Demonic Tutor",
      ),
      env.DB.prepare(
        `INSERT INTO magic_edh_commander_tiers (commander_id, tier, avg_price, num_decks_avg, deck_size) VALUES (?, ?, ?, ?, ?)`,
      ).bind(ATRAXA_ID, "budget", 174, 4072, 84),
    ]);

    const decklist = ["Sol Ring", "Cyclonic Rift", "Demonic Tutor", "Cultivate"];
    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist, tier: "budget" },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { tier_mismatches: { game_changers: string[] } };
    expect(data.tier_mismatches).toBeDefined();
    expect(data.tier_mismatches.game_changers).toContain("Cyclonic Rift");
    expect(data.tier_mismatches.game_changers).toContain("Demonic Tutor");
    expect(data.tier_mismatches.game_changers).not.toContain("Sol Ring");
  });

  it("does not flag Game Changers when tier is not set", async () => {
    await seedAtraxa();
    await env.DB.prepare(`INSERT INTO magic_game_changers (card_name) VALUES (?)`)
      .bind("Cyclonic Rift")
      .run();

    const result = await commanderDeckReviewModule.execute(
      { commander: "Atraxa", decklist: ["Sol Ring", "Cyclonic Rift"] },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as { tier_mismatches?: unknown };
    expect(data.tier_mismatches).toBeUndefined();
  });

  // ── M5: deck-quality wired into review output ──────────────────

  it("output includes quality block populated by assessQuality", async () => {
    await seedAtraxa();
    const result = await commanderDeckReviewModule.execute(
      {
        commander: "Atraxa",
        decklist: ["1 Sol Ring", "1 Cultivate", "10 Forest"],
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      quality?: {
        bracket: { tier: number };
        composition: { lands: { count: number; status: string } };
        vectors: { mana_base: number; composition: number };
        score: number;
        weights: Record<string, number>;
      };
    };
    expect(data.quality).toBeDefined();
    expect(data.quality?.bracket.tier).toBeGreaterThanOrEqual(1);
    expect(data.quality?.bracket.tier).toBeLessThanOrEqual(5);
    expect(data.quality?.score).toBeGreaterThanOrEqual(0);
    expect(data.quality?.score).toBeLessThanOrEqual(100);
    expect(data.quality?.weights).toBeDefined();
  });

  it("quality counts quantity-prefixed basics correctly (10 Forest = 10 lands)", async () => {
    await seedAtraxa();
    await env.DB.prepare(
      `INSERT INTO magic_cards (oracle_id, front_face_name, name, type_line, set_code, is_default, mana_cost, cmc, produced_mana)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("forest-id", "Forest", "Forest", "Basic Land — Forest", "TST", 1, "", 0, '["G"]')
      .run();
    const result = await commanderDeckReviewModule.execute(
      {
        commander: "Atraxa",
        decklist: ["10 Forest"],
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      quality: { composition: { lands: { count: number } } };
    };
    expect(data.quality.composition.lands.count).toBe(10);
  });

  it("quality falls back to community benchmark when no tier provided", async () => {
    await seedAtraxa();
    const result = await commanderDeckReviewModule.execute(
      {
        commander: "Atraxa",
        decklist: ["Sol Ring", "Cultivate"],
      },
      env as unknown as Env,
    );
    if (result.type !== "structured") throw new Error("expected structured");
    const data = result.data as {
      quality: {
        composition: { ramp: { target_source: string } };
      };
    };
    expect(data.quality.composition.ramp.target_source).toBe("community_benchmark");
  });
});
