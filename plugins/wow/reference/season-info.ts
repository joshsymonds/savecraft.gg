/**
 * WoW season_info — native reference module.
 *
 * Returns current M+ dungeon pool and season metadata from live Blizzard
 * dynamic-namespace API calls. Per-isolate caching avoids redundant fetches
 * (season data changes at most once per season, ~every few months).
 *
 * This prevents the AI from telling returning players to run dungeons that
 * aren't in the current rotation.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";
import { blizzardFetch, getAppToken } from "../shared/blizzard-api";

// ---------------------------------------------------------------------------
// Per-isolate cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedSeasonData {
  seasonId: number;
  dungeons: Array<{ id: number; name: string }>;
  fetchedAt: number;
}

let cachedSeason: CachedSeasonData | null = null;

/** Clear cache (for tests). */
export function resetSeasonCache(): void {
  cachedSeason = null;
}

// ---------------------------------------------------------------------------
// Blizzard API types (Game Data — dynamic namespace)
// ---------------------------------------------------------------------------

interface SeasonIndexResponse {
  seasons: Array<{ key: { href: string }; id: number }>;
  current_season: { key: { href: string }; id: number };
}

interface SeasonDetailResponse {
  id: number;
  season_name?: { en_US?: string };
  dungeons: Array<{
    key: { href: string };
    name: { en_US?: string } | string;
    id: number;
  }>;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchCurrentSeason(env: Env): Promise<CachedSeasonData> {
  // Return cache if fresh
  if (cachedSeason && Date.now() - cachedSeason.fetchedAt < CACHE_TTL_MS) {
    return cachedSeason;
  }

  const token = await getAppToken(env);
  const region = env.BATTLENET_REGION ?? "us";
  const base = `https://${region}.api.blizzard.com`;
  const ns = `namespace=dynamic-${region}&locale=en_US`;

  // Step 1: Get current season ID
  const { data: seasonIndex } = await blizzardFetch<SeasonIndexResponse>(
    `${base}/data/wow/mythic-keystone/season/index?${ns}`,
    token,
  );

  const currentSeasonId = seasonIndex.current_season.id;

  // Step 2: Get season detail with dungeon pool
  const { data: seasonDetail } = await blizzardFetch<SeasonDetailResponse>(
    `${base}/data/wow/mythic-keystone/season/${currentSeasonId}?${ns}`,
    token,
  );

  const dungeons = seasonDetail.dungeons.map((d) => ({
    id: d.id,
    name: typeof d.name === "string" ? d.name : (d.name.en_US ?? `Dungeon ${d.id}`),
  }));

  cachedSeason = {
    seasonId: currentSeasonId,
    dungeons,
    fetchedAt: Date.now(),
  };

  return cachedSeason;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const seasonInfoModule: NativeReferenceModule = {
  id: "season_info",
  name: "Season Info",
  description: [
    "Returns the current WoW season info: M+ dungeon rotation and season ID.",
    "USE PROACTIVELY: query this module before mentioning specific dungeons, raids, or seasonal content to ensure you reference the current rotation — not stale training data.",
  ].join(" "),
  parameters: {
    type: {
      type: "string",
      description:
        "What to return: 'mythic_plus' for current M+ dungeon pool, 'overview' for full season summary. Defaults to 'overview'.",
    },
  },

  async execute(
    query: Record<string, unknown>,
    env: Env,
  ): Promise<ReferenceResult> {
    const type =
      typeof query.type === "string" ? query.type.trim() : "overview";

    const season = await fetchCurrentSeason(env);

    switch (type) {
      case "mythic_plus":
        return {
          type: "structured",
          data: {
            season_id: season.seasonId,
            dungeons: season.dungeons,
            dungeon_count: season.dungeons.length,
          },
        };

      case "overview":
      default:
        return {
          type: "structured",
          data: {
            current_season_id: season.seasonId,
            mythic_plus: {
              dungeons: season.dungeons,
              dungeon_count: season.dungeons.length,
            },
          },
        };
    }
  },
};
