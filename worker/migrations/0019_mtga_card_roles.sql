-- Card role tags from Scryfall Tagger (function: tags).
-- Used for role-based deck composition scoring in draft recommendations.
-- Populated by tagger-fetch tool, which scrapes Scryfall search API per set.

CREATE TABLE IF NOT EXISTS mtga_card_roles (
  oracle_id       TEXT NOT NULL,
  front_face_name TEXT NOT NULL,
  role            TEXT NOT NULL,
  set_code        TEXT NOT NULL,
  PRIMARY KEY (oracle_id, role, set_code)
);

CREATE INDEX IF NOT EXISTS idx_card_roles_name
  ON mtga_card_roles(front_face_name, set_code);
CREATE INDEX IF NOT EXISTS idx_card_roles_set
  ON mtga_card_roles(set_code);
