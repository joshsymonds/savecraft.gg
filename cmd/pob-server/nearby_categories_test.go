package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestNearbyRejectsUnknownCategory validates the category allowlist at
// the handler boundary so the LLM gets a precise error before round-
// tripping through PoB.
func TestNearbyRejectsUnknownCategory(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, `{}`, "", "")

	body := `{"buildId":"` + id + `","metrics":["Life"],"categories":["Bogus"]}`
	req := httptest.NewRequest(http.MethodPost, "/nearby", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleNearby(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Bogus") {
		t.Errorf("error should name the offending category; got %s", rec.Body.String())
	}
}

// TestNearbyShouldEvaluateRespectsAllowedTypes: the predicate honors a
// caller-supplied allowlist instead of the historical hardcoded set.
// Drives the refactor of nearbyShouldEvaluate.
func TestNearbyShouldEvaluateRespectsAllowedTypes(t *testing.T) {
	pathDist := 2
	cases := []struct {
		name    string
		nodeType string
		allowed map[string]bool
		want    bool
	}{
		{"keystone in keystone-only", "Keystone", map[string]bool{"Keystone": true}, true},
		{"notable in keystone-only", "Notable", map[string]bool{"Keystone": true}, false},
		{"normal in default-set", "Normal", map[string]bool{"Normal": true, "Notable": true, "Keystone": true}, true},
		{"mastery in default-set", "Mastery", map[string]bool{"Normal": true, "Notable": true, "Keystone": true}, false},
		{"jewel socket in jewel-only", "JewelSocket", map[string]bool{"JewelSocket": true}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := &nearbyCandidate{
				ID:       1,
				Type:     tc.nodeType,
				Alloc:    false,
				PathDist: &pathDist,
				Path:     []string{"a"},
				ModKey:   "Life",
			}
			got := nearbyShouldEvaluateWithCategories(c, 5, tc.allowed)
			if got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

// TestValidateNearbyCategoriesDefault: empty input returns the
// historical default set so existing callers see no behavior change.
func TestValidateNearbyCategoriesDefault(t *testing.T) {
	got, err := validateNearbyCategories(nil)
	if err != nil {
		t.Fatalf("nil input should not error, got %v", err)
	}
	wantSet := map[string]bool{"Normal": true, "Notable": true, "Keystone": true}
	if len(got) != len(wantSet) {
		t.Fatalf("expected %d categories in default, got %d: %v", len(wantSet), len(got), got)
	}
	for k := range got {
		if !wantSet[k] {
			t.Errorf("unexpected category in default: %q", k)
		}
	}
}

// TestValidateNearbyCategoriesEmptyArrayUsesDefault: explicit empty
// array is equivalent to omission. Mirror config-diff's nullability
// convention so callers that forward an empty array don't silently
// disable everything.
func TestValidateNearbyCategoriesEmptyArrayUsesDefault(t *testing.T) {
	got, err := validateNearbyCategories([]string{})
	if err != nil {
		t.Fatalf("empty input should not error, got %v", err)
	}
	if !got["Keystone"] || !got["Notable"] || !got["Normal"] {
		t.Errorf("empty input should yield default set, got %v", got)
	}
}

// TestValidateNearbyCategoriesCustom: a valid subset returns exactly
// those categories — no implicit padding with the default.
func TestValidateNearbyCategoriesCustom(t *testing.T) {
	got, err := validateNearbyCategories([]string{"Keystone"})
	if err != nil {
		t.Fatalf("valid input should not error, got %v", err)
	}
	if len(got) != 1 || !got["Keystone"] {
		t.Errorf("expected only Keystone, got %v", got)
	}
}

// TestValidateNearbyCategoriesUnknownRejected: any unknown value fails
// with a message that names the bad value AND lists valid options so
// the LLM can self-correct.
func TestValidateNearbyCategoriesUnknownRejected(t *testing.T) {
	_, err := validateNearbyCategories([]string{"Notable", "Bogus"})
	if err == nil {
		t.Fatal("expected error for unknown category")
	}
	msg := err.Error()
	if !strings.Contains(msg, "Bogus") {
		t.Errorf("error should name the offending category; got %q", msg)
	}
	if !strings.Contains(msg, "Keystone") || !strings.Contains(msg, "JewelSocket") {
		t.Errorf("error should list valid options; got %q", msg)
	}
}
