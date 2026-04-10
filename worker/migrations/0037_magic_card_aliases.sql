-- Alias table for alternate card names (flavor_name, printed_name).
-- Maps UB reskin names (e.g., "Donnie's Bō" → Shadowspear's oracle_id)
-- so search and resolution work with flavor/printed names.
CREATE TABLE magic_card_aliases (
  alias_name TEXT NOT NULL COLLATE NOCASE,
  oracle_id TEXT NOT NULL,
  PRIMARY KEY (alias_name)
);

CREATE INDEX idx_magic_card_aliases_oracle_id ON magic_card_aliases(oracle_id);
