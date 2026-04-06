package main

import (
	"encoding/json"
	"math"
	"os"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// ─── Input Types ────────────────────────────────────────────────────────────

type productionFlowQuery struct {
	FlowData          *actualFlow        `json:"flow_data"`
	ExistingMachines  *existingMachines  `json:"existing_machines"`
	CompletedResearch *completedResearch `json:"completed_research"`
}

type completedResearch struct {
	Completed []string `json:"completed"`
}

// ─── Output Types ───────────────────────────────────────────────────────────

type itemDiagnosis struct {
	Item             string           `json:"item"`
	Produced         float64          `json:"produced_per_min"`
	Consumed         float64          `json:"consumed_per_min"`
	RealConsumed     float64          `json:"real_consumed"`
	RecyclerConsumed float64          `json:"recycler_consumed"`
	NetRate          float64          `json:"net_rate"`
	Severity         string           `json:"severity"` // "critical", "severe", "moderate", "healthy", "surplus"
	Consumers []recipeConsumer `json:"consumers,omitempty"`
	MachineGap *machineGapInfo `json:"machine_gap,omitempty"`
	RootCause  *rootCauseInfo  `json:"root_cause,omitempty"`
}

type rootCauseInfo struct {
	Chain          []string `json:"chain"`           // items from this item upstream to the root bottleneck
	RootItem       string   `json:"root_item"`       // the item at the end of the chain (the actual bottleneck)
	BottleneckType string   `json:"bottleneck_type"` // "not_built", "input_starvation", "throughput"
}

type machineGapInfo struct {
	MachineType      string  `json:"machine_type"`
	CurrentCount     int     `json:"current_count"`
	EffectiveRate    float64 `json:"effective_rate"`    // items/min from current machines
	AdditionalNeeded int     `json:"additional_needed"` // machines to add to close deficit
	Recipe           string  `json:"recipe"`
}

type recipeConsumer struct {
	Recipe      string  `json:"recipe"`
	Item        string  `json:"item"`         // the downstream product
	Rate        float64 `json:"rate"`         // estimated consumption rate of this item by this recipe
	Percent     float64 `json:"percent"`      // percentage of total consumption
	IsRecycling bool    `json:"is_recycling"` // true if this is a recycling recipe
}

// ─── Handler ────────────────────────────────────────────────────────────────

func handleProductionFlow(enc *json.Encoder, query map[string]any) {
	var q productionFlowQuery
	raw, _ := json.Marshal(query)
	if err := json.Unmarshal(raw, &q); err != nil {
		writeError(enc, "invalid_params", "failed to parse production_flow params: "+err.Error())
		os.Exit(1)
	}

	if q.FlowData == nil {
		writeError(enc, "missing_params", "flow_data is required (pass save_id to inject production_flow section)")
		os.Exit(1)
	}

	// Build reverse recipe index: item → list of recipes that consume it
	consumerIndex := buildConsumerIndex()

	// Build set of Lua-flagged top deficits for severity boosting
	topDeficitSet := make(map[string]bool, len(q.FlowData.TopDeficits))
	for _, item := range q.FlowData.TopDeficits {
		topDeficitSet[item] = true
	}

	// Analyze items
	itemDiagnoses := analyzeFlowEntries(q.FlowData.Items, consumerIndex, q.FlowData, q.ExistingMachines, topDeficitSet)
	fluidDiagnoses := analyzeFlowEntries(q.FlowData.Fluids, consumerIndex, q.FlowData, q.ExistingMachines, topDeficitSet)

	// Build completed tech set from research data
	completedTechs := make(map[string]bool)
	if q.CompletedResearch != nil {
		for _, tech := range q.CompletedResearch.Completed {
			completedTechs[tech] = true
		}
	}

	// Compute tech unlock recommendations for deficit items
	techRecs := computeTechRecommendations(itemDiagnoses, fluidDiagnoses, completedTechs)

	result := map[string]any{
		"item_diagnoses":       itemDiagnoses,
		"fluid_diagnoses":      fluidDiagnoses,
		"tech_recommendations": techRecs,
	}

	writeResult(enc, result)
}

// ─── Consumer Index ─────────────────────────────────────────────────────────

// recipeConsumerEntry maps an ingredient to the recipe and product that consume it.
type recipeConsumerEntry struct {
	RecipeName  string
	Product     string  // primary product of the recipe
	Amount      float64 // amount of ingredient consumed per craft
	ResultAmt   float64 // amount of product produced per craft
	IsRecycling bool    // true if recipe Category == "recycling"
	EnergyReq   float64 // craft time in seconds (for estimating recycler consumption)
}

// buildConsumerIndex builds a map of item/fluid name → recipes that consume it.
func buildConsumerIndex() map[string][]recipeConsumerEntry {
	index := make(map[string][]recipeConsumerEntry)

	for _, recipe := range data.Recipes {
		// Find primary product
		primaryProduct := ""
		primaryAmount := 0.0
		if len(recipe.Results) > 0 {
			primaryProduct = recipe.Results[0].Name
			primaryAmount = recipe.Results[0].Amount * recipe.Results[0].Probability
		}

		isRecycling := recipe.Category == "recycling"
		energyReq := recipe.EnergyRequired
		if energyReq <= 0 {
			energyReq = 0.5
		}

		for _, ing := range recipe.Ingredients {
			index[ing.Name] = append(index[ing.Name], recipeConsumerEntry{
				RecipeName:  recipe.Name,
				Product:     primaryProduct,
				Amount:      ing.Amount,
				ResultAmt:   primaryAmount,
				IsRecycling: isRecycling,
				EnergyReq:   energyReq,
			})
		}
	}

	return index
}

// ─── Recycler Estimation ───────────────────────────────────────────────────

// estimateRecyclerConsumption estimates how much of an item's consumption is
// attributable to recycling machines. For each recycling recipe that consumes
// this item, it checks if machines are running that recipe and computes the
// theoretical consumption rate: machine_count × crafting_speed × (amount / craft_time) × 60.
// Returns 0 if no machines data or no recycling recipes found.
func estimateRecyclerConsumption(item string, consumerIndex map[string][]recipeConsumerEntry, machines *existingMachines) float64 {
	if machines == nil {
		return 0
	}

	consumers, ok := consumerIndex[item]
	if !ok {
		return 0
	}

	total := 0.0
	for _, entry := range consumers {
		if !entry.IsRecycling {
			continue
		}

		setup, ok := machines.ByRecipe[entry.RecipeName]
		if !ok || setup.Count <= 0 {
			continue
		}

		machine, ok := data.Machines[setup.MachineType]
		if !ok {
			continue
		}

		speedBonus, _, _ := resolveModuleEffects(expandModules(setup.Modules))
		craftingSpeed := machine.CraftingSpeed * (1 + speedBonus)
		if craftingSpeed < 0.01 {
			craftingSpeed = 0.01
		}

		// Consumption rate = machines × (craftingSpeed / craftTime) × ingredientAmount × 60
		perMachineRate := (craftingSpeed / entry.EnergyReq) * entry.Amount * 60
		total += float64(setup.Count) * perMachineRate
	}

	return total
}

// ─── Flow Analysis ──────────────────────────────────────────────────────────

func analyzeFlowEntries(entries map[string]flowStats, consumerIndex map[string][]recipeConsumerEntry, flow *actualFlow, machines *existingMachines, topDeficits map[string]bool) []itemDiagnosis {
	diagnoses := make([]itemDiagnosis, 0, len(entries))

	for name, stats := range entries {
		// Filter zero-activity items
		if stats.ProducedPerMin == 0 && stats.ConsumedPerMin == 0 {
			continue
		}

		netRate := roundTo(stats.ProducedPerMin-stats.ConsumedPerMin, 1)

		// Estimate recycler consumption and compute real consumption
		recyclerConsumed := estimateRecyclerConsumption(name, consumerIndex, machines)
		// Cap recycler estimate at actual consumption (can't recycle more than is consumed)
		if recyclerConsumed > stats.ConsumedPerMin {
			recyclerConsumed = stats.ConsumedPerMin
		}
		realConsumed := stats.ConsumedPerMin - recyclerConsumed
		realNetRate := stats.ProducedPerMin - realConsumed

		// Severity is based on real consumption, not recycler-inflated totals
		severity := classifySeverity(stats.ProducedPerMin, realConsumed, roundTo(realNetRate, 1))

		// Boost severity if the Lua mod flagged this as a top deficit.
		// The mod is closer to the data and may detect issues the rate snapshot misses.
		// Only boost if there's a real deficit (not just recycler demand).
		if topDeficits[name] && severity == "moderate" && realNetRate < -0.1 {
			severity = "severe"
		}

		diag := itemDiagnosis{
			Item:             name,
			Produced:         stats.ProducedPerMin,
			Consumed:         stats.ConsumedPerMin,
			RealConsumed:     roundTo(realConsumed, 1),
			RecyclerConsumed: roundTo(recyclerConsumed, 1),
			NetRate:          netRate,
			Severity:         severity,
		}

		// Compute recipe fan-out for deficit items (total deficit, not just real)
		if netRate < -0.1 {
			diag.Consumers = computeRecipeFanOut(name, consumerIndex, flow, machines)
		}

		// Compute machine gap against real deficit only
		realDeficit := math.Abs(math.Min(realNetRate, 0))
		if realDeficit > 0.1 && machines != nil {
			diag.MachineGap = computeMachineGap(name, realDeficit, machines)
		}

		// Compute root cause chain for deficit items
		if netRate < -0.1 {
			diag.RootCause = computeRootCause(name, flow, machines)
		}

		diagnoses = append(diagnoses, diag)
	}

	// Sort: deficits first (most negative), then surpluses
	sort.Slice(diagnoses, func(i, j int) bool {
		return diagnoses[i].NetRate < diagnoses[j].NetRate
	})

	return diagnoses
}

func classifySeverity(produced, consumed, netRate float64) string {
	if consumed > 0 && produced == 0 {
		return "critical"
	}
	if consumed > 0 && netRate < 0 {
		deficitRatio := math.Abs(netRate) / consumed
		if deficitRatio > 0.5 {
			return "severe"
		}
		return "moderate"
	}
	// Surplus classification: only if surplus is significant relative to production
	if produced > 0 && netRate > 0 {
		surplusRatio := netRate / produced
		if surplusRatio > 0.2 {
			return "surplus"
		}
	}
	return "healthy"
}

// ─── Recipe Fan-Out ─────────────────────────────────────────────────────────

func computeRecipeFanOut(item string, consumerIndex map[string][]recipeConsumerEntry, flow *actualFlow, machines *existingMachines) []recipeConsumer {
	if machines == nil {
		return nil
	}

	entries, ok := consumerIndex[item]
	if !ok {
		return nil
	}

	type weightedConsumer struct {
		recipe        string
		product       string
		estimatedRate float64
		isRecycling   bool
	}

	var consumers []weightedConsumer
	totalEstimated := 0.0

	for _, entry := range entries {
		// Only include recipes with machines actually running in the factory.
		if _, running := machines.ByRecipe[entry.RecipeName]; !running {
			continue
		}

		// Estimate how much of this item the recipe consumes based on
		// the actual production rate of its output product.
		productRate := lookupProductionRate(entry.Product, flow)
		if productRate <= 0 {
			continue
		}

		// Consumption rate = (ingredient amount / result amount) * product production rate
		var consumptionRate float64
		if entry.ResultAmt > 0 {
			consumptionRate = (entry.Amount / entry.ResultAmt) * productRate
		}
		if consumptionRate <= 0 {
			continue
		}

		consumers = append(consumers, weightedConsumer{
			recipe:        entry.RecipeName,
			product:       entry.Product,
			estimatedRate: consumptionRate,
			isRecycling:   entry.IsRecycling,
		})
		totalEstimated += consumptionRate
	}

	if len(consumers) == 0 {
		return nil
	}

	// Sort by estimated rate descending
	sort.Slice(consumers, func(i, j int) bool {
		return consumers[i].estimatedRate > consumers[j].estimatedRate
	})

	result := make([]recipeConsumer, 0, len(consumers))
	for _, c := range consumers {
		pct := 0.0
		if totalEstimated > 0 {
			pct = roundTo((c.estimatedRate/totalEstimated)*100, 1)
		}
		result = append(result, recipeConsumer{
			Recipe:      c.recipe,
			Item:        c.product,
			Rate:        roundTo(c.estimatedRate, 1),
			Percent:     pct,
			IsRecycling: c.isRecycling,
		})
	}

	return result
}

func lookupProductionRate(item string, flow *actualFlow) float64 {
	if flow == nil {
		return 0
	}
	if stats, ok := flow.Items[item]; ok {
		return stats.ProducedPerMin
	}
	if stats, ok := flow.Fluids[item]; ok {
		return stats.ProducedPerMin
	}
	return 0
}

// ─── Machine Gap ────────────────────────────────────────────────────────────

// computeMachineGap finds the recipe that produces this item, looks up existing
// machines for that recipe, and computes how many more are needed to close the deficit.
func computeMachineGap(item string, deficitRate float64, machines *existingMachines) *machineGapInfo {
	// Find the recipe that produces this item
	recipe, resultAmt, _ := resolveRecipe(item, "", nil)
	if recipe == nil {
		return nil
	}

	// Look up existing machines for this recipe
	setup, ok := machines.ByRecipe[recipe.Name]
	if !ok {
		return nil
	}

	machine, ok := data.Machines[setup.MachineType]
	if !ok {
		return nil
	}

	// Compute per-machine rate
	speedBonus, prodBonus, _ := resolveModuleEffects(expandModules(setup.Modules))

	craftingSpeed := machine.CraftingSpeed * (1 + speedBonus)
	if craftingSpeed < 0.01 {
		craftingSpeed = 0.01
	}

	craftTime := recipe.EnergyRequired
	if craftTime <= 0 {
		craftTime = 0.5
	}

	if resultAmt <= 0 {
		resultAmt = 1.0
	}
	effectiveOutput := resultAmt * (1 + prodBonus)
	perMachineRate := (craftingSpeed / craftTime) * effectiveOutput * 60 // items/min

	effectiveRate := float64(setup.Count) * perMachineRate
	additionalNeeded := int(math.Ceil(deficitRate / perMachineRate))

	return &machineGapInfo{
		MachineType:      setup.MachineType,
		CurrentCount:     setup.Count,
		EffectiveRate:    roundTo(effectiveRate, 1),
		AdditionalNeeded: additionalNeeded,
		Recipe:           recipe.Name,
	}
}

// ─── Root Cause Chain ──────────────────────────────────────────────────────

// computeRootCause walks upstream through recipe ingredients to find the root
// bottleneck for a deficit item. Returns the chain of items from this item to
// the root, plus a bottleneck type classification.
func computeRootCause(item string, flow *actualFlow, machines *existingMachines) *rootCauseInfo {
	chain := []string{item}
	visited := map[string]bool{item: true}
	current := item

	for {
		// Find the recipe that produces this item
		recipe, _, _ := resolveRecipe(current, "", nil)
		if recipe == nil {
			// No recipe produces this item — it's a raw resource or unknown.
			return &rootCauseInfo{
				Chain:          chain,
				RootItem:       current,
				BottleneckType: classifyBottleneck(current, chain, recipe, machines),
			}
		}

		// Check if machines exist for this recipe
		if machines != nil {
			if _, running := machines.ByRecipe[recipe.Name]; !running {
				return &rootCauseInfo{
					Chain:          chain,
					RootItem:       current,
					BottleneckType: "not_built",
				}
			}
		}

		// Check each ingredient — is any in deficit?
		var starvedIngredient string
		for _, ing := range recipe.Ingredients {
			if visited[ing.Name] {
				continue // avoid cycles
			}
			ingNet := lookupNetRate(ing.Name, flow)
			if ingNet < -0.1 {
				starvedIngredient = ing.Name
				break
			}
		}

		if starvedIngredient == "" {
			// All inputs are healthy — this item is the throughput bottleneck
			return &rootCauseInfo{
				Chain:          chain,
				RootItem:       current,
				BottleneckType: classifyBottleneck(current, chain, recipe, machines),
			}
		}

		// An upstream ingredient is starved — follow the chain
		visited[starvedIngredient] = true
		chain = append(chain, starvedIngredient)
		current = starvedIngredient
	}
}

// classifyBottleneck determines why the root item is the bottleneck.
// - If the chain has multiple items, the original item is input-starved.
// - If the root item has no machines, it's not_built.
// - If the root item has machines and all inputs are healthy, it's throughput.
func classifyBottleneck(_ string, chain []string, recipe *data.Recipe, machines *existingMachines) string {
	// If we traced upstream past the original item, the original is input-starved
	if len(chain) > 1 {
		return "input_starvation"
	}
	// No recipe → raw resource or unknown
	if recipe == nil {
		return "not_built"
	}
	// Has machines → throughput problem
	if machines != nil {
		if _, running := machines.ByRecipe[recipe.Name]; running {
			return "throughput"
		}
		return "not_built"
	}
	// No machines data → can't tell, default to throughput
	return "throughput"
}

// lookupNetRate returns produced - consumed for an item across items and fluids.
func lookupNetRate(item string, flow *actualFlow) float64 {
	if flow == nil {
		return 0
	}
	if stats, ok := flow.Items[item]; ok {
		return stats.ProducedPerMin - stats.ConsumedPerMin
	}
	if stats, ok := flow.Fluids[item]; ok {
		return stats.ProducedPerMin - stats.ConsumedPerMin
	}
	return 0
}

// ─── Tech Unlock Recommendations ────────────────────────────────────────────

type techRecommendation struct {
	Tech           string `json:"tech"`
	RecipeUnlocked string `json:"recipe_unlocked"`
	DeficitItem    string `json:"deficit_item"`
	Impact         string `json:"impact"` // human-readable description
}

// computeTechRecommendations finds technologies that unlock recipes producing deficit items.
// For each critical/severe deficit, checks if there are disabled recipes that produce the
// deficit item, then finds which tech unlocks each such recipe.
// completedTechs filters out already-researched technologies.
func computeTechRecommendations(itemDiag, fluidDiag []itemDiagnosis, completedTechs map[string]bool) []techRecommendation {
	// Build tech → unlocked recipes index
	techByRecipe := make(map[string]string) // recipe name → tech name
	for _, tech := range data.Technologies {
		for _, recipeName := range tech.Effects {
			techByRecipe[recipeName] = tech.Name
		}
	}

	// Collect deficit items
	deficitItems := make(map[string]bool)
	for _, d := range itemDiag {
		if d.Severity == "critical" || d.Severity == "severe" {
			deficitItems[d.Item] = true
		}
	}
	for _, d := range fluidDiag {
		if d.Severity == "critical" || d.Severity == "severe" {
			deficitItems[d.Item] = true
		}
	}

	if len(deficitItems) == 0 {
		return []techRecommendation{}
	}

	// For each disabled recipe, check if it produces a deficit item
	var recs []techRecommendation
	seen := make(map[string]bool) // avoid duplicate tech+item combos

	for _, recipe := range data.Recipes {
		if recipe.Enabled {
			continue // already available, no tech needed
		}

		for _, prod := range recipe.Results {
			if !deficitItems[prod.Name] {
				continue
			}

			techName, ok := techByRecipe[recipe.Name]
			if !ok {
				continue
			}

			// Skip already-researched technologies
			if completedTechs[techName] {
				continue
			}

			key := techName + ":" + prod.Name
			if seen[key] {
				continue
			}
			seen[key] = true

			recs = append(recs, techRecommendation{
				Tech:           techName,
				RecipeUnlocked: recipe.Name,
				DeficitItem:    prod.Name,
				Impact:         "Unlocks " + formatItemName(recipe.Name) + " recipe, which produces " + formatItemName(prod.Name),
			})
		}
	}

	// Sort by deficit item for deterministic output
	sort.Slice(recs, func(i, j int) bool {
		if recs[i].DeficitItem != recs[j].DeficitItem {
			return recs[i].DeficitItem < recs[j].DeficitItem
		}
		return recs[i].Tech < recs[j].Tech
	})

	return recs
}

// formatItemName converts kebab-case to Title Case for display.
func formatItemName(name string) string {
	parts := strings.Split(name, "-")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, " ")
}

