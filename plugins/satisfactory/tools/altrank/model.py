"""Production LP for the alternate-recipe ranking, built with Pyomo.

Clean-room implementation of the methodology described by u/wrigh516
("Alternate Recipe Ranking 1.0", r/SatisfactoryGame) and embodied in the
unlicensed reference repo github.com/Scott1903/satisfactory_planner: model the
whole factory as a linear program that produces a fixed output basket at
minimum weighted cost, then score a recipe by how it shifts the optimum.

Modeling choices:
- Power is a flow item (POWER, in MW). Every manufacturing recipe consumes its
  machine's power; generators produce power by burning fuel (+ supplemental
  water). So picking a power-hungry recipe pulls in the generators and the raw
  resources to fuel them automatically — no separate power bookkeeping.
- Raw resources are mined up to per-type caps; the objective weights them by
  the inverse of map availability (wrigh516's "Resources*").
- Buildings* scales machine count by recipe complexity (ingredients+products).
"""

from pyomo.environ import (
    ConcreteModel, Var, Objective, Constraint, NonNegativeReals, minimize, value,
)

POWER = "POWER"


def _rates(data):
    """Per-recipe produced/consumed item rates (per machine, per minute),
    folding generators in as POWER producers. Returns {recipe: (prod, cons)}."""
    items = data["items"]
    rates = {}
    for cls, r in data["recipes"].items():
        prod, cons = {}, {POWER: r["powerMW"]}
        per_min = 60.0 / r["time"]
        for p in r["products"]:
            prod[p["item"]] = prod.get(p["item"], 0) + p["amount"] * per_min
        for ing in r["ingredients"]:
            cons[ing["item"]] = cons.get(ing["item"], 0) + ing["amount"] * per_min
        rates[cls] = (prod, cons)
    for key, g in data["generators"].items():
        energy = items.get(g["fuel"], {}).get("energyMJ", 0)
        if energy <= 0:
            continue  # fuel with no energy value can't drive a generator
        prod, cons = {POWER: g["powerMW"]}, {}
        fuel_per_min = g["powerMW"] * 60.0 / energy
        cons[g["fuel"]] = fuel_per_min
        if g["supplemental"]:
            # m^3/min = MW * ratio * 60 / 1000 (verified: coal 75MW*10 -> 45)
            cons[g["supplemental"]] = g["powerMW"] * g["supplementalRatio"] * 60.0 / 1000.0
        if g["byproduct"]:
            prod[g["byproduct"]] = prod.get(g["byproduct"], 0) + g["byproductAmount"] * fuel_per_min
        rates[key] = (prod, cons)
    return rates


def resource_weights(limits):
    """Inverse-availability weights; the average cap is the numerator so
    weights hover around 1 (wrigh516 sets water effectively free)."""
    caps = {k: v for k, v in limits.items() if v > 0}
    avg = sum(caps.values()) / len(caps)
    return {res: avg / cap for res, cap in caps.items()}


def complexity(recipe):
    """Buildings* weight basis: (#ingredients + #products - 1) ^ 1.584963 / 3,
    so 1 Manufacturer (4-in/1-out) ~= 3 Assemblers ~= 9 Constructors."""
    n = len(recipe["ingredients"]) + len(recipe["products"]) - 1
    return max(n, 1) ** 1.584963 / 3.0


def build_model(data, basket, limits, weights, recipes_off=()):
    """basket: {item_class: items_per_min}. limits: {resource: cap_per_min}.
    weights: {power, items, buildings, buildings_scaled, resources}."""
    rates = _rates(data)
    off = set(recipes_off)
    recipe_ids = [r for r in rates if r not in off]
    resources = set(limits)
    wres = resource_weights(limits)

    # Every item that appears anywhere, plus POWER.
    all_items = {POWER}
    for prod, cons in rates.values():
        all_items.update(prod)
        all_items.update(cons)

    m = ConcreteModel()
    m.r = Var(recipe_ids, within=NonNegativeReals)
    m.mined = Var(resources, within=NonNegativeReals)

    def net(item):
        return sum(
            (rates[j][0].get(item, 0) - rates[j][1].get(item, 0)) * m.r[j]
            for j in recipe_ids
        )

    m.balance = Constraint(all_items, rule=lambda m, it: _balance(m, it, net, basket, resources))
    m.caps = Constraint(resources, rule=lambda m, res: m.mined[res] <= limits[res])

    # Objective metrics.
    machine_recipes = [j for j in recipe_ids if j in data["recipes"]]
    m.cost = Objective(
        expr=(
            weights.get("resources", 0) * sum(wres[res] * m.mined[res] for res in resources)
            + weights.get("power", 0) * sum(data["recipes"][j]["powerMW"] * m.r[j] for j in machine_recipes)
            + weights.get("buildings", 0) * sum(m.r[j] for j in machine_recipes)
            + weights.get("buildings_scaled", 0)
            * sum(complexity(data["recipes"][j]) * m.r[j] for j in machine_recipes)
        ),
        sense=minimize,
    )
    m._meta = {"rates": rates, "recipe_ids": recipe_ids, "resources": resources,
               "wres": wres, "machine_recipes": machine_recipes}
    return m


def _balance(m, item, net, basket, resources):
    expr = net(item)
    if item in resources:
        expr = expr + m.mined[item]
    need = basket.get(item, 0)
    return expr >= need


def metrics(m, data):
    """Read the solved objective components for scoring/inspection."""
    meta = m._meta
    mined = {res: value(m.mined[res]) for res in meta["resources"]}
    mined = {k: v for k, v in mined.items() if v and v > 1e-6}
    machines = sum(value(m.r[j]) for j in meta["machine_recipes"])
    power = sum(data["recipes"][j]["powerMW"] * value(m.r[j]) for j in meta["machine_recipes"])
    buildings_scaled = sum(
        complexity(data["recipes"][j]) * value(m.r[j]) for j in meta["machine_recipes"]
    )
    resources_scaled = sum(meta["wres"][res] * v for res, v in mined.items())
    used = {data["recipes"][j]["name"]: round(value(m.r[j]), 2)
            for j in meta["machine_recipes"] if value(m.r[j]) > 1e-6}
    return {
        "powerMW": round(power, 1),
        "machines": round(machines, 1),
        "buildingsScaled": round(buildings_scaled, 1),
        "resources": {data["resources"].get(k, {"name": k})["name"]: round(v, 1)
                      for k, v in sorted(mined.items(), key=lambda kv: -kv[1])},
        "resourcesScaled": round(resources_scaled, 1),
        "recipesUsed": len(used),
    }
