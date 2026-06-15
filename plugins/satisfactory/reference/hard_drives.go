package main

import (
	"fmt"
	"sort"

	"github.com/joshsymonds/savecraft.gg/plugins/satisfactory/reference/data"
)

// hardDriveTiers serves the alternate-recipe rankings derived by tools/altrank
// (data.AltRankings). Hard drives found in crash sites unlock random alternate
// recipes at the MAM, so this answers "is this alternate worth it" and "which
// should I prioritize". Two rankings travel with every recipe: effort (favor
// fewer/simpler buildings) and resources (minimize raw extraction). With save
// data it flags which alternates the player has unlocked and recommends the
// best ones they have not.
func hardDriveTiers(query map[string]any) (map[string]any, error) {
	recipeQ := stringParam(query, "recipe")
	itemQ := stringParam(query, "item")
	tierQ := stringParam(query, "tier")
	_, hasProg := query["progression"].(map[string]any)
	unlocked := unlockedAlternates(query)

	result := map[string]any{}
	switch {
	case recipeQ != "":
		result["recipes"] = lookupAltRecipes(recipeQ, unlocked, hasProg)
	case itemQ != "":
		item := resolveItem(itemQ)
		if item == "" {
			return nil, fmt.Errorf("unknown item %q", itemQ)
		}
		result["item"] = itemName(item)
		result["alternates"] = altsForItem(item, unlocked, hasProg)
	case tierQ != "":
		ranking := stringParam(query, "ranking")
		if ranking != "resources" {
			ranking = "effort"
		}
		result["tier"] = tierQ
		result["ranking"] = ranking
		result["recipes"] = altsByTier(tierQ, ranking, unlocked, hasProg)
	default:
		result["byRanking"] = tierOverview()
		result["note"] = "improvementPct is the modeled whole-factory improvement over the " +
			"item's standard recipe (higher is better, ~0 is neutral); effort favors fewer/simpler " +
			"buildings, resources minimizes raw extraction. Pass a recipe, item, or tier to drill in."
	}
	if hasProg {
		result["recommendedUnlocks"] = recommendedUnlocks(unlocked)
	}
	return result, nil
}

func describeScore(s data.AltRankScore) map[string]any {
	return map[string]any{
		"tier":               s.Tier,
		"improvementPct":     s.ImprovementPct,
		"powerPct":           s.PowerPct,
		"itemsPct":           s.ItemsPct,
		"buildingsPct":       s.BuildingsPct,
		"resourcesPct":       s.ResourcesPct,
		"buildingsScaledPct": s.BuildingsScaledPct,
		"resourcesScaledPct": s.ResourcesScaledPct,
	}
}

// describeAlt renders one ranked alternate. withRecipe adds the recipe's own
// ingredients/products/building (the full lookup view); the lighter list views
// omit it.
func describeAlt(class string, unlocked map[string]bool, hasProg, withRecipe bool) map[string]any {
	ar := data.AltRankings[class]
	m := map[string]any{
		"name":      ar.Name,
		"className": class,
		"effort":    describeScore(ar.Effort),
		"resources": describeScore(ar.Resources),
	}
	if hasProg {
		m["unlocked"] = unlocked[class]
	}
	if withRecipe {
		if r, ok := data.Recipes[class]; ok {
			sum := recipeSummary(r)
			m["ingredients"] = sum["ingredients"]
			m["products"] = sum["products"]
			if b, ok := sum["buildings"]; ok {
				m["buildings"] = b
			}
		}
	}
	return m
}

func lookupAltRecipes(q string, unlocked map[string]bool, hasProg bool) []map[string]any {
	var matches []scored[string]
	for class, ar := range data.AltRankings {
		if score := matchScore(q, class, ar.Name); score > 0 {
			matches = append(matches, scored[string]{score, ar.Name, class})
		}
	}
	classes := rank(matches)
	out := make([]map[string]any, 0, len(classes))
	for _, c := range classes {
		out = append(out, describeAlt(c, unlocked, hasProg, true))
	}
	return out
}

// altsForItem lists the ranked alternates that produce an item, best effort
// improvement first.
func altsForItem(item string, unlocked map[string]bool, hasProg bool) []map[string]any {
	var classes []string
	for class := range data.AltRankings {
		r, ok := data.Recipes[class]
		if !ok {
			continue
		}
		for _, p := range r.Products {
			if p.ItemClass == item {
				classes = append(classes, class)
				break
			}
		}
	}
	sortByEffort(classes)
	out := make([]map[string]any, 0, len(classes))
	for _, c := range classes {
		out = append(out, describeAlt(c, unlocked, hasProg, false))
	}
	return out
}

func altsByTier(tier, ranking string, unlocked map[string]bool, hasProg bool) []map[string]any {
	var classes []string
	for class, ar := range data.AltRankings {
		if scoreFor(ar, ranking).Tier == tier {
			classes = append(classes, class)
		}
	}
	sort.Slice(classes, func(i, j int) bool {
		a, b := scoreFor(data.AltRankings[classes[i]], ranking), scoreFor(data.AltRankings[classes[j]], ranking)
		if a.ImprovementPct != b.ImprovementPct {
			return a.ImprovementPct > b.ImprovementPct
		}
		return classes[i] < classes[j]
	})
	out := make([]map[string]any, 0, len(classes))
	for _, c := range classes {
		out = append(out, describeAlt(c, unlocked, hasProg, false))
	}
	return out
}

// tierOverview groups the S and A recipes (the must-takes) by ranking, names
// only, best improvement first.
func tierOverview() map[string]any {
	build := func(ranking string) map[string]any {
		buckets := map[string][]string{}
		for _, tier := range []string{"S", "A"} {
			var classes []string
			for class, ar := range data.AltRankings {
				if scoreFor(ar, ranking).Tier == tier {
					classes = append(classes, class)
				}
			}
			sortBy(classes, ranking)
			names := make([]string, 0, len(classes))
			for _, c := range classes {
				names = append(names, data.AltRankings[c].Name)
			}
			if len(names) > 0 {
				buckets[tier] = names
			}
		}
		out := map[string]any{}
		for k, v := range buckets {
			out[k] = v
		}
		return out
	}
	return map[string]any{"effort": build("effort"), "resources": build("resources")}
}

// recommendedUnlocks lists the highest-value alternates (effort S/A) the player
// has not unlocked yet, best first.
func recommendedUnlocks(unlocked map[string]bool) []map[string]any {
	var classes []string
	for class, ar := range data.AltRankings {
		if unlocked[class] {
			continue
		}
		if ar.Effort.Tier == "S" || ar.Effort.Tier == "A" {
			classes = append(classes, class)
		}
	}
	sortByEffort(classes)
	if len(classes) > 12 {
		classes = classes[:12]
	}
	out := make([]map[string]any, 0, len(classes))
	for _, c := range classes {
		out = append(out, describeAlt(c, unlocked, true, false))
	}
	return out
}

func scoreFor(ar data.AltRanking, ranking string) data.AltRankScore {
	if ranking == "resources" {
		return ar.Resources
	}
	return ar.Effort
}

func sortByEffort(classes []string) { sortBy(classes, "effort") }

func sortBy(classes []string, ranking string) {
	sort.Slice(classes, func(i, j int) bool {
		a, b := scoreFor(data.AltRankings[classes[i]], ranking), scoreFor(data.AltRankings[classes[j]], ranking)
		if a.ImprovementPct != b.ImprovementPct {
			return a.ImprovementPct > b.ImprovementPct
		}
		return classes[i] < classes[j]
	})
}
