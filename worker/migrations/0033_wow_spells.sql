-- WoW spells/abilities for anti-hallucination reference lookups.
-- Each row is a spell-to-spec assignment (a spell shared by multiple specs gets multiple rows).
-- Populated by plugins/wow/tools/spell-fetch pipeline from Blizzard Game Data API.

CREATE TABLE IF NOT EXISTS wow_spells (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spell_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  class_id INTEGER,
  class_name TEXT,
  spec_id INTEGER,
  spec_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_wow_spells_spell_id ON wow_spells(spell_id);
CREATE INDEX IF NOT EXISTS idx_wow_spells_class ON wow_spells(class_name);
CREATE INDEX IF NOT EXISTS idx_wow_spells_spec ON wow_spells(spec_name);

-- FTS5 virtual table for full-text search by spell name.
-- Porter stemming handles plural/conjugation variants.
CREATE VIRTUAL TABLE IF NOT EXISTS wow_spells_fts USING fts5(
  spell_id UNINDEXED,
  name,
  description,
  tokenize='porter unicode61'
);
