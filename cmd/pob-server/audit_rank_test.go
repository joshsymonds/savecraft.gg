package main

import (
	"reflect"
	"testing"
)

// ----------------------------------------------------------------------------
// auditSelectBranchesToEvaluate
// ----------------------------------------------------------------------------

func TestAuditSelectBranchesToEvaluate(t *testing.T) {
	branches := []segmentBranch{
		{ID: "a", Head: 10, NodeCount: 1},
		{ID: "b", Head: 20, NodeCount: 5},
		{ID: "c", Head: 30, NodeCount: 3},
		{ID: "d", Head: 40, NodeCount: 8},
		{ID: "e", Head: 50, NodeCount: 2},
	}

	t.Run("limit_budget_oversamples_2x", func(t *testing.T) {
		out := auditSelectBranchesToEvaluate(branches, 2)
		// budget = 4, sorted by NodeCount desc → d(8), b(5), c(3), e(2)
		if len(out) != 4 {
			t.Fatalf("len = %d, want 4", len(out))
		}
		want := []string{"d", "b", "c", "e"}
		for i, b := range out {
			if b.ID != want[i] {
				t.Errorf("[%d] = %q, want %q", i, b.ID, want[i])
			}
		}
	})

	t.Run("budget_exceeds_input_returns_all", func(t *testing.T) {
		out := auditSelectBranchesToEvaluate(branches, 100)
		if len(out) != 5 {
			t.Fatalf("len = %d, want 5", len(out))
		}
	})

	t.Run("zero_limit_returns_all", func(t *testing.T) {
		out := auditSelectBranchesToEvaluate(branches, 0)
		if len(out) != 5 {
			t.Fatalf("len = %d, want 5", len(out))
		}
	})

	t.Run("empty_input_returns_nil", func(t *testing.T) {
		out := auditSelectBranchesToEvaluate(nil, 5)
		if out != nil {
			t.Errorf("got %v, want nil", out)
		}
	})

	t.Run("ties_broken_by_head_asc", func(t *testing.T) {
		ties := []segmentBranch{
			{ID: "x", Head: 30, NodeCount: 5},
			{ID: "y", Head: 10, NodeCount: 5},
			{ID: "z", Head: 20, NodeCount: 5},
		}
		out := auditSelectBranchesToEvaluate(ties, 10)
		want := []int{10, 20, 30}
		for i, b := range out {
			if b.Head != want[i] {
				t.Errorf("[%d] head = %d, want %d", i, b.Head, want[i])
			}
		}
	})
}

// ----------------------------------------------------------------------------
// auditGatherLeaves
// ----------------------------------------------------------------------------

func TestAuditGatherLeaves(t *testing.T) {
	// Leaves are populated during segmentation (DFS-tree leaves within each
	// branch). auditGatherLeaves distributes them across a per-branch budget
	// in round-robin order so a single fat branch can't starve the rest.
	branches := []segmentBranch{
		{ID: "b1", Nodes: []int{2, 3, 4}, Leaves: []int{4}}, // chain 2→3→4
		{ID: "b2", Nodes: []int{5}, Leaves: []int{5}},       // single node
		{ID: "b3", Nodes: []int{6, 7, 8}, Leaves: []int{8}}, // cycle: only DFS-tree leaf
		{ID: "b4", Nodes: []int{9, 10}, Leaves: []int{10}},  // chain 9→10
	}

	t.Run("uses_segmentation_leaves_directly", func(t *testing.T) {
		leavesByBranch, _ := auditGatherLeaves(branches, 100)
		if !reflect.DeepEqual(leavesByBranch["b1"], []int{4}) {
			t.Errorf("b1 leaves = %v, want [4]", leavesByBranch["b1"])
		}
		if !reflect.DeepEqual(leavesByBranch["b2"], []int{5}) {
			t.Errorf("b2 leaves = %v, want [5] (single-node branch is its own leaf)", leavesByBranch["b2"])
		}
	})

	t.Run("respects_node_limit_across_branches", func(t *testing.T) {
		_, allLeaves := auditGatherLeaves(branches, 3)
		if len(allLeaves) != 3 {
			t.Errorf("allLeaves len = %d, want 3", len(allLeaves))
		}
	})

	t.Run("zero_limit_returns_no_leaves", func(t *testing.T) {
		leavesByBranch, allLeaves := auditGatherLeaves(branches, 0)
		if len(allLeaves) != 0 {
			t.Errorf("allLeaves = %v, want empty", allLeaves)
		}
		if len(leavesByBranch) != 0 {
			t.Errorf("leavesByBranch = %v, want empty", leavesByBranch)
		}
	})

	t.Run("branch_with_no_leaves_skipped", func(t *testing.T) {
		// A branch with empty Leaves contributes nothing.
		empty := []segmentBranch{
			{ID: "x", Nodes: []int{1, 2}, Leaves: nil},
			{ID: "y", Nodes: []int{3}, Leaves: []int{3}},
		}
		leavesByBranch, allLeaves := auditGatherLeaves(empty, 10)
		if _, exists := leavesByBranch["x"]; exists {
			t.Error("branch x should not appear in leavesByBranch")
		}
		if len(allLeaves) != 1 || allLeaves[0] != 3 {
			t.Errorf("allLeaves = %v, want [3]", allLeaves)
		}
	})

	t.Run("round_robin_prevents_fat_branch_starvation", func(t *testing.T) {
		// One fat branch with 100 leaves followed by 4 small branches.
		// At nodeLimit=4, naive sequential allocation would give all 4 to
		// the fat branch and zero to the others. Round-robin gives one to
		// each of the first 4 branches.
		fat := make([]int, 100)
		for i := range fat {
			fat[i] = 1000 + i
		}
		mixed := []segmentBranch{
			{ID: "fat", Leaves: fat},
			{ID: "a", Leaves: []int{1}},
			{ID: "b", Leaves: []int{2}},
			{ID: "c", Leaves: []int{3}},
		}
		leavesByBranch, allLeaves := auditGatherLeaves(mixed, 4)
		if len(allLeaves) != 4 {
			t.Fatalf("allLeaves len = %d, want 4", len(allLeaves))
		}
		// Each branch should have contributed exactly one leaf.
		for _, id := range []string{"fat", "a", "b", "c"} {
			got := leavesByBranch[id]
			if len(got) != 1 {
				t.Errorf("branch %q got %d leaves, want 1 (round-robin)", id, len(got))
			}
		}
	})

	t.Run("round_robin_continues_after_branch_drained", func(t *testing.T) {
		// Branch with 1 leaf and branch with 5 leaves at nodeLimit=4.
		// First pass: take 1 from each (2 total). Second pass: skip drained
		// b1 and take from b2. Third+fourth: continue draining b2.
		mixed := []segmentBranch{
			{ID: "small", Leaves: []int{10}},
			{ID: "big", Leaves: []int{20, 21, 22, 23, 24}},
		}
		leavesByBranch, allLeaves := auditGatherLeaves(mixed, 4)
		if len(allLeaves) != 4 {
			t.Fatalf("allLeaves len = %d, want 4", len(allLeaves))
		}
		if !reflect.DeepEqual(leavesByBranch["small"], []int{10}) {
			t.Errorf("small leaves = %v, want [10]", leavesByBranch["small"])
		}
		// big should get 3 leaves (one from each of passes 1, 2, 3)
		if len(leavesByBranch["big"]) != 3 {
			t.Errorf("big leaves count = %d, want 3", len(leavesByBranch["big"]))
		}
	})
}

// ----------------------------------------------------------------------------
// auditSortBranches
// ----------------------------------------------------------------------------

func makeBranch(id string, head int, lifeDelta float64) auditBranchResponse {
	return auditBranchResponse{
		ID:     id,
		Head:   head,
		Deltas: map[string]float64{"Life": lifeDelta},
	}
}

func TestAuditSortBranches(t *testing.T) {
	t.Run("weakest_least_negative_first", func(t *testing.T) {
		// Removing each branch produces a negative delta (loss). Weakest =
		// least loss = closest to zero (or positive) first.
		branches := []auditBranchResponse{
			makeBranch("a", 1, -100),
			makeBranch("b", 2, -10),
			makeBranch("c", 3, -50),
			makeBranch("d", 4, 0),
		}
		auditSortBranches(branches, auditSortWeakest, []string{"Life"})
		want := []string{"d", "b", "c", "a"}
		for i, b := range branches {
			if b.ID != want[i] {
				t.Errorf("[%d] = %q, want %q", i, b.ID, want[i])
			}
		}
	})

	t.Run("strongest_most_negative_first", func(t *testing.T) {
		branches := []auditBranchResponse{
			makeBranch("a", 1, -100),
			makeBranch("b", 2, -10),
			makeBranch("c", 3, -50),
			makeBranch("d", 4, 0),
		}
		auditSortBranches(branches, auditSortStrongest, []string{"Life"})
		want := []string{"a", "c", "b", "d"}
		for i, b := range branches {
			if b.ID != want[i] {
				t.Errorf("[%d] = %q, want %q", i, b.ID, want[i])
			}
		}
	})

	t.Run("ties_broken_by_head_asc", func(t *testing.T) {
		branches := []auditBranchResponse{
			makeBranch("late", 30, -50),
			makeBranch("early", 10, -50),
			makeBranch("mid", 20, -50),
		}
		auditSortBranches(branches, auditSortWeakest, []string{"Life"})
		want := []int{10, 20, 30}
		for i, b := range branches {
			if b.Head != want[i] {
				t.Errorf("[%d] head = %d, want %d", i, b.Head, want[i])
			}
		}
	})

	t.Run("empty_metrics_no_op", func(t *testing.T) {
		branches := []auditBranchResponse{
			makeBranch("a", 1, -10),
			makeBranch("b", 2, -100),
		}
		auditSortBranches(branches, auditSortWeakest, nil)
		if branches[0].ID != "a" {
			t.Errorf("expected no reorder, got %q", branches[0].ID)
		}
	})
}

// ----------------------------------------------------------------------------
// auditExtractDeadWeight
// ----------------------------------------------------------------------------

func TestAuditExtractDeadWeight(t *testing.T) {
	zeroDeltas := map[string]float64{"Life": 0, "CombinedDPS": 0}
	branches := []auditBranchResponse{
		{
			ID: "b1",
			NodeBreakdown: []nodeBreakdown{
				{ID: 10, Type: "Notable", Removable: true, Deltas: zeroDeltas}, // dead
				{
					ID: 11, Type: "Notable", Removable: true,
					Deltas: map[string]float64{"Life": -50, "CombinedDPS": 0},
				},
				{ID: 12, Type: "Normal", Removable: false, Deltas: map[string]float64{}}, // interior
			},
		},
		{
			ID: "b2",
			NodeBreakdown: []nodeBreakdown{
				{ID: 20, Type: "Socket", Removable: true, Deltas: zeroDeltas}, // empty socket
				{
					ID: 21, Type: "Notable", Removable: true,
					Deltas: map[string]float64{"Life": 0, "CombinedDPS": 100},
				},
			},
		},
	}

	t.Run("flags_only_all_zero_removable_nodes", func(t *testing.T) {
		dead := auditExtractDeadWeight(branches, []string{"Life", "CombinedDPS"})
		if len(dead) != 2 {
			t.Fatalf("got %d dead, want 2", len(dead))
		}
		ids := []int{dead[0].ID, dead[1].ID}
		if !reflect.DeepEqual(ids, []int{10, 20}) {
			t.Errorf("dead ids = %v, want [10 20]", ids)
		}
		if dead[0].BranchID != "b1" {
			t.Errorf("dead[0].BranchID = %q, want b1", dead[0].BranchID)
		}
		if dead[0].Reason != deadWeightReasonZero {
			t.Errorf("dead[0].Reason = %q, want %q", dead[0].Reason, deadWeightReasonZero)
		}
		// Node 20 is type Socket — should get the explicit empty_socket reason.
		if dead[1].Reason != deadWeightReasonSocket {
			t.Errorf("dead[1].Reason = %q, want %q (Socket type)", dead[1].Reason, deadWeightReasonSocket)
		}
		if dead[1].Type != "Socket" {
			t.Errorf("dead[1].Type = %q, want Socket", dead[1].Type)
		}
	})

	t.Run("non_removable_never_appears", func(t *testing.T) {
		dead := auditExtractDeadWeight(branches, []string{"Life"})
		for _, e := range dead {
			if e.ID == 12 {
				t.Errorf("non-removable interior node 12 appeared in dead_weight")
			}
		}
	})

	t.Run("respects_delta_stats_subset", func(t *testing.T) {
		// Only check Life. Node 21 has Life=0 but CombinedDPS=100; checking
		// only Life makes it dead. Node 20 stays dead. Node 10 stays dead.
		// Node 11 has Life=-50, not dead.
		dead := auditExtractDeadWeight(branches, []string{"Life"})
		ids := make(map[int]bool)
		for _, e := range dead {
			ids[e.ID] = true
		}
		if !ids[10] || !ids[20] || !ids[21] {
			t.Errorf("expected 10,20,21 dead under Life-only stats, got %v", ids)
		}
		if ids[11] {
			t.Error("11 should not be dead under Life stats")
		}
	})
}

// ----------------------------------------------------------------------------
// auditRank end-to-end
// ----------------------------------------------------------------------------

func TestAuditRank_EndToEnd(t *testing.T) {
	// Two branches:
	//  - "weak": single-node, 1 node, removing it loses Life=-5 only
	//  - "strong": two nodes, removing it loses Life=-1000
	// One leaf in each. Weakest sort puts "weak" first.
	branches := []segmentBranch{
		{
			ID:        "weak",
			Head:      10,
			Nodes:     []int{10},
			NodeCount: 1,
		},
		{
			ID:        "strong",
			Head:      20,
			Nodes:     []int{20, 21},
			NodeCount: 2,
		},
	}
	branchDeltas := []map[string]float64{
		{"Life": -5},
		{"Life": -1000},
	}
	leafDeltas := map[int]map[string]float64{
		10: {"Life": -5},
		21: {"Life": 0}, // dead leaf inside the "strong" branch
	}
	leavesByBranch := map[string][]int{
		"weak":   {10},
		"strong": {21},
	}

	out, dead, weakestID := auditRank(auditRankInput{
		Branches:         branches,
		BranchDeltas:     branchDeltas,
		LeafDeltas:       leafDeltas,
		LeavesByBranchID: leavesByBranch,
		NodeTypes:        map[int]string{10: "Notable", 20: "Normal", 21: "Notable"},
		Metrics:          []string{"Life"},
		DeltaStats:       []string{"Life"},
		Sort:             auditSortWeakest,
		BranchLimit:      10,
		IncludeZero:      true,
	})

	if len(out) != 2 {
		t.Fatalf("expected 2 ranked branches, got %d", len(out))
	}
	if out[0].ID != "weak" {
		t.Errorf("weakest first should be 'weak', got %q", out[0].ID)
	}
	if out[0].Efficiency["Life"] != -5 {
		t.Errorf("weak.Efficiency[Life] = %v, want -5 (delta -5 / 1 node)", out[0].Efficiency["Life"])
	}
	if out[1].Efficiency["Life"] != -500 {
		t.Errorf("strong.Efficiency[Life] = %v, want -500 (delta -1000 / 2 nodes)", out[1].Efficiency["Life"])
	}

	// node_breakdown checks
	if len(out[0].NodeBreakdown) != 1 || !out[0].NodeBreakdown[0].Removable {
		t.Errorf("weak.NodeBreakdown wrong: %+v", out[0].NodeBreakdown)
	}
	if len(out[1].NodeBreakdown) != 2 {
		t.Fatalf("strong.NodeBreakdown len = %d, want 2", len(out[1].NodeBreakdown))
	}
	// Node 20 is interior (not in leavesByBranch["strong"]) → not removable
	// Node 21 is leaf with Life=0
	for _, bd := range out[1].NodeBreakdown {
		if bd.ID == 20 {
			if bd.Removable {
				t.Error("node 20 should be non-removable interior")
			}
		}
		if bd.ID == 21 {
			if !bd.Removable {
				t.Error("node 21 should be removable leaf")
			}
		}
	}

	// dead_weight: node 21 has Life=0 → dead
	if len(dead) != 1 {
		t.Fatalf("expected 1 dead, got %d", len(dead))
	}
	if dead[0].ID != 21 || dead[0].BranchID != "strong" {
		t.Errorf("dead[0] = %+v, want id=21 branchId=strong", dead[0])
	}

	if weakestID == nil || *weakestID != "weak" {
		t.Errorf("weakestID = %v, want 'weak'", weakestID)
	}
}

func TestAuditRank_IncludeZeroFalseSkipsDeadWeight(t *testing.T) {
	branches := []segmentBranch{{ID: "x", Head: 1, Nodes: []int{1}, NodeCount: 1}}
	_, dead, _ := auditRank(auditRankInput{
		Branches:         branches,
		BranchDeltas:     []map[string]float64{{"Life": 0}},
		LeafDeltas:       map[int]map[string]float64{1: {"Life": 0}},
		LeavesByBranchID: map[string][]int{"x": {1}},
		Metrics:          []string{"Life"},
		DeltaStats:       []string{"Life"},
		Sort:             auditSortWeakest,
		IncludeZero:      false,
	})
	if len(dead) != 0 {
		t.Errorf("expected empty dead_weight when IncludeZero=false, got %d", len(dead))
	}
}

func TestAuditRank_BranchLimitTruncates(t *testing.T) {
	branches := []segmentBranch{
		{ID: "a", Head: 1, NodeCount: 1},
		{ID: "b", Head: 2, NodeCount: 1},
		{ID: "c", Head: 3, NodeCount: 1},
	}
	deltas := []map[string]float64{
		{"Life": -10},
		{"Life": -20},
		{"Life": -30},
	}
	out, _, _ := auditRank(auditRankInput{
		Branches:     branches,
		BranchDeltas: deltas,
		Metrics:      []string{"Life"},
		Sort:         auditSortWeakest,
		BranchLimit:  2,
	})
	if len(out) != 2 {
		t.Errorf("expected 2 (truncated), got %d", len(out))
	}
}

func TestAuditRank_EmptyInput(t *testing.T) {
	out, dead, weakest := auditRank(auditRankInput{
		Metrics:    []string{"Life"},
		DeltaStats: []string{"Life"},
		Sort:       auditSortWeakest,
	})
	if len(out) != 0 {
		t.Errorf("expected empty branches, got %d", len(out))
	}
	if len(dead) != 0 {
		t.Errorf("expected empty dead_weight, got %d", len(dead))
	}
	if weakest != nil {
		t.Errorf("expected nil weakest, got %v", *weakest)
	}
}
