import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sideboardAnalysisModule } from "../../plugins/magic/reference/sideboard-analysis";

import { cleanAll } from "./helpers";

// ── Seed helpers ─────────────────────────────────────────────

async function seedCards(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `scry-17`,
      1001,
      "o-1001",
      "Monastery Swiftspear",
      "{R}",
      1,
      "Creature",
      '["R"]',
      '["R"]',
      "uncommon",
      "FDN",
    ),
    env.DB.prepare(
      `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `scry-18`,
      1005,
      "o-1005",
      "Teferi, Hero of Dominaria",
      "{3}{W}{U}",
      5,
      "Planeswalker",
      '["W","U"]',
      '["W","U"]',
      "mythic",
      "DOM",
    ),
    env.DB.prepare(
      `INSERT INTO magic_cards (scryfall_id, arena_id, oracle_id, name, mana_cost, cmc, type_line, colors, color_identity, rarity, set_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `scry-19`,
      1003,
      "o-1003",
      "Sheoldred, the Apocalypse",
      "{2}{B}{B}",
      4,
      "Creature",
      '["B"]',
      '["B"]',
      "mythic",
      "DMU",
    ),
  ]);
}

/** Seed BO3 matches with per-game results.
 * player_seat=1 in all cases. winning_seat determines who won each game.
 */
async function seedBO3Matches(): Promise<void> {
  const matches = [
    // vs Red: Win G1, Lose G2, Lose G3 (sideboarding hurts)
    {
      id: "bo3-1",
      user: "user-abc",
      format: "Standard",
      result: "loss",
      oppCards: '[{"name":"Monastery Swiftspear","arena_id":1001}]',
      games:
        '[{"game_number":1,"winning_seat":1,"player_seat":1},{"game_number":2,"winning_seat":2,"player_seat":1},{"game_number":3,"winning_seat":2,"player_seat":1}]',
      date: "2026-03-20T10:00:00Z",
    },
    // vs Red: Win G1, Win G2 (sideboarding fine, 2-0)
    {
      id: "bo3-2",
      user: "user-abc",
      format: "Standard",
      result: "win",
      oppCards: '[{"name":"Monastery Swiftspear","arena_id":1001}]',
      games:
        '[{"game_number":1,"winning_seat":1,"player_seat":1},{"game_number":2,"winning_seat":1,"player_seat":1}]',
      date: "2026-03-21T10:00:00Z",
    },
    // vs Red: Lose G1, Win G2, Win G3 (sideboarding helps)
    {
      id: "bo3-3",
      user: "user-abc",
      format: "Standard",
      result: "win",
      oppCards: '[{"name":"Monastery Swiftspear","arena_id":1001}]',
      games:
        '[{"game_number":1,"winning_seat":2,"player_seat":1},{"game_number":2,"winning_seat":1,"player_seat":1},{"game_number":3,"winning_seat":1,"player_seat":1}]',
      date: "2026-03-22T10:00:00Z",
    },
    // vs Azorius: Lose G1, Lose G2 (bad matchup pre and post board)
    {
      id: "bo3-4",
      user: "user-abc",
      format: "Standard",
      result: "loss",
      oppCards: '[{"name":"Teferi, Hero of Dominaria","arena_id":1005}]',
      games:
        '[{"game_number":1,"winning_seat":2,"player_seat":1},{"game_number":2,"winning_seat":2,"player_seat":1}]',
      date: "2026-03-23T10:00:00Z",
    },
    // vs Azorius: Win G1, Lose G2, Win G3 (sideboarding works out)
    {
      id: "bo3-5",
      user: "user-abc",
      format: "Standard",
      result: "win",
      oppCards: '[{"name":"Teferi, Hero of Dominaria","arena_id":1005}]',
      games:
        '[{"game_number":1,"winning_seat":1,"player_seat":1},{"game_number":2,"winning_seat":2,"player_seat":1},{"game_number":3,"winning_seat":1,"player_seat":1}]',
      date: "2026-03-24T10:00:00Z",
    },
    // BO1 match (should be excluded from sideboard analysis)
    {
      id: "bo1-1",
      user: "user-abc",
      format: "Standard",
      result: "win",
      oppCards: '[{"name":"Sheoldred, the Apocalypse","arena_id":1003}]',
      games: '[{"game_number":1,"winning_seat":1,"player_seat":1}]',
      date: "2026-03-25T10:00:00Z",
    },
  ];

  for (const m of matches) {
    await env.DB.prepare(
      `INSERT INTO magic_match_history
        (match_id, user_uuid, event_id, format, deck_name, result,
         game_results, opponent_name, opponent_rank, opponent_cards, played_at)
       VALUES (?, ?, 'event', ?, '', ?, ?, '', '', ?, ?)`,
    )
      .bind(m.id, m.user, m.format, m.result, m.games, m.oppCards, m.date)
      .run();
  }
}

describe("sideboard_analysis reference module", () => {
  beforeEach(async () => {
    await cleanAll();
    await seedCards();
    await seedBO3Matches();
  });

  it("returns BO3 overview with G1 vs post-board win rates", async () => {
    const result = await sideboardAnalysisModule.execute(
      { mode: "bo3_overview", user_id: "user-abc" },
      env,
    );
    expect(result.type).toBe("text");
    const content = (result as { type: "text"; content: string }).content;

    // 5 BO3 matches (BO1 excluded)
    expect(content).toContain("5 best-of-three");
    // G1: won 3/5 (bo3-1 W, bo3-2 W, bo3-3 L, bo3-4 L, bo3-5 W) = 60%
    expect(content).toContain("60.0%");
  });

  it("returns per-archetype post-board analysis", async () => {
    const result = await sideboardAnalysisModule.execute(
      { mode: "by_matchup", user_id: "user-abc" },
      env,
    );
    expect(result.type).toBe("text");
    const content = (result as { type: "text"; content: string }).content;

    // Should show Red and Azorius/WU archetypes
    expect(content).toMatch(/[Rr]ed/);
    expect(content).toMatch(/Azorius|WU/);
  });

  it("excludes BO1 matches", async () => {
    const result = await sideboardAnalysisModule.execute(
      { mode: "bo3_overview", user_id: "user-abc" },
      env,
    );
    const content = (result as { type: "text"; content: string }).content;

    // Should NOT include Mono Black (the BO1 opponent)
    expect(content).not.toContain("Mono Black");
  });

  it("returns error for missing user_id", async () => {
    const result = await sideboardAnalysisModule.execute({ mode: "bo3_overview" }, env);
    const content = (result as { type: "text"; content: string }).content;
    expect(content).toMatch(/user_id.*required/i);
  });

  it("handles empty match history", async () => {
    const result = await sideboardAnalysisModule.execute(
      { mode: "bo3_overview", user_id: "user-nobody" },
      env,
    );
    const content = (result as { type: "text"; content: string }).content;
    expect(content).toMatch(/no.*match/i);
  });
});
