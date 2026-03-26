import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { deckbuildingModule } from "../../plugins/mtga/reference/deckbuilding";

import { cleanAll } from "./helpers";

// ── Seed helpers ─────────────────────────────────────────────

const INSERT_CARD = `INSERT INTO mtga_cards
  (arena_id, oracle_id, name, front_face_name, is_default, mana_cost, cmc, type_line, colors, color_identity, legalities, rarity, set_code, keywords, produced_mana)
  VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function seedConstructedCards(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(INSERT_CARD).bind(
      2001,
      "o-2001",
      "Heartfire Hero",
      "Heartfire Hero",
      "{R}",
      1,
      "Creature — Human Soldier",
      '["R"]',
      '["R"]',
      '{"standard":"legal","historic":"legal"}',
      "uncommon",
      "BLB",
      "[]",
      "[]",
    ),
    env.DB.prepare(INSERT_CARD).bind(
      2002,
      "o-2002",
      "Monastery Swiftspear",
      "Monastery Swiftspear",
      "{R}",
      1,
      "Creature — Human Monk",
      '["R"]',
      '["R"]',
      '{"standard":"legal","historic":"legal"}',
      "uncommon",
      "FDN",
      '["prowess"]',
      "[]",
    ),
    env.DB.prepare(INSERT_CARD).bind(
      2003,
      "o-2003",
      "Play with Fire",
      "Play with Fire",
      "{R}",
      1,
      "Instant",
      '["R"]',
      '["R"]',
      '{"standard":"legal","historic":"legal"}',
      "uncommon",
      "MID",
      "[]",
      "[]",
    ),
    env.DB.prepare(INSERT_CARD).bind(
      2004,
      "o-2004",
      "Lightning Strike",
      "Lightning Strike",
      "{1}{R}",
      2,
      "Instant",
      '["R"]',
      '["R"]',
      '{"standard":"legal","historic":"legal"}',
      "common",
      "M19",
      "[]",
      "[]",
    ),
    env.DB.prepare(INSERT_CARD).bind(
      2005,
      "o-2005",
      "Mountain",
      "Mountain",
      "",
      0,
      "Basic Land — Mountain",
      "[]",
      '["R"]',
      '{"standard":"legal","historic":"legal"}',
      "common",
      "FDN",
      "[]",
      '["R"]',
    ),
    env.DB.prepare(INSERT_CARD).bind(
      2006,
      "o-2006",
      "Smuggler's Copter",
      "Smuggler's Copter",
      "{2}",
      2,
      "Artifact — Vehicle",
      "[]",
      "[]",
      '{"standard":"banned","historic":"legal"}',
      "rare",
      "KLD",
      '["flying","crew"]',
      "[]",
    ),
    env.DB.prepare(INSERT_CARD).bind(
      2007,
      "o-2007",
      "Goblin Chainwhirler",
      "Goblin Chainwhirler",
      "{R}{R}{R}",
      3,
      "Creature — Goblin Warrior",
      '["R"]',
      '["R"]',
      '{"standard":"legal","historic":"legal"}',
      "rare",
      "DOM",
      '["first strike"]',
      "[]",
    ),
  ]);
}

describe("deckbuilding Constructed mode", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedConstructedCards();
  });

  it("returns Constructed health check with composition and legality", async () => {
    const deck = [
      { name: "Heartfire Hero", count: 4 },
      { name: "Monastery Swiftspear", count: 4 },
      { name: "Play with Fire", count: 4 },
      { name: "Lightning Strike", count: 4 },
      { name: "Goblin Chainwhirler", count: 4 },
      { name: "Mountain", count: 20 },
    ];

    const result = await deckbuildingModule.execute(
      { deck, mode: "constructed", format: "standard" },
      env,
    );
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;

    // Should show total cards
    expect(content).toContain("40"); // 4+4+4+4+4+20 = 40 cards
    // Should show creature count
    expect(content).toMatch(/[Cc]reature/);
    // Should show land count
    expect(content).toMatch(/[Ll]and/);
    // Should show curve info
    expect(content).toMatch(/[Cc]urve|CMC/);
    // Should show color pip requirements (all spells are red)
    expect(content).toContain("Red");
    expect(content).toContain("pips");
    // All cards Standard legal — no legality warnings
    expect(content).not.toContain("banned");
    expect(content).not.toContain("not legal");
  });

  it("flags banned cards in the specified format", async () => {
    const deck = [
      { name: "Heartfire Hero", count: 4 },
      { name: "Smuggler's Copter", count: 4 }, // banned in Standard
      { name: "Mountain", count: 20 },
    ];

    const result = await deckbuildingModule.execute(
      { deck, mode: "constructed", format: "standard" },
      env,
    );
    const content = (result as { type: "formatted"; content: string }).content;

    // Should flag Smuggler's Copter as banned
    expect(content).toContain("Smuggler's Copter");
    expect(content).toMatch(/banned|not legal|illegal/i);
  });

  it("does not flag cards legal in Historic", async () => {
    const deck = [
      { name: "Heartfire Hero", count: 4 },
      { name: "Smuggler's Copter", count: 4 }, // legal in Historic
      { name: "Mountain", count: 20 },
    ];

    const result = await deckbuildingModule.execute(
      { deck, mode: "constructed", format: "historic" },
      env,
    );
    const content = (result as { type: "formatted"; content: string }).content;

    // Should NOT flag anything — all legal in Historic
    expect(content).not.toMatch(/banned|not legal|illegal/i);
  });

  it("shows sideboard size warning when not 15", async () => {
    const deck = [
      { name: "Heartfire Hero", count: 4 },
      { name: "Mountain", count: 20 },
    ];
    const sideboard = [{ name: "Play with Fire", count: 3 }];

    const result = await deckbuildingModule.execute(
      { deck, sideboard, mode: "constructed", format: "standard" },
      env,
    );
    const content = (result as { type: "formatted"; content: string }).content;

    // Should note sideboard is 3 cards (not 15)
    expect(content).toMatch(/[Ss]ideboard/);
    expect(content).toContain("3");
  });

  it("works without format parameter (skips legality check)", async () => {
    const deck = [
      { name: "Heartfire Hero", count: 4 },
      { name: "Mountain", count: 20 },
    ];

    const result = await deckbuildingModule.execute({ deck, mode: "constructed" }, env);
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;

    // Should still show composition
    expect(content).toMatch(/[Cc]reature/);
    expect(content).toMatch(/[Ll]and/);
  });

  it("existing draft mode still works", async () => {
    // Seed minimal draft data so the existing mode doesn't break
    await env.DB.prepare(
      `INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("BLB", "Heartfire Hero", 5000, 7000, 2000, 0.55, 0.56, 0.53, 0.5, 0.03, 5, 6)
      .run();

    await env.DB.prepare(
      `INSERT INTO mtga_draft_deck_stats (set_code, archetype, avg_lands, avg_creatures, avg_noncreatures, avg_fixing, splash_rate, splash_avg_sources, splash_winrate, nonsplash_winrate, total_decks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("BLB", "R", 17, 15, 8, 1, 0.2, 2, 0.48, 0.52, 500)
      .run();

    const deck = [
      { name: "Heartfire Hero", count: 4 },
      { name: "Mountain", count: 13 },
    ];

    // No mode parameter → existing draft health check
    const result = await deckbuildingModule.execute({ deck, set: "BLB" }, env);
    // Should return structured data (draft mode returns structured, not formatted)
    expect(result.type).toBe("structured");
  });
});
