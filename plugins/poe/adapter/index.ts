/**
 * Path of Exile API adapter — connects a player's GGG account via
 * OAuth and imports their characters as builds.
 *
 * Skeleton: structure + static OAuth config + registration only. The
 * OAuth flow (PKCE S256 routes), discoverSaves (GET /character), and
 * fetchState (GET /character/<name> → sections + pob-server /import)
 * land in subsequent tasks. discoverSaves/fetchState throw a typed
 * AdapterError placeholder until then.
 *
 * GGG is a single global OAuth endpoint (no per-region hosts, unlike
 * Battle.net); `region` is the PoE realm ("pc" for PoE1 PC) and does
 * not change the OAuth URLs.
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

const GGG_AUTHORIZE_URL = "https://www.pathofexile.com/oauth/authorize";
const GGG_TOKEN_URL = "https://www.pathofexile.com/oauth/token";

// account:characters returns the full build (gear + passives + jewels);
// account:profile gives the correctly-cased account name needed for the
// case-sensitive character sub-endpoints.
const GGG_SCOPES = ["account:characters", "account:profile"];

const NOT_IMPLEMENTED =
  "PoE adapter is not yet wired — OAuth connect lands in a later task";

export const poeAdapter: ApiAdapter = {
  gameId: "poe",
  gameName: "Path of Exile",

  getOAuthConfig(_region: string, env: Env): OAuthConfig {
    return {
      authorizeUrl: GGG_AUTHORIZE_URL,
      tokenUrl: GGG_TOKEN_URL,
      scopes: GGG_SCOPES,
      clientId: env.GGG_CLIENT_ID ?? "",
    };
  },

  // eslint-disable-next-line @typescript-eslint/require-await -- placeholder; real impl is async (GET /character)
  async discoverSaves(
    _accessToken: string,
    _region: string,
  ): Promise<DiscoveredSave[]> {
    throw new AdapterError("api_unavailable", NOT_IMPLEMENTED);
  },

  // eslint-disable-next-line @typescript-eslint/require-await -- placeholder; real impl is async (GET /character/<name> + pob-server /import)
  async fetchState(_params: FetchParams, _env: Env): Promise<GameState> {
    throw new AdapterError("api_unavailable", NOT_IMPLEMENTED);
  },
};
