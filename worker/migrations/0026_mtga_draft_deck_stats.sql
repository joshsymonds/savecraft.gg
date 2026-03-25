-- Per-archetype aggregate deck composition stats from winning decks.
-- Used by the deckbuilding reference module for data-driven deck health checks.
-- Composition averages (lands, creatures, fixing, etc.) are from winning decks only.
-- Win rates (splash vs non-splash) use all games for accurate rates.

CREATE TABLE IF NOT EXISTS mtga_draft_deck_stats (
  set_code          TEXT NOT NULL,
  color_pair        TEXT NOT NULL,
  avg_lands         REAL NOT NULL,
  avg_creatures     REAL NOT NULL,
  avg_noncreatures  REAL NOT NULL,
  avg_fixing        REAL NOT NULL,
  splash_rate       REAL NOT NULL,
  splash_avg_sources REAL NOT NULL,
  splash_winrate    REAL NOT NULL,
  nonsplash_winrate REAL NOT NULL,
  total_decks       INTEGER NOT NULL,
  PRIMARY KEY (set_code, color_pair)
);
