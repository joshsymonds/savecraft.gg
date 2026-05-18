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
  type ApiAdapter,
  type DiscoveredSave,
  type FetchParams,
  type GameState,
  type GameStateSection,
  type OAuthConfig,
} from "../../../worker/src/adapters/adapter";
import type { Env } from "../../../worker/src/types";
import { ensureGggAccessToken, gggGet } from "./ggg-api";
import {
  buildPobSection,
  mapCharacterOverview,
  mapGear,
  mapJewels,
  mapPassives,
  mapSkills,
} from "./sections";
import type { GggCharacter, GggCharacterListResponse } from "./types";

const GGG_AUTHORIZE_URL = "https://www.pathofexile.com/oauth/authorize";
const GGG_TOKEN_URL = "https://www.pathofexile.com/oauth/token";

// account:characters returns the full build (gear + passives + jewels);
// account:profile gives the correctly-cased account name needed for the
// case-sensitive character sub-endpoints.
const GGG_SCOPES = ["account:characters", "account:profile"];

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

  async fetchState(params: FetchParams, env: Env): Promise<GameState> {
    const { accessToken, refreshed } = await ensureGggAccessToken(
      params.credentials,
      env,
    );

    // /profile validates the (possibly refreshed) token and is the
    // documented source of the correctly-cased account name; the
    // character is then fetched by its exact-case discovered name.
    await gggGet<unknown>("/profile", accessToken);
    const character = await gggGet<GggCharacter>(
      `/character/${encodeURIComponent(params.characterName)}`,
      accessToken,
    );

    const sections: Record<string, GameStateSection> = {
      character_overview: mapCharacterOverview(character),
      gear: mapGear(character),
      passives: mapPassives(character),
      skills: mapSkills(character),
      jewels: mapJewels(character),
    };

    const extra: Record<string, unknown> = {};
    if (refreshed) extra.refreshedCreds = refreshed;

    await attachPobBuild(character, sections, extra, env);

    return {
      identity: {
        saveName: character.name,
        gameId: "poe",
        extra: Object.keys(extra).length > 0 ? extra : undefined,
      },
      summary: `${character.name}, Level ${character.level} ${character.class}`,
      sections,
    };
  },

};

/**
 * Convert the character to a PoB build via pob-server /import. On
 * success: adds the AI-visible `pob_build` section and stashes
 * {pobBuildId,pobXml} in `extra` for poe_build_snapshot persistence.
 * On failure: per epic req12, does NOT throw — leaves the raw sections
 * intact (get_section keeps working) and records the gap as an
 * enrichment status so build_planner can report it.
 */
async function attachPobBuild(
  character: GggCharacter,
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
      body: JSON.stringify({ character }),
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
