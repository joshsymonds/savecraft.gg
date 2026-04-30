-- EDHREC per-card prices, populated by edhrec-fetch's card-page scrape phase.
-- Multi-vendor coverage so deck-builder reported prices match what users see
-- on EDHREC. Source: https://json.edhrec.com/pages/cards/{slug}.json

CREATE TABLE IF NOT EXISTS magic_edh_card_prices (
  card_name         TEXT PRIMARY KEY,
  tcgplayer_price   REAL,    -- TCGPlayer mid, Normal subType only
  cardkingdom_price REAL,
  scg_price         REAL,
  mtgstocks_price   REAL,
  priced_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edh_card_prices_tcgplayer
  ON magic_edh_card_prices(tcgplayer_price)
  WHERE tcgplayer_price IS NOT NULL;
