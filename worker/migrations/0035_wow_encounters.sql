-- WoW dungeon/raid boss encounters for anti-hallucination reference lookups.
-- Populated by plugins/wow/tools/journal-fetch pipeline from Blizzard Journal API.

CREATE TABLE IF NOT EXISTS wow_encounters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encounter_id INTEGER NOT NULL,
  encounter_name TEXT NOT NULL,
  instance_id INTEGER,
  instance_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_wow_encounters_encounter_id ON wow_encounters(encounter_id);
CREATE INDEX IF NOT EXISTS idx_wow_encounters_instance ON wow_encounters(instance_name);

CREATE TABLE IF NOT EXISTS wow_encounter_abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encounter_id INTEGER NOT NULL,
  ability_name TEXT NOT NULL,
  ability_description TEXT
);

CREATE INDEX IF NOT EXISTS idx_wow_encounter_abilities_encounter ON wow_encounter_abilities(encounter_id);

-- FTS5: one row per unique encounter for full-text search.
CREATE VIRTUAL TABLE IF NOT EXISTS wow_encounters_fts USING fts5(
  encounter_id UNINDEXED,
  encounter_name,
  instance_name,
  tokenize='porter unicode61'
);
