# pob-server testdata

## ggg_character_basic.json

A single-character `GET /character/<name>` style response for the GGG
OAuth API (resource server `api.pathofexile.com`), used by the
`transformToImportJSON` unit tests.

**Provenance:** Hand-constructed to the GGG OAuth API reference schema
(`pathofexile.com/developer/docs/reference`, Character + Item + passives
objects), cross-checked field-for-field against the shapes Path of
Building's account-import actually consumes
(`.reference/pob/src/Classes/ImportTab.lua` `ImportItemsAndSkills` /
`ImportPassiveTreeAndJewels` / `ImportItem`, and the legacy shapes
exercised by `.reference/pob/spec/System/TestImportReimport_spec.lua`).
It is **not** a live capture — we do not yet have GGG OAuth wired to
capture one.

Scope of this fixture: a basic ascended PoE1-PC character (Marauder /
Juggernaut), two equipped items (a 6-socket linked weapon with an
active + support gem, a body armour), one Timeless jewel, a non-empty
`passives.hashes`, and empty `hashes_ex` / `mastery_effects` /
`jewel_data`.

The real-PoB integration test in the "wrapper.lua import seam" task is
the correctness arbiter for the transformer's output against the live
engine.

## ggg_character_settlers.json

The basic Juggernaut, byte-for-byte, with a non-Standard `league`
("Settlers"). Provenance: derived from `ggg_character_basic.json`; only
the `league` strings differ. Because the rest is the known-good basic
build, this is faithful enough to drive the **live PoB engine** —
`TestImportMultiLeagueRealPoB` asserts a deterministic content-addressed
buildId plus real calc output (`summary.Life > 0`).

## ggg_character_cluster.json

The basic Juggernaut plus a Large Cluster Jewel in `jewels[]` and a
`passives.jewel_data` expansion subgraph (groups/nodes/proxy), shaped to
the GGG OAuth reference + PoB's `PassiveSpec` subgraph consumer.

**Synthetic — not a live capture.** A hand-built cluster subgraph cannot
be validated against the live PoB passive tree without a real captured
character, so this fixture is used ONLY for the property Go owns and the
content-addressed buildId depends on:
`TestImportClusterJewelTransformPassthroughDeterministic` asserts the
transform passes `jewel_data` and the cluster jewel item through
byte-verbatim and deterministically.

## ggg_character_real_chalith.json

**Real live capture.** A genuine GGG `GET /character/<name>` response
(bare character object, envelope stripped) captured via the OAuth
adapter from staging: a level 90 Ascendant with **9 jewels socketed in
the passive tree** (`inventoryId: "PassiveJewels"`, distinct `x` socket
indices) and a matching 9-entry `passives.jewel_data`. This is the real
capture the cluster TODO asked for — none of the authorized account's
characters run a cluster jewel, but a 9-socket tree-jewel build
exercises the same `inventoryId`/`x` → tree-socket placement path the
synthetic cluster fixture could not validate against the live engine.

- `TestImportRealCharacterJewelsTransformPassthrough` (always runs):
  all 9 jewels reach the passive importer's `items[]` and `jewel_data`
  passes through verbatim.
- `TestImportRealCharacterJewelsPlacedRealPoB` (needs `POB_DIR`): the
  live PoB engine places all 9 jewels into tree sockets bound to their
  items (non-zero Life). Asserts per-`<Socket>` because PoB's Lua XML
  serializer emits attributes in non-deterministic order.

**Still deliberately out of scope** (need real captures): an actual
cluster-jewel character (`jewel_data` expansion subgraph against the
live tree — `ggg_character_cluster.json` still covers transform
passthrough only), `hashes_ex`, and mastery-effect-heavy characters.
