package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// compareRespWithTree decodes the /compare body using the tree-diff-aware
// shape, building on the summary-diff types from compare_diff_test.go.
type compareRespWithTree struct {
	Builds []compareEntry          `json:"builds"`
	Diffs  *compareDiffsTreeOnWire `json:"diffs"`
}

type compareDiffsTreeOnWire struct {
	Summary map[string]compareStatDiffOnWire `json:"summary"`
	Tree    *compareTreeDiffOnWire           `json:"tree"`
}

type compareTreeDiffOnWire struct {
	// AllocatedOnlyIn is parallel to resp.Builds — index i carries the
	// nodes unique to builds[i]. Failed builds and builds without tree
	// data get [] at their index. The diff itself is omitted (nil) only
	// when fewer than 2 builds succeed OR a SUCCESSFUL build lacks
	// allocatedNodes.
	AllocatedOnlyIn [][]allocatedNodeOnWire `json:"allocatedOnlyIn"`
	Common          []allocatedNodeOnWire   `json:"common"`
}

// allocatedNodeOnWire mirrors the production allocatedNode struct.
// Decoded by tests to assert both ID set membership and that names ride
// along (non-empty for real-Lua, synthetic for in-process harnesses).
type allocatedNodeOnWire struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

func decodeCompareWithTree(t *testing.T, body []byte) compareRespWithTree {
	t.Helper()
	var resp compareRespWithTree
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

// calcResponseWithTree returns a wrapper.lua-shaped response carrying a
// per-build tree.allocatedNodes list of {id, name} objects. Used to
// drive the diff computation in tests without needing the real Lua
// subprocess. Names are synthesized as "Node-<id>" so the
// in-process harness can assert that names ride along through diff
// computation without having a real PoB tree-data table.
func calcResponseWithTree(class string, allocatedIDs []int) string {
	nodes := make([]map[string]any, len(allocatedIDs))
	for i, id := range allocatedIDs {
		nodes[i] = map[string]any{
			"id":   id,
			"name": fmt.Sprintf("Node-%d", id),
		}
	}
	nodesJSON, _ := json.Marshal(nodes)
	return `{"type":"result","data":{` +
		`"character":{"class":"` + class + `","ascendancy":"X","level":99},` +
		`"summary":{"CombinedDPS":100000,"Life":6000,"LifeUnreserved":6000,"LifeUnreservedPercent":100,` +
		`"EnergyShield":0,"Mana":500,"Armour":0,"Evasion":0,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":0,"SpellSuppressionChance":0,"MovementSpeedMod":1,` +
		`"Str":100,"Dex":100,"Int":100,"FlaskEffect":0,"FlaskChargeGen":0,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":100000},` +
		`"section_index":[],"sections":{"tree":{"version":"3.28","allocated_nodes":3,"allocatedNodes":` + string(nodesJSON) + `}}}}`
}

// TestCompareTreeDiffN2: two builds with overlapping allocated nodes
// produce {allocatedOnlyIn: [[unique-A], [unique-B]], common}. The
// perBuild array is indexed parallel to resp.Builds, which preserves
// the request order — so index 0 is idA, index 1 is idB.
func TestCompareTreeDiffN2(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithTree("Witch", []int{1, 2, 3, 4}),
		calcResponseWithTree("Marauder", []int{3, 4, 5, 6}),
	)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithTree(t, rec.Body.Bytes())
	if resp.Diffs == nil || resp.Diffs.Tree == nil {
		t.Fatalf("expected diffs.tree, got nil; body=%s", rec.Body.String())
	}

	if !equalIntSlices(nodeIDsOf(resp.Diffs.Tree.Common), []int{3, 4}) {
		t.Errorf("common IDs = %v, want [3 4]", nodeIDsOf(resp.Diffs.Tree.Common))
	}
	if got := len(resp.Diffs.Tree.AllocatedOnlyIn); got != 2 {
		t.Fatalf("allocatedOnlyIn length = %d, want 2 (parallel to builds)", got)
	}
	if !equalIntSlices(nodeIDsOf(resp.Diffs.Tree.AllocatedOnlyIn[0]), []int{1, 2}) {
		t.Errorf("allocatedOnlyIn[0] (idA) IDs = %v, want [1 2]", nodeIDsOf(resp.Diffs.Tree.AllocatedOnlyIn[0]))
	}
	if !equalIntSlices(nodeIDsOf(resp.Diffs.Tree.AllocatedOnlyIn[1]), []int{5, 6}) {
		t.Errorf("allocatedOnlyIn[1] (idB) IDs = %v, want [5 6]", nodeIDsOf(resp.Diffs.Tree.AllocatedOnlyIn[1]))
	}
	// Names ride along: every entry in common + per-build slots carries
	// a non-empty Name. The synthetic "Node-<id>" form from
	// calcResponseWithTree is what we expect here; real fixtures get
	// PoB display names via the integration test.
	assertNamesPopulated(t, "common", resp.Diffs.Tree.Common)
	for i, slot := range resp.Diffs.Tree.AllocatedOnlyIn {
		assertNamesPopulated(t, fmt.Sprintf("allocatedOnlyIn[%d]", i), slot)
	}
}

// TestCompareTreeDiffN3: three builds; common is only nodes in ALL
// three; allocatedOnlyIn[i] is nodes in EXACTLY builds[i].
func TestCompareTreeDiffN3(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithTree("Witch", []int{1, 2, 10, 20}),
		calcResponseWithTree("Marauder", []int{1, 2, 10, 30}),
		calcResponseWithTree("Ranger", []int{1, 2, 40}),
	})
	pool.maxSize = 1
	pool.affinityMaxPins = 1
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xmlA := "<A/>"
	xmlB := "<B/>"
	xmlC := "<C/>"
	idA := srv.cache.Put(xmlA)
	idB := srv.cache.Put(xmlB)
	idC := srv.cache.Put(xmlC)
	for id, xml := range map[string]string{idA: xmlA, idB: xmlB, idC: xmlC} {
		_ = srv.cache.store.Put(id, xml, "", "", "")
	}

	body := `{"builds":["` + idA + `","` + idB + `","` + idC + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithTree(t, rec.Body.Bytes())
	if resp.Diffs == nil || resp.Diffs.Tree == nil {
		t.Fatalf("expected diffs.tree")
	}
	if got := len(resp.Diffs.Tree.AllocatedOnlyIn); got != 3 {
		t.Fatalf("allocatedOnlyIn length = %d, want 3 (parallel to builds)", got)
	}

	// Common = {1, 2} (in all three)
	if !equalIntSlices(nodeIDsOf(resp.Diffs.Tree.Common), []int{1, 2}) {
		t.Errorf("common IDs = %v, want [1 2]", nodeIDsOf(resp.Diffs.Tree.Common))
	}

	// 10 is in A and B but not C → not common, but also not "only in A"
	// or "only in B". So it appears in NEITHER allocatedOnlyIn entry.
	for i, only := range resp.Diffs.Tree.AllocatedOnlyIn {
		for _, n := range only {
			if n.ID == 10 {
				t.Errorf("node 10 (in A+B, missing from C) leaked into allocatedOnlyIn[%d]", i)
			}
		}
	}

	// 20 only in A; 30 only in B; 40 only in C.
	// The mock pool round-robins calc responses across spawned subprocesses,
	// so the wire-side mapping of buildId→class isn't deterministic. What
	// IS deterministic: the union of unique nodes across all positions
	// must equal {20, 30, 40} and contain nothing else.
	gotOnly := make(map[int]bool)
	for _, list := range resp.Diffs.Tree.AllocatedOnlyIn {
		for _, n := range list {
			gotOnly[n.ID] = true
		}
	}
	want := map[int]bool{20: true, 30: true, 40: true}
	for n := range want {
		if !gotOnly[n] {
			t.Errorf("expected unique node %d in some allocatedOnlyIn entry", n)
		}
	}
	for n := range gotOnly {
		if !want[n] {
			t.Errorf("unexpected node %d in allocatedOnlyIn (should be common or A∩B etc.)", n)
		}
	}
	// Names ride along on every populated slot.
	assertNamesPopulated(t, "common", resp.Diffs.Tree.Common)
	for i, slot := range resp.Diffs.Tree.AllocatedOnlyIn {
		assertNamesPopulated(t, fmt.Sprintf("allocatedOnlyIn[%d]", i), slot)
	}
}

// TestCompareTreeDiffIdenticalTrees: every build allocates the same
// nodes → allocatedOnlyIn entries are empty, common is the full set.
func TestCompareTreeDiffIdenticalTrees(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithTree("Witch", []int{1, 2, 3}),
		calcResponseWithTree("Witch", []int{1, 2, 3}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithTree(t, rec.Body.Bytes())
	if resp.Diffs == nil || resp.Diffs.Tree == nil {
		t.Fatal("expected tree diff")
	}
	if !equalIntSlices(nodeIDsOf(resp.Diffs.Tree.Common), []int{1, 2, 3}) {
		t.Errorf("common IDs = %v, want [1 2 3]", nodeIDsOf(resp.Diffs.Tree.Common))
	}
	if got := len(resp.Diffs.Tree.AllocatedOnlyIn); got != 2 {
		t.Fatalf("allocatedOnlyIn length = %d, want 2 (parallel to builds)", got)
	}
	for i, only := range resp.Diffs.Tree.AllocatedOnlyIn {
		if len(only) != 0 {
			t.Errorf("allocatedOnlyIn[%d] should be empty for identical trees, got %v", i, only)
		}
	}
	assertNamesPopulated(t, "common", resp.Diffs.Tree.Common)
}

// TestCompareTreeDiffDisjointTrees: no node in any pair → common=[],
// allocatedOnlyIn carries each build's full list.
func TestCompareTreeDiffDisjointTrees(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithTree("Witch", []int{1, 2, 3}),
		calcResponseWithTree("Marauder", []int{10, 20, 30}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithTree(t, rec.Body.Bytes())
	if resp.Diffs == nil || resp.Diffs.Tree == nil {
		t.Fatal("expected tree diff")
	}
	if len(resp.Diffs.Tree.Common) != 0 {
		t.Errorf("common = %v, want []", resp.Diffs.Tree.Common)
	}
	if got := len(resp.Diffs.Tree.AllocatedOnlyIn); got != 2 {
		t.Fatalf("allocatedOnlyIn length = %d, want 2 (parallel to builds)", got)
	}
	if !equalIntSlices(nodeIDsOf(resp.Diffs.Tree.AllocatedOnlyIn[0]), []int{1, 2, 3}) {
		t.Errorf("allocatedOnlyIn[0] (idA) IDs = %v, want [1 2 3]", nodeIDsOf(resp.Diffs.Tree.AllocatedOnlyIn[0]))
	}
	if !equalIntSlices(nodeIDsOf(resp.Diffs.Tree.AllocatedOnlyIn[1]), []int{10, 20, 30}) {
		t.Errorf("allocatedOnlyIn[1] (idB) IDs = %v, want [10 20 30]", nodeIDsOf(resp.Diffs.Tree.AllocatedOnlyIn[1]))
	}
	for i, slot := range resp.Diffs.Tree.AllocatedOnlyIn {
		assertNamesPopulated(t, fmt.Sprintf("allocatedOnlyIn[%d]", i), slot)
	}
}

// TestCompareTreeDiffOmittedWhenDataMissing: when even one successful
// build lacks allocated_node_ids, diffs.tree is omitted (defensive —
// don't produce a misleading subset diff).
func TestCompareTreeDiffOmittedWhenDataMissing(t *testing.T) {
	withTree := calcResponseWithTree("Witch", []int{1, 2, 3})
	withoutTree := minimalCalcResponseClass("Marauder", 100000) // no tree section

	srv, idA, idB := compareHarness(t, "<A/>", "<B/>", withTree, withoutTree)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithTree(t, rec.Body.Bytes())
	if resp.Diffs == nil {
		t.Fatal("expected summary diff still computed")
	}
	if resp.Diffs.Tree != nil {
		t.Errorf("expected diffs.tree to be omitted (one build lacked data); got %+v", resp.Diffs.Tree)
	}
}

// TestCompareTreeDiffFailedBuildSlotIsEmpty: when a build in the middle
// of the request fails (unknown buildId), the diff still computes
// across the remaining successful builds AND the failed build's slot
// surfaces as [] at its original index in allocatedOnlyIn — so the
// perBuild array stays parallel to resp.Builds for any consumer
// zipping by index.
func TestCompareTreeDiffFailedBuildSlotIsEmpty(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithTree("Witch", []int{1, 2, 100}),
		calcResponseWithTree("Ranger", []int{1, 2, 200}),
	})
	pool.maxSize = 1
	pool.affinityMaxPins = 1
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xmlA := "<A/>"
	xmlC := "<C/>"
	idA := srv.cache.Put(xmlA)
	idC := srv.cache.Put(xmlC)
	_ = srv.cache.store.Put(idA, xmlA, "", "", "")
	_ = srv.cache.store.Put(idC, xmlC, "", "", "")

	// Three slots; middle one is bogus → builds[1] errors out, builds[0]
	// and builds[2] resolve normally.
	body := `{"builds":["` + idA + `","00000000000000000000000000000000","` + idC + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithTree(t, rec.Body.Bytes())
	if len(resp.Builds) != 3 {
		t.Fatalf("builds length = %d, want 3", len(resp.Builds))
	}
	if resp.Builds[1].Error == "" {
		t.Fatalf("expected builds[1] to have an error (unknown id); got %+v", resp.Builds[1])
	}
	if resp.Diffs == nil || resp.Diffs.Tree == nil {
		t.Fatalf("expected diffs.tree across the 2 successful slots; body=%s", rec.Body.String())
	}

	if got := len(resp.Diffs.Tree.AllocatedOnlyIn); got != 3 {
		t.Fatalf("allocatedOnlyIn length = %d, want 3 (parallel to builds — failed slot included)", got)
	}
	if got := resp.Diffs.Tree.AllocatedOnlyIn[1]; len(got) != 0 {
		t.Errorf("allocatedOnlyIn[1] (failed slot) = %v, want []", got)
	}

	// Successful slots' unique-node sets land at indices 0 and 2; the
	// shared {1, 2} land in common, leaving {100} unique to A and {200}
	// unique to C across the two successful positions.
	gotUnique := make(map[int]bool)
	for _, n := range resp.Diffs.Tree.AllocatedOnlyIn[0] {
		gotUnique[n.ID] = true
	}
	for _, n := range resp.Diffs.Tree.AllocatedOnlyIn[2] {
		gotUnique[n.ID] = true
	}
	if !gotUnique[100] || !gotUnique[200] {
		t.Errorf(
			"expected unique nodes 100 and 200 at successful slots; got %v",
			resp.Diffs.Tree.AllocatedOnlyIn,
		)
	}
	if !equalIntSlices(nodeIDsOf(resp.Diffs.Tree.Common), []int{1, 2}) {
		t.Errorf("common IDs = %v, want [1 2]", nodeIDsOf(resp.Diffs.Tree.Common))
	}
	// Names ride along on the successful slots; failed slot is [].
	assertNamesPopulated(t, "common", resp.Diffs.Tree.Common)
	assertNamesPopulated(t, "allocatedOnlyIn[0]", resp.Diffs.Tree.AllocatedOnlyIn[0])
	assertNamesPopulated(t, "allocatedOnlyIn[2]", resp.Diffs.Tree.AllocatedOnlyIn[2])
}

// nodeIDsOf extracts just the IDs from a wire-decoded allocatedNode
// slice so existing equalIntSlices assertions stay terse.
func nodeIDsOf(nodes []allocatedNodeOnWire) []int {
	out := make([]int, len(nodes))
	for i, n := range nodes {
		out[i] = n.ID
	}
	return out
}

// assertNamesPopulated fails the test if any wire-decoded allocatedNode
// has an empty Name field. Empty Name means the diff carried IDs but
// dropped names somewhere in the wrapper.lua → Go → wire chain — which
// is the exact regression this epic is shipping to prevent.
func assertNamesPopulated(t *testing.T, label string, nodes []allocatedNodeOnWire) {
	t.Helper()
	for i, n := range nodes {
		if n.Name == "" {
			t.Errorf("%s[%d] (id=%d): Name is empty — wrapper.lua → Go contract requires id+name to travel together",
				label, i, n.ID)
		}
	}
}

func equalIntSlices(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
