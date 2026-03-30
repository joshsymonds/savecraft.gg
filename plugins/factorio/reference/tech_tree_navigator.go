package main

import (
	"encoding/json"
	"math"
	"os"
	"slices"
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

	// Parse completed list if provided
	completed := make(map[string]bool)
	if raw, ok := query["completed"].([]any); ok {
		for _, v := range raw {
			if s, ok := v.(string); ok {
				completed[s] = true
			}
		}
	}

	// If target is already completed, return empty result
	if completed[resolved] {
		writeResult(enc, map[string]any{
			"target":             resolved,
			"chain":              []string{},
			"chain_length":       0,
			"total_cost":         map[string]float64{},
			"total_time_seconds": 0,
			"research_order":     []string{},
			"remaining":          0,
			"already_completed":  len(completed),
		})
		return
	}

	// BFS backward from target through prerequisites
	chain := bfsPrereqs(resolved, completed)

	// Topological sort for research order
	order := topoSort(chain)

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

	result := map[string]any{
		"target":             resolved,
		"chain":              chain,
		"chain_length":       len(chain),
		"total_cost":         totalCost,
		"total_time_seconds": totalTime,
		"research_order":     order,
	}

	if len(completed) > 0 {
		result["remaining"] = len(chain)
		result["already_completed"] = len(completed)
	}

	writeResult(enc, result)
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

	// Count in-degree for each tech (only from techs in the chain)
	inDegree := make(map[string]int)
	for _, name := range chain {
		inDegree[name] = 0
	}
	for _, name := range chain {
		tech := data.Technologies[name]
		for _, prereq := range tech.Prerequisites {
			if inChain[prereq] {
				inDegree[name]++
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

		// For each tech in chain that depends on this one, decrement in-degree
		for _, other := range chain {
			if other == name {
				continue
			}
			tech := data.Technologies[other]
			if slices.Contains(tech.Prerequisites, name) {
				inDegree[other]--
				if inDegree[other] == 0 {
					queue = append(queue, other)
				}
			}
		}
	}

	return order
}
