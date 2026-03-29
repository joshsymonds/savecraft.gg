package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
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
	TargetItem    string            `json:"target_item"`
	TargetRate    float64           `json:"target_rate"` // items per minute
	Recipe        string            `json:"recipe"`      // explicit recipe name (required when ambiguous)
	AssemblerTier string            `json:"assembler_tier"`
	Modules       []string          `json:"modules"`
	BeaconCount   int               `json:"beacon_count"`
	BeaconModules []string          `json:"beacon_modules"`
	Overrides     map[string]string `json:"recipe_overrides"` // item → recipe for intermediate products
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

	overrides := q.Overrides
	if overrides == nil {
		overrides = make(map[string]string)
	}
	// The top-level recipe override goes into the overrides map
	if q.Recipe != "" {
		overrides[q.TargetItem] = q.Recipe
	}

	ctx := &ratioContext{
		assemblerTier:          q.AssemblerTier,
		moduleSpeedBonus:       moduleSpeedBonus,
		moduleProdBonus:        moduleProdBonus,
		moduleConsumptionBonus: moduleConsumptionBonus,
		beaconSpeedBonus:       beaconSpeedBonus,
		rawTotals:              make(map[string]float64),
		totalPowerKW:           0,
		visited:                make(map[string]bool),
		recipeOverrides:        overrides,
	}

	// Verify the target item has a recipe before building the tree
	if !rawMaterials[q.TargetItem] {
		recipe, _, ambiguous := resolveRecipe(q.TargetItem, q.Recipe, q.Overrides)
		if recipe == nil && len(ambiguous) > 0 {
			writeError(enc, "ambiguous_recipe", fmt.Sprintf(
				"multiple recipes produce %q — specify one with the 'recipe' parameter: %v",
				q.TargetItem, ambiguous,
			))
			os.Exit(1)
		}
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
	visited                map[string]bool   // cycle detection
	recipeOverrides        map[string]string  // item → recipe name
}

const maxTreeDepth = 50

func (ctx *ratioContext) buildTree(item string, targetRatePerSec float64) *productionNode {
	return ctx.buildTreeDepth(item, targetRatePerSec, 0)
}

func (ctx *ratioContext) buildTreeDepth(item string, targetRatePerSec float64, depth int) *productionNode {
	if depth > maxTreeDepth {
		ctx.rawTotals[item] += targetRatePerSec
		return &productionNode{
			Item:       item,
			Recipe:     "(depth limit)",
			RatePerMin: roundTo(targetRatePerSec*60, 1),
			BeltTier:   beltTierForRate(targetRatePerSec),
		}
	}

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
	recipe, resultAmount, ambiguous := resolveRecipe(item, "", ctx.recipeOverrides)
	if recipe == nil && len(ambiguous) > 0 {
		// Ambiguous intermediate — treat as raw so the tree completes,
		// but mark it so the AI knows to ask
		ctx.rawTotals[item] += targetRatePerSec
		return &productionNode{
			Item:       item,
			Recipe:     fmt.Sprintf("(ambiguous: %v)", ambiguous),
			RatePerMin: roundTo(targetRatePerSec*60, 1),
			BeltTier:   beltTierForRate(targetRatePerSec),
		}
	}
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
		child := ctx.buildTreeDepth(ing.Name, ingRatePerSec, depth+1)
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

// resolveRecipe finds the recipe for an item. If recipeName is specified, uses that directly.
// If recipe_overrides has a mapping for the item, uses that. Otherwise, looks for an
// unambiguous recipe. Returns (recipe, amount, ambiguous_options).
// If there's exactly one non-recycling recipe, it's unambiguous. If there are multiple,
// returns nil with the list of options so the caller can error with choices.
func resolveRecipe(item, recipeName string, overrides map[string]string) (*data.Recipe, float64, []string) {
	// Explicit recipe name takes priority
	if recipeName == "" {
		recipeName = overrides[item]
	}
	if recipeName != "" {
		if r, ok := data.Recipes[recipeName]; ok {
			for _, prod := range r.Results {
				if prod.Name == item {
					return &r, prod.Amount * prod.Probability, nil
				}
			}
			// Recipe exists but doesn't produce this item — use it anyway
			// (caller specified it explicitly)
			if len(r.Results) > 0 {
				return &r, r.Results[0].Amount * r.Results[0].Probability, nil
			}
		}
		return nil, 0, nil
	}

	// Find all non-recycling recipes that produce this item
	type candidate struct {
		recipe *data.Recipe
		amount float64
	}
	var candidates []candidate
	for _, r := range data.Recipes {
		// Skip recycling recipes — they're not primary production paths
		if strings.HasSuffix(r.Name, "-recycling") {
			continue
		}
		// Skip barrel emptying recipes
		if strings.HasPrefix(r.Name, "empty-") && strings.HasSuffix(r.Name, "-barrel") {
			continue
		}
		for _, prod := range r.Results {
			if prod.Name == item && prod.Amount > 0 {
				r := r
				candidates = append(candidates, candidate{&r, prod.Amount * prod.Probability})
				break
			}
		}
	}

	if len(candidates) == 0 {
		return nil, 0, nil
	}
	if len(candidates) == 1 {
		return candidates[0].recipe, candidates[0].amount, nil
	}

	// Multiple candidates — check if one has the same name as the item (the "primary" recipe)
	for _, c := range candidates {
		if c.recipe.Name == item {
			return c.recipe, c.amount, nil
		}
	}

	// Genuinely ambiguous — return the options sorted for deterministic output
	options := make([]string, len(candidates))
	for i, c := range candidates {
		options[i] = c.recipe.Name
	}
	sort.Strings(options)
	return nil, 0, options
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
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return f
}

func roundTo(v float64, decimals int) float64 {
	shift := math.Pow(10, float64(decimals))
	return math.Round(v*shift) / shift
}
