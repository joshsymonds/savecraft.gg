-- MTG Arena interaction patterns for rules reasoning guidance.
-- Curated breakdowns of complex rules interactions that are auto-retrieved
-- alongside Comprehensive Rules to help LLMs reason correctly about edge cases.
-- Content is hand-authored and derives from the Comprehensive Rules.

CREATE TABLE IF NOT EXISTS mtga_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,           -- e.g. "Blood Moon + Sagas"
  mechanics TEXT NOT NULL,       -- comma-separated tags: "layers,type-changing,SBA"
  card_names TEXT NOT NULL,      -- comma-separated: "Blood Moon,Urza's Saga"
  rule_numbers TEXT NOT NULL,    -- comma-separated: "305.7,613.1d,704.5s"
  breakdown TEXT NOT NULL,       -- step-by-step reasoning from CR
  common_error TEXT NOT NULL     -- what LLMs typically get wrong
);

CREATE VIRTUAL TABLE IF NOT EXISTS mtga_interactions_fts USING fts5(
  id UNINDEXED,
  title,
  mechanics,
  card_names,
  breakdown,
  tokenize='porter unicode61'
);
