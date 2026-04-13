package main

import (
	"fmt"
	"sort"
)

// audit_segment.go — branch segmentation of an allocated passive tree.
//
// The algorithm operates on a generic graph shape so it can be unit-tested
// without loading PoB. The Lua side of wrapper.lua walks build.spec.nodes
// and serializes the graph; this Go code consumes that JSON, runs the
// segmentation, and decides which branches deserve perturbation.
//
// A "branch" is a DFS subtree whose only attachment to the rest of the
// allocated graph is via a bridge edge — strict inequality low[v] > disc[parent[v]]
// is required. With the loose articulation-point condition (≥), a back edge
// from v's subtree to v's parent would still satisfy ≥, but the subtree
// isn't actually a clean pendant in that case. Bridge semantics give clean
// "this is the path that exists for terminal X" branches.
//
// DFS children of the root are always emitted regardless of bridge status —
// the root is the immutable anchor and each direct child subtree is a
// separable region.
//
// The DFS is iterative — Go's stack is much larger than Lua's, but a 90+
// node passive tree is well within reason for either, and the iterative
// shape was already the pattern from the Lua original.

// PoB node type strings used by segmentation. The full set in PassiveSpec.lua
// also includes "Normal", "Mastery", "Socket", "ClassStart", and
// "AscendClassStart" — those flow through as opaque strings here, only
// Notable and Keystone get classified as branch terminals.
const (
	nodeTypeNotable  = "Notable"
	nodeTypeKeystone = "Keystone"
)

// segmentNode is the per-node payload consumed by segmentation. The Type
// field uses PoB's exact strings (Normal, Notable, Keystone, Mastery, Socket,
// ClassStart, AscendClassStart).
type segmentNode struct {
	Type string `json:"type"`
}

// segmentTerminal is the branch's terminal classification — the deepest
// Notable/Keystone in the branch, with Keystone always winning over Notable
// at any depth.
type segmentTerminal struct {
	ID   int    `json:"id"`
	Type string `json:"type"`
}

// segmentBranch is one cleanly-removable pendant subtree.
//
// Leaves carries the ids of DFS-tree leaves WITHIN the branch — nodes with
// no DFS children. These are the nodes that can be safely removed in
// isolation: removing a DFS leaf cuts no other allocated node off from the
// anchor, because no other in-branch node depends on it as a parent. Used
// downstream by auditRank for the per-node drill-down.
type segmentBranch struct {
	ID         string           `json:"id"`
	Anchor     int              `json:"anchor"`
	Head       int              `json:"head"`
	Nodes      []int            `json:"nodes"`
	NodeCount  int              `json:"nodeCount"`
	Terminal   *segmentTerminal `json:"terminal"`
	PureTravel bool             `json:"pureTravel"`
	Leaves     []int            `json:"leaves"`
}

// segmentGraph splits an allocated subgraph rooted at rootID into branches.
// Returns nil when rootID is missing from nodes. Output is sorted by Head id
// ascending for deterministic results across runs (load-bearing for downstream
// truncation on ties).
func segmentGraph(nodes map[int]segmentNode, adjacency map[int][]int, rootID int) []segmentBranch {
	if _, ok := nodes[rootID]; !ok {
		return nil
	}

	disc, low, parent, dfsChildren := segmentDFS(nodes, adjacency, rootID)

	var branches []segmentBranch
	for nodeID := range disc {
		if nodeID == rootID {
			continue
		}
		parentID, ok := parent[nodeID]
		if !ok {
			continue
		}
		if !segmentIsBranchHead(parentID, nodeID, rootID, disc, low) {
			continue
		}
		subtreeNodes, leaves := segmentCollectSubtree(nodeID, dfsChildren)
		terminal := segmentClassifyTerminal(subtreeNodes, nodes, disc)
		branches = append(branches, segmentBranch{
			ID:         fmt.Sprintf("branch_%d_%d", parentID, nodeID),
			Anchor:     parentID,
			Head:       nodeID,
			Nodes:      subtreeNodes,
			NodeCount:  len(subtreeNodes),
			Terminal:   terminal,
			PureTravel: terminal == nil,
			Leaves:     leaves,
		})
	}

	sort.Slice(branches, func(i, j int) bool {
		return branches[i].Head < branches[j].Head
	})

	return branches
}

// segmentIsBranchHead returns true when the edge (parentID, nodeID) is a
// branch cut: either parentID is the root (every direct child subtree is a
// branch) or low[nodeID] > disc[parentID] (strict bridge inequality, so a
// back edge from nodeID's subtree to parentID does NOT count as a cut).
func segmentIsBranchHead(parentID, nodeID, rootID int, disc, low map[int]int) bool {
	if parentID == rootID {
		return true
	}
	return low[nodeID] > disc[parentID]
}

// segmentDFSState carries the mutable maps that the iterative DFS updates.
// Bundling them simplifies the per-neighbor helper signature and avoids the
// naked-return on the parent function.
type segmentDFSState struct {
	disc        map[int]int
	low         map[int]int
	parent      map[int]int
	dfsChildren map[int][]int
	timer       int
}

// segmentDFS runs an iterative Tarjan articulation-point DFS over the
// allocated subgraph, computing disc, low, parent, and the DFS-tree children
// keyed by each node id. The returned maps share the same key set as
// reachable nodes from rootID.
func segmentDFS(
	nodes map[int]segmentNode,
	adjacency map[int][]int,
	rootID int,
) (map[int]int, map[int]int, map[int]int, map[int][]int) {
	state := &segmentDFSState{
		disc:        map[int]int{rootID: 0},
		low:         map[int]int{rootID: 0},
		parent:      make(map[int]int),
		dfsChildren: make(map[int][]int),
		timer:       1,
	}

	type frame struct {
		nodeID int
		idx    int
	}
	stack := []frame{{nodeID: rootID, idx: 0}}

	for len(stack) > 0 {
		top := &stack[len(stack)-1]
		current := top.nodeID
		neighbors := adjacency[current]
		pushed := false

		for top.idx < len(neighbors) {
			neighborID := neighbors[top.idx]
			top.idx++
			if _, exists := nodes[neighborID]; !exists {
				continue
			}
			if _, visited := state.disc[neighborID]; !visited {
				segmentDFSPushTreeEdge(state, current, neighborID)
				stack = append(stack, frame{nodeID: neighborID, idx: 0})
				pushed = true
				break
			}
			segmentDFSConsiderBackEdge(state, current, neighborID)
		}

		if !pushed {
			if parentID, ok := state.parent[current]; ok {
				if state.low[current] < state.low[parentID] {
					state.low[parentID] = state.low[current]
				}
			}
			stack = stack[:len(stack)-1]
		}
	}

	return state.disc, state.low, state.parent, state.dfsChildren
}

// segmentDFSPushTreeEdge records a newly-discovered tree edge in the DFS state.
func segmentDFSPushTreeEdge(state *segmentDFSState, current, neighborID int) {
	state.parent[neighborID] = current
	state.disc[neighborID] = state.timer
	state.low[neighborID] = state.timer
	state.timer++
	state.dfsChildren[current] = append(state.dfsChildren[current], neighborID)
}

// segmentDFSConsiderBackEdge processes an already-visited neighbor: if it's
// not the DFS-tree parent of `current`, it's a back edge and may lower
// current's low value.
func segmentDFSConsiderBackEdge(state *segmentDFSState, current, neighborID int) {
	if parentID, hasParent := state.parent[current]; hasParent && neighborID == parentID {
		return
	}
	if state.disc[neighborID] < state.low[current] {
		state.low[current] = state.disc[neighborID]
	}
}

// segmentCollectSubtree walks the DFS-tree subtree rooted at start and
// returns (allNodes, leaves). A leaf is a node with no DFS children — and
// therefore safely removable in isolation, because no other in-branch node
// uses it as a tree-edge parent. Uses an explicit stack rather than recursion.
func segmentCollectSubtree(start int, dfsChildren map[int][]int) ([]int, []int) {
	var allNodes, leaves []int
	stack := []int{start}
	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		allNodes = append(allNodes, current)
		children := dfsChildren[current]
		if len(children) == 0 {
			leaves = append(leaves, current)
			continue
		}
		stack = append(stack, children...)
	}
	return allNodes, leaves
}

// segmentClassifyTerminal picks the branch's terminal: Keystone always wins
// over Notable at any depth; among same-type candidates, deeper disc wins;
// ties on depth break by higher id for determinism. Returns nil when the
// branch contains no Notable or Keystone (pure-travel branch).
func segmentClassifyTerminal(
	branchNodes []int,
	nodes map[int]segmentNode,
	disc map[int]int,
) *segmentTerminal {
	var best *segmentTerminal
	var bestDepth int
	for _, id := range branchNodes {
		nodeType := nodes[id].Type
		if nodeType != nodeTypeNotable && nodeType != nodeTypeKeystone {
			continue
		}
		depth := disc[id]
		if best == nil {
			best = &segmentTerminal{ID: id, Type: nodeType}
			bestDepth = depth
			continue
		}
		if segmentTerminalReplaces(nodeType, depth, id, best, bestDepth) {
			best = &segmentTerminal{ID: id, Type: nodeType}
			bestDepth = depth
		}
	}
	return best
}

// segmentTerminalReplaces returns true when the candidate (nodeType, depth, id)
// should replace the current best terminal: Keystone outranks Notable; for
// equal types, deeper disc wins; for equal types and depth, higher id wins.
func segmentTerminalReplaces(
	nodeType string,
	depth, id int,
	best *segmentTerminal,
	bestDepth int,
) bool {
	if nodeType == nodeTypeKeystone && best.Type != nodeTypeKeystone {
		return true
	}
	if nodeType != best.Type {
		return false
	}
	if depth > bestDepth {
		return true
	}
	return depth == bestDepth && id > best.ID
}
