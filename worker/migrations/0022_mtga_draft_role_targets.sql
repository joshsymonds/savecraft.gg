-- Per-archetype average role counts from winning decks.
-- Used by the role fulfillment axis in draft scoring to determine how many
-- creatures, removal spells, mana fixers, and noncreature/nonremoval cards
-- a winning deck in each archetype typically runs.

CREATE TABLE IF NOT EXISTS magic_draft_role_targets (
  set_code    TEXT NOT NULL,
  color_pair  TEXT NOT NULL,
  role        TEXT NOT NULL,
  avg_count   REAL NOT NULL,
  total_decks INTEGER NOT NULL,
  PRIMARY KEY (set_code, color_pair, role)
);

CREATE INDEX IF NOT EXISTS idx_role_targets_set
  ON magic_draft_role_targets(set_code);
