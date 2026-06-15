# Validation: derived 1.2 tiers vs wrigh516's 1.0 rankings

`compare_1_0.py` checks the emitted `reference/data/altrank_gen.go` against
u/wrigh516's published 1.0 tier tables (transcribed in the script). Agreement
is measured on the recipes present in both (103 of our 109), as exact-tier match
and within-±1-tier (one tier of drift is noise, not disagreement).

Re-run: `python3 compare_1_0.py`

## Results (game build 481836)

| Ranking   | Exact | Within ±1 | Deviations ≥2 tiers |
|-----------|-------|-----------|---------------------|
| resources | 54%   | **95%**   | 5 / 103             |
| effort    | 46%   | 77%       | 23 / 103            |

The **resources** ranking validates the methodology strongly: 95% of recipes
land within one tier of wrigh516's, and the anchors match — Pure Copper Ingot,
Copper Alloy Ingot, Dark Matter Trap, Pure Aluminum Ingot and Turbo Diamonds are
all S; Pure Copper Ingot in particular reproduces his signature split (resources
S, effort poor). The resources objective is a single clean metric (scaled raw
extraction), so the LP + Docs.json data reproduce his 1.0 result almost exactly,
with the residual drift attributable to genuine 1.2 recipe changes.

## Why the effort ranking drifts more

The effort score combines three metrics (item throughput, scaled buildings,
scaled resources). wrigh516 weights them "to equal percentage impact" but the
exact weights and his 0–100 normalization are **unpublished**, so we equal-weight
the three percent deltas. That differs from his tuned weighting, which shifts
building-heavy recipes by a tier or two — most of the ≥2-tier deviations
(Sloppy Alumina, Caterium/Silicon Circuit Board, the iron-ingot alternates) are
recipes whose ranking is dominated by the building term. The effort tiers are
therefore directionally right but should be read as "our reproduction" rather
than a match to his exact numbers.

Both rankings ship with their full per-metric deltas, so a consumer can see the
evidence behind every tier rather than trusting the letter alone. The
`resources` ranking is the more faithful of the two.

## Known limitation

`uranium_fuel_unit` deviates in both rankings (his S → ours C). Its value hinges
on whole-chain power generation from nuclear waste handling, which our
single-flow power model approximates more coarsely than wrigh516's; treat
nuclear-fuel alternates as approximate. A future pass could refine nuclear
modeling and/or fit the effort weighting to his published deltas.
