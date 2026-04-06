package main

import (
	"encoding/json"
	"math"
	"os"
	"slices"
	"sort"

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

// ─── Internal Diagnosis Types ───────────────────────────────────────────────

type itemDiagnosis struct {
	Item             string           `json:"item"`
	Produced         float64          `json:"produced_per_min"`
	Consumed         float64          `json:"consumed_per_min"`
	RealConsumed     float64          `json:"real_consumed"`
	RecyclerConsumed float64          `json:"recycler_consumed"`
	NetRate          float64          `json:"net_rate"`
	Severity         string           `json:"severity"` // "critical", "severe", "moderate", "healthy", "surplus"
	Consumers        []recipeConsumer `json:"consumers,omitempty"`
	MachineGap       *machineGapInfo  `json:"machine_gap,omitempty"`
	RootCause        *rootCauseInfo   `json:"root_cause,omitempty"`
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

// ─── Output Types (v4 bottleneck tree) ─────────────────────────────────────

type bottleneckTree struct {
	RootItem       string             `json:"root_item"`
	BottleneckType string             `json:"bottleneck_type"`
	Severity       string             `json:"severity"`
	NetRate        float64            `json:"net_rate"`
	Produced       float64            `json:"produced_per_min"`
	Consumed       float64            `json:"consumed_per_min"`
	Consumers      []recipeConsumer   `json:"consumers,omitempty"`
	MachineGap     *machineGapInfo    `json:"machine_gap,omitempty"`
	Affected       []affectedItem     `json:"affected"`
	FixableFrom    []fixableFromEntry `json:"fixable_from"`
	Tech           []inlineTech       `json:"tech"`
}

type affectedItem struct {
	Item     string  `json:"item"`
	NetRate  float64 `json:"net_rate"`
	Severity string  `json:"severity"`
}

type fixableFromEntry struct {
	Item        string  `json:"item"`
	SurplusRate float64 `json:"surplus_rate"`
}

type inlineTech struct {
	Tech            string   `json:"tech"`
	RecipesUnlocked []string `json:"recipes_unlocked"`
	InputsAvailable bool     `json:"inputs_available"`
}

type independentProblem struct {
	Item           string          `json:"item"`
	Severity       string          `json:"severity"`
	NetRate        float64         `json:"net_rate"`
	Produced       float64         `json:"produced_per_min"`
	Consumed       float64         `json:"consumed_per_min"`
	BottleneckType string          `json:"bottleneck_type"`
	MachineGap     *machineGapInfo `json:"machine_gap,omitempty"`
}

type flowSummary struct {
	BottleneckCount  int `json:"bottleneck_count"`
	IndependentCount int `json:"independent_count"`
	ActiveCount      int `json:"active_count"`
	CriticalCount    int `json:"critical_count"`
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

	// Build set of Lua-flagged top deficits for severity boosting
	topDeficitSet := make(map[string]bool, len(q.FlowData.TopDeficits))
	for _, item := range q.FlowData.TopDeficits {
		topDeficitSet[item] = true
	}

	// Analyze items and fluids
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
	techRecs := computeTechRecommendations(itemDiagnoses, fluidDiagnoses, completedTechs, q.FlowData)

	// Compute surplus-to-deficit connections (internal helper, not in output)
	surplusConns := computeSurplusConnections(itemDiagnoses, fluidDiagnoses, consumerIndex, q.ExistingMachines)

	// Build bottleneck tree output
	bottlenecks, independent, remainingTech, summary := buildBottleneckTrees(
		itemDiagnoses, fluidDiagnoses, surplusConns, techRecs, q.FlowData,
	)

	result := map[string]any{
		"summary":              summary,
		"bottlenecks":          bottlenecks,
		"independent":          independent,
		"tech_recommendations": remainingTech,
	}

	writeResult(enc, result)
}

// severityOrder returns a sort rank for severity (lower = more severe).
func severityOrder(s string) int {
	switch s {
	case "critical":
		return 0
	case "severe":
		return 1
	case "moderate":
		return 2
	case "healthy":
		return 3
	case "surplus":
		return 4
	default:
		return 5
	}
}

// buildBottleneckTrees groups diagnoses by root cause into bottleneck trees and
// independent problems. It folds surplus connections and tech recommendations
// into the trees and returns leftover tech recs that didn't match any tree.
func buildBottleneckTrees(
	itemDiag, fluidDiag []itemDiagnosis,
	surplusConns []surplusConnection,
	techRecs []techRecommendation,
	flow *actualFlow,
) ([]bottleneckTree, []independentProblem, []techRecommendation, flowSummary) {
	// Combine all diagnoses
	allDiag := make([]itemDiagnosis, 0, len(itemDiag)+len(fluidDiag))
	allDiag = append(allDiag, itemDiag...)
	allDiag = append(allDiag, fluidDiag...)

	// Build diagnosis lookup by item name
	diagByItem := make(map[string]*itemDiagnosis, len(allDiag))
	for i := range allDiag {
		diagByItem[allDiag[i].Item] = &allDiag[i]
	}

	// Group deficit items by root_cause.root_item
	// rootGroups maps root_item_name → list of diagnosis pointers whose root_cause.root_item == that name
	rootGroups := make(map[string][]*itemDiagnosis)
	for i := range allDiag {
		d := &allDiag[i]
		if d.RootCause == nil {
			continue // healthy/surplus — excluded
		}
		rootGroups[d.RootCause.RootItem] = append(rootGroups[d.RootCause.RootItem], d)
	}

	// Compute summary counts
	activeCount := len(allDiag)
	criticalCount := 0
	for i := range allDiag {
		if allDiag[i].Severity == "critical" {
			criticalCount++
		}
	}

	// Build bottleneck trees and independent problems
	trees := make([]bottleneckTree, 0)
	indep := make([]independentProblem, 0)
	processedRoots := make(map[string]bool)

	for rootItem, group := range rootGroups {
		if processedRoots[rootItem] {
			continue
		}
		processedRoots[rootItem] = true

		// Find the root item's own diagnosis
		rootDiag := diagByItem[rootItem]

		if len(group) == 1 && group[0].Item == rootItem {
			// Only itself → independent problem
			d := group[0]
			indep = append(indep, independentProblem{
				Item:           d.Item,
				Severity:       d.Severity,
				NetRate:        d.NetRate,
				Produced:       d.Produced,
				Consumed:       d.Consumed,
				BottleneckType: d.RootCause.BottleneckType,
				MachineGap:     d.MachineGap,
			})
			continue
		}

		// Multiple members or root != self for some members → bottleneck tree
		var tree bottleneckTree
		if rootDiag != nil {
			tree = bottleneckTree{
				RootItem:       rootItem,
				BottleneckType: rootDiag.RootCause.BottleneckType,
				Severity:       rootDiag.Severity,
				NetRate:        rootDiag.NetRate,
				Produced:       rootDiag.Produced,
				Consumed:       rootDiag.Consumed,
				Consumers:      rootDiag.Consumers,
				MachineGap:     rootDiag.MachineGap,
				Affected:       make([]affectedItem, 0),
				FixableFrom:    make([]fixableFromEntry, 0),
				Tech:           make([]inlineTech, 0),
			}
		} else {
			// Root item doesn't exist as a diagnosis — create synthetic entry from flow data
			var produced, consumed, netRate float64
			var severity string
			if stats, ok := flow.Items[rootItem]; ok {
				produced = stats.ProducedPerMin
				consumed = stats.ConsumedPerMin
				netRate = roundTo(produced-consumed, 1)
			} else if stats, ok := flow.Fluids[rootItem]; ok {
				produced = stats.ProducedPerMin
				consumed = stats.ConsumedPerMin
				netRate = roundTo(produced-consumed, 1)
			}
			severity = classifySeverity(produced, consumed, netRate)

			// Get bottleneck type from any group member's root cause
			bnType := "throughput"
			for _, d := range group {
				if d.RootCause != nil {
					bnType = d.RootCause.BottleneckType
					break
				}
			}

			tree = bottleneckTree{
				RootItem:       rootItem,
				BottleneckType: bnType,
				Severity:       severity,
				NetRate:        netRate,
				Produced:       produced,
				Consumed:       consumed,
				Affected:       make([]affectedItem, 0),
				FixableFrom:    make([]fixableFromEntry, 0),
				Tech:           make([]inlineTech, 0),
			}
		}

		// Build affected list from non-root members
		for _, d := range group {
			if d.Item == rootItem {
				continue
			}
			tree.Affected = append(tree.Affected, affectedItem{
				Item:     d.Item,
				NetRate:  d.NetRate,
				Severity: d.Severity,
			})
		}

		// Sort affected by severity then net_rate
		sort.Slice(tree.Affected, func(i, j int) bool {
			si := severityOrder(tree.Affected[i].Severity)
			sj := severityOrder(tree.Affected[j].Severity)
			if si != sj {
				return si < sj
			}
			return tree.Affected[i].NetRate < tree.Affected[j].NetRate
		})

		trees = append(trees, tree)
	}

	// Fold surplus connections into bottleneck trees as fixable_from
	// Build set of all items in each tree (root + affected) for matching
	type treeIndex struct {
		idx   int
		items map[string]bool
	}
	treeIndexes := make([]treeIndex, len(trees))
	for i := range trees {
		items := map[string]bool{trees[i].RootItem: true}
		for _, a := range trees[i].Affected {
			items[a.Item] = true
		}
		treeIndexes[i] = treeIndex{idx: i, items: items}
	}

	for _, sc := range surplusConns {
		for _, ti := range treeIndexes {
			if !ti.items[sc.Deficit] {
				continue
			}
			// Deduplicate by surplus item name
			alreadyExists := false
			for _, f := range trees[ti.idx].FixableFrom {
				if f.Item == sc.Surplus {
					alreadyExists = true
					break
				}
			}
			if !alreadyExists {
				trees[ti.idx].FixableFrom = append(trees[ti.idx].FixableFrom, fixableFromEntry{
					Item:        sc.Surplus,
					SurplusRate: sc.SurplusRate,
				})
			}
		}
	}

	// Fold tech recommendations into bottleneck trees
	techUsed := make(map[int]bool) // index into techRecs that were folded
	for i, rec := range techRecs {
		for j := range trees {
			if !slices.Contains(rec.DeficitItems, trees[j].RootItem) {
				continue
			}
			trees[j].Tech = append(trees[j].Tech, inlineTech{
				Tech:            rec.Tech,
				RecipesUnlocked: rec.RecipesUnlocked,
				InputsAvailable: rec.InputsAvailable,
			})
			techUsed[i] = true
		}
	}

	// Remaining tech recs that weren't folded into any tree
	remainingTech := make([]techRecommendation, 0)
	for i, rec := range techRecs {
		if !techUsed[i] {
			remainingTech = append(remainingTech, rec)
		}
	}

	// Sort bottlenecks by severity then absolute net_rate descending, with name tiebreaker for determinism
	sort.Slice(trees, func(i, j int) bool {
		si := severityOrder(trees[i].Severity)
		sj := severityOrder(trees[j].Severity)
		if si != sj {
			return si < sj
		}
		ai, aj := math.Abs(trees[i].NetRate), math.Abs(trees[j].NetRate)
		if ai != aj {
			return ai > aj
		}
		return trees[i].RootItem < trees[j].RootItem
	})

	// Sort independent same way
	sort.Slice(indep, func(i, j int) bool {
		si := severityOrder(indep[i].Severity)
		sj := severityOrder(indep[j].Severity)
		if si != sj {
			return si < sj
		}
		ai, aj := math.Abs(indep[i].NetRate), math.Abs(indep[j].NetRate)
		if ai != aj {
			return ai > aj
		}
		return indep[i].Item < indep[j].Item
	})

	summary := flowSummary{
		BottleneckCount:  len(trees),
		IndependentCount: len(indep),
		ActiveCount:      activeCount,
		CriticalCount:    criticalCount,
	}

	return trees, indep, remainingTech, summary
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

// consumerIndex is built once at init from the static data.Recipes map.
// Maps item/fluid name → recipes that consume it.
var consumerIndex map[string][]recipeConsumerEntry

// productRecipeIndex maps product name → disabled recipes that produce it.
// Used by computeTechRecommendations to avoid scanning all recipes per query.
var productRecipeIndex map[string][]productRecipeEntry

type productRecipeEntry struct {
	recipe *data.Recipe
}

func init() {
	// Build consumer index
	consumerIndex = make(map[string][]recipeConsumerEntry)
	for _, recipe := range data.Recipes {
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
			consumerIndex[ing.Name] = append(consumerIndex[ing.Name], recipeConsumerEntry{
				RecipeName:  recipe.Name,
				Product:     primaryProduct,
				Amount:      ing.Amount,
				ResultAmt:   primaryAmount,
				IsRecycling: isRecycling,
				EnergyReq:   energyReq,
			})
		}
	}

	// Build product → disabled recipe index for tech recommendations
	productRecipeIndex = make(map[string][]productRecipeEntry)
	for _, recipe := range data.Recipes {
		if recipe.Enabled {
			continue
		}
		for _, prod := range recipe.Results {
			r := recipe
			productRecipeIndex[prod.Name] = append(productRecipeIndex[prod.Name], productRecipeEntry{
				recipe: &r,
			})
		}
	}
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
		setup, running := machines.ByRecipe[entry.RecipeName]
		if !running {
			continue
		}

		// Estimate how much of this item the recipe consumes.
		// Primary method: derive from the product's actual production rate.
		// Fallback: if product has zero production (items consumed immediately,
		// e.g. concrete/landfill placed as terrain), estimate from machine throughput.
		var consumptionRate float64
		productRate := lookupProductionRate(entry.Product, flow)
		if productRate > 0 && entry.ResultAmt > 0 {
			consumptionRate = (entry.Amount / entry.ResultAmt) * productRate
		} else if setup.Count > 0 {
			// Fallback: machine_count × per-machine consumption rate
			machine, machineOK := data.Machines[setup.MachineType]
			if machineOK {
				speedBonus, _, _ := resolveModuleEffects(expandModules(setup.Modules))
				craftingSpeed := machine.CraftingSpeed * (1 + speedBonus)
				if craftingSpeed < 0.01 {
					craftingSpeed = 0.01
				}
				craftTime := entry.EnergyReq
				if craftTime <= 0 {
					craftTime = 0.5
				}
				consumptionRate = float64(setup.Count) * (craftingSpeed / craftTime) * entry.Amount * 60
			}
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
				BottleneckType: classifyBottleneck(chain, recipe, machines),
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

		// Check each ingredient — find the one with the worst deficit (most negative net rate)
		// for stable, informative root cause chains regardless of ingredient ordering.
		var starvedIngredient string
		worstNet := 0.0
		for _, ing := range recipe.Ingredients {
			if visited[ing.Name] {
				continue // avoid cycles
			}
			ingNet := lookupNetRate(ing.Name, flow)
			if ingNet < -0.1 && ingNet < worstNet {
				starvedIngredient = ing.Name
				worstNet = ingNet
			}
		}

		if starvedIngredient == "" {
			// All inputs are healthy — this item is the throughput bottleneck
			return &rootCauseInfo{
				Chain:          chain,
				RootItem:       current,
				BottleneckType: classifyBottleneck(chain, recipe, machines),
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
func classifyBottleneck(chain []string, recipe *data.Recipe, machines *existingMachines) string {
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

// ─── Surplus Connections ───────────────────────────────────────────────────

type surplusConnection struct {
	Surplus     string  `json:"surplus"`
	SurplusRate float64 `json:"surplus_rate"`
	Deficit     string  `json:"deficit"`
	Recipe      string  `json:"recipe"`
}

// computeSurplusConnections finds direct 1-hop links from surplus items to deficit items
// through recipes that are actually running in the factory.
func computeSurplusConnections(itemDiag, fluidDiag []itemDiagnosis, consumerIndex map[string][]recipeConsumerEntry, machines *existingMachines) []surplusConnection {
	if machines == nil {
		return []surplusConnection{}
	}

	// Build deficit set
	deficitItems := make(map[string]bool)
	for _, diags := range [][]itemDiagnosis{itemDiag, fluidDiag} {
		for _, d := range diags {
			if d.NetRate < -0.1 {
				deficitItems[d.Item] = true
			}
		}
	}

	connections := []surplusConnection{}

	for _, diags := range [][]itemDiagnosis{itemDiag, fluidDiag} {
		for _, d := range diags {
			if d.Severity != "surplus" {
				continue
			}

			consumers, ok := consumerIndex[d.Item]
			if !ok {
				continue
			}

			for _, entry := range consumers {
				// Only running recipes
				if _, running := machines.ByRecipe[entry.RecipeName]; !running {
					continue
				}
				// Only if product is in deficit
				if !deficitItems[entry.Product] {
					continue
				}

				connections = append(connections, surplusConnection{
					Surplus:     d.Item,
					SurplusRate: d.NetRate,
					Deficit:     entry.Product,
					Recipe:      entry.RecipeName,
				})
			}
		}
	}

	// Sort by surplus rate descending for deterministic output
	sort.Slice(connections, func(i, j int) bool {
		return connections[i].SurplusRate > connections[j].SurplusRate
	})

	return connections
}

// ─── Tech Unlock Recommendations ────────────────────────────────────────────

type techRecommendation struct {
	Tech            string   `json:"tech"`
	RecipesUnlocked []string `json:"recipes_unlocked"` // recipe names this tech unlocks that produce deficit items
	DeficitItems    []string `json:"deficit_items"`    // which deficit items those recipes produce
	InputsAvailable bool     `json:"inputs_available"` // are all ingredients of the unlocked recipes currently healthy/surplus?
}

// computeTechRecommendations finds technologies that unlock recipes producing deficit items.
// Groups by tech, lists all relevant recipes and deficit items, and flags whether
// the recipe inputs are available (healthy/surplus in flow data).
func computeTechRecommendations(itemDiag, fluidDiag []itemDiagnosis, completedTechs map[string]bool, flow *actualFlow) []techRecommendation {
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

	// Group by tech: collect all relevant recipes and deficit items per tech
	type techEntry struct {
		recipes     []string
		deficits    []string
		allInputsOK bool
	}
	techMap := make(map[string]*techEntry)

	// Use pre-built product → disabled recipe index instead of scanning all recipes
	for deficitItem := range deficitItems {
		entries, ok := productRecipeIndex[deficitItem]
		if !ok {
			continue
		}

		for _, entry := range entries {
			recipe := entry.recipe
			prod := deficitItem

			techName, ok := techByRecipe[recipe.Name]
			if !ok {
				continue
			}
			if completedTechs[techName] {
				continue
			}

			entry, exists := techMap[techName]
			if !exists {
				entry = &techEntry{allInputsOK: true}
				techMap[techName] = entry
			}

			// Deduplicate recipes and deficit items
			if !slices.Contains(entry.recipes, recipe.Name) {
				entry.recipes = append(entry.recipes, recipe.Name)
			}
			if !slices.Contains(entry.deficits, prod) {
				entry.deficits = append(entry.deficits, prod)
			}

			// Check if all ingredients are available (healthy/surplus)
			for _, ing := range recipe.Ingredients {
				ingNet := lookupNetRate(ing.Name, flow)
				if ingNet < -0.1 {
					entry.allInputsOK = false
				}
			}
		}
	}

	// Convert to sorted slice
	var recs []techRecommendation
	for techName, entry := range techMap {
		sort.Strings(entry.recipes)
		sort.Strings(entry.deficits)
		recs = append(recs, techRecommendation{
			Tech:            techName,
			RecipesUnlocked: entry.recipes,
			DeficitItems:    entry.deficits,
			InputsAvailable: entry.allInputsOK,
		})
	}

	sort.Slice(recs, func(i, j int) bool {
		return recs[i].Tech < recs[j].Tech
	})

	return recs
}
