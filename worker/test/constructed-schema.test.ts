import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

describe("MTGA Constructed D1 schema", () => {
  beforeEach(cleanAll);

  // ── mtga_match_history ───────────────────────────────────

  it("inserts and retrieves match history", async () => {
    await env.DB.prepare(
      `INSERT INTO mtga_match_history
        (match_id, user_uuid, event_id, format, deck_name, result,
         game_results, opponent_name, opponent_rank, opponent_cards, played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "match-001",
        "user-abc",
        "Constructed_Event_2026_Standard_Ranked",
        "Standard",
        "Grixis Midrange",
        "win",
        '[{"game_number":1,"winning_seat":1,"player_seat":1},{"game_number":2,"winning_seat":2,"player_seat":1},{"game_number":3,"winning_seat":1,"player_seat":1}]',
        "Opponent123",
        "Platinum",
        '[{"name":"Sheoldred, the Apocalypse","arena_id":87521},{"name":"Go for the Throat","arena_id":91234}]',
        "2026-03-26T12:00:00Z",
      )
      .run();

    const row = await env.DB.prepare(
      "SELECT * FROM mtga_match_history WHERE match_id = ?",
    )
      .bind("match-001")
      .first<{
        match_id: string;
        user_uuid: string;
        format: string;
        deck_name: string;
        result: string;
        opponent_cards: string;
      }>();

    expect(row).toBeTruthy();
    expect(row!.user_uuid).toBe("user-abc");
    expect(row!.format).toBe("Standard");
    expect(row!.deck_name).toBe("Grixis Midrange");
    expect(row!.result).toBe("win");
    expect(JSON.parse(row!.opponent_cards)).toHaveLength(2);
  });

  it("queries win rate by user and format", async () => {
    const matches = [
      ["match-1", "user-abc", "Standard", "Grixis Midrange", "win"],
      ["match-2", "user-abc", "Standard", "Grixis Midrange", "win"],
      ["match-3", "user-abc", "Standard", "Grixis Midrange", "loss"],
      ["match-4", "user-abc", "Historic", "Grixis Midrange", "win"],
      ["match-5", "user-xyz", "Standard", "Mono Red", "loss"],
    ] as const;

    for (const [matchId, user, format, deck, result] of matches) {
      await env.DB.prepare(
        `INSERT INTO mtga_match_history
          (match_id, user_uuid, event_id, format, deck_name, result, played_at)
         VALUES (?, ?, 'event', ?, ?, ?, '2026-03-26T12:00:00Z')`,
      )
        .bind(matchId, user, format, deck, result)
        .run();
    }

    // User abc Standard: 2W 1L
    const stats = await env.DB.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins
       FROM mtga_match_history
       WHERE user_uuid = ? AND format = ?`,
    )
      .bind("user-abc", "Standard")
      .first<{ total: number; wins: number }>();

    expect(stats!.total).toBe(3);
    expect(stats!.wins).toBe(2);

    // User abc Historic: 1W
    const historic = await env.DB.prepare(
      `SELECT COUNT(*) as total
       FROM mtga_match_history
       WHERE user_uuid = ? AND format = ?`,
    )
      .bind("user-abc", "Historic")
      .first<{ total: number }>();

    expect(historic!.total).toBe(1);

    // User xyz should not see abc's matches
    const other = await env.DB.prepare(
      `SELECT COUNT(*) as total
       FROM mtga_match_history
       WHERE user_uuid = ?`,
    )
      .bind("user-xyz")
      .first<{ total: number }>();

    expect(other!.total).toBe(1);
  });

  it("deduplicates on match_id (PRIMARY KEY)", async () => {
    await env.DB.prepare(
      `INSERT INTO mtga_match_history
        (match_id, user_uuid, event_id, format, result, played_at)
       VALUES ('dup-1', 'user-abc', 'event', 'Standard', 'win', '2026-03-26T12:00:00Z')`,
    ).run();

    // INSERT OR REPLACE should update
    await env.DB.prepare(
      `INSERT OR REPLACE INTO mtga_match_history
        (match_id, user_uuid, event_id, format, result, played_at)
       VALUES ('dup-1', 'user-abc', 'event', 'Standard', 'loss', '2026-03-26T12:00:00Z')`,
    ).run();

    const row = await env.DB.prepare(
      "SELECT result FROM mtga_match_history WHERE match_id = 'dup-1'",
    ).first<{ result: string }>();

    expect(row!.result).toBe("loss");
  });

  // ── mtga_meta_archetypes ─────────────────────────────────

  it("inserts and queries metagame archetypes", async () => {
    const archetypes = [
      ["Standard", "Grixis Midrange", 0.15, 0.54, 1200],
      ["Standard", "Mono Red Aggro", 0.12, 0.51, 980],
      ["Standard", "Azorius Control", 0.1, 0.49, 850],
    ] as const;

    for (const [format, name, share, wr, size] of archetypes) {
      await env.DB.prepare(
        `INSERT INTO mtga_meta_archetypes
          (format, archetype_name, metagame_share, win_rate, sample_size, last_updated)
         VALUES (?, ?, ?, ?, ?, '2026-03-26T00:00:00Z')`,
      )
        .bind(format, name, share, wr, size)
        .run();
    }

    const rows = await env.DB.prepare(
      `SELECT archetype_name, metagame_share, win_rate
       FROM mtga_meta_archetypes
       WHERE format = ?
       ORDER BY metagame_share DESC`,
    )
      .bind("Standard")
      .all<{ archetype_name: string; metagame_share: number; win_rate: number }>();

    expect(rows.results).toHaveLength(3);
    expect(rows.results[0].archetype_name).toBe("Grixis Midrange");
    expect(rows.results[0].metagame_share).toBeCloseTo(0.15);
  });

  // ── mtga_meta_decklists ──────────────────────────────────

  it("inserts and queries tournament decklists", async () => {
    const decklist = JSON.stringify({
      main: [
        { name: "Sheoldred, the Apocalypse", count: 4 },
        { name: "Go for the Throat", count: 3 },
      ],
      sideboard: [{ name: "Negate", count: 2 }],
    });

    await env.DB.prepare(
      `INSERT INTO mtga_meta_decklists
        (format, archetype_name, tournament_id, tournament_name, player_name, placement, decklist, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "Standard",
        "Grixis Midrange",
        "tourney-001",
        "Pro Tour Chicago 2026",
        "PlayerOne",
        1,
        decklist,
        "2026-03-20T00:00:00Z",
      )
      .run();

    const rows = await env.DB.prepare(
      `SELECT * FROM mtga_meta_decklists WHERE format = ? AND archetype_name = ?`,
    )
      .bind("Standard", "Grixis Midrange")
      .all<{ player_name: string; placement: number; decklist: string }>();

    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].player_name).toBe("PlayerOne");
    expect(rows.results[0].placement).toBe(1);
    expect(JSON.parse(rows.results[0].decklist).main).toHaveLength(2);
  });

  // ── mtga_meta_matchups ───────────────────────────────────

  it("inserts and queries matchup data", async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mtga_meta_matchups
          (format, archetype_a, archetype_b, win_rate_a, sample_size)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind("Standard", "Grixis Midrange", "Mono Red Aggro", 0.55, 200),
      env.DB.prepare(
        `INSERT INTO mtga_meta_matchups
          (format, archetype_a, archetype_b, win_rate_a, sample_size)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind("Standard", "Mono Red Aggro", "Grixis Midrange", 0.45, 200),
    ]);

    const row = await env.DB.prepare(
      `SELECT win_rate_a, sample_size
       FROM mtga_meta_matchups
       WHERE format = ? AND archetype_a = ? AND archetype_b = ?`,
    )
      .bind("Standard", "Grixis Midrange", "Mono Red Aggro")
      .first<{ win_rate_a: number; sample_size: number }>();

    expect(row!.win_rate_a).toBeCloseTo(0.55);
    expect(row!.sample_size).toBe(200);

    // Reverse direction
    const reverse = await env.DB.prepare(
      `SELECT win_rate_a FROM mtga_meta_matchups
       WHERE format = ? AND archetype_a = ? AND archetype_b = ?`,
    )
      .bind("Standard", "Mono Red Aggro", "Grixis Midrange")
      .first<{ win_rate_a: number }>();

    expect(reverse!.win_rate_a).toBeCloseTo(0.45);
  });
});
