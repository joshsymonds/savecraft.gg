package main

import (
	"testing"
)

// TestEnsureQueryModsLoadedDecodesWrapperResponse round-trips a canned
// dump_query_mods response through the production loader so the wire
// contract between wrapper.lua and Go is locked at the unit-test level.
//
// Without this test, a future drift in the field name (`data.lookup`
// → `data.entries` etc.) would silently leave srv.queryMods nil and
// degrade buy-similar to "trade_stats only" — which is exactly the v1
// mod-ID gap that closing slice c1 was meant to fix. The integration
// test (TestDumpQueryModsAgainstRealPoB) only runs with LuaJIT + PoB
// on PATH; this is the cheap default-suite ground truth.
func TestEnsureQueryModsLoadedDecodesWrapperResponse(t *testing.T) {
	dumpResponse := `{"type":"result","data":{"lookup":{` +
		`"+# to maximum Life|explicit":"explicit.stat_test_life",` +
		`"#% increased Cold Damage|explicit":"explicit.stat_test_cold"` +
		`}}}`
	pool, _ := captureMockPool(t, []string{dumpResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)

	srv.ensureQueryModsLoaded()

	if srv.queryMods == nil {
		t.Fatal("srv.queryMods nil after ensureQueryModsLoaded — wire decoder probably missed data.lookup")
	}
	if got := srv.queryMods["+# to maximum Life|explicit"]; got != "explicit.stat_test_life" {
		t.Errorf("queryMods[Life key] = %q, want explicit.stat_test_life", got)
	}
	if got := srv.queryMods["#% increased Cold Damage|explicit"]; got != "explicit.stat_test_cold" {
		t.Errorf("queryMods[Cold key] = %q, want explicit.stat_test_cold", got)
	}
}

// TestEnsureQueryModsLoadedToleratesNonResultResponse: a wrapper.lua
// error or unexpected envelope must NOT panic and must leave
// srv.queryMods nil so the next caller can retry. Documents the
// graceful-degradation contract.
func TestEnsureQueryModsLoadedToleratesNonResultResponse(t *testing.T) {
	errResponse := `{"type":"error","message":"synthetic dump failure"}`
	pool, _ := captureMockPool(t, []string{errResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)

	srv.ensureQueryModsLoaded()

	if srv.queryMods != nil {
		t.Errorf("srv.queryMods should remain nil on non-result response (so a retry can populate it later); got %d entries", len(srv.queryMods))
	}
}
