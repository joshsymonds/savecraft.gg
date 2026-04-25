package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// compareHarness builds a Server with two cached builds for /compare to
// pick up by buildId, plus a mock pool primed to respond with calc data
// twice (once per build). Returns the server, the two seeded buildIds,
// and the captured-requests fn.
//
// Pool size is forced to 1 because the captureMockPool subprocess script
// reads responses from a shared file via FD 3 — each spawned subprocess
// gets its own independent file offset, so multi-process /compare would
// read response[0] twice instead of [0] then [1]. With pool size 1 the
// LRU-eviction path repurposes the same process for each build,
// preserving sequential read order through the mock.
func compareHarness(
	t *testing.T,
	xmlA, xmlB string,
	calcResponseA, calcResponseB string,
) (*Server, string, string, func() []map[string]any) {
	t.Helper()
	pool, captured := captureMockPool(t, []string{calcResponseA, calcResponseB})
	pool.maxSize = 1
	pool.affinityMaxPins = 1
	t.Cleanup(func() { pool.Shutdown() })

	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	idA := srv.cache.Put(xmlA)
	if err := srv.cache.store.Put(idA, xmlA, "", "", ""); err != nil {
		t.Fatal(err)
	}
	idB := srv.cache.Put(xmlB)
	if err := srv.cache.store.Put(idB, xmlB, "", "", ""); err != nil {
		t.Fatal(err)
	}
	return srv, idA, idB, captured
}

// minimalCalcResponseClass returns a wrapper.lua-shaped response with the
// given character class — used to verify per-build entries carry the
// distinct character + summary data.
func minimalCalcResponseClass(class string, dps int) string {
	return `{"type":"result","data":{` +
		`"character":{"class":"` + class + `","ascendancy":"X","level":99},` +
		`"summary":{"CombinedDPS":` + itoa(dps) + `,"Life":6000,"LifeUnreserved":6000,"LifeUnreservedPercent":100,` +
		`"EnergyShield":0,"Mana":500,"Armour":0,"Evasion":0,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":0,"SpellSuppressionChance":0,"MovementSpeedMod":1,` +
		`"Str":100,"Dex":100,"Int":100,"FlaskEffect":0,"FlaskChargeGen":0,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":` + itoa(dps) + `},` +
		`"section_index":[],"sections":{}}}`
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var s string
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		s = string(rune('0'+(n%10))) + s
		n /= 10
	}
	if neg {
		s = "-" + s
	}
	return s
}

func decodeCompare(t *testing.T, body []byte) compareResp {
	t.Helper()
	var resp compareResp
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

type compareResp struct {
	Builds []compareEntry `json:"builds"`
}

type compareEntry struct {
	ID        string         `json:"id"`
	Label     string         `json:"label"`
	Character map[string]any `json:"character"`
	Summary   map[string]any `json:"summary"`
	Error     string         `json:"error"`
}

// TestCompareN2HappyPath: two buildIds → response carries both, with each
// build's character class and summary preserved per slot.
func TestCompareN2HappyPath(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<PathOfBuilding/>",
		"<PathOfBuilding><X/></PathOfBuilding>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 250000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompare(t, rec.Body.Bytes())
	if len(resp.Builds) != 2 {
		t.Fatalf("expected 2 builds in response, got %d", len(resp.Builds))
	}
	if resp.Builds[0].Character["class"] != "Witch" {
		t.Errorf("build[0].class = %v, want Witch", resp.Builds[0].Character["class"])
	}
	if resp.Builds[1].Character["class"] != "Marauder" {
		t.Errorf("build[1].class = %v, want Marauder", resp.Builds[1].Character["class"])
	}
	if resp.Builds[0].Summary["CombinedDPS"] != float64(100000) {
		t.Errorf("build[0].summary.CombinedDPS = %v, want 100000", resp.Builds[0].Summary["CombinedDPS"])
	}
	if resp.Builds[0].Error != "" {
		t.Errorf("build[0] should not have error: %q", resp.Builds[0].Error)
	}
}

// TestCompareN3HappyPath: three buildIds work the same — verifies the
// shape doesn't have a 2-build assumption baked in.
func TestCompareN3HappyPath(t *testing.T) {
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

	xmlA := "<PathOfBuilding/>"
	xmlB := "<PathOfBuilding><B/></PathOfBuilding>"
	xmlC := "<PathOfBuilding><C/></PathOfBuilding>"
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
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompare(t, rec.Body.Bytes())
	if len(resp.Builds) != 3 {
		t.Fatalf("expected 3 builds in response, got %d", len(resp.Builds))
	}
	classes := []string{
		resp.Builds[0].Character["class"].(string),
		resp.Builds[1].Character["class"].(string),
		resp.Builds[2].Character["class"].(string),
	}
	want := map[string]bool{"Witch": false, "Marauder": false, "Ranger": false}
	for _, class := range classes {
		if _, ok := want[class]; ok {
			want[class] = true
		}
	}
	for c, seen := range want {
		if !seen {
			t.Errorf("class %q missing from response", c)
		}
	}
}

// TestCompareLabelsParam: optional labels[] decorates each build. Length
// mismatch is permitted — extra labels are dropped, missing labels fall
// back to auto-generated ones.
func TestCompareLabelsParam(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 250000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"],"labels":["My Build","Guide"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompare(t, rec.Body.Bytes())
	if resp.Builds[0].Label != "My Build" {
		t.Errorf("build[0].label = %q, want My Build", resp.Builds[0].Label)
	}
	if resp.Builds[1].Label != "Guide" {
		t.Errorf("build[1].label = %q, want Guide", resp.Builds[1].Label)
	}
}

// TestCompareLabelsAutoGenerated: when labels is omitted, each entry gets
// an auto-generated label (first 8 chars of buildId).
func TestCompareLabelsAutoGenerated(t *testing.T) {
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
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompare(t, rec.Body.Bytes())
	if resp.Builds[0].Label == "" {
		t.Error("build[0].label is empty; expected auto-generated")
	}
	if resp.Builds[1].Label == "" {
		t.Error("build[1].label is empty; expected auto-generated")
	}
	if resp.Builds[0].Label == resp.Builds[1].Label {
		t.Errorf("auto-generated labels collide: %q == %q", resp.Builds[0].Label, resp.Builds[1].Label)
	}
}

// TestCompareEmptyBuildsRejected: empty array → 400.
func TestCompareEmptyBuildsRejected(t *testing.T) {
	pool, _ := captureMockPool(t, nil)
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(`{"builds":[]}`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestCompareSingleBuildRejected: N=1 → 400 with "at least 2".
func TestCompareSingleBuildRejected(t *testing.T) {
	pool, _ := captureMockPool(t, nil)
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(`{"builds":["abc"]}`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "at least 2") {
		t.Errorf("error body should explain 2..N requirement: %s", rec.Body.String())
	}
}

// TestCompareUnknownBuildIDPerSlot: passing a buildId that doesn't exist
// reports `error` in that slot; other builds still resolve.
func TestCompareUnknownBuildIDPerSlot(t *testing.T) {
	pool, _ := captureMockPool(t, []string{minimalCalcResponseClass("Witch", 100000)})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	xmlA := "<PathOfBuilding/>"
	idA := srv.cache.Put(xmlA)
	_ = srv.cache.store.Put(idA, xmlA, "", "", "")

	body := `{"builds":["` + idA + `","00000000000000000000000000000000"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (partial success), got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompare(t, rec.Body.Bytes())
	if len(resp.Builds) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(resp.Builds))
	}
	if resp.Builds[0].Error != "" {
		t.Errorf("build[0] should succeed; got error %q", resp.Builds[0].Error)
	}
	if resp.Builds[1].Error == "" {
		t.Errorf("build[1] should have error (unknown id)")
	}
	if resp.Builds[1].Summary != nil {
		t.Errorf("build[1] should not have summary; got %v", resp.Builds[1].Summary)
	}
}

// TestCompareAllBuildsFail: every build is unknown → 502 with per-build
// errors in the response body.
func TestCompareAllBuildsFail(t *testing.T) {
	pool, _ := captureMockPool(t, nil)
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	body := `{"builds":["00000000000000000000000000000000","11111111111111111111111111111111"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 (all-fail), got %d: %s", rec.Code, rec.Body.String())
	}
}
