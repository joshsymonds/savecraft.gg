-- MTG Arena comprehensive rules and card rulings for hybrid search.
-- Structured tables for exact lookups + FTS5 virtual tables for BM25 ranking.

CREATE TABLE IF NOT EXISTS mtga_rules (
  number TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  example TEXT,
  see_also TEXT  -- JSON array of rule numbers, e.g. '["704.5","603.7a"]'
);

CREATE TABLE IF NOT EXISTS mtga_card_rulings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oracle_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  published_at TEXT,
  comment TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_rulings_oracle ON mtga_card_rulings(oracle_id);
CREATE INDEX IF NOT EXISTS idx_card_rulings_name ON mtga_card_rulings(card_name);

-- FTS5 virtual tables for BM25 keyword search.
-- Porter stemming + unicode61 tokenizer matches the existing search_index pattern.
CREATE VIRTUAL TABLE IF NOT EXISTS mtga_rules_fts USING fts5(
  number UNINDEXED,
  text,
  example,
  tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS mtga_card_rulings_fts USING fts5(
  oracle_id UNINDEXED,
  card_name,
  comment,
  tokenize='porter unicode61'
);
