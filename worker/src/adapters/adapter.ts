/**
 * Shared interface and types for API game adapters.
 *
 * Each adapter lives in plugins/{game_id}/adapter/ and implements this
 * interface. The Worker imports adapters at build time via the registry
 * (worker/src/adapters/registry.ts).
 */

import type { Env } from "../types";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type AdapterErrorCode =
  | "token_expired"
  | "rate_limited"
  | "api_unavailable"
  | "character_not_found"
  | "partial_failure";

export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  /** Seconds until retry is worthwhile (for rate_limited). */
  readonly retryAfter?: number;
  /** User-facing action to resolve the error (for token_expired). */
  readonly userAction?: string;

  constructor(
    code: AdapterErrorCode,
    message: string,
    options?: { retryAfter?: number; userAction?: string },
  ) {
    super(message);
    this.name = "AdapterError";
    this.code = code;
    this.retryAfter = options?.retryAfter;
    this.userAction = options?.userAction;
  }
}

/** Max 1 refresh per character per 5 minutes. Shared across REST API and MCP paths. */
export const ADAPTER_REFRESH_COOLDOWN_SEC = 300;

/**
 * The Savecraft web app origin. The apex `savecraft.gg` is the
 * marketing/docs/privacy site; the live dashboard — sign-in plus the
 * add/connect-a-game picker that starts adapter OAuth — is here. There
 * is NO `/settings` route; never construct one. Single source of truth
 * for every user-facing connect/reconnect string the LLM may relay.
 */
export const SAVECRAFT_APP_URL = "https://my.savecraft.gg";

/**
 * userAction for an expired or unlinked OAuth adapter credential. `game`
 * is the display name (e.g. "Path of Exile", "World of Warcraft"). The
 * LLM relays this verbatim to walk the player back through authorization.
 */
export function reconnectAdapterAction(game: string): string {
  return (
    `Reconnect your ${game} account: open ${SAVECRAFT_APP_URL}, sign in, ` +
    `and reconnect ${game} from the dashboard (add a game → authorize with the provider).`
  );
}

/**
 * Ordered, relayable steps to connect an OAuth adapter game from zero
 * and get its state into Savecraft. Used where the player has no save
 * yet (e.g. build_planner's character resolver) — distinct from
 * {@link reconnectAdapterAction}, which is for an existing-but-stale link.
 */
export function connectAdapterGuidance(game: string): string {
  return (
    `open ${SAVECRAFT_APP_URL}, sign in, connect ${game} from the dashboard ` +
    `(add a game → authorize with the provider), then run refresh_save for the character`
  );
}

// ---------------------------------------------------------------------------
// GameState types
// ---------------------------------------------------------------------------

export interface EnrichmentStatus {
  /** Name of the enrichment source (e.g. "raiderio"). */
  source: string;
  /** Whether enrichment data was available for this section. */
  available: boolean;
  /** ISO 8601 timestamp of when the enrichment source last crawled this data. */
  crawledAt?: string;
  /** Human-readable reason if unavailable (e.g. "Raider.io API returned 503"). */
  unavailableReason?: string;
}

export interface GameStateSection {
  description: string;
  data: Record<string, unknown>;
  /** Status of enrichment sources that contribute to this section. */
  enrichment?: EnrichmentStatus[];
}

export interface GameState {
  identity: {
    saveName: string;
    gameId: string;
    extra?: Record<string, unknown>;
  };
  summary: string;
  sections: Record<string, GameStateSection>;
}

// ---------------------------------------------------------------------------
// OAuth types
// ---------------------------------------------------------------------------

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
}

// ---------------------------------------------------------------------------
// Character discovery types
// ---------------------------------------------------------------------------

export interface DiscoveredSave {
  /** Unique save name used as identity key, e.g. "Thrallgar-Illidan-US" */
  saveName: string;
  /** Game-specific stable identifier that survives renames/transfers. */
  characterId: string;
  /** Human-readable display name, e.g. "Thrallgar" */
  displayName: string;
  /** Game-specific metadata from discovery (class, level, realm, etc.) */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fetch types
// ---------------------------------------------------------------------------

export interface GameCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface FetchParams {
  /** The adapter's own stable id, as stored in linked_characters.character_id. */
  characterId: string;
  /** Display name as discovered (original case — adapters that need an
   *  exact-case name, e.g. GGG, rely on this not being mangled). */
  characterName: string;
  region: string;
  /** Parsed linked_characters.metadata — each adapter reads what its API needs. */
  metadata: Record<string, unknown>;
  credentials: GameCredentials;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface ApiAdapter {
  gameId: string;
  gameName: string;

  /** OAuth configuration for the auth redirect flow. */
  getOAuthConfig(region: string, env: Env): OAuthConfig;

  /**
   * Discover saves (characters/profiles) after OAuth.
   * Called during setup and when refreshing the character list.
   * Returns all trackable entities; caller handles reconciliation.
   *
   * @throws {AdapterError} code=token_expired when the user's token is invalid
   * @throws {AdapterError} code=api_unavailable when the API is unreachable
   */
  discoverSaves(accessToken: string, region: string): Promise<DiscoveredSave[]>;

  /**
   * Fetch full game state for one save.
   * May composite multiple API sources (e.g. Blizzard + Raider.io).
   *
   * When an enrichment source (e.g. Raider.io) is unavailable, the adapter
   * MUST still return a GameState with primary data. Enrichment status is
   * communicated via the `enrichment` field on affected sections.
   *
   * @throws {AdapterError} code=token_expired when credentials need re-auth
   * @throws {AdapterError} code=rate_limited when API budget is exhausted
   * @throws {AdapterError} code=character_not_found when the character no longer exists
   * @throws {AdapterError} code=api_unavailable when the primary API is unreachable
   */
  fetchState(params: FetchParams, env: Env): Promise<GameState>;
}
