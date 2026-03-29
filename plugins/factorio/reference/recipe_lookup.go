package main

import (
	"encoding/json"
	"os"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

func handleRecipeLookup(enc *json.Encoder, query map[string]any) {
	name := stringParam(query, "name")
	usage := stringParam(query, "usage")
	product := stringParam(query, "product")
	machine := stringParam(query, "machine")
	tech := stringParam(query, "tech")

	switch {
	case name != "":
		lookupRecipe(enc, name)
	case usage != "":
		lookupUsage(enc, usage)
	case product != "":
		lookupProduct(enc, product)
	case machine != "":
		lookupMachine(enc, machine)
	case tech != "":
		lookupTech(enc, tech)
	default:
		writeError(enc, "missing_param", "recipe_lookup requires one of: name, usage, product, machine, tech")
		os.Exit(1)
	}
}

// lookupRecipe returns full recipe data by exact name.
func lookupRecipe(enc *json.Encoder, name string) {
	recipe, ok := data.Recipes[name]
	if !ok {
		// Try case-insensitive match
		for k, r := range data.Recipes {
			if strings.EqualFold(k, name) {
				recipe = r
				ok = true
				break
			}
		}
	}
	if !ok {
		writeError(enc, "not_found", "recipe not found: "+name)
		os.Exit(1)
	}

	// Find which machines can craft this recipe
	craftableIn := findMachinesForCategory(recipe.Category)

	writeResult(enc, map[string]any{
		"recipe":       formatRecipe(recipe),
		"craftable_in": craftableIn,
	})
}

// lookupUsage finds all recipes that use the given item/fluid as an ingredient.
func lookupUsage(enc *json.Encoder, itemName string) {
	var results []map[string]any
	for _, recipe := range data.Recipes {
		for _, ing := range recipe.Ingredients {
			if ing.Name == itemName {
				results = append(results, formatRecipe(recipe))
				break
			}
		}
	}
	writeResult(enc, map[string]any{
		"item":         itemName,
		"used_in":      results,
		"recipe_count": len(results),
	})
}

// lookupProduct finds all recipes that produce the given item/fluid.
func lookupProduct(enc *json.Encoder, itemName string) {
	var results []map[string]any
	for _, recipe := range data.Recipes {
		for _, prod := range recipe.Results {
			if prod.Name == itemName {
				results = append(results, formatRecipe(recipe))
				break
			}
		}
	}
	writeResult(enc, map[string]any{
		"item":         itemName,
		"produced_by":  results,
		"recipe_count": len(results),
	})
}

// lookupMachine returns machine stats and what recipe categories it supports.
func lookupMachine(enc *json.Encoder, name string) {
	machine, ok := data.Machines[name]
	if !ok {
		for k, m := range data.Machines {
			if strings.EqualFold(k, name) {
				machine = m
				ok = true
				break
			}
		}
	}
	if !ok {
		writeError(enc, "not_found", "machine not found: "+name)
		os.Exit(1)
	}

	// Count how many recipes this machine can craft
	recipeCount := 0
	for _, recipe := range data.Recipes {
		for _, cat := range machine.CraftingCategories {
			if recipe.Category == cat {
				recipeCount++
				break
			}
		}
	}

	writeResult(enc, map[string]any{
		"machine": map[string]any{
			"name":                name,
			"crafting_speed":      machine.CraftingSpeed,
			"energy_usage":        machine.EnergyUsage,
			"module_slots":        machine.ModuleSlots,
			"crafting_categories": machine.CraftingCategories,
			"allowed_effects":     machine.AllowedEffects,
			"craftable_recipes":   recipeCount,
		},
	})
}

// lookupTech returns technology details, prerequisites, costs, and unlocked recipes.
func lookupTech(enc *json.Encoder, name string) {
	tech, ok := data.Technologies[name]
	if !ok {
		for k, t := range data.Technologies {
			if strings.EqualFold(k, name) {
				tech = t
				ok = true
				break
			}
		}
	}
	if !ok {
		writeError(enc, "not_found", "technology not found: "+name)
		os.Exit(1)
	}

	// Format ingredients as science pack list
	var ingredients []map[string]any
	for _, ing := range tech.Ingredients {
		ingredients = append(ingredients, map[string]any{
			"name":   ing.Name,
			"amount": ing.Amount,
		})
	}

	// Look up the actual recipe data for each unlocked recipe
	var unlockedRecipes []map[string]any
	for _, recipeName := range tech.Effects {
		if recipe, ok := data.Recipes[recipeName]; ok {
			unlockedRecipes = append(unlockedRecipes, formatRecipe(recipe))
		}
	}

	writeResult(enc, map[string]any{
		"technology": map[string]any{
			"name":             name,
			"prerequisites":    tech.Prerequisites,
			"unit_count":       tech.UnitCount,
			"unit_time":        tech.UnitTime,
			"ingredients":      ingredients,
			"unlocked_recipes": unlockedRecipes,
		},
	})
}

// formatRecipe converts a data.Recipe to a map for JSON output.
func formatRecipe(r data.Recipe) map[string]any {
	var ingredients []map[string]any
	for _, ing := range r.Ingredients {
		ingredients = append(ingredients, map[string]any{
			"type":   ing.Type,
			"name":   ing.Name,
			"amount": ing.Amount,
		})
	}

	var results []map[string]any
	for _, prod := range r.Results {
		entry := map[string]any{
			"type":   prod.Type,
			"name":   prod.Name,
			"amount": prod.Amount,
		}
		if prod.Probability < 1.0 {
			entry["probability"] = prod.Probability
		}
		results = append(results, entry)
	}

	return map[string]any{
		"name":            r.Name,
		"category":        r.Category,
		"energy_required": r.EnergyRequired,
		"enabled":         r.Enabled,
		"ingredients":     ingredients,
		"results":         results,
	}
}

// findMachinesForCategory returns all machines that can craft a given recipe category.
func findMachinesForCategory(category string) []map[string]any {
	var machines []map[string]any
	for _, m := range data.Machines {
		for _, cat := range m.CraftingCategories {
			if cat == category {
				machines = append(machines, map[string]any{
					"name":           m.Name,
					"crafting_speed": m.CraftingSpeed,
					"module_slots":   m.ModuleSlots,
					"energy_usage":   m.EnergyUsage,
				})
				break
			}
		}
	}
	return machines
}
