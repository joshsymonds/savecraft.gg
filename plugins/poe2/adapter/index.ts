/**
 * Path of Exile 2 API adapter — connects a player's GGG account (the
 * same account/OAuth app as PoE1, see plugins/poe/adapter/index.ts) and
 * imports their live PoE2 characters.
 *
 * Confidential OAuth client (Authorization Code + PKCE S256), shared GGG
 * client (worker/src/adapters/ggg.ts). discoverSaves lists characters via
 * GET /character/poe2 and reconciles them into saves (connect =
 * discover-only). fetchState calls GET /profile + GET
 * /character/poe2/<name>, maps the result to GameState sections.
 *
 * GGG's PoE2 character endpoints put the realm in the URL path (unlike
 * PoE1-PC, which omits it): /character/poe2 and /character/poe2/<name>.
 * That path segment is owned here as POE2_REALM rather than derived from
 * the caller's `region`, since GGG's realm value for this game is fixed.
 *
 * poe2 is NOT yet registered in worker/src/adapters/providers.ts
 * (OAUTH_PROVIDERS still maps "ggg" only to "poe") — multi-game
 * discovery under the shared ggg provider is the next task in this epic.
 * fetchState still returns any refreshed GGG token in identity.extra
 * exactly like poe's does (see the comment at its call site below), but
 * persisting that refresh is deferred: worker/src/store.ts's
 * postPushHooks only calls persistPoeRefreshArtifacts for
 * gameId === "poe", so poe2's refreshed creds are dropped for now.
 *
 * No inventory section: GGG's PoE2 character API does not return
 * unequipped items. No pob_build section: PoB2 enrichment is a separate,
 * future epic (see plugins/poe/adapter/index.ts's attachPobBuild for
 * PoE1's equivalent, not mirrored here).
 */

import {
  type ApiAdapter,
  type DiscoveredSave,
  type FetchParams,
  type GameState,
  type GameStateSection,
  type OAuthConfig,
} from "../../../worker/src/adapters/adapter";
import {
  ensureGggAccessToken,
  GGG_AUTHORIZE_URL,
  GGG_SCOPES,
  GGG_TOKEN_URL,
  GGG_USER_AGENT,
  gggGet,
} from "../../../worker/src/adapters/ggg";
import type { Env } from "../../../worker/src/types";
import { mapCharacterOverview, mapGear, mapPassives, mapSkills } from "./sections";
import type { Poe2CharacterListResponse, Poe2CharacterResponse } from "./types";

/** GGG's fixed realm path segment for every PoE2 character endpoint. */
const POE2_REALM = "poe2";

export const poe2Adapter: ApiAdapter = {
  gameId: "poe2",
  gameName: "Path of Exile 2",

  getOAuthConfig(_region: string, env: Env): OAuthConfig {
    return {
      authorizeUrl: GGG_AUTHORIZE_URL,
      tokenUrl: GGG_TOKEN_URL,
      scopes: GGG_SCOPES,
      clientId: env.GGG_CLIENT_ID ?? "",
      // GGG hard-rejects every request without this; the OAuth token
      // exchange is server-to-server, so it must carry it too (Req 4).
      userAgent: GGG_USER_AGENT,
    };
  },

  async discoverSaves(
    accessToken: string,
    region: string,
  ): Promise<DiscoveredSave[]> {
    const { characters } = await gggGet<Poe2CharacterListResponse>(
      `/character/${POE2_REALM}`,
      accessToken,
    );

    return characters
      .filter((char) => !char.deleted)
      .map((char) => ({
        // GGG id is stable across renames — the reconcile key, mirroring
        // the PoE1/WoW adapters.
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

  async fetchState(params: FetchParams, env: Env): Promise<GameState> {
    const { accessToken, refreshed } = await ensureGggAccessToken(
      params.credentials,
      env,
    );

    // /profile validates the (possibly refreshed) token and is the
    // documented source of the correctly-cased account name; the
    // character is then fetched by its exact-case discovered name.
    await gggGet<unknown>("/profile", accessToken);
    // GGG wraps the single-character payload in { "character": {...} }
    // (unlike GET /character/poe2, which is { "characters": [...] }).
    const { character } = await gggGet<Poe2CharacterResponse>(
      `/character/${POE2_REALM}/${encodeURIComponent(params.characterName)}`,
      accessToken,
    );

    const sections: Record<string, GameStateSection> = {
      character_overview: mapCharacterOverview(character),
      gear: mapGear(character),
      skills: mapSkills(character),
      passives: mapPassives(character),
    };

    // Returned exactly like poe's fetchState; persistence into
    // provider_credentials for poe2 is deferred (see header comment).
    const extra: Record<string, unknown> = {};
    if (refreshed) extra.refreshedCreds = refreshed;

    return {
      identity: {
        saveName: character.name,
        gameId: "poe2",
        extra: Object.keys(extra).length > 0 ? extra : undefined,
      },
      summary: `${character.name}, Level ${character.level} ${character.class}`,
      sections,
    };
  },
};
