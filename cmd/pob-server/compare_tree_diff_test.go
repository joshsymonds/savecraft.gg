package main

import (
	"encoding/json"
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
	AllocatedOnlyIn map[string][]int `json:"allocatedOnlyIn"`
	Common          []int            `json:"common"`
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
// per-build tree.allocated_node_ids list. Used to drive the diff
// computation in tests without needing the real Lua subprocess.
func calcResponseWithTree(class string, allocatedIDs []int) string {
	idsJSON, _ := json.Marshal(allocatedIDs)
	return `{"type":"result","data":{` +
		`"character":{"class":"` + class + `","ascendancy":"X","level":99},` +
		`"summary":{"CombinedDPS":100000,"Life":6000,"LifeUnreserved":6000,"LifeUnreservedPercent":100,` +
		`"EnergyShield":0,"Mana":500,"Armour":0,"Evasion":0,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":0,"SpellSuppressionChance":0,"MovementSpeedMod":1,` +
		`"Str":100,"Dex":100,"Int":100,"FlaskEffect":0,"FlaskChargeGen":0,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":100000},` +
		`"section_index":[],"sections":{"tree":{"version":"3.28","allocated_nodes":3,"allocatedNodeIds":` + string(idsJSON) + `}}}}`
}

// TestCompareTreeDiffN2: two builds with overlapping allocated nodes
// produce {allocatedOnlyIn: {idA: [unique-A], idB: [unique-B]}, common}.
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

	if !equalIntSlices(resp.Diffs.Tree.Common, []int{3, 4}) {
		t.Errorf("common = %v, want [3 4]", resp.Diffs.Tree.Common)
	}
	if !equalIntSlices(resp.Diffs.Tree.AllocatedOnlyIn[idA], []int{1, 2}) {
		t.Errorf("allocatedOnlyIn[A] = %v, want [1 2]", resp.Diffs.Tree.AllocatedOnlyIn[idA])
	}
	if !equalIntSlices(resp.Diffs.Tree.AllocatedOnlyIn[idB], []int{5, 6}) {
		t.Errorf("allocatedOnlyIn[B] = %v, want [5 6]", resp.Diffs.Tree.AllocatedOnlyIn[idB])
	}
}

// TestCompareTreeDiffN3: three builds; common is only nodes in ALL
// three; allocatedOnlyIn[buildID] is nodes in EXACTLY that build.
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

	// Common = {1, 2} (in all three)
	if !equalIntSlices(resp.Diffs.Tree.Common, []int{1, 2}) {
		t.Errorf("common = %v, want [1 2]", resp.Diffs.Tree.Common)
	}

	// 10 is in A and B but not C → not common, but also not "only in A"
	// or "only in B". So it appears in NEITHER allocatedOnlyIn entry.
	for buildID, only := range resp.Diffs.Tree.AllocatedOnlyIn {
		for _, n := range only {
			if n == 10 {
				t.Errorf("node 10 (in A+B, missing from C) leaked into allocatedOnlyIn[%s]", buildID)
			}
		}
	}

	// 20 only in A; 30 only in B; 40 only in C.
	checkOnly := func(label, buildID string, want int) {
		t.Helper()
		got := resp.Diffs.Tree.AllocatedOnlyIn[buildID]
		found := false
		for _, n := range got {
			if n == want {
				found = true
			}
		}
		if !found {
			t.Errorf("expected node %d in allocatedOnlyIn[%s] (%s); got %v", want, buildID, label, got)
		}
	}
	// We don't know which slot maps to which build (mock-pool round-robins
	// responses), so we look up by the responded character class. But the
	// test setup associates buildIds with XMLs, not with class names —
	// we'd need to inspect the response to know.
	//
	// Instead, verify the EXISTENCE of single-build-only nodes 20, 30, 40
	// across the response: the union of all allocatedOnlyIn entries
	// should contain {20, 30, 40} and nothing else.
	gotOnly := make(map[int]bool)
	for _, list := range resp.Diffs.Tree.AllocatedOnlyIn {
		for _, n := range list {
			gotOnly[n] = true
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

	// Avoid unused-helper warning when we couldn't run checkOnly.
	_ = checkOnly
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
	if !equalIntSlices(resp.Diffs.Tree.Common, []int{1, 2, 3}) {
		t.Errorf("common = %v, want [1 2 3]", resp.Diffs.Tree.Common)
	}
	for buildID, only := range resp.Diffs.Tree.AllocatedOnlyIn {
		if len(only) != 0 {
			t.Errorf("allocatedOnlyIn[%s] should be empty for identical trees, got %v", buildID, only)
		}
	}
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
	if !equalIntSlices(resp.Diffs.Tree.AllocatedOnlyIn[idA], []int{1, 2, 3}) {
		t.Errorf("allocatedOnlyIn[A] = %v, want [1 2 3]", resp.Diffs.Tree.AllocatedOnlyIn[idA])
	}
	if !equalIntSlices(resp.Diffs.Tree.AllocatedOnlyIn[idB], []int{10, 20, 30}) {
		t.Errorf("allocatedOnlyIn[B] = %v, want [10 20 30]", resp.Diffs.Tree.AllocatedOnlyIn[idB])
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
