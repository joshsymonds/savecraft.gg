package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// compareRespWithModSourcesDiff exposes diffs.modSources for assertion.
type compareRespWithModSourcesDiff struct {
	Diffs *compareDiffsModSourcesOnWire `json:"diffs"`
}

type compareDiffsModSourcesOnWire struct {
	ModSources map[string][]compareModSourceDiffOnWire `json:"modSources"`
}

type compareModSourceDiffOnWire struct {
	Key        string                        `json:"key"`
	SourceType string                        `json:"source_type"`
	ModType    string                        `json:"mod_type"`
	PerBuild   []*compareModSourceCellOnWire `json:"perBuild"`
}

type compareModSourceCellOnWire struct {
	SourceName string  `json:"source_name"`
	ModName    string  `json:"mod_name"`
	Value      float64 `json:"value"`
}

func decodeCompareWithModSourcesDiff(t *testing.T, body []byte) compareRespWithModSourcesDiff {
	t.Helper()
	var resp compareRespWithModSourcesDiff
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

// TestCompareModSourcesDiffMatchesNormalizedKeys: same item contributing
// the same mod across builds collapses to a single entry where every
// PerBuild slot carries data — the ModRowKey normalization makes
// item-index differences invisible.
//
// Per the slice-8 task notes: source_name from ResolveSourceName is
// already index-stripped, so building a key from (source_type,
// source_name, mod_name, mod_type) gives the same matching semantics as
// PoB's upstream ModRowKey.
func TestCompareModSourcesDiffMatchesNormalizedKeys(t *testing.T) {
	respA := calcResponseWithStatSources("Witch", map[string][]map[string]any{
		"Life": {
			{
				"source_type": "Item",
				"source_name": "Belly of the Beast",
				"mod_name":    "Life",
				"mod_type":    "INC",
				"value":       40.0,
			},
		},
	})
	respB := calcResponseWithStatSources("Marauder", map[string][]map[string]any{
		"Life": {
			{
				"source_type": "Item",
				"source_name": "Belly of the Beast",
				"mod_name":    "Life",
				"mod_type":    "INC",
				"value":       40.0,
			},
		},
	})
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>", respA, respB)
	body := `{"builds":["` + idA + `","` + idB + `"],"modSources":["Life"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithModSourcesDiff(t, rec.Body.Bytes())
	if resp.Diffs == nil || resp.Diffs.ModSources == nil {
		t.Fatalf("expected diffs.modSources, got nil; body=%s", rec.Body.String())
	}
	// Same value across both builds should be filtered (same-row → no entry).
	// This matches the config-diff filter precedent — the diff surfaces
	// differences, not common state.
	if len(resp.Diffs.ModSources["Life"]) != 0 {
		t.Errorf("expected 0 Life entries (same value filtered), got %d: %+v",
			len(resp.Diffs.ModSources["Life"]), resp.Diffs.ModSources["Life"])
	}
}

// TestCompareModSourcesDiffUniquePerBuild: when each build has a
// different mod contributing to the same stat, both rows survive
// filtering and each carries one non-nil PerBuild slot.
func TestCompareModSourcesDiffUniquePerBuild(t *testing.T) {
	respA := calcResponseWithStatSources("Witch", map[string][]map[string]any{
		"Life": {
			{
				"source_type": "Tree",
				"source_name": "Cruel Preparation",
				"mod_name":    "Life",
				"mod_type":    "BASE",
				"value":       50.0,
			},
		},
	})
	respB := calcResponseWithStatSources("Marauder", map[string][]map[string]any{
		"Life": {
			{
				"source_type": "Tree",
				"source_name": "Heart of the Warrior",
				"mod_name":    "Life",
				"mod_type":    "INC",
				"value":       30.0,
			},
		},
	})
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>", respA, respB)
	body := `{"builds":["` + idA + `","` + idB + `"],"modSources":["Life"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithModSourcesDiff(t, rec.Body.Bytes())
	entries := resp.Diffs.ModSources["Life"]
	if len(entries) != 2 {
		t.Fatalf("expected 2 Life entries (one per build), got %d: %+v", len(entries), entries)
	}
	for _, entry := range entries {
		nonNil := 0
		for _, cell := range entry.PerBuild {
			if cell != nil {
				nonNil++
			}
		}
		if nonNil != 1 {
			t.Errorf("entry %q expected 1 non-nil PerBuild slot, got %d: %+v", entry.Key, nonNil, entry)
		}
	}
}

// TestCompareModSourcesDiffOmittedWithoutModSourcesRequest: when the
// request omits modSources, no entries have StatSources, so
// diffs.modSources is omitted entirely (nil/missing).
func TestCompareModSourcesDiffOmittedWithoutModSourcesRequest(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 200000),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithModSourcesDiff(t, rec.Body.Bytes())
	if resp.Diffs != nil && len(resp.Diffs.ModSources) > 0 {
		t.Errorf("expected diffs.modSources omitted; got %+v", resp.Diffs.ModSources)
	}
}

// TestCompareModSourcesDiffN3: three builds where two share a mod and
// one has a unique mod. The shared row should be filtered (same across
// the two that have it AND missing from the third), and the unique row
// should appear with two nils + one populated cell.
//
// Updated edge case: a row "shared by 2 of 3 with the third absent" is
// NOT identical across all builds (one slot is nil) — it survives the
// filter as a 2-vs-nil mismatch. The truly-filtered case is "same row
// across ALL builds with no nils".
func TestCompareModSourcesDiffN3(t *testing.T) {
	shared := map[string]any{
		"source_type": "Item", "source_name": "Belly of the Beast",
		"mod_name": "Life", "mod_type": "INC", "value": 40.0,
	}
	unique := map[string]any{
		"source_type": "Tree", "source_name": "Cruel Preparation",
		"mod_name": "Life", "mod_type": "BASE", "value": 50.0,
	}
	respA := calcResponseWithStatSources("Witch", map[string][]map[string]any{"Life": {shared}})
	respB := calcResponseWithStatSources("Marauder", map[string][]map[string]any{"Life": {shared, unique}})
	respC := calcResponseWithStatSources("Ranger", map[string][]map[string]any{"Life": {shared}})

	// maxSize=1 forces all three builds through the SAME bash
	// subprocess, which reads responses sequentially from the same FD.
	// With maxSize >1 each new spawn opens its own FD on the responses
	// file from byte 0, so multiple subprocesses would all read respA.
	// affinityMaxPins=1 + steal-LRU lets compareOneBuild repurpose the
	// already-pinned process for each subsequent build.
	pool, _ := captureMockPool(t, []string{respA, respB, respC})
	pool.maxSize = 1
	pool.affinityMaxPins = 1
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)
	idA := srv.cache.Put("<A/>")
	idB := srv.cache.Put("<B/>")
	idC := srv.cache.Put("<C/>")
	for _, id := range []string{idA, idB, idC} {
		_ = srv.cache.store.Put(id, "<x/>", "", "", "")
	}

	body := `{"builds":["` + idA + `","` + idB + `","` + idC + `"],"modSources":["Life"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithModSourcesDiff(t, rec.Body.Bytes())
	entries := resp.Diffs.ModSources["Life"]
	// Shared row appears in all 3 → filtered.
	// Unique row appears only in build B → 1 entry, with PerBuild[1] populated and PerBuild[0]/[2] nil.
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry (the unique-to-B row), got %d: %+v", len(entries), entries)
	}
	entry := entries[0]
	if len(entry.PerBuild) != 3 {
		t.Fatalf("expected PerBuild length 3, got %d", len(entry.PerBuild))
	}
	if entry.PerBuild[0] != nil {
		t.Errorf("PerBuild[0] should be nil (unique row absent in A): %+v", entry.PerBuild[0])
	}
	if entry.PerBuild[1] == nil {
		t.Errorf("PerBuild[1] should be populated (unique row present in B)")
	}
	if entry.PerBuild[2] != nil {
		t.Errorf("PerBuild[2] should be nil (unique row absent in C): %+v", entry.PerBuild[2])
	}
}
