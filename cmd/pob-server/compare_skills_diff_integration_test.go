package main

import (
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
