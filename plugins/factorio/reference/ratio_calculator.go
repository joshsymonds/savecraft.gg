package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// itemRecipes maps item names to the non-recycling, non-barrel recipes that produce them.
// Built once at init from the static data.Recipes map.
var itemRecipes map[string][]itemRecipeEntry

type itemRecipeEntry struct {
	recipe *data.Recipe
	amount float64 // product amount * probability
}

func init() {
	itemRecipes = make(map[string][]itemRecipeEntry)
	for _, r := range data.Recipes {
		if strings.HasSuffix(r.Name, "-recycling") {
			continue
		}
		if strings.HasPrefix(r.Name, "empty-") && strings.HasSuffix(r.Name, "-barrel") {
			continue
		}
		for _, prod := range r.Results {
			if prod.Amount > 0 {
				r := r
				itemRecipes[prod.Name] = append(itemRecipes[prod.Name], itemRecipeEntry{
					recipe: &r,
					amount: prod.Amount * prod.Probability,
				})
			}
		}
	}
}

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

	// Optional save data — injected by worker when save_id is present,
	// or passed inline by the LLM.
	ExistingMachines *existingMachines `json:"existing_machines"`
	ActualFlow       *actualFlow       `json:"actual_flow"`
}

type existingMachines struct {
	ByRecipe    map[string]existingSetup `json:"by_recipe"`
	ByType      map[string]int           `json:"by_type"`
	BeaconCount int                      `json:"beacon_count"`
}

type existingSetup struct {
	MachineType string         `json:"machine_type"`
	Count       int            `json:"count"`
	Modules     map[string]int `json:"modules"` // module_name → count per machine
}

type actualFlow struct {
	Items        map[string]flowStats `json:"items"`
	Fluids       map[string]flowStats `json:"fluids"`
	TopDeficits  []string             `json:"top_deficits"`
	TopSurpluses []string             `json:"top_surpluses"`
}

type flowStats struct {
	ProducedPerMin float64 `json:"produced_per_min"`
	ConsumedPerMin float64 `json:"consumed_per_min"`
}

// ─── DAG Output Types ───────────────────────────────────────────────────────

type productionStage struct {
	ID           string  `json:"id"`
	Item         string  `json:"item"`
	Recipe       string  `json:"recipe"`
	MachineType  string  `json:"machine_type"`
	MachineCount int     `json:"machine_count"`
	RatePerMin   float64 `json:"rate_per_min"`
	BeltTier     string  `json:"belt_tier"`
	PowerKW      float64 `json:"power_kw"`

	// Comparison fields — only present when existing_machines is provided.
	Existing    *existingInfo `json:"existing,omitempty"`
	DeficitRate float64       `json:"deficit_rate,omitempty"`
	Status      string        `json:"status,omitempty"`
}

type existingInfo struct {
	MachineType   string         `json:"machine_type"`
	Count         int            `json:"count"`
	Modules       map[string]int `json:"modules"`
	EffectiveRate float64        `json:"effective_rate"` // items/min from real tier+modules
	ActualRate    float64        `json:"actual_rate"`    // from production_flow (0 if unavailable)
}

type bottleneck struct {
	Item         string  `json:"item"`
	Recipe       string  `json:"recipe"`
	NeededRate   float64 `json:"needed_rate"`
	ExistingRate float64 `json:"existing_rate"`
	ActualRate   float64 `json:"actual_rate"`
	Diagnosis    string  `json:"diagnosis"` // "missing", "underbuilt", "underthroughput", "wrong_modules"
}

type productionFlow struct {
	Source     string  `json:"source"`
	Target     string  `json:"target"`
	Item       string  `json:"item"`
	RatePerMin float64 `json:"rate_per_min"`
}

// ─── DAG Builder ────────────────────────────────────────────────────────────
//
// Builds a DAG instead of a tree so shared inputs (like iron-plate feeding
// multiple recipes) appear once with merged machine counts.
//
// Phase 1 (resolve): DFS to discover recipe graph structure.
// Phase 2 (propagate): Topological order rate propagation.

type dagBuilder struct {
	// Recipe graph (populated by resolve)
	nodes map[string]*dagNode
	edges []dagEdge // consumer → ingredient relationships

	// Config
	assemblerTier          string
	moduleSpeedBonus       float64
	moduleProdBonus        float64
	moduleConsumptionBonus float64
	beaconSpeedBonus       float64
	recipeOverrides        map[string]string

	// DFS state for resolve phase
	resolving map[string]bool
}

type dagNode struct {
	item      string
	recipe    *data.Recipe
	resultAmt float64
	isRaw     bool
	rawLabel  string // "(raw)", "(cycle)", "(ambiguous: ...)", etc.
}

type dagEdge struct {
	consumer   string  // item being crafted
	ingredient string  // item consumed
	amount     float64 // ingredient amount per craft of consumer
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

	// Verify the target item has a recipe before building the DAG
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

	b := &dagBuilder{
		nodes:                  make(map[string]*dagNode),
		assemblerTier:          q.AssemblerTier,
		moduleSpeedBonus:       moduleSpeedBonus,
		moduleProdBonus:        moduleProdBonus,
		moduleConsumptionBonus: moduleConsumptionBonus,
		beaconSpeedBonus:       beaconSpeedBonus,
		recipeOverrides:        overrides,
		resolving:              make(map[string]bool),
	}

	// Phase 1: Resolve recipe graph structure
	b.resolve(q.TargetItem, 0)

	// Phase 2: Propagate rates in topological order and compute stages/flows
	stages, flows, rawTotals, totalPowerKW := b.propagate(q.TargetItem, q.TargetRate/60.0)

	// Build raw materials summary (sorted for deterministic output)
	var rawSummary []map[string]any
	for item, rate := range rawTotals {
		rawSummary = append(rawSummary, map[string]any{
			"item":         item,
			"rate_per_min": roundTo(rate*60, 1),
			"belt_tier":    beltTierForRate(rate),
		})
	}
	sort.Slice(rawSummary, func(i, j int) bool {
		return rawSummary[i]["item"].(string) < rawSummary[j]["item"].(string)
	})

	// Phase 3+4: Compare against existing factory (only when save data provided)
	var bottlenecks []bottleneck
	if q.ExistingMachines != nil {
		bottlenecks = compareExisting(stages, b, q.ExistingMachines, q.ActualFlow, q.Modules)
	}

	result := map[string]any{
		"stages":         stages,
		"flows":          flows,
		"raw_materials":  rawSummary,
		"total_power_kw": roundTo(totalPowerKW, 1),
		"config": map[string]any{
			"assembler_tier": q.AssemblerTier,
			"modules":        q.Modules,
			"beacon_count":   q.BeaconCount,
			"beacon_modules": q.BeaconModules,
		},
	}
	if bottlenecks != nil {
		result["bottlenecks"] = bottlenecks
	}
	writeResult(enc, result)
}

const maxDepth = 50

// resolve discovers the recipe graph via DFS without computing rates.
func (b *dagBuilder) resolve(item string, depth int) {
	if depth > maxDepth {
		b.nodes[item] = &dagNode{item: item, isRaw: true, rawLabel: "(depth limit)"}
		return
	}

	// Already resolved — don't recurse
	if _, ok := b.nodes[item]; ok {
		return
	}

	// Cycle detection (item currently in DFS stack)
	if b.resolving[item] {
		b.nodes[item] = &dagNode{item: item, isRaw: true, rawLabel: "(cycle)"}
		return
	}
	b.resolving[item] = true
	defer func() { delete(b.resolving, item) }()

	// Raw material
	if rawMaterials[item] {
		b.nodes[item] = &dagNode{item: item, isRaw: true, rawLabel: "(raw)"}
		return
	}

	// Resolve recipe
	recipe, resultAmount, ambiguous := resolveRecipe(item, "", b.recipeOverrides)
	if recipe == nil && len(ambiguous) > 0 {
		b.nodes[item] = &dagNode{item: item, isRaw: true, rawLabel: fmt.Sprintf("(ambiguous: %v)", ambiguous)}
		return
	}
	if recipe == nil {
		b.nodes[item] = &dagNode{item: item, isRaw: true, rawLabel: "(no recipe)"}
		return
	}

	b.nodes[item] = &dagNode{item: item, recipe: recipe, resultAmt: resultAmount}

	// Record edges and resolve ingredients
	for _, ing := range recipe.Ingredients {
		b.edges = append(b.edges, dagEdge{
			consumer:   item,
			ingredient: ing.Name,
			amount:     ing.Amount,
		})
		b.resolve(ing.Name, depth+1)
	}
}

// propagate computes rates in topological order (consumers before producers)
// and returns stages, flows, raw totals, and total power.
func (b *dagBuilder) propagate(root string, targetRatePerSec float64) (
	[]productionStage, []productionFlow, map[string]float64, float64,
) {
	order := b.topoSort(root)
	demand := make(map[string]float64)
	demand[root] = targetRatePerSec

	rawTotals := make(map[string]float64)
	var totalPowerKW float64
	var stages []productionStage
	var flows []productionFlow

	for _, item := range order {
		node := b.nodes[item]
		itemDemand := demand[item]

		if node.isRaw {
			rawTotals[item] += itemDemand
			stages = append(stages, productionStage{
				ID:         item,
				Item:       item,
				Recipe:     node.rawLabel,
				RatePerMin: roundTo(itemDemand*60, 1),
				BeltTier:   beltTierForRate(itemDemand),
			})
			continue
		}

		recipe := node.recipe

		// Find machine
		machine := b.findMachine(recipe.Category)
		machineType := b.assemblerTier
		if machine != nil {
			machineType = machine.Name
		}

		craftingSpeed := 1.0
		if machine != nil {
			craftingSpeed = machine.CraftingSpeed
		}

		// Apply module and beacon speed bonuses
		effectiveSpeed := craftingSpeed * (1 + b.moduleSpeedBonus + b.beaconSpeedBonus)
		if effectiveSpeed < 0.01 {
			effectiveSpeed = 0.01
		}

		// Productivity bonus gives free output
		effectiveOutput := node.resultAmt * (1 + b.moduleProdBonus)

		craftTime := recipe.EnergyRequired
		if craftTime <= 0 {
			craftTime = 0.5
		}
		itemsPerSecPerMachine := (effectiveSpeed / craftTime) * effectiveOutput

		machineCount := int(math.Ceil(itemDemand / itemsPerSecPerMachine))
		if machineCount < 1 {
			machineCount = 1
		}

		actualRate := float64(machineCount) * itemsPerSecPerMachine

		// Power
		powerKW := parsePowerKW(machine)
		machinePowerKW := powerKW * (1 + b.moduleConsumptionBonus)
		if machinePowerKW < powerKW*0.2 {
			machinePowerKW = powerKW * 0.2 // efficiency module floor: 20%
		}
		totalPowerKW += machinePowerKW * float64(machineCount)

		stages = append(stages, productionStage{
			ID:           item,
			Item:         item,
			Recipe:       recipe.Name,
			MachineType:  machineType,
			MachineCount: machineCount,
			RatePerMin:   roundTo(actualRate*60, 1),
			BeltTier:     beltTierForRate(actualRate),
			PowerKW:      roundTo(machinePowerKW*float64(machineCount), 1),
		})

		// Propagate demand to ingredients and record flows.
		// Productivity does NOT affect ingredient consumption.
		craftsPerSecTotal := float64(machineCount) * effectiveSpeed / craftTime
		for _, ing := range recipe.Ingredients {
			ingDemand := craftsPerSecTotal * ing.Amount
			demand[ing.Name] += ingDemand
			flows = append(flows, productionFlow{
				Source:     ing.Name,
				Target:     item,
				Item:       ing.Name,
				RatePerMin: roundTo(ingDemand*60, 1),
			})
		}
	}

	return stages, flows, rawTotals, totalPowerKW
}

// topoSort returns items in topological order: consumers before producers.
// Uses Kahn's algorithm (BFS from nodes with in-degree 0).
func (b *dagBuilder) topoSort(root string) []string {
	// Build in-degree: number of unique consumers for each ingredient
	inDegree := make(map[string]int)
	children := make(map[string][]string) // consumer → unique ingredients
	for item := range b.nodes {
		inDegree[item] = 0
	}

	// Deduplicate edges: track which consumer→ingredient pairs we've seen
	consumerSeen := make(map[string]map[string]bool) // ingredient → set of consumers
	childSeen := make(map[string]map[string]bool)    // consumer → set of ingredients
	for _, e := range b.edges {
		if consumerSeen[e.ingredient] == nil {
			consumerSeen[e.ingredient] = make(map[string]bool)
		}
		if !consumerSeen[e.ingredient][e.consumer] {
			consumerSeen[e.ingredient][e.consumer] = true
			inDegree[e.ingredient]++
		}
		if childSeen[e.consumer] == nil {
			childSeen[e.consumer] = make(map[string]bool)
		}
		if !childSeen[e.consumer][e.ingredient] {
			childSeen[e.consumer][e.ingredient] = true
			children[e.consumer] = append(children[e.consumer], e.ingredient)
		}
	}

	queue := []string{root}
	var order []string
	visited := make(map[string]bool)

	for len(queue) > 0 {
		item := queue[0]
		queue = queue[1:]
		if visited[item] {
			continue
		}
		visited[item] = true
		order = append(order, item)

		for _, child := range children[item] {
			inDegree[child]--
			if inDegree[child] == 0 {
				queue = append(queue, child)
			}
		}
	}

	return order
}

func (b *dagBuilder) findMachine(category string) *data.CraftingMachine {
	if m, ok := data.Machines[b.assemblerTier]; ok {
		for _, cat := range m.CraftingCategories {
			if cat == category {
				return &m
			}
		}
	}
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

	// Look up pre-indexed non-recycling recipes that produce this item
	candidates := itemRecipes[item]
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

// ─── Phase 3+4: Compare Against Existing Factory ───────────────────────────
//
// For each non-raw stage, match against existing machines by recipe name,
// compute effective throughput using real tier+modules, and classify status.

// compareExisting annotates stages with existing factory data and returns
// a sorted bottlenecks array. Modifies stages in place.
func compareExisting(
	stages []productionStage,
	b *dagBuilder,
	existing *existingMachines,
	flow *actualFlow,
	queryModules []string,
) []bottleneck {
	var bns []bottleneck

	for i := range stages {
		stage := &stages[i]

		// Skip raw materials — they don't have machines
		node := b.nodes[stage.Item]
		if node == nil || node.isRaw {
			continue
		}

		recipe := node.recipe
		if recipe == nil {
			continue
		}

		setup, found := existing.ByRecipe[recipe.Name]
		neededRate := stage.RatePerMin

		if !found {
			stage.Status = "missing"
			bns = append(bns, bottleneck{
				Item:       stage.Item,
				Recipe:     stage.Recipe,
				NeededRate: neededRate,
				Diagnosis:  "missing",
			})
			continue
		}

		// Compute effective rate of existing setup
		effectiveRate := computeEffectiveRate(setup, recipe, existing.BeaconCount)

		// Pull actual rate from production flow
		var actualRate float64
		if flow != nil {
			if stats, ok := flow.Items[stage.Item]; ok {
				actualRate = stats.ProducedPerMin
			}
			if stats, ok := flow.Fluids[stage.Item]; ok {
				actualRate = stats.ProducedPerMin
			}
		}

		stage.Existing = &existingInfo{
			MachineType:   setup.MachineType,
			Count:         setup.Count,
			Modules:       setup.Modules,
			EffectiveRate: roundTo(effectiveRate, 1),
			ActualRate:    roundTo(actualRate, 1),
		}

		// Classify status and diagnosis
		if effectiveRate >= neededRate {
			// Machines should be sufficient — check actual throughput
			if actualRate > 0 && actualRate < effectiveRate*0.7 {
				stage.Status = "deficit"
				stage.DeficitRate = roundTo(neededRate-actualRate, 1)
				bns = append(bns, bottleneck{
					Item:         stage.Item,
					Recipe:       stage.Recipe,
					NeededRate:   neededRate,
					ExistingRate: roundTo(effectiveRate, 1),
					ActualRate:   roundTo(actualRate, 1),
					Diagnosis:    "underthroughput",
				})
			} else if setup.Count > stage.MachineCount {
				stage.Status = "surplus"
			} else {
				stage.Status = "sufficient"
			}
		} else {
			// Not enough effective throughput
			stage.Status = "deficit"
			stage.DeficitRate = roundTo(neededRate-effectiveRate, 1)

			// Diagnose: wrong_modules if count would suffice at the query's assumed config
			diagnosis := diagnoseDeficit(stage, b, setup, recipe, queryModules)
			bns = append(bns, bottleneck{
				Item:         stage.Item,
				Recipe:       stage.Recipe,
				NeededRate:   neededRate,
				ExistingRate: roundTo(effectiveRate, 1),
				ActualRate:   roundTo(actualRate, 1),
				Diagnosis:    diagnosis,
			})
		}
	}

	// Sort bottlenecks by deficit magnitude (largest first)
	sort.Slice(bns, func(i, j int) bool {
		di := bns[i].NeededRate - bns[i].ExistingRate
		dj := bns[j].NeededRate - bns[j].ExistingRate
		return di > dj
	})

	return bns
}

// computeEffectiveRate computes items/min from existing machines using their
// real tier and real modules.
func computeEffectiveRate(
	setup existingSetup,
	recipe *data.Recipe,
	beaconCount int,
) float64 {
	machine, ok := data.Machines[setup.MachineType]
	if !ok {
		return 0
	}

	// Expand module map to list: {"speed-module-3": 2} → ["speed-module-3", "speed-module-3"]
	var moduleList []string
	for name, count := range setup.Modules {
		for range count {
			moduleList = append(moduleList, name)
		}
	}

	speedBonus, prodBonus, _ := resolveModuleEffects(moduleList)
	// Note: we don't use beacon effects from the save here because the save
	// only has total beacon count, not per-recipe beacon assignments.
	// TODO: if we get per-recipe beacon data, use it here.
	_ = beaconCount

	craftingSpeed := machine.CraftingSpeed
	effectiveSpeed := craftingSpeed * (1 + speedBonus)
	if effectiveSpeed < 0.01 {
		effectiveSpeed = 0.01
	}

	// Find result amount for the target item in the recipe
	resultAmt := 1.0
	for _, prod := range recipe.Results {
		if prod.Amount > 0 {
			resultAmt = prod.Amount * prod.Probability
			break
		}
	}
	effectiveOutput := resultAmt * (1 + prodBonus)

	craftTime := recipe.EnergyRequired
	if craftTime <= 0 {
		craftTime = 0.5
	}

	itemsPerSecPerMachine := (effectiveSpeed / craftTime) * effectiveOutput
	return float64(setup.Count) * itemsPerSecPerMachine * 60 // convert to items/min
}

// diagnoseDeficit determines why existing machines fall short.
// Compares the existing setup against a hypothetical setup with
// the same count but at the query's assumed tier and modules.
func diagnoseDeficit(
	stage *productionStage,
	b *dagBuilder,
	setup existingSetup,
	recipe *data.Recipe,
	queryModules []string,
) string {
	// Build the hypothetical: same count, query's tier + modules
	queryModuleCounts := make(map[string]int)
	for _, m := range queryModules {
		queryModuleCounts[m]++
	}
	querySetup := existingSetup{
		MachineType: b.assemblerTier,
		Count:       setup.Count,
		Modules:     queryModuleCounts,
	}
	queryRate := computeEffectiveRate(querySetup, recipe, 0)

	if queryRate >= stage.RatePerMin {
		// Same count at query config would work — it's the tier/modules that's wrong
		return "wrong_modules"
	}
	return "underbuilt"
}

// Shared helpers (resolveModuleEffects, resolveBeaconEffects, parsePowerKW,
// beltTierForRate, roundTo) are in helpers.go.
