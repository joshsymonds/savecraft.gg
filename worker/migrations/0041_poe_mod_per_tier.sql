-- Redesign poe_mods: one row per mod tier with pre-rendered text from PoB.
-- Old schema stored grouped mods with JSON tier arrays from RePoE.
-- New schema stores individual tiers with the mod text directly, grouped by
-- group_name for display. Populated by pob-fetch (replaces repoe-fetch).

DROP TABLE IF EXISTS poe_mods_fts;
DROP TABLE IF EXISTS poe_mods;

CREATE TABLE IF NOT EXISTS poe_mods (
  mod_id TEXT PRIMARY KEY,          -- e.g., "Strength1"
  mod_text TEXT NOT NULL,           -- pre-rendered: "+(8-12) to Strength"
  affix TEXT,                       -- e.g., "of the Brute"
  generation_type TEXT,             -- "prefix" or "suffix"
  level INTEGER,                    -- required item level for this tier
  group_name TEXT,                  -- groups tiers of the same effect
  item_classes TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["ring","amulet"]
  tags TEXT NOT NULL DEFAULT '[]'   -- JSON array: ["attribute"]
);

CREATE INDEX idx_poe_mods_group ON poe_mods(group_name);
CREATE INDEX idx_poe_mods_type ON poe_mods(generation_type);

CREATE VIRTUAL TABLE IF NOT EXISTS poe_mods_fts USING fts5(
  mod_id UNINDEXED,
  mod_text,
  tokenize='porter unicode61'
);
