package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
)

// TestCompareModSourcesAlwaysEmitsRequestedKeys exercises the wrapper.lua
// injectStatSources contract: every requested stat name MUST appear in
// data.statSources, even when the underlying ModDB walk has no rows
// (which happens for derived/calc-aggregate stats like CombinedDPS that
// aren't backed by individual mods).
//
// HISTORICAL NOTE: This test was written to reproduce a user-reported bug
// where a /compare with `mod_sources=["Life","CombinedDPS"]` came back
// keyed only on CombinedDPS with empty arrays — Life apparently dropped.
// The test passes against the canonical fixture XMLs without any wrapper.lua
// fix: the server returns `{Life: [10 rows], CombinedDPS: []}` on both
// builds. serializeStatSources never returns nil when the build loads
// (it returns an empty Lua table `{}`, which is truthy and assigns
// correctly), so the dropped-key shape can't originate server-side here.
// The user-visible symptom is most likely an AI-narrative artifact
// (model elided the non-empty Life rows from its summary) or a downstream
// view filter, not a Go/Lua emission bug. Test stays as a regression
// guard against ever weakening the always-emit-requested-keys contract.
func TestCompareModSourcesAlwaysEmitsRequestedKeys(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	resp := postCompare(t, ts, map[string]any{
		"builds":     []string{idA, idB},
		"modSources": []string{"Life", "CombinedDPS"},
	})

	if len(resp.Builds) != 2 {
		t.Fatalf("expected 2 builds, got %d (errors: %v)", len(resp.Builds), buildErrors(resp.Builds))
	}
	for i, b := range resp.Builds {
		if b.Error != "" {
			t.Errorf("build[%d] error: %s", i, b.Error)
			continue
		}
		t.Logf("build[%d] label=%q statSources keys: %v", i, b.Label, sortedKeys(b.StatSources))
		for _, k := range sortedKeys(b.StatSources) {
			rows := decodeRows(t, b.StatSources[k])
			t.Logf("  %s: %d rows; raw bytes=%d", k, len(rows), len(b.StatSources[k]))
		}
		if _, ok := b.StatSources["Life"]; !ok {
			t.Errorf("build[%d] (label=%q): statSources missing 'Life' key. Got keys: %v",
				i, b.Label, sortedKeys(b.StatSources))
		}
		if _, ok := b.StatSources["CombinedDPS"]; !ok {
			t.Errorf("build[%d] (label=%q): statSources missing 'CombinedDPS' key. Got keys: %v",
				i, b.Label, sortedKeys(b.StatSources))
		}
		// Life should have actual mod rows on a real build (every PoB build has Life from base + items).
		if rows := decodeRows(t, b.StatSources["Life"]); len(rows) == 0 {
			t.Errorf("build[%d] (label=%q): expected non-empty Life rows, got %d", i, b.Label, len(rows))
		}
		// CombinedDPS is calc-derived → empty array is the correct emission.
		if rows := decodeRows(t, b.StatSources["CombinedDPS"]); rows == nil {
			t.Errorf("build[%d] (label=%q): CombinedDPS should be an empty array, not nil/missing", i, b.Label)
		}
	}
}

// TestCompareModSourcesDoesNotLeakBetweenCalls reproduces the second-call
// symptom from the user-reported bug — a follow-up /compare with different
// mod_sources against the same builds reportedly returned the first call's
// keys instead of the new request.
//
// HISTORICAL NOTE: Like its sibling above, this test passes against the
// canonical fixtures without any fix. The cache fast-path is skipped
// when statSources != nil (compare.go:516), so each call goes through
// fresh wrapper.lua calc with that call's stat list — no state carries
// across requests. Test stays as a regression guard.
func TestCompareModSourcesDoesNotLeakBetweenCalls(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	// First call seeds wrapper.lua with one stat list.
	_ = postCompare(t, ts, map[string]any{
		"builds":     []string{idA, idB},
		"modSources": []string{"Life", "CombinedDPS"},
	})

	// Second call uses a disjoint stat list against the same builds.
	resp := postCompare(t, ts, map[string]any{
		"builds":     []string{idA, idB},
		"modSources": []string{"TotalDPS", "AverageHit", "Speed"},
	})

	expected := map[string]bool{"TotalDPS": true, "AverageHit": true, "Speed": true}
	for i, b := range resp.Builds {
		if b.Error != "" {
			t.Errorf("build[%d] error: %s", i, b.Error)
			continue
		}
		got := sortedKeys(b.StatSources)
		// The second call's statSources MUST contain exactly the new stats,
		// no leakage from the first call.
		gotSet := map[string]bool{}
		for _, k := range got {
			gotSet[k] = true
		}
		for k := range expected {
			if !gotSet[k] {
				t.Errorf("build[%d] (label=%q): missing expected key %q. Got: %v", i, b.Label, k, got)
			}
		}
		for k := range gotSet {
			if !expected[k] {
				t.Errorf(
					"build[%d] (label=%q): unexpected key %q (leaked from prior call?). Got: %v",
					i, b.Label, k, got,
				)
			}
		}
	}
}

// postCompare issues a /compare POST and decodes the response. Failures
// in plumbing (wrong status, bad JSON) are fatal — bug-shape failures
// belong to the caller's assertions.
func postCompare(t *testing.T, ts *httptest.Server, body map[string]any) *compareResponseShape {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.Post(ts.URL+"/compare", "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("POST /compare: %v", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /compare: expected 200, got %d: %s", resp.StatusCode, respBody)
	}
	var decoded compareResponseShape
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		t.Fatalf("decode /compare response: %v\nbody: %s", err, respBody)
	}
	return &decoded
}

// compareResponseShape is a minimal decode of CompareResponse — enough
// to assert on per-build statSources keys + per-diff dimensions without
// coupling to the full internal wire shape. Extend per-test as new
// dimensions need assertions.
type compareResponseShape struct {
	Builds []struct {
		Label       string                     `json:"label"`
		Error       string                     `json:"error,omitempty"`
		StatSources map[string]json.RawMessage `json:"statSources,omitempty"`
	} `json:"builds"`
	Diffs *struct {
		Skills []struct {
			Label    string     `json:"label"`
			PerBuild [][]string `json:"perBuild"`
			Same     bool       `json:"same"`
		} `json:"skills,omitempty"`
		Gear map[string]json.RawMessage `json:"gear,omitempty"`
	} `json:"diffs,omitempty"`
}

// decodeRows decodes a raw statSources entry into the row slice. nil
// raw → nil slice (the field was missing from response). Empty `[]`
// raw → empty non-nil slice (correct emission for derived stats).
func decodeRows(t *testing.T, raw json.RawMessage) []map[string]any {
	t.Helper()
	if len(raw) == 0 {
		return nil
	}
	var rows []map[string]any
	if err := json.Unmarshal(raw, &rows); err != nil {
		t.Fatalf("decode rows: %v\nraw: %s", err, raw)
	}
	if rows == nil {
		// Distinguish JSON `[]` (decoded as non-nil empty slice) from JSON `null`.
		// json.Unmarshal of `[]` produces a non-nil zero-length slice; null gives nil.
		return []map[string]any{}
	}
	return rows
}

func sortedKeys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func buildErrors(builds []struct {
	Label       string                     `json:"label"`
	Error       string                     `json:"error,omitempty"`
	StatSources map[string]json.RawMessage `json:"statSources,omitempty"`
}) []string {
	out := []string{}
	for _, b := range builds {
		if b.Error != "" {
			out = append(out, b.Error)
		}
	}
	return out
}
