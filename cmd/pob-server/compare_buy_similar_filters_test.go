package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// decodeTradeQueryFromURL parses the trade-search URL's q-parameter
// payload into a generic map for assertion. Avoids re-marshaling
// boilerplate in every filter test.
func decodeTradeQueryFromURL(t *testing.T, tradeURL string) map[string]any {
	t.Helper()
	idx := strings.Index(tradeURL, "?q=")
	if idx == -1 {
		t.Fatalf("URL missing q-param: %s", tradeURL)
	}
	raw := tradeURL[idx+3:]
	// url.QueryUnescape handles +→space and percent-encoding.
	unescaped, err := url.QueryUnescape(raw)
	if err != nil {
		t.Fatalf("unescape: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(unescaped), &out); err != nil {
		t.Fatalf("decode JSON: %v\nraw: %s", err, unescaped)
	}
	return out
}

// TestModLineTemplateMatchesPoB verifies the regex normalization
// matches the upstream Lua one-liner from CompareTradeHelpers.lua:
//
//	function M.modLineTemplate(line)
//	    return line:gsub("[%d]+%.?[%d]*", "#")
//	end
//
// Numbers (integers + decimals) collapse to a single `#`; everything
// else passes through.
func TestModLineTemplateMatchesPoB(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"+90 to maximum Life", "+# to maximum Life"},
		{"40% increased Spell Damage", "#% increased Spell Damage"},
		{"+1.5 metres to Melee Range", "+# metres to Melee Range"},
		{"Adds 10 to 50 Lightning Damage", "Adds # to # Lightning Damage"},
		{"no numbers here", "no numbers here"},
	}
	for _, tc := range cases {
		got := modLineTemplate(tc.in)
		if got != tc.want {
			t.Errorf("modLineTemplate(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// TestBuySimilarWithoutFiltersMatchesLegacyURL: regression guard. When
// no filters are set, the URL is identical to the existing buildTradeURL
// output — name + price-sort + empty filters.
func TestBuySimilarWithoutFiltersMatchesLegacyURL(t *testing.T) {
	srv := newTestServer(t)
	got := buildTradeURLWithFilters(srv, "Belly of the Beast", "Standard", nil)
	want := buildTradeURL("Belly of the Beast", "Standard")
	if got != want {
		t.Errorf("nil filters should match legacy URL\n got: %s\nwant: %s", got, want)
	}
}

// TestBuySimilarWithModFilterFromCache: a filter referencing a
// mod_text whose trade_id is in the cache emits a stats[0].filters
// entry with {id, value: {min}}.
func TestBuySimilarWithModFilterFromCache(t *testing.T) {
	srv := newTestServer(t)
	// Seed the cache with the canonical Life mod.
	stripped := tradeStatsStripPattern.ReplaceAllString("+# to maximum Life", "")
	if err := srv.cache.store.PutTradeStatsBatch("Standard", []tradeStatsRow{
		{StrippedText: stripped, Category: "Explicit", TradeID: "explicit.stat_5678", FetchedAt: time.Now()},
	}); err != nil {
		t.Fatal(err)
	}

	min := 90.0
	filters := &compareBuySimilarFilters{
		Mods: []compareBuySimilarModFilter{
			{ModText: "+90 to maximum Life", ModType: "Explicit", Min: &min},
		},
	}
	tradeURL := buildTradeURLWithFilters(srv, "Belly of the Beast", "Standard", filters)
	q := decodeTradeQueryFromURL(t, tradeURL)
	queryObj, _ := q["query"].(map[string]any)
	stats, _ := queryObj["stats"].([]any)
	if len(stats) == 0 {
		t.Fatalf("expected stats group; got %+v", queryObj)
	}
	group := stats[0].(map[string]any)
	innerFilters, _ := group["filters"].([]any)
	if len(innerFilters) != 1 {
		t.Fatalf("expected 1 mod filter, got %d: %+v", len(innerFilters), innerFilters)
	}
	entry := innerFilters[0].(map[string]any)
	if entry["id"] != "explicit.stat_5678" {
		t.Errorf("filter id = %v, want explicit.stat_5678", entry["id"])
	}
	value := entry["value"].(map[string]any)
	if value["min"].(float64) != 90.0 {
		t.Errorf("filter value.min = %v, want 90", value["min"])
	}
}

// TestBuySimilarUsesQueryModsLookup: a mod_text whose template matches
// a QueryMods entry resolves to that trade_id even when the trade_stats
// SQLite cache is empty. This is the v1 mod-ID gap closure — every mod
// in PoB's bundled QueryMods data should be resolvable without an
// admin trade-stats refresh having been run.
func TestBuySimilarUsesQueryModsLookup(t *testing.T) {
	srv := newTestServer(t)
	// Pre-populate the queryMods snapshot directly (bypassing the
	// wrapper.lua dump in production) — the lookup logic should hit
	// this map before falling through to LookupTradeStat.
	srv.queryMods = map[string]string{
		// PoB stores modType lowercase in QueryMods; the lookup
		// lowercases the caller's modType for this leg.
		"+# to maximum Life|explicit": "explicit.stat_life_query_mods",
	}
	min := 90.0
	filters := &compareBuySimilarFilters{
		Mods: []compareBuySimilarModFilter{
			{ModText: "+90 to maximum Life", ModType: "Explicit", Min: &min},
		},
	}
	tradeURL := buildTradeURLWithFilters(srv, "Belly", "Standard", filters)
	q := decodeTradeQueryFromURL(t, tradeURL)
	queryObj, _ := q["query"].(map[string]any)
	stats, _ := queryObj["stats"].([]any)
	if len(stats) == 0 {
		t.Fatalf("expected stats group; got %+v", queryObj)
	}
	group := stats[0].(map[string]any)
	innerFilters, _ := group["filters"].([]any)
	if len(innerFilters) != 1 {
		t.Fatalf("expected 1 mod filter resolved via QueryMods, got %d: %+v", len(innerFilters), innerFilters)
	}
	entry := innerFilters[0].(map[string]any)
	if entry["id"] != "explicit.stat_life_query_mods" {
		t.Errorf("filter id = %v, want explicit.stat_life_query_mods (from QueryMods, not trade_stats cache)", entry["id"])
	}
}

// TestBuySimilarFiltersUnknownModSkipped: a mod_text without a cached
// trade_id is silently dropped from the stats filter list — the URL
// still emits with the rest of the filters intact.
func TestBuySimilarFiltersUnknownModSkipped(t *testing.T) {
	srv := newTestServer(t)
	min := 30.0
	filters := &compareBuySimilarFilters{
		Mods: []compareBuySimilarModFilter{
			{ModText: "+30 unknown mod with no trade ID", ModType: "Explicit", Min: &min},
		},
	}
	tradeURL := buildTradeURLWithFilters(srv, "X", "Standard", filters)
	q := decodeTradeQueryFromURL(t, tradeURL)
	queryObj, _ := q["query"].(map[string]any)
	stats, _ := queryObj["stats"].([]any)
	group := stats[0].(map[string]any)
	innerFilters, _ := group["filters"].([]any)
	if len(innerFilters) != 0 {
		t.Errorf("unknown mod should be silently dropped, got %d entries: %+v", len(innerFilters), innerFilters)
	}
}

// TestBuySimilarWithDefenceRange: armour_min populates
// query.filters.armour_filters.filters.armour {min}.
func TestBuySimilarWithDefenceRange(t *testing.T) {
	srv := newTestServer(t)
	filters := &compareBuySimilarFilters{
		ArmourMin: 800,
	}
	tradeURL := buildTradeURLWithFilters(srv, "Belly", "Standard", filters)
	q := decodeTradeQueryFromURL(t, tradeURL)
	queryObj, _ := q["query"].(map[string]any)
	queryFilters, _ := queryObj["filters"].(map[string]any)
	armourGroup, ok := queryFilters["armour_filters"].(map[string]any)
	if !ok {
		t.Fatalf("expected armour_filters; got %+v", queryFilters)
	}
	innerArmour := armourGroup["filters"].(map[string]any)["armour"].(map[string]any)
	if innerArmour["min"].(float64) != 800.0 {
		t.Errorf("armour min = %v, want 800", innerArmour["min"])
	}
}

// TestBuySimilarWithItemLevelRange: ilvl_min/max populate misc_filters.
func TestBuySimilarWithItemLevelRange(t *testing.T) {
	srv := newTestServer(t)
	filters := &compareBuySimilarFilters{
		IlvlMin: 84,
		IlvlMax: 86,
	}
	tradeURL := buildTradeURLWithFilters(srv, "X", "Standard", filters)
	q := decodeTradeQueryFromURL(t, tradeURL)
	queryFilters := q["query"].(map[string]any)["filters"].(map[string]any)
	misc := queryFilters["misc_filters"].(map[string]any)["filters"].(map[string]any)["ilvl"].(map[string]any)
	if misc["min"].(float64) != 84 || misc["max"].(float64) != 86 {
		t.Errorf("ilvl filter = %+v, want {min:84, max:86}", misc)
	}
}

// TestBuySimilarRealmAndListed: realm path segment + status filter
// reflect the request's overrides.
func TestBuySimilarRealmAndListed(t *testing.T) {
	srv := newTestServer(t)
	filters := &compareBuySimilarFilters{Realm: "sony", Listed: "any"}
	tradeURL := buildTradeURLWithFilters(srv, "X", "Standard", filters)
	if !strings.Contains(tradeURL, "/trade/search/sony/Standard") {
		t.Errorf("URL missing realm path /trade/search/sony/Standard; got %s", tradeURL)
	}
	q := decodeTradeQueryFromURL(t, tradeURL)
	status := q["query"].(map[string]any)["status"].(map[string]any)
	if status["option"] != "any" {
		t.Errorf("status option = %v, want any", status["option"])
	}
}

// TestHandleCompareValidatesBuySimilarRealm: invalid realm value is
// rejected at the handler with 400.
func TestHandleCompareValidatesBuySimilarRealm(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 200000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"],"buySimilar":true,"buy_similar_filters":{"realm":"bogus"}}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "realm") {
		t.Errorf("error should name the offending field; got %s", rec.Body.String())
	}
}

// TestHandleCompareValidatesBuySimilarListed: invalid listed value is
// rejected at the handler with 400.
func TestHandleCompareValidatesBuySimilarListed(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 200000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"],"buySimilar":true,"buy_similar_filters":{"listed":"weird"}}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// TestHandleCompareRejectsFiltersWithoutBuySimilar: filters object set
// without buy_similar=true → 400 (otherwise filters are silently
// ignored, which is a worse UX than an error).
func TestHandleCompareRejectsFiltersWithoutBuySimilar(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),
		minimalCalcResponseClass("Marauder", 200000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"],"buy_similar_filters":{"ilvl_min":84}}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}
