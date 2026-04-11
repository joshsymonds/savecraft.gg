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

func TestNearbyWithMockPoB(t *testing.T) {
	// Mock script returns a canned nearby result with two metric result sets
	mockScript := filepath.Join(t.TempDir(), "mock-nearby.sh")
	mockResponse := `{"type":"result","data":[` +
		`{"metric":"Life","baseline":20854,"limit":10,"radius":5,"nodes":[` +
		`{"name":"Tireless","type":"notable","stats":["8% increased maximum Life"],"path_cost":4,"path":["Devotion","Faith and Steel","Tireless"],"deltas":{"Life":1247,"CombinedDPS":-12400,"EnergyShield":0},"efficiency":311.75}` +
		`]},` +
		`{"metric":"CombinedDPS","baseline":5222051,"limit":10,"radius":5,"nodes":[` +
		`{"name":"Doom Cast","type":"notable","stats":["30% increased Spell Damage"],"path_cost":3,"path":["small node","Doom Cast"],"deltas":{"Life":0,"CombinedDPS":89000,"EnergyShield":0},"efficiency":29666.67}` +
		`]}` +
		`]}`

	if err := os.WriteFile(mockScript, []byte("#!/bin/sh\nread line\necho '"+mockResponse+"'\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}

	// Seed a build
	xml := "<PathOfBuilding/>"
	buildID := cache.Put(xml)
	_ = store.Put(buildID, xml, `{}`, "", "")

	srv := &Server{pool: pool, cache: cache, log: logger}

	body := `{"buildId":"` + buildID + `","metrics":["Life","CombinedDPS"]}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Response should be a JSON array
	var results []json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &results); err != nil {
		t.Fatalf("response is not a JSON array: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 result sets, got %d", len(results))
	}

	// Verify first result set shape
	var first struct {
		Metric   string `json:"metric"`
		Baseline int    `json:"baseline"`
		Limit    int    `json:"limit"`
		Radius   int    `json:"radius"`
		Nodes    []struct {
			Name       string             `json:"name"`
			Type       string             `json:"type"`
			Stats      []string           `json:"stats"`
			PathCost   int                `json:"path_cost"`
			Path       []string           `json:"path"`
			Deltas     map[string]float64 `json:"deltas"`
			Efficiency float64            `json:"efficiency"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(results[0], &first); err != nil {
		t.Fatalf("failed to parse first result set: %v", err)
	}

	if first.Metric != "Life" {
		t.Errorf("expected metric 'Life', got %q", first.Metric)
	}
	if first.Baseline != 20854 {
		t.Errorf("expected baseline 20854, got %d", first.Baseline)
	}
	if len(first.Nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(first.Nodes))
	}
	if first.Nodes[0].Name != "Tireless" {
		t.Errorf("expected node name 'Tireless', got %q", first.Nodes[0].Name)
	}
	if first.Nodes[0].PathCost != 4 {
		t.Errorf("expected path_cost 4, got %d", first.Nodes[0].PathCost)
	}
	if len(first.Nodes[0].Path) != 3 {
		t.Errorf("expected 3 path nodes, got %d", len(first.Nodes[0].Path))
	}
	if _, ok := first.Nodes[0].Deltas["Life"]; !ok {
		t.Error("deltas missing 'Life'")
	}
}

func TestNearbyAppliesDefaults(t *testing.T) {
	// Mock script echoes the request JSON back as the response data,
	// so we can verify the Go handler applied defaults before forwarding.
	mockScript := filepath.Join(t.TempDir(), "mock-nearby-echo.sh")
	if err := os.WriteFile(mockScript, []byte(`#!/bin/sh
read line
echo "{\"type\":\"result\",\"data\":$line}"
`), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

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

	srv := &Server{pool: pool, cache: cache, log: logger}

	// Send request with only required fields — no radius, limit, or deltaStats
	body := `{"buildId":"` + buildID + `","metrics":["Life"]}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// The mock echoed back the Lua request — verify defaults were applied
	var echoed struct {
		Type       string   `json:"type"`
		Radius     int      `json:"radius"`
		Limit      int      `json:"limit"`
		DeltaStats []string `json:"deltaStats"`
		Metrics    []string `json:"metrics"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &echoed); err != nil {
		t.Fatalf("failed to parse echoed request: %v", err)
	}

	if echoed.Type != "nearby" {
		t.Errorf("expected type 'nearby', got %q", echoed.Type)
	}
	if echoed.Radius != 5 {
		t.Errorf("expected default radius 5, got %d", echoed.Radius)
	}
	if echoed.Limit != 10 {
		t.Errorf("expected default limit 10, got %d", echoed.Limit)
	}
	if len(echoed.DeltaStats) != 3 {
		t.Errorf("expected 3 default deltaStats, got %d", len(echoed.DeltaStats))
	}
	if len(echoed.Metrics) != 1 || echoed.Metrics[0] != "Life" {
		t.Errorf("expected metrics [Life], got %v", echoed.Metrics)
	}
}

func TestNearbyClampsCrazyValues(t *testing.T) {
	// Mock echoes back the request to verify clamping
	mockScript := filepath.Join(t.TempDir(), "mock-nearby-clamp.sh")
	if err := os.WriteFile(mockScript, []byte(`#!/bin/sh
read line
echo "{\"type\":\"result\",\"data\":$line}"
`), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

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

	srv := &Server{pool: pool, cache: cache, log: logger}

	// Send absurd radius and limit
	body := `{"buildId":"` + buildID + `","metrics":["Life","ES","DPS","Armour","Evasion","Block","Suppress","Str","Dex","Int","Extra1","Extra2"],"radius":999,"limit":999}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var echoed struct {
		Radius  int      `json:"radius"`
		Limit   int      `json:"limit"`
		Metrics []string `json:"metrics"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &echoed); err != nil {
		t.Fatalf("failed to parse echoed request: %v", err)
	}

	if echoed.Radius != 15 {
		t.Errorf("expected clamped radius 15, got %d", echoed.Radius)
	}
	if echoed.Limit != 50 {
		t.Errorf("expected clamped limit 50, got %d", echoed.Limit)
	}
	if len(echoed.Metrics) != 10 {
		t.Errorf("expected clamped metrics to 10, got %d", len(echoed.Metrics))
	}
}
