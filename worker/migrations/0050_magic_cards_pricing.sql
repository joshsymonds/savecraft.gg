-- Add Scryfall pricing + supply flags to magic_cards.
-- Populated by scryfall-fetch from Scryfall bulk default_cards data:
--   price_usd: prices.usd (string, may be null/empty for unpriced cards)
--   reserved:  Reserved List flag (supply-frozen pre-1996 cards)
--   reprint:   true when this printing is a reprint of an earlier set

ALTER TABLE magic_cards ADD COLUMN price_usd REAL;
ALTER TABLE magic_cards ADD COLUMN reserved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE magic_cards ADD COLUMN reprint INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_magic_cards_price_usd ON magic_cards(price_usd) WHERE price_usd IS NOT NULL;
CREATE INDEX idx_magic_cards_reserved ON magic_cards(reserved) WHERE reserved = 1;
