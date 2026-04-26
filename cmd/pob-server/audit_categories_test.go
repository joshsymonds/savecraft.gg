package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestAuditRejectsUnknownCategory: validation runs early, before any
// PoB round-trip. The error names the offending category and lists
// valid options.
func TestAuditRejectsUnknownCategory(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, `{}`, "", "")

	body := `{"buildId":"` + id + `","metrics":["Life"],"categories":["Bogus"]}`
	req := httptest.NewRequest(http.MethodPost, "/audit", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleAudit(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Bogus") {
		t.Errorf("error should name the offending category; got %s", rec.Body.String())
	}
}

// TestFilterAuditBranchesByCategory: with an allowlist of {Keystone},
// only branches whose terminal type is Keystone survive. Branches with
// nil terminal also drop (they have no classifiable terminal type).
//
// Drives the post-process filter helper that runs after auditRank.
func TestFilterAuditBranchesByCategory(t *testing.T) {
	branches := []auditBranchResponse{
		{ID: "n1", Terminal: &segmentTerminal{ID: 1, Type: "Notable"}},
		{ID: "k1", Terminal: &segmentTerminal{ID: 2, Type: "Keystone"}},
		{ID: "n2", Terminal: &segmentTerminal{ID: 3, Type: "Notable"}},
		{ID: "noterm", Terminal: nil},
	}
	allowed := map[string]bool{"Keystone": true}
	got := filterAuditBranchesByCategory(branches, allowed)
	if len(got) != 1 {
		t.Fatalf("expected 1 surviving branch (k1), got %d: %+v", len(got), got)
	}
	if got[0].ID != "k1" {
		t.Errorf("expected branch id k1, got %q", got[0].ID)
	}
}

// TestFilterAuditBranchesByCategoryNoFilter: nil/empty allowlist
// returns the input unchanged. Audit's natural default is "show all
// branches" — distinct from /nearby's "must specify a type for the
// candidate to be evaluated" semantics.
func TestFilterAuditBranchesByCategoryNoFilter(t *testing.T) {
	branches := []auditBranchResponse{
		{ID: "n1", Terminal: &segmentTerminal{ID: 1, Type: "Notable"}},
		{ID: "k1", Terminal: &segmentTerminal{ID: 2, Type: "Keystone"}},
	}
	got := filterAuditBranchesByCategory(branches, nil)
	if len(got) != 2 {
		t.Errorf("nil filter should pass through, got %d branches", len(got))
	}
	got = filterAuditBranchesByCategory(branches, map[string]bool{})
	if len(got) != 2 {
		t.Errorf("empty filter should pass through, got %d branches", len(got))
	}
}
