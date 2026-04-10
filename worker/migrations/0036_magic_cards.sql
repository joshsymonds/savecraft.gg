-- Replace mtga_cards (arena_id PK) with magic_cards (scryfall_id PK).
-- Expands card coverage from Arena-only (~23k) to all Magic cards (~113k)
-- via Scryfall bulk data. arena_id becomes a nullable indexed column for
-- collection_diff lookups. DFC back-face arena_ids stored in arena_id_back.

-- ── Drop old tables ─────────────────────────────────────────────

DROP TABLE IF EXISTS mtga_cards_fts;
DROP TABLE IF EXISTS mtga_cards;

-- ── New card data table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS magic_cards (
  scryfall_id TEXT PRIMARY KEY,
  arena_id INTEGER,
  arena_id_back INTEGER,
  oracle_id TEXT NOT NULL,
  name TEXT NOT NULL,
  front_face_name TEXT NOT NULL DEFAULT '',
  mana_cost TEXT NOT NULL DEFAULT '',
  cmc REAL NOT NULL DEFAULT 0,
  type_line TEXT NOT NULL DEFAULT '',
  oracle_text TEXT NOT NULL DEFAULT '',
  colors TEXT NOT NULL DEFAULT '[]',
  color_identity TEXT NOT NULL DEFAULT '[]',
  legalities TEXT NOT NULL DEFAULT '{}',
  rarity TEXT NOT NULL DEFAULT '',
  set_code TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '[]',
  produced_mana TEXT NOT NULL DEFAULT '[]',
  power TEXT NOT NULL DEFAULT '',
  toughness TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_magic_cards_arena_id ON magic_cards(arena_id);
CREATE INDEX idx_magic_cards_arena_id_back ON magic_cards(arena_id_back) WHERE arena_id_back IS NOT NULL;
CREATE INDEX idx_magic_cards_oracle_id ON magic_cards(oracle_id);
CREATE INDEX idx_magic_cards_is_default ON magic_cards(is_default);
CREATE INDEX idx_magic_cards_name_default ON magic_cards(name, is_default);
CREATE INDEX idx_magic_cards_front_face_default ON magic_cards(front_face_name, is_default);

-- ── New FTS5 table ──────────────────────────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS magic_cards_fts USING fts5(
  scryfall_id UNINDEXED,
  name,
  oracle_text,
  type_line,
  tokenize='porter unicode61'
);
