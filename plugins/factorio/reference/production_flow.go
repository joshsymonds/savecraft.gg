package main

import (
	"encoding/json"
	"math"
	"os"
	"sort"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// ─── Input Types ────────────────────────────────────────────────────────────

type productionFlowQuery struct {
	FlowData         *actualFlow       `json:"flow_data"`
	ExistingMachines *existingMachines `json:"existing_machines"`
}

// ─── Output Types ───────────────────────────────────────────────────────────

type itemDiagnosis struct {
	Item        string          `json:"item"`
	Produced    float64         `json:"produced_per_min"`
	Consumed    float64         `json:"consumed_per_min"`
	NetRate     float64         `json:"net_rate"`
	Severity    string          `json:"severity"` // "critical", "severe", "moderate", "healthy", "surplus"
	Consumers   []recipeConsumer `json:"consumers,omitempty"`
}

type recipeConsumer struct {
	Recipe  string  `json:"recipe"`
	Item    string  `json:"item"`    // the downstream product
	Rate    float64 `json:"rate"`    // estimated consumption rate of this item by this recipe
	Percent float64 `json:"percent"` // percentage of total consumption
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

	// Analyze items
	itemDiagnoses := analyzeFlowEntries(q.FlowData.Items, consumerIndex, q.FlowData)
	fluidDiagnoses := analyzeFlowEntries(q.FlowData.Fluids, consumerIndex, q.FlowData)

	// Compute health score
	healthScore := computeHealthScore(itemDiagnoses, fluidDiagnoses)

	result := map[string]any{
		"health_score":    healthScore,
		"item_diagnoses":  itemDiagnoses,
		"fluid_diagnoses": fluidDiagnoses,
	}

	writeResult(enc, result)
}

// ─── Consumer Index ─────────────────────────────────────────────────────────

// recipeConsumerEntry maps an ingredient to the recipe and product that consume it.
type recipeConsumerEntry struct {
	RecipeName string
	Product    string  // primary product of the recipe
	Amount     float64 // amount of ingredient consumed per craft
	ResultAmt  float64 // amount of product produced per craft
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

		for _, ing := range recipe.Ingredients {
			index[ing.Name] = append(index[ing.Name], recipeConsumerEntry{
				RecipeName: recipe.Name,
				Product:    primaryProduct,
				Amount:     ing.Amount,
				ResultAmt:  primaryAmount,
			})
		}
	}

	return index
}

// ─── Flow Analysis ──────────────────────────────────────────────────────────

func analyzeFlowEntries(entries map[string]flowStats, consumerIndex map[string][]recipeConsumerEntry, flow *actualFlow) []itemDiagnosis {
	diagnoses := make([]itemDiagnosis, 0, len(entries))

	for name, stats := range entries {
		netRate := roundTo(stats.ProducedPerMin-stats.ConsumedPerMin, 1)
		severity := classifySeverity(stats.ProducedPerMin, stats.ConsumedPerMin, netRate)

		diag := itemDiagnosis{
			Item:     name,
			Produced: stats.ProducedPerMin,
			Consumed: stats.ConsumedPerMin,
			NetRate:  netRate,
			Severity: severity,
		}

		// Compute recipe fan-out for deficit items
		if netRate < -0.1 {
			diag.Consumers = computeRecipeFanOut(name, consumerIndex, flow)
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

func computeRecipeFanOut(item string, consumerIndex map[string][]recipeConsumerEntry, flow *actualFlow) []recipeConsumer {
	entries, ok := consumerIndex[item]
	if !ok {
		return nil
	}

	type weightedConsumer struct {
		recipe        string
		product       string
		estimatedRate float64
	}

	var consumers []weightedConsumer
	totalEstimated := 0.0

	for _, entry := range entries {
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
			Recipe:  c.recipe,
			Item:    c.product,
			Rate:    roundTo(c.estimatedRate, 1),
			Percent: pct,
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

// ─── Health Score ────────────────────────────────────────────────────────────

func computeHealthScore(itemDiag, fluidDiag []itemDiagnosis) float64 {
	all := make([]itemDiagnosis, 0, len(itemDiag)+len(fluidDiag))
	all = append(all, itemDiag...)
	all = append(all, fluidDiag...)

	if len(all) == 0 {
		return 100
	}

	// Count active items (have production or consumption)
	activeItems := 0
	criticalCount := 0
	severeCount := 0
	moderateCount := 0

	for _, d := range all {
		if d.Produced == 0 && d.Consumed == 0 {
			continue
		}
		activeItems++

		switch d.Severity {
		case "critical":
			criticalCount++
		case "severe":
			severeCount++
		case "moderate":
			moderateCount++
		}
	}

	if activeItems == 0 {
		return 100
	}

	// Score based on proportion of items in deficit states
	// Each critical item is a 25-point deduction, severe 15, moderate 3
	deduction := float64(criticalCount)*25 + float64(severeCount)*15 + float64(moderateCount)*3
	score := 100.0 - deduction

	// Clamp to 0-100
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}

	return math.Round(score)
}
