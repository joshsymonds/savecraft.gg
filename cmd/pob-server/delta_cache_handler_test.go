package main

import (
	"net/http/httptest"
	"testing"
)

const perturbCanned = `{"type":"result","data":{"deltas":{"100":{"DPS":500,"Life":50},"200":{"DPS":700,"Life":30}}}}`

// TestNearbyPerturbCacheHitSkipsSecondPerturb: a second runNearbyPerturb call
// with identical (build, candidate, metric) inputs must cache-hit and skip
// the Send round-trip entirely.
func TestNearbyPerturbCacheHitSkipsSecondPerturb(t *testing.T) {
	pool, captured := captureMockPool(t, []string{perturbCanned})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	proc, err := pool.Acquire()
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Release(proc)

	candidates := []*nearbyCandidate{{ID: 100}, {ID: 200}}
	statKeys := []string{"DPS", "Life"}

	// First call: cache cold, perturb runs, deltas cached.
	rec1 := httptest.NewRecorder()
	deltas1, ok := srv.runNearbyPerturb(rec1, proc, "build-A", candidates, statKeys)
	if !ok {
		t.Fatalf("first call failed: %s", rec1.Body.String())
	}
	if deltas1[100]["DPS"] != 500 || deltas1[200]["Life"] != 30 {
		t.Fatalf("first call deltas wrong: %+v", deltas1)
	}

	// Second call: cache warm, no perturb expected.
	rec2 := httptest.NewRecorder()
	deltas2, ok := srv.runNearbyPerturb(rec2, proc, "build-A", candidates, statKeys)
	if !ok {
		t.Fatalf("second call failed: %s", rec2.Body.String())
	}
	if deltas2[100]["DPS"] != 500 || deltas2[200]["Life"] != 30 {
		t.Fatalf("second call deltas wrong (should match cached): %+v", deltas2)
	}

	if len(captured()) != 1 {
		t.Fatalf("expected exactly 1 perturb request after the second call (cache hit), got %d", len(captured()))
	}
}

// TestNearbyPerturbCachePartialHitPerturbsOnlyMisses: when one candidate has
// fully-cached metrics and another doesn't, only the second is sent.
func TestNearbyPerturbCachePartialHitPerturbsOnlyMisses(t *testing.T) {
	// Mock returns a delta for ONLY node 200. Node 100 is pre-seeded.
	pool, captured := captureMockPool(t, []string{`{"type":"result","data":{"deltas":{"200":{"DPS":700}}}}`})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	// Pre-seed cache for node 100.
	if err := srv.cache.store.PutDelta("build-A", 100, "DPS", 999); err != nil {
		t.Fatal(err)
	}

	proc, _ := pool.Acquire()
	defer pool.Release(proc)

	candidates := []*nearbyCandidate{{ID: 100}, {ID: 200}}
	rec := httptest.NewRecorder()
	deltas, ok := srv.runNearbyPerturb(rec, proc, "build-A", candidates, []string{"DPS"})
	if !ok {
		t.Fatalf("failed: %s", rec.Body.String())
	}

	if deltas[100]["DPS"] != 999 {
		t.Errorf("node 100 should come from cache (999), got %v", deltas[100]["DPS"])
	}
	if deltas[200]["DPS"] != 700 {
		t.Errorf("node 200 should come from perturb (700), got %v", deltas[200]["DPS"])
	}

	// Verify the perturb request only included node 200.
	requests := captured()
	if len(requests) != 1 {
		t.Fatalf("expected 1 perturb request, got %d", len(requests))
	}
	rawIDs := requests[0]["nodeIds"]
	idsList, ok := rawIDs.([]any)
	if !ok {
		t.Fatalf("nodeIds wrong shape: %T %+v", rawIDs, rawIDs)
	}
	if len(idsList) != 1 {
		t.Fatalf("expected 1 node in perturb, got %d: %+v", len(idsList), idsList)
	}
	if int(idsList[0].(float64)) != 200 {
		t.Fatalf("expected only node 200 in perturb, got %v", idsList[0])
	}
}

// TestNearbyPerturbNoStoreFallsThrough: when srv.cache.store is nil, perturb
// runs unchanged (no cache lookup, no cache write).
func TestNearbyPerturbNoStoreFallsThrough(t *testing.T) {
	pool, captured := captureMockPool(t, []string{perturbCanned, perturbCanned})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool) // store left nil

	proc, _ := pool.Acquire()
	defer pool.Release(proc)

	candidates := []*nearbyCandidate{{ID: 100}, {ID: 200}}
	rec1 := httptest.NewRecorder()
	if _, ok := srv.runNearbyPerturb(rec1, proc, "build-A", candidates, []string{"DPS"}); !ok {
		t.Fatal(rec1.Body.String())
	}
	rec2 := httptest.NewRecorder()
	if _, ok := srv.runNearbyPerturb(rec2, proc, "build-A", candidates, []string{"DPS"}); !ok {
		t.Fatal(rec2.Body.String())
	}

	if len(captured()) != 2 {
		t.Fatalf("expected 2 perturb requests with no store, got %d", len(captured()))
	}
}

// TestNearbyPerturbBuildIsolation: cache hits only when the SAME build_id is
// used. A different build_id forces a fresh perturb.
func TestNearbyPerturbBuildIsolation(t *testing.T) {
	pool, captured := captureMockPool(t, []string{perturbCanned, perturbCanned})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	proc, _ := pool.Acquire()
	defer pool.Release(proc)

	candidates := []*nearbyCandidate{{ID: 100}, {ID: 200}}

	// First call with build A — caches.
	rec1 := httptest.NewRecorder()
	if _, ok := srv.runNearbyPerturb(rec1, proc, "build-A", candidates, []string{"DPS"}); !ok {
		t.Fatal(rec1.Body.String())
	}

	// Second call with DIFFERENT build B — must re-perturb (fresh cache key space).
	rec2 := httptest.NewRecorder()
	if _, ok := srv.runNearbyPerturb(rec2, proc, "build-B", candidates, []string{"DPS"}); !ok {
		t.Fatal(rec2.Body.String())
	}

	if len(captured()) != 2 {
		t.Fatalf("expected 2 perturb requests across distinct builds, got %d", len(captured()))
	}
}
