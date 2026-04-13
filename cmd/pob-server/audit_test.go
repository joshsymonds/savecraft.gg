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

func parseAudit(t *testing.T, body string) (AuditRequest, string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/audit", strings.NewReader(body))
	rec := httptest.NewRecorder()
	return parseAuditRequest(rec, req)
}

func TestParseAuditRequiresBuildID(t *testing.T) {
	_, errMsg := parseAudit(t, `{"buildId":""}`)
	if errMsg == "" {
		t.Fatal("expected error for empty buildId")
	}
}

func TestParseAuditAppliesDefaults(t *testing.T) {
	req, errMsg := parseAudit(t, `{"buildId":"abc"}`)
	if errMsg != "" {
		t.Fatalf("unexpected error: %s", errMsg)
	}
	if len(req.Metrics) != 3 {
		t.Errorf("expected 3 default metrics, got %d", len(req.Metrics))
	}
	if len(req.DeltaStats) != 3 {
		t.Errorf("expected 3 default deltaStats (mirrors metrics), got %d", len(req.DeltaStats))
	}
	if req.BranchLimit != 10 {
		t.Errorf("expected default branchLimit 10, got %d", req.BranchLimit)
	}
	if req.NodeLimit != 20 {
		t.Errorf("expected default nodeLimit 20, got %d", req.NodeLimit)
	}
	if req.Sort != "weakest" {
		t.Errorf("expected default sort 'weakest', got %q", req.Sort)
	}
	if req.Scope != "tree" {
		t.Errorf("expected default scope 'tree', got %q", req.Scope)
	}
	if req.IncludeZero == nil || !*req.IncludeZero {
		t.Errorf("expected default includeZero=true")
	}
}

func TestParseAuditClampsBranchLimit(t *testing.T) {
	req, errMsg := parseAudit(t, `{"buildId":"abc","branchLimit":999}`)
	if errMsg != "" {
		t.Fatalf("unexpected error: %s", errMsg)
	}
	if req.BranchLimit != 50 {
		t.Errorf("expected clamped branchLimit 50, got %d", req.BranchLimit)
	}
}

func TestParseAuditClampsNodeLimit(t *testing.T) {
	req, errMsg := parseAudit(t, `{"buildId":"abc","nodeLimit":9999}`)
	if errMsg != "" {
		t.Fatalf("unexpected error: %s", errMsg)
	}
	if req.NodeLimit != 100 {
		t.Errorf("expected clamped nodeLimit 100, got %d", req.NodeLimit)
	}
}

func TestParseAuditClampsMetricsLength(t *testing.T) {
	body := `{"buildId":"abc","metrics":["a","b","c","d","e","f","g","h","i","j","k","l"]}`
	req, errMsg := parseAudit(t, body)
	if errMsg != "" {
		t.Fatalf("unexpected error: %s", errMsg)
	}
	if len(req.Metrics) != 10 {
		t.Errorf("expected metrics clamped to 10, got %d", len(req.Metrics))
	}
}

func TestParseAuditClampsDeltaStatsLength(t *testing.T) {
	stats := make([]string, 30)
	for i := range stats {
		stats[i] = `"s"`
	}
	body := `{"buildId":"abc","deltaStats":[` + strings.Join(stats, ",") + `]}`
	req, errMsg := parseAudit(t, body)
	if errMsg != "" {
		t.Fatalf("unexpected error: %s", errMsg)
	}
	if len(req.DeltaStats) != 20 {
		t.Errorf("expected deltaStats clamped to 20, got %d", len(req.DeltaStats))
	}
}

func TestParseAuditScopeDefaults(t *testing.T) {
	req, _ := parseAudit(t, `{"buildId":"abc"}`)
	if req.Scope != "tree" {
		t.Errorf("expected scope 'tree', got %q", req.Scope)
	}
}

func TestParseAuditScopeRejectsInvalid(t *testing.T) {
	_, errMsg := parseAudit(t, `{"buildId":"abc","scope":"garbage"}`)
	if errMsg == "" {
		t.Fatal("expected error for invalid scope")
	}
}

func TestParseAuditScopeAcceptsValid(t *testing.T) {
	for _, s := range []string{"tree", "ascendancy", "both"} {
		req, errMsg := parseAudit(t, `{"buildId":"abc","scope":"`+s+`"}`)
		if errMsg != "" {
			t.Errorf("scope %q rejected: %s", s, errMsg)
		}
		if req.Scope != s {
			t.Errorf("scope %q: got %q", s, req.Scope)
		}
	}
}

func TestParseAuditSortDefaults(t *testing.T) {
	req, _ := parseAudit(t, `{"buildId":"abc"}`)
	if req.Sort != "weakest" {
		t.Errorf("expected sort 'weakest', got %q", req.Sort)
	}
}

func TestParseAuditSortRejectsInvalid(t *testing.T) {
	_, errMsg := parseAudit(t, `{"buildId":"abc","sort":"sideways"}`)
	if errMsg == "" {
		t.Fatal("expected error for invalid sort")
	}
}

func TestParseAuditExplicitIncludeZeroFalse(t *testing.T) {
	req, errMsg := parseAudit(t, `{"buildId":"abc","includeZero":false}`)
	if errMsg != "" {
		t.Fatalf("unexpected error: %s", errMsg)
	}
	if req.IncludeZero == nil || *req.IncludeZero {
		t.Errorf("expected includeZero=false to be preserved")
	}
}

func TestAuditRejectsGet(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/audit", nil)
	rec := httptest.NewRecorder()
	srv.handleAudit(rec, req)
	if rec.Code != 405 {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestAuditReturns404ForMissingBuild(t *testing.T) {
	srv := newTestServer(t)
	body := `{"buildId":"nonexistent"}`
	req := httptest.NewRequest(http.MethodPost, "/audit", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleAudit(rec, req)
	if rec.Code != 404 {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAuditWithMockPoBStub(t *testing.T) {
	// Round-trip: handler dispatches to Lua, returns the data payload unwrapped.
	mockResponse := `{"type":"result","data":{"build_id":"X","baseline":{},` +
		`"branches":[],"dead_weight":[],` +
		`"summary":{"total_allocated":0,"branches_analyzed":0,"weakest_branch_id":null,"total_dead_points":0}}}`
	mockScript := filepath.Join(t.TempDir(), "mock-audit.sh")
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
	xml := "<PathOfBuilding/>"
	buildID := cache.Put(xml)
	_ = store.Put(buildID, xml, `{}`, "", "")

	srv := &Server{pool: pool, cache: cache, log: logger}
	body := `{"buildId":"` + buildID + `"}`
	req := httptest.NewRequest(http.MethodPost, "/audit", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleAudit(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		BuildID    string          `json:"build_id"`
		Baseline   json.RawMessage `json:"baseline"`
		Branches   json.RawMessage `json:"branches"`
		DeadWeight json.RawMessage `json:"dead_weight"`
		Summary    json.RawMessage `json:"summary"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp.BuildID == "" || resp.Branches == nil || resp.DeadWeight == nil {
		t.Fatalf("response missing required fields: %s", rec.Body.String())
	}
}
