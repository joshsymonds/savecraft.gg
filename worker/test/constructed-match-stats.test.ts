import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { matchStatsModule } from "../../plugins/mtga/reference/match-stats";

import { cleanAll } from "./helpers";

// ── Seed helpers ─────────────────────────────────────────────

async function seedCards(): Promise<void> {
  await env.DB.batch([
    // Red aggro cards
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(1001, "o-1001", "Monastery Swiftspear", "{R}", 1, "Creature — Human Monk", '["R"]', '["R"]', "uncommon", "FDN"),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(1002, "o-1002", "Play with Fire", "{R}", 1, "Instant", '["R"]', '["R"]', "uncommon", "MID"),
    // Black midrange cards
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(1003, "o-1003", "Sheoldred, the Apocalypse", "{2}{B}{B}", 4, "Legendary Creature — Phyrexian Praetor", '["B"]', '["B"]', "mythic", "DMU"),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(1004, "o-1004", "Go for the Throat", "{1}{B}", 2, "Instant", '["B"]', '["B"]', "uncommon", "BRO"),
    // Blue-white control cards
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(1005, "o-1005", "Teferi, Hero of Dominaria", "{3}{W}{U}", 5, "Legendary Planeswalker — Teferi", '["W","U"]', '["W","U"]', "mythic", "DOM"),
    env.DB.prepare(
      `INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(1006, "o-1006", "Absorb", "{W}{U}{U}", 3, "Instant", '["W","U"]', '["W","U"]', "rare", "RNA"),
  ]);
}

async function seedMatches(): Promise<void> {
  const matches = [
    // Standard matches with Grixis deck
    { id: "m1", user: "user-abc", event: "Constructed_Standard_Ranked", format: "Standard", deck: "Grixis Midrange", result: "win", oppName: "Opp1", oppRank: "Platinum", oppCards: '[{"name":"Monastery Swiftspear","arena_id":1001},{"name":"Play with Fire","arena_id":1002}]', date: "2026-03-20T10:00:00Z" },
    { id: "m2", user: "user-abc", event: "Constructed_Standard_Ranked", format: "Standard", deck: "Grixis Midrange", result: "win", oppName: "Opp2", oppRank: "Diamond", oppCards: '[{"name":"Monastery Swiftspear","arena_id":1001}]', date: "2026-03-21T10:00:00Z" },
    { id: "m3", user: "user-abc", event: "Constructed_Standard_Ranked", format: "Standard", deck: "Grixis Midrange", result: "loss", oppName: "Opp3", oppRank: "Mythic", oppCards: '[{"name":"Teferi, Hero of Dominaria","arena_id":1005},{"name":"Absorb","arena_id":1006}]', date: "2026-03-22T10:00:00Z" },
    { id: "m4", user: "user-abc", event: "Constructed_Standard_Ranked", format: "Standard", deck: "Grixis Midrange", result: "win", oppName: "Opp4", oppRank: "Gold", oppCards: '[{"name":"Sheoldred, the Apocalypse","arena_id":1003},{"name":"Go for the Throat","arena_id":1004}]', date: "2026-03-23T10:00:00Z" },
    // Historic match with different deck
    { id: "m5", user: "user-abc", event: "Historic_Ranked", format: "Historic", deck: "Izzet Phoenix", result: "loss", oppName: "Opp5", oppRank: "Platinum", oppCards: '[]', date: "2026-03-24T10:00:00Z" },
    // Another user's match (should not appear)
    { id: "m6", user: "user-xyz", event: "Constructed_Standard_Ranked", format: "Standard", deck: "Mono Red", result: "win", oppName: "OppX", oppRank: "Gold", oppCards: '[]', date: "2026-03-25T10:00:00Z" },
  ];

  for (const m of matches) {
    await env.DB.prepare(
      `INSERT INTO mtga_match_history
        (match_id, user_uuid, event_id, format, deck_name, result, opponent_name, opponent_rank, opponent_cards, played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(m.id, m.user, m.event, m.format, m.deck, m.result, m.oppName, m.oppRank, m.oppCards, m.date).run();
  }
}

describe("match_stats reference module", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCards();
    await seedMatches();
  });

  it("returns overview stats for a user", async () => {
    const result = await matchStatsModule.execute(
      { mode: "overview", user_id: "user-abc" },
      env,
    );
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;

    // Should show total matches, overall win rate
    expect(content).toContain("5 matches");
    expect(content).toContain("60.0%"); // 3 wins / 5 total
    // Should break down by format
    expect(content).toContain("Standard");
    expect(content).toContain("Historic");
  });

  it("returns stats by deck", async () => {
    const result = await matchStatsModule.execute(
      { mode: "by_deck", user_id: "user-abc" },
      env,
    );
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;

    expect(content).toContain("Grixis Midrange");
    expect(content).toContain("75.0%"); // 3W 1L
    expect(content).toContain("Izzet Phoenix");
    expect(content).toContain("0.0%"); // 0W 1L
  });

  it("returns stats by format", async () => {
    const result = await matchStatsModule.execute(
      { mode: "by_format", user_id: "user-abc" },
      env,
    );
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;

    expect(content).toContain("Standard");
    expect(content).toContain("75.0%"); // 3W 1L in Standard
    expect(content).toContain("Historic");
    expect(content).toContain("0.0%"); // 0W 1L in Historic
  });

  it("classifies opponent archetypes from cards seen", async () => {
    const result = await matchStatsModule.execute(
      { mode: "by_matchup", user_id: "user-abc" },
      env,
    );
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;

    // Opp1 + Opp2 played red cards → should be classified as Red-based
    // Opp3 played WU cards → should be classified as WU-based
    // Opp4 played B cards → should be classified as B-based
    // Exact labels depend on implementation, but should have distinct archetypes
    expect(content).toMatch(/[Rr]ed/); // Red archetype from Monastery Swiftspear
    expect(content).toMatch(/[Ww]hite.*[Bb]lue|Azorius|WU/); // WU archetype from Teferi + Absorb
  });

  it("returns recent trend", async () => {
    const result = await matchStatsModule.execute(
      { mode: "trend", user_id: "user-abc", count: 3 },
      env,
    );
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;

    // Last 3 matches: m5 (loss), m4 (win), m3 (loss) → 33.3%
    expect(content).toContain("3");
    expect(content).toMatch(/33\.3%/);
  });

  it("returns error for missing user_id", async () => {
    const result = await matchStatsModule.execute(
      { mode: "overview" },
      env,
    );
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;
    expect(content).toMatch(/user_id.*required/i);
  });

  it("returns empty state gracefully", async () => {
    const result = await matchStatsModule.execute(
      { mode: "overview", user_id: "user-nonexistent" },
      env,
    );
    expect(result.type).toBe("formatted");
    const content = (result as { type: "formatted"; content: string }).content;
    expect(content).toMatch(/no match/i);
  });
});
