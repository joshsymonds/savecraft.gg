package main

import (
	"testing"
)

// TestCompareCacheVersionInvalidatesStaleEntries reproduces the
// production-observed cache-staleness bug end-to-end. Pre-deploy
// cached entries (version 0) must trigger a fresh wrapper.lua calc
// rather than returning stale-shape data.
//
// Scenario:
//  1. Seed XML for both fixture buildIds into the in-memory cache.
//  2. Call /compare once — fresh calc, store records the entries with
//     the current wrapper_schema_version.
//  3. Manually set both stored rows back to version=0 to simulate the
//     pre-deploy state.
//  4. Call /compare again — must re-fresh-calc (cache miss on version
//     mismatch) and rewrite the rows with the current version.
func TestCompareCacheVersionInvalidatesStaleEntries(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	// First call: cold cache → fresh calc → store records version=current.
	first := postCompare(t, ts, map[string]any{"builds": []string{idA, idB}})
	if len(first.Builds) != 2 {
		t.Fatalf("first call: expected 2 builds, got %d", len(first.Builds))
	}
	if v := readBuildSchemaVersionForTest(t, srv.cache.store, idA); v != wrapperSchemaVersion {
		t.Errorf("after first call idA: expected version=%d, got %d", wrapperSchemaVersion, v)
	}
	if v := readBuildSchemaVersionForTest(t, srv.cache.store, idB); v != wrapperSchemaVersion {
		t.Errorf("after first call idB: expected version=%d, got %d", wrapperSchemaVersion, v)
	}

	// Simulate pre-deploy state: mark both rows version=0.
	setBuildSchemaVersionForTest(t, srv.cache.store, idA)
	setBuildSchemaVersionForTest(t, srv.cache.store, idB)

	// Second call: cache must miss on version mismatch → fresh calc → re-store.
	second := postCompare(t, ts, map[string]any{"builds": []string{idA, idB}})
	if len(second.Builds) != 2 {
		t.Fatalf("second call: expected 2 builds, got %d", len(second.Builds))
	}
	if v := readBuildSchemaVersionForTest(t, srv.cache.store, idA); v != wrapperSchemaVersion {
		t.Errorf(
			"after second call idA: expected version=%d (rewrite), got %d — cache fast-path took stale row",
			wrapperSchemaVersion, v,
		)
	}
	if v := readBuildSchemaVersionForTest(t, srv.cache.store, idB); v != wrapperSchemaVersion {
		t.Errorf(
			"after second call idB: expected version=%d (rewrite), got %d — cache fast-path took stale row",
			wrapperSchemaVersion, v,
		)
	}
}
