package main

import (
	"sort"
)

// audit_rank.go — pure Go assembly of audit response branches from
// segmentation output + perturbation deltas. Identifies leaves (nodes
// removable in isolation), populates per-node breakdown, ranks branches
// by weakest/strongest, extracts the dead_weight bucket of zero-contribution
// nodes, and selects the weakest branch id.
//
// All inputs are plain values — no PoB calls, no network — so this entire
// module is unit-tested via standard `go test` against fixture inputs.

// auditSortWeakestKey is the sort key for "weakest" — branches whose removal
// costs the LEAST. Removing a strong branch produces a large negative delta
// (you lose a lot); removing a weak branch produces a small/zero negative
// delta (you lose little). So weakest = sort by delta DESCENDING (least
// negative / closest to zero first).
//
// auditSortStrongestKey is the inverse: most-negative-delta first.

// nodeBreakdown is one entry in a branch's per-node breakdown. Removable
// nodes (DFS-tree leaves within the branch) have real deltas; non-removable
// interior nodes get an empty-but-present deltas map and removable=false
// with a reason string.
type nodeBreakdown struct {
	ID        int                `json:"id"`
	Removable bool               `json:"removable"`
	Deltas    map[string]float64 `json:"deltas"`
	Reason    string             `json:"reason,omitempty"`
}

// deadWeightEntry is one node flagged as zero-contribution. Carries enough
// context for the LLM to suggest the cut: the node id, which branch it
// belongs to, and the (zero) deltas it produced when removed in isolation.
type deadWeightEntry struct {
	ID       int                `json:"id"`
	BranchID string             `json:"branchId"`
	Deltas   map[string]float64 `json:"deltas"`
	Reason   string             `json:"reason"`
}

// auditRankInput bundles everything auditRank needs. The caller (handleAudit)
// builds this after running segmentation and the perturb Send, then passes it
// to auditRank to produce the final wire-shape branches + dead_weight.
type auditRankInput struct {
	// Segmentation output (the branches we evaluated). Parallel arrays:
	// BranchDeltas[i] are the deltas from removing Branches[i] as a unit.
	Branches     []segmentBranch
	BranchDeltas []map[string]float64

	// Per-leaf single-removal deltas, keyed by node id. Populated for any
	// leaf the perturb pass evaluated; missing entries indicate leaves we
	// chose not to drill into (e.g. ran out of node budget).
	LeafDeltas map[int]map[string]float64

	// LeavesByBranchID lists which leaves were drilled per branch. This is
	// the SOURCE OF TRUTH for "this node is removable in isolation"; nodes
	// not in this set get a non-removable breakdown entry.
	LeavesByBranchID map[string][]int

	// Adjacency for the original allocated graph (so non-leaf interior nodes
	// can be identified — they get the synthetic non-removable breakdown).
	Adjacency map[int][]int

	// Request shape that drives ranking + filtering.
	Metrics     []string
	DeltaStats  []string
	Sort        string // auditSortWeakest or auditSortStrongest
	BranchLimit int
	IncludeZero bool
}

// auditRank produces the final branches + dead_weight + weakest branch id.
// All output slices are non-nil (possibly empty) so the wire shape is
// consistent — the JSON encoder emits [] not null.
func auditRank(input auditRankInput) ([]auditBranchResponse, []deadWeightEntry, *string) {
	branches := auditBuildBranchResponses(input)
	auditSortBranches(branches, input.Sort, input.Metrics)

	if input.BranchLimit > 0 && len(branches) > input.BranchLimit {
		branches = branches[:input.BranchLimit]
	}

	deadWeight := []deadWeightEntry{}
	if input.IncludeZero {
		deadWeight = auditExtractDeadWeight(branches, input.DeltaStats)
	}

	var weakestID *string
	if len(branches) > 0 {
		id := branches[0].ID
		weakestID = &id
	}

	return branches, deadWeight, weakestID
}

// auditBuildBranchResponses converts segmentation + perturb data into the
// wire branch shape. Each branch gets its delta map, an efficiency map
// (delta / node_count for each rank metric), and a per-node breakdown
// distinguishing leaves (real deltas) from interior nodes (synthetic zeros).
func auditBuildBranchResponses(input auditRankInput) []auditBranchResponse {
	out := make([]auditBranchResponse, 0, len(input.Branches))
	for i, branch := range input.Branches {
		var deltas map[string]float64
		if i < len(input.BranchDeltas) {
			deltas = input.BranchDeltas[i]
		}
		if deltas == nil {
			deltas = map[string]float64{}
		}

		efficiency := make(map[string]float64, len(input.Metrics))
		if branch.NodeCount > 0 {
			for _, metric := range input.Metrics {
				efficiency[metric] = deltas[metric] / float64(branch.NodeCount)
			}
		} else {
			for _, metric := range input.Metrics {
				efficiency[metric] = 0
			}
		}

		breakdown := auditBuildNodeBreakdown(branch, input.LeavesByBranchID[branch.ID], input.LeafDeltas)

		out = append(out, auditBranchResponse{
			ID:            branch.ID,
			Anchor:        branch.Anchor,
			Head:          branch.Head,
			Nodes:         branch.Nodes,
			NodeCount:     branch.NodeCount,
			Terminal:      branch.Terminal,
			PureTravel:    branch.PureTravel,
			Deltas:        deltas,
			Efficiency:    efficiency,
			NodeBreakdown: breakdown,
		})
	}
	return out
}

// auditBuildNodeBreakdown produces one entry per node in the branch.
// Drilled leaves get removable=true with their measured deltas. Other
// nodes (interior travel, or leaves we didn't drill due to node budget)
// get removable=false with empty deltas — the calc would either be invalid
// (interior node) or simply wasn't run (budget). Either way the LLM should
// not treat them as cuts in isolation.
func auditBuildNodeBreakdown(
	branch segmentBranch,
	drilledLeaves []int,
	leafDeltas map[int]map[string]float64,
) []nodeBreakdown {
	leafSet := make(map[int]bool, len(drilledLeaves))
	for _, id := range drilledLeaves {
		leafSet[id] = true
	}

	out := make([]nodeBreakdown, 0, len(branch.Nodes))
	for _, id := range branch.Nodes {
		if leafSet[id] {
			deltas := leafDeltas[id]
			if deltas == nil {
				deltas = map[string]float64{}
			}
			out = append(out, nodeBreakdown{
				ID:        id,
				Removable: true,
				Deltas:    deltas,
			})
			continue
		}
		out = append(out, nodeBreakdown{
			ID:        id,
			Removable: false,
			Deltas:    map[string]float64{},
			Reason:    "interior_or_unevaluated",
		})
	}
	return out
}

// auditSortBranches orders branches by the sort directive against the first
// metric in metrics. "weakest" → least loss first → delta descending (closest
// to zero, even positive, wins). "strongest" → biggest loss first → delta
// ascending (most negative wins). Tiebreaker: branch Head id ascending for
// determinism.
func auditSortBranches(branches []auditBranchResponse, sortOrder string, metrics []string) {
	if len(metrics) == 0 || len(branches) < 2 {
		return
	}
	rankMetric := metrics[0]
	weakestFirst := sortOrder != auditSortStrongest
	sort.SliceStable(branches, func(i, j int) bool {
		di := branches[i].Deltas[rankMetric]
		dj := branches[j].Deltas[rankMetric]
		if di != dj {
			if weakestFirst {
				return di > dj
			}
			return di < dj
		}
		return branches[i].Head < branches[j].Head
	})
}

// auditExtractDeadWeight scans the (already-sorted, already-truncated)
// branches for drilled leaves whose removal produced zero deltas across
// every requested DeltaStat. These are the highest-confidence cuts:
// the LLM can suggest dropping them with no metric impact.
func auditExtractDeadWeight(
	branches []auditBranchResponse,
	deltaStats []string,
) []deadWeightEntry {
	out := []deadWeightEntry{}
	for _, branch := range branches {
		for _, bd := range branch.NodeBreakdown {
			if !bd.Removable {
				continue
			}
			if !auditAllZero(bd.Deltas, deltaStats) {
				continue
			}
			out = append(out, deadWeightEntry{
				ID:       bd.ID,
				BranchID: branch.ID,
				Deltas:   bd.Deltas,
				Reason:   "zero_contribution",
			})
		}
	}
	return out
}

// auditAllZero returns true when every key in stats has a zero value (or is
// missing) in deltas. Used to identify dead-weight leaves.
func auditAllZero(deltas map[string]float64, stats []string) bool {
	for _, key := range stats {
		if deltas[key] != 0 {
			return false
		}
	}
	return true
}

// auditSelectBranchesToEvaluate pre-ranks branches by NodeCount descending
// and returns the top N where N = min(branchLimit*2, len(branches)). Larger
// branches are more likely to carry significant deltas, so we evaluate them
// first within the perturbation budget. The "*2" oversample means the rank
// step has slightly more material to choose from on tied/borderline cases.
//
// The returned slice references the same underlying segmentBranch values as
// the input — no deep copy.
func auditSelectBranchesToEvaluate(branches []segmentBranch, branchLimit int) []segmentBranch {
	if len(branches) == 0 {
		return nil
	}
	budget := branchLimit * 2
	if budget <= 0 || budget > len(branches) {
		budget = len(branches)
	}

	ordered := make([]segmentBranch, len(branches))
	copy(ordered, branches)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].NodeCount != ordered[j].NodeCount {
			return ordered[i].NodeCount > ordered[j].NodeCount
		}
		return ordered[i].Head < ordered[j].Head
	})
	return ordered[:budget]
}

// auditGatherLeaves distributes the per-branch DFS-tree leaves (computed
// during segmentation) into a flat budget-respecting list for the perturb
// pass. Leaves are taken from branches in input order until nodeLimit total
// is exhausted. Returns both a per-branch lookup map (used downstream to
// build the per-node breakdown) and a flat slice (used as the singleRemoves
// payload for the audit_perturb Send).
//
// The "leaf" definition lives in segmentGraph: a DFS-tree leaf within the
// branch is a node with no DFS children, and therefore safe to remove in
// isolation (no other in-branch node depends on it as a tree-edge parent).
// This is conservative — back-edge interior nodes might also be safely
// removable, but the conservative criterion never produces an invalid PoB
// calc, which is the load-bearing requirement.
func auditGatherLeaves(branches []segmentBranch, nodeLimit int) (map[string][]int, []int) {
	leavesByBranch := make(map[string][]int, len(branches))
	allLeaves := make([]int, 0)
	budget := nodeLimit
	if budget < 0 {
		budget = 0
	}

	for _, branch := range branches {
		if budget == 0 {
			break
		}
		var taken []int
		for _, id := range branch.Leaves {
			if budget == 0 {
				break
			}
			taken = append(taken, id)
			allLeaves = append(allLeaves, id)
			budget--
		}
		if len(taken) > 0 {
			leavesByBranch[branch.ID] = taken
		}
	}
	return leavesByBranch, allLeaves
}
