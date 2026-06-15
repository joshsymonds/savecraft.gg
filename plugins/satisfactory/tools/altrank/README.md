# altrank — alternate-recipe tier derivation

Re-derives Satisfactory alternate-recipe tiers for the **current** game version
by linear optimization, instead of transcribing a published (and quickly stale)
tier list. The output feeds the `hard_drive_tiers` reference module.

## Methodology

Follows u/wrigh516's "Alternate Recipe Ranking 1.0" (r/SatisfactoryGame), a
clean-room reimplementation of the approach in the unlicensed reference repo
[Scott1903/satisfactory_planner](https://github.com/Scott1903/satisfactory_planner):

1. Model the whole factory as an LP that produces a fixed **output basket**
   (the final Project Assembly parts, in the needed ratios) at minimum weighted
   cost, choosing recipes and generators freely (`model.py`).
2. Score each alternate recipe by **forcing** it as the sole recipe for its
   product, re-optimizing everything else, and comparing the optimum to the
   standard recipe (or the average of alternatives when there is no standard).
3. Repeat under two published weightings and bucket scores into S–F tiers.

Power is modeled as a flow item: machines consume their power draw, generators
produce power by burning fuel + supplemental water, so a power-hungry recipe
pulls in the raw resources to fuel it automatically. Raw resources are mined up
to per-type caps and weighted by inverse map availability ("Resources\*").
Buildings are scaled by recipe complexity ("Buildings\*"). The resource caps and
weightings in `altrank.py` are wrigh516's published constants.

### Scoring & tiers

wrigh516's exact 0–100 score formula is unpublished, so we score by the
**weighted percent improvement** of the re-optimized factory when a recipe is
forced, versus forcing the item's standard recipe (or the average over its
recipes when there is no standard). Higher is better; ~0 is neutral.

- **resources** ranking improvement = −Δ(Resources\*) %.
- **effort** ranking improvement = −mean(ΔItems, ΔBuildings\*, ΔResources\*) %
  (wrigh516 sets the weights so those three carry equal impact).

Improvements are bucketed into S–F by the documented `TIER_BANDS` thresholds in
`altrank.py`, tuned so the distribution is non-degenerate and tracks his
ordering (our resources S-tier size matches his exactly at 10). The emitted Go
table carries each recipe's tier, overall improvement %, and the six per-metric
deltas (power/items/buildings/resources/buildings\*/resources\*) as evidence,
for both weightings. A few alternates are infeasible to force in isolation and
are skipped (no entry), mirroring wrigh516's "recipe not used / missing" note.

## Running (offline only)

The solver (`glpsol`) and Python come from nix; the WASM build never touches
this. From this directory:

```sh
nix-shell -p python3 glpk --run '
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
  .venv/bin/python read_docs.py /path/to/Satisfactory/CommunityResources/Docs/en-US.json data.json
  .venv/bin/python altrank.py --baseline   # sanity solve; full ranking + Go emit added in follow-up
'
```

Get `en-US.json` from a game install (e.g.
`scp gnomon:~/.local/share/Steam/steamapps/common/Satisfactory/CommunityResources/Docs/en-US.json`).
It is gitignored input (like the Go datagen's); the committed output is the
generated Go table the module serves.

## Files

- `read_docs.py` — parse shipped Docs.json → `data.json` (items, recipes,
  generators). Clean-room; mirrors the Go datagen's field extraction.
- `model.py` — the production LP (Pyomo).
- `altrank.py` — driver: resource caps, weightings, output basket. `--baseline`
  runs one solve per weighting and prints metrics.
