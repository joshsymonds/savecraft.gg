-- EDHREC Commander data: recommendations, combos, average decklists, mana curves.
-- Populated by edhrec-fetch Go pipeline tool. All modules query D1 only (no outbound HTTP).

-- ── Commander metadata ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS magic_edh_commanders (
  scryfall_id    TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  color_identity TEXT NOT NULL DEFAULT '[]',  -- JSON array, e.g. ["W","U","B","G"]
  deck_count     INTEGER NOT NULL DEFAULT 0,
  themes         TEXT NOT NULL DEFAULT '[]',  -- JSON array of {slug, value, count}
  similar        TEXT NOT NULL DEFAULT '[]',  -- JSON array of {name, scryfall_id}
  rank           INTEGER,                     -- overall EDHREC rank
  salt           REAL,                        -- salt score (annoyance metric)
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edh_commanders_name ON magic_edh_commanders(name);
CREATE INDEX IF NOT EXISTS idx_edh_commanders_slug ON magic_edh_commanders(slug);
CREATE INDEX IF NOT EXISTS idx_edh_commanders_deck_count ON magic_edh_commanders(deck_count DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS magic_edh_commanders_fts USING fts5(
  scryfall_id UNINDEXED,
  name,
  tokenize='porter unicode61'
);

-- ── Card recommendations per commander ──────────────────────

CREATE TABLE IF NOT EXISTS magic_edh_recommendations (
  commander_id   TEXT NOT NULL,  -- FK to magic_edh_commanders.scryfall_id
  card_name      TEXT NOT NULL,
  category       TEXT NOT NULL,  -- e.g. highsynergycards, topcards, creatures, instants
  synergy        REAL NOT NULL DEFAULT 0,
  inclusion      INTEGER NOT NULL DEFAULT 0,
  potential_decks INTEGER NOT NULL DEFAULT 0,
  trend_zscore   REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (commander_id, card_name, category)
);

CREATE INDEX IF NOT EXISTS idx_edh_recs_commander ON magic_edh_recommendations(commander_id);
CREATE INDEX IF NOT EXISTS idx_edh_recs_card ON magic_edh_recommendations(card_name);
CREATE INDEX IF NOT EXISTS idx_edh_recs_category ON magic_edh_recommendations(commander_id, category);
CREATE INDEX IF NOT EXISTS idx_edh_recs_synergy ON magic_edh_recommendations(commander_id, synergy DESC);

-- ── Combos per commander ────────────────────────────────────

CREATE TABLE IF NOT EXISTS magic_edh_combos (
  commander_id   TEXT NOT NULL,  -- FK to magic_edh_commanders.scryfall_id
  combo_id       TEXT NOT NULL,  -- EDHREC combo ID (e.g. "1529-1887")
  card_names     TEXT NOT NULL DEFAULT '[]',  -- JSON array of card names
  card_ids       TEXT NOT NULL DEFAULT '[]',  -- JSON array of Scryfall UUIDs
  colors         TEXT NOT NULL DEFAULT '',    -- color string (e.g. "BG")
  results        TEXT NOT NULL DEFAULT '[]',  -- JSON array of result descriptions
  deck_count     INTEGER NOT NULL DEFAULT 0,
  percentage     REAL NOT NULL DEFAULT 0,
  bracket_score  REAL,
  PRIMARY KEY (commander_id, combo_id)
);

CREATE INDEX IF NOT EXISTS idx_edh_combos_commander ON magic_edh_combos(commander_id);
CREATE INDEX IF NOT EXISTS idx_edh_combos_deck_count ON magic_edh_combos(commander_id, deck_count DESC);

-- FTS on combo card names for "what combos use Thassa's Oracle?" queries
CREATE VIRTUAL TABLE IF NOT EXISTS magic_edh_combos_fts USING fts5(
  commander_id UNINDEXED,
  combo_id UNINDEXED,
  card_names_text,  -- space-separated card names for FTS matching
  results_text,     -- space-separated results for FTS matching
  tokenize='porter unicode61'
);

-- ── Average decklists per commander ─────────────────────────

CREATE TABLE IF NOT EXISTS magic_edh_average_decks (
  commander_id   TEXT NOT NULL,  -- FK to magic_edh_commanders.scryfall_id
  card_name      TEXT NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 1,
  category       TEXT NOT NULL DEFAULT '',  -- e.g. creatures, instants, lands
  PRIMARY KEY (commander_id, card_name)
);

CREATE INDEX IF NOT EXISTS idx_edh_avg_commander ON magic_edh_average_decks(commander_id);

-- ── Mana curves per commander ───────────────────────────────

CREATE TABLE IF NOT EXISTS magic_edh_mana_curves (
  commander_id   TEXT NOT NULL,  -- FK to magic_edh_commanders.scryfall_id
  cmc            INTEGER NOT NULL,
  avg_count      REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (commander_id, cmc)
);

-- ── Pre-aggregated themes across all commanders ─────────────

-- Pre-computed aggregation for commander_trends.themes mode. Populated at
-- the end of each edhrec-fetch run from magic_edh_commanders.themes JSON.
-- Avoids scanning all ~2000 commanders on every query.
CREATE TABLE IF NOT EXISTS magic_edh_themes (
  slug            TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  total_count     INTEGER NOT NULL DEFAULT 0,
  commander_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_edh_themes_total ON magic_edh_themes(total_count DESC);

-- Pipeline state tracking reuses magic_pipeline_state with tool='edhrec'
-- and commander slug stored in the set_code column.
