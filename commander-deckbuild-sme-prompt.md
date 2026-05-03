# Commander Deck Build: Algorithmic SME Consultation

## Context: what we're building

I'm building an automated **Commander deck builder** for the EDH/Commander format of Magic: The Gathering. The system takes two inputs from a user — a commander card name and a USD budget — and outputs a complete 100-card deck that:

1. Is legal (singleton, color identity matches commander, no banned cards).
2. Falls within the budget (sum of card prices ≤ budget; basic lands free).
3. **Resembles what an EDH player would actually build at that price tier**, judged against EDHREC's tier-specific average decklists.

The third goal is the hard one. It's not "build any 100-card legal deck under budget" — it's "build a deck that matches the EDHREC consensus for that commander at that price point."

This document explains what we have, what we've tried, where we're stuck, and asks for your help diagnosing whether the problem is solvable as designed or needs an architectural rethink.

You have full access to Magic: The Gathering knowledge, EDHREC data semantics, optimization theory, and combinatorial-search algorithms. Treat this as an open consulting question — feel free to recommend things we haven't considered.

---

## The data we have access to

All in a SQLite database, populated from EDHREC's bulk data + Scryfall:

- **`magic_edh_commanders`** — every legal commander, with `scryfall_id`, `name`, `slug`, `color_identity` (JSON of WUBRG letters), `deck_count` (how many decks on EDHREC use this commander, 1k–50k+ range).

- **`magic_edh_recommendations`** — for every (commander, card) pair where the card appears in commander's recommended-cards list. Columns:
  - `commander_id`, `card_name`, `category` (e.g. "topcards", "creatures", "removal"),
  - `synergy` — EDHREC's synergy score, signed, typically [-1, +5]. **Important: this is a *deviation* metric.** It's `inclusion_for_this_commander − baseline_inclusion_across_all_decks`. Format staples like Sol Ring or Swords to Plowshares score *negative* synergy because they're played everywhere — they're not "synergistic with" any specific commander, just universally good.
  - `inclusion` — raw count of EDH decks containing this card for this commander. So `inclusion / commander.deck_count` gives the percentage of decks that include the card.

- **`magic_edh_average_decks_by_tier`** — for each (commander, tier) pair, the **prototypical "average deck"** for that price band. Tiers are `budget` ($150-300 avg), `upgraded` (~$1000), `optimized` (~$2-3k), `cedh` ($5k+). Each row is a card in that average deck with `category` (lands, basics, creatures, etc.) and `quantity`.

- **`magic_edh_card_prices`** — TCGPlayer-mid prices, ~$0.10 floor (basics free).

- **`magic_cards`** — Scryfall card data: `type_line`, `mana_cost`, `colors`, `produced_mana`, `is_default` (preferred printing flag), Scryfall fallback price.

- **`magic_card_roles`** — community-tagged roles per card: `ramp`, `card_draw`, `removal`, `win_condition`, `boardwipe`, `tutor`. A card can have multiple roles. Lands are not role-tagged.

- **`magic_game_changers`** — the WotC "Game Changers" list (cards like Sol Ring, Cyclonic Rift, Mana Crypt) used for bracket-1/2 deck enforcement. Optionally excluded from low-budget builds.

- **`magic_edh_combos`** — known infinite-combo lines per commander.

We have ~110k cards, ~50k commanders' worth of rec data, ~5M total rec rows. Real production-scale.

---

## How a typical EDH player thinks about budget building

Some baseline assumptions (please correct if wrong):

- **A standard EDH deck has 36 lands**, ±2-4. Most are basics or cheap nonbasics; ~5-15 are "good" duals/utility lands depending on color count.
- **The remaining ~63 cards** are spells: ~10 ramp, ~9 card draw, ~9 removal, ~7 win-cons, plus theme/synergy and filler.
- **Budget builds** swap expensive staples ($10+ duals, $30 mana rocks) for cheap functional alternatives. E.g., Cultivate ($0.40) instead of Mana Vault ($60), Plains+Forest instead of Savannah.
- **A $25 deck for a 4-color commander** is genuinely tight. EDHREC's "budget" tier average for Atraxa (4-color) is $174. $25 is ~14% of that. Real players at $25 typically (a) don't build 4-color decks, (b) accept severely compromised mana bases, or (c) use proxies.

This last point matters: **we suspect the algorithm we built can't satisfy our quality bar at $25 for 4-color commanders because no $25 4-color deck can meet that bar in real life.** We want your read on whether that's right.

---

## The current algorithm

We compose three steps. Sketches in pseudocode.

### Step 1: `buildMinimalShell` (baseline construction)

```
Phase 1: fill role floors
  For each role in [ramp(min 10), card_draw(min 8), removal(min 8), wincon(min 7)]:
    Pull role-tagged recommendations for the commander, ORDER BY price ASC, inclusion DESC.
    Add the cheapest qualifying cards within remaining budget until floor met.

Phase 2: pad nonbasic slots
  Fetch top-200 recommendations by price ASC.
  For each candidate (in sorted order):
    Skip if already in deck, excluded, or game-changer (when excluding).
    Skip if would exceed budget.
    Determine if card is land via type_line.
    If land: add only if nonbasic-land count < tier-derived nonbasic-land cap (~13).
    Else (spell): add only if spell count < SPELLS_TARGET (= 99 - total_lands_target, ~63).
    Continue until both spell-target met AND nonbasic-land cap met.

Phase 3: pad to 100 with basic lands
  Allocate basics across commander's color identity proportional to deck's pip distribution.
```

### Step 2: `upgradeDeck` (marginal-utility hill climbing)

```
candidate_pool = top-50-by-synergy ∪ top-50-by-inclusion (deduped)
context = preload synergy, inclusion, role, combo data for {baseline ∪ candidates}

for iter in 1..50:
  For each candidate × each baseline non-commander card:
    Score 1-for-1 swap: Δ = w_syn·Δsynergy + w_inc·Δinclusion + w_role·ΔroleCoverage + w_combo·ΔcomboValue
    Score 2-for-1 swap (same-role pairs): same Δ, removes 2 cards & adds 1 + a basic
    Score 1-for-2 swap (same-role pairs): same Δ, removes 1 card + a basic & adds 2
  Apply best swap if Δ > ε (default 0.01) AND cost_change ≤ remaining_budget.
  Otherwise terminate.

Constraints:
- Land floor: 1-for-2 can't drop basic count below `total_lands_target − nonbasic_land_cap`.
- Land/spell match: 1-for-1 only allowed when out and in are both lands or both spells (preserves total land count while permitting variety upgrades).
```

### Step 3: `karstenValidateMana` (advisory only)

Counts colored mana sources vs colored pip requirements; warns when sources < 13 (Karsten's threshold). Does not modify the deck.

### Δquality formula details

```
Δquality(out_cards, in_cards) =
    (w_commander_synergy + w_deck_synergy) · Δlog(synergy)         // theme expression
  + w_inclusion                            · Δlog(inclusion_pct)   // format staples
  + w_role_coverage                        · ΔroleCoverage         // structural balance
  + w_combo_value                          · ΔcomboValue           // combo presence

defaults: w_synergy = 1, w_inclusion = 1, w_role_coverage = 2, w_combo_value = 3.

ε = 0.01 (any meaningfully-positive Δ fires a swap; 0.01 floor for floating-point noise).
```

Where:
- `signedLog(x) = sign(x) · log(1+|x|)`, clamped to ±5.
- `roleCoverage` is sigmoid-keyed to community benchmarks per role: count below `lower` scores ~0; midpoint scores 0.5; above `upper` plateaus at 1.
- `comboValue` rewards partial completion `(k/n)^0.5` and gives a +5 bonus for full completion.

---

## How we measure success (the benchmark)

We run a 9-build matrix: 5 commanders × 1-2 budget points each.

| Build | Pass criteria |
|---|---|
| For each (commander, budget) | overlap ≥ 65% with EDHREC tier average AND missing-staples ≤ 0 AND lands ∈ tier-derived target_range |

- **Overlap** = `(cards in our deck ∩ cards in tier average) / (cards in tier average)`. Tier average is the `magic_edh_average_decks_by_tier` rows for `(commander, auto-picked tier)`.
- **Missing staples** = cards in `magic_edh_recommendations` for this commander with `inclusion ≥ 25% × deck_count` AND `category = 'topcards'` that are NOT in our deck. Atraxa's "Swords to Plowshares" at 55% inclusion is a missing staple.
- **Lands target range** = ±20% of the tier average's land count, min ±2.

Tier auto-pick: `<$300 → budget, <$1000 → upgraded, <$3000 → optimized, else cedh`.

---

## The matrix results

Current state (latest commit):

```
Commander                    | Budget  | Overlap | Missing | Lands       | Status
Atraxa, Praetors' Voice      |    $25  |   59%   |    4    | 40 / 29-43  |  ✗
Atraxa, Praetors' Voice      |   $500  |   83%   |    0    | 35 / 29-43  |  ✓
Edgar Markov                 |    $25  |   66%   |    9    | 39 / 29-43  |  ✗
Edgar Markov                 |   $500  |   76%   |    0    | 34 / 28-42  |  ✓
Krenko, Mob Boss             |   $100  |   75%   |    0    | 38 / 28-42  |  ✓
Krenko, Mob Boss             |   $500  |   78%   |    0    | 38 / 28-42  |  ✓
Lathril, Blade of the Elves  |    $25  |   71%   |    5    | 38 / 28-42  |  ✗
Lathril, Blade of the Elves  |   $500  |   68%   |    0    | 33 / 26-40  |  ✓
Kinnan, Bonder Prodigy       |  $1000  |   66%   |    0    | 29 / 24-36  |  ✓
```

**6/9 passing.** The three failures are all at $25 budget. The pattern is: **at extreme low budgets, the algorithm can't include $1+ format staples without overshooting on lands** (because there's no budget left to substitute cheap fillers for those staples).

For Atraxa $25 specifically:
- Missing 4 staples: Swords to Plowshares ($1.30, 55% inclusion), Path to Exile ($1.01, 35%), Bloated Contaminator ($3.20, 35%), Venerated Rotpriest ($1.74, 34%).
- Diagnostic confirms Phase 1+2 consume **$24.34 of the $25 budget on cheapest cards**, leaving $0.66. The upgrade loop's best 1-for-1 swap to add SoP would be `cost_change = $1.30 - cheap_baseline_card.price ≈ $1.10`, which exceeds remaining budget.

Edgar Markov $25 (3-color tribal) and Lathril $25 (2-color) have the same pattern at smaller scale.

---

## What we tried

In rough order:

1. **Inclusion-per-dollar ordering** in Phase 1 + Phase 2 (`ORDER BY inclusion / (price + 0.10) DESC`). This puts high-inclusion-cheap cards first. Result: Atraxa $25 went from 4 missing → 2 missing staples, BUT lands jumped to 50+ (out of range). The expensive staples filled budget, leaving no room for cheap fillers, so Phase 3 padded with basics → land overshoot.

2. **Two-pass Phase 2** (high-inclusion staples first, then cheap fill). Same problem as #1.

3. **Top-K + budget-cap variant** (top-K=8/15/20 staples, capped at 30%/50% of budget). Got SoP into the baseline at K=20, BUT the upgrade loop swapped it out for "Chromatic Lantern" with Δ=+0.05 — a marginal swap that scored barely above ε but eliminated our deliberate staple insertion.

4. **Sticky-card pinning** (forbid the upgrade loop from swapping out Pass A's deliberate staples). Made things worse because legitimate improvements that involve those slots were blocked.

5. **Separate `fetchTopStaplesByInclusion` query** (no price filter, 200-row limit by inclusion DESC). Surfaced the staples at all budget levels but didn't solve the budget arithmetic.

We reverted all five and shipped only the land-floor fix from Task #53. The three $25 builds remain failing.

---

## Our diagnosis

We *think* the issue is **objective-function mismatch**:

- The algorithm optimizes Δquality, a *proxy* for deck quality.
- We measure success by tier-overlap, missing staples, lands in range — a *benchmark* rooted in EDHREC consensus.
- At budgets near the tier average, both align (greedy hill-climbing on Δquality happens to produce decks that match the tier average).
- At extreme low budgets, they diverge: the proxy says "swap a $1.30 SoP for a $0.20 Bring the Ending — Δ improves marginally" while the benchmark says "you just lost a critical staple."

The algorithm is **converging fine** — it terminates, produces valid decks, metrics improve monotonically with budget. It's just converging on something other than what we measure.

---

## Questions for you

We want your honest assessment, not validation of our diagnosis. Push back if we're wrong.

### 1. Is the diagnosis right?

Is "objective vs benchmark mismatch" really the issue, or are we missing something? E.g., maybe the Δquality formula's weights are wrong; maybe the candidate pool size is too small; maybe basics are getting double-counted somewhere. Look at the math and tell us if we're wrong.

### 2. Should we directly optimize for tier-overlap?

We considered this and rejected it earlier (called "Approach C" — overlap-as-loss-function), reasoning that the role/combo/synergy signals are useful at higher budgets. But the failing builds are exactly where those signals lead us astray.

Specific question: would an algorithm that explicitly optimizes "fraction of tier-average cards present in our build" perform better at $25? What's the right weighting between that and budget compliance? Would it regress the $500/$1000 builds?

### 3. Is greedy hill-climbing the right algorithmic family?

We use a 1-iteration-per-best-swap hill climber with ε plateau termination. At extreme constraints, alternatives like **integer programming** (formulate as 0/1 knapsack with side constraints), **simulated annealing** (accept some bad swaps to escape local optima), or **MCTS** seem worth considering.

For this specific problem (~5000 candidate cards × 100 deck slots × hard constraints on color identity, lands, role floors, budget), what algorithmic family is theoretically right? Does it matter in practice given our scale?

### 4. How does a real EDH player budget-build?

You presumably have access to the actual practice. When a real player tries to build a $25 Atraxa deck, what's their mental algorithm?

- Do they start from EDHREC's budget-tier average and trim what they can't afford?
- Do they pick their must-have staples first, then pad?
- Do they accept that 4-color is wrong at $25 and use mono-color basics + jank?

If the human algorithm has structure we're missing, that's actionable.

### 5. What's the optimal $25 Atraxa deck?

Concrete: assume budget = $25, commander = Atraxa Praetors' Voice, must hit at least 33 lands and singleton legality, and you want maximum overlap with EDHREC's "budget"-tier average for Atraxa (which has 84 cards averaging $2.07 each in EDHREC's data).

What does the optimal answer look like? List the 99 cards. We want to compare against what our algorithm produces and learn from the gap.

If "no good $25 4-color deck exists" is a valid answer, say so and explain why.

### 6. The escape hatch: tier-promotion at extreme low budgets

Half-formed idea: if a user requests a budget < N% of tier-average price for the auto-picked tier, **promote them to a smaller tier** (or warn loudly).

E.g., $25 Atraxa is 14% of "budget"-tier average. We could refuse to use the budget-tier comparison and instead optimize for "what's the cheapest viable Atraxa deck" — potentially producing a 3-color or even mono-color compromise.

Is this right product-wise? Mathematically, we'd be acknowledging "the user is requesting something incoherent; here's the closest coherent thing." Architecturally, it changes our objective per build.

### 7. A holistic redesign

If you started fresh, knowing:
- The data we have (EDHREC tier averages + recommendations + prices)
- The goal (produce a deck representative of what EDH players actually run at this price)
- The constraint that we want fast (sub-second) per-call execution
- The hard requirement of legality + budget compliance

What architecture would you build? Greedy + Δquality is what we landed on; you might propose:
- Pure tier-average lookup with budget-aware substitution (no Δquality at all)
- ILP with constraints
- Two-stage: tier-anchor + theme overlay
- Something else entirely

We're open to a rewrite if your answer is "the framework is wrong." Be honest. We've sunk weeks into this; we'd rather sink more weeks into the right answer than ship the wrong one.

---

## What we want back from you

Please structure your response with:

1. **Diagnostic verdict**: is our diagnosis right? Is this the algorithm being wrong, mis-targeted, or running into a real constraint of the problem?

2. **Concrete recommendation**: either (a) a specific change to the current algorithm with expected impact OR (b) a sketch of a different architecture you'd build instead.

3. **The optimal $25 Atraxa deck**: a worked example. List the cards. Walk through your reasoning. If the answer is "no good answer exists," explain why.

4. **Honest call on shipability**: do we accept the 6/9 passing as a real limitation of the format and ship, or is there enough algorithmic upside to justify a rewrite?

5. **Anything we didn't ask but should have**: blind spots, lurking assumptions, missing data sources. Step back from our framing if you think we're stuck on it.

We have time. Take this seriously and go deep. The decision to either ship 6/9 or do a structural rewrite hinges on your answer.
