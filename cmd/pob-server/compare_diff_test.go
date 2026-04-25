package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// compareRespWithDiffs decodes the /compare body using the diff-aware
// response shape. Used by every test in this file; equivalent to
// compareResp from compare_test.go but with the Diffs field populated.
type compareRespWithDiffs struct {
	Builds []compareEntry      `json:"builds"`
	Diffs  *compareDiffsOnWire `json:"diffs"`
}

type compareDiffsOnWire struct {
	Summary map[string]compareStatDiffOnWire `json:"summary"`
}

type compareStatDiffOnWire struct {
	PerBuild []float64 `json:"perBuild"`
	Leader   int       `json:"leader"`
	Range    float64   `json:"range"`
}

func decodeCompareWithDiffs(t *testing.T, body []byte) compareRespWithDiffs {
	t.Helper()
	var resp compareRespWithDiffs
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

// TestCompareSummaryDiffN2: two builds with different DPS produce a
// summary diff entry with perBuild=[A,B], leader=index-of-max, and
// range=(max-min)/max.
func TestCompareSummaryDiffN2(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 250000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithDiffs(t, rec.Body.Bytes())
	if resp.Diffs == nil || resp.Diffs.Summary == nil {
		t.Fatalf("expected diffs.summary in response, got nil")
	}

	dps := resp.Diffs.Summary["CombinedDPS"]
	if len(dps.PerBuild) != 2 {
		t.Fatalf("expected perBuild length 2, got %d", len(dps.PerBuild))
	}
	if dps.PerBuild[0] != 100000 || dps.PerBuild[1] != 250000 {
		t.Errorf("perBuild = %v, want [100000, 250000]", dps.PerBuild)
	}
	if dps.Leader != 1 {
		t.Errorf("leader = %d, want 1 (build B has higher DPS)", dps.Leader)
	}
	wantRange := (250000.0 - 100000.0) / 250000.0
	if absDelta(dps.Range, wantRange) > 1e-9 {
		t.Errorf("range = %v, want %v", dps.Range, wantRange)
	}
}

// TestCompareSummaryDiffN3: three builds → leader is the index of the
// highest value across all three.
func TestCompareSummaryDiffN3(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 250000),
		minimalCalcResponseClass("Ranger", 175000),
	})
	pool.maxSize = 1
	pool.affinityMaxPins = 1
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xmlA := "<A/>"
	xmlB := "<B/>"
	xmlC := "<C/>"
	idA := srv.cache.Put(xmlA)
	idB := srv.cache.Put(xmlB)
	idC := srv.cache.Put(xmlC)
	for id, xml := range map[string]string{idA: xmlA, idB: xmlB, idC: xmlC} {
		_ = srv.cache.store.Put(id, xml, "", "", "")
	}

	body := `{"builds":["` + idA + `","` + idB + `","` + idC + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithDiffs(t, rec.Body.Bytes())
	if resp.Diffs == nil {
		t.Fatal("expected diffs")
	}
	dps := resp.Diffs.Summary["CombinedDPS"]
	if len(dps.PerBuild) != 3 {
		t.Fatalf("perBuild length = %d, want 3", len(dps.PerBuild))
	}
	// leader is whichever index in the response slice corresponds to 250000;
	// the order of slot assignment depends on how the mock script reads
	// canned responses, but Marauder is at 250000 across the three slots.
	max := dps.PerBuild[0]
	maxIdx := 0
	for i, v := range dps.PerBuild {
		if v > max {
			max = v
			maxIdx = i
		}
	}
	if dps.Leader != maxIdx {
		t.Errorf("leader = %d, want %d (the max index in perBuild=%v)", dps.Leader, maxIdx, dps.PerBuild)
	}
	if max != 250000 {
		t.Errorf("max value = %v, want 250000", max)
	}
}

// TestCompareSummaryDiffEqualValues: identical stats produce range=0;
// leader is the lowest index (tied → first wins).
func TestCompareSummaryDiffEqualValues(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Witch", 100000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithDiffs(t, rec.Body.Bytes())
	dps := resp.Diffs.Summary["CombinedDPS"]
	if dps.Range != 0 {
		t.Errorf("range = %v, want 0 (identical values)", dps.Range)
	}
	if dps.Leader != 0 {
		t.Errorf("leader = %d, want 0 (tied → first index wins)", dps.Leader)
	}
}

// TestCompareSummaryDiffOmitsErroredSlots: when one of two builds errors,
// the diffs object is omitted (need ≥2 successful slots to produce a
// meaningful diff).
func TestCompareSummaryDiffOmitsErroredSlots(t *testing.T) {
	pool, _ := captureMockPool(t, []string{minimalCalcResponseClass("Witch", 100000)})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xmlA := "<PathOfBuilding/>"
	idA := srv.cache.Put(xmlA)
	_ = srv.cache.store.Put(idA, xmlA, "", "", "")

	// Second build is an unknown ID — produces an Error slot.
	body := `{"builds":["` + idA + `","00000000000000000000000000000000"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (partial), got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithDiffs(t, rec.Body.Bytes())
	if resp.Diffs != nil {
		t.Errorf("expected diffs to be omitted with only 1 successful slot, got: %+v", resp.Diffs)
	}
}

// TestCompareSummaryDiffSubsetSucceeds: when 2 of 3 succeed, the diffs
// are computed across the successful subset; the errored slot's index is
// excluded from the diff but still present in builds[].
func TestCompareSummaryDiffSubsetSucceeds(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 250000),
	})
	pool.maxSize = 1
	pool.affinityMaxPins = 1
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xmlA := "<A/>"
	xmlB := "<B/>"
	idA := srv.cache.Put(xmlA)
	idB := srv.cache.Put(xmlB)
	_ = srv.cache.store.Put(idA, xmlA, "", "", "")
	_ = srv.cache.store.Put(idB, xmlB, "", "", "")

	// Three builds; the middle one is bogus → error slot at index 1.
	body := `{"builds":["` + idA + `","00000000000000000000000000000000","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithDiffs(t, rec.Body.Bytes())
	if len(resp.Builds) != 3 {
		t.Fatalf("builds length = %d, want 3", len(resp.Builds))
	}
	if resp.Builds[1].Error == "" {
		t.Errorf("builds[1] should have an error")
	}
	if resp.Diffs == nil {
		t.Fatal("expected diffs across the 2 successful slots")
	}
	dps := resp.Diffs.Summary["CombinedDPS"]
	// perBuild has length 2 (subset of successful builds).
	if len(dps.PerBuild) != 2 {
		t.Errorf("perBuild length = %d, want 2 (successful subset)", len(dps.PerBuild))
	}
}

// TestCompareSummaryDiffExcludesPartialKeys: a stat present in build[0]'s
// summary but not build[1]'s is omitted from the diff (can't rank
// without all data points).
func TestCompareSummaryDiffExcludesPartialKeys(t *testing.T) {
	respA := `{"type":"result","data":{` +
		`"character":{"class":"Witch","ascendancy":"X","level":99},` +
		// Both stats present in A
		`"summary":{"CombinedDPS":100000,"PartialOnlyA":42},` +
		`"section_index":[],"sections":{}}}`
	respB := `{"type":"result","data":{` +
		`"character":{"class":"Marauder","ascendancy":"X","level":99},` +
		// Only one stat present in B
		`"summary":{"CombinedDPS":250000},` +
		`"section_index":[],"sections":{}}}`

	srv, idA, idB, _ := compareHarness(t, "<A/>", "<B/>", respA, respB)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithDiffs(t, rec.Body.Bytes())
	if resp.Diffs == nil {
		t.Fatal("expected diffs")
	}
	if _, ok := resp.Diffs.Summary["CombinedDPS"]; !ok {
		t.Errorf("CombinedDPS must be in diff (present in both)")
	}
	if _, ok := resp.Diffs.Summary["PartialOnlyA"]; ok {
		t.Errorf("PartialOnlyA must NOT be in diff (missing from build B)")
	}
}

// TestCompareSummaryDiffAllZeroes: when every build's stat is zero,
// range=0 and leader=0 (no signal but no panic either).
func TestCompareSummaryDiffAllZeroes(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 0),
		minimalCalcResponseClass("Marauder", 0),
	)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithDiffs(t, rec.Body.Bytes())
	dps := resp.Diffs.Summary["CombinedDPS"]
	if dps.Range != 0 {
		t.Errorf("range = %v, want 0", dps.Range)
	}
	if dps.Leader != 0 {
		t.Errorf("leader = %d, want 0", dps.Leader)
	}
}

func absDelta(a, b float64) float64 {
	if a > b {
		return a - b
	}
	return b - a
}
