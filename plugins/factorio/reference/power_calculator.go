package main

import (
	"encoding/json"
	"math"
	"os"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

type sourceResult struct {
	Type         string         `json:"type"`
	GenerationMW float64        `json:"generation_mw"`
	Entities     map[string]int `json:"entities"`
	Fuel         map[string]any `json:"fuel,omitempty"`
	Layout       string         `json:"layout,omitempty"`
}

func handlePowerCalculator(enc *json.Encoder, query map[string]any) {
	// Parse target_mw
	targetMW, ok := query["target_mw"].(float64)
	if !ok || targetMW <= 0 {
		writeError(enc, "validation_error", "target_mw is required and must be a positive number")
		os.Exit(1)
	}

	// Parse sources array
	sourcesRaw, ok := query["sources"].([]any)
	if !ok || len(sourcesRaw) == 0 {
		writeError(enc, "validation_error", "sources is required and must be a non-empty array")
		os.Exit(1)
	}

	// Parse optional existing_power from save data.
	var existingMW float64
	if ep, ok := query["existing_power"].(map[string]any); ok {
		if surfaces, ok := ep["surfaces"].(map[string]any); ok {
			for _, s := range surfaces {
				if surf, ok := s.(map[string]any); ok {
					if gen, ok := surf["generation_mw"].(float64); ok {
						existingMW += gen
					}
				}
			}
		}
	}

	// Parse sources. Each source is either "fixed" (computed immediately with its own
	// output) or "fill" (deferred, covers the remainder). A source is fill when it's
	// the last in the list AND there are other sources, OR when it's the only source
	// (in which case it targets the full target_mw). We detect fill by counting: if
	// there are multiple sources, the last one that isn't nuclear (which has fixed
	// layout output) is the fill source.
	//
	// Simpler rule: first pass computes all sources for their natural output.
	// Nuclear always has fixed output (determined by layout). Steam and solar
	// are flexible. When there are multiple sources, the LAST source in the array
	// is computed to fill the remainder after all earlier sources.

	type parsedSource struct {
		typ    string
		fuel   string
		layout string
	}

	var parsed []parsedSource
	for _, raw := range sourcesRaw {
		src, ok := raw.(map[string]any)
		if !ok {
			writeError(enc, "validation_error", "each source must be an object")
			os.Exit(1)
		}
		typ, _ := src["type"].(string)
		if typ != "steam" && typ != "solar" && typ != "nuclear" {
			writeError(enc, "validation_error", "unknown source type: "+typ)
			os.Exit(1)
		}
		ps := parsedSource{typ: typ}
		if f, ok := src["fuel"].(string); ok && f != "" {
			ps.fuel = f
		}
		if l, ok := src["layout"].(string); ok && l != "" {
			ps.layout = l
		}
		parsed = append(parsed, ps)
	}

	// Compute results. If multiple sources, the last one fills the remainder.
	var results []sourceResult
	var fixedMW float64
	fillIndex := -1

	if len(parsed) > 1 {
		fillIndex = len(parsed) - 1
	}

	for i, ps := range parsed {
		if i == fillIndex {
			// Placeholder — computed after fixed sources.
			results = append(results, sourceResult{Type: ps.typ})
			continue
		}

		r, errMsg := computeSource(ps.typ, ps.fuel, ps.layout, targetMW)
		if errMsg != "" {
			writeError(enc, "validation_error", errMsg)
			os.Exit(1)
		}
		results = append(results, r)
		fixedMW += r.GenerationMW
	}

	// Compute fill source.
	if fillIndex >= 0 {
		remainderMW := targetMW - fixedMW
		if remainderMW < 0 {
			remainderMW = 0
		}
		ps := parsed[fillIndex]
		r, errMsg := computeSource(ps.typ, ps.fuel, ps.layout, remainderMW)
		if errMsg != "" {
			writeError(enc, "validation_error", errMsg)
			os.Exit(1)
		}
		results[fillIndex] = r
	}

	// Compute totals.
	var totalMW float64
	for _, r := range results {
		totalMW += r.GenerationMW
	}

	output := map[string]any{
		"target_mw":           targetMW,
		"total_generation_mw": roundTo(totalMW, 2),
		"surplus_mw":          roundTo(totalMW-targetMW, 2),
		"sources":             results,
	}

	if existingMW > 0 {
		output["existing_mw"] = roundTo(existingMW, 2)
		output["deficit_mw"] = roundTo(targetMW-existingMW, 2)
	}

	writeResult(enc, output)
}

// computeSource dispatches to the appropriate compute function by source type.
func computeSource(typ, fuel, layout string, targetMW float64) (sourceResult, string) {
	switch typ {
	case "steam":
		if fuel == "" {
			fuel = "coal"
		}
		return computeSteam(targetMW, fuel), ""
	case "solar":
		return computeSolar(targetMW), ""
	case "nuclear":
		if layout == "" {
			layout = "2x2"
		}
		return computeNuclear(layout)
	default:
		return sourceResult{}, "unknown source type: " + typ
	}
}

// computeSteam calculates the steam power chain for a given target MW and fuel type.
func computeSteam(targetMW float64, fuelName string) sourceResult {
	fuelItem, ok := data.FuelValues[fuelName]
	if !ok {
		fuelItem = data.FuelValues["coal"]
		fuelName = "coal"
	}

	engineKW := data.PowerEntities["steam-engine"].PowerOutputKW // 900 kW
	boilerKW := data.PowerEntities["boiler"].PowerOutputKW       // 1800 kW thermal

	// Each steam engine produces 900 kW.
	engines := int(math.Ceil(targetMW * 1000 / engineKW))

	// Each boiler feeds 2 steam engines.
	boilers := int(math.Ceil(float64(engines) / float64(data.EnginesPerBoiler)))

	// Each offshore pump feeds 20 boilers.
	pumps := int(math.Ceil(float64(boilers) / float64(data.BoilersPerPump)))

	// Actual generation.
	genMW := float64(engines) * engineKW / 1000

	// Fuel consumption: each boiler burns fuel at its thermal rate.
	// boilerKW in kW = boilerMW * 1000. Energy per fuel item = fuelItem.EnergyMJ MJ.
	// Fuel per boiler per second = boilerKW / (fuelItem.EnergyMJ * 1000).
	fuelPerBoilerPerSec := boilerKW / (fuelItem.EnergyMJ * 1000)
	fuelPerMin := float64(boilers) * fuelPerBoilerPerSec * 60

	return sourceResult{
		Type:         "steam",
		GenerationMW: roundTo(genMW, 2),
		Entities: map[string]int{
			"offshore-pump": pumps,
			"boiler":        boilers,
			"steam-engine":  engines,
		},
		Fuel: map[string]any{
			"type":         fuelName,
			"fuel_per_min": roundTo(fuelPerMin, 1),
		},
	}
}

// computeSolar calculates solar panel and accumulator counts for a target MW.
func computeSolar(targetMW float64) sourceResult {
	targetKW := targetMW * 1000
	panels := int(math.Ceil(targetKW / data.SolarAverageKW))

	// Accumulator ratio: 21 accumulators per 25 panels.
	accumulators := int(math.Ceil(float64(panels) / data.SolarAccumulatorRatio))

	genMW := float64(panels) * data.SolarAverageKW / 1000

	return sourceResult{
		Type:         "solar",
		GenerationMW: roundTo(genMW, 3),
		Entities: map[string]int{
			"solar-panel": panels,
			"accumulator": accumulators,
		},
	}
}

// computeNuclear calculates nuclear power entities for a given reactor layout.
func computeNuclear(layoutName string) (sourceResult, string) {
	layout, ok := data.ReactorLayouts[layoutName]
	if !ok {
		return sourceResult{}, "unknown reactor layout: " + layoutName + ". Valid layouts: 1x1, 2x1, 2x2, 2x3, 2x4"
	}

	// Compute total thermal output.
	// Each reactor: 40MW * (1 + neighbors).
	reactorBase := data.PowerEntities["nuclear-reactor"].PowerOutputKW / 1000 // 40 MW
	var totalThermalMW float64
	for _, neighbors := range layout.Adjacencies {
		totalThermalMW += reactorBase * (1 + float64(neighbors))
	}

	// Heat exchangers: each handles 10 MW thermal.
	heatExchangers := int(math.Ceil(totalThermalMW / data.HeatExchangerThermalMW))

	// Steam turbines: each produces 5.82 MW electrical.
	turbineKW := data.PowerEntities["steam-turbine"].PowerOutputKW // 5820 kW
	turbineMW := turbineKW / 1000
	// Total steam from heat exchangers = totalThermalMW (conservation).
	// Turbines needed = totalThermalMW / turbineMW.
	turbines := int(math.Ceil(totalThermalMW / turbineMW))

	// Electrical output = turbines * turbineMW (slightly over due to ceiling).
	genMW := float64(turbines) * turbineMW

	// Offshore pumps for heat exchangers: each exchanger needs ~103 water/sec,
	// 1 pump provides 1200/sec.
	exchangerWater := data.PowerEntities["heat-exchanger"].FluidPerSec
	totalWater := float64(heatExchangers) * exchangerWater
	pumps := int(math.Ceil(totalWater / data.PowerEntities["offshore-pump"].FluidPerSec))

	// Fuel cells: each reactor consumes 1 fuel cell per 200 seconds.
	fuelCellsPerSec := float64(layout.Reactors) / data.NuclearFuelCellDuration
	fuelCellsPerMin := fuelCellsPerSec * 60

	// U-235 per fuel cell: 1 fuel cell = 1 U-235 (simplification of the enrichment recipe).
	// Uranium ore per U-235: Kovarex enrichment makes this complex; report fuel cells only
	// and let the AI explain enrichment.

	return sourceResult{
		Type:         "nuclear",
		GenerationMW: roundTo(genMW, 2),
		Layout:       layoutName,
		Entities: map[string]int{
			"nuclear-reactor": layout.Reactors,
			"heat-exchanger":  heatExchangers,
			"steam-turbine":   turbines,
			"offshore-pump":   pumps,
		},
		Fuel: map[string]any{
			"fuel_cells_per_min": roundTo(fuelCellsPerMin, 2),
		},
	}, ""
}
