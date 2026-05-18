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

**Deliberately out of scope** (covered by a later epic fixture-expansion
task, since they require real captured data): cluster-jewel
`passives.jewel_data` subgraphs, `hashes_ex`, mastery effects, and
multi-league characters. The real-PoB integration test in the
"wrapper.lua import seam" task is the correctness arbiter for the
transformer's output against the live engine.
