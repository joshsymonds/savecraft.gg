import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { deriveFormat } from "../src/magic/format";
import { storePush } from "../src/store";
import type { SectionInput } from "../src/store";

import { cleanAll, seedSource } from "./helpers";

/** Build a match:{id} section mimicking the MTGA plugin output. */
function matchSection(overrides: Record<string, unknown> = {}): SectionInput {
  return {
    description: "Match result",
    data: {
      matchId: "match-001",
      eventId: "Constructed_Event_2026_Standard_Ranked",
      date: "2026-03-26T12:00:00Z",
      result: "win",
      opponent: {
        name: "Opponent123",
        rank: "Platinum",
        tier: 3,
        cardsSeen: [
          { name: "Sheoldred, the Apocalypse", arenaId: 87_521 },
          { name: "Go for the Throat", arenaId: 91_234 },
        ],
      },
      player: { name: "Me", seat: 1 },
      games: [
        { gameNumber: 1, winningSeat: 1 },
        { gameNumber: 2, winningSeat: 2 },
        { gameNumber: 3, winningSeat: 1 },
      ],
      ...overrides,
    },
  };
}

describe("MTGA Constructed match ingest", () => {
  beforeEach(cleanAll);

  it("ingests matches from match: sections on storePush", async () => {
    const { sourceUuid } = await seedSource("user-abc");

    const sections: Record<string, SectionInput> = {
      player_summary: {
        description: "Player overview",
        data: { display_name: "Me" },
      },
      "match:match-001": matchSection(),
      "match:match-002": matchSection({
        matchId: "match-002",
        eventId: "Historic_Ranked",
        result: "loss",
        opponent: { name: "HistoricPlayer", cardsSeen: [] },
      }),
      "match:match-003": matchSection({
        matchId: "match-003",
        eventId: "Explorer_Ranked",
        result: "win",
        opponent: {
          name: "ExplorerFan",
          rank: "Diamond",
          cardsSeen: [{ name: "Fable of the Mirror-Breaker", arenaId: 80_001 }],
        },
      }),
    };

    await storePush(
      env,
      "user-abc",
      sourceUuid,
      "magic",
      "Player",
      "Gold 4 Constructed",
      new Date().toISOString(),
      sections,
    );

    // All 3 matches should be in magic_match_history
    const rows = await env.DB.prepare(
      "SELECT * FROM magic_match_history WHERE user_uuid = ? ORDER BY match_id",
    )
      .bind("user-abc")
      .all<{
        match_id: string;
        format: string;
        result: string;
        opponent_name: string;
        opponent_rank: string;
        opponent_cards: string;
      }>();

    expect(rows.results).toHaveLength(3);

    // Match 1: Standard from event ID
    expect(rows.results[0]!.match_id).toBe("match-001");
    expect(rows.results[0]!.format).toBe("Standard");
    expect(rows.results[0]!.result).toBe("win");
    expect(rows.results[0]!.opponent_name).toBe("Opponent123");
    expect(rows.results[0]!.opponent_rank).toBe("Platinum");
    const cards = JSON.parse(rows.results[0]!.opponent_cards);
    expect(cards).toHaveLength(2);
    expect(cards[0].name).toBe("Sheoldred, the Apocalypse");

    // Match 2: Historic
    expect(rows.results[1]!.format).toBe("Historic");
    expect(rows.results[1]!.result).toBe("loss");

    // Match 3: Explorer
    expect(rows.results[2]!.format).toBe("Explorer");
  });

  it("is idempotent — duplicate matches are ignored", async () => {
    const { sourceUuid } = await seedSource("user-abc");

    const sections: Record<string, SectionInput> = {
      player_summary: { description: "Overview", data: {} },
      "match:match-001": matchSection(),
    };

    // Push twice with different timestamps so storePush doesn't short-circuit
    await storePush(
      env,
      "user-abc",
      sourceUuid,
      "magic",
      "Player",
      "Gold 4",
      "2026-03-26T12:00:00Z",
      sections,
    );

    await storePush(
      env,
      "user-abc",
      sourceUuid,
      "magic",
      "Player",
      "Gold 4 updated",
      "2026-03-26T13:00:00Z",
      sections,
    );

    const count = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM magic_match_history WHERE user_uuid = ?",
    )
      .bind("user-abc")
      .first<{ n: number }>();

    expect(count!.n).toBe(1);
  });

  it("does not ingest for non-MTGA games", async () => {
    const { sourceUuid } = await seedSource("user-abc");

    const sections: Record<string, SectionInput> = {
      overview: { description: "Overview", data: { level: 42 } },
      "match:some-match": matchSection(),
    };

    await storePush(
      env,
      "user-abc",
      sourceUuid,
      "d2r", // Not MTGA
      "Atmus",
      "Level 42 Paladin",
      new Date().toISOString(),
      sections,
    );

    const count = await env.DB.prepare("SELECT COUNT(*) as n FROM magic_match_history").first<{
      n: number;
    }>();

    expect(count!.n).toBe(0);
  });

  it("does not ingest for unlinked sources (null userUuid)", async () => {
    const { sourceUuid } = await seedSource(null);

    const sections: Record<string, SectionInput> = {
      player_summary: { description: "Overview", data: {} },
      "match:match-001": matchSection(),
    };

    await storePush(
      env,
      null,
      sourceUuid,
      "magic",
      "Player",
      "Gold 4",
      new Date().toISOString(),
      sections,
    );

    const count = await env.DB.prepare("SELECT COUNT(*) as n FROM magic_match_history").first<{
      n: number;
    }>();

    expect(count!.n).toBe(0);
  });
});

describe("deriveFormat", () => {
  it.each([
    ["Constructed_Event_2026_Standard_Ranked", "Standard"],
    ["Historic_Ranked", "Historic"],
    ["Alchemy_Ranked", "Alchemy"],
    ["Explorer_Ranked", "Explorer"],
    ["Timeless_Ranked", "Timeless"],
    ["Brawl_Queue", "Brawl"],
    ["StandardBrawl_2026", "Standard Brawl"],
    ["Ladder", "Standard"],
    ["Play", "Standard"],
    ["Traditional_Constructed_Event_2026_Standard", "Standard"],
  ])("derives format from %s → %s", (eventId, expected) => {
    expect(deriveFormat(eventId)).toBe(expected);
  });

  it.each([
    ["QuickDraft_TMT_20260313", ""],
    ["PremierDraft_LCI_20260313", ""],
    ["Sealed_DSK_20260101", ""],
    ["TradDraft_FDN_20260101", ""],
  ])("returns empty for Limited event %s", (eventId, expected) => {
    expect(deriveFormat(eventId)).toBe(expected);
  });

  it("returns empty for unrecognized events", () => {
    expect(deriveFormat("SomeFutureEvent_Unknown")).toBe("");
  });
});
