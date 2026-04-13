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
	if req.NodeLimit != 50 {
		t.Errorf("expected clamped nodeLimit 50, got %d", req.NodeLimit)
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

// auditTwoSendMockServer wires a Server backed by a bash mock that returns
// two canned responses on two successive reads (extract then perturb). The
// new /audit handler does two Sends per request; this helper makes both
// available with one canned pair.
//
// Responses are written to temp files and the mock script `cat`s them, so
// fixtures can contain arbitrary characters (single quotes, backslashes)
// without breaking the shell quoting.
func auditTwoSendMockServer(t *testing.T, extractResp, perturbResp string) (*Server, string) {
	t.Helper()
	dir := t.TempDir()
	extractFile := filepath.Join(dir, "extract.json")
	perturbFile := filepath.Join(dir, "perturb.json")
	if err := os.WriteFile(extractFile, []byte(extractResp), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(perturbFile, []byte(perturbResp), 0o644); err != nil {
		t.Fatal(err)
	}
	mockScript := filepath.Join(dir, "mock-audit.sh")
	script := "#!/bin/sh\nread line\ncat " + extractFile + "\necho\nread line\ncat " + perturbFile + "\necho\n"
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

// auditOneSendMockServer is for tests where the empty-extract path means no
// perturb Send happens (handler short-circuits when no branches selected).
// The mock script only handles one read.
func auditOneSendMockServer(t *testing.T, extractResp string) (*Server, string) {
	t.Helper()
	emptyPerturb := `{"type":"result","data":{"baseline":{},"branchDeltas":[],"singleDeltas":{}}}`
	return auditTwoSendMockServer(t, extractResp, emptyPerturb)
}

// TestAuditRoundTripWithRealGraph exercises the full pipeline: the bash mock
// returns an audit_extract response carrying a real fixture graph + an
// audit_perturb response with matching branch and per-leaf deltas. The Go
// handler runs segmentation, selects branches, gathers leaves, applies the
// perturb deltas via auditRank, and assembles the final response.
func TestAuditRoundTripWithRealGraph(t *testing.T) {
	// Fixture: 1(root) → 2(Normal) → 3(Notable). Bridges (1,2) and (2,3)
	// produce two nested branches when segmented:
	//   branch headed at 2: {2,3}, terminal=3 Notable, leaf=3
	//   branch headed at 3: {3}, terminal=3 Notable, leaf=3
	extractResp := `{"type":"result","data":{"tree":{` +
		`"nodes":{"1":{"type":"ClassStart"},"2":{"type":"Normal"},"3":{"type":"Notable"}},` +
		`"adjacency":{"1":[2],"2":[1,3],"3":[2]},` +
		`"rootId":1,"totalAllocated":3}}}`
	// Two branches → two branchDeltas entries. Leaf ids are 3 in both branches
	// (in branch 2-3, only node 3 has degree 1; in branch {3}, node 3 itself).
	// Single-node deltas keyed by stringified id.
	perturbResp := `{"type":"result","data":{` +
		`"baseline":{"Life":1000},` +
		`"branchDeltas":[{"Life":-200},{"Life":-150}],` +
		`"singleDeltas":{"3":{"Life":-150}}}}`

	srv, buildID := auditTwoSendMockServer(t, extractResp, perturbResp)
	body := `{"buildId":"` + buildID + `","metrics":["Life"]}`
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
	if resp.Baseline["Life"] != 1000 {
		t.Errorf("Baseline[Life] = %v, want 1000", resp.Baseline["Life"])
	}
	if len(resp.Branches) != 2 {
		t.Fatalf("expected 2 branches, got %d", len(resp.Branches))
	}
	if resp.Summary.TotalAllocated != 3 {
		t.Errorf("Summary.TotalAllocated = %d, want 3", resp.Summary.TotalAllocated)
	}
	if resp.Summary.BranchesAnalyzed != 2 {
		t.Errorf("Summary.BranchesAnalyzed = %d, want 2", resp.Summary.BranchesAnalyzed)
	}

	// Default sort is "weakest" → least negative first. Branch with Life=-150
	// (loses less) should come before branch with Life=-200.
	first := resp.Branches[0]
	if first.Deltas["Life"] != -150 {
		t.Errorf("first.Deltas[Life] = %v, want -150 (weakest)", first.Deltas["Life"])
	}
	second := resp.Branches[1]
	if second.Deltas["Life"] != -200 {
		t.Errorf("second.Deltas[Life] = %v, want -200", second.Deltas["Life"])
	}

	// Efficiency = delta / node_count.
	if first.Efficiency["Life"] == 0 {
		t.Errorf("first.Efficiency[Life] = 0, expected non-zero")
	}

	// weakest_branch_id should be set to the first ranked branch.
	if resp.Summary.WeakestBranchID == nil || *resp.Summary.WeakestBranchID != first.ID {
		t.Errorf("WeakestBranchID = %v, want %q", resp.Summary.WeakestBranchID, first.ID)
	}
}

// TestAuditRoundTripScopeBoth verifies parallel tree_branches +
// ascendancy_branches sections come back when scope=both, never merged.
func TestAuditRoundTripScopeBoth(t *testing.T) {
	extractResp := `{"type":"result","data":{` +
		`"tree":{` +
		`"nodes":{"1":{"type":"ClassStart"},"2":{"type":"Notable"}},` +
		`"adjacency":{"1":[2],"2":[1]},` +
		`"rootId":1,"totalAllocated":2},` +
		`"ascendancy":{` +
		`"nodes":{"100":{"type":"AscendClassStart"},"101":{"type":"Keystone"}},` +
		`"adjacency":{"100":[101],"101":[100]},` +
		`"rootId":100,"totalAllocated":2}` +
		`}}`
	perturbResp := `{"type":"result","data":{` +
		`"baseline":{"Life":2000},` +
		`"branchDeltas":[{"Life":-100},{"Life":-300}],` +
		`"singleDeltas":{"2":{"Life":-100},"101":{"Life":-300}}}}`

	srv, buildID := auditTwoSendMockServer(t, extractResp, perturbResp)
	body := `{"buildId":"` + buildID + `","scope":"both","metrics":["Life"]}`
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
	if resp.TreeBranches[0].Deltas["Life"] != -100 {
		t.Errorf("tree branch delta = %v, want -100", resp.TreeBranches[0].Deltas["Life"])
	}
	if resp.AscendancyBranches[0].Deltas["Life"] != -300 {
		t.Errorf("ascendancy branch delta = %v, want -300", resp.AscendancyBranches[0].Deltas["Life"])
	}
}

// TestAuditRoundTripScopeBothEmptyTreeFallsBackToAscendancy verifies that
// when scope=both and the tree has zero analyzed branches but the ascendancy
// has weakness, summary.weakestBranchId surfaces the ascendancy weakest
// rather than nil. The two parallel sections still carry their own ranked
// lists; this is just the at-a-glance summary hint.
func TestAuditRoundTripScopeBothEmptyTreeFallsBackToAscendancy(t *testing.T) {
	// Empty tree section, ascendancy with one branch.
	extractResp := `{"type":"result","data":{` +
		`"tree":{"nodes":{"1":{"type":"ClassStart"}},"adjacency":{"1":[]},"rootId":1,"totalAllocated":1},` +
		`"ascendancy":{` +
		`"nodes":{"100":{"type":"AscendClassStart"},"101":{"type":"Keystone"}},` +
		`"adjacency":{"100":[101],"101":[100]},` +
		`"rootId":100,"totalAllocated":2}` +
		`}}`
	perturbResp := `{"type":"result","data":{` +
		`"baseline":{"Life":2000},` +
		`"branchDeltas":[{"Life":-300}],` +
		`"singleDeltas":{"101":{"Life":-300}}}}`

	srv, buildID := auditTwoSendMockServer(t, extractResp, perturbResp)
	body := `{"buildId":"` + buildID + `","scope":"both","metrics":["Life"]}`
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
	if len(resp.TreeBranches) != 0 {
		t.Errorf("TreeBranches len = %d, want 0 (single-node tree has no branches)", len(resp.TreeBranches))
	}
	if len(resp.AscendancyBranches) != 1 {
		t.Errorf("AscendancyBranches len = %d, want 1", len(resp.AscendancyBranches))
	}
	if resp.Summary.WeakestBranchID == nil {
		t.Fatal("Summary.WeakestBranchID is nil — should fall back to ascendancy weakest")
	}
	if *resp.Summary.WeakestBranchID != resp.AscendancyBranches[0].ID {
		t.Errorf("WeakestBranchID = %q, want %q (ascendancy fallback)",
			*resp.Summary.WeakestBranchID, resp.AscendancyBranches[0].ID)
	}
}

// TestAuditRoundTripEmptyExtract verifies the empty-graph case produces a
// well-formed response with empty branches[] (NOT omitted) and zero summary.
// The handler short-circuits the second Send when there are no branches, so
// the mock only needs to provide an extract response.
func TestAuditRoundTripEmptyExtract(t *testing.T) {
	srv, buildID := auditOneSendMockServer(t, `{"type":"result","data":{}}`)
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

// TestAuditRoundTripDeadWeightFlagged verifies a leaf with all-zero deltas
// shows up in the dead_weight bucket.
func TestAuditRoundTripDeadWeightFlagged(t *testing.T) {
	// Single branch with one node (the leaf). Perturb returns zero deltas.
	extractResp := `{"type":"result","data":{"tree":{` +
		`"nodes":{"1":{"type":"ClassStart"},"2":{"type":"Notable"}},` +
		`"adjacency":{"1":[2],"2":[1]},` +
		`"rootId":1,"totalAllocated":2}}}`
	perturbResp := `{"type":"result","data":{` +
		`"baseline":{"Life":1000},` +
		`"branchDeltas":[{"Life":0}],` +
		`"singleDeltas":{"2":{"Life":0}}}}`

	srv, buildID := auditTwoSendMockServer(t, extractResp, perturbResp)
	body := `{"buildId":"` + buildID + `","metrics":["Life"]}`
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
	if len(resp.DeadWeight) != 1 {
		t.Fatalf("expected 1 dead_weight entry, got %d: %+v", len(resp.DeadWeight), resp.DeadWeight)
	}
	if resp.DeadWeight[0].ID != 2 {
		t.Errorf("dead_weight[0].ID = %d, want 2", resp.DeadWeight[0].ID)
	}
	if resp.DeadWeight[0].Reason != "zero_contribution" {
		t.Errorf("dead_weight[0].Reason = %q, want zero_contribution", resp.DeadWeight[0].Reason)
	}
	if resp.Summary.TotalDeadPoints != 1 {
		t.Errorf("Summary.TotalDeadPoints = %d, want 1", resp.Summary.TotalDeadPoints)
	}
}
