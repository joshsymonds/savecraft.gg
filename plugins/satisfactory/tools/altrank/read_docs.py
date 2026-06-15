"""Parse the game-shipped CommunityResources/Docs/en-US.json into the compact
data.json the LP model consumes.

Clean-room reimplementation (the methodology reference at
github.com/Scott1903/satisfactory_planner ships no license). Reads the same
game asset the Go datagen uses, so recipe/item facts stay consistent.

Output schema (data.json):
  items:      {class: {name, form, energyMJ, points, raw}}
  recipes:    {class: {name, time, ingredients:[{item,amount}], products:[...],
                       machine, powerMW, alternate}}
  generators: {key:   {name, fuel, supplemental, powerMW, byproduct}}
Fluid/gas amounts are normalized to whole units (Docs stores 1000 = 1 m^3).
"""

import json
import re
import sys

# Descriptor families that can appear as recipe ingredients/products or as
# generator fuel. A subset of the Go datagen's itemNatives — the equipment/
# ammo/vehicle families it also lists are never produced by automated recipes,
# so the LP doesn't need them.
ITEM_NATIVES = [
    "FGItemDescriptor", "FGItemDescriptorBiomass", "FGItemDescriptorNuclearFuel",
    "FGItemDescriptorPowerBoosterFuel", "FGConsumableDescriptor",
    "FGPowerShardDescriptor", "FGAmmoTypeProjectile", "FGEquipmentDescriptor",
]
RESOURCE_NATIVE = "FGResourceDescriptor"
MANUFACTURER_NATIVES = ["FGBuildableManufacturer"]
VARIABLE_MANUFACTURER_NATIVES = ["FGBuildableManufacturerVariablePower"]
GENERATOR_NATIVES = ["FGBuildableGeneratorFuel", "FGBuildableGeneratorNuclear"]

# (ItemClass="...'/Game/.../Desc_Foo.Desc_Foo_C'",Amount=6)
_AMOUNT_RE = re.compile(r"\.([A-Za-z0-9_]+_C)'\",Amount=([0-9]+)")
_BUILD_RE = re.compile(r"\.(Build_[A-Za-z0-9_]+_C)[\"']")


def short(native_class):
    return native_class.split(".")[-1].rstrip("'")


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def parse_amounts(raw, fluids):
    """Extract [{item, amount}] from a stringified UE ItemAmount array,
    normalizing fluid/gas amounts (1000 -> 1)."""
    out = []
    for cls, amt in _AMOUNT_RE.findall(raw or ""):
        amount = int(amt)
        if cls in fluids:
            amount = amount / 1000.0
        out.append({"item": cls, "amount": amount})
    return out


def load(docs_path):
    data = json.load(open(docs_path, encoding="utf-16"))
    by_native = {}
    for entry in data:
        by_native.setdefault(short(entry["NativeClass"]), []).extend(entry["Classes"])

    items, resources, fluids = {}, {}, set()

    def add_items(natives, raw=False):
        for native in natives:
            for c in by_native.get(native, []):
                form = c.get("mForm", "RF_SOLID")
                if form in ("RF_LIQUID", "RF_GAS"):
                    fluids.add(c["ClassName"])
                energy = to_float(c.get("mEnergyValue"))
                if form in ("RF_LIQUID", "RF_GAS"):
                    energy *= 1000.0  # MJ per m^3 -> MJ per stored unit
                items[c["ClassName"]] = {
                    "name": c["mDisplayName"],
                    "form": form,
                    "energyMJ": energy,
                    "points": int(to_float(c.get("mResourceSinkPoints", 0))),
                    "raw": raw,
                }

    add_items([RESOURCE_NATIVE], raw=True)
    for c in by_native.get(RESOURCE_NATIVE, []):
        resources[c["ClassName"]] = {"name": c["mDisplayName"]}
    add_items(ITEM_NATIVES)

    # Machines: power per recipe comes from the machine it is produced in.
    machines = {}
    for native in MANUFACTURER_NATIVES:
        for c in by_native.get(native, []):
            machines[c["ClassName"]] = to_float(c.get("mPowerConsumption"))
    for native in VARIABLE_MANUFACTURER_NATIVES:
        for c in by_native.get(native, []):
            lo = to_float(c.get("mEstimatedMininumPowerConsumption"))
            hi = to_float(c.get("mEstimatedMaximumPowerConsumption"))
            machines[c["ClassName"]] = (lo + hi) / 2 if hi else lo

    recipes = {}
    for c in by_native.get("FGRecipe", []):
        machine = None
        for m in _BUILD_RE.findall(c.get("mProducedIn", "")):
            if m in machines:
                machine = m
                break
        if machine is None:
            continue  # hand-craft / build-gun only — not an automated recipe
        products = parse_amounts(c.get("mProduct", ""), fluids)
        ingredients = parse_amounts(c.get("mIngredients", ""), fluids)
        if not products:
            continue
        recipes[c["ClassName"]] = {
            "name": c["mDisplayName"],
            "time": to_float(c.get("mManufactoringDuration")) or 1.0,
            "ingredients": ingredients,
            "products": products,
            "machine": machine,
            "powerMW": machines[machine],
            "alternate": c["ClassName"].startswith("Recipe_Alternate_"),
        }

    # Generators become power-producing recipes: burn 1 fuel item over its
    # energy-determined time, optionally consuming a supplemental fluid.
    generators = {}
    for native in GENERATOR_NATIVES:
        for c in by_native.get(native, []):
            power = to_float(c.get("mPowerProduction"))
            ratio = to_float(c.get("mSupplementalToPowerRatio"))
            fuels = c.get("mFuel") or []
            if isinstance(fuels, str):
                fuels = json.loads(fuels) if fuels.strip().startswith("[") else []
            for f in fuels:
                fuel = f.get("mFuelClass", "")
                if fuel not in items:
                    continue
                generators[c["ClassName"] + "|" + fuel] = {
                    "name": c["mDisplayName"] + " (" + items[fuel]["name"] + ")",
                    "building": c["ClassName"],
                    "fuel": fuel,
                    "supplemental": f.get("mSupplementalResourceClass", "") or "",
                    "supplementalRatio": ratio,
                    "powerMW": power,
                    "byproduct": f.get("mByproduct", "") or "",
                    "byproductAmount": int(to_float(f.get("mByproductAmount", 0))),
                }

    return {
        "items": items,
        "resources": resources,
        "recipes": recipes,
        "generators": generators,
    }


if __name__ == "__main__":
    docs = sys.argv[1] if len(sys.argv) > 1 else "../../../../.reference/satisfactory-docs/en-US.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "data.json"
    d = load(docs)
    json.dump(d, open(out, "w"), indent=1)
    print(f"items={len(d['items'])} resources={len(d['resources'])} "
          f"recipes={len(d['recipes'])} generators={len(d['generators'])} -> {out}")
