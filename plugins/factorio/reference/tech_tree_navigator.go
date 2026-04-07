package main

import (
	"encoding/json"
	"math"
	"os"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

func handleTechTreeNavigator(enc *json.Encoder, query map[string]any) {
	target := stringParam(query, "target")
	if target == "" {
		writeError(enc, "missing_param", "tech_tree_navigator requires 'target' parameter")
		os.Exit(1)
	}

	// Resolve target with case-insensitive matching
	resolved, ok := resolveTechName(target)
	if !ok {
		writeError(enc, "not_found", "technology not found: "+target)
		os.Exit(1)
	}

	// Parse completed list from section_mappings (completed_research.completed)
	// or from direct completed array parameter
	completed := make(map[string]bool)
	hasSaveData := false
	if cr, ok := query["completed_research"].(map[string]any); ok {
		if raw, ok := cr["completed"].([]any); ok {
			hasSaveData = true
			for _, v := range raw {
				if s, ok := v.(string); ok {
					completed[s] = true
				}
			}
		}
	} else if raw, ok := query["completed"].([]any); ok {
		for _, v := range raw {
			if s, ok := v.(string); ok {
				completed[s] = true
			}
		}
	}

	// If target is already completed, return empty result
	if completed[resolved] {
		if hasSaveData {
			writeResult(enc, map[string]any{
				"target":             resolved,
				"total_cost":         map[string]float64{},
				"total_time_seconds": 0,
				"remaining":          0,
				"already_completed":  len(completed),
			})
		} else {
			writeResult(enc, map[string]any{
				"target":             resolved,
				"chain":              []string{},
				"chain_length":       0,
				"total_cost":         map[string]float64{},
				"total_time_seconds": 0,
				"research_order":     []map[string]string{},
			})
		}
		return
	}

	// BFS backward from target through prerequisites
	chain := bfsPrereqs(resolved, completed)

	// Compute total science pack costs and time
	totalCost := make(map[string]float64)
	totalTime := 0.0
	for _, name := range chain {
		tech := data.Technologies[name]
		if tech.UnitCount > 0 && tech.Ingredients != nil {
			for _, ing := range tech.Ingredients {
				totalCost[ing.Name] += tech.UnitCount * ing.Amount
			}
			totalTime += tech.UnitCount * tech.UnitTime
		}
	}

	// Both paths include research_order with planet annotations.
	order := topoSort(chain)
	annotated := annotateWithPlanets(order)
	if hasSaveData {
		writeResult(enc, map[string]any{
			"target":             resolved,
			"total_cost":         totalCost,
			"total_time_seconds": totalTime,
			"remaining":          len(chain),
			"already_completed":  len(completed),
			"research_order":     annotated,
		})
	} else {
		writeResult(enc, map[string]any{
			"target":             resolved,
			"chain":              chain,
			"chain_length":       len(chain),
			"total_cost":         totalCost,
			"total_time_seconds": totalTime,
			"research_order":     annotated,
		})
	}
}

// resolveTechName finds a technology by exact or case-insensitive name.
func resolveTechName(name string) (string, bool) {
	if _, ok := data.Technologies[name]; ok {
		return name, true
	}
	for k := range data.Technologies {
		if strings.EqualFold(k, name) {
			return k, true
		}
	}
	return "", false
}

// bfsPrereqs collects all transitive prerequisites for a technology using BFS.
// Completed techs are excluded from the result. Infinite research techs are skipped.
func bfsPrereqs(target string, completed map[string]bool) []string {
	visited := make(map[string]bool)
	queue := []string{target}
	var chain []string

	for len(queue) > 0 {
		name := queue[0]
		queue = queue[1:]

		if visited[name] {
			continue
		}
		visited[name] = true

		// Skip completed techs (but target is already handled above)
		if completed[name] {
			continue
		}

		// Skip infinite research techs that aren't the target
		tech, ok := data.Technologies[name]
		if !ok {
			continue
		}
		if math.IsInf(tech.MaxLevel, 1) && name != target {
			continue
		}

		chain = append(chain, name)

		for _, prereq := range tech.Prerequisites {
			if !visited[prereq] {
				queue = append(queue, prereq)
			}
		}
	}

	return chain
}

// topoSort returns a valid research order using Kahn's algorithm.
// Every tech appears after all its prerequisites.
func topoSort(chain []string) []string {
	inChain := make(map[string]bool)
	for _, name := range chain {
		inChain[name] = true
	}

	// Build reverse adjacency map: prereq → []dependents (within chain)
	dependents := make(map[string][]string)
	inDegree := make(map[string]int)
	for _, name := range chain {
		inDegree[name] = 0
	}
	for _, name := range chain {
		tech := data.Technologies[name]
		for _, prereq := range tech.Prerequisites {
			if inChain[prereq] {
				inDegree[name]++
				dependents[prereq] = append(dependents[prereq], name)
			}
		}
	}

	// Start with techs that have no in-chain prerequisites
	var queue []string
	for _, name := range chain {
		if inDegree[name] == 0 {
			queue = append(queue, name)
		}
	}

	var order []string
	for len(queue) > 0 {
		name := queue[0]
		queue = queue[1:]
		order = append(order, name)

		for _, dep := range dependents[name] {
			inDegree[dep]--
			if inDegree[dep] == 0 {
				queue = append(queue, dep)
			}
		}
	}

	// Completeness check: if nodes were dropped, data has a cycle
	if len(order) != len(chain) {
		// Return what we have — the BFS already prevents infinite loops,
		// but log the discrepancy in the output for debugging
		return order
	}

	return order
}

// planetDiscoveryTechs maps planet-discovery technology names to their planet.
var planetDiscoveryTechs = map[string]string{
	"planet-discovery-vulcanus": "vulcanus",
	"planet-discovery-fulgora":  "fulgora",
	"planet-discovery-gleba":    "gleba",
	"planet-discovery-aquilo":   "aquilo",
}

// planetPriority determines which planet wins when multiple planet-discovery
// techs are ancestors (e.g. aquilo depends on fulgora + gleba techs).
var planetPriority = map[string]int{
	"vulcanus": 1,
	"fulgora":  1,
	"gleba":    1,
	"aquilo":   2,
}

// techPlanet determines which planet a technology belongs to by walking its
// prerequisite chain backward and finding the deepest planet-discovery ancestor.
// Returns "" for Nauvis/space techs with no planet gate.
func techPlanet(techName string) string {
	visited := make(map[string]bool)
	queue := []string{techName}
	bestPlanet := ""
	bestPriority := 0

	for len(queue) > 0 {
		name := queue[0]
		queue = queue[1:]
		if visited[name] {
			continue
		}
		visited[name] = true

		if planet, ok := planetDiscoveryTechs[name]; ok {
			if p := planetPriority[planet]; p > bestPriority {
				bestPlanet = planet
				bestPriority = p
			}
		}

		tech, ok := data.Technologies[name]
		if !ok {
			continue
		}
		for _, prereq := range tech.Prerequisites {
			if !visited[prereq] {
				queue = append(queue, prereq)
			}
		}
	}
	return bestPlanet
}

// annotateWithPlanets converts a string slice of tech names into objects
// with name and planet fields for the view to render planet badges.
func annotateWithPlanets(order []string) []map[string]string {
	result := make([]map[string]string, len(order))
	for i, name := range order {
		entry := map[string]string{"name": name}
		if planet := techPlanet(name); planet != "" {
			entry["planet"] = planet
		}
		result[i] = entry
	}
	return result
}
