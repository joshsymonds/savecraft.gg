"""Validate the derived tiers against wrigh516's 1.0 published rankings.

Parses the emitted reference/data/altrank_gen.go and compares each recipe's
tier to wrigh516's 1.0 tables (r/SatisfactoryGame, transcribed below). Reports
exact-match and within-1-tier agreement and lists the larger deviations. The
lists are 1.0; the derivation is 1.2, so some drift is expected and explained.

Run:  python3 compare_1_0.py [path-to-altrank_gen.go]
"""

import os
import re
import sys

# wrigh516's 1.0 tiers, by recipe display name (without the "Alternate:" prefix).
EFFORT_1_0 = {
    "S": ["Heavy Encased Frame", "Copper Alloy Ingot", "Pure Aluminum Ingot", "Oil-Based Diamonds",
          "Dark Matter Trap", "Heavy Flexible Frame", "Sloppy Alumina", "Insulated Crystal Oscillator",
          "Silicon Circuit Board", "Crystal Computer", "Heat-Fused Frame", "Uranium Fuel Unit",
          "Caterium Circuit Board"],
    "A": ["Super-State Computer", "Turbo Diamonds", "Caterium Computer", "Electrode Aluminum Scrap",
          "Diluted Fuel", "Turbo Pressure Motor", "Rubber Concrete", "Plastic AI Limiter", "Steel Screw",
          "Rigor Motor", "Steel Rod", "Fine Concrete", "Steeled Frame", "Aluminum Beam", "Aluminum Rod",
          "Turbo Electric Motor", "Electric Motor", "Wet Concrete", "Automated Speed Wiring",
          "Coke Steel Ingot", "Infused Uranium Cell"],
    "B": ["Silicon High-Speed Connector", "Radio Control System", "Solid Steel Ingot", "Heat Exchanger",
          "Recycled Plastic", "Coated Iron Plate", "Adhered Iron Plate", "Stitched Iron Plate",
          "Insulated Cable", "Coated Cable", "Fused Wire", "Plastic Smart Plating", "Copper Rotor",
          "Steel Cast Plate", "Nitro Rocket Fuel", "Steamed Copper Sheet", "OC Supercomputer",
          "Steel Rotor", "Tempered Caterium Ingot", "Cooling Device", "Pure Quartz Crystal",
          "Electromagnetic Connection Rod", "Quickwire Cable", "Caterium Wire", "Quickwire Stator",
          "Bolted Frame", "Bolted Iron Plate", "Fine Black Powder", "Heavy Oil Residue",
          "Flexible Framework", "Turbo Heavy Fuel", "Cast Screw", "Iron Alloy Ingot", "Polymer Resin"],
    "C": ["Pure Iron Ingot", "Leached Iron Ingot", "Iron Wire", "Coated Iron Canister", "Classic Battery",
          "Steel Canister", "Fused Quickwire", "Cheap Silica", "Molded Beam", "Alclad Casing",
          "Basic Iron Ingot", "Distilled Silica", "Fused Quartz Crystal", "Molded Steel Pipe",
          "Leached Caterium Ingot", "Turbo Blend Fuel", "Electrode Circuit Board", "Pure Caterium Ingot",
          "Encased Industrial Pipe", "Recycled Rubber"],
    "D": ["Compacted Steel Ingot", "Quartz Purification", "Plutonium Fuel Unit", "Pink Diamonds",
          "Instant Plutonium Cell", "Iron Pipe"],
    "F": ["Instant Scrap", "Pure Copper Ingot", "Fertile Uranium", "Radio Connection Unit",
          "Cloudy Diamonds", "Dark-Ion Fuel", "Dark Matter Crystallization", "Petroleum Diamonds",
          "Leached Copper Ingot", "Tempered Copper Ingot"],
}
RESOURCES_1_0 = {
    "S": ["Pure Copper Ingot", "Copper Alloy Ingot", "Dark Matter Trap", "Pure Aluminum Ingot",
          "Turbo Diamonds", "Diluted Fuel", "Tempered Copper Ingot", "Infused Uranium Cell",
          "Uranium Fuel Unit", "Electrode Aluminum Scrap"],
    "A": ["Recycled Rubber", "Recycled Plastic", "Oil-Based Diamonds", "Fused Quickwire",
          "Heavy Oil Residue", "Heavy Encased Frame", "Wet Concrete", "Rubber Concrete", "Heat-Fused Frame",
          "Fine Concrete", "Pure Quartz Crystal", "Pure Iron Ingot", "Heavy Flexible Frame",
          "Turbo Electric Motor", "Pure Caterium Ingot", "Insulated Crystal Oscillator",
          "Silicon Circuit Board", "Petroleum Diamonds", "Tempered Caterium Ingot", "Turbo Pressure Motor",
          "Caterium Circuit Board", "Encased Industrial Pipe", "Super-State Computer", "Turbo Blend Fuel",
          "Classic Battery", "Cooling Device"],
    "B": ["Quartz Purification", "Caterium Computer", "Plastic AI Limiter", "Steamed Copper Sheet",
          "Iron Wire", "Alclad Casing", "Iron Pipe", "Leached Caterium Ingot", "Coated Iron Plate",
          "Coated Iron Canister", "Fused Quartz Crystal", "Crystal Computer", "Iron Alloy Ingot",
          "Heat Exchanger", "Solid Steel Ingot", "Flexible Framework", "Stitched Iron Plate",
          "Fine Black Powder", "Distilled Silica", "Adhered Iron Plate", "Copper Rotor", "Electric Motor",
          "Coke Steel Ingot", "Steel Cast Plate", "Steel Rod", "Cheap Silica", "Plastic Smart Plating",
          "Silicon High-Speed Connector", "Aluminum Rod", "Polymer Resin", "Compacted Steel Ingot"],
    "C": ["Rigor Motor", "Steel Screw", "Fused Wire", "Bolted Frame", "Aluminum Beam", "Cast Screw",
          "Bolted Iron Plate", "Sloppy Alumina", "Molded Beam", "Radio Control System", "Steel Rotor",
          "Steeled Frame", "Pink Diamonds", "Leached Iron Ingot", "Quickwire Cable", "Insulated Cable",
          "Steel Canister", "Basic Iron Ingot", "Automated Speed Wiring", "Coated Cable",
          "Molded Steel Pipe", "Electromagnetic Connection Rod"],
    "D": ["Quickwire Stator", "Nitro Rocket Fuel", "Caterium Wire", "Instant Plutonium Cell",
          "Plutonium Fuel Unit", "Turbo Heavy Fuel", "Electrode Circuit Board", "OC Supercomputer"],
    "F": ["Radio Connection Unit", "Fertile Uranium", "Cloudy Diamonds", "Instant Scrap",
          "Leached Copper Ingot", "Dark-Ion Fuel", "Dark Matter Crystallization"],
}
ORDER = {t: i for i, t in enumerate(["S", "A", "B", "C", "D", "F"])}

# Display-name drift between 1.0 and 1.2.
ALIAS = {"steel screws": "steel screw", "cast screws": "cast screw"}


def norm(name):
    n = name.replace("Alternate:", "").strip().lower()
    return ALIAS.get(n, n)


def invert(table):
    return {norm(name): tier for tier, names in table.items() for name in names}


def parse_emitted(path):
    """name -> (effortTier, resourcesTier) from altrank_gen.go."""
    text = open(path).read()
    out = {}
    row = re.compile(r'Name: "([^"]+)".*?Effort: AltRankScore\{Tier: "([^"]+)".*?'
                     r'Resources: AltRankScore\{Tier: "([^"]+)"')
    for name, eff, rez in row.findall(text):
        out[norm(name)] = (eff, rez)
    return out


def report(label, mine_idx, theirs):
    matched = [(n, mine[mine_idx], theirs[n]) for n, mine in PARSED.items() if n in theirs]
    exact = sum(1 for _, a, b in matched if a == b)
    within1 = sum(1 for _, a, b in matched if abs(ORDER[a] - ORDER[b]) <= 1)
    print(f"\n[{label}] compared {len(matched)} recipes present in both")
    print(f"  exact tier match: {exact}/{len(matched)} ({100*exact//len(matched)}%)")
    print(f"  within +/-1 tier: {within1}/{len(matched)} ({100*within1//len(matched)}%)")
    devs = sorted((abs(ORDER[a] - ORDER[b]), n, b, a) for n, a, b in matched if abs(ORDER[a] - ORDER[b]) >= 2)
    print(f"  deviations >=2 tiers: {len(devs)}")
    for d, n, theirs_t, mine_t in sorted(devs, reverse=True):
        print(f"    {n}: 1.0={theirs_t} -> ours={mine_t} ({d} tiers)")


if __name__ == "__main__":
    HERE = os.path.dirname(os.path.abspath(__file__))
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "../../reference/data/altrank_gen.go")
    PARSED = parse_emitted(path)
    print(f"parsed {len(PARSED)} ranked recipes from {os.path.relpath(path)}")
    report("effort", 0, invert(EFFORT_1_0))
    report("resources", 1, invert(RESOURCES_1_0))
