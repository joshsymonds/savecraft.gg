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
  characterId: string;
  region: string;
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
