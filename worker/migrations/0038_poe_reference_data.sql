-- PoE reference data for anti-hallucination modules (gem_search, passive_tree, unique_search).
-- Populated by Go CLI tools: repoe-fetch (gems, uniques, mods, base items, stat translations)
-- and skilltree-fetch (passive nodes). Economy module uses live poe.ninja fetch, no D1.

-- ── Gems ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poe_gems (
  gem_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_support INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'W',       -- R(str), G(dex), B(int), W(neutral)
  tags TEXT NOT NULL DEFAULT '[]',        -- JSON array: ["Spell", "Fire", "AoE"]
  level_requirement INTEGER,
  str_requirement INTEGER,
  dex_requirement INTEGER,
  int_requirement INTEGER,
  cast_time REAL,
  mana_cost TEXT,
  description TEXT,
  stats_at_20 TEXT NOT NULL DEFAULT '[]', -- JSON array of stat strings at level 20
  quality_stats TEXT NOT NULL DEFAULT '[]',
  supports_tags TEXT                      -- JSON array (support gems only): tags this gem supports
);

CREATE INDEX idx_poe_gems_name ON poe_gems(name);
CREATE INDEX idx_poe_gems_color ON poe_gems(color);
CREATE INDEX idx_poe_gems_support ON poe_gems(is_support);

CREATE VIRTUAL TABLE IF NOT EXISTS poe_gems_fts USING fts5(
  gem_id UNINDEXED,
  name,
  tags,
  description,
  tokenize='porter unicode61'
);

-- ── Unique items ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poe_uniques (
  name TEXT PRIMARY KEY,
  base_type TEXT NOT NULL,
  item_class TEXT NOT NULL,
  level_requirement INTEGER,
  str_requirement INTEGER,
  dex_requirement INTEGER,
  int_requirement INTEGER,
  properties TEXT NOT NULL DEFAULT '[]',    -- JSON array: [{"label":"Armour","value":"553"}]
  implicit_mods TEXT NOT NULL DEFAULT '[]', -- JSON array of mod strings
  explicit_mods TEXT NOT NULL DEFAULT '[]', -- JSON array of mod strings
  flavour_text TEXT,
  drop_level INTEGER
);

CREATE INDEX idx_poe_uniques_base ON poe_uniques(base_type);
CREATE INDEX idx_poe_uniques_class ON poe_uniques(item_class);

CREATE VIRTUAL TABLE IF NOT EXISTS poe_uniques_fts USING fts5(
  name,
  base_type,
  item_class,
  explicit_mods,
  tokenize='porter unicode61'
);

-- ── Passive tree nodes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poe_passive_nodes (
  skill_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  is_notable INTEGER NOT NULL DEFAULT 0,
  is_keystone INTEGER NOT NULL DEFAULT 0,
  is_mastery INTEGER NOT NULL DEFAULT 0,
  is_ascendancy INTEGER NOT NULL DEFAULT 0,
  ascendancy_name TEXT,
  stats TEXT NOT NULL DEFAULT '[]',        -- JSON array of stat strings
  group_id INTEGER,
  orbit INTEGER,
  orbit_index INTEGER
);

CREATE INDEX idx_poe_nodes_notable ON poe_passive_nodes(is_notable) WHERE is_notable = 1;
CREATE INDEX idx_poe_nodes_keystone ON poe_passive_nodes(is_keystone) WHERE is_keystone = 1;
CREATE INDEX idx_poe_nodes_ascendancy ON poe_passive_nodes(ascendancy_name) WHERE ascendancy_name IS NOT NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS poe_passive_nodes_fts USING fts5(
  skill_id UNINDEXED,
  name,
  stats,
  ascendancy_name,
  tokenize='porter unicode61'
);

-- ── Stat translations ───────────────────────────────────────────────
-- Maps internal stat IDs (e.g. "LocalPhysicalDamage") to display text
-- (e.g. "{0} to {1} added Physical Damage"). Used by all modules to
-- render human-readable stat descriptions from raw data.

CREATE TABLE IF NOT EXISTS poe_stat_translations (
  stat_id TEXT PRIMARY KEY,
  translation TEXT NOT NULL,
  format_type TEXT                          -- e.g. "range", "+number", "static"
);

-- ── Base items ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poe_base_items (
  item_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  item_class TEXT NOT NULL,
  level_requirement INTEGER,
  implicit_mods TEXT NOT NULL DEFAULT '[]', -- JSON array of mod strings
  properties TEXT NOT NULL DEFAULT '{}',    -- JSON: {"armour": 400, "evasion": 0}
  tags TEXT NOT NULL DEFAULT '[]'           -- JSON array: ["str_armour", "chest"]
);

CREATE INDEX idx_poe_base_items_name ON poe_base_items(name);
CREATE INDEX idx_poe_base_items_class ON poe_base_items(item_class);

CREATE VIRTUAL TABLE IF NOT EXISTS poe_base_items_fts USING fts5(
  item_id UNINDEXED,
  name,
  item_class,
  tokenize='porter unicode61'
);

-- ── Mods ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poe_mods (
  mod_id TEXT PRIMARY KEY,
  mod_name TEXT NOT NULL,
  generation_type TEXT,                     -- "prefix" or "suffix"
  mod_type TEXT,                            -- "explicit", "implicit", "crafted"
  domain TEXT,                              -- "item", "flask", "jewel", etc.
  item_class_spawns TEXT NOT NULL DEFAULT '{}', -- JSON: {"claw": 100, "dagger": 100}
  stat_ids TEXT NOT NULL DEFAULT '[]',      -- JSON array: ["LocalPhysicalDamage"]
  stat_ranges TEXT NOT NULL DEFAULT '[]',   -- JSON array: [[1,3], [4,6]]
  tiers TEXT NOT NULL DEFAULT '[]'          -- JSON array of tier objects
);

CREATE INDEX idx_poe_mods_type ON poe_mods(generation_type);
CREATE INDEX idx_poe_mods_domain ON poe_mods(domain);

CREATE VIRTUAL TABLE IF NOT EXISTS poe_mods_fts USING fts5(
  mod_id UNINDEXED,
  mod_name,
  tokenize='porter unicode61'
);
