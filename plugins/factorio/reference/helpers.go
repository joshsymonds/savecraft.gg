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

// roundTo rounds a float to the given number of decimal places.
func roundTo(v float64, decimals int) float64 {
	shift := math.Pow(10, float64(decimals))
	return math.Round(v*shift) / shift
}
