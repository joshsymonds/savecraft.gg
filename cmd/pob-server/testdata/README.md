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

**TODO (needs real capture):** drop a real GGG `GET /character/<name>`
JSON for an actual cluster-jewel character here and add a real-PoB calc
assertion (deterministic buildId + non-zero Life) mirroring
`TestImportMultiLeagueRealPoB`. Requires GGG OAuth capture tooling / an
authorized account; do not fabricate the subgraph for a live-engine
assertion.

**Still deliberately out of scope** (need real captures): `hashes_ex`
and mastery-effect-heavy characters.
