/**
 * OAuth provider registry: the single source of truth mapping API-backed
 * games to the OAuth provider that issues their credentials.
 *
 * Credentials are stored keyed by (user_uuid, provider) — see migration
 * 0060 — because a provider's refresh token rotates on use. A per-game
 * copy of the same token would go stale the moment a second game
 * sharing that provider refreshed (the motivating case: PoE and PoE2
 * both authenticate through GGG). The provider→game(s) mapping stays
 * 1:1 today; every read/write path resolves through `providerForGame` /
 * `gamesForProvider` below rather than hand-rolling a second mapping
 * that could drift from this one.
 */

import type { Env } from "../types";

/**
 * One OAuth provider backing an API adapter. The generic authorize/
 * callback handlers are driven entirely by this descriptor — adding a
 * provider is a new entry here, never a duplicated handler.
 *
 * `segment` is the route + KV-state-key + event-label namespace
 * ("battlenet" → /oauth/battlenet/*, `battlenet-oauth-state:` keys) and
 * the `provider_credentials.provider` key.
 */
export interface OAuthProvider {
  segment: string;
  adapterId: string;
  defaultRegion: string;
  clientSecret: (env: Env) => string;
  /** When true, use Authorization Code + PKCE S256 (GGG requires it). */
  pkce?: boolean;
}

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [
  {
    segment: "battlenet",
    adapterId: "wow",
    defaultRegion: "us",
    clientSecret: (env) => env.BATTLENET_CLIENT_SECRET ?? "",
  },
  {
    segment: "ggg",
    adapterId: "poe",
    defaultRegion: "pc",
    clientSecret: (env) => env.GGG_CLIENT_SECRET ?? "",
    pkce: true,
  },
];

/**
 * Resolve the OAuth provider that owns credentials for a game (e.g.
 * "poe" → "ggg", "wow" → "battlenet"). Total, not partial: a game not
 * registered above is treated as its own provider — the
 * `provider_credentials` key defaults to identity rather than requiring
 * every adapter (including test doubles that never do real OAuth) to
 * register a segment here.
 */
export function providerForGame(gameId: string): string {
  return OAUTH_PROVIDERS.find((provider) => provider.adapterId === gameId)?.segment ?? gameId;
}

/**
 * Reverse of providerForGame: every game_id currently backed by a given
 * provider. 1:1 today, so this returns at most one game_id — stays
 * array-shaped because making a provider back multiple games (PoE2
 * sharing "ggg" with PoE) is the very next task. Mirrors
 * providerForGame's identity fallback for unregistered provider values.
 */
export function gamesForProvider(provider: string): string[] {
  const mapped = OAUTH_PROVIDERS.filter((entry) => entry.segment === provider).map(
    (entry) => entry.adapterId,
  );
  return mapped.length > 0 ? mapped : [provider];
}
