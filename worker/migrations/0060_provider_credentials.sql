-- Rename game_credentials -> provider_credentials, re-keyed by OAuth
-- provider instead of game_id.
--
-- GGG issues one refresh token per account, and refresh tokens rotate on
-- use. Keying credentials by (user_uuid, game_id) meant PoE2 sharing the
-- same GGG account as PoE would get its own copy of a token that GGG
-- had already rotated out from under it the moment either game
-- refreshed — bricking whichever game refreshed second. Keying by
-- (user_uuid, provider) instead makes one credential row cover every
-- game that authenticates through that provider.
--
-- The game->provider mapping lives in worker/src/adapters/providers.ts
-- (OAUTH_PROVIDERS). At the time this migration ran it was 1:1: wow ->
-- battlenet, poe -> ggg (ggg -> poe2 came later, once poe2 existed).
-- This migration can't call that TS mapping, so it's inlined via CASE;
-- keep the two in sync if OAUTH_PROVIDERS ever changes. Any game_id not
-- in the CASE falls back to itself as its own provider, mirroring
-- providerForGame's identity fallback.

CREATE TABLE provider_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_uuid, provider)
);

-- Copy existing rows, mapping game_id to its provider. Two different
-- game_id values could in principle map to the same provider (that's
-- the whole point of this migration), which would collide on the new
-- UNIQUE(user_uuid, provider) constraint — keep only the most recently
-- updated row per (user_uuid, provider), tie-broken by the old table's
-- autoincrement id (insertion order) since updated_at alone can tie at
-- one-second resolution. Not reachable with today's 1:1 mapping (each
-- provider still has exactly one source game_id), but this keeps the
-- migration correct once that changes.
INSERT INTO provider_credentials (user_uuid, provider, access_token, refresh_token, expires_at, created_at, updated_at)
SELECT
  g.user_uuid,
  CASE g.game_id WHEN 'wow' THEN 'battlenet' WHEN 'poe' THEN 'ggg' ELSE g.game_id END,
  g.access_token,
  g.refresh_token,
  g.expires_at,
  g.created_at,
  g.updated_at
FROM game_credentials g
WHERE g.id = (
  SELECT g2.id FROM game_credentials g2
  WHERE g2.user_uuid = g.user_uuid
    AND (CASE g2.game_id WHEN 'wow' THEN 'battlenet' WHEN 'poe' THEN 'ggg' ELSE g2.game_id END)
      = (CASE g.game_id WHEN 'wow' THEN 'battlenet' WHEN 'poe' THEN 'ggg' ELSE g.game_id END)
  ORDER BY g2.updated_at DESC, g2.id DESC
  LIMIT 1
);

DROP TABLE game_credentials;
