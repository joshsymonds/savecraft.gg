/**
 * Shared interface and types for API game adapters.
 *
 * Each adapter lives in plugins/{game_id}/adapter/ and implements this
 * interface. The Worker imports adapters at build time via the registry
 * (worker/src/adapters/registry.ts).
 */

import type { Env } from "../types";

export interface GameStateSection {
  description: string;
  data: unknown;
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

export interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
}

export interface DiscoveredSave {
  /** Unique save name used as identity key, e.g. "Thrallgar-Illidan-US" */
  saveName: string;
  /** Game-specific unique identifier, e.g. "thrallgar-illidan-us" */
  characterId: string;
  /** Human-readable display name, e.g. "Thrallgar" */
  displayName: string;
  /** Game-specific metadata from discovery (class, level, realm, etc.) */
  metadata: Record<string, unknown>;
}

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

export interface ApiAdapter {
  gameId: string;
  gameName: string;

  /** OAuth configuration for the auth redirect flow. */
  getOAuthConfig(region: string, env: Env): OAuthConfig;

  /**
   * Discover saves (characters/profiles) after OAuth.
   * Called once during setup; returns all trackable entities.
   */
  discoverSaves(accessToken: string, region: string): Promise<DiscoveredSave[]>;

  /**
   * Fetch full game state for one save.
   * May composite multiple API sources (e.g. Blizzard + Raider.io).
   */
  fetchState(params: FetchParams, env: Env): Promise<GameState>;
}
