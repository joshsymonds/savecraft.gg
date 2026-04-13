/**
 * MTG Arena card_stats — native reference module.
 *
 * Browsing and exploration of 17Lands draft statistics: set listing,
 * set overviews, individual card detail with archetype breakdowns,
 * and leaderboards. No contextual draft evaluation — use draft_advisor for that.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { rn } from "./scoring";

const DEFAULT_PAGE_SIZE = 25;

interface RatingRow {
  set_code: string;
  card_name: string;
  games_in_hand: number;
  games_played: number;
  games_not_seen: number;
  gihwr: number;
  ohwr: number;
  gdwr: number;
  gnswr: number;
  iwd: number;
  alsa: number;
  ata: number;
}

interface ArchetypeRow extends RatingRow {
  archetype: string;
}

interface SetStatsRow {
  set_code: string;
  format: string;
  total_games: number;
  card_count: number;
  avg_gihwr: number;
}

const VALID_RARITIES = new Set(["common", "uncommon", "rare", "mythic"]);

const VALID_SORT_FIELDS = new Set([
  "gihwr",
  "ohwr",
  "gdwr",
  "gnswr",
  "iwd",
  "alsa",
  "ata",
]);

// ── Helpers ──────────────────────────────────────────────────

function cardRow(r: RatingRow) {
  return {
    card_name: r.card_name,
    gihwr: rn(r.gihwr, 4),
    ohwr: rn(r.ohwr, 4),
    gdwr: rn(r.gdwr, 4),
    gnswr: rn(r.gnswr, 4),
    iwd: rn(r.iwd, 4),
    alsa: rn(r.alsa, 2),
    ata: rn(r.ata, 2),
    games_in_hand: r.games_in_hand,
    games_played: r.games_played,
  };
}

// ── Query handlers ───────────────────────────────────────────

async function listAvailableSets(db: D1Database): Promise<ReferenceResult> {
  const rows = await db
    .prepare("SELECT * FROM magic_draft_set_stats ORDER BY set_code")
    .all<SetStatsRow>();

  if (rows.results.length === 0) {
    return { type: "text", content: "No draft ratings data available.\n" };
  }

  return {
    type: "structured",
    data: {
      sets: rows.results.map((r) => ({
        set_code: r.set_code,
        format: r.format,
        total_games: r.total_games,
        card_count: r.card_count,
        avg_gihwr: rn(r.avg_gihwr, 4),
      })),
    },
  };
}

async function setOverview(
  db: D1Database,
  setCode: string,
  setStats: SetStatsRow,
): Promise<ReferenceResult> {
  const allCards = await db
    .prepare(
      "SELECT * FROM magic_draft_ratings WHERE set_code = ?1 ORDER BY gihwr DESC",
    )
    .bind(setCode)
    .all<RatingRow>();

  const cards = allCards.results;
  const n = Math.min(5, cards.length);

  const topGihwr = cards.slice(0, n).map(cardRow);
  const bottomGihwr = cards.slice(Math.max(0, cards.length - n)).map(cardRow);
  const topIwd = [...cards].sort((a, b) => b.iwd - a.iwd).slice(0, n).map(cardRow);

  const byUndervalued = [...cards].sort(
    (a, b) => b.gihwr * b.alsa - a.gihwr * a.alsa,
  );
  const undervalued: ReturnType<typeof cardRow>[] = [];
  for (const c of byUndervalued) {
    if (c.alsa >= 4.0 && c.gihwr > setStats.avg_gihwr) {
      undervalued.push(cardRow(c));
      if (undervalued.length >= 5) break;
    }
  }

  return {
    type: "structured",
    data: {
      set_code: setCode,
      format: setStats.format,
      total_games: setStats.total_games,
      card_count: setStats.card_count,
      avg_gihwr: rn(setStats.avg_gihwr, 4),
      top_gihwr: topGihwr,
      bottom_gihwr: bottomGihwr,
      top_iwd: topIwd,
      undervalued,
    },
  };
}

async function cardDetail(
  db: D1Database,
  setCode: string,
  cardQuery: string,
  setStats: SetStatsRow,
): Promise<ReferenceResult> {
  const safeFtsQuery = `"${cardQuery.replace(/"/g, '""')}"`;
  const ftsResults = await db
    .prepare(
      `SELECT card_name FROM magic_draft_ratings_fts WHERE set_code = ?1 AND magic_draft_ratings_fts MATCH ?2 LIMIT 5`,
    )
    .bind(setCode, safeFtsQuery)
    .all<{ card_name: string }>();

  const likeResults = await db
    .prepare(
      `SELECT card_name FROM magic_draft_ratings WHERE set_code = ?1 AND card_name LIKE ?2 COLLATE NOCASE LIMIT 5`,
    )
    .bind(setCode, `%${cardQuery}%`)
    .all<{ card_name: string }>();

  const seen = new Set<string>();
  const matchNames: string[] = [];
  for (const r of [...ftsResults.results, ...likeResults.results]) {
    if (!seen.has(r.card_name)) {
      seen.add(r.card_name);
      matchNames.push(r.card_name);
    }
  }

  if (matchNames.length === 0) {
    return {
      type: "text",
      content: `No cards matching "${cardQuery}" in ${setCode}\n`,
    };
  }

  const placeholders = matchNames.map((_, i) => `?${i + 2}`).join(",");
  const ratings = await db
    .prepare(
      `SELECT * FROM magic_draft_ratings WHERE set_code = ?1 AND card_name IN (${placeholders})`,
    )
    .bind(setCode, ...matchNames)
    .all<RatingRow>();

  const colorStats = await db
    .prepare(
      `SELECT * FROM magic_draft_archetype_stats WHERE set_code = ?1 AND card_name IN (${placeholders}) ORDER BY archetype`,
    )
    .bind(setCode, ...matchNames)
    .all<ArchetypeRow>();

  const colorsByCard = new Map<string, ArchetypeRow[]>();
  for (const r of colorStats.results) {
    let list = colorsByCard.get(r.card_name);
    if (!list) {
      list = [];
      colorsByCard.set(r.card_name, list);
    }
    list.push(r);
  }

  const cardResults = ratings.results.slice(0, 5).map((card) => {
    const colors = colorsByCard.get(card.card_name) ?? [];
    return {
      ...cardRow(card),
      set_avg_gihwr: rn(setStats.avg_gihwr, 4),
      archetypes: colors.map((cs) => ({
        archetype: cs.archetype,
        gihwr: rn(cs.gihwr, 4),
        iwd: rn(cs.iwd, 4),
        games_in_hand: cs.games_in_hand,
      })),
    };
  });

  return {
    type: "structured",
    data: {
      set_code: setCode,
      format: setStats.format,
      query: cardQuery,
      cards: cardResults,
      more: ratings.results.length > 5 ? ratings.results.length - 5 : 0,
    },
  };
}

async function leaderboard(
  db: D1Database,
  setCode: string,
  sortField: string,
  archetype: string,
  rarity: string,
  limit: number,
  offset: number,
  setStats: SetStatsRow,
): Promise<ReferenceResult> {
  const field = VALID_SORT_FIELDS.has(sortField) ? sortField : "gihwr";
  const direction = field === "alsa" || field === "ata" ? "ASC" : "DESC";

  let rows: RatingRow[];
  let total: number;

  if (archetype) {
    const rarityJoin = rarity
      ? " JOIN magic_cards c ON c.front_face_name = a.card_name AND c.is_default = 1 AND c.rarity = ?3 AND c.type_line NOT LIKE 'Basic%Land%'"
      : "";

    const countBinds = rarity
      ? [setCode, archetype.toUpperCase(), rarity]
      : [setCode, archetype.toUpperCase()];
    const countResult = await db
      .prepare(
        `SELECT COUNT(*) as cnt FROM magic_draft_archetype_stats a${rarityJoin} WHERE a.set_code = ?1 AND a.archetype = ?2`,
      )
      .bind(...countBinds)
      .first<{ cnt: number }>();
    total = countResult?.cnt ?? 0;

    const queryBinds = rarity
      ? [setCode, archetype.toUpperCase(), rarity, limit, offset]
      : [setCode, archetype.toUpperCase(), limit, offset];
    const limitParam = rarity ? "?4" : "?3";
    const offsetParam = rarity ? "?5" : "?4";
    const result = await db
      .prepare(
        `SELECT a.set_code, a.card_name, a.games_in_hand, a.games_played, a.games_not_seen, a.gihwr, a.ohwr, a.gdwr, a.gnswr, a.iwd, a.alsa, a.ata FROM magic_draft_archetype_stats a${rarityJoin} WHERE a.set_code = ?1 AND a.archetype = ?2 ORDER BY a.${field} ${direction} LIMIT ${limitParam} OFFSET ${offsetParam}`,
      )
      .bind(...queryBinds)
      .all<RatingRow>();
    rows = result.results;
  } else if (rarity) {
    const countResult = await db
      .prepare(
        "SELECT COUNT(*) as cnt FROM magic_draft_ratings r JOIN magic_cards c ON c.front_face_name = r.card_name AND c.is_default = 1 AND c.rarity = ?2 AND c.type_line NOT LIKE 'Basic%Land%' WHERE r.set_code = ?1",
      )
      .bind(setCode, rarity)
      .first<{ cnt: number }>();
    total = countResult?.cnt ?? 0;

    const result = await db
      .prepare(
        `SELECT r.* FROM magic_draft_ratings r JOIN magic_cards c ON c.front_face_name = r.card_name AND c.is_default = 1 AND c.rarity = ?2 AND c.type_line NOT LIKE 'Basic%Land%' WHERE r.set_code = ?1 ORDER BY r.${field} ${direction} LIMIT ?3 OFFSET ?4`,
      )
      .bind(setCode, rarity, limit, offset)
      .all<RatingRow>();
    rows = result.results;
  } else {
    const countResult = await db
      .prepare(
        "SELECT COUNT(*) as cnt FROM magic_draft_ratings WHERE set_code = ?1",
      )
      .bind(setCode)
      .first<{ cnt: number }>();
    total = countResult?.cnt ?? 0;

    const result = await db
      .prepare(
        `SELECT * FROM magic_draft_ratings WHERE set_code = ?1 ORDER BY ${field} ${direction} LIMIT ?2 OFFSET ?3`,
      )
      .bind(setCode, limit, offset)
      .all<RatingRow>();
    rows = result.results;
  }

  return {
    type: "structured",
    data: {
      set_code: setCode,
      format: setStats.format,
      avg_gihwr: rn(setStats.avg_gihwr, 4),
      sort_by: field,
      archetype: archetype || null,
      offset,
      total,
      cards: rows.map((r, i) => ({
        rank: offset + i + 1,
        ...cardRow(r),
      })),
    },
  };
}

// ── Module definition ────────────────────────────────────────

export const cardStatsModule: NativeReferenceModule = {
  id: "card_stats",
  name: "Card Stats",
  description: [
    "Browse 17Lands draft statistics for MTG Arena.",
    "",
    "MODES:",
    "1. No parameters → list available sets.",
    "2. set only → set overview (top/bottom by GIH WR, top IWD, undervalued cards).",
    "3. set + card → single card detail with archetype breakdowns (GIH WR, IWD, OHWR per color pair).",
    "4. set + sort → leaderboard sorted by any stat, filterable by archetype.",
    "",
    "This module is for browsing card stats. To evaluate draft picks in context (synergy, curve, role, signal, castability), use draft_advisor instead.",
    "",
    "Data source: 17Lands (17lands.com), licensed CC BY 4.0.",
  ].join("\n"),
  parameters: {
    set: {
      type: "string",
      description:
        "Set code (e.g., 'DSK'). Required for all queries except listing available sets.",
    },
    card: {
      type: "string",
      description:
        "Card name search (fuzzy). Returns detailed stats including color pair breakdowns.",
    },
    colors: {
      type: "string",
      description:
        "Color pair filter for archetype-specific stats (e.g., 'UB').",
    },
    rarity: {
      type: "string",
      description:
        "Filter by card rarity: 'common', 'uncommon', 'rare', 'mythic'.",
    },
    sort: {
      type: "string",
      description:
        "Sort field for leaderboard: 'gihwr' (default), 'ohwr', 'iwd', 'alsa', 'ata'.",
    },
    limit: {
      type: "integer",
      description: "Max results for leaderboard (default 25).",
    },
    offset: {
      type: "integer",
      description: "Pagination offset for leaderboard.",
    },
  },


  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const setCode = ((query.set as string) ?? "").toUpperCase();
    const card = (query.card as string) ?? "";
    const colors = ((query.colors as string) ?? "").toUpperCase();
    const rawRarity = ((query.rarity as string) ?? "").toLowerCase();
    const rarity = VALID_RARITIES.has(rawRarity) ? rawRarity : "";
    const sort = ((query.sort as string) ?? "").toLowerCase();
    const limit = Math.min(
      Math.max(
        typeof query.limit === "number" ? query.limit : DEFAULT_PAGE_SIZE,
        1,
      ),
      100,
    );
    const offset = Math.max(
      typeof query.offset === "number" ? query.offset : 0,
      0,
    );

    if (!setCode) {
      return listAvailableSets(env.DB);
    }

    const setStats = await env.DB.prepare(
      "SELECT * FROM magic_draft_set_stats WHERE set_code = ?1",
    )
      .bind(setCode)
      .first<SetStatsRow>();

    if (!setStats) {
      const available = await env.DB.prepare(
        "SELECT set_code FROM magic_draft_set_stats ORDER BY set_code",
      ).all<{ set_code: string }>();
      const codes = available.results.map((r) => r.set_code).join(", ");
      return {
        type: "text",
        content: `Set "${setCode}" not found. Available sets: ${codes}\n`,
      };
    }

    if (card) {
      return cardDetail(env.DB, setCode, card, setStats);
    }
    if (sort || rarity || limit !== DEFAULT_PAGE_SIZE || offset > 0) {
      return leaderboard(
        env.DB,
        setCode,
        sort,
        colors,
        rarity,
        limit,
        offset,
        setStats,
      );
    }

    return setOverview(env.DB, setCode, setStats);
  },
};
