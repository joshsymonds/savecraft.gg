package main

import (
	"fmt"
	"math"
	"sort"

	"github.com/joshsymonds/savecraft.gg/plugins/satisfactory/reference/data"
)

// Burn-rate formulas, verified against known game figures:
//   - solid fuel items/min = MW * 60 / EnergyMJ
//     (coal generator: 75 * 60 / 300 = 15 coal/min)
//   - fluid fuel m3/min = MW * 60 / (EnergyMJ * 1000) — fluids store MJ/L
//     (fuel generator: 250 * 60 / 750 = 20 m3/min)
//   - supplemental water m3/min = MW * SupplementalRatio * 60 / 1000
//     (coal: 75*10*60/1000 = 45; nuclear: 2500*1.6*60/1000 = 240)

// powerCalculator sizes generator farms for a target megawatt figure.
func powerCalculator(query map[string]any) (map[string]any, error) {
	targetMW, ok := query["target_mw"].(float64)
	if !ok || targetMW <= 0 {
		return nil, fmt.Errorf("target_mw (> 0) is required")
	}
	generatorQ := stringParam(query, "generator")

	options := make([]map[string]any, 0, 8)
	for _, b := range sortedGenerators() {
		if b.PowerProductionMW <= 0 {
			continue
		}
		if generatorQ != "" && matchScore(generatorQ, b.ClassName, b.DisplayName) == 0 {
			continue
		}
		options = append(options, generatorPlan(b, targetMW))
	}
	if len(options) == 0 {
		return nil, fmt.Errorf("no generator matches %q", generatorQ)
	}
	return map[string]any{
		"targetMW": targetMW,
		"options":  options,
		"notes": "Counts assume 100% clock. Fuel rates are per minute at full load; " +
			"geothermal output varies by geyser purity and is excluded from sizing.",
	}, nil
}

func sortedGenerators() []data.Building {
	var out []data.Building
	for _, b := range data.Buildings {
		if b.Kind == "generator" {
			out = append(out, b)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].PowerProductionMW > out[j].PowerProductionMW })
	return out
}

func generatorPlan(b data.Building, targetMW float64) map[string]any {
	count := int(math.Ceil(targetMW/b.PowerProductionMW - 1e-9))
	actualMW := float64(count) * b.PowerProductionMW

	out := map[string]any{
		"generator": b.DisplayName,
		"className": b.ClassName,
		"perUnitMW": b.PowerProductionMW,
		"count":     count,
		"totalMW":   actualMW,
	}

	fuels := make([]map[string]any, 0, len(b.FuelClasses))
	for _, fuelClass := range b.FuelClasses {
		item, ok := data.Items[fuelClass]
		if !ok || item.EnergyMJ <= 0 {
			continue
		}
		perMJ := item.EnergyMJ
		fluid := item.Form == "RF_LIQUID" || item.Form == "RF_GAS"
		if fluid {
			perMJ *= 1000 // MJ per m3
		}
		ratePerMin := actualMW * 60 / perMJ
		entry := map[string]any{
			"fuel":      item.DisplayName,
			"className": fuelClass,
			"perMinute": round2(ratePerMin),
		}
		if fluid {
			entry["unit"] = "m3"
		}
		if item.WasteClass != "" {
			entry["wastePerMinute"] = round2(ratePerMin * float64(item.WasteAmount))
			entry["waste"] = itemName(item.WasteClass)
		}
		fuels = append(fuels, entry)
	}
	if len(fuels) > 0 {
		out["fuelOptions"] = fuels
	}
	if b.SupplementalRatio > 0 {
		out["waterPerMinute"] = round2(actualMW * b.SupplementalRatio * 60 / 1000)
	}
	return out
}
