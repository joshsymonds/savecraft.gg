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
 * poe2 is registered in worker/src/adapters/providers.ts under the
 * shared "ggg" provider (OAUTH_PROVIDERS: ggg → ["poe", "poe2"]). One
 * GGG OAuth grant's token exchange (worker/src/index.ts's
 * handleAdapterCallback) discovers + reconciles characters for both
 * games under a single adapter source, since one credential row backs
 * every game the provider serves. A GGG token rotated during
 * fetchState is durably persisted via params.persistCredentials the
 * moment the refresh succeeds (inside ensureGggAccessToken), exactly
 * like poe's — the caller's closure writes the shared
 * provider_credentials row keyed by providerForGame("poe2") === "ggg".
 *
 * No inventory section: GGG's PoE2 character API does not return
 * unequipped items. pob_build enrichment mirrors PoE1's exactly (see
 * plugins/poe/adapter/index.ts's attachPobBuild) except it posts
 * `game: "poe2"` to pob-server /import, which routes to a PoB2 pool, and
 * persists into poe2_build_snapshot instead of poe_build_snapshot.
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
import {
  buildPobSection,
  mapCharacterOverview,
  mapGear,
  mapPassives,
  mapSkills,
} from "./sections";
import type {
  Poe2Character,
  Poe2CharacterListResponse,
  Poe2CharacterResponse,
} from "./types";

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
    _region: string,
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
          realm: char.realm ?? POE2_REALM,
          expired: char.expired ?? false,
        },
      }));
  },

  async fetchState(params: FetchParams, env: Env): Promise<GameState> {
    // A rotated token is durably persisted inside ensureGggAccessToken
    // (via params.persistCredentials) before any call below can fail.
    const accessToken = await ensureGggAccessToken(
      params.credentials,
      env,
      params.persistCredentials,
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

    const extra: Record<string, unknown> = {};

    await attachPobBuild(character, sections, extra, env);

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

/**
 * Convert the character to a PoB2 build via pob-server /import (with
 * `game: "poe2"`, routing to the PoB2 pool). On success: adds the
 * AI-visible `pob_build` section and stashes {pobBuildId,pobXml} in
 * `extra` for poe2_build_snapshot persistence. On failure: per epic
 * req12, does NOT throw — leaves the raw sections intact (get_section
 * keeps working) and records the gap as an enrichment status so
 * build_planner can report it. Mirrors plugins/poe/adapter/index.ts's
 * attachPobBuild exactly.
 */
async function attachPobBuild(
  character: Poe2Character,
  sections: Record<string, GameStateSection>,
  extra: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const pobUrl = env.POB_URL;
  if (!pobUrl) {
    markPobUnavailable(sections, "POB_URL not configured");
    return;
  }
  try {
    const res = await fetch(`${pobUrl}/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.POB_API_KEY ? { Authorization: `Bearer ${env.POB_API_KEY}` } : {}),
      },
      body: JSON.stringify({ character, game: "poe2" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      markPobUnavailable(sections, `pob-server returned ${res.status}`);
      return;
    }
    const imported = await res.json<{
      buildId?: string;
      data?: { summary?: Record<string, unknown> };
      xml?: string;
    }>();
    if (!imported.buildId || !imported.xml) {
      markPobUnavailable(sections, "pob-server response missing buildId/xml");
      return;
    }
    sections.pob_build = buildPobSection(
      imported.buildId,
      imported.data?.summary ?? {},
    );
    extra.pobBuildId = imported.buildId;
    extra.pobXml = imported.xml;
  } catch (cause) {
    markPobUnavailable(sections, `pob-server import failed: ${String(cause)}`);
  }
}

/**
 * Record that Path of Building analysis is unavailable for this
 * refresh, as an enrichment status on the overview section. Raw GGG
 * sections remain fully populated and queryable.
 */
function markPobUnavailable(
  sections: Record<string, GameStateSection>,
  reason: string,
): void {
  const overview = sections.character_overview;
  if (overview) {
    overview.enrichment = [
      { source: "path-of-building", available: false, unavailableReason: reason },
    ];
  }
}
