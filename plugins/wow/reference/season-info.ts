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

interface RaidInfo {
  expansion: string;
  raids: Array<{ id: number; name: string }>;
  currentRaid: string;
}

interface CachedSeasonData {
  seasonId: number;
  dungeons: Array<{ id: number; name: string }>;
  raidInfo: RaidInfo | null;
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

interface ExpansionIndexResponse {
  tiers: Array<{ key: { href: string }; name: string; id: number }>;
}

interface ExpansionDetailResponse {
  id: number;
  name: string;
  raids?: Array<{ key: { href: string }; name: string; id: number }>;
  dungeons?: Array<{ key: { href: string }; name: string; id: number }>;
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

  // Step 3: Fetch current raid tier from journal expansion API (static namespace)
  const staticNs = `namespace=static-${region}&locale=en_US`;
  let raidInfo: RaidInfo | null = null;
  try {
    const { data: expansionIndex } = await blizzardFetch<ExpansionIndexResponse>(
      `${base}/data/wow/journal-expansion/index?${staticNs}`,
      token,
    );

    // Latest expansion = highest ID
    const tiers = expansionIndex.tiers;
    if (tiers.length > 0) {
      const latestExpansion = tiers.reduce((a, b) => (a.id > b.id ? a : b));

      const { data: expansionDetail } = await blizzardFetch<ExpansionDetailResponse>(
        `${base}/data/wow/journal-expansion/${latestExpansion.id}?${staticNs}`,
        token,
      );

      const raids = expansionDetail.raids ?? [];
      raidInfo = {
        expansion: expansionDetail.name,
        raids: raids.map((r) => ({ id: r.id, name: r.name })),
        currentRaid: raids.length > 0 ? raids[raids.length - 1]!.name : "",
      };
    }
  } catch {
    // Raid info is non-critical — M+ data is still returned
  }

  cachedSeason = {
    seasonId: currentSeasonId,
    dungeons,
    raidInfo,
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
    "Returns current WoW season info: M+ dungeon rotation, current raid tier, and season ID.",
    "USE PROACTIVELY: query this module before mentioning specific dungeons, raids, or seasonal content to ensure you reference the current rotation — not stale training data.",
  ].join(" "),
  parameters: {
    type: {
      type: "string",
      description:
        "What to return: 'mythic_plus' for current M+ dungeon pool, 'raids' for current raid tier, 'overview' for everything. Defaults to 'overview'.",
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

      case "raids":
        return {
          type: "structured",
          data: {
            expansion: season.raidInfo?.expansion ?? null,
            raids: season.raidInfo?.raids ?? [],
            current_raid: season.raidInfo?.currentRaid ?? null,
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
            raids: season.raidInfo
              ? {
                  expansion: season.raidInfo.expansion,
                  raids: season.raidInfo.raids,
                  current_raid: season.raidInfo.currentRaid,
                }
              : null,
          },
        };
    }
  },
};
