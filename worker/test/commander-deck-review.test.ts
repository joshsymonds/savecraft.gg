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
});
