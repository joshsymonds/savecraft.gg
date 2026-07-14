/**
 * Shared interface and types for API game adapters.
 *
 * Each adapter lives in plugins/{game_id}/adapter/ and implements this
 * interface. The Worker imports adapters at build time via the registry
 * (worker/src/adapters/registry.ts).
 */

import { URLS } from "@savecraft/content/facts";

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
 * userAction for an expired or unlinked OAuth adapter credential. `game`
 * is the display name (e.g. "Path of Exile", "World of Warcraft"). The
 * LLM relays this verbatim to walk the player back through authorization.
 */
export function reconnectAdapterAction(game: string): string {
  return (
    `Reconnect your ${game} account: open ${URLS.app}, sign in, ` +
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
    `open ${URLS.app}, sign in, connect ${game} from the dashboard ` +
    `(add a game → authorize with the provider), then run refresh_save for the character`
  );
}

/**
 * Map an AdapterError to the exact user-facing text shown for a failed
 * refresh. Single source of truth for both refresh failure paths — the
 * MCP refresh_save tool (worker/src/mcp/tools.ts) and the cron adapter
 * refresh job (worker/src/jobs/adapter-refresh.ts) — so a user sees the
 * same actionable message regardless of which path produced the
 * failure. When token_expired arrives without a userAction, falls back
 * to a generic reconnect prompt rather than omitting guidance.
 */
export function adapterErrorMessage(error: AdapterError): string {
  if (error.code === "token_expired") {
    return `Account token expired. ${error.userAction ?? reconnectAdapterAction("the game")}`;
  }
  if (error.code === "rate_limited") {
    return `The game's API is rate limited. Try again in ${String(error.retryAfter ?? 60)} seconds.`;
  }
  if (error.code === "character_not_found") {
    return "Character not found on the game's servers. It may have been deleted or transferred.";
  }
  return `Game API error: ${error.message}`;
}

/** Max chars stored in saves.refresh_error before truncation (unbounded third-party error text otherwise). */
const REFRESH_ERROR_MAX_LEN = 500;

/** Truncate a refresh failure message to the shared D1/MCP response budget. */
export function truncateRefreshError(message: string): string {
  return message.length > REFRESH_ERROR_MAX_LEN
    ? `${message.slice(0, REFRESH_ERROR_MAX_LEN - 3)}...`
    : message;
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
  /**
   * Provider-mandated User-Agent for the server-to-server token
   * exchange. GGG hard-rejects requests without it; Battle.net has no
   * UA requirement and omits this, so its behavior is unchanged.
   */
  userAgent?: string;
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
  /**
   * Durably persist rotated credentials for this save's (user, provider)
   * pair. Providers like GGG invalidate the old refresh token the moment
   * a refresh succeeds, so implementations MUST await this immediately
   * after a successful token refresh — before any subsequent API call
   * can fail. A fetch that refreshes and then throws would otherwise
   * discard the only valid refresh token and wedge the account until
   * the user re-authorizes.
   */
  persistCredentials: (creds: GameCredentials) => Promise<void>;
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
