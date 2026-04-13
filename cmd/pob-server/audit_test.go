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

// auditMockServer wires a Server backed by a bash-mock subprocess that
// returns the given response when read from. Mirrors the existing nearby
// mock-server helper pattern.
func auditMockServer(t *testing.T, mockResponse string) (*Server, string) {
	t.Helper()
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

// TestAuditRoundTripWithRealGraph exercises the full pipeline: the bash mock
// returns an audit_extract response carrying a real fixture graph, the Go
// handler runs segmentation, and the final HTTP response is asserted to
// contain the expected branches. This is the only end-to-end test of the
// extract → segment → assemble flow; perturbation lands in task #5.
func TestAuditRoundTripWithRealGraph(t *testing.T) {
	// Fixture: 1(root) → 2(Normal) → 3(Notable). Bridges (1,2) and (2,3) →
	// two nested branches when segmented.
	mockResponse := `{"type":"result","data":{"tree":{` +
		`"nodes":{"1":{"type":"ClassStart"},"2":{"type":"Normal"},"3":{"type":"Notable"}},` +
		`"adjacency":{"1":[2],"2":[1,3],"3":[2]},` +
		`"rootId":1,"totalAllocated":3}}}`

	srv, buildID := auditMockServer(t, mockResponse)
	body := `{"buildId":"` + buildID + `"}`
	req := httptest.NewRequest(http.MethodPost, "/audit", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleAudit(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp auditResponseSingle
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp.BuildID != buildID {
		t.Errorf("BuildID = %q, want %q", resp.BuildID, buildID)
	}
	if len(resp.Branches) != 2 {
		t.Fatalf("expected 2 branches from segmentation, got %d", len(resp.Branches))
	}
	if resp.Summary.TotalAllocated != 3 {
		t.Errorf("Summary.TotalAllocated = %d, want 3", resp.Summary.TotalAllocated)
	}
	if resp.Summary.BranchesAnalyzed != 2 {
		t.Errorf("Summary.BranchesAnalyzed = %d, want 2", resp.Summary.BranchesAnalyzed)
	}

	// Branch ordering is by Head id ascending (deterministic). Outer branch
	// is headed at 2 with two nodes, inner at 3 with one node.
	outer := resp.Branches[0]
	if outer.Head != 2 || outer.NodeCount != 2 {
		t.Errorf("outer = head=%d count=%d, want head=2 count=2", outer.Head, outer.NodeCount)
	}
	if outer.Terminal == nil || outer.Terminal.ID != 3 || outer.Terminal.Type != "Notable" {
		t.Errorf("outer.Terminal = %+v, want {3 Notable}", outer.Terminal)
	}
	if outer.Deltas == nil || outer.Efficiency == nil {
		t.Error("outer.Deltas and Efficiency must be non-nil placeholders for task #5")
	}

	inner := resp.Branches[1]
	if inner.Head != 3 || inner.NodeCount != 1 {
		t.Errorf("inner = head=%d count=%d, want head=3 count=1", inner.Head, inner.NodeCount)
	}
}

// TestAuditRoundTripScopeBoth verifies the parallel tree_branches +
// ascendancy_branches sections come back when scope=both, never merged.
func TestAuditRoundTripScopeBoth(t *testing.T) {
	mockResponse := `{"type":"result","data":{` +
		`"tree":{` +
		`"nodes":{"1":{"type":"ClassStart"},"2":{"type":"Notable"}},` +
		`"adjacency":{"1":[2],"2":[1]},` +
		`"rootId":1,"totalAllocated":2},` +
		`"ascendancy":{` +
		`"nodes":{"100":{"type":"AscendClassStart"},"101":{"type":"Keystone"}},` +
		`"adjacency":{"100":[101],"101":[100]},` +
		`"rootId":100,"totalAllocated":2}` +
		`}}`
	srv, buildID := auditMockServer(t, mockResponse)
	body := `{"buildId":"` + buildID + `","scope":"both"}`
	req := httptest.NewRequest(http.MethodPost, "/audit", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleAudit(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp auditResponseBoth
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if len(resp.TreeBranches) != 1 {
		t.Errorf("TreeBranches len = %d, want 1", len(resp.TreeBranches))
	}
	if len(resp.AscendancyBranches) != 1 {
		t.Errorf("AscendancyBranches len = %d, want 1", len(resp.AscendancyBranches))
	}
	if resp.Summary.TotalAllocated != 4 {
		t.Errorf("Summary.TotalAllocated = %d, want 4", resp.Summary.TotalAllocated)
	}
	if resp.AscendancyBranches[0].Terminal == nil || resp.AscendancyBranches[0].Terminal.Type != "Keystone" {
		t.Errorf("ascendancy terminal = %+v, want Keystone", resp.AscendancyBranches[0].Terminal)
	}
}

// TestAuditRoundTripEmptyExtract verifies the empty-graph case produces a
// well-formed response with empty branches[] (NOT omitted) and zero summary.
func TestAuditRoundTripEmptyExtract(t *testing.T) {
	mockResponse := `{"type":"result","data":{}}`
	srv, buildID := auditMockServer(t, mockResponse)
	body := `{"buildId":"` + buildID + `"}`
	req := httptest.NewRequest(http.MethodPost, "/audit", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleAudit(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp auditResponseSingle
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp.Branches == nil {
		t.Error("Branches must be a non-nil empty slice, not null")
	}
	if len(resp.Branches) != 0 {
		t.Errorf("expected 0 branches, got %d", len(resp.Branches))
	}
	if resp.DeadWeight == nil {
		t.Error("DeadWeight must be a non-nil empty slice, not null")
	}
	if resp.Summary.TotalAllocated != 0 || resp.Summary.BranchesAnalyzed != 0 {
		t.Errorf("Summary should be all zeros, got %+v", resp.Summary)
	}
}
