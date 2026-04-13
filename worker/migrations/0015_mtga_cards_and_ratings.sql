-- MTG Arena card data (Scryfall) and draft ratings (17Lands) for native reference modules.
-- Follows the same dual-table pattern as 0014_magic_rules.sql:
-- structured tables for exact lookups + FTS5 virtual tables for BM25 ranking.

-- ── Card data (Scryfall oracle cards, Arena subset) ──────────

CREATE TABLE IF NOT EXISTS magic_cards (
  arena_id INTEGER PRIMARY KEY,
  oracle_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mana_cost TEXT NOT NULL DEFAULT '',
  cmc REAL NOT NULL DEFAULT 0,
  type_line TEXT NOT NULL DEFAULT '',
  oracle_text TEXT NOT NULL DEFAULT '',
  colors TEXT NOT NULL DEFAULT '[]',
  color_identity TEXT NOT NULL DEFAULT '[]',
  legalities TEXT NOT NULL DEFAULT '{}',
  rarity TEXT NOT NULL DEFAULT '',
  set_code TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_magic_cards_name ON magic_cards(name);
CREATE INDEX IF NOT EXISTS idx_magic_cards_set ON magic_cards(set_code);
CREATE INDEX IF NOT EXISTS idx_magic_cards_rarity ON magic_cards(rarity);

CREATE VIRTUAL TABLE IF NOT EXISTS magic_cards_fts USING fts5(
  arena_id UNINDEXED,
  name,
  oracle_text,
  type_line,
  tokenize='porter unicode61'
);

-- ── Draft ratings (17Lands, per set) ─────────────────────────

CREATE TABLE IF NOT EXISTS magic_draft_ratings (
  set_code TEXT NOT NULL,
  card_name TEXT NOT NULL,
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
  PRIMARY KEY (set_code, card_name)
);

CREATE INDEX IF NOT EXISTS idx_draft_ratings_set ON magic_draft_ratings(set_code);
CREATE INDEX IF NOT EXISTS idx_draft_ratings_gihwr ON magic_draft_ratings(set_code, gihwr DESC);
CREATE INDEX IF NOT EXISTS idx_draft_ratings_iwd ON magic_draft_ratings(set_code, iwd DESC);

CREATE TABLE IF NOT EXISTS magic_draft_color_stats (
  set_code TEXT NOT NULL,
  card_name TEXT NOT NULL,
  color_pair TEXT NOT NULL,
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
  PRIMARY KEY (set_code, card_name, color_pair)
);

CREATE TABLE IF NOT EXISTS magic_draft_set_stats (
  set_code TEXT PRIMARY KEY,
  format TEXT NOT NULL DEFAULT '',
  total_games INTEGER NOT NULL DEFAULT 0,
  card_count INTEGER NOT NULL DEFAULT 0,
  avg_gihwr REAL NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS magic_draft_ratings_fts USING fts5(
  set_code UNINDEXED,
  card_name,
  tokenize='porter unicode61'
);
