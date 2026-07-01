package main

import (
	"fmt"
	"sort"

	"github.com/joshsymonds/savecraft.gg/plugins/satisfactory/reference/data"
)

// milestoneNavigator answers tier/milestone questions: what a tier contains,
// what a milestone costs and unlocks, and (with save data) what remains on
// the path to a target tier with cumulative costs.
func milestoneNavigator(query map[string]any) (map[string]any, error) {
	tier, hasTier := numberParam(query, "tier")
	toTier, hasToTier := numberParam(query, "to_tier")
	milestoneQ := stringParam(query, "milestone")

	if !hasTier && !hasToTier && milestoneQ == "" {
		return nil, fmt.Errorf("provide one of: tier, milestone, to_tier")
	}

	result := map[string]any{}
	if milestoneQ != "" {
		matches := lookupMilestones(milestoneQ)
		if len(matches) == 0 {
			return nil, fmt.Errorf("no milestone matches %q", milestoneQ)
		}
		result["milestones"] = matches
	}
	if hasTier {
		result["tier"] = describeTier(int(tier))
	}
	if hasToTier {
		result["pathToTier"] = pathToTier(int(toTier), purchasedMilestones(query))
	}
	return result, nil
}

func numberParam(query map[string]any, key string) (float64, bool) {
	v, ok := query[key].(float64)
	return v, ok
}

// milestonesOfTier returns the milestone schematics for one tier, sorted.
func milestonesOfTier(tier int) []data.Schematic {
	var out []data.Schematic
	for _, s := range data.Schematics {
		if s.Type == "EST_Milestone" && s.Tier == tier {
			out = append(out, s)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ClassName < out[j].ClassName })
	return out
}

func describeMilestone(s data.Schematic) map[string]any {
	cost := make([]map[string]any, 0, len(s.Cost))
	for _, c := range s.Cost {
		cost = append(cost, map[string]any{
			"item": itemName(c.ItemClass), "className": c.ItemClass, "amount": c.Amount,
		})
	}
	unlocks := make([]string, 0, len(s.UnlockRecipes))
	for _, r := range s.UnlockRecipes {
		if recipe, ok := data.Recipes[r]; ok {
			unlocks = append(unlocks, recipe.DisplayName)
		}
	}
	return map[string]any{
		"milestone": s.DisplayName,
		"className": s.ClassName,
		"tier":      s.Tier,
		"cost":      cost,
		"unlocks":   unlocks,
	}
}

func lookupMilestones(q string) []map[string]any {
	var matches []scored[map[string]any]
	for _, s := range data.Schematics {
		if s.Type != "EST_Milestone" {
			continue
		}
		score := matchScore(q, s.ClassName, s.DisplayName)
		if score == 0 {
			continue
		}
		matches = append(matches, scored[map[string]any]{score, s.DisplayName, describeMilestone(s)})
	}
	return rank(matches)
}

func describeTier(tier int) map[string]any {
	milestones := milestonesOfTier(tier)
	described := make([]map[string]any, 0, len(milestones))
	for _, s := range milestones {
		described = append(described, describeMilestone(s))
	}
	return map[string]any{
		"tier":       tier,
		"milestones": described,
	}
}

// purchasedMilestones reads the injected progression section.
func purchasedMilestones(query map[string]any) map[string]bool {
	purchased := map[string]bool{}
	progression, ok := query["progression"].(map[string]any)
	if !ok {
		return purchased
	}
	names, ok := progression["milestoneClassNames"].([]any)
	if !ok {
		return purchased
	}
	for _, raw := range names {
		if name, ok := raw.(string); ok {
			purchased[name] = true
		}
	}
	return purchased
}

// pathToTier lists unpurchased milestones up to and including the target
// tier, with cumulative item costs.
func pathToTier(target int, purchased map[string]bool) map[string]any {
	var remaining []map[string]any
	cumulative := map[string]int{}
	for tier := 0; tier <= target; tier++ {
		for _, s := range milestonesOfTier(tier) {
			if purchased[s.ClassName] {
				continue
			}
			remaining = append(remaining, describeMilestone(s))
			for _, c := range s.Cost {
				cumulative[c.ItemClass] += c.Amount
			}
		}
	}

	classes := make([]string, 0, len(cumulative))
	for c := range cumulative {
		classes = append(classes, c)
	}
	sort.Slice(classes, func(i, j int) bool { return cumulative[classes[i]] > cumulative[classes[j]] })
	totals := make([]map[string]any, 0, len(classes))
	for _, c := range classes {
		totals = append(totals, map[string]any{
			"item": itemName(c), "className": c, "amount": cumulative[c],
		})
	}

	note := ""
	if len(purchased) == 0 {
		note = "no save data provided — path assumes nothing is purchased yet"
	}
	out := map[string]any{
		"targetTier":          target,
		"remainingMilestones": remaining,
		"cumulativeCost":      totals,
	}
	if note != "" {
		out["note"] = note
	}
	return out
}
