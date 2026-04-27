package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestCompareSectionsThreadsRequestedSectionsPerBuild pins the
// /compare?sections=... contract: per-build entries gain a `sections`
// map populated with the requested public-named subkeys, matching
// what /resolve emits. Saves the round-trip via /resolve+build_id.
func TestCompareSectionsThreadsRequestedSectionsPerBuild(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	resp := postCompareWithQuery(t, ts, "?sections=offense,gear,config",
		map[string]any{"builds": []string{idA, idB}})

	if len(resp.Builds) != 2 {
		t.Fatalf("expected 2 builds, got %d", len(resp.Builds))
	}
	for i, b := range resp.Builds {
		if b.Error != "" {
			t.Errorf("build[%d] error: %s", i, b.Error)
			continue
		}
		if b.Sections == nil {
			t.Errorf(
				"build[%d] (label=%q): missing Sections; expected offense+gear+config",
				i, b.Label,
			)
			continue
		}
		for _, key := range []string{"offense", "gear", "config"} {
			if _, ok := b.Sections[key]; !ok {
				t.Errorf("build[%d] (label=%q): Sections missing %q. Got keys: %v",
					i, b.Label, key, sectionKeys(b.Sections))
			}
		}
	}
}

// TestCompareSectionsHonoredOnCacheHit pins that the sections plumbing
// runs on the cache fast-path too — not just the cold-calc path. After
// the first call warms the cache, the second call must still produce
// filtered Sections rather than returning the unfiltered cached blob.
func TestCompareSectionsHonoredOnCacheHit(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	// First call warms the cache without sections — populates the store.
	_ = postCompareWithQuery(t, ts, "", map[string]any{"builds": []string{idA, idB}})

	// Second call requests sections — must hit cache yet still produce filtered output.
	resp := postCompareWithQuery(t, ts, "?sections=defense",
		map[string]any{"builds": []string{idA, idB}})
	for i, b := range resp.Builds {
		if b.Error != "" {
			t.Errorf("build[%d] error: %s", i, b.Error)
			continue
		}
		if b.Sections == nil {
			t.Errorf("build[%d]: cache-hit case missing Sections", i)
			continue
		}
		if _, ok := b.Sections["defense"]; !ok {
			t.Errorf("build[%d]: Sections missing 'defense' (cache fast-path skipped filterSections). Keys: %v",
				i, sectionKeys(b.Sections))
		}
	}
}

// TestCompareNoSectionsReturnsNoSectionsField pins that omitting the
// sections query param leaves the per-build response without a
// Sections field — the empty-case behavior matches the existing
// summary-only contract.
func TestCompareNoSectionsReturnsNoSectionsField(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	resp := postCompareWithQuery(t, ts, "", map[string]any{"builds": []string{idA, idB}})
	for i, b := range resp.Builds {
		if b.Sections != nil {
			t.Errorf("build[%d]: Sections should be omitted when sections query param absent; got keys %v",
				i, sectionKeys(b.Sections))
		}
	}
}

// postCompareWithQuery is postCompare's sibling that allows appending
// a query string to /compare (for sections, stat_keys). querySuffix
// must include the leading "?" or be empty.
func postCompareWithQuery(
	t *testing.T,
	ts *httptest.Server,
	querySuffix string,
	body map[string]any,
) *compareResponseShape {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.Post(ts.URL+"/compare"+querySuffix, "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("POST /compare%s: %v", querySuffix, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /compare%s: expected 200, got %d: %s", querySuffix, resp.StatusCode, respBody)
	}
	var decoded compareResponseShape
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, respBody)
	}
	return &decoded
}

func sectionKeys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
