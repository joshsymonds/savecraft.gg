package main

import (
	"net/http/httptest"
	"sync"
	"testing"
)

// TestModSourceIndexKnownPrimaryAffects: a node whose stat description
// mentions a primary stat keyword affects that primary stat.
func TestModSourceIndexKnownPrimaryAffects(t *testing.T) {
	idx := NewModSourceIndex()

	cases := []struct {
		stats   []string
		metric  string
		expect  bool
		comment string
	}{
		{[]string{"+10 to maximum Life"}, "Life", true, "direct primary mod"},
		{[]string{"+5% increased maximum Life"}, "Life", true, "increased primary"},
		{[]string{"+12% to Fire Resistance"}, "FireResist", true, "explicit resist phrasing"},
		{[]string{"+12% to Fire Resistance"}, "ColdResist", false, "different resist"},
		{[]string{"+30 to Strength"}, "Strength", true, "attribute"},
		{[]string{"+8% to all Elemental Resistances"}, "FireResist", true, "all-resist umbrella"},
		{[]string{"+8% to all Elemental Resistances"}, "ColdResist", true, "all-resist umbrella cold"},
		{[]string{"+8% to all Elemental Resistances"}, "ChaosResist", false, "all-elemental does not include chaos"},
		{[]string{"+15 to Energy Shield"}, "EnergyShield", true, "direct ES"},
		{[]string{"+5% increased Mana"}, "Mana", true, "mana"},
	}
	for _, tc := range cases {
		got := idx.NodeAffectsMetric(tc.stats, "", tc.metric)
		if got != tc.expect {
			t.Errorf("[%s] stats=%v metric=%s: got %v, want %v", tc.comment, tc.stats, tc.metric, got, tc.expect)
		}
	}
}

// TestModSourceIndexUnknownMetricConservative: an unknown metric (e.g. a
// derived stat the index doesn't classify) returns true unconditionally —
// safer to perturb than to skip a node that might affect the metric.
func TestModSourceIndexUnknownMetricConservative(t *testing.T) {
	idx := NewModSourceIndex()
	if !idx.NodeAffectsMetric([]string{"+10 to maximum Life"}, "", "CombinedDPS") {
		t.Fatal("expected unknown metric to fall through (conservative true)")
	}
	if !idx.NodeAffectsMetric([]string{}, "", "EHP") {
		t.Fatal("expected unknown metric on empty stats to fall through")
	}
	if !idx.NodeAffectsMetric([]string{"+10 to maximum Life"}, "", "ItemQuantity") {
		t.Fatal("expected unfamiliar metric to fall through")
	}
}

// TestModSourceIndexKeystoneAlwaysTrue: keystone-type nodes can have
// indirect effects via PoB's calc graph (e.g. Avatar of Fire converts
// Phys to Fire, affecting Fire Damage even though "Fire" isn't in the
// stat string). Default: keystones always pass-through.
func TestModSourceIndexKeystoneAlwaysTrue(t *testing.T) {
	idx := NewModSourceIndex()
	// Even for a known primary metric, a keystone-typed node passes-through.
	if !idx.NodeAffectsMetric([]string{"Avatar of Fire description text"}, "Keystone", "Life") {
		t.Fatal("keystone-type node must pass-through even for primary metric")
	}
}

// TestModSourceIndexEmptyStatsConservative: defensive — a node with no
// stat strings (corrupt or rare) passes through.
func TestModSourceIndexEmptyStatsConservative(t *testing.T) {
	idx := NewModSourceIndex()
	if !idx.NodeAffectsMetric(nil, "", "Life") {
		t.Fatal("nil stats should pass-through")
	}
	if !idx.NodeAffectsMetric([]string{}, "Notable", "Life") {
		t.Fatal("empty stats should pass-through")
	}
}

// TestModSourceIndexConcurrent: NodeAffectsMetric is safe to call from
// many goroutines concurrently.
func TestModSourceIndexConcurrent(t *testing.T) {
	idx := NewModSourceIndex()
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 1000 {
				_ = idx.NodeAffectsMetric([]string{"+10 to maximum Life"}, "", "Life")
				_ = idx.NodeAffectsMetric([]string{"+10 to Strength"}, "", "FireResist")
			}
		}()
	}
	wg.Wait()
}

// TestModSourceIndexCaseInsensitive: PoB's stat descriptions are
// title-case but matchers are case-insensitive for robustness.
func TestModSourceIndexCaseInsensitive(t *testing.T) {
	idx := NewModSourceIndex()
	if !idx.NodeAffectsMetric([]string{"INCREASED LIFE"}, "", "Life") {
		t.Error("uppercase should still match")
	}
	if !idx.NodeAffectsMetric([]string{"increased life"}, "", "Life") {
		t.Error("lowercase should still match")
	}
}

// TestNearbyPerturbModIndexFilter: when ModSourceIndex is wired up,
// candidates whose stats clearly don't affect the requested metric are
// dropped before perturbation. Cache + index combined: cached nodes skip
// perturb; mod-irrelevant nodes also skip perturb without caching (delta
// is provably zero).
func TestNearbyPerturbModIndexFilter(t *testing.T) {
	// Mock returns deltas only for node 100 (the relevant Life node).
	pool, captured := captureMockPool(t, []string{`{"type":"result","data":{"deltas":{"100":{"Life":50}}}}`})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)
	srv.modIndex = NewModSourceIndex()

	proc, _ := pool.Acquire()
	defer pool.Release(proc)

	candidates := []*nearbyCandidate{
		{ID: 100, Stats: []string{"+10 to maximum Life"}},
		{ID: 200, Stats: []string{"+12% to Fire Resistance"}}, // irrelevant for Life metric
	}
	rec := httptest.NewRecorder()
	deltas, ok := srv.runNearbyPerturb(rec, proc, "build-A", candidates, []string{"Life"})
	if !ok {
		t.Fatalf("perturb failed: %s", rec.Body.String())
	}

	// Only node 100 should have a delta (perturbed).
	// Node 200 was filtered out by the mod index — no delta in the result.
	if deltas[100]["Life"] != 50 {
		t.Errorf("node 100 should be perturbed: %+v", deltas)
	}
	if _, exists := deltas[200]; exists {
		t.Errorf("node 200 should have been filtered out (no Life mod): %+v", deltas)
	}

	// Verify the perturb request only included node 100.
	requests := captured()
	if len(requests) != 1 {
		t.Fatalf("expected 1 perturb request, got %d", len(requests))
	}
	rawIDs := requests[0]["nodeIds"]
	idsList, _ := rawIDs.([]any)
	if len(idsList) != 1 || int(idsList[0].(float64)) != 100 {
		t.Fatalf("expected only node 100 in perturb, got %+v", idsList)
	}
}
