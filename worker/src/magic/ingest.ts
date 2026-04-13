/**
 * Extract match history from MTGA save sections and upsert into D1.
 *
 * Called after storePush writes sections. Reads `match:{id}` sections
 * and inserts structured match records into magic_match_history.
 */

import type { SectionInput } from "../store";

import { deriveFormat } from "./format";

/** Shape of a MatchResult as output by the MTGA plugin's match:{id} sections. */
interface MatchResultData {
  matchId: string;
  eventId: string;
  date?: string;
  result: string;
  opponent?: {
    name?: string;
    rank?: string;
    tier?: number;
    cardsSeen?: { name: string; arenaId: number }[];
  };
  games?: { gameNumber: number; winningSeat: number; winCondition?: string }[];
  player?: { seat?: number };
}

function buildMatchStatement(
  db: D1Database,
  userUuid: string,
  m: MatchResultData,
): D1PreparedStatement {
  const format = deriveFormat(m.eventId);
  const seat = m.player?.seat ?? 0;
  const games = m.games ?? [];
  const cardsSeen = m.opponent?.cardsSeen ?? [];

  const gameResults = JSON.stringify(
    games.map((g) => ({
      game_number: g.gameNumber,
      winning_seat: g.winningSeat,
      player_seat: seat,
    })),
  );
  const opponentCards = JSON.stringify(
    cardsSeen.map((c) => ({ name: c.name, arena_id: c.arenaId })),
  );

  return db
    .prepare(
      `INSERT OR IGNORE INTO magic_match_history
        (match_id, user_uuid, event_id, format, deck_name, result,
         game_results, opponent_name, opponent_rank, opponent_cards, played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      m.matchId,
      userUuid,
      m.eventId,
      format,
      "", // deck_name — not available in match data, requires correlation
      m.result,
      gameResults,
      m.opponent?.name ?? "",
      m.opponent?.rank ?? "",
      opponentCards,
      m.date ?? new Date().toISOString(),
    );
}

/**
 * Ingest match history from MTGA push sections into magic_match_history.
 * Idempotent — uses INSERT OR IGNORE on (match_id, user_uuid) compound key.
 */
export async function ingestMatchHistory(
  db: D1Database,
  userUuid: string,
  sections: Record<string, SectionInput>,
): Promise<number> {
  const statements: D1PreparedStatement[] = [];

  for (const [name, section] of Object.entries(sections)) {
    if (!name.startsWith("match:")) continue;
    const m = section.data as unknown as MatchResultData;
    if (!m.matchId || !m.result) continue;
    statements.push(buildMatchStatement(db, userUuid, m));
  }

  if (statements.length === 0) return 0;

  await db.batch(statements);
  return statements.length;
}
