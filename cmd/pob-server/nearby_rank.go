package main

import "sort"

// nearby_rank.go — pure per-metric ranker for /nearby candidate evaluation.
//
// Operates on already-perturbed candidates (each carrying a deltas map keyed
// by stat name). For one chosen metric, computes per-candidate efficiency
// = delta_for_metric / path_cost, sorts by (efficiency [order], path_cost
// asc, name asc), and returns the top N.
//
// sortOrder is "desc" (highest efficiency first, the default) or "asc"
// (lowest first — useful for finding cheap travel paths).

// nearbyRankInput is one candidate ready for ranking. Constructed by the
// /nearby handler after Lua-side extraction + Go-side filtering + Lua-side
// perturbation. PathCost is PoB's computed node.pathDist for the candidate.
type nearbyRankInput struct {
	Name     string
	Type     string
	Stats    []string
	PathCost int
	Path     []string
	Deltas   map[string]float64
}

// nearbyRankedNode is the wire shape returned in the per-metric result set.
// All fields match what the existing /nearby response shape used to emit
// from wrapper.lua before the conversion.
type nearbyRankedNode struct {
	Name       string             `json:"name"`
	Type       string             `json:"type"`
	Stats      []string           `json:"stats"`
	PathCost   int                `json:"pathCost"`
	Path       []string           `json:"path"`
	Deltas     map[string]float64 `json:"deltas"`
	Efficiency float64            `json:"efficiency"`
}

// nearbyRank returns the top `limit` candidates sorted per the request order.
// limit <= 0 or limit > len(candidates) returns all candidates sorted.
// Candidates with PathCost <= 0 get efficiency = 0 (no divide-by-zero panic).
// Missing entries in Deltas[metric] are treated as 0.
func nearbyRank(
	candidates []nearbyRankInput,
	metric, sortOrder string,
	limit int,
) []nearbyRankedNode {
	ranked := make([]nearbyRankedNode, 0, len(candidates))
	for _, candidate := range candidates {
		var eff float64
		if candidate.PathCost > 0 {
			delta := 0.0
			if candidate.Deltas != nil {
				delta = candidate.Deltas[metric]
			}
			eff = delta / float64(candidate.PathCost)
		}
		ranked = append(ranked, nearbyRankedNode{
			Name:       candidate.Name,
			Type:       candidate.Type,
			Stats:      candidate.Stats,
			PathCost:   candidate.PathCost,
			Path:       candidate.Path,
			Deltas:     candidate.Deltas,
			Efficiency: eff,
		})
	}

	ascending := sortOrder == "asc"
	sort.SliceStable(ranked, func(i, j int) bool {
		left, right := &ranked[i], &ranked[j]
		if left.Efficiency != right.Efficiency {
			if ascending {
				return left.Efficiency < right.Efficiency
			}
			return left.Efficiency > right.Efficiency
		}
		if left.PathCost != right.PathCost {
			return left.PathCost < right.PathCost
		}
		return left.Name < right.Name
	})

	if limit > 0 && limit < len(ranked) {
		ranked = ranked[:limit]
	}
	return ranked
}
