-- Pairwise card synergy data computed from 17Lands game_data co-occurrence.
-- Both directions stored (A→B and B→A) for clean index-only lookups.
-- Used by draft_ratings module mode 6 for contextual pick recommendations.

CREATE TABLE IF NOT EXISTS mtga_draft_synergies (
  set_code       TEXT NOT NULL,
  card_a         TEXT NOT NULL,
  card_b         TEXT NOT NULL,
  synergy_delta  REAL NOT NULL DEFAULT 0,
  games_together INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, card_a, card_b)
);

CREATE INDEX IF NOT EXISTS idx_draft_synergies_lookup
  ON mtga_draft_synergies(set_code, card_a);

-- Average CMC distribution of winning decks per archetype.
-- Used by draft_ratings module mode 6 for curve need scoring.

CREATE TABLE IF NOT EXISTS mtga_draft_archetype_curves (
  set_code    TEXT NOT NULL,
  color_pair  TEXT NOT NULL,
  cmc         INTEGER NOT NULL,
  avg_count   REAL NOT NULL DEFAULT 0,
  total_decks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_code, color_pair, cmc)
);
