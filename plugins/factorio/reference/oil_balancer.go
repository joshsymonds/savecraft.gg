package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

type oilQuery struct {
	ProcessingType string            `json:"processing_type"`
	Targets        map[string]float64 `json:"targets"`        // fluid name → rate per second
	Modules        []string           `json:"modules"`         // modules in each machine
	BeaconCount    int                `json:"beacon_count"`
	BeaconModules  []string           `json:"beacon_modules"`
}

// oilStage represents a processing stage in the oil flow graph.
type oilStage struct {
	ID           string  `json:"id"`
	Recipe       string  `json:"recipe"`
	MachineType  string  `json:"machine_type"`
	MachineCount float64 `json:"machine_count"`
	PowerKW      float64 `json:"power_kw"`
}

// oilFlow represents a fluid flow between stages.
type oilFlow struct {
	Source string  `json:"source"`
	Target string  `json:"target"`
	Fluid  string  `json:"fluid"`
	Rate   float64 `json:"rate"` // per second
}

// Supported processing types — maps to recipe names in data.Recipes.
var oilProcessingTypes = map[string]bool{
	"basic-oil-processing":       true,
	"advanced-oil-processing":    true,
	"coal-liquefaction":          true,
	"simple-coal-liquefaction":   true,
}

func handleOilBalancer(enc *json.Encoder, query map[string]any) {
	var q oilQuery
	raw, _ := json.Marshal(query)
	if err := json.Unmarshal(raw, &q); err != nil {
		writeError(enc, "invalid_params", "failed to parse oil_balancer params: "+err.Error())
		os.Exit(1)
	}

	if !oilProcessingTypes[q.ProcessingType] {
		writeError(enc, "invalid_processing_type", fmt.Sprintf(
			"unknown processing type %q — valid types: basic-oil-processing, advanced-oil-processing, coal-liquefaction, simple-coal-liquefaction",
			q.ProcessingType,
		))
		os.Exit(1)
	}

	if len(q.Targets) == 0 {
		writeError(enc, "missing_targets", "oil_balancer requires at least one target fluid with a rate (e.g. {\"petroleum-gas\": 100})")
		os.Exit(1)
	}

	// Resolve module and beacon effects
	moduleSpeedBonus, moduleProdBonus, moduleConsumptionBonus := resolveModuleEffects(q.Modules)
	beaconSpeedBonus := resolveBeaconEffects(q.BeaconModules, q.BeaconCount)

	result := computeOilBalance(q.ProcessingType, q.Targets, moduleSpeedBonus, moduleProdBonus, moduleConsumptionBonus, beaconSpeedBonus)

	writeResult(enc, result)
}

type oilResult struct {
	Stages     []oilStage         `json:"stages"`
	Flows      []oilFlow          `json:"flows"`
	RawInputs  map[string]float64 `json:"raw_inputs"`
	TotalPower float64            `json:"total_power_kw"`
	Surplus    map[string]float64 `json:"surplus"`
	Config     map[string]any     `json:"config"`
}

func computeOilBalance(
	processingType string,
	targets map[string]float64,
	moduleSpeedBonus, moduleProdBonus, moduleConsumptionBonus, beaconSpeedBonus float64,
) *oilResult {
	// Look up the primary processing recipe
	primaryRecipe := data.Recipes[processingType]

	// Use known machines — oil refinery for processing, chemical plant for cracking.
	// findMachineForCategory is non-deterministic (map iteration) and could return
	// biochamber (speed 2.0) instead of chemical plant (speed 1.0).
	refM := data.Machines["oil-refinery"]
	refineryMachine := &refM
	crackM := data.Machines["chemical-plant"]
	crackerMachine := &crackM

	refinerySpeed := effectiveSpeed(refineryMachine, moduleSpeedBonus, beaconSpeedBonus)
	crackerSpeed := effectiveSpeed(crackerMachine, moduleSpeedBonus, beaconSpeedBonus)
	prodMultiplier := 1.0 + moduleProdBonus

	// Compute per-refinery output rates (per second)
	refineryOutputs := make(map[string]float64)  // fluid → rate/s per refinery
	refineryInputs := make(map[string]float64)    // fluid → rate/s per refinery (positive = consumed)

	for _, result := range primaryRecipe.Results {
		refineryOutputs[result.Name] = result.Amount * result.Probability * prodMultiplier * refinerySpeed / primaryRecipe.EnergyRequired
	}
	for _, ing := range primaryRecipe.Ingredients {
		refineryInputs[ing.Name] = ing.Amount * refinerySpeed / primaryRecipe.EnergyRequired
	}

	// For coal liquefaction, heavy oil is both input and output — compute net
	// The catalyst (25 heavy) is consumed, 90 heavy is produced → 65 net
	if processingType == "coal-liquefaction" {
		if inputRate, hasInput := refineryInputs["heavy-oil"]; hasInput {
			if outputRate, hasOutput := refineryOutputs["heavy-oil"]; hasOutput {
				refineryOutputs["heavy-oil"] = outputRate - inputRate
				delete(refineryInputs, "heavy-oil")
			}
		}
	}

	// Look up cracking recipes
	heavyCrackRecipe := data.Recipes["heavy-oil-cracking"]
	lightCrackRecipe := data.Recipes["light-oil-cracking"]

	heavyCrackConsume := heavyCrackRecipe.Ingredients[1].Amount * crackerSpeed / heavyCrackRecipe.EnergyRequired // heavy oil consumed per cracker/s
	heavyCrackWater := heavyCrackRecipe.Ingredients[0].Amount * crackerSpeed / heavyCrackRecipe.EnergyRequired   // water consumed per cracker/s
	heavyCrackProduce := heavyCrackRecipe.Results[0].Amount * heavyCrackRecipe.Results[0].Probability * prodMultiplier * crackerSpeed / heavyCrackRecipe.EnergyRequired // light oil produced

	lightCrackConsume := lightCrackRecipe.Ingredients[1].Amount * crackerSpeed / lightCrackRecipe.EnergyRequired // light oil consumed per cracker/s
	lightCrackWater := lightCrackRecipe.Ingredients[0].Amount * crackerSpeed / lightCrackRecipe.EnergyRequired   // water consumed per cracker/s
	lightCrackProduce := lightCrackRecipe.Results[0].Amount * lightCrackRecipe.Results[0].Probability * prodMultiplier * crackerSpeed / lightCrackRecipe.EnergyRequired // petroleum produced

	// Check for downstream product recipes (lubricant, solid fuel, etc.)
	// These consume fluids that would otherwise be cracked
	type downstreamDemand struct {
		recipe    string
		fluid     string // fluid consumed
		machines  float64
		rateUsed  float64 // fluid consumed per second total
	}
	var downstreams []downstreamDemand

	// Check if any targets are downstream products (not direct refinery outputs)
	downstreamRecipes := map[string]string{
		"lubricant":    "lubricant",
		"solid-fuel":   "", // ambiguous — skip for now
		"sulfuric-acid": "sulfuric-acid",
		"sulfur":       "sulfur",
		"plastic-bar":  "plastic-bar",
	}

	for targetFluid, targetRate := range targets {
		recipeName, isDownstream := downstreamRecipes[targetFluid]
		if !isDownstream || recipeName == "" {
			continue
		}

		recipe, ok := data.Recipes[recipeName]
		if !ok {
			continue
		}

		// Find which fluid this recipe consumes (that comes from oil processing)
		var fluidIngredient string
		var fluidAmount float64
		for _, ing := range recipe.Ingredients {
			if ing.Type == "fluid" {
				fluidIngredient = ing.Name
				fluidAmount = ing.Amount
				break
			}
		}
		if fluidIngredient == "" {
			continue
		}

		// Find output amount
		var outputAmount float64
		for _, res := range recipe.Results {
			if res.Name == targetFluid {
				outputAmount = res.Amount * res.Probability * prodMultiplier
				break
			}
		}
		if outputAmount <= 0 {
			continue
		}

		machine := findMachineForCategory(recipe.Category)
		speed := effectiveSpeed(machine, moduleSpeedBonus, beaconSpeedBonus)
		outputPerMachinePerSec := outputAmount * speed / recipe.EnergyRequired
		machinesNeeded := math.Ceil(targetRate / outputPerMachinePerSec)
		actualFluidConsumed := machinesNeeded * fluidAmount * speed / recipe.EnergyRequired

		downstreams = append(downstreams, downstreamDemand{
			recipe:   recipeName,
			fluid:    fluidIngredient,
			machines: machinesNeeded,
			rateUsed: actualFluidConsumed,
		})
	}

	// Compute total demand for each fluid from downstream recipes
	downstreamFluidDemand := make(map[string]float64)
	for _, ds := range downstreams {
		downstreamFluidDemand[ds.fluid] += ds.rateUsed
	}

	// Determine how many refineries we need.
	// Heavy oil can ONLY come from the primary recipe — it sets a hard minimum.
	// Light oil and petroleum also come from cracking, so the binary search handles them.
	var refineryCount float64

	// Target rates for the three primary fluids (after downstream consumption)
	targetHeavy := targets["heavy-oil"] + downstreamFluidDemand["heavy-oil"]
	targetLight := targets["light-oil"] + downstreamFluidDemand["light-oil"]
	targetPetroleum := targets["petroleum-gas"] + downstreamFluidDemand["petroleum-gas"]

	// For basic oil processing: only petroleum output, no cracking possible
	if processingType == "basic-oil-processing" {
		petroRate := refineryOutputs["petroleum-gas"]
		if petroRate > 0 && targetPetroleum > 0 {
			needed := targetPetroleum / petroRate
			if needed > refineryCount {
				refineryCount = needed
			}
		}
		refineryCount = math.Ceil(refineryCount)
		if refineryCount < 1 {
			refineryCount = 1
		}

		return buildBasicResult(
			processingType, refineryCount, refineryOutputs, refineryInputs,
			refineryMachine, targets, moduleConsumptionBonus,
		)
	}

	// For simple coal liquefaction: only heavy oil output, no cracking
	if processingType == "simple-coal-liquefaction" {
		heavyRate := refineryOutputs["heavy-oil"]
		if heavyRate > 0 && targetHeavy > 0 {
			needed := targetHeavy / heavyRate
			if needed > refineryCount {
				refineryCount = needed
			}
		}
		refineryCount = math.Ceil(refineryCount)
		if refineryCount < 1 {
			refineryCount = 1
		}

		return buildBasicResult(
			processingType, refineryCount, refineryOutputs, refineryInputs,
			refineryMachine, targets, moduleConsumptionBonus,
		)
	}

	// For advanced/coal-liquefaction: solve the balance equations
	// Available heavy = R * heavyRate - targetHeavy - downstreamHeavyDemand
	// Heavy to crack = max(0, available heavy)
	// H = heavy_to_crack / heavyCrackConsume
	// Available light = R * lightRate + H * heavyCrackProduce - targetLight - downstreamLightDemand
	// Light to crack = max(0, available light)
	// L = light_to_crack / lightCrackConsume
	// Petroleum from refinery = R * petroRate
	// Petroleum from cracking = L * lightCrackProduce
	// Total petroleum = refinery + cracking

	// We need to find R such that total petroleum >= targetPetroleum
	// Binary search or direct solve

	heavyPerRefinery := refineryOutputs["heavy-oil"]
	lightPerRefinery := refineryOutputs["light-oil"]
	petroPerRefinery := refineryOutputs["petroleum-gas"]

	// Direct solve: express everything in terms of R
	// Heavy available for cracking: R * heavyPerRefinery - targetHeavy - downstreamHeavyDemand["heavy-oil"]
	// H = max(0, (R * heavyPerRefinery - targetHeavy - downstreamFluidDemand["heavy-oil"])) / heavyCrackConsume
	// Light from cracking: H * heavyCrackProduce
	// Total light available: R * lightPerRefinery + H * heavyCrackProduce
	// Light available for cracking: total_light - targetLight - downstreamFluidDemand["light-oil"]
	// L = max(0, light_available_for_cracking) / lightCrackConsume
	// Total petroleum: R * petroPerRefinery + L * lightCrackProduce
	//
	// This is piecewise linear in R. We solve by iterating: start with R from
	// the most constrained fluid, then check if petroleum is met.

	// Start with minimum R to meet heavy oil demand (if any)
	if heavyPerRefinery > 0 {
		neededForHeavy := (targetHeavy + downstreamFluidDemand["heavy-oil"]) / heavyPerRefinery
		if neededForHeavy > refineryCount {
			refineryCount = neededForHeavy
		}
	}

	// Iterative solve: increase R until petroleum target is met
	// Since petroleum is monotonically increasing in R, we can binary search
	if targetPetroleum > 0 && petroPerRefinery > 0 {
		lo := refineryCount
		hi := math.Max(refineryCount, targetPetroleum/petroPerRefinery) * 3 // generous upper bound

		for iter := 0; iter < 100; iter++ {
			mid := (lo + hi) / 2
			_, _, totalPetro := computeCrackingForR(mid, heavyPerRefinery, lightPerRefinery, petroPerRefinery,
				targetHeavy+downstreamFluidDemand["heavy-oil"],
				targetLight+downstreamFluidDemand["light-oil"],
				targetPetroleum,
				heavyCrackConsume, heavyCrackProduce, lightCrackConsume, lightCrackProduce)

			if totalPetro >= targetPetroleum {
				hi = mid
			} else {
				lo = mid
			}

			if hi-lo < 0.001 {
				break
			}
		}
		refineryCount = hi
	}

	refineryCount = ceilSnap(refineryCount)
	if refineryCount < 1 {
		refineryCount = 1
	}

	// Compute cracking with integer refinery count
	heavyCrackerCount, lightCrackerCount, totalPetroleum := computeCrackingForR(
		refineryCount, heavyPerRefinery, lightPerRefinery, petroPerRefinery,
		targetHeavy+downstreamFluidDemand["heavy-oil"],
		targetLight+downstreamFluidDemand["light-oil"],
		targetPetroleum,
		heavyCrackConsume, heavyCrackProduce, lightCrackConsume, lightCrackProduce,
	)

	heavyCrackerCount = ceilSnap(heavyCrackerCount)
	lightCrackerCount = ceilSnap(lightCrackerCount)

	// Build result
	stages := []oilStage{}
	flows := []oilFlow{}
	rawInputs := make(map[string]float64)
	surplus := make(map[string]float64)

	// Refinery stage
	refineryID := "refinery"
	refineryPowerKW := computeMachinePower(refineryMachine, moduleConsumptionBonus) * refineryCount
	stages = append(stages, oilStage{
		ID:           refineryID,
		Recipe:       processingType,
		MachineType:  refineryMachine.Name,
		MachineCount: refineryCount,
		PowerKW:      roundTo(refineryPowerKW, 1),
	})

	// Raw inputs for refinery
	for fluid, ratePerMachine := range refineryInputs {
		rawInputs[fluid] = roundTo(ratePerMachine*refineryCount, 1)
	}

	// Flows from refinery
	actualHeavy := refineryCount * heavyPerRefinery
	actualLight := refineryCount * lightPerRefinery
	actualPetro := refineryCount * petroPerRefinery

	// Heavy oil cracking stage
	if heavyCrackerCount > 0 {
		crackerID := "heavy-cracker"
		crackerPowerKW := computeMachinePower(crackerMachine, moduleConsumptionBonus) * heavyCrackerCount
		stages = append(stages, oilStage{
			ID:           crackerID,
			Recipe:       "heavy-oil-cracking",
			MachineType:  crackerMachine.Name,
			MachineCount: heavyCrackerCount,
			PowerKW:      roundTo(crackerPowerKW, 1),
		})

		heavyCracked := heavyCrackerCount * heavyCrackConsume
		lightFromCracking := heavyCrackerCount * heavyCrackProduce
		waterForHeavyCracking := heavyCrackerCount * heavyCrackWater

		flows = append(flows, oilFlow{Source: refineryID, Target: crackerID, Fluid: "heavy-oil", Rate: roundTo(heavyCracked, 1)})
		actualLight += lightFromCracking
		rawInputs["water"] = roundTo(rawInputs["water"]+waterForHeavyCracking, 1)
	}

	// Light oil cracking stage
	if lightCrackerCount > 0 {
		crackerID := "light-cracker"
		crackerPowerKW := computeMachinePower(crackerMachine, moduleConsumptionBonus) * lightCrackerCount
		stages = append(stages, oilStage{
			ID:           crackerID,
			Recipe:       "light-oil-cracking",
			MachineType:  crackerMachine.Name,
			MachineCount: lightCrackerCount,
			PowerKW:      roundTo(crackerPowerKW, 1),
		})

		lightCracked := lightCrackerCount * lightCrackConsume
		petroFromCracking := lightCrackerCount * lightCrackProduce
		waterForLightCracking := lightCrackerCount * lightCrackWater

		// Light oil flows from refinery and heavy cracker to light cracker
		flows = append(flows, oilFlow{Source: refineryID, Target: crackerID, Fluid: "light-oil", Rate: roundTo(lightCracked, 1)})
		actualPetro += petroFromCracking
		rawInputs["water"] = roundTo(rawInputs["water"]+waterForLightCracking, 1)
	}

	// Downstream product stages
	for _, ds := range downstreams {
		recipe := data.Recipes[ds.recipe]
		machine := findMachineForCategory(recipe.Category)
		stageID := "downstream-" + ds.recipe
		powerKW := computeMachinePower(machine, moduleConsumptionBonus) * ds.machines
		stages = append(stages, oilStage{
			ID:           stageID,
			Recipe:       ds.recipe,
			MachineType:  machine.Name,
			MachineCount: ds.machines,
			PowerKW:      roundTo(powerKW, 1),
		})

		// Flow from appropriate source to downstream
		sourceID := refineryID // default — heavy oil comes from refinery
		flows = append(flows, oilFlow{Source: sourceID, Target: stageID, Fluid: ds.fluid, Rate: roundTo(ds.rateUsed, 1)})

		// Downstream output flow
		flows = append(flows, oilFlow{Source: stageID, Target: "output", Fluid: ds.recipe, Rate: roundTo(targets[ds.recipe], 1)})
	}

	// Input flows (raw materials)
	for fluid, rate := range rawInputs {
		flows = append(flows, oilFlow{Source: "input", Target: refineryID, Fluid: fluid, Rate: rate})
	}

	// Output flows (target products directly from refinery/cracking)
	if targets["heavy-oil"] > 0 {
		flows = append(flows, oilFlow{Source: refineryID, Target: "output", Fluid: "heavy-oil", Rate: roundTo(targets["heavy-oil"], 1)})
	}
	if targets["light-oil"] > 0 {
		flows = append(flows, oilFlow{Source: refineryID, Target: "output", Fluid: "light-oil", Rate: roundTo(targets["light-oil"], 1)})
	}
	if targets["petroleum-gas"] > 0 {
		targetSource := refineryID
		if lightCrackerCount > 0 {
			targetSource = "light-cracker"
		}
		flows = append(flows, oilFlow{Source: targetSource, Target: "output", Fluid: "petroleum-gas", Rate: roundTo(targets["petroleum-gas"], 1)})
	}

	// Compute surplus
	heavyUsed := targets["heavy-oil"] + downstreamFluidDemand["heavy-oil"]
	if heavyCrackerCount > 0 {
		heavyUsed += heavyCrackerCount * heavyCrackConsume
	}
	heavySurplus := actualHeavy - heavyUsed
	if heavySurplus > 0.01 {
		surplus["heavy-oil"] = roundTo(heavySurplus, 1)
	}

	lightUsed := targets["light-oil"] + downstreamFluidDemand["light-oil"]
	if lightCrackerCount > 0 {
		lightUsed += lightCrackerCount * lightCrackConsume
	}
	lightSurplus := actualLight - lightUsed
	if lightSurplus > 0.01 {
		surplus["light-oil"] = roundTo(lightSurplus, 1)
	}

	petroSurplus := actualPetro + totalPetroleum - targets["petroleum-gas"]
	// Avoid double-counting: totalPetroleum already includes refinery direct
	petroSurplus = actualPetro - targets["petroleum-gas"]
	if lightCrackerCount > 0 {
		petroSurplus += lightCrackerCount * lightCrackProduce
	}
	if petroSurplus > 0.01 {
		surplus["petroleum-gas"] = roundTo(petroSurplus, 1)
	}

	totalPowerKW := refineryPowerKW
	for _, s := range stages[1:] { // skip refinery, already counted
		totalPowerKW += s.PowerKW
	}

	return &oilResult{
		Stages:     stages,
		Flows:      flows,
		RawInputs:  rawInputs,
		TotalPower: roundTo(totalPowerKW, 1),
		Surplus:    surplus,
		Config: map[string]any{
			"processing_type": processingType,
			"modules":         nil,
			"beacon_count":    0,
			"beacon_modules":  nil,
		},
	}
}

// computeCrackingForR computes heavy and light cracker counts for a given
// (possibly fractional) number of refineries, along with total petroleum output.
// Only cracks fluids when there's downstream demand (petroleum target requires
// light cracking, which in turn requires heavy cracking to free up heavy oil).
func computeCrackingForR(
	R, heavyPerRefinery, lightPerRefinery, petroPerRefinery float64,
	heavyDemand, lightDemand, petroDemand float64,
	heavyCrackConsume, heavyCrackProduce, lightCrackConsume, lightCrackProduce float64,
) (heavyCrackers, lightCrackers, totalPetroleum float64) {
	totalPetroleum = R * petroPerRefinery

	// Only crack if we need more petroleum or light oil than refineries provide
	petroDeficit := petroDemand - totalPetroleum
	lightFromRefinery := R * lightPerRefinery
	lightDeficit := lightDemand - lightFromRefinery

	// Light oil cracking: only if we need more petroleum
	if petroDeficit > 0 && lightCrackProduce > 0 {
		// We need lightCrackers to produce the petroleum deficit
		lightCrackersForPetro := petroDeficit / lightCrackProduce

		// Light oil consumed by cracking
		lightNeededForCracking := lightCrackersForPetro * lightCrackConsume

		// Total light oil demand: direct targets + cracking consumption
		totalLightNeeded := lightDemand + lightNeededForCracking

		// Light oil deficit (vs refinery output) — how much we need from heavy cracking
		totalLightDeficit := totalLightNeeded - lightFromRefinery

		// Heavy oil cracking: only if we need more light oil
		if totalLightDeficit > 0 && heavyCrackProduce > 0 {
			heavyCrackers = totalLightDeficit / heavyCrackProduce
			// Cap by available heavy oil
			heavyAvailable := R*heavyPerRefinery - heavyDemand
			if heavyAvailable < 0 {
				heavyAvailable = 0
			}
			maxHeavyCrackers := heavyAvailable / heavyCrackConsume
			if heavyCrackers > maxHeavyCrackers {
				heavyCrackers = maxHeavyCrackers
			}
		}

		// Actual light oil available for cracking
		actualLightFromCracking := heavyCrackers * heavyCrackProduce
		totalLightAvailable := lightFromRefinery + actualLightFromCracking - lightDemand
		if totalLightAvailable < 0 {
			totalLightAvailable = 0
		}

		lightCrackers = totalLightAvailable / lightCrackConsume

		totalPetroleum += lightCrackers * lightCrackProduce
	} else if lightDeficit > 0 && heavyCrackProduce > 0 {
		// Need more light oil but not more petroleum — crack heavy for light
		heavyCrackers = lightDeficit / heavyCrackProduce
		heavyAvailable := R*heavyPerRefinery - heavyDemand
		if heavyAvailable < 0 {
			heavyAvailable = 0
		}
		maxHeavyCrackers := heavyAvailable / heavyCrackConsume
		if heavyCrackers > maxHeavyCrackers {
			heavyCrackers = maxHeavyCrackers
		}
	}

	return
}

func buildBasicResult(
	processingType string, refineryCount float64,
	outputs, inputs map[string]float64,
	machine *data.CraftingMachine,
	targets map[string]float64,
	moduleConsumptionBonus float64,
) *oilResult {
	stages := []oilStage{}
	flows := []oilFlow{}
	rawInputs := make(map[string]float64)
	surplus := make(map[string]float64)

	refineryID := "refinery"
	powerKW := computeMachinePower(machine, moduleConsumptionBonus) * refineryCount
	stages = append(stages, oilStage{
		ID:           refineryID,
		Recipe:       processingType,
		MachineType:  machine.Name,
		MachineCount: refineryCount,
		PowerKW:      roundTo(powerKW, 1),
	})

	// Raw inputs
	for fluid, ratePerMachine := range inputs {
		rate := ratePerMachine * refineryCount
		rawInputs[fluid] = roundTo(rate, 1)
		flows = append(flows, oilFlow{Source: "input", Target: refineryID, Fluid: fluid, Rate: roundTo(rate, 1)})
	}

	// Outputs and surplus
	for fluid, ratePerMachine := range outputs {
		actualRate := ratePerMachine * refineryCount
		targetRate := targets[fluid]
		if targetRate > 0 {
			flows = append(flows, oilFlow{Source: refineryID, Target: "output", Fluid: fluid, Rate: roundTo(targetRate, 1)})
		}
		surplusRate := actualRate - targetRate
		if surplusRate > 0.01 {
			surplus[fluid] = roundTo(surplusRate, 1)
		}
	}

	return &oilResult{
		Stages:     stages,
		Flows:      flows,
		RawInputs:  rawInputs,
		TotalPower: roundTo(powerKW, 1),
		Surplus:    surplus,
		Config: map[string]any{
			"processing_type": processingType,
		},
	}
}

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

func findMachineForCategory(category string) *data.CraftingMachine {
	for _, m := range data.Machines {
		for _, cat := range m.CraftingCategories {
			if cat == category {
				m := m
				return &m
			}
		}
	}
	return nil
}

func computeMachinePower(machine *data.CraftingMachine, consumptionBonus float64) float64 {
	powerKW := parsePowerKW(machine)
	adjusted := powerKW * (1 + consumptionBonus)
	if adjusted < powerKW*0.2 {
		adjusted = powerKW * 0.2
	}
	return adjusted
}
