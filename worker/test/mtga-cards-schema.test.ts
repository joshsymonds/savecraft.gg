import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

describe("MTGA cards D1 schema", () => {
  beforeEach(cleanAll);

  // ── mtga_cards table + FTS5 ────────────────────────────────

  it("inserts and retrieves cards", async () => {
    await env.DB.prepare(
      `INSERT INTO mtga_cards
        (arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text,
         colors, color_identity, legalities, rarity, set_code, keywords)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        87521,
        "abc-123",
        "Sheoldred, the Apocalypse",
        "{2}{B}{B}",
        4.0,
        "Legendary Creature — Phyrexian Praetor",
        "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.",
        '["B"]',
        '["B"]',
        '{"standard":"banned","historic":"legal"}',
        "mythic",
        "DMU",
        '["deathtouch"]',
      )
      .run();

    const row = await env.DB.prepare("SELECT * FROM mtga_cards WHERE arena_id = ?")
      .bind(87521)
      .first<{
        arena_id: number;
        oracle_id: string;
        name: string;
        mana_cost: string;
        cmc: number;
        type_line: string;
        oracle_text: string;
        colors: string;
        rarity: string;
        set_code: string;
      }>();

    expect(row).not.toBeNull();
    expect(row!.name).toBe("Sheoldred, the Apocalypse");
    expect(row!.mana_cost).toBe("{2}{B}{B}");
    expect(row!.cmc).toBe(4.0);
    expect(row!.rarity).toBe("mythic");
    expect(JSON.parse(row!.colors)).toEqual(["B"]);
  });

  it("FTS5 keyword search returns ranked results", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, rarity, set_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        1,
        "a",
        "Lightning Bolt",
        "{R}",
        1,
        "Instant",
        "Lightning Bolt deals 3 damage to any target.",
        "common",
        "STA",
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, rarity, set_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        2,
        "b",
        "Lightning Strike",
        "{1}{R}",
        2,
        "Instant",
        "Lightning Strike deals 3 damage to any target.",
        "uncommon",
        "DMU",
      ),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, rarity, set_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        3,
        "c",
        "Llanowar Elves",
        "{G}",
        1,
        "Creature — Elf Druid",
        "Tap: Add {G}.",
        "common",
        "DAR",
      ),
      // FTS5 rows
      env.DB.prepare(
        "INSERT INTO mtga_cards_fts (arena_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(1, "Lightning Bolt", "Lightning Bolt deals 3 damage to any target.", "Instant"),
      env.DB.prepare(
        "INSERT INTO mtga_cards_fts (arena_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(2, "Lightning Strike", "Lightning Strike deals 3 damage to any target.", "Instant"),
      env.DB.prepare(
        "INSERT INTO mtga_cards_fts (arena_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(3, "Llanowar Elves", "Tap: Add {G}.", "Creature — Elf Druid"),
    ]);

    const results = await env.DB.prepare(
      `SELECT arena_id FROM mtga_cards_fts WHERE mtga_cards_fts MATCH ? ORDER BY rank LIMIT 10`,
    )
      .bind("lightning")
      .all<{ arena_id: number }>();

    expect(results.results.length).toBe(2);
    const ids = results.results.map((r) => r.arena_id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).not.toContain(3);
  });

  it("FTS5 searches oracle text content", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, oracle_text, rarity, set_code)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(10, "x", "Thoughtseize", "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.", "rare", "AKR"),
      env.DB.prepare(
        "INSERT INTO mtga_cards_fts (arena_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(10, "Thoughtseize", "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.", ""),
    ]);

    const results = await env.DB.prepare(
      `SELECT arena_id FROM mtga_cards_fts WHERE mtga_cards_fts MATCH ? LIMIT 10`,
    )
      .bind("discard")
      .all<{ arena_id: number }>();

    expect(results.results.length).toBe(1);
    expect(results.results[0]!.arena_id).toBe(10);
  });

  it("structured table indexes support filtering", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, rarity, set_code) VALUES (?, ?, ?, ?, ?)`,
      ).bind(1, "a", "Card A", "rare", "DMU"),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, rarity, set_code) VALUES (?, ?, ?, ?, ?)`,
      ).bind(2, "b", "Card B", "common", "DMU"),
      env.DB.prepare(
        `INSERT INTO mtga_cards (arena_id, oracle_id, name, rarity, set_code) VALUES (?, ?, ?, ?, ?)`,
      ).bind(3, "c", "Card C", "rare", "BRO"),
    ]);

    // Filter by rarity
    const rares = await env.DB.prepare("SELECT arena_id FROM mtga_cards WHERE rarity = ?")
      .bind("rare")
      .all<{ arena_id: number }>();
    expect(rares.results.length).toBe(2);

    // Filter by set
    const dmu = await env.DB.prepare("SELECT arena_id FROM mtga_cards WHERE set_code = ?")
      .bind("DMU")
      .all<{ arena_id: number }>();
    expect(dmu.results.length).toBe(2);
  });
});

describe("MTGA draft ratings D1 schema", () => {
  beforeEach(cleanAll);

  // ── mtga_draft_ratings + color stats ───────────────────────

  it("inserts and retrieves overall ratings", async () => {
    await env.DB.prepare(
      `INSERT INTO mtga_draft_ratings
        (set_code, card_name, games_in_hand, games_played, games_not_seen,
         gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("DSK", "Gloomlake Verge", 15000, 20000, 5000, 0.564, 0.62, 0.54, 0.48, 0.06, 8.5, 9.2)
      .run();

    const row = await env.DB.prepare(
      "SELECT * FROM mtga_draft_ratings WHERE set_code = ? AND card_name = ?",
    )
      .bind("DSK", "Gloomlake Verge")
      .first<{ gihwr: number; iwd: number }>();

    expect(row).not.toBeNull();
    expect(row!.gihwr).toBeCloseTo(0.564, 3);
    expect(row!.iwd).toBeCloseTo(0.06, 3);
  });

  it("inserts and retrieves color pair stats", async () => {
    await env.DB.prepare(
      `INSERT INTO mtga_draft_color_stats
        (set_code, card_name, color_pair, games_in_hand, games_played, games_not_seen,
         gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("DSK", "Gloomlake Verge", "UB", 3000, 4000, 1000, 0.59, 0.63, 0.56, 0.49, 0.07, 7.2, 8.0)
      .run();

    const row = await env.DB.prepare(
      "SELECT * FROM mtga_draft_color_stats WHERE set_code = ? AND card_name = ? AND color_pair = ?",
    )
      .bind("DSK", "Gloomlake Verge", "UB")
      .first<{ gihwr: number; color_pair: string }>();

    expect(row).not.toBeNull();
    expect(row!.color_pair).toBe("UB");
    expect(row!.gihwr).toBeCloseTo(0.59, 3);
  });

  it("JOIN between ratings and color stats", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings
          (set_code, card_name, gihwr, iwd) VALUES (?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", 0.564, 0.06),
      env.DB.prepare(
        `INSERT INTO mtga_draft_color_stats
          (set_code, card_name, color_pair, gihwr, iwd) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "UB", 0.59, 0.07),
      env.DB.prepare(
        `INSERT INTO mtga_draft_color_stats
          (set_code, card_name, color_pair, gihwr, iwd) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "BG", 0.52, 0.03),
    ]);

    const results = await env.DB.prepare(
      `SELECT r.card_name, r.gihwr AS overall_gihwr, c.color_pair, c.gihwr AS color_gihwr
       FROM mtga_draft_ratings r
       JOIN mtga_draft_color_stats c
         ON r.set_code = c.set_code AND r.card_name = c.card_name
       WHERE r.set_code = ? AND r.card_name = ?
       ORDER BY c.color_pair`,
    )
      .bind("DSK", "Gloomlake Verge")
      .all<{ card_name: string; overall_gihwr: number; color_pair: string; color_gihwr: number }>();

    expect(results.results.length).toBe(2);
    expect(results.results[0]!.color_pair).toBe("BG");
    expect(results.results[1]!.color_pair).toBe("UB");
    expect(results.results[0]!.overall_gihwr).toBeCloseTo(0.564, 3);
  });

  it("set stats table stores aggregate data", async () => {
    await env.DB.prepare(
      `INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("DSK", "PremierDraft", 250000, 245, 0.515)
      .run();

    const row = await env.DB.prepare("SELECT * FROM mtga_draft_set_stats WHERE set_code = ?")
      .bind("DSK")
      .first<{ total_games: number; card_count: number; avg_gihwr: number }>();

    expect(row).not.toBeNull();
    expect(row!.total_games).toBe(250000);
    expect(row!.avg_gihwr).toBeCloseTo(0.515, 3);
  });

  it("FTS5 search on card names in ratings", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, gihwr) VALUES (?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", 0.564),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, gihwr) VALUES (?, ?, ?)`,
      ).bind("DSK", "Lightning Bolt", 0.58),
      env.DB.prepare(
        "INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)",
      ).bind("DSK", "Gloomlake Verge"),
      env.DB.prepare(
        "INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (?, ?)",
      ).bind("DSK", "Lightning Bolt"),
    ]);

    const results = await env.DB.prepare(
      `SELECT set_code, card_name FROM mtga_draft_ratings_fts WHERE mtga_draft_ratings_fts MATCH ? LIMIT 10`,
    )
      .bind("gloomlake")
      .all<{ set_code: string; card_name: string }>();

    expect(results.results.length).toBe(1);
    expect(results.results[0]!.card_name).toBe("Gloomlake Verge");
  });

  it("leaderboard query sorts by gihwr", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, gihwr, iwd) VALUES (?, ?, ?, ?)`,
      ).bind("DSK", "Card A", 0.60, 0.08),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, gihwr, iwd) VALUES (?, ?, ?, ?)`,
      ).bind("DSK", "Card B", 0.55, 0.04),
      env.DB.prepare(
        `INSERT INTO mtga_draft_ratings (set_code, card_name, gihwr, iwd) VALUES (?, ?, ?, ?)`,
      ).bind("DSK", "Card C", 0.58, 0.06),
    ]);

    const results = await env.DB.prepare(
      `SELECT card_name, gihwr FROM mtga_draft_ratings WHERE set_code = ? ORDER BY gihwr DESC LIMIT 10`,
    )
      .bind("DSK")
      .all<{ card_name: string; gihwr: number }>();

    expect(results.results.length).toBe(3);
    expect(results.results[0]!.card_name).toBe("Card A");
    expect(results.results[1]!.card_name).toBe("Card C");
    expect(results.results[2]!.card_name).toBe("Card B");
  });
});
