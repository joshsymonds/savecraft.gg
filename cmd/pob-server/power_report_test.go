package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// powerReportHarness builds a Server with the power report enabled and a
// mock pool primed to respond to the full /resolve flow:
// 1. calc request → calcResponse
// 2. nearby_extract → extractResponse (the inline power report's first send)
// 3. nearby_perturb → perturbResponse (the inline power report's second send)
//
// Returns (server, captured-requests-fn) so tests can assert on the wire.
func powerReportHarness(
	t *testing.T,
	calcResponse, extractResponse, perturbResponse string,
) (*Server, func() []map[string]any) {
	t.Helper()
	pool, captured := captureMockPool(t, []string{
		calcResponse,
		extractResponse,
		perturbResponse,
	})
	t.Cleanup(func() { pool.Shutdown() })

	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)
	srv.modIndex = NewModSourceIndex()
	srv.PowerReportEnabled = true
	return srv, captured
}

// extractCanned is a synthetic nearby_extract response with two candidates
// and a Life baseline. Used as the second mock subprocess response.
const extractCanned = `{"type":"result","data":{"baseline":{"Life":6000,"CombinedDPS":0,"EnergyShield":0},"candidates":[` +
	`{"id":100,"type":"Notable","alloc":false,"pathDist":1,"path":["A"],"modKey":"k1","name":"Path of the Iron","stats":["+10 to maximum Life"]},` +
	`{"id":200,"type":"Normal","alloc":false,"pathDist":2,"path":["A","B"],"modKey":"k2","name":"Life Node","stats":["+5% increased maximum Life"]}` +
	`]}}`

const perturbCanned2 = `{"type":"result","data":{"deltas":{` +
	`"100":{"Life":50,"CombinedDPS":0,"EnergyShield":0},` +
	`"200":{"Life":300,"CombinedDPS":0,"EnergyShield":0}}}}`

// TestCalcAttachesPowerReport: a /calc response includes a `power_report`
// key carrying the top-N nodes ranked by the leading non-zero metric.
// minimalCalcResponse has CombinedDPS=100000 (first priority, non-zero),
// so CombinedDPS is the leading metric.
func TestCalcAttachesPowerReport(t *testing.T) {
	srv, _ := powerReportHarness(t, minimalCalcResponse, extractCanned, perturbCanned2)

	rec := httptest.NewRecorder()
	srv.handleCalc(rec, httptest.NewRequest(http.MethodPost, "/calc?sections=offense",
		strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		BuildID     string          `json:"buildId"`
		Data        json.RawMessage `json:"data"`
		PowerReport json.RawMessage `json:"power_report"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.PowerReport == nil {
		t.Fatal("expected power_report on /calc response, got nil")
	}

	var report struct {
		Metric string            `json:"metric"`
		Limit  int               `json:"limit"`
		Radius int               `json:"radius"`
		Nodes  []json.RawMessage `json:"nodes"`
	}
	if err := json.Unmarshal(resp.PowerReport, &report); err != nil {
		t.Fatalf("invalid power_report shape: %v", err)
	}
	if report.Metric != "CombinedDPS" {
		t.Errorf("expected leading metric CombinedDPS (first non-zero), got %q", report.Metric)
	}
	if report.Radius != 3 {
		t.Errorf("inline radius must be 3, got %d", report.Radius)
	}
	if report.Limit != 5 {
		t.Errorf("inline limit must be 5, got %d", report.Limit)
	}
}

// dpsZeroSummary: a calc response with CombinedDPS=0 but Life>0 — used
// to verify the leading-metric fallback skips past the zero priority.
const dpsZeroSummary = `{"type":"result","data":{` +
	`"character":{"class":"Witch","ascendancy":"Occultist","level":99},` +
	`"summary":{"CombinedDPS":0,"Life":6728,"LifeUnreserved":6728,"LifeUnreservedPercent":100,` +
	`"EnergyShield":2000,"Mana":500,"Armour":5000,"Evasion":3000,` +
	`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
	`"BlockChance":30,"SpellSuppressionChance":100,"MovementSpeedMod":1.5,` +
	`"Str":100,"Dex":150,"Int":200,"FlaskEffect":50,"FlaskChargeGen":10,` +
	`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
	`"EnemyCurseLimit":1,"TotalDPS":0},` +
	`"section_index":[],"sections":{}}}`

// TestCalcLeadingMetricFallsThrough: when CombinedDPS is zero, the
// leading metric falls through to the next priority (Life). The
// nearby_extract request's `stats` field has Life first.
func TestCalcLeadingMetricFallsThrough(t *testing.T) {
	srv, captured := powerReportHarness(t, dpsZeroSummary, extractCanned, perturbCanned2)

	rec := httptest.NewRecorder()
	srv.handleCalc(rec, httptest.NewRequest(http.MethodPost, "/calc?sections=offense",
		strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	requests := captured()
	if len(requests) < 2 {
		t.Fatalf("expected at least 2 captured requests (calc + extract), got %d", len(requests))
	}
	stats, _ := requests[1]["stats"].([]any)
	if len(stats) == 0 || stats[0].(string) != "Life" {
		t.Errorf("expected leading stat to be Life (CombinedDPS=0), got %v", stats)
	}
}

// TestPowerReportDisabledByDefault: a /calc on a server without
// PowerReportEnabled set must not include the field. Makes existing tests
// that don't opt in stay unbroken.
func TestPowerReportDisabledByDefault(t *testing.T) {
	pool, _ := captureMockPool(t, []string{minimalCalcResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool) // PowerReportEnabled stays false

	rec := httptest.NewRecorder()
	srv.handleCalc(rec, httptest.NewRequest(http.MethodPost, "/calc?sections=offense",
		strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if _, has := resp["power_report"]; has {
		t.Errorf("power_report must be omitted when feature disabled; got: %s", resp["power_report"])
	}
}

// TestPowerReportSkippedForSummaryOnlyRequest: even when the feature
// is enabled, a request that asks for summary only doesn't trigger the
// inline extract+perturb cost. The test pool primes only ONE response
// (calc); a power-report attempt would block on the missing perturb
// response and timeout the test.
func TestPowerReportSkippedForSummaryOnlyRequest(t *testing.T) {
	pool, _ := captureMockPool(t, []string{minimalCalcResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)
	srv.modIndex = NewModSourceIndex()
	srv.PowerReportEnabled = true

	// No `?sections=` query string → defaults to summary-only.
	rec := httptest.NewRecorder()
	srv.handleCalc(rec, httptest.NewRequest(http.MethodPost, "/calc",
		strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if _, has := resp["power_report"]; has {
		t.Errorf("power_report must be omitted on summary-only request; got: %s", resp["power_report"])
	}
}

// TestPowerReportSkipsWhenAllBaselinesZero: a build whose summary has
// Life = ES = CombinedDPS = 0 has no leading metric to rank by. Skip the
// inline call entirely.
func TestPowerReportSkipsWhenAllBaselinesZero(t *testing.T) {
	zeroSummary := `{"type":"result","data":{` +
		`"character":{"class":"Witch","ascendancy":"Occultist","level":99},` +
		`"summary":{"CombinedDPS":0,"Life":0,"LifeUnreserved":0,"LifeUnreservedPercent":0,` +
		`"EnergyShield":0,"Mana":500,"Armour":0,"Evasion":0,` +
		`"FireResist":0,"ColdResist":0,"LightningResist":0,"ChaosResist":0,` +
		`"BlockChance":0,"SpellSuppressionChance":0,"MovementSpeedMod":1,` +
		`"Str":0,"Dex":0,"Int":0,"FlaskEffect":0,"FlaskChargeGen":0,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":0,"TotalDPS":0},` +
		`"section_index":[],"sections":{}}}`
	// Only one mock response — the inline call must be skipped, otherwise
	// the perturb attempt would block.
	pool, _ := captureMockPool(t, []string{zeroSummary})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)
	srv.modIndex = NewModSourceIndex()
	srv.PowerReportEnabled = true

	rec := httptest.NewRecorder()
	srv.handleCalc(rec, httptest.NewRequest(http.MethodPost, "/calc?sections=offense",
		strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if _, has := resp["power_report"]; has {
		t.Errorf("power_report must be omitted when no metric has signal; got: %s", resp["power_report"])
	}
}

// TestPowerReportInlineRadiusIs3: regression check on the inline radius
// default — must be smaller than /nearby's 5.
func TestPowerReportInlineRadiusIs3(t *testing.T) {
	srv, captured := powerReportHarness(t, minimalCalcResponse, extractCanned, perturbCanned2)

	rec := httptest.NewRecorder()
	srv.handleCalc(rec, httptest.NewRequest(http.MethodPost, "/calc?sections=offense",
		strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	requests := captured()
	if len(requests) < 2 {
		t.Fatalf("need at least 2 captured requests")
	}
	// nearby_extract is request[1]; radius lives there.
	radius, _ := requests[1]["radius"].(float64)
	if int(radius) != 3 {
		t.Errorf("inline radius must be 3, got %v", radius)
	}
}

// TestPowerReportFailureDoesNotFailParent: when the inline nearby_extract
// errors, /calc still returns 200 with the rest of the data; power_report
// is omitted.
func TestPowerReportFailureDoesNotFailParent(t *testing.T) {
	luaError := `{"type":"error","message":"synthetic extract failure"}`
	pool, _ := captureMockPool(t, []string{minimalCalcResponse, luaError})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)
	srv.modIndex = NewModSourceIndex()
	srv.PowerReportEnabled = true

	rec := httptest.NewRecorder()
	srv.handleCalc(rec, httptest.NewRequest(http.MethodPost, "/calc?sections=offense",
		strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("inline failure must not fail parent; got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]json.RawMessage
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if _, has := resp["buildId"]; !has {
		t.Error("parent response missing buildId despite inline-only failure")
	}
	if _, has := resp["power_report"]; has {
		t.Errorf("power_report must be omitted on inline failure; got: %s", resp["power_report"])
	}
}
