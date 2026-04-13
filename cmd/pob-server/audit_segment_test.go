package main

import (
	"testing"
)

func segNode(typ string) segmentNode {
	return segmentNode{Type: typ}
}

func findBranchByHead(branches []segmentBranch, head int) *segmentBranch {
	for i := range branches {
		if branches[i].Head == head {
			return &branches[i]
		}
	}
	return nil
}

func setOf(ids []int) map[int]bool {
	s := make(map[int]bool, len(ids))
	for _, id := range ids {
		s[id] = true
	}
	return s
}

// ----------------------------------------------------------------------------
// Empty graph (only the root) → no branches.
func TestSegment_EmptyGraphOnlyRoot(t *testing.T) {
	nodes := map[int]segmentNode{1: segNode("ClassStart")}
	adj := map[int][]int{1: nil}
	branches := segmentGraph(nodes, adj, 1)
	if len(branches) != 0 {
		t.Fatalf("expected 0 branches, got %d", len(branches))
	}
}

// ----------------------------------------------------------------------------
// Single chain ending at a Notable.
//
//	1(root) — 2(Normal) — 3(Notable)
//
// Bridges (1,2) and (2,3) → two nested branches.
func TestSegment_SingleChainWithNotable(t *testing.T) {
	nodes := map[int]segmentNode{
		1: segNode("ClassStart"),
		2: segNode("Normal"),
		3: segNode("Notable"),
	}
	adj := map[int][]int{
		1: {2},
		2: {1, 3},
		3: {2},
	}
	branches := segmentGraph(nodes, adj, 1)
	if len(branches) != 2 {
		t.Fatalf("expected 2 branches, got %d", len(branches))
	}

	outer := findBranchByHead(branches, 2)
	if outer == nil {
		t.Fatal("missing outer branch headed at 2")
	}
	if outer.Anchor != 1 {
		t.Errorf("outer.Anchor = %d, want 1", outer.Anchor)
	}
	if outer.NodeCount != 2 {
		t.Errorf("outer.NodeCount = %d, want 2", outer.NodeCount)
	}
	outerSet := setOf(outer.Nodes)
	if !outerSet[2] || !outerSet[3] {
		t.Errorf("outer.Nodes missing 2 or 3: %v", outer.Nodes)
	}
	if outer.Terminal == nil {
		t.Fatal("outer.Terminal is nil")
	}
	if outer.Terminal.ID != 3 || outer.Terminal.Type != "Notable" {
		t.Errorf("outer.Terminal = %+v, want {3 Notable}", outer.Terminal)
	}
	if outer.PureTravel {
		t.Error("outer.PureTravel = true, want false")
	}

	inner := findBranchByHead(branches, 3)
	if inner == nil {
		t.Fatal("missing inner branch headed at 3")
	}
	if inner.Anchor != 2 || inner.NodeCount != 1 {
		t.Errorf("inner = %+v, want anchor=2 nodeCount=1", inner)
	}
}

// ----------------------------------------------------------------------------
// Simple fork: root has three independent children.
//
//	  1(root)
//	 / | \
//	2  3  4
//
// 2,3 are Notable; 4 is Normal (no terminal).
func TestSegment_SimpleForkThreeChildren(t *testing.T) {
	nodes := map[int]segmentNode{
		1: segNode("ClassStart"),
		2: segNode("Notable"),
		3: segNode("Notable"),
		4: segNode("Normal"),
	}
	adj := map[int][]int{
		1: {2, 3, 4},
		2: {1},
		3: {1},
		4: {1},
	}
	branches := segmentGraph(nodes, adj, 1)
	if len(branches) != 3 {
		t.Fatalf("expected 3 branches, got %d", len(branches))
	}
	for _, head := range []int{2, 3, 4} {
		b := findBranchByHead(branches, head)
		if b == nil {
			t.Errorf("missing branch headed at %d", head)
			continue
		}
		if b.Anchor != 1 || b.NodeCount != 1 {
			t.Errorf("branch_%d = %+v, want anchor=1 nodeCount=1", head, b)
		}
	}
	pure := findBranchByHead(branches, 4)
	if pure != nil {
		if !pure.PureTravel {
			t.Error("branch 4 should be pure_travel")
		}
		if pure.Terminal != nil {
			t.Errorf("branch 4 terminal should be nil, got %+v", pure.Terminal)
		}
	}
}

// ----------------------------------------------------------------------------
// Nested branches with multiple terminals.
//
//	1(root) — 2(Normal) — 3(Normal) — 4(Notable)
//	                           \
//	                            5(Normal) — 6(Notable)
//
// All edges are tree edges (no cycles), so every non-root node is a bridge cut.
// 5 branches expected, headed at 2,3,4,5,6.
func TestSegment_NestedBranchesMultipleTerminals(t *testing.T) {
	nodes := map[int]segmentNode{
		1: segNode("ClassStart"),
		2: segNode("Normal"),
		3: segNode("Normal"),
		4: segNode("Notable"),
		5: segNode("Normal"),
		6: segNode("Notable"),
	}
	adj := map[int][]int{
		1: {2},
		2: {1, 3},
		3: {2, 4, 5},
		4: {3},
		5: {3, 6},
		6: {5},
	}
	branches := segmentGraph(nodes, adj, 1)
	if len(branches) != 5 {
		t.Fatalf("expected 5 branches, got %d", len(branches))
	}

	outer := findBranchByHead(branches, 2)
	if outer != nil {
		if outer.NodeCount != 5 {
			t.Errorf("outer.NodeCount = %d, want 5", outer.NodeCount)
		}
		if outer.Terminal == nil {
			t.Error("outer.Terminal nil")
		}
	}

	five := findBranchByHead(branches, 5)
	if five != nil {
		if five.NodeCount != 2 {
			t.Errorf("branch_5.NodeCount = %d, want 2", five.NodeCount)
		}
		if five.Terminal == nil || five.Terminal.ID != 6 {
			t.Errorf("branch_5.Terminal = %+v, want {6 Notable}", five.Terminal)
		}
	}
}

// ----------------------------------------------------------------------------
// Pure-travel branch (no Notables/Keystones reachable).
func TestSegment_PureTravelBranchFlagged(t *testing.T) {
	nodes := map[int]segmentNode{
		1: segNode("ClassStart"),
		2: segNode("Normal"),
		3: segNode("Normal"),
		4: segNode("Normal"),
	}
	adj := map[int][]int{
		1: {2},
		2: {1, 3},
		3: {2, 4},
		4: {3},
	}
	branches := segmentGraph(nodes, adj, 1)
	for i, b := range branches {
		if !b.PureTravel {
			t.Errorf("branch %d (head %d) PureTravel = false, want true", i, b.Head)
		}
		if b.Terminal != nil {
			t.Errorf("branch %d (head %d) Terminal = %+v, want nil", i, b.Head, b.Terminal)
		}
	}
}

// ----------------------------------------------------------------------------
// Keystone wins terminal classification over Notable at the same branch level.
//
//	1(root) — 2(Normal) — 3(Notable)
//	                    \
//	                     4(Keystone)
func TestSegment_KeystoneBeatsNotableInTerminal(t *testing.T) {
	nodes := map[int]segmentNode{
		1: segNode("ClassStart"),
		2: segNode("Normal"),
		3: segNode("Notable"),
		4: segNode("Keystone"),
	}
	adj := map[int][]int{
		1: {2},
		2: {1, 3, 4},
		3: {2},
		4: {2},
	}
	branches := segmentGraph(nodes, adj, 1)
	outer := findBranchByHead(branches, 2)
	if outer == nil {
		t.Fatal("expected outer branch headed at 2")
	}
	if outer.Terminal == nil {
		t.Fatal("outer.Terminal nil")
	}
	if outer.Terminal.Type != "Keystone" || outer.Terminal.ID != 4 {
		t.Errorf("outer.Terminal = %+v, want {4 Keystone}", outer.Terminal)
	}
}

// ----------------------------------------------------------------------------
// Cycle (back edge) prevents false cuts. The bridge condition uses strict
// inequality, so a back edge from a subtree to the parent should NOT produce
// an internal cut.
//
//	1(root) — 2 — 3 — 4(Notable)
//	               \      |
//	                ------+
//
// Edge (2,4) creates a cycle 2-3-4-2. Only edge (1,2) is a real bridge.
func TestSegment_BackEdgePreventsFalseCut(t *testing.T) {
	nodes := map[int]segmentNode{
		1: segNode("ClassStart"),
		2: segNode("Normal"),
		3: segNode("Normal"),
		4: segNode("Notable"),
	}
	adj := map[int][]int{
		1: {2},
		2: {1, 3, 4}, // 2-4 is the back edge
		3: {2, 4},
		4: {3, 2},
	}
	branches := segmentGraph(nodes, adj, 1)
	if len(branches) != 1 {
		t.Fatalf("expected 1 branch, got %d", len(branches))
	}
	outer := findBranchByHead(branches, 2)
	if outer == nil {
		t.Fatal("missing outer branch headed at 2")
	}
	if outer.NodeCount != 3 {
		t.Errorf("outer.NodeCount = %d, want 3", outer.NodeCount)
	}
	s := setOf(outer.Nodes)
	if !s[2] || !s[3] || !s[4] {
		t.Errorf("outer.Nodes missing one of 2/3/4: %v", outer.Nodes)
	}
}

// ----------------------------------------------------------------------------
// Root never appears inside any branch.
func TestSegment_RootExcludedFromBranches(t *testing.T) {
	nodes := map[int]segmentNode{
		1: segNode("ClassStart"),
		2: segNode("Notable"),
		3: segNode("Notable"),
	}
	adj := map[int][]int{
		1: {2, 3},
		2: {1},
		3: {1},
	}
	branches := segmentGraph(nodes, adj, 1)
	for i, b := range branches {
		s := setOf(b.Nodes)
		if s[1] {
			t.Errorf("branch %d (head %d) contains root id 1: %v", i, b.Head, b.Nodes)
		}
	}
}

// ----------------------------------------------------------------------------
// Missing root returns empty.
func TestSegment_MissingRootReturnsEmpty(t *testing.T) {
	nodes := map[int]segmentNode{2: segNode("Notable")}
	adj := map[int][]int{2: nil}
	branches := segmentGraph(nodes, adj, 1)
	if len(branches) != 0 {
		t.Fatalf("expected 0 branches, got %d", len(branches))
	}
}

// ----------------------------------------------------------------------------
// Stack-safety smoke: a 1000-node linear chain. Every non-root node is a
// bridge cut, so 999 branches should come back. This exercises the iterative
// DFS at a depth that would crash a naive recursive implementation.
func TestSegment_StackSafetyOnLongChain(t *testing.T) {
	const chainLen = 1000
	nodes := make(map[int]segmentNode, chainLen)
	adj := make(map[int][]int, chainLen)
	for i := 1; i <= chainLen; i++ {
		switch i {
		case 1:
			nodes[i] = segNode("ClassStart")
		case chainLen:
			nodes[i] = segNode("Notable")
		default:
			nodes[i] = segNode("Normal")
		}
		if i > 1 {
			adj[i-1] = append(adj[i-1], i)
			adj[i] = append(adj[i], i-1)
		}
	}
	branches := segmentGraph(nodes, adj, 1)
	if len(branches) != chainLen-1 {
		t.Fatalf("expected %d branches, got %d", chainLen-1, len(branches))
	}
}

// ----------------------------------------------------------------------------
// Output is sorted by Head id ascending. Determinism is load-bearing for
// downstream truncation on ties.
func TestSegment_OutputSortedByHead(t *testing.T) {
	nodes := map[int]segmentNode{
		1: segNode("ClassStart"),
		2: segNode("Notable"),
		3: segNode("Notable"),
		4: segNode("Notable"),
		5: segNode("Notable"),
	}
	adj := map[int][]int{
		1: {2, 3, 4, 5},
		2: {1},
		3: {1},
		4: {1},
		5: {1},
	}
	branches := segmentGraph(nodes, adj, 1)
	for i := 1; i < len(branches); i++ {
		if branches[i-1].Head > branches[i].Head {
			t.Errorf("branches not sorted by Head: %d > %d at indices %d,%d",
				branches[i-1].Head, branches[i].Head, i-1, i)
		}
	}
}
