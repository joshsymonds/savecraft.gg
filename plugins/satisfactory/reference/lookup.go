package main

import (
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/satisfactory/reference/data"
)

const maxMatches = 25

// handCraftBuildings run recipes the player crafts manually; build-gun
// recipes are building construction costs, not production.
func isBuildGun(producedIn []string) bool {
	for _, b := range producedIn {
		if strings.Contains(b, "BuildGun") {
			return true
		}
	}
	return false
}

func isAutomated(producedIn []string) bool {
	for _, b := range producedIn {
		if strings.HasPrefix(b, "Build_") {
			return true
		}
	}
	return false
}

// recipeUnlockTiers maps recipe class -> lowest milestone tier unlocking it.
var recipeUnlockTiers = buildUnlockTiers()

func buildUnlockTiers() map[string]int {
	tiers := map[string]int{}
	for _, s := range data.Schematics {
		if s.Type != "EST_Milestone" && s.Type != "EST_Tutorial" {
			continue
		}
		for _, r := range s.UnlockRecipes {
			if existing, ok := tiers[r]; !ok || s.Tier < existing {
				tiers[r] = s.Tier
			}
		}
	}
	return tiers
}

// matchScore ranks how well a query matches a candidate: exact class name
// or exact display name first, then prefix, then substring.
func matchScore(query, className, displayName string) int {
	q := strings.ToLower(query)
	name := strings.ToLower(displayName)
	switch {
	case query == className || q == name:
		return 3
	case strings.HasPrefix(name, q):
		return 2
	case strings.Contains(name, q):
		return 1
	default:
		return 0
	}
}

type scored[T any] struct {
	score int
	name  string
	value T
}

func rank[T any](matches []scored[T]) []T {
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].score != matches[j].score {
			return matches[i].score > matches[j].score
		}
		return matches[i].name < matches[j].name
	})
	if len(matches) > maxMatches {
		matches = matches[:maxMatches]
	}
	out := make([]T, 0, len(matches))
	for _, m := range matches {
		out = append(out, m.value)
	}
	return out
}

// amountFields renders an ItemAmount with display name and per-minute rate;
// fluid/gas amounts convert from the Docs' native milli-units to m³.
func amountFields(ia data.ItemAmount, durationSec float64) map[string]any {
	item, known := data.Items[ia.ItemClass]
	amount := float64(ia.Amount)
	unit := ""
	if known && (item.Form == "RF_LIQUID" || item.Form == "RF_GAS") {
		amount /= 1000
		unit = "m3"
	}
	name := ia.ItemClass
	if known {
		name = item.DisplayName
	}
	out := map[string]any{
		"item":      name,
		"className": ia.ItemClass,
		"amount":    amount,
	}
	if unit != "" {
		out["unit"] = unit
	}
	if durationSec > 0 {
		out["perMinute"] = round2(amount * 60 / durationSec)
	}
	return out
}

func round2(v float64) float64 { return float64(int(v*100+0.5)) / 100 }

func recipeSummary(r data.Recipe) map[string]any {
	ingredients := make([]map[string]any, 0, len(r.Ingredients))
	for _, ia := range r.Ingredients {
		ingredients = append(ingredients, amountFields(ia, r.DurationSec))
	}
	products := make([]map[string]any, 0, len(r.Products))
	for _, ia := range r.Products {
		products = append(products, amountFields(ia, r.DurationSec))
	}
	buildings := make([]string, 0, len(r.ProducedIn))
	for _, b := range r.ProducedIn {
		if building, ok := data.Buildings[b]; ok {
			buildings = append(buildings, building.DisplayName)
		}
	}
	out := map[string]any{
		"recipe":      r.DisplayName,
		"className":   r.ClassName,
		"alternate":   r.Alternate,
		"durationSec": r.DurationSec,
		"ingredients": ingredients,
		"products":    products,
		"buildings":   buildings,
	}
	if tier, ok := recipeUnlockTiers[r.ClassName]; ok {
		out["unlockTier"] = tier
	}
	if !isAutomated(r.ProducedIn) {
		out["handCraftOnly"] = true
	}
	return out
}

// recipeLookup answers item/recipe/building queries against the generated
// data tables.
func recipeLookup(query map[string]any) (map[string]any, error) {
	itemQ := stringParam(query, "item")
	recipeQ := stringParam(query, "recipe")
	buildingQ := stringParam(query, "building")
	if itemQ == "" && recipeQ == "" && buildingQ == "" {
		return nil, fmt.Errorf("provide at least one of: item, recipe, building")
	}

	result := map[string]any{}
	if itemQ != "" {
		result["items"] = lookupItems(itemQ)
	}
	if recipeQ != "" {
		result["recipes"] = lookupRecipes(recipeQ)
	}
	if buildingQ != "" {
		result["buildings"] = lookupBuildings(buildingQ)
	}
	return result, nil
}

func lookupItems(q string) []map[string]any {
	var matches []scored[map[string]any]
	for _, item := range data.Items {
		score := matchScore(q, item.ClassName, item.DisplayName)
		if score == 0 {
			continue
		}
		matches = append(matches, scored[map[string]any]{score, item.DisplayName, describeItem(item)})
	}
	return rank(matches)
}

func describeItem(item data.Item) map[string]any {
	var producedBy, consumedBy []map[string]any
	for _, r := range sortedRecipes() {
		if isBuildGun(r.ProducedIn) {
			continue
		}
		for _, p := range r.Products {
			if p.ItemClass == item.ClassName {
				producedBy = append(producedBy, recipeSummary(r))
				break
			}
		}
		for _, ing := range r.Ingredients {
			if ing.ItemClass == item.ClassName {
				consumedBy = append(consumedBy, recipeSummary(r))
				break
			}
		}
	}
	out := map[string]any{
		"name":       item.DisplayName,
		"className":  item.ClassName,
		"form":       item.Form,
		"stackSize":  item.StackSize,
		"sinkPoints": item.SinkPoints,
		"producedBy": producedBy,
		"consumedBy": consumedBy,
	}
	if item.EnergyMJ > 0 {
		out["energyMJ"] = item.EnergyMJ
	}
	return out
}

func lookupRecipes(q string) []map[string]any {
	var matches []scored[map[string]any]
	for _, r := range data.Recipes {
		score := matchScore(q, r.ClassName, r.DisplayName)
		if score == 0 {
			continue
		}
		matches = append(matches, scored[map[string]any]{score, r.DisplayName, recipeSummary(r)})
	}
	return rank(matches)
}

func lookupBuildings(q string) []map[string]any {
	var matches []scored[map[string]any]
	for _, b := range data.Buildings {
		score := matchScore(q, b.ClassName, b.DisplayName)
		if score == 0 {
			continue
		}
		matches = append(matches, scored[map[string]any]{score, b.DisplayName, describeBuilding(b)})
	}
	return rank(matches)
}

func describeBuilding(b data.Building) map[string]any {
	out := map[string]any{
		"name":      b.DisplayName,
		"className": b.ClassName,
		"kind":      b.Kind,
	}
	if b.PowerMW > 0 {
		out["powerMW"] = b.PowerMW
	}
	if b.PowerProductionMW > 0 {
		out["powerProductionMW"] = b.PowerProductionMW
	}
	if len(b.FuelClasses) > 0 {
		fuels := make([]string, 0, len(b.FuelClasses))
		for _, f := range b.FuelClasses {
			if item, ok := data.Items[f]; ok {
				fuels = append(fuels, item.DisplayName)
			} else {
				fuels = append(fuels, f)
			}
		}
		out["fuels"] = fuels
	}
	if b.ItemsPerCycle > 0 && b.ExtractCycleSec > 0 {
		out["extractPerMinute"] = round2(float64(b.ItemsPerCycle) * 60 / b.ExtractCycleSec)
	}

	var recipes []string
	for _, r := range sortedRecipes() {
		if slices.Contains(r.ProducedIn, b.ClassName) {
			recipes = append(recipes, r.DisplayName)
		}
	}
	if len(recipes) > 0 {
		out["recipes"] = recipes
	}
	return out
}

// sortedRecipes returns recipes in deterministic class-name order.
func sortedRecipes() []data.Recipe {
	keys := make([]string, 0, len(data.Recipes))
	for k := range data.Recipes {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]data.Recipe, 0, len(keys))
	for _, k := range keys {
		out = append(out, data.Recipes[k])
	}
	return out
}
