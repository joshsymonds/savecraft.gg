"""altrank — re-derive Satisfactory alternate-recipe tiers for the current game
version by linear optimization, following u/wrigh516's published methodology
(r/SatisfactoryGame, "Alternate Recipe Ranking 1.0").

Pipeline: read_docs.py parses the shipped Docs.json -> data.json; this driver
builds the production LP (model.py) and, per ranking weighting, scores each
alternate recipe by how forcing it shifts the optimum versus the standard
recipe. Offline only (nix-shell glpk + pyomo); emits a committed Go table.

This file currently implements --baseline (one solve, sanity metrics). The
per-recipe ranking loop and Go emission land in follow-up work.

Run:
  nix-shell -p python3 glpk --run '.venv/bin/python altrank.py --baseline'
"""

import argparse
import json
import os

from pyomo.environ import SolverFactory, TerminationCondition

import model as M

HERE = os.path.dirname(os.path.abspath(__file__))

# Map node availability (units/min at 100% on every pure-or-better node).
# These are wrigh516's published constants; water is set high so it barely
# weighs. Carried verbatim as the methodology's resource scaling basis.
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

# Final Project Assembly parts — the basket the factory must produce. Equal
# rates exercise every endgame chain (a deliberate stress test for --baseline;
# the ranking task refines the basket to wrigh516's ratios).
BASKET = {f"Desc_SpaceElevatorPart_{i}_C": 1.0 for i in range(1, 13)}


def solve(data, basket, weights):
    m = M.build_model(data, basket, RESOURCE_LIMITS, weights)
    solver = SolverFactory("glpk")  # invokes glpsol via the LP/MPS interface
    res = solver.solve(m)
    cond = res.solver.termination_condition
    if cond != TerminationCondition.optimal:
        raise SystemExit(f"solve not optimal: {cond}")
    return M.metrics(m, data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(HERE, "data.json"))
    ap.add_argument("--baseline", action="store_true",
                    help="run one solve per weighting and print metrics")
    args = ap.parse_args()

    data = json.load(open(args.data))
    print(f"loaded {len(data['recipes'])} recipes "
          f"({sum(1 for r in data['recipes'].values() if r['alternate'])} alternate), "
          f"{len(data['generators'])} generator fuels")

    if args.baseline:
        for name, weights in WEIGHTINGS.items():
            print(f"\n=== baseline solve [{name}] basket={len(BASKET)} parts @1/min ===")
            print(json.dumps(solve(data, BASKET, weights), indent=1))


if __name__ == "__main__":
    main()
