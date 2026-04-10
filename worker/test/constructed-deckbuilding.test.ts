import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { deckbuildingModule } from "../../plugins/mtga/reference/deckbuilding";

import { cleanAll } from "./helpers";

// ── Seed helpers ─────────────────────────────────────────────

const INSERT_CARD = `INSERT INTO magic_cards
  (scryfall_id, arena_id, oracle_id, name, front_face_name, is_default, mana_cost, cmc, type_line, colors, color_identity, legalities, rarity, set_code, keywords, produced_mana)
  VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function seedConstructedCards(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(INSERT_CARD).bind(
      "scry-cd-2001",
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
      "scry-cd-2002",
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
      "scry-cd-2003",
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
      "scry-cd-2004",
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
      "scry-cd-2005",
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
      "scry-cd-2006",
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
      "scry-cd-2007",
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

  it("returns Constructed health check with composition and mana analysis", async () => {
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
    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;

    expect(data.mode).toBe("constructed");
    expect(data.total_cards).toBe(40);
    const comp = data.composition as { creatures: number; noncreatures: number; lands: number };
    expect(comp.creatures).toBe(12); // 4+4+4
    expect(comp.lands).toBe(20);
    // Mana analysis present with Red pips
    const mana = data.mana as { pip_distribution: Record<string, number> };
    expect(mana.pip_distribution.R).toBeGreaterThan(0);
    // All cards Standard legal — no illegal_cards
    expect(data.illegal_cards).toBeUndefined();
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
    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    const illegal = data.illegal_cards as { name: string; status: string }[];
    expect(illegal).toBeDefined();
    expect(illegal.find((c) => c.name === "Smuggler's Copter")).toBeDefined();
    expect(illegal[0]!.status).toBe("banned");
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
    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    // All legal in Historic — no illegal_cards
    expect(data.illegal_cards).toBeUndefined();
  });

  it("shows sideboard size", async () => {
    const deck = [
      { name: "Heartfire Hero", count: 4 },
      { name: "Mountain", count: 20 },
    ];
    const sideboard = [{ name: "Play with Fire", count: 3 }];

    const result = await deckbuildingModule.execute(
      { deck, sideboard, mode: "constructed", format: "standard" },
      env,
    );
    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.sideboard_count).toBe(3);
  });

  it("works without format parameter (skips legality check)", async () => {
    const deck = [
      { name: "Heartfire Hero", count: 4 },
      { name: "Mountain", count: 20 },
    ];

    const result = await deckbuildingModule.execute({ deck, mode: "constructed" }, env);
    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;
    expect(data.mode).toBe("constructed");
    const comp = data.composition as { creatures: number; lands: number };
    expect(comp.creatures).toBe(4);
    expect(comp.lands).toBe(20);
  });

  it("resolves legality from non-default printing when default has empty legalities", async () => {
    // Reproduces production bug: Breeding Pool has two printings.
    // The default (is_default=1) has empty legalities {}, but a non-default
    // printing has real legalities. The module should use the non-empty one.
    await env.DB.batch([
      // Default printing — empty legalities (the bug trigger)
      env.DB.prepare(INSERT_CARD).bind(
        "scry-cd-3001",
        3001,
        "o-breed",
        "Breeding Pool",
        "Breeding Pool",
        "",
        0,
        "Land — Forest Island",
        "[]",
        '["G","U"]',
        "{}",
        "rare",
        "RVR",
        "[]",
        '["G","U"]',
      ),
      // Non-default printing — has real legalities
      env.DB.prepare(
        `INSERT INTO magic_cards
          (scryfall_id, arena_id, oracle_id, name, front_face_name, is_default, mana_cost, cmc, type_line, colors, color_identity, legalities, rarity, set_code, keywords, produced_mana)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        "scry-cd-3002",
        3002,
        "o-breed",
        "Breeding Pool",
        "Breeding Pool",
        "",
        0,
        "Land — Forest Island",
        "[]",
        '["G","U"]',
        '{"standard":"legal","historic":"legal"}',
        "rare",
        "EOE",
        "[]",
        '["G","U"]',
      ),
    ]);

    const deck = [
      { name: "Breeding Pool", count: 4 },
      { name: "Mountain", count: 20 },
    ];

    const result = await deckbuildingModule.execute(
      { deck, mode: "constructed", format: "standard" },
      env,
    );
    expect(result.type).toBe("structured");
    const data = (result as { type: "structured"; data: Record<string, unknown> }).data;

    // Breeding Pool IS legal in standard — should NOT be flagged
    expect(data.illegal_cards).toBeUndefined();
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
