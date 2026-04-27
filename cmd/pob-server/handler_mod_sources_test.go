package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// TestResolveWithModSourcesBypassesCache: when modSources is set, the
// cached early-return path is skipped and the request goes through the
// PoB calc subprocess so wrapper.lua can produce statSources. The
// captured calcLuaRequest carries stat_sources with stats and limit.
func TestResolveWithModSourcesBypassesCache(t *testing.T) {
	pool, captured := captureMockPool(t, []string{minimalCalcResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	if err := srv.cache.store.Put(id, xml, `{"summary":{"Life":5000}}`,
		"https://pob.savecraft.gg/"+id, ""); err != nil {
		t.Fatal(err)
	}

	body := `{"url":"https://pob.savecraft.gg/` + id + `","modSources":["Life","CombinedDPS"],"modSourcesLimit":7}`
	req := httptest.NewRequest(http.MethodPost, "/resolve", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleResolve(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	requests := captured()
	if len(requests) != 1 {
		t.Fatalf("expected 1 captured request (cache bypassed), got %d", len(requests))
	}

	statSources, ok := requests[0]["stat_sources"].(map[string]any)
	if !ok {
		t.Fatalf("captured request missing stat_sources field: %+v", requests[0])
	}

	stats, ok := statSources["stats"].([]any)
	if !ok {
		t.Fatalf("stat_sources.stats not an array: %+v", statSources)
	}
	got := make([]string, 0, len(stats))
	for _, s := range stats {
		str, ok := s.(string)
		if !ok {
			t.Fatalf("stat_sources.stats[%d] not a string: %v", len(got), s)
		}
		got = append(got, str)
	}
	if !reflect.DeepEqual(got, []string{"Life", "CombinedDPS"}) {
		t.Errorf("stat_sources.stats = %v, want [Life CombinedDPS]", got)
	}

	if limit, _ := statSources["limit"].(float64); limit != 7 {
		t.Errorf("stat_sources.limit = %v, want 7", limit)
	}
}

// TestResolveCachedFastPathStillUsedWithoutModSources: when modSources
// is absent, the cache early-return remains in effect. Regression
// guard so we don't accidentally pay the PoB calc cost on every call
// after this slice.
//
// We verify by checking the stored summary's signature value flows
// straight through — a fresh-calc would emit minimalCalcResponse's
// values instead. captureMockPool's captured() helper assumes at least
// one subprocess request, so we assert via response content not capture.
func TestResolveCachedFastPathStillUsedWithoutModSources(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	storedSummaryWithSignature := `{"summary":{"Life":12345}}`
	if err := srv.cache.store.Put(id, xml, storedSummaryWithSignature,
		"https://pob.savecraft.gg/"+id, ""); err != nil {
		t.Fatal(err)
	}

	body := `{"url":"https://pob.savecraft.gg/` + id + `"}`
	req := httptest.NewRequest(http.MethodPost, "/resolve", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleResolve(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	// Stored summary's signature Life=12345 must flow through unchanged
	// — proves the cached path was used (no PoB calc).
	if !strings.Contains(rec.Body.String(), `"Life":12345`) {
		t.Errorf("expected cached Life=12345 in response (cache fast path), got: %s", rec.Body.String())
	}
}

// TestResolveModSourcesDefaultLimit: when modSources is set without an
// explicit modSourcesLimit, the wire request carries limit=10.
func TestResolveModSourcesDefaultLimit(t *testing.T) {
	pool, captured := captureMockPool(t, []string{minimalCalcResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	if err := srv.cache.store.Put(id, xml, `{"summary":{}}`,
		"https://pob.savecraft.gg/"+id, ""); err != nil {
		t.Fatal(err)
	}

	body := `{"url":"https://pob.savecraft.gg/` + id + `","modSources":["Life"]}`
	req := httptest.NewRequest(http.MethodPost, "/resolve", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleResolve(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	requests := captured()
	if len(requests) != 1 {
		t.Fatalf("expected 1 captured request, got %d", len(requests))
	}
	statSources, ok := requests[0]["stat_sources"].(map[string]any)
	if !ok {
		t.Fatalf("stat_sources missing or wrong type: %+v", requests[0])
	}
	if limit, _ := statSources["limit"].(float64); limit != 10 {
		t.Errorf("default stat_sources.limit = %v, want 10", limit)
	}
}

// TestResolveModSourcesLimitOverCapRejected: limit > 50 returns 400 to
// prevent context blowups on builds with many contributing mods.
func TestResolveModSourcesLimitOverCapRejected(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, `{}`, "", "")

	body := `{"url":"https://pob.savecraft.gg/` + id + `","modSources":["Life"],"modSourcesLimit":100}`
	req := httptest.NewRequest(http.MethodPost, "/resolve", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleResolve(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestModifyWithModSources: the /modify request body's modSources field
// flows through to the modifyLuaRequest's stat_sources field.
func TestModifyWithModSources(t *testing.T) {
	modifyResponse := `{"type":"result","data":{` +
		`"character":{"class":"Witch","ascendancy":"Occultist","level":99},` +
		`"summary":{"CombinedDPS":150000,"Life":7000,"LifeUnreserved":7000,"LifeUnreservedPercent":100,` +
		`"EnergyShield":2000,"Mana":500,"Armour":5000,"Evasion":3000,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":30,"SpellSuppressionChance":100,"MovementSpeedMod":1.5,` +
		`"Str":100,"Dex":150,"Int":200,"FlaskEffect":50,"FlaskChargeGen":10,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":150000},` +
		`"section_index":[],"sections":{}},"xml":"<PathOfBuilding modified=\"1\"/>"}`
	pool, captured := captureMockPool(t, []string{modifyResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, `{}`, "", "")

	body := `{"buildId":"` + id + `","operations":[{"op":"set_level","level":95}],"modSources":["Life"],"modSourcesLimit":3}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	requests := captured()
	if len(requests) != 1 {
		t.Fatalf("expected 1 captured request, got %d", len(requests))
	}

	statSources, ok := requests[0]["stat_sources"].(map[string]any)
	if !ok {
		t.Fatalf("modify request missing stat_sources field: %+v", requests[0])
	}
	stats, _ := statSources["stats"].([]any)
	if len(stats) != 1 || stats[0] != "Life" {
		t.Errorf("stat_sources.stats = %v, want [Life]", stats)
	}
	if limit, _ := statSources["limit"].(float64); limit != 3 {
		t.Errorf("stat_sources.limit = %v, want 3", limit)
	}
}

// TestModifyModSourcesLimitOverCapRejected: limit > 50 on /modify also
// returns 400 — symmetric with /resolve.
func TestModifyModSourcesLimitOverCapRejected(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, `{}`, "", "")

	body := `{"buildId":"` + id + `","operations":[{"op":"set_level","level":95}],"modSources":["Life"],"modSourcesLimit":51}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestModifyWithoutModSourcesOmitsField: regression guard — when
// modSources is empty/absent, the captured modify request does NOT
// carry a stat_sources field. Keeps wrapper.lua's opt-in path honest.
func TestModifyWithoutModSourcesOmitsField(t *testing.T) {
	pool, captured := captureMockPool(t, []string{minimalCalcResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, `{}`, "", "")

	body := `{"buildId":"` + id + `","operations":[{"op":"set_level","level":95}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	requests := captured()
	if len(requests) == 0 {
		t.Fatalf("expected 1 captured request, got 0; status=%d body=%s",
			rec.Code, rec.Body.String())
	}
	if _, present := requests[0]["stat_sources"]; present {
		t.Errorf("expected stat_sources absent from request, got %+v",
			requests[0]["stat_sources"])
	}

	// Decoded request should not have stat_sources serialized at all.
	rawJSON, _ := json.Marshal(requests[0])
	if strings.Contains(string(rawJSON), "stat_sources") {
		t.Errorf("stat_sources string should not appear in the wire payload: %s",
			string(rawJSON))
	}
}
