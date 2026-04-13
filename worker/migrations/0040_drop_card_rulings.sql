-- Drop Scryfall card rulings tables.
-- Card rulings were removed from the rules_search module because they can go
-- stale when the Comprehensive Rules change between set releases, causing LLMs
-- to cite outdated rulings over the current authoritative rules text.
DROP TABLE IF EXISTS mtga_card_rulings_fts;
DROP INDEX IF EXISTS idx_card_rulings_oracle;
DROP INDEX IF EXISTS idx_card_rulings_name;
DROP TABLE IF EXISTS mtga_card_rulings;
