/**
 * WoW API adapter — fetches character data from Blizzard API
 * and enriches with Raider.io rankings.
 */

import type {
  ApiAdapter,
  DiscoveredSave,
  FetchParams,
  GameState,
  OAuthConfig,
} from "../../../worker/src/adapters/adapter";
import type { Env } from "../../../worker/src/types";

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
    _accessToken: string,
    _region: string,
  ): Promise<DiscoveredSave[]> {
    // TODO: Call Battle.net account profile endpoint
    // GET https://{region}.api.blizzard.com/profile/user/wow
    // Returns all characters on the account
    throw new Error("WoW adapter discoverSaves not yet implemented");
  },

  async fetchState(_params: FetchParams, _env: Env): Promise<GameState> {
    // TODO: Call Blizzard API (profile, equipment, stats, talents, M+, raids, professions)
    // + Raider.io (character profile with rankings)
    // Composite into single GameState
    throw new Error("WoW adapter fetchState not yet implemented");
  },
};
