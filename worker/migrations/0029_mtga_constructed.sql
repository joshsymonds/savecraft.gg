-- Constructed support tables: per-user match history and global metagame data.
-- Match history is populated on PushSave ingest from the MTGA plugin's match_history section.
-- Metagame tables are populated by melee-fetch from MTGMelee tournament API.

-- ── Per-user match history ─────────────────────────────────

CREATE TABLE IF NOT EXISTS mtga_match_history (
  match_id         TEXT NOT NULL,
  user_uuid        TEXT NOT NULL,
  event_id         TEXT NOT NULL,
  format           TEXT NOT NULL DEFAULT '',
  deck_name        TEXT NOT NULL DEFAULT '',
  result           TEXT NOT NULL,                -- 'win', 'loss', 'draw'
  game_results     TEXT NOT NULL DEFAULT '[]',   -- JSON: [{game_number, winning_seat, player_seat}]
  opponent_name    TEXT NOT NULL DEFAULT '',
  opponent_rank    TEXT NOT NULL DEFAULT '',
  opponent_cards   TEXT NOT NULL DEFAULT '[]',   -- JSON: [{name, arena_id}]
  played_at        TEXT NOT NULL,                -- ISO 8601 UTC
  PRIMARY KEY (match_id, user_uuid)
);

CREATE INDEX IF NOT EXISTS idx_match_history_user_format
  ON mtga_match_history(user_uuid, format);

CREATE INDEX IF NOT EXISTS idx_match_history_user_deck
  ON mtga_match_history(user_uuid, deck_name);

CREATE INDEX IF NOT EXISTS idx_match_history_user_time
  ON mtga_match_history(user_uuid, played_at DESC);

-- ── Global metagame: archetypes per format ─────────────────

CREATE TABLE IF NOT EXISTS mtga_meta_archetypes (
  format           TEXT NOT NULL,
  archetype_name   TEXT NOT NULL,
  metagame_share   REAL NOT NULL DEFAULT 0,      -- 0.0–1.0
  win_rate         REAL NOT NULL DEFAULT 0,       -- 0.0–1.0
  sample_size      INTEGER NOT NULL DEFAULT 0,
  last_updated     TEXT NOT NULL,                 -- ISO 8601 UTC
  PRIMARY KEY (format, archetype_name)
);

-- ── Global metagame: tournament decklists ──────────────────

CREATE TABLE IF NOT EXISTS mtga_meta_decklists (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  format           TEXT NOT NULL,
  archetype_name   TEXT NOT NULL,
  tournament_id    TEXT NOT NULL,
  tournament_name  TEXT NOT NULL DEFAULT '',
  player_name      TEXT NOT NULL DEFAULT '',
  placement        INTEGER,
  decklist         TEXT NOT NULL DEFAULT '{}',    -- JSON: {main: [{name, count}], sideboard: [{name, count}]}
  date             TEXT NOT NULL                  -- ISO 8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_meta_decklists_format_archetype
  ON mtga_meta_decklists(format, archetype_name);

CREATE INDEX IF NOT EXISTS idx_meta_decklists_format_date
  ON mtga_meta_decklists(format, date DESC);

-- ── Global metagame: archetype matchups ────────────────────

CREATE TABLE IF NOT EXISTS mtga_meta_matchups (
  format           TEXT NOT NULL,
  archetype_a      TEXT NOT NULL,
  archetype_b      TEXT NOT NULL,
  win_rate_a       REAL NOT NULL DEFAULT 0,       -- A's win rate vs B (0.0–1.0)
  sample_size      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (format, archetype_a, archetype_b)
);
