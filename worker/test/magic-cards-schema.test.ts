import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

describe("MTGA cards D1 schema", () => {
  beforeEach(cleanAll);

  // ── magic_cards table + FTS5 ────────────────────────────────

  it("inserts and retrieves cards", async () => {
    await env.DB.prepare(
      `INSERT INTO magic_cards
        (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text,
         colors, color_identity, legalities, rarity, set_code, keywords)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "scry-sheoldred",
        87_521,
        "abc-123",
        "Sheoldred, the Apocalypse",
        "{2}{B}{B}",
        4,
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

    const row = await env.DB.prepare("SELECT * FROM magic_cards WHERE scryfall_id = ?")
      .bind("scry-sheoldred")
      .first<{
        scryfall_id: string;
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
    expect(row!.cmc).toBe(4);
    expect(row!.rarity).toBe("mythic");
    expect(JSON.parse(row!.colors)).toEqual(["B"]);
  });

  it("FTS5 keyword search returns ranked results", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, rarity, set_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `scry-90`,
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
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, rarity, set_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `scry-91`,
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
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, rarity, set_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `scry-92`,
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
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(
        "scry-90",
        "Lightning Bolt",
        "Lightning Bolt deals 3 damage to any target.",
        "Instant",
      ),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(
        "scry-91",
        "Lightning Strike",
        "Lightning Strike deals 3 damage to any target.",
        "Instant",
      ),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind("scry-92", "Llanowar Elves", "Tap: Add {G}.", "Creature — Elf Druid"),
    ]);

    const results = await env.DB.prepare(
      `SELECT scryfall_id FROM magic_cards_fts WHERE magic_cards_fts MATCH ? ORDER BY rank LIMIT 10`,
    )
      .bind("lightning")
      .all<{ scryfall_id: string }>();

    expect(results.results.length).toBe(2);
    const ids = results.results.map((r) => r.scryfall_id);
    expect(ids).toContain("scry-90");
    expect(ids).toContain("scry-91");
    expect(ids).not.toContain("scry-92");
  });

  it("FTS5 searches oracle text content", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, oracle_text, rarity, set_code)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `scry-93`,
        10,
        "x",
        "Thoughtseize",
        "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.",
        "rare",
        "AKR",
      ),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, ?, ?)",
      ).bind(
        "scry-93",
        "Thoughtseize",
        "Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.",
        "",
      ),
    ]);

    const results = await env.DB.prepare(
      `SELECT scryfall_id FROM magic_cards_fts WHERE magic_cards_fts MATCH ? LIMIT 10`,
    )
      .bind("discard")
      .all<{ scryfall_id: string }>();

    expect(results.results.length).toBe(1);
    expect(results.results[0]!.scryfall_id).toBe("scry-93");
  });

  it("structured table indexes support filtering", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, rarity, set_code) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`scry-94`, 1, "a", "Card A", "rare", "DMU"),
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, rarity, set_code) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`scry-95`, 2, "b", "Card B", "common", "DMU"),
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, rarity, set_code) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(`scry-96`, 3, "c", "Card C", "rare", "BRO"),
    ]);

    // Filter by rarity
    const rares = await env.DB.prepare("SELECT arena_id FROM magic_cards WHERE rarity = ?")
      .bind("rare")
      .all<{ arena_id: number }>();
    expect(rares.results.length).toBe(2);

    // Filter by set
    const dmu = await env.DB.prepare("SELECT arena_id FROM magic_cards WHERE set_code = ?")
      .bind("DMU")
      .all<{ arena_id: number }>();
    expect(dmu.results.length).toBe(2);
  });
});

describe("card_search type_exclude filter", () => {
  beforeEach(cleanAll);

  async function seedCardWithType(
    id: string,
    arenaId: number,
    name: string,
    typeLine: string,
    cmc: number,
  ): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, rarity, set_code, is_default)
         VALUES (?, ?, ?, ?, '', ?, ?, '', 'rare', 'TST', 1)`,
      ).bind(id, arenaId, id, name, cmc, typeLine),
      env.DB.prepare(
        "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (?, ?, '', ?)",
      ).bind(id, name, typeLine),
    ]);
  }

  it("excludes Artifact Lands when type_exclude includes 'land'", async () => {
    const { cardSearchModule } = await import("../../plugins/magic/reference/card-search");

    await seedCardWithType("scry-rock", 1, "Sol Ring", "Artifact", 1);
    await seedCardWithType("scry-aland", 2, "Darksteel Citadel", "Artifact Land", 0);
    await seedCardWithType("scry-equip", 3, "Sword of Fire", "Artifact — Equipment", 3);

    const result = await cardSearchModule.execute(
      { type: "artifact", type_exclude: ["land"], sort: "name" },
      env,
    );

    const data = (result as { type: "structured"; data: { cards: { name: string }[] } }).data;
    const names = data.cards.map((c) => c.name);

    expect(names).toContain("Sol Ring");
    expect(names).toContain("Sword of Fire");
    expect(names).not.toContain("Darksteel Citadel");
  });

  it("excludes multiple types", async () => {
    const { cardSearchModule } = await import("../../plugins/magic/reference/card-search");

    await seedCardWithType("scry-rock", 1, "Sol Ring", "Artifact", 1);
    await seedCardWithType("scry-aland", 2, "Darksteel Citadel", "Artifact Land", 0);
    await seedCardWithType("scry-golem", 3, "Solemn Simulacrum", "Artifact Creature — Golem", 4);

    const result = await cardSearchModule.execute(
      { type: "artifact", type_exclude: ["land", "creature"], sort: "name" },
      env,
    );

    const data = (result as { type: "structured"; data: { cards: { name: string }[] } }).data;
    const names = data.cards.map((c) => c.name);

    expect(names).toContain("Sol Ring");
    expect(names).not.toContain("Darksteel Citadel");
    expect(names).not.toContain("Solemn Simulacrum");
  });

  it("returns all cards when type_exclude is empty", async () => {
    const { cardSearchModule } = await import("../../plugins/magic/reference/card-search");

    await seedCardWithType("scry-rock", 1, "Sol Ring", "Artifact", 1);
    await seedCardWithType("scry-aland", 2, "Darksteel Citadel", "Artifact Land", 0);

    const result = await cardSearchModule.execute(
      { type: "artifact", type_exclude: [], sort: "name" },
      env,
    );

    const data = (result as { type: "structured"; data: { cards: { name: string }[] } }).data;
    expect(data.cards.length).toBe(2);
  });
});

describe("MTGA draft ratings D1 schema", () => {
  beforeEach(cleanAll);

  // ── magic_draft_ratings + color stats ───────────────────────

  it("inserts and retrieves overall ratings", async () => {
    await env.DB.prepare(
      `INSERT INTO magic_draft_ratings
        (set_code, card_name, games_in_hand, games_played, games_not_seen,
         gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("DSK", "Gloomlake Verge", 15_000, 20_000, 5000, 0.564, 0.62, 0.54, 0.48, 0.06, 8.5, 9.2)
      .run();

    const row = await env.DB.prepare(
      "SELECT * FROM magic_draft_ratings WHERE set_code = ? AND card_name = ?",
    )
      .bind("DSK", "Gloomlake Verge")
      .first<{ gihwr: number; iwd: number }>();

    expect(row).not.toBeNull();
    expect(row!.gihwr).toBeCloseTo(0.564, 3);
    expect(row!.iwd).toBeCloseTo(0.06, 3);
  });

  it("inserts and retrieves archetype stats", async () => {
    await env.DB.prepare(
      `INSERT INTO magic_draft_archetype_stats
        (set_code, card_name, archetype, games_in_hand, games_played, games_not_seen,
         gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("DSK", "Gloomlake Verge", "UB", 3000, 4000, 1000, 0.59, 0.63, 0.56, 0.49, 0.07, 7.2, 8)
      .run();

    const row = await env.DB.prepare(
      "SELECT * FROM magic_draft_archetype_stats WHERE set_code = ? AND card_name = ? AND archetype = ?",
    )
      .bind("DSK", "Gloomlake Verge", "UB")
      .first<{ gihwr: number; archetype: string }>();

    expect(row).not.toBeNull();
    expect(row!.archetype).toBe("UB");
    expect(row!.gihwr).toBeCloseTo(0.59, 3);
  });

  it("JOIN between ratings and color stats", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_draft_ratings
          (set_code, card_name, gihwr, iwd) VALUES (?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", 0.564, 0.06),
      env.DB.prepare(
        `INSERT INTO magic_draft_archetype_stats
          (set_code, card_name, archetype, gihwr, iwd) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "UB", 0.59, 0.07),
      env.DB.prepare(
        `INSERT INTO magic_draft_archetype_stats
          (set_code, card_name, archetype, gihwr, iwd) VALUES (?, ?, ?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", "BG", 0.52, 0.03),
    ]);

    const results = await env.DB.prepare(
      `SELECT r.card_name, r.gihwr AS overall_gihwr, c.archetype, c.gihwr AS color_gihwr
       FROM magic_draft_ratings r
       JOIN magic_draft_archetype_stats c
         ON r.set_code = c.set_code AND r.card_name = c.card_name
       WHERE r.set_code = ? AND r.card_name = ?
       ORDER BY c.archetype`,
    )
      .bind("DSK", "Gloomlake Verge")
      .all<{ card_name: string; overall_gihwr: number; archetype: string; color_gihwr: number }>();

    expect(results.results.length).toBe(2);
    expect(results.results[0]!.archetype).toBe("BG");
    expect(results.results[1]!.archetype).toBe("UB");
    expect(results.results[0]!.overall_gihwr).toBeCloseTo(0.564, 3);
  });

  it("set stats table stores aggregate data", async () => {
    await env.DB.prepare(
      `INSERT INTO magic_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind("DSK", "PremierDraft", 250_000, 245, 0.515)
      .run();

    const row = await env.DB.prepare("SELECT * FROM magic_draft_set_stats WHERE set_code = ?")
      .bind("DSK")
      .first<{ total_games: number; card_count: number; avg_gihwr: number }>();

    expect(row).not.toBeNull();
    expect(row!.total_games).toBe(250_000);
    expect(row!.avg_gihwr).toBeCloseTo(0.515, 3);
  });

  it("FTS5 search on card names in ratings", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_draft_ratings (set_code, card_name, gihwr) VALUES (?, ?, ?)`,
      ).bind("DSK", "Gloomlake Verge", 0.564),
      env.DB.prepare(
        `INSERT INTO magic_draft_ratings (set_code, card_name, gihwr) VALUES (?, ?, ?)`,
      ).bind("DSK", "Lightning Bolt", 0.58),
      env.DB.prepare(
        "INSERT INTO magic_draft_ratings_fts (set_code, card_name) VALUES (?, ?)",
      ).bind("DSK", "Gloomlake Verge"),
      env.DB.prepare(
        "INSERT INTO magic_draft_ratings_fts (set_code, card_name) VALUES (?, ?)",
      ).bind("DSK", "Lightning Bolt"),
    ]);

    const results = await env.DB.prepare(
      `SELECT set_code, card_name FROM magic_draft_ratings_fts WHERE magic_draft_ratings_fts MATCH ? LIMIT 10`,
    )
      .bind("gloomlake")
      .all<{ set_code: string; card_name: string }>();

    expect(results.results.length).toBe(1);
    expect(results.results[0]!.card_name).toBe("Gloomlake Verge");
  });

  it("leaderboard query sorts by gihwr", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO magic_draft_ratings (set_code, card_name, gihwr, iwd) VALUES (?, ?, ?, ?)`,
      ).bind("DSK", "Card A", 0.6, 0.08),
      env.DB.prepare(
        `INSERT INTO magic_draft_ratings (set_code, card_name, gihwr, iwd) VALUES (?, ?, ?, ?)`,
      ).bind("DSK", "Card B", 0.55, 0.04),
      env.DB.prepare(
        `INSERT INTO magic_draft_ratings (set_code, card_name, gihwr, iwd) VALUES (?, ?, ?, ?)`,
      ).bind("DSK", "Card C", 0.58, 0.06),
    ]);

    const results = await env.DB.prepare(
      `SELECT card_name, gihwr FROM magic_draft_ratings WHERE set_code = ? ORDER BY gihwr DESC LIMIT 10`,
    )
      .bind("DSK")
      .all<{ card_name: string; gihwr: number }>();

    expect(results.results.length).toBe(3);
    expect(results.results[0]!.card_name).toBe("Card A");
    expect(results.results[1]!.card_name).toBe("Card C");
    expect(results.results[2]!.card_name).toBe("Card B");
  });
});
