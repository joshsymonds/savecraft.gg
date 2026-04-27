package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestCompareSkillsDiffOnFixturePair reproduces the diffs.skills
// placeholder bug observed in the production /compare response on the
// canonical fixture pair. Both builds have ~7 socket groups; the diff
// returns a single `{label:"", perBuild:[[],[]], same:false}` row
// because indexSocketGroupsByLabel collapses unlabeled socket groups —
// PoB's default for user-undefined labels — into one bucket keyed on
// the empty string, with "last occurrence wins" semantics. After the
// fix, every diff entry has a non-empty label and at least one build
// contributes a non-empty gem list.
func TestCompareSkillsDiffOnFixturePair(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	resp := postCompare(t, ts, map[string]any{
		"builds": []string{idA, idB},
	})

	if resp.Diffs == nil {
		t.Fatalf("expected diffs to be present, got nil")
	}

	t.Logf("skills diff entries: %d", len(resp.Diffs.Skills))
	for i, sk := range resp.Diffs.Skills {
		t.Logf("  [%d] label=%q same=%v perBuild lengths=%v", i, sk.Label, sk.Same, perBuildLens(sk.PerBuild))
	}

	// A real diff for two builds with ~7 socket groups each must produce
	// more than a single entry. The placeholder bug always returns 1.
	if len(resp.Diffs.Skills) <= 1 {
		t.Errorf("expected >1 skills diff entries (each build has ~7 socket groups), got %d", len(resp.Diffs.Skills))
	}

	for i, sk := range resp.Diffs.Skills {
		if sk.Label == "" {
			t.Errorf("skills[%d]: empty label — wrapper.lua should synthesize a fallback when group.label is unset", i)
		}
		anyGems := false
		for _, perBuild := range sk.PerBuild {
			if len(perBuild) > 0 {
				anyGems = true
				break
			}
		}
		if !anyGems {
			t.Errorf("skills[%d] (label=%q): all perBuild arrays empty — placeholder row leaked through", i, sk.Label)
		}
	}
}

func perBuildLens(perBuild [][]string) []int {
	out := make([]int, len(perBuild))
	for i, p := range perBuild {
		out[i] = len(p)
	}
	return out
}

// TestCompareSkillsDiffEmitsGemsBreakdownOnFixturePair pins that the
// canonical fixture pair (Static Strike build A with 8 gems vs build B
// with 6 gems per the v2-epic LLM feedback) produces at least one
// socketGroup with a populated gemsDiff. Without this, the wire shape
// could change to never emit gemsDiff in production even though unit
// tests against synthetic data pass.
//
// Three invariants checked:
//  1. At least one same:false socketGroup carries a non-nil gemsDiff.
//  2. That gemsDiff has perBuild length matching the diff's perBuild.
//  3. gemsDiff.common is sorted ascending.
func TestCompareSkillsDiffEmitsGemsBreakdownOnFixturePair(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	resp := postCompareSkillsGemsDiff(t, ts, []string{idA, idB})

	if resp.Diffs == nil {
		t.Fatalf("expected diffs to be present, got nil")
	}
	if len(resp.Diffs.Skills) == 0 {
		t.Fatalf("expected non-empty skills diff, got 0 entries")
	}

	var withBreakdown []skillsGroupDiffOnWire
	for _, sk := range resp.Diffs.Skills {
		t.Logf("  label=%q same=%v gemsDiff=%v",
			sk.Label, sk.Same, formatGemsDiff(sk.GemsDiff))
		if sk.GemsDiff != nil {
			withBreakdown = append(withBreakdown, sk)
		}
	}

	// Invariant 1: at least one populated gemsDiff. Both fixtures have
	// the same Static Strike main skill but different gem counts (the
	// LLM feedback called out "8 gems vs 6"); that's exactly the case
	// gemsDiff handles.
	if len(withBreakdown) == 0 {
		t.Fatalf(
			"expected at least one socketGroup with gemsDiff populated; got %d entries (the canonical fixtures should produce gemsDiff for at least the Static Strike group)",
			len(resp.Diffs.Skills),
		)
	}

	// Invariants 2 + 3: structural checks on the populated entries.
	for _, sk := range withBreakdown {
		if sk.Same {
			t.Errorf("socketGroup %q: gemsDiff present but same:true — gemsDiff should only emit when same:false",
				sk.Label)
		}
		if len(sk.GemsDiff.PerBuild) != len(sk.PerBuild) {
			t.Errorf(
				"socketGroup %q: gemsDiff.perBuild length = %d, want %d (must match top-level perBuild)",
				sk.Label, len(sk.GemsDiff.PerBuild), len(sk.PerBuild),
			)
		}
		// gemsDiff.common is sorted ascending.
		for i := 1; i < len(sk.GemsDiff.Common); i++ {
			if sk.GemsDiff.Common[i] < sk.GemsDiff.Common[i-1] {
				t.Errorf("socketGroup %q: gemsDiff.common not sorted ascending: %v",
					sk.Label, sk.GemsDiff.Common)
				break
			}
		}
	}
}

// skillsGroupDiffOnWire is the integration-test decode of one entry in
// diffs.skills, including the new gemsDiff field. Defined locally so
// this test file's decode shape doesn't fight with the
// compareResponseShape used by other integration tests.
type skillsGroupDiffOnWire struct {
	Label    string                `json:"label"`
	PerBuild [][]string            `json:"perBuild"`
	Same     bool                  `json:"same"`
	GemsDiff *skillsGemsDiffOnWire `json:"gemsDiff,omitempty"`
}

// compareRespSkillsGemsDiff is a permissive decode for this test —
// just the diffs.skills slice with gemsDiff support.
type compareRespSkillsGemsDiff struct {
	Diffs *struct {
		Skills []skillsGroupDiffOnWire `json:"skills,omitempty"`
	} `json:"diffs,omitempty"`
}

// postCompareSkillsGemsDiff posts /compare and decodes the response
// into the local gemsDiff-aware shape.
func postCompareSkillsGemsDiff(t *testing.T, ts *httptest.Server, ids []string) *compareRespSkillsGemsDiff {
	t.Helper()
	body, err := json.Marshal(map[string]any{"builds": ids})
	if err != nil {
		t.Fatal(err)
	}
	httpResp, err := http.Post(ts.URL+"/compare", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /compare: %v", err)
	}
	defer httpResp.Body.Close()
	respBody, _ := io.ReadAll(httpResp.Body)
	if httpResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /compare: expected 200, got %d: %s", httpResp.StatusCode, respBody)
	}
	var decoded compareRespSkillsGemsDiff
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, respBody)
	}
	return &decoded
}

// formatGemsDiff renders a gemsDiff for diagnostic logging. Returns
// "<nil>" when absent so the t.Logf line still reads coherently.
func formatGemsDiff(d *skillsGemsDiffOnWire) string {
	if d == nil {
		return "<nil>"
	}
	b, _ := json.Marshal(d)
	return string(b)
}
