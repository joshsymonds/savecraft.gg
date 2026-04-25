package main

import (
	"path/filepath"
	"sync"
	"testing"
)

func newTestStore(t *testing.T) (*BuildStore, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := NewBuildStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	return store, dbPath
}

// TestDeltaCachePutGetRoundTrip: Put then Get returns the value.
func TestDeltaCachePutGetRoundTrip(t *testing.T) {
	store, _ := newTestStore(t)

	if err := store.PutDelta("build-A", 12345, "CombinedDPS", 1234.5); err != nil {
		t.Fatal(err)
	}

	v, ok, err := store.GetDelta("build-A", 12345, "CombinedDPS")
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("expected hit, got miss")
	}
	if v != 1234.5 {
		t.Fatalf("expected 1234.5, got %v", v)
	}
}

// TestDeltaCacheMissReturnsFalse: GetDelta on absent triple returns ok=false.
func TestDeltaCacheMissReturnsFalse(t *testing.T) {
	store, _ := newTestStore(t)

	v, ok, err := store.GetDelta("build-X", 999, "Life")
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatalf("expected miss, got hit with value %v", v)
	}
}

// TestDeltaCacheBulkPutGet: PutDeltasBatch + GetDeltasBatch round-trip,
// returning hits keyed by (node, metric) and a list of misses.
func TestDeltaCacheBulkPutGet(t *testing.T) {
	store, _ := newTestStore(t)

	// Put a small batch.
	deltas := map[int]map[string]float64{
		100: {"CombinedDPS": 5000, "Life": 50},
		200: {"CombinedDPS": 8000, "Life": 30, "EnergyShield": 12},
	}
	if err := store.PutDeltasBatch("build-A", deltas); err != nil {
		t.Fatal(err)
	}

	// Query for a mix of present and absent (node, metric) pairs.
	lookups := []deltaLookup{
		{NodeID: 100, Metric: "CombinedDPS"},
		{NodeID: 100, Metric: "Life"},
		{NodeID: 100, Metric: "EnergyShield"}, // absent for node 100
		{NodeID: 200, Metric: "EnergyShield"},
		{NodeID: 999, Metric: "CombinedDPS"}, // absent node entirely
	}
	hits, misses, err := store.GetDeltasBatch("build-A", lookups)
	if err != nil {
		t.Fatal(err)
	}
	if got := hits[100]["CombinedDPS"]; got != 5000 {
		t.Errorf("hits[100][CombinedDPS] = %v, want 5000", got)
	}
	if got := hits[100]["Life"]; got != 50 {
		t.Errorf("hits[100][Life] = %v, want 50", got)
	}
	if got := hits[200]["EnergyShield"]; got != 12 {
		t.Errorf("hits[200][EnergyShield] = %v, want 12", got)
	}
	// Misses should contain exactly the two absent pairs (order preserved).
	if len(misses) != 2 {
		t.Fatalf("misses = %v, want 2 entries", misses)
	}
	expectMisses := map[deltaLookup]bool{
		{NodeID: 100, Metric: "EnergyShield"}: true,
		{NodeID: 999, Metric: "CombinedDPS"}:  true,
	}
	for _, m := range misses {
		if !expectMisses[m] {
			t.Errorf("unexpected miss %+v", m)
		}
	}
}

// TestDeltaCacheMetricsCoexist: same (build, node) under different metrics
// stays separate.
func TestDeltaCacheMetricsCoexist(t *testing.T) {
	store, _ := newTestStore(t)

	if err := store.PutDelta("b", 1, "CombinedDPS", 100); err != nil {
		t.Fatal(err)
	}
	if err := store.PutDelta("b", 1, "Life", 200); err != nil {
		t.Fatal(err)
	}
	if err := store.PutDelta("b", 1, "EnergyShield", 300); err != nil {
		t.Fatal(err)
	}

	checks := map[string]float64{"CombinedDPS": 100, "Life": 200, "EnergyShield": 300}
	for metric, want := range checks {
		v, ok, err := store.GetDelta("b", 1, metric)
		if err != nil {
			t.Fatal(err)
		}
		if !ok || v != want {
			t.Errorf("(b, 1, %s) = (%v, %v), want (%v, true)", metric, v, ok, want)
		}
	}
}

// TestDeltaCachePersistsAcrossReopen: closing and reopening the store with
// the same path preserves cached deltas.
func TestDeltaCachePersistsAcrossReopen(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "persist.db")

	store1, err := NewBuildStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := store1.PutDelta("build-P", 42, "CombinedDPS", 999.5); err != nil {
		t.Fatal(err)
	}
	store1.Close()

	store2, err := NewBuildStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store2.Close()

	v, ok, err := store2.GetDelta("build-P", 42, "CombinedDPS")
	if err != nil {
		t.Fatal(err)
	}
	if !ok || v != 999.5 {
		t.Fatalf("after reopen: got (%v, %v), want (999.5, true)", v, ok)
	}
}

// TestDeltaCacheBuildIsolation: same (node, metric) under different builds
// stays distinct.
func TestDeltaCacheBuildIsolation(t *testing.T) {
	store, _ := newTestStore(t)

	if err := store.PutDelta("A", 1, "Life", 100); err != nil {
		t.Fatal(err)
	}
	if err := store.PutDelta("B", 1, "Life", 200); err != nil {
		t.Fatal(err)
	}

	if v, _, _ := store.GetDelta("A", 1, "Life"); v != 100 {
		t.Errorf("(A, 1, Life) = %v, want 100", v)
	}
	if v, _, _ := store.GetDelta("B", 1, "Life"); v != 200 {
		t.Errorf("(B, 1, Life) = %v, want 200", v)
	}
}

// TestDeltaCacheConcurrent: concurrent Put/Get on the same store is race-free.
func TestDeltaCacheConcurrent(t *testing.T) {
	store, _ := newTestStore(t)

	var wg sync.WaitGroup
	for w := range 8 {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for i := range 50 {
				nodeID := worker*100 + i
				_ = store.PutDelta("build-C", nodeID, "CombinedDPS", float64(i))
				_, _, _ = store.GetDelta("build-C", nodeID, "CombinedDPS")
			}
		}(w)
	}
	wg.Wait()

	// Spot-check: worker 0's last entry must be readable.
	v, ok, err := store.GetDelta("build-C", 49, "CombinedDPS")
	if err != nil {
		t.Fatal(err)
	}
	if !ok || v != 49 {
		t.Fatalf("after concurrent run, got (%v, %v), want (49, true)", v, ok)
	}
}

// TestDeltaCacheEmptyBatch: no-op for empty input, no error.
func TestDeltaCacheEmptyBatch(t *testing.T) {
	store, _ := newTestStore(t)

	if err := store.PutDeltasBatch("build-A", nil); err != nil {
		t.Fatal(err)
	}
	if err := store.PutDeltasBatch("build-A", map[int]map[string]float64{}); err != nil {
		t.Fatal(err)
	}
	hits, misses, err := store.GetDeltasBatch("build-A", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 0 {
		t.Errorf("expected empty hits, got %v", hits)
	}
	if len(misses) != 0 {
		t.Errorf("expected empty misses, got %v", misses)
	}
}
