package sets

import (
	"sort"
	"strings"
	"testing"
)

func TestArenaSetCodes(t *testing.T) {
	codes := arenaSetCodes()

	if len(codes) == 0 {
		t.Fatal("arenaSetCodes returned empty slice")
	}

	// All codes should be uppercase.
	for _, code := range codes {
		if code != strings.ToUpper(code) {
			t.Errorf("code %q is not uppercase", code)
		}
	}

	// Codes should be sorted.
	if !sort.StringsAreSorted(codes) {
		t.Errorf("codes are not sorted: %v", codes[:min(10, len(codes))])
	}

	// Codes should be deduplicated.
	seen := make(map[string]bool, len(codes))
	for _, code := range codes {
		if seen[code] {
			t.Errorf("duplicate code: %q", code)
		}
		seen[code] = true
	}

	// Spot-check: FDN should be present (Foundations, a known Arena set).
	if !seen["FDN"] {
		t.Errorf("expected FDN in codes, got %d codes: %v", len(codes), codes[:min(10, len(codes))])
	}
}
