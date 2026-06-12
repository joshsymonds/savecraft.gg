package main

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/satisfactory/reference/data"
)

// maxPlanIterations bounds the demand worklist. Items legitimately re-enter
// the worklist when later recipes demand them again; true cycles decay
// geometrically and are cut off by the epsilon below.
const (
	maxPlanIterations = 10000
	demandEpsilon     = 1e-9
)

// planContext carries recipe-selection policy through the expansion.
type planContext struct {
	useAlternates string            // "none" (default), "unlocked", "all"
	unlocked      map[string]bool   // recipe class -> unlocked alternate
	overrides     map[string]string // item class -> forced recipe class
}

// productionPlanner expands a target item + rate into the full production
// chain: machines per recipe, raw resource totals, power, and byproducts.
func productionPlanner(query map[string]any) (map[string]any, error) {
	itemQ := stringParam(query, "item")
	if itemQ == "" {
		return nil, fmt.Errorf("item is required")
	}
	rate, ok := query["rate"].(float64)
	if !ok || rate <= 0 {
		return nil, fmt.Errorf("rate (items per minute, > 0) is required")
	}

	target := resolveItem(itemQ)
	if target == "" {
		return nil, fmt.Errorf("unknown item %q", itemQ)
	}

	ctx := planContext{
		useAlternates: stringParam(query, "use_alternates"),
		unlocked:      unlockedAlternates(query),
		overrides:     recipeOverrides(query),
	}
	if ctx.useAlternates == "" {
		ctx.useAlternates = "none"
	}

	plan, err := expand(target, rate, ctx)
	if err != nil {
		return nil, err
	}
	creditExisting(plan, query)
	return plan, nil
}

// resolveItem finds the single item class for a name or class query.
func resolveItem(q string) string {
	if _, ok := data.Items[q]; ok {
		return q
	}
	lower := strings.ToLower(q)
	exact, substring := "", ""
	for class, item := range data.Items {
		name := strings.ToLower(item.DisplayName)
		if name == lower {
			exact = class
			break
		}
		if strings.Contains(name, lower) && (substring == "" || class < substring) {
			substring = class
		}
	}
	if exact != "" {
		return exact
	}
	return substring
}

// unlockedAlternates resolves the injected progression section (alternate
// schematic class names) into a set of unlocked alternate recipe classes.
func unlockedAlternates(query map[string]any) map[string]bool {
	unlocked := map[string]bool{}
	progression, ok := query["progression"].(map[string]any)
	if !ok {
		return unlocked
	}
	alternates, ok := progression["alternateRecipes"].(map[string]any)
	if !ok {
		return unlocked
	}
	schematics, ok := alternates["schematicClassNames"].([]any)
	if !ok {
		return unlocked
	}
	for _, raw := range schematics {
		name, ok := raw.(string)
		if !ok {
			continue
		}
		if s, ok := data.Schematics[name]; ok {
			for _, r := range s.UnlockRecipes {
				unlocked[r] = true
			}
		}
	}
	return unlocked
}

func recipeOverrides(query map[string]any) map[string]string {
	overrides := map[string]string{}
	raw, ok := query["recipes"].(map[string]any)
	if !ok {
		return overrides
	}
	for item, recipe := range raw {
		if r, ok := recipe.(string); ok {
			overrides[item] = r
		}
	}
	return overrides
}

// chooseRecipe picks the recipe to plan an item with, and lists the
// alternates the policy would also allow.
func chooseRecipe(itemClass string, ctx planContext) (data.Recipe, []string, bool) {
	if forced, ok := ctx.overrides[itemClass]; ok {
		if r, ok := data.Recipes[forced]; ok {
			return r, nil, true
		}
	}

	var base, alternate []data.Recipe
	for _, r := range sortedRecipes() {
		if isBuildGun(r.ProducedIn) || !isAutomated(r.ProducedIn) {
			continue
		}
		producesItem := false
		for _, p := range r.Products {
			if p.ItemClass == itemClass {
				producesItem = true
			}
		}
		if !producesItem {
			continue
		}
		// Skip unpackaging loops: recipes whose primary product is not this
		// item only count when nothing else produces it.
		if r.Alternate {
			alternate = append(alternate, r)
		} else {
			base = append(base, r)
		}
	}

	allowedAlt := func(r data.Recipe) bool {
		switch ctx.useAlternates {
		case "all":
			return true
		case "unlocked":
			return ctx.unlocked[r.ClassName]
		default:
			return false
		}
	}

	var altNames []string
	for _, r := range alternate {
		if ctx.unlocked[r.ClassName] || ctx.useAlternates == "all" {
			altNames = append(altNames, r.DisplayName)
		}
	}

	// Prefer a base recipe whose FIRST product is the item (its canonical
	// recipe), then any base recipe, then an allowed alternate.
	for _, r := range base {
		isPrimary := len(r.Products) > 0 && r.Products[0].ItemClass == itemClass
		if isPrimary && !strings.HasPrefix(r.ClassName, "Recipe_Unpackage") {
			return r, altNames, true
		}
	}
	for _, r := range base {
		if !strings.HasPrefix(r.ClassName, "Recipe_Unpackage") {
			return r, altNames, true
		}
	}
	for _, r := range alternate {
		if allowedAlt(r) {
			return r, altNames, true
		}
	}
	return data.Recipe{}, altNames, false
}

// recipeNode accumulates demand for one recipe across the whole plan.
type recipeNode struct {
	recipe             data.Recipe
	machines           float64
	unlockedAlternates []string
}

// expand walks demand item-by-item, aggregating shared intermediates.
func expand(target string, rate float64, ctx planContext) (map[string]any, error) {
	demand := map[string]float64{target: rate} // item -> items/min still to plan
	planned := map[string]*recipeNode{}        // recipe class -> node
	raw := map[string]float64{}                // raw item -> items/min
	byproducts := map[string]float64{}

	for iteration := 0; ; iteration++ {
		if iteration > maxPlanIterations {
			return nil, fmt.Errorf("plan exceeded %d expansion steps (recipe cycle?)", maxPlanIterations)
		}
		// Pick any pending demand.
		var itemClass string
		for k := range demand {
			itemClass = k
			break
		}
		if itemClass == "" {
			break
		}
		need := demand[itemClass]
		delete(demand, itemClass)
		if need < demandEpsilon {
			continue
		}

		item, known := data.Items[itemClass]
		if known && item.Raw {
			raw[itemClass] += need
			continue
		}

		recipe, altNames, ok := chooseRecipe(itemClass, ctx)
		if !ok {
			// No automated recipe — treat as raw-equivalent input.
			raw[itemClass] += need
			continue
		}

		var perMachine float64
		for _, p := range recipe.Products {
			if p.ItemClass == itemClass {
				perMachine = float64(p.Amount) * 60 / recipe.DurationSec
			}
		}
		if perMachine <= 0 {
			return nil, fmt.Errorf("recipe %s has zero output for %s", recipe.ClassName, itemClass)
		}
		machines := need / perMachine

		node, exists := planned[recipe.ClassName]
		if !exists {
			node = &recipeNode{recipe: recipe, unlockedAlternates: altNames}
			planned[recipe.ClassName] = node
		}
		node.machines += machines

		for _, ing := range recipe.Ingredients {
			demand[ing.ItemClass] += float64(ing.Amount) * 60 / recipe.DurationSec * machines
		}
		for _, p := range recipe.Products {
			if p.ItemClass != itemClass {
				byproducts[p.ItemClass] += float64(p.Amount) * 60 / recipe.DurationSec * machines
			}
		}
	}

	return renderPlan(target, rate, planned, raw, byproducts), nil
}

func renderPlan(
	target string, rate float64,
	planned map[string]*recipeNode, raw, byproducts map[string]float64,
) map[string]any {
	classes := make([]string, 0, len(planned))
	for c := range planned {
		classes = append(classes, c)
	}
	sort.Strings(classes)

	totalPower := 0.0
	machines := make([]map[string]any, 0, len(classes))
	for _, c := range classes {
		node := planned[c]
		entry := map[string]any{
			"recipe":          node.recipe.DisplayName,
			"recipeClassName": node.recipe.ClassName,
			"alternate":       node.recipe.Alternate,
			"machines":        round2(node.machines),
			"machinesCeil":    int(math.Ceil(node.machines - 1e-9)),
		}
		if building := primaryBuilding(node.recipe); building != nil {
			entry["building"] = building.DisplayName
			power := building.PowerMW * node.machines
			entry["powerMW"] = round2(power)
			totalPower += power
		}
		if len(node.unlockedAlternates) > 0 {
			entry["unlockedAlternates"] = node.unlockedAlternates
		}
		machines = append(machines, entry)
	}

	return map[string]any{
		"target":           itemName(target),
		"targetClassName":  target,
		"ratePerMinute":    rate,
		"machinesByRecipe": machines,
		"rawResources":     amountList(raw),
		"byproducts":       amountList(byproducts),
		"totalPowerMW":     round2(totalPower),
		"notes": "Rates assume 100% clock and no somersloops. Machine counts are exact; " +
			"machinesCeil rounds up. Re-plan with the recipes parameter " +
			"({itemClass: recipeClass}) to use an alternate.",
	}
}

func primaryBuilding(r data.Recipe) *data.Building {
	for _, b := range r.ProducedIn {
		if building, ok := data.Buildings[b]; ok {
			return &building
		}
	}
	return nil
}

func itemName(class string) string {
	if item, ok := data.Items[class]; ok {
		return item.DisplayName
	}
	return class
}

func amountList(m map[string]float64) []map[string]any {
	classes := make([]string, 0, len(m))
	for c := range m {
		classes = append(classes, c)
	}
	sort.Slice(classes, func(i, j int) bool { return m[classes[i]] > m[classes[j]] })
	out := make([]map[string]any, 0, len(classes))
	for _, c := range classes {
		amount := m[c]
		entry := map[string]any{"name": itemName(c), "className": c}
		if item, ok := data.Items[c]; ok && (item.Form == "RF_LIQUID" || item.Form == "RF_GAS") {
			entry["perMinute"] = round2(amount / 1000)
			entry["unit"] = "m3"
		} else {
			entry["perMinute"] = round2(amount)
		}
		out = append(out, entry)
	}
	return out
}

// creditExisting annotates plan entries with machines the player already
// has, from the injected production_summary section.
func creditExisting(plan map[string]any, query map[string]any) {
	summary, ok := query["production_summary"].(map[string]any)
	if !ok {
		return
	}
	byRecipe, ok := summary["byRecipe"].([]any)
	if !ok {
		return
	}
	existing := map[string]float64{}
	for _, raw := range byRecipe {
		entry, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		path, _ := entry["recipeClassPath"].(string)
		count, _ := entry["machines"].(float64)
		if path != "" {
			existing[shortClass(path)] = count
		}
	}
	machines, _ := plan["machinesByRecipe"].([]map[string]any)
	for _, m := range machines {
		class, _ := m["recipeClassName"].(string)
		if have, ok := existing[class]; ok {
			m["existingMachines"] = have
		}
	}
}

func shortClass(path string) string {
	if i := strings.LastIndex(path, "."); i >= 0 {
		return path[i+1:]
	}
	return path
}
