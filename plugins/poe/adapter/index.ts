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
import { gggGet } from "./ggg-api";
import type { GggCharacterListResponse } from "./types";

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

  async discoverSaves(
    accessToken: string,
    region: string,
  ): Promise<DiscoveredSave[]> {
    // Single global endpoint; PoE1-PC is the default realm (no path
    // segment). `region` is the realm label, carried into metadata.
    const { characters } = await gggGet<GggCharacterListResponse>(
      "/character",
      accessToken,
    );

    return characters
      .filter((char) => !char.deleted)
      .map((char) => ({
        // GGG id is stable across renames — the reconcile key. saveName
        // is the human identity (name); a rename is reconciled via the
        // stable characterId, mirroring the WoW adapter.
        saveName: char.name,
        characterId: char.id,
        displayName: char.name,
        metadata: {
          class: char.class,
          league: char.league,
          level: char.level,
          realm: char.realm ?? region,
          expired: char.expired ?? false,
        },
      }));
  },

  // eslint-disable-next-line @typescript-eslint/require-await -- placeholder; real impl is async (GET /character/<name> + pob-server /import)
  async fetchState(_params: FetchParams, _env: Env): Promise<GameState> {
    throw new AdapterError("api_unavailable", NOT_IMPLEMENTED);
  },
};
