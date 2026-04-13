-- Rename color_pair → archetype across all draft tables, and rename
-- magic_draft_color_stats → magic_draft_archetype_stats to reflect that
-- archetypes now span 1-5 colors (not just pairs).
-- Pre-launch: drop and recreate — no data migration needed.

-- ── magic_draft_color_stats → magic_draft_archetype_stats ──────
DROP TABLE IF EXISTS magic_draft_color_stats;

CREATE TABLE IF NOT EXISTS magic_draft_archetype_stats (
  set_code TEXT NOT NULL,
  card_name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  games_in_hand INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_not_seen INTEGER NOT NULL DEFAULT 0,
  gihwr REAL NOT NULL DEFAULT 0,
  ohwr REAL NOT NULL DEFAULT 0,
  gdwr REAL NOT NULL DEFAULT 0,
  gnswr REAL NOT NULL DEFAULT 0,
  iwd REAL NOT NULL DEFAULT 0,
  alsa REAL NOT NULL DEFAULT 0,
  ata REAL NOT NULL DEFAULT 0,
  ata_stddev REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, card_name, archetype)
);

-- ── magic_draft_archetype_curves: color_pair → archetype ──────
DROP TABLE IF EXISTS magic_draft_archetype_curves;

CREATE TABLE IF NOT EXISTS magic_draft_archetype_curves (
  set_code    TEXT NOT NULL,
  archetype   TEXT NOT NULL,
  cmc         INTEGER NOT NULL,
  avg_count   REAL NOT NULL DEFAULT 0,
  total_decks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, archetype, cmc)
);

-- ── magic_draft_role_targets: color_pair → archetype ──────────
DROP INDEX IF EXISTS idx_role_targets_set;
DROP TABLE IF EXISTS magic_draft_role_targets;

CREATE TABLE IF NOT EXISTS magic_draft_role_targets (
  set_code    TEXT NOT NULL,
  archetype   TEXT NOT NULL,
  role        TEXT NOT NULL,
  avg_count   REAL NOT NULL,
  total_decks INTEGER NOT NULL,
  PRIMARY KEY (set_code, archetype, role)
);

CREATE INDEX IF NOT EXISTS idx_role_targets_set
  ON magic_draft_role_targets(set_code);

-- ── magic_draft_deck_stats: color_pair → archetype ────────────
DROP TABLE IF EXISTS magic_draft_deck_stats;

CREATE TABLE IF NOT EXISTS magic_draft_deck_stats (
  set_code          TEXT NOT NULL,
  archetype         TEXT NOT NULL,
  avg_lands         REAL NOT NULL,
  avg_creatures     REAL NOT NULL,
  avg_noncreatures  REAL NOT NULL,
  avg_fixing        REAL NOT NULL,
  splash_rate       REAL NOT NULL,
  splash_avg_sources REAL NOT NULL,
  splash_winrate    REAL NOT NULL,
  nonsplash_winrate REAL NOT NULL,
  total_decks       INTEGER NOT NULL,
  PRIMARY KEY (set_code, archetype)
);
