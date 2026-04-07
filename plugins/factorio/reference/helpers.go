package main

import (
	"math"
	"strconv"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// Shared helpers used by ratio_calculator and oil_balancer.

// resolveModuleEffects sums speed, productivity, and consumption bonuses
// from a list of module names inserted into machine slots.
func resolveModuleEffects(moduleNames []string) (speedBonus, prodBonus, consumptionBonus float64) {
	for _, name := range moduleNames {
		if mod, ok := data.Modules[name]; ok {
			speedBonus += mod.Effects.Speed
			prodBonus += mod.Effects.Productivity
			consumptionBonus += mod.Effects.Consumption
		}
	}
	return
}

// resolveBeaconEffects computes the total speed bonus from beacons.
// Factorio 2.0 formula: beaconCount * moduleSpeedPerBeacon * distEfficiency / sqrt(beaconCount)
func resolveBeaconEffects(beaconModuleNames []string, beaconCount int) float64 {
	if beaconCount <= 0 || len(beaconModuleNames) == 0 {
		return 0
	}

	// Get beacon parameters (there's typically just one beacon type)
	var distEfficiency float64
	for _, b := range data.Beacons {
		distEfficiency = b.DistributionEffectivity
		break
	}

	// Sum module speed effects in each beacon
	var moduleSpeedPerBeacon float64
	for _, name := range beaconModuleNames {
		if mod, ok := data.Modules[name]; ok {
			moduleSpeedPerBeacon += mod.Effects.Speed
		}
	}

	// Total = beaconCount * moduleSpeedPerBeacon * distEfficiency / sqrt(beaconCount)
	return float64(beaconCount) * moduleSpeedPerBeacon * distEfficiency / math.Sqrt(float64(beaconCount))
}

// parsePowerKW extracts power consumption in kilowatts from a machine's EnergyUsage string.
func parsePowerKW(machine *data.CraftingMachine) float64 {
	if machine == nil {
		return 0
	}
	s := strings.TrimSpace(machine.EnergyUsage)

	var val float64
	var unit string
	for i, c := range s {
		if (c < '0' || c > '9') && c != '.' {
			val = parseFloatSafe(s[:i])
			unit = strings.ToLower(s[i:])
			break
		}
	}

	switch unit {
	case "kw":
		return val
	case "mw":
		return val * 1000
	case "w":
		return val / 1000
	default:
		return val
	}
}

func parseFloatSafe(s string) float64 {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return f
}

// beltTierForRate returns the minimum belt tier needed for a given items-per-second rate.
func beltTierForRate(itemsPerSec float64) string {
	switch {
	case itemsPerSec <= 15:
		return "yellow"
	case itemsPerSec <= 30:
		return "red"
	case itemsPerSec <= 45:
		return "blue"
	default:
		return "turbo"
	}
}

// ceilSnap rounds up to the next integer, but snaps to the nearest integer
// if within epsilon. This avoids binary search precision issues where
// an exact answer of 20.0 converges to 20.0005 and ceils to 21.
func ceilSnap(v float64) float64 {
	rounded := math.Round(v)
	if math.Abs(v-rounded) < 0.01 {
		return rounded
	}
	return math.Ceil(v)
}

// effectiveSpeed computes the actual crafting speed of a machine after module and beacon bonuses.
func effectiveSpeed(machine *data.CraftingMachine, moduleSpeedBonus, beaconSpeedBonus float64) float64 {
	base := 1.0
	if machine != nil {
		base = machine.CraftingSpeed
	}
	speed := base * (1 + moduleSpeedBonus + beaconSpeedBonus)
	if speed < 0.01 {
		speed = 0.01
	}
	return speed
}

// computeMachinePower returns the adjusted power consumption in kW after module consumption bonuses.
// Power cannot drop below 20% of base (Factorio minimum drain).
func computeMachinePower(machine *data.CraftingMachine, consumptionBonus float64) float64 {
	powerKW := parsePowerKW(machine)
	adjusted := powerKW * (1 + consumptionBonus)
	if adjusted < powerKW*0.2 {
		adjusted = powerKW * 0.2
	}
	return adjusted
}

// findIngredientAmount returns the amount of the named ingredient in the list, or 0 if absent.
func findIngredientAmount(ingredients []data.Ingredient, name string) float64 {
	for _, ing := range ingredients {
		if ing.Name == name {
			return ing.Amount
		}
	}
	return 0
}

// expandModules converts a module frequency map (module_name → count per machine)
// into a flat list of module names for use with resolveModuleEffects.
func expandModules(modules map[string]int) []string {
	var list []string
	for name, count := range modules {
		for range count {
			list = append(list, name)
		}
	}
	return list
}

// perMachineModules divides total module counts by machine count to get
// per-machine module list. Machine setups report total modules across all
// machines; resolveModuleEffects needs per-machine counts.
func perMachineModules(modules map[string]int, machineCount int) []string {
	if machineCount <= 0 {
		return nil
	}
	var list []string
	for name, total := range modules {
		perMachine := total / machineCount
		for range perMachine {
			list = append(list, name)
		}
	}
	return list
}

// roundTo rounds a float to the given number of decimal places.
func roundTo(v float64, decimals int) float64 {
	shift := math.Pow(10, float64(decimals))
	return math.Round(v*shift) / shift
}
