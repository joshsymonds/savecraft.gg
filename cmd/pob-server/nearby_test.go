package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNearbyRejectsGet(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/nearby", nil)
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 405 {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestNearbyRejectsEmptyBuildID(t *testing.T) {
	srv := newTestServer(t)

	body := `{"buildId":"","metrics":["Life"]}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestNearbyRejectsEmptyMetrics(t *testing.T) {
	srv := newTestServer(t)

	body := `{"buildId":"some-id","metrics":[]}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestNearbyRejectsMissingMetrics(t *testing.T) {
	srv := newTestServer(t)

	body := `{"buildId":"some-id"}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestNearbyReturns404ForMissingBuild(t *testing.T) {
	srv := newTestServer(t)

	body := `{"buildId":"nonexistent","metrics":["Life"]}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 404 {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

// nearbyTwoSendMockServer wires a Server backed by a bash mock that returns
// two canned responses on two successive reads — mirroring the two-send
// protocol the new /nearby handler uses (extract → perturb).
func nearbyTwoSendMockServer(t *testing.T, extractResp, perturbResp string) (*Server, string) {
	t.Helper()
	mockScript := filepath.Join(t.TempDir(), "mock-nearby.sh")
	script := "#!/bin/sh\nread line\necho '" + extractResp + "'\nread line\necho '" + perturbResp + "'\n"
	if err := os.WriteFile(mockScript, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	t.Cleanup(pool.Shutdown)

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })

	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}
	xml := "<PathOfBuilding/>"
	buildID := cache.Put(xml)
	_ = store.Put(buildID, xml, `{}`, "", "")
	return &Server{pool: pool, cache: cache, log: logger}, buildID
}

// TestNearbyTwoSendRoundTrip exercises the full extract → filter → perturb
// → rank pipeline. The bash mock returns one realistic candidate via the
// first Send (nearby_extract) and matching deltas via the second Send
// (nearby_perturb). The Go handler filters, perturbs, ranks, and assembles
// the per-metric results.
func TestNearbyTwoSendRoundTrip(t *testing.T) {
	extractResp := `{"type":"result","data":{` +
		`"baseline":{"Life":20854,"CombinedDPS":5222051},` +
		`"candidates":[{` +
		`"id":1,"type":"Notable","alloc":false,"pathDist":4,` +
		`"path":["Devotion","Faith and Steel","Tireless"],` +
		`"modKey":"life_mod","ascendancyName":null,` +
		`"name":"Tireless","stats":["8% increased maximum Life"]}]}}`
	perturbResp := `{"type":"result","data":{"deltas":{"1":{"Life":1247,"CombinedDPS":-12400}}}}`

	srv, buildID := nearbyTwoSendMockServer(t, extractResp, perturbResp)
	body := `{"buildId":"` + buildID + `","metrics":["Life","CombinedDPS"]}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var results []nearbyMetricResult
	if err := json.Unmarshal(rec.Body.Bytes(), &results); err != nil {
		t.Fatalf("response is not a JSON array: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 result sets (one per metric), got %d", len(results))
	}

	life := results[0]
	if life.Metric != "Life" {
		t.Errorf("results[0].Metric = %q, want Life", life.Metric)
	}
	if life.Baseline != 20854 {
		t.Errorf("results[0].Baseline = %v, want 20854", life.Baseline)
	}
	if len(life.Nodes) != 1 {
		t.Fatalf("expected 1 ranked node, got %d", len(life.Nodes))
	}
	node := life.Nodes[0]
	if node.Name != "Tireless" {
		t.Errorf("node.Name = %q, want Tireless", node.Name)
	}
	if node.Type != "notable" {
		t.Errorf("node.Type = %q, want notable (lowercased by Go)", node.Type)
	}
	if node.PathCost != 4 {
		t.Errorf("node.PathCost = %d, want 4", node.PathCost)
	}
	if len(node.Path) != 3 {
		t.Errorf("node.Path len = %d, want 3", len(node.Path))
	}
	if node.Deltas["Life"] != 1247 {
		t.Errorf("node.Deltas[Life] = %v, want 1247", node.Deltas["Life"])
	}
	if node.Efficiency != float64(1247)/4 {
		t.Errorf("node.Efficiency = %v, want %v", node.Efficiency, float64(1247)/4)
	}
}

// parseNearby is a test helper to drive parseNearbyRequest without going
// through the full HTTP handler. Mirrors the parseAudit helper in audit_test.go.
func parseNearby(t *testing.T, body string) (NearbyRequest, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	return parseNearbyRequest(rec, req)
}

func TestParseNearbyAppliesDefaults(t *testing.T) {
	req, errMsg := parseNearby(t, `{"buildId":"abc","metrics":["Life"]}`)
	if errMsg != "" {
		t.Fatalf("unexpected error: %s", errMsg)
	}
	if req.Radius != 5 {
		t.Errorf("Radius = %d, want default 5", req.Radius)
	}
	if req.Limit != 10 {
		t.Errorf("Limit = %d, want default 10", req.Limit)
	}
	if len(req.DeltaStats) != 3 {
		t.Errorf("DeltaStats len = %d, want default 3", len(req.DeltaStats))
	}
	if req.Sort != "desc" {
		t.Errorf("Sort = %q, want default desc", req.Sort)
	}
}

func TestParseNearbyClampsCrazyValues(t *testing.T) {
	body := `{"buildId":"abc","metrics":["a","b","c","d","e","f","g","h","i","j","k","l"],"radius":999,"limit":999}`
	req, errMsg := parseNearby(t, body)
	if errMsg != "" {
		t.Fatalf("unexpected error: %s", errMsg)
	}
	if req.Radius != 15 {
		t.Errorf("Radius = %d, want clamped 15", req.Radius)
	}
	if req.Limit != 50 {
		t.Errorf("Limit = %d, want clamped 50", req.Limit)
	}
	if len(req.Metrics) != 10 {
		t.Errorf("Metrics len = %d, want clamped 10", len(req.Metrics))
	}
}

func TestParseNearbyRejectsInvalidSort(t *testing.T) {
	_, errMsg := parseNearby(t, `{"buildId":"abc","metrics":["Life"],"sort":"sideways"}`)
	if errMsg == "" {
		t.Error("expected error for invalid sort")
	}
}
