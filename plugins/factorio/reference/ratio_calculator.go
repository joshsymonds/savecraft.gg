package main

import (
	"encoding/json"
	"math"
	"os"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// Raw materials that have no recipe — the recursion base case.
var rawMaterials = map[string]bool{
	"iron-ore": true, "copper-ore": true, "coal": true, "stone": true,
	"uranium-ore": true, "crude-oil": true, "water": true, "wood": true,
	"raw-fish": true, "steam": true,
	// Space Age raw resources
	"calcite": true, "tungsten-ore": true, "scrap": true, "holmium-ore": true,
	"yumako-seed": true, "jellynut-seed": true, "ice": true,
	"fluorine": true, "ammoniacal-solution": true, "lithium-brine": true,
}

type ratioQuery struct {
	TargetItem    string   `json:"target_item"`
	TargetRate    float64  `json:"target_rate"` // items per minute
	AssemblerTier string   `json:"assembler_tier"`
	Modules       []string `json:"modules"`
	BeaconCount   int      `json:"beacon_count"`
	BeaconModules []string `json:"beacon_modules"`
}

type productionNode struct {
	Item        string            `json:"item"`
	Recipe      string            `json:"recipe"`
	Machines    int               `json:"machines"`
	MachineType string            `json:"machine_type"`
	RatePerMin  float64           `json:"rate_per_min"`
	BeltTier    string            `json:"belt_tier"`
	PowerKW     float64           `json:"power_kw"`
	Children    []*productionNode `json:"children,omitempty"`
}

func handleRatioCalculator(enc *json.Encoder, query map[string]any) {
	var q ratioQuery
	raw, _ := json.Marshal(query)
	if err := json.Unmarshal(raw, &q); err != nil {
		writeError(enc, "invalid_params", "failed to parse ratio_calculator params: "+err.Error())
		os.Exit(1)
	}

	if q.TargetItem == "" {
		writeError(enc, "missing_param", "ratio_calculator requires target_item")
		os.Exit(1)
	}
	if q.TargetRate <= 0 {
		q.TargetRate = 60 // default: 1 per second = 60 per minute
	}
	if q.AssemblerTier == "" {
		q.AssemblerTier = "assembling-machine-2"
	}

	// Resolve module effects
	moduleSpeedBonus, moduleProdBonus, moduleConsumptionBonus := resolveModuleEffects(q.Modules)
	beaconSpeedBonus := resolveBeaconEffects(q.BeaconModules, q.BeaconCount)

	ctx := &ratioContext{
		assemblerTier:         q.AssemblerTier,
		moduleSpeedBonus:      moduleSpeedBonus,
		moduleProdBonus:       moduleProdBonus,
		moduleConsumptionBonus: moduleConsumptionBonus,
		beaconSpeedBonus:      beaconSpeedBonus,
		rawTotals:             make(map[string]float64),
		totalPowerKW:          0,
		visited:               make(map[string]bool),
	}

	// Verify the target item has a recipe before building the tree
	if !rawMaterials[q.TargetItem] {
		recipe, _ := findRecipeFor(q.TargetItem)
		if recipe == nil {
			writeError(enc, "not_found", "no recipe produces "+q.TargetItem)
			os.Exit(1)
		}
	}

	root := ctx.buildTree(q.TargetItem, q.TargetRate/60.0) // convert to per-second internally

	// Build raw materials summary
	var rawSummary []map[string]any
	for item, rate := range ctx.rawTotals {
		rawSummary = append(rawSummary, map[string]any{
			"item":         item,
			"rate_per_min": roundTo(rate*60, 1),
			"belt_tier":    beltTierForRate(rate),
		})
	}

	writeResult(enc, map[string]any{
		"production_tree": root,
		"raw_materials":   rawSummary,
		"total_power_kw":  roundTo(ctx.totalPowerKW, 1),
		"config": map[string]any{
			"assembler_tier": q.AssemblerTier,
			"modules":        q.Modules,
			"beacon_count":   q.BeaconCount,
			"beacon_modules": q.BeaconModules,
		},
	})
}

type ratioContext struct {
	assemblerTier          string
	moduleSpeedBonus       float64
	moduleProdBonus        float64
	moduleConsumptionBonus float64
	beaconSpeedBonus       float64
	rawTotals              map[string]float64
	totalPowerKW           float64
	visited                map[string]bool // cycle detection
}

func (ctx *ratioContext) buildTree(item string, targetRatePerSec float64) *productionNode {
	// Base case: raw material
	if rawMaterials[item] {
		ctx.rawTotals[item] += targetRatePerSec
		return &productionNode{
			Item:       item,
			Recipe:     "(raw)",
			RatePerMin: roundTo(targetRatePerSec*60, 1),
			BeltTier:   beltTierForRate(targetRatePerSec),
		}
	}

	// Find recipe that produces this item
	recipe, resultAmount := findRecipeFor(item)
	if recipe == nil {
		// No recipe found — treat as raw
		ctx.rawTotals[item] += targetRatePerSec
		return &productionNode{
			Item:       item,
			Recipe:     "(no recipe)",
			RatePerMin: roundTo(targetRatePerSec*60, 1),
			BeltTier:   beltTierForRate(targetRatePerSec),
		}
	}

	// Cycle detection
	if ctx.visited[item] {
		ctx.rawTotals[item] += targetRatePerSec
		return &productionNode{
			Item:       item,
			Recipe:     "(cycle)",
			RatePerMin: roundTo(targetRatePerSec*60, 1),
			BeltTier:   beltTierForRate(targetRatePerSec),
		}
	}
	ctx.visited[item] = true
	defer func() { ctx.visited[item] = false }()

	// Find the right machine for this recipe
	machine := ctx.findMachine(recipe.Category)
	machineType := ctx.assemblerTier
	if machine != nil {
		machineType = machine.Name
	}

	craftingSpeed := 1.0
	if machine != nil {
		craftingSpeed = machine.CraftingSpeed
	}

	// Apply module and beacon speed bonuses
	effectiveSpeed := craftingSpeed * (1 + ctx.moduleSpeedBonus + ctx.beaconSpeedBonus)
	if effectiveSpeed < 0.01 {
		effectiveSpeed = 0.01 // floor
	}

	// Productivity bonus gives free output
	effectiveOutput := resultAmount * (1 + ctx.moduleProdBonus)

	// Items per second per machine
	craftTime := recipe.EnergyRequired
	if craftTime <= 0 {
		craftTime = 0.5
	}
	itemsPerSecPerMachine := (effectiveSpeed / craftTime) * effectiveOutput

	// Machines needed
	machineCount := int(math.Ceil(targetRatePerSec / itemsPerSecPerMachine))
	if machineCount < 1 {
		machineCount = 1
	}

	// Actual production rate
	actualRate := float64(machineCount) * itemsPerSecPerMachine

	// Power consumption
	powerKW := parsePowerKW(machine)
	machinePowerKW := powerKW * (1 + ctx.moduleConsumptionBonus)
	if machinePowerKW < powerKW*0.2 {
		machinePowerKW = powerKW * 0.2 // efficiency module floor: 20%
	}
	ctx.totalPowerKW += machinePowerKW * float64(machineCount)

	node := &productionNode{
		Item:        item,
		Recipe:      recipe.Name,
		Machines:    machineCount,
		MachineType: machineType,
		RatePerMin:  roundTo(actualRate*60, 1),
		BeltTier:    beltTierForRate(actualRate),
		PowerKW:     roundTo(machinePowerKW*float64(machineCount), 1),
	}

	// Recurse into ingredients
	// Ingredient consumption rate = machines * (effectiveSpeed / craftTime) * ingredientAmount
	// Note: productivity does NOT affect ingredient consumption
	craftsPerSecTotal := float64(machineCount) * effectiveSpeed / craftTime

	for _, ing := range recipe.Ingredients {
		ingRatePerSec := craftsPerSecTotal * ing.Amount
		child := ctx.buildTree(ing.Name, ingRatePerSec)
		if child != nil {
			node.Children = append(node.Children, child)
		}
	}

	return node
}

func (ctx *ratioContext) findMachine(category string) *data.CraftingMachine {
	// Try the preferred assembler tier first
	if m, ok := data.Machines[ctx.assemblerTier]; ok {
		for _, cat := range m.CraftingCategories {
			if cat == category {
				return &m
			}
		}
	}
	// Fallback: find any machine that handles this category
	for _, m := range data.Machines {
		for _, cat := range m.CraftingCategories {
			if cat == category {
				m := m // capture loop var
				return &m
			}
		}
	}
	return nil
}

func findRecipeFor(item string) (*data.Recipe, float64) {
	// Find the simplest recipe that produces this item.
	// Prefer recipes where the item is the primary (first) result.
	var best *data.Recipe
	var bestAmount float64

	for _, r := range data.Recipes {
		for i, prod := range r.Results {
			if prod.Name == item && prod.Amount > 0 {
				r := r // capture loop var
				amount := prod.Amount * prod.Probability
				// Prefer first-result recipes, then by name (deterministic)
				if best == nil || (i == 0 && bestAmount == 0) || r.Name == item {
					best = &r
					bestAmount = amount
				}
			}
		}
	}
	return best, bestAmount
}

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

	// Factorio 2.0: each beacon transmits effect * dist_eff / sqrt(n)
	// Total = beaconCount * moduleSpeedPerBeacon * distEfficiency / sqrt(beaconCount)
	return float64(beaconCount) * moduleSpeedPerBeacon * distEfficiency / math.Sqrt(float64(beaconCount))
}

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

func parsePowerKW(machine *data.CraftingMachine) float64 {
	if machine == nil {
		return 0
	}
	s := machine.EnergyUsage
	s = strings.TrimSpace(s)

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
	var v float64
	for _, c := range s {
		if c >= '0' && c <= '9' {
			v = v*10 + float64(c-'0')
		} else if c == '.' {
			// Simple: just parse normally
			break
		}
	}
	// Use proper parsing for decimal support
	f := 0.0
	if err := json.Unmarshal([]byte(s), &f); err != nil {
		return v
	}
	return f
}

func roundTo(v float64, decimals int) float64 {
	shift := math.Pow(10, float64(decimals))
	return math.Round(v*shift) / shift
}
