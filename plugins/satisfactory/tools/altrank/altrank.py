"""altrank — re-derive Satisfactory alternate-recipe tiers for the current game
version by linear optimization, following u/wrigh516's published methodology
(r/SatisfactoryGame, "Alternate Recipe Ranking 1.0").

Pipeline: read_docs.py parses the shipped Docs.json -> data.json; this driver
builds the production LP (model.py) and, per ranking weighting, scores each
alternate recipe by how forcing it (as the sole producer of its item) shifts
the optimum versus the standard recipe. Offline only (nix-shell glpk + pyomo);
emits a committed Go table the hard_drive_tiers module serves.

Run:
  nix-shell -p python3 glpk --run '.venv/bin/python altrank.py --baseline'
  nix-shell -p python3 glpk --run '.venv/bin/python altrank.py --rank \
      --emit ../../reference/data/altrank_gen.go'
"""

import argparse
import json
import os

from pyomo.environ import SolverFactory, TerminationCondition

import model as M

HERE = os.path.dirname(os.path.abspath(__file__))

# Map node availability (units/min). wrigh516's published constants, carried
# verbatim as the resource-scaling basis; water is set high so it barely weighs.
RESOURCE_LIMITS = {
    "Desc_OreIron_C": 92100.0, "Desc_OreCopper_C": 36900.0, "Desc_Stone_C": 69900.0,
    "Desc_Coal_C": 42300.0, "Desc_OreGold_C": 15000.0, "Desc_LiquidOil_C": 12600.0,
    "Desc_RawQuartz_C": 13500.0, "Desc_Sulfur_C": 10800.0, "Desc_OreBauxite_C": 12300.0,
    "Desc_OreUranium_C": 2100.0, "Desc_NitrogenGas_C": 12000.0, "Desc_SAM_C": 10200.0,
    "Desc_Water_C": 100000.0,
}

# Two published weightings. "resources" minimizes scaled raw use only (power is
# captured indirectly via the generators that fuel it). "effort" also weights
# machine count (scaled) heavily to favor simpler builds.
WEIGHTINGS = {
    "resources": {"resources": 1.0},
    "effort": {"resources": 1.0, "buildings_scaled": 30.0},
}

# Output basket: the final Project Assembly parts, plus the cheap staples
# wrigh516 adds so early-item alternates (screws, cable, rods, canisters) and
# the ammo/nuclear chains get exercised and thus scored. Specified by display
# name; resolved to classes against the loaded data.
BASKET_PARTS = {f"Desc_SpaceElevatorPart_{i}_C": 1.0 for i in range(1, 13)}
BASKET_EXTRAS_BY_NAME = {
    "Screws": 100.0, "Cable": 50.0, "Iron Rod": 50.0, "Empty Canister": 20.0,
    "Power Shard": 2.0, "Packaged Ionized Fuel": 20.0, "Nuke Nobelisk": 2.0,
}

# Tier bands on overall improvement (percent, higher = better; ~0 = neutral).
# wrigh516's exact 0-100 score formula is unpublished; we score by the weighted
# percent improvement of the optimum vs the standard recipe and bucket with
# these documented thresholds (tuned so tiers are non-degenerate and track his
# ordering). Applied per weighting.
TIER_BANDS = [("S", 3.0), ("A", 1.0), ("B", 0.2), ("C", -0.2), ("D", -2.0), ("F", float("-inf"))]

METRIC_KEYS = ["power", "items", "buildings", "resources", "buildingsScaled", "resourcesScaled"]


class Infeasible(Exception):
    pass


def solve_metrics(data, basket, weights, force=None):
    m = M.build_model(data, basket, RESOURCE_LIMITS, weights, force=force)
    res = SolverFactory("glpk").solve(m)  # glpsol via LP/MPS interface
    if res.solver.termination_condition != TerminationCondition.optimal:
        raise Infeasible(str(res.solver.termination_condition))
    return M.metrics(m, data)


def resolve_basket(data):
    by_name = {}
    for cls, it in data["items"].items():
        by_name.setdefault(it["name"], cls)
    basket = dict(BASKET_PARTS)
    for name, rate in BASKET_EXTRAS_BY_NAME.items():
        cls = by_name.get(name)
        if cls:
            basket[cls] = rate
    return basket


def producers(data):
    out = {}
    for cls, r in data["recipes"].items():
        for p in r["products"]:
            out.setdefault(p["item"], []).append(cls)
    return out


def standard_recipe(data, item, recs):
    """The item's canonical recipe: a non-alternate whose FIRST product is the
    item (excluding unpackaging). Deterministic; None if there isn't one."""
    cands = sorted(
        j for j in recs
        if not data["recipes"][j]["alternate"]
        and data["recipes"][j]["products"][0]["item"] == item
        and not j.startswith("Recipe_Unpackage")
    )
    return cands[0] if cands else None


def pct_delta(base, cand):
    return {k: (round((cand[k] - base[k]) / base[k] * 100, 2) if base[k] > 1e-9 else 0.0)
            for k in METRIC_KEYS}


def improvement(ranking, d):
    """Overall percent improvement (higher = better) for a weighting, from the
    per-metric deltas. resources: scaled resources only. effort: equal-weighted
    average of items, buildings* and resources* (wrigh516 picks weights so the
    three carry equal impact)."""
    if ranking == "resources":
        return -d["resourcesScaled"]
    return -(d["items"] + d["buildingsScaled"] + d["resourcesScaled"]) / 3.0


def mean_metrics(rows):
    return {k: sum(r[k] for r in rows) / len(rows) for k in METRIC_KEYS}


def tier_for(improve):
    for name, lo in TIER_BANDS:
        if improve >= lo:
            return name
    return "F"


def rank(data):
    basket = resolve_basket(data)
    prod = producers(data)
    # recipe class -> ranking -> {improvement, tier, deltas}
    results = {}
    skipped = []
    for ranking, weights in WEIGHTINGS.items():
        for item, recs in sorted(prod.items()):
            alts = sorted(j for j in recs if data["recipes"][j]["alternate"])
            if not alts:
                continue
            std = standard_recipe(data, item, recs)
            to_solve = sorted(set(recs if std is None else [std]) | set(alts))
            metr = {}
            for j in to_solve:
                try:
                    metr[j] = solve_metrics(data, basket, weights, force=(item, j))
                except Infeasible:
                    skipped.append((ranking, j))
            base = metr.get(std) if std else (mean_metrics(list(metr.values())) if metr else None)
            if not base:
                continue
            for alt in alts:
                if alt not in metr:
                    continue
                d = pct_delta(base, metr[alt])
                imp = round(improvement(ranking, d), 2)
                results.setdefault(alt, {})[ranking] = {"improvement": imp, "tier": tier_for(imp), "deltas": d}
    return results, skipped


# ---- Go emission -----------------------------------------------------------

GO_HEADER = (
    "// Code generated by plugins/satisfactory/tools/altrank. DO NOT EDIT.\n"
    "// Source: linear-optimization ranking of alternate recipes against the\n"
    "// shipped Docs.json, following wrigh516's published methodology.\n\n"
    "package data\n\n"
)


def _nz(v):
    """Normalize -0.0 to 0.0 so the generated Go table reads cleanly."""
    return 0.0 if v == 0 else v


def _score_go(s):
    if s is None:
        return 'AltRankScore{Tier: "?"}'
    d = s["deltas"]
    return (
        'AltRankScore{Tier: "%s", ImprovementPct: %s, PowerPct: %s, ItemsPct: %s, '
        'BuildingsPct: %s, ResourcesPct: %s, BuildingsScaledPct: %s, ResourcesScaledPct: %s}'
        % (s["tier"], _nz(s["improvement"]), _nz(d["power"]), _nz(d["items"]), _nz(d["buildings"]),
           _nz(d["resources"]), _nz(d["buildingsScaled"]), _nz(d["resourcesScaled"]))
    )


def emit_go(data, results, path):
    lines = [GO_HEADER, "var AltRankings = map[string]AltRanking{\n"]
    for cls in sorted(results):
        name = data["recipes"][cls]["name"]
        r = results[cls]
        lines.append(
            '\t"%s": {Recipe: "%s", Name: "%s", Effort: %s, Resources: %s},\n'
            % (cls, cls, name, _score_go(r.get("effort")), _score_go(r.get("resources")))
        )
    lines.append("}\n")
    with open(path, "w") as f:
        f.write("".join(lines))
    return len(results)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(HERE, "data.json"))
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--rank", action="store_true")
    ap.add_argument("--emit", help="write the Go table to this path")
    args = ap.parse_args()

    data = json.load(open(args.data))
    print(f"loaded {len(data['recipes'])} recipes "
          f"({sum(1 for r in data['recipes'].values() if r['alternate'])} alternate)")

    if args.baseline:
        basket = resolve_basket(data)
        for name, weights in WEIGHTINGS.items():
            print(f"\n=== baseline [{name}] ===")
            print(json.dumps(solve_metrics(data, basket, weights), indent=1))

    if args.rank or args.emit:
        results, skipped = rank(data)
        dist = {}
        for cls, r in results.items():
            for ranking, s in r.items():
                dist.setdefault(ranking, {}).setdefault(s["tier"], 0)
                dist[ranking][s["tier"]] += 1
        print(f"ranked {len(results)} alternates; infeasible-skipped solves: {len(skipped)}")
        for ranking in WEIGHTINGS:
            bands = dist.get(ranking, {})
            print(f"  {ranking}: " + " ".join(f"{t}={bands.get(t,0)}" for t, _ in TIER_BANDS))
        if args.emit:
            n = emit_go(data, results, args.emit)
            print(f"emitted {n} rankings -> {args.emit}")


if __name__ == "__main__":
    main()
