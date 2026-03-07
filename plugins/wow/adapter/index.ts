/**
 * WoW API adapter — fetches character data from Blizzard API
 * and enriches with Raider.io rankings.
 */

import {
  AdapterError,
  type ApiAdapter,
  type DiscoveredSave,
  type FetchParams,
  type GameState,
  type OAuthConfig,
} from "../../../worker/src/adapters/adapter";
import type { Env } from "../../../worker/src/types";
import {
  mapCharacterOverview,
  mapCharacterStats,
  mapEquippedGear,
  mapMythicPlus,
  mapProfessions,
  mapRaidProgression,
  mapTalents,
} from "./sections";
import type {
  BlizzardEquipment,
  BlizzardMythicKeystoneProfile,
  BlizzardMythicKeystoneSeason,
  BlizzardProfessions,
  BlizzardProfile,
  BlizzardRaids,
  BlizzardSpecializations,
  BlizzardStatistics,
  RaiderioProfile,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OAUTH_URLS: Record<string, { authorize: string; token: string }> = {
  us: {
    authorize: "https://oauth.battle.net/authorize",
    token: "https://oauth.battle.net/token",
  },
  eu: {
    authorize: "https://oauth.battle.net/authorize",
    token: "https://oauth.battle.net/token",
  },
  kr: {
    authorize: "https://apac.oauth.battle.net/authorize",
    token: "https://apac.oauth.battle.net/token",
  },
  tw: {
    authorize: "https://apac.oauth.battle.net/authorize",
    token: "https://apac.oauth.battle.net/token",
  },
};

const VALID_REGIONS = new Set(Object.keys(OAUTH_URLS));

function assertValidRegion(region: string): void {
  if (!VALID_REGIONS.has(region)) {
    throw new AdapterError(
      "api_unavailable",
      `Invalid region: ${region}. Valid regions: ${[...VALID_REGIONS].join(", ")}`,
    );
  }
}

const RAIDERIO_FIELDS = [
  "mythic_plus_scores_by_season:current",
  "mythic_plus_best_runs",
  "mythic_plus_recent_runs",
  "raid_progression",
  "gear",
].join(",");

// ---------------------------------------------------------------------------
// Blizzard API helpers
// ---------------------------------------------------------------------------

/**
 * Per-isolate, best-effort cache for Blizzard app token (valid ~24h).
 * Each Workers isolate gets its own module scope; cache resets on isolate eviction.
 */
let cachedAppToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(env: Env): Promise<string> {
  // Return cached token if still valid (with 5-minute safety margin)
  if (cachedAppToken && Date.now() < cachedAppToken.expiresAt - 5 * 60 * 1000) {
    return cachedAppToken.token;
  }

  const tokenUrl =
    OAUTH_URLS[env.BATTLENET_REGION ?? "us"]?.token ??
    "https://oauth.battle.net/token";

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.BATTLENET_CLIENT_ID ?? "",
      client_secret: env.BATTLENET_CLIENT_SECRET ?? "",
    }),
  });

  if (!res.ok) {
    throw new AdapterError(
      "api_unavailable",
      `Failed to get Blizzard app token: HTTP ${res.status}`,
    );
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new AdapterError(
      "api_unavailable",
      "Blizzard token response missing access_token",
    );
  }

  const expiresInMs = (data.expires_in ?? 86400) * 1000;
  cachedAppToken = { token: data.access_token, expiresAt: Date.now() + expiresInMs };

  return data.access_token;
}

function handleBlizzardError(status: number, context: string): never {
  switch (status) {
    case 401:
      throw new AdapterError("token_expired", `Blizzard API: ${context}`, {
        userAction:
          "Reconnect your Battle.net account at savecraft.gg/settings",
      });
    case 404:
      throw new AdapterError(
        "character_not_found",
        `Character not found: ${context}`,
      );
    case 429: {
      throw new AdapterError(
        "rate_limited",
        `Blizzard API rate limited: ${context}`,
        { retryAfter: 60 },
      );
    }
    default:
      throw new AdapterError(
        "api_unavailable",
        `Blizzard API error ${status}: ${context}`,
      );
  }
}

async function blizzardFetch<T>(
  url: string,
  token: string,
): Promise<{ data: T; lastModified: string | null }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    handleBlizzardError(res.status, url);
  }

  const data = (await res.json()) as T;
  const lastModified = res.headers.get("Last-Modified");
  return { data, lastModified };
}

// ---------------------------------------------------------------------------
// Raider.io helper
// ---------------------------------------------------------------------------

async function fetchRaiderio(
  region: string,
  realm: string,
  name: string,
): Promise<RaiderioProfile | undefined> {
  try {
    const url = `https://raider.io/api/v1/characters/profile?region=${encodeURIComponent(region)}&realm=${encodeURIComponent(realm)}&name=${encodeURIComponent(name)}&fields=${RAIDERIO_FIELDS}`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return (await res.json()) as RaiderioProfile;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Account profile types (for discoverSaves)
// ---------------------------------------------------------------------------

interface BlizzardAccountCharacter {
  character: { href: string };
  protected_character?: { href: string };
  name: string;
  id: number;
  realm: {
    key: { href: string };
    name: string;
    id: number;
    slug: string;
  };
  playable_class: { key: { href: string }; name: string; id: number };
  playable_race: { key: { href: string }; name: string; id: number };
  gender: { type: string; name: string };
  faction: { type: string; name: string };
  level: number;
}

interface BlizzardAccountProfile {
  wow_accounts?: {
    id: number;
    characters?: BlizzardAccountCharacter[];
  }[];
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const wowAdapter: ApiAdapter = {
  gameId: "wow",
  gameName: "World of Warcraft",

  getOAuthConfig(region: string, env: Env): OAuthConfig {
    const urls = OAUTH_URLS[region] ?? OAUTH_URLS["us"]!;
    return {
      authorizeUrl: urls.authorize,
      tokenUrl: urls.token,
      scopes: ["wow.profile", "openid"],
      clientId: env.BATTLENET_CLIENT_ID ?? "",
    };
  },

  async discoverSaves(
    accessToken: string,
    region: string,
  ): Promise<DiscoveredSave[]> {
    assertValidRegion(region);
    const url = `https://${region}.api.blizzard.com/profile/user/wow?namespace=profile-${region}&locale=en_US`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401) {
      throw new AdapterError(
        "token_expired",
        "Battle.net token expired or revoked",
        {
          userAction:
            "Reconnect your Battle.net account at savecraft.gg/settings",
        },
      );
    }
    if (!res.ok) {
      throw new AdapterError(
        "api_unavailable",
        `Battle.net account profile API returned ${res.status}`,
      );
    }

    const profile = (await res.json()) as BlizzardAccountProfile;
    const saves: DiscoveredSave[] = [];

    for (const account of profile.wow_accounts ?? []) {
      for (const char of account.characters ?? []) {
        saves.push({
          saveName: `${char.name}-${char.realm.slug}-${region.toUpperCase()}`,
          characterId: String(char.id),
          displayName: char.name,
          metadata: {
            class: char.playable_class.name,
            race: char.playable_race.name,
            level: char.level,
            realm: char.realm.name,
            realm_slug: char.realm.slug,
            region,
            faction: char.faction.name,
            gender: char.gender.name,
          },
        });
      }
    }

    return saves;
  },

  async fetchState(params: FetchParams, env: Env): Promise<GameState> {
    assertValidRegion(params.region);
    // characterId format: "realm-slug/character-name"
    const slashIdx = params.characterId.indexOf("/");
    if (slashIdx === -1) {
      throw new AdapterError(
        "character_not_found",
        `Invalid characterId format: ${params.characterId} (expected realm-slug/character-name)`,
      );
    }
    const realm = params.characterId.substring(0, slashIdx);
    const name = params.characterId.substring(slashIdx + 1);
    const region = params.region;

    // Get app token for public character data
    const token = await getAppToken(env);

    const base = `https://${region}.api.blizzard.com`;
    const ns = `namespace=profile-${region}&locale=en_US`;
    const charPath = `profile/wow/character/${encodeURIComponent(realm)}/${encodeURIComponent(name)}`;

    // Fetch Blizzard profile + equipment + stats + specs + M+ profile + raids + professions
    // and Raider.io in parallel. M+ season detail is sequential after M+ profile.
    const [
      profileResult,
      equipmentResult,
      statisticsResult,
      specializationsResult,
      mythicKeystoneProfileResult,
      raidsResult,
      professionsResult,
      raiderio,
    ] = await Promise.all([
      blizzardFetch<BlizzardProfile>(`${base}/${charPath}?${ns}`, token),
      blizzardFetch<BlizzardEquipment>(
        `${base}/${charPath}/equipment?${ns}`,
        token,
      ),
      blizzardFetch<BlizzardStatistics>(
        `${base}/${charPath}/statistics?${ns}`,
        token,
      ),
      blizzardFetch<BlizzardSpecializations>(
        `${base}/${charPath}/specializations?${ns}`,
        token,
      ),
      blizzardFetch<BlizzardMythicKeystoneProfile>(
        `${base}/${charPath}/mythic-keystone-profile?${ns}`,
        token,
      ),
      blizzardFetch<BlizzardRaids>(
        `${base}/${charPath}/encounters/raids?${ns}`,
        token,
      ),
      blizzardFetch<BlizzardProfessions>(
        `${base}/${charPath}/professions?${ns}`,
        token,
      ),
      fetchRaiderio(region, realm, name),
    ]);

    // Fetch current M+ season detail (needs season ID from profile)
    const currentSeasonId = mythicKeystoneProfileResult.data.seasons?.[0]?.id;
    let mythicKeystoneSeason: BlizzardMythicKeystoneSeason | undefined;
    if (currentSeasonId !== undefined) {
      try {
        const seasonResult = await blizzardFetch<BlizzardMythicKeystoneSeason>(
          `${base}/${charPath}/mythic-keystone-profile/season/${currentSeasonId}?${ns}`,
          token,
        );
        mythicKeystoneSeason = seasonResult.data;
      } catch {
        // Season data unavailable — not fatal, M+ section will be empty
      }
    }

    const dataAsOf = profileResult.lastModified ?? new Date().toISOString();
    const profile = profileResult.data;

    const summary = [
      profile.name,
      `Level ${profile.level}`,
      `${profile.active_spec.name} ${profile.character_class.name}`,
      `ilvl ${profile.equipped_item_level}`,
      profile.guild ? `<${profile.guild.name}>` : null,
      `${profile.realm.name}-${region.toUpperCase()}`,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      identity: {
        saveName: `${profile.name}-${profile.realm.slug}-${region.toUpperCase()}`,
        gameId: "wow",
        extra: {
          blizzard_id: profile.id,
          realm: profile.realm.name,
          realm_slug: profile.realm.slug,
          region,
          data_as_of: dataAsOf,
        },
      },
      summary,
      sections: {
        character_overview: mapCharacterOverview(profile, raiderio),
        equipped_gear: mapEquippedGear(equipmentResult.data),
        character_stats: mapCharacterStats(statisticsResult.data),
        talents: mapTalents(specializationsResult.data),
        mythic_plus: mapMythicPlus(mythicKeystoneSeason, raiderio),
        raid_progression: mapRaidProgression(raidsResult.data, raiderio),
        professions: mapProfessions(professionsResult.data),
      },
    };
  },
};
