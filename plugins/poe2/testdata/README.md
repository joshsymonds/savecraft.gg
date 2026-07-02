# Fixture provenance

`ggg-poe2-character-full.json` and `ggg-poe2-character-list.json` are
**hand-built from the documented shape**, not captured from a real GGG
response — GGG's PoE2 OAuth character endpoints are not yet reachable with
a test account, and no embedded sample payload was found in the
PathOfBuildingCommunity/PathOfBuilding-PoE2 repo.

The documented shape comes from GGG's developer reference
(https://www.pathofexile.com/developer/docs/reference, verified July 2026)
as given in the task brief. Several PoE2-only field names were
cross-checked against real GGG-API-consuming code in
`PathOfBuildingCommunity/PathOfBuilding-PoE2` (`src/Classes/ImportTab.lua`,
`dev` branch) and are confirmed present there: `passives.specialisations`
(iterated as `pairs(charPassiveData.specialisations)`, keyed by set name),
`passives.quest_stats`, `item.grantedSkills`, `item.sanctified`,
`item.doubleCorrupted`, `item.desecratedMods`, `item.runeMods`, and
`character.skills` (an array of gem-shaped Items, each optionally carrying
`socketedItems` for attached support gems — matches this adapter's model).

Fields that could **not** be corroborated against that import script —
`gemTabs`, `gemSkill`, `gemBackground` — are included solely on the
strength of the task brief's GGG-developer-reference citation; PoB2's
importer reads gem level/quality directly off `skills[].properties` instead
and does not appear to consume `gemTabs`. If GGG's actual PoE2 response
turns out to shape these differently, `plugins/poe2/adapter/types.ts` and
`sections.ts` are the two files to reconcile against a real captured
payload.

`gemSockets` and `grantedSkills` are no longer in that uncorroborated set.
Both shapes are directly verified against GGG's developer reference
(https://www.pathofexile.com/developer/docs/reference, verified July 2026):
`item.gemSockets` is documented as `?array of string` ("string is always
W" — not a socket count), and `item.grantedSkills` is documented as
`?array of ItemProperty` (PoE2 only). The fixture encodes both
accordingly — `skills[].gemSockets` is an array of `"W"` entries sized to
match each item's socket count, and the first skill item carries a
`grantedSkills` entry in the same name/values property shape as
`properties` — so the adapter's mappers (which derive a numeric socket
count from the array length, and surface granted skills as name/values
pairs) are exercised against a GGG-doc-accurate payload rather than a
guess.
