-- EDHREC's per-theme average decklists per commander.
-- Themes are populated from each commander's top tag-links (e.g. "infect",
-- "+1/+1 Counters", "tokens"). The endpoint URL is
-- /pages/average-decks/{commander-slug}/{theme-slug}.json — same JSON shape
-- as the tier endpoints, so the existing ParseTierPage parser is reused.
--
-- Used by commander_deckbuild's `theme` parameter to filter recommendations
-- to a specific archetype (e.g. "infect Atraxa" vs cross-theme average).

CREATE TABLE IF NOT EXISTS magic_edh_commander_theme_meta (
  commander_id  TEXT NOT NULL,
  theme_slug    TEXT NOT NULL,
  theme_value   TEXT NOT NULL,    -- display name like "Infect"
  avg_price     REAL NOT NULL DEFAULT 0,
  num_decks_avg INTEGER NOT NULL DEFAULT 0,
  deck_size     INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY (commander_id, theme_slug)
);

CREATE INDEX IF NOT EXISTS idx_edh_theme_meta_commander
  ON magic_edh_commander_theme_meta(commander_id);

CREATE TABLE IF NOT EXISTS magic_edh_average_decks_by_theme (
  commander_id  TEXT NOT NULL,
  theme_slug    TEXT NOT NULL,
  card_name     TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  category      TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (commander_id, theme_slug, card_name)
);

CREATE INDEX IF NOT EXISTS idx_edh_theme_decks_commander
  ON magic_edh_average_decks_by_theme(commander_id, theme_slug);
