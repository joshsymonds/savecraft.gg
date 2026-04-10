-- Add variant support to poe_uniques. Unique items like Atziri's Splendour
-- have multiple variants with different mods — each variant is a separate row.
-- PK changes from (name) to (name, variant).

-- SQLite can't ALTER PRIMARY KEY, so we recreate the table.
DROP TABLE IF EXISTS poe_uniques_fts;
DROP TABLE IF EXISTS poe_uniques;

CREATE TABLE IF NOT EXISTS poe_uniques (
  name TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT '',
  base_type TEXT NOT NULL,
  item_class TEXT NOT NULL,
  level_requirement INTEGER,
  str_requirement INTEGER,
  dex_requirement INTEGER,
  int_requirement INTEGER,
  properties TEXT NOT NULL DEFAULT '[]',
  implicit_mods TEXT NOT NULL DEFAULT '[]',
  explicit_mods TEXT NOT NULL DEFAULT '[]',
  flavour_text TEXT,
  drop_level INTEGER,
  PRIMARY KEY (name, variant)
);

CREATE INDEX idx_poe_uniques_base ON poe_uniques(base_type);
CREATE INDEX idx_poe_uniques_class ON poe_uniques(item_class);

CREATE VIRTUAL TABLE IF NOT EXISTS poe_uniques_fts USING fts5(
  name,
  variant UNINDEXED,
  base_type,
  item_class,
  explicit_mods,
  tokenize='porter unicode61'
);
