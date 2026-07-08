-- Path of Exile 2 passive tree nodes, populated from GGG's official
-- poe2-skilltree-export data.json (plugins/poe2/tools/tree-fetch).
--
-- Keyed by node hash (the tree export's integer "skill" id), matching the
-- node hashes the poe2 adapter surfaces in a character's passives section
-- (`hashes` array), so passive_tree's resolve_hashes operation can join
-- allocated hashes straight back to name/type/stats.
--
-- Column set is scoped to what the passive_tree module needs (search +
-- resolve_hashes) — no group/orbit/x/y layout data, unlike PoE1's
-- poe_passive_nodes which also backs tree-rendering views.
CREATE TABLE IF NOT EXISTS poe2_passive_nodes (
  hash INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  is_notable INTEGER NOT NULL DEFAULT 0,
  is_keystone INTEGER NOT NULL DEFAULT 0,
  is_mastery INTEGER NOT NULL DEFAULT 0,
  ascendancy_name TEXT,               -- NULL for non-ascendancy nodes
  stats TEXT NOT NULL DEFAULT '[]'    -- JSON array of stat strings
);

CREATE INDEX idx_poe2_nodes_notable ON poe2_passive_nodes(is_notable) WHERE is_notable = 1;
CREATE INDEX idx_poe2_nodes_keystone ON poe2_passive_nodes(is_keystone) WHERE is_keystone = 1;
CREATE INDEX idx_poe2_nodes_ascendancy ON poe2_passive_nodes(ascendancy_name) WHERE ascendancy_name IS NOT NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS poe2_passive_nodes_fts USING fts5(
  hash UNINDEXED,
  name,
  stats,
  ascendancy_name,
  tokenize='porter unicode61'
);
