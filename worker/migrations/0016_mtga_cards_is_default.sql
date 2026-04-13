-- Add is_default column to support multiple printings per card.
-- is_default = 1 for the most recent Arena printing (highest arena_id per oracle_id).
-- card_search and mana_base filter to is_default = 1 for name-based lookups.

ALTER TABLE magic_cards ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_magic_cards_is_default ON magic_cards(is_default);
CREATE INDEX idx_magic_cards_name_default ON magic_cards(name, is_default);
