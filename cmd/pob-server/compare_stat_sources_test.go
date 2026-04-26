package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// calcResponseWithStatSources returns a wrapper.lua-shaped response with a
// custom statSources block populated. Mirrors calcResponseWithItems /
// calcResponseWithConfig from sibling test files.
func calcResponseWithStatSources(class string, statSources map[string][]map[string]any) string {
	statJSON, _ := json.Marshal(statSources)
	return `{"type":"result","data":{` +
		`"character":{"class":"` + class + `","ascendancy":"X","level":99},` +
		`"summary":{"CombinedDPS":100000,"Life":6000,"LifeUnreserved":6000,"LifeUnreservedPercent":100,` +
		`"EnergyShield":0,"Mana":500,"Armour":0,"Evasion":0,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":0,"SpellSuppressionChance":0,"MovementSpeedMod":1,` +
		`"Str":100,"Dex":100,"Int":100,"FlaskEffect":0,"FlaskChargeGen":0,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":100000},` +
		`"section_index":[],"sections":{},` +
		`"statSources":` + string(statJSON) + `}}`
}

// compareRespWithStatSources is a minimal decoder shape exposing only the
// per-build statSources field — enough to assert hydration without
// pulling in the full diffs/buySimilar surface.
type compareRespWithStatSources struct {
	Builds []struct {
		ID          string                       `json:"id"`
		Label       string                       `json:"label"`
		StatSources map[string][]map[string]any  `json:"statSources"`
		Error       string                       `json:"error"`
	} `json:"builds"`
}

func decodeCompareWithStatSources(t *testing.T, body []byte) compareRespWithStatSources {
	t.Helper()
	var resp compareRespWithStatSources
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

// TestCompareWithModSourcesPopulatesPerBuildStatSources: per-build
// statSources from wrapper.lua flows through hydration into the
// response. Each successful build entry exposes the requested stat's
// source rows.
func TestCompareWithModSourcesPopulatesPerBuildStatSources(t *testing.T) {
	respA := calcResponseWithStatSources("Witch", map[string][]map[string]any{
		"Life": {
			{"source_type": "Tree", "source_name": "Cruel Preparation", "mod_name": "Life", "mod_type": "BASE", "value": 50.0},
			{"source_type": "Item", "source_name": "Belly of the Beast", "mod_name": "Life", "mod_type": "INC", "value": 40.0},
		},
	})
	respB := calcResponseWithStatSources("Marauder", map[string][]map[string]any{
		"Life": {
			{"source_type": "Tree", "source_name": "Heart of the Warrior", "mod_name": "Life", "mod_type": "INC", "value": 30.0},
		},
	})
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>", respA, respB)
	body := `{"builds":["` + idA + `","` + idB + `"],"modSources":["Life"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithStatSources(t, rec.Body.Bytes())
	if len(resp.Builds) != 2 {
		t.Fatalf("expected 2 builds, got %d", len(resp.Builds))
	}
	for i, b := range resp.Builds {
		if len(b.StatSources["Life"]) == 0 {
			t.Errorf("build[%d].statSources.Life is empty: %+v", i, b)
		}
	}
}

// TestCompareWithModSourcesPropagatesToCalcRequest: each per-build calc
// request to wrapper.lua carries stat_sources with the same stats list
// + limit so the wrapper's injectStatSources runs against the right
// stats for every build in the fanout.
func TestCompareWithModSourcesPropagatesToCalcRequest(t *testing.T) {
	respA := calcResponseWithStatSources("Witch", map[string][]map[string]any{
		"Life": {{"source_type": "Tree", "source_name": "x", "mod_name": "Life", "mod_type": "BASE", "value": 50.0}},
	})
	respB := calcResponseWithStatSources("Marauder", map[string][]map[string]any{
		"Life": {{"source_type": "Tree", "source_name": "y", "mod_name": "Life", "mod_type": "BASE", "value": 60.0}},
	})
	pool, captured := captureMockPool(t, []string{respA, respB})
	pool.maxSize = 2 // allow 2 parallel pool slots, compareSlots = max(1, 2-1)=1 → serial dispatch keeps capture order deterministic
	pool.affinityMaxPins = 2
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	idA := srv.cache.Put("<A/>")
	idB := srv.cache.Put("<B/>")
	for _, id := range []string{idA, idB} {
		_ = srv.cache.store.Put(id, "<x/>", "", "", "")
	}

	body := `{"builds":["` + idA + `","` + idB + `"],"modSources":["Life","CombinedDPS"],"modSourcesLimit":7}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	requests := captured()
	if len(requests) != 2 {
		t.Fatalf("expected 2 captured requests, got %d", len(requests))
	}
	for i, req := range requests {
		statSources, ok := req["stat_sources"].(map[string]any)
		if !ok {
			t.Errorf("request[%d] missing stat_sources: %+v", i, req)
			continue
		}
		stats, _ := statSources["stats"].([]any)
		if len(stats) != 2 {
			t.Errorf("request[%d] stat_sources.stats len = %d, want 2", i, len(stats))
		}
		if limit, _ := statSources["limit"].(float64); limit != 7 {
			t.Errorf("request[%d] stat_sources.limit = %v, want 7", i, limit)
		}
	}
}

// TestCompareModSourcesLimitOverCapRejected: limit > 50 returns 400 —
// matches the /resolve and /modify behavior from slice 3.
func TestCompareModSourcesLimitOverCapRejected(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 200000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"],"modSources":["Life"],"modSourcesLimit":51}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestCompareWithoutModSourcesOmitsField: regression guard. Each
// captured calc request stays free of stat_sources when ModSources is
// absent — keeps wrapper.lua's opt-in path clean and matches the
// /modify equivalent test from slice 3.
func TestCompareWithoutModSourcesOmitsField(t *testing.T) {
	pool, captured := captureMockPool(t, []string{
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 200000),
	})
	pool.maxSize = 2
	pool.affinityMaxPins = 2
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	idA := srv.cache.Put("<A/>")
	idB := srv.cache.Put("<B/>")
	for _, id := range []string{idA, idB} {
		_ = srv.cache.store.Put(id, "<x/>", "", "", "")
	}

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	requests := captured()
	for i, req := range requests {
		if _, present := req["stat_sources"]; present {
			t.Errorf("request[%d] should not carry stat_sources: %+v", i, req["stat_sources"])
		}
	}
}

// TestCompareWithModSourcesBypassesCachedSummary: cached buildIds with
// stored summaries normally skip the calc round-trip. When ModSources
// is set, the cached summary lacks source data, so the engine must
// still dispatch a fresh calc — same opt-in cache-bypass behavior as
// /resolve from slice 3.
func TestCompareWithModSourcesBypassesCachedSummary(t *testing.T) {
	respA := calcResponseWithStatSources("Witch", map[string][]map[string]any{
		"Life": {{"source_type": "Tree", "source_name": "x", "mod_name": "Life", "mod_type": "BASE", "value": 50.0}},
	})
	respB := calcResponseWithStatSources("Marauder", map[string][]map[string]any{
		"Life": {{"source_type": "Tree", "source_name": "y", "mod_name": "Life", "mod_type": "BASE", "value": 60.0}},
	})
	pool, captured := captureMockPool(t, []string{respA, respB})
	pool.maxSize = 2
	pool.affinityMaxPins = 2
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	idA := srv.cache.Put("<A/>")
	idB := srv.cache.Put("<B/>")
	// Stored summary present — without ModSources this would skip calc.
	storedSummary := `{"summary":{"Life":5000},"character":{"class":"Witch","ascendancy":"X","level":99}}`
	for _, id := range []string{idA, idB} {
		_ = srv.cache.store.Put(id, "<x/>", storedSummary, "", "")
	}

	body := `{"builds":["` + idA + `","` + idB + `"],"modSources":["Life"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	requests := captured()
	if len(requests) != 2 {
		t.Errorf("cache should have been bypassed; expected 2 calc dispatches, got %d", len(requests))
	}
}
