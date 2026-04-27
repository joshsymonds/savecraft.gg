package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// compareRespWithBuySimilar decodes the /compare body using the
// buySimilar-aware shape.
type compareRespWithBuySimilar struct {
	Builds     []compareEntry            `json:"builds"`
	Diffs      *compareDiffsSkillsOnWire `json:"diffs"`
	BuySimilar []compareBuySimilarOnWire `json:"buySimilar"`
}

type compareBuySimilarOnWire struct {
	FromBuildID string `json:"fromBuildId"`
	ToBuildID   string `json:"toBuildId"`
	Slot        string `json:"slot"`
	ItemName    string `json:"itemName"`
	TradeURL    string `json:"tradeUrl"`
}

func decodeCompareWithBuySimilar(t *testing.T, body []byte) compareRespWithBuySimilar {
	t.Helper()
	var resp compareRespWithBuySimilar
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

// extractTradeQuery decodes the `q` query-string parameter of a trade
// URL and returns the inner JSON (as a map) for assertions. The wire
// format is URL-percent-encoded JSON (net/url's url.Values handles
// the decode in u.Query().Get()) — matching PoB's reference impl and
// validated against PoE's /api/trade/search endpoint.
func extractTradeQuery(t *testing.T, tradeURL string) map[string]any {
	t.Helper()
	u, err := url.Parse(tradeURL)
	if err != nil {
		t.Fatalf("parse trade URL: %v", err)
	}
	q := u.Query().Get("q")
	if q == "" {
		t.Fatalf("trade URL missing q param: %s", tradeURL)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(q), &out); err != nil {
		t.Fatalf("parse q JSON: %v\nq: %s", err, q)
	}
	return out
}

// TestCompareBuySimilarOptInRequired: without the buy_similar flag the
// response has no buySimilar field.
func TestCompareBuySimilarOptInRequired(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Devoto's Devotion"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithBuySimilar(t, rec.Body.Bytes())
	if len(resp.BuySimilar) != 0 {
		t.Errorf("buySimilar must be omitted without opt-in; got %v", resp.BuySimilar)
	}
}

// TestCompareBuySimilarDifferentItem: opt-in + slot with different items
// → entry with from/to/slot/itemName + a parseable trade URL.
func TestCompareBuySimilarDifferentItem(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Devoto's Devotion"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"],"buySimilar":true}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithBuySimilar(t, rec.Body.Bytes())
	if len(resp.BuySimilar) == 0 {
		t.Fatalf("expected buySimilar entries with opt-in; got none")
	}

	// At least one A→B and B→A entry, since both have different items.
	var aToB, bToA *compareBuySimilarOnWire
	for i := range resp.BuySimilar {
		entry := &resp.BuySimilar[i]
		if entry.Slot != "Helmet" {
			continue
		}
		if entry.FromBuildID == idA && entry.ToBuildID == idB {
			aToB = entry
		}
		if entry.FromBuildID == idB && entry.ToBuildID == idA {
			bToA = entry
		}
	}
	if aToB == nil {
		t.Errorf("expected A→B Helmet entry")
	}
	if bToA == nil {
		t.Errorf("expected B→A Helmet entry")
	}

	if aToB != nil {
		if aToB.ItemName != "Atziri's Foible" {
			t.Errorf("aToB.itemName = %q, want Atziri's Foible", aToB.ItemName)
		}
		if !strings.Contains(aToB.TradeURL, "pathofexile.com/trade") {
			t.Errorf("tradeUrl missing pathofexile.com/trade: %s", aToB.TradeURL)
		}
		query := extractTradeQuery(t, aToB.TradeURL)
		queryMap, _ := query["query"].(map[string]any)
		if queryMap["name"] != "Atziri's Foible" {
			t.Errorf("query.name = %v, want Atziri's Foible", queryMap["name"])
		}
	}
}

// TestCompareBuySimilarIdenticalItemEmitsNothing: same item in slot →
// no entry for that slot.
func TestCompareBuySimilarIdenticalItemEmitsNothing(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Atziri's Foible"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"],"buySimilar":true}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithBuySimilar(t, rec.Body.Bytes())
	for _, entry := range resp.BuySimilar {
		if entry.Slot == "Helmet" {
			t.Errorf("Helmet should not appear in buySimilar (identical items); got %v", entry)
		}
	}
}

// TestCompareBuySimilarTargetMissingItem: source has Helmet, target
// doesn't → entry with itemName = source's helmet, target = the build
// without it.
func TestCompareBuySimilarTargetMissingItem(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Body Armour": "Kintsugi"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"],"buySimilar":true}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithBuySimilar(t, rec.Body.Bytes())

	// Should have A→B Helmet (B is missing it) and B→A Body Armour
	// (A is missing it).
	hasHelmetAtoB := false
	hasArmourBtoA := false
	for _, entry := range resp.BuySimilar {
		if entry.Slot == "Helmet" && entry.FromBuildID == idA && entry.ToBuildID == idB {
			hasHelmetAtoB = true
			if entry.ItemName != "Atziri's Foible" {
				t.Errorf("itemName = %q, want Atziri's Foible", entry.ItemName)
			}
		}
		if entry.Slot == "Body Armour" && entry.FromBuildID == idB && entry.ToBuildID == idA {
			hasArmourBtoA = true
		}
	}
	if !hasHelmetAtoB {
		t.Errorf("expected Helmet A→B entry")
	}
	if !hasArmourBtoA {
		t.Errorf("expected Body Armour B→A entry")
	}
}

// TestCompareBuySimilarLeagueParam: passing league: "Mirage" produces
// URLs whose path contains /trade/search/Mirage/.
func TestCompareBuySimilarLeagueParam(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Devoto's Devotion"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"],"buySimilar":true,"league":"Mirage"}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithBuySimilar(t, rec.Body.Bytes())
	if len(resp.BuySimilar) == 0 {
		t.Fatal("expected entries")
	}
	for _, entry := range resp.BuySimilar {
		if !strings.Contains(entry.TradeURL, "/trade/search/Mirage") {
			t.Errorf("tradeUrl should target Mirage league; got %s", entry.TradeURL)
		}
	}
}

// TestCompareBuySimilarDefaultLeague: omitting league defaults to
// "Standard".
func TestCompareBuySimilarDefaultLeague(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Devoto's Devotion"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"],"buySimilar":true}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithBuySimilar(t, rec.Body.Bytes())
	for _, entry := range resp.BuySimilar {
		if !strings.Contains(entry.TradeURL, "/trade/search/Standard") {
			t.Errorf("default league should be Standard; got %s", entry.TradeURL)
		}
	}
}

// TestCompareBuySimilarItemNameWithApostrophe: special characters in
// item names are URL-safe in the encoded query.
func TestCompareBuySimilarItemNameWithApostrophe(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		// "Atziri's Foible" contains an apostrophe.
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Devoto's Devotion"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"],"buySimilar":true}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithBuySimilar(t, rec.Body.Bytes())
	if len(resp.BuySimilar) == 0 {
		t.Fatal("expected entries")
	}
	for _, entry := range resp.BuySimilar {
		// URL must parse cleanly (no raw special chars).
		if _, err := url.Parse(entry.TradeURL); err != nil {
			t.Errorf("tradeUrl unparseable: %v (%s)", err, entry.TradeURL)
		}
		// And the decoded query JSON should round-trip the original name.
		query := extractTradeQuery(t, entry.TradeURL)
		queryMap, _ := query["query"].(map[string]any)
		name, _ := queryMap["name"].(string)
		if !strings.Contains(name, "'") {
			t.Errorf("expected apostrophe preserved in query.name, got %q", name)
		}
	}
}

// TestBuildTradeURLEncodesSpecialChars: contract test pinning the
// query-encoding format on the trade URL's `q` parameter. url.Parse
// transparently round-trips encoding variants, so the apostrophe test
// above can't catch a future change to the wire format — this test
// asserts on the raw URL string.
func TestBuildTradeURLEncodesSpecialChars(t *testing.T) {
	tradeURL := buildTradeURL("Atziri's Foible", "Standard")
	// url.Values.Encode() (form-urlencoded) emits `+` for spaces and
	// percent-encodes the apostrophe. Both `+` and `%20` decode to the
	// same space at the trade endpoint per RFC 3986; we pin the form
	// our encoder produces so a future swap to QueryEscape doesn't
	// silently change the wire shape without a smoke-test re-run.
	if !strings.Contains(tradeURL, "Atziri%27s+Foible") {
		t.Errorf("expected name encoded as Atziri%%27s+Foible, got: %s", tradeURL)
	}
}

// TestComputeBuySimilarRejectsDangerousLeague: league strings that
// contain path separators or stretch the URL fall back to the default
// league rather than letting an attacker shape the trade URL's path.
func TestComputeBuySimilarRejectsDangerousLeague(t *testing.T) {
	cases := map[string]string{
		"path traversal":  "../../admin",
		"query separator": "Standard?evil=1",
		"fragment":        "Standard#anchor",
		"oversized":       strings.Repeat("a", 65),
	}
	for name, badLeague := range cases {
		t.Run(name, func(t *testing.T) {
			entries := []compareBuildEntry{
				{ID: "a", itemsBySlot: map[string]gearItemSummary{"Helmet": {Name: "Atziri's Foible"}}},
				{ID: "b", itemsBySlot: map[string]gearItemSummary{"Helmet": {Name: "Devoto's Devotion"}}},
			}
			out := computeBuySimilarWithFilters(nil, entries, badLeague, nil)
			if len(out) == 0 {
				t.Fatal("expected entries")
			}
			for _, entry := range out {
				if !strings.Contains(entry.TradeURL, "/trade/search/Standard?") {
					t.Errorf("expected fallback to Standard league, got: %s", entry.TradeURL)
				}
			}
		})
	}
}

// TestCompareBuySimilarErroredBuildExcluded: an errored slot doesn't
// appear as source or target in any entry.
func TestCompareBuySimilarErroredBuildExcluded(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
	})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	idA := srv.cache.Put("<A/>")
	_ = srv.cache.store.Put(idA, "<A/>", "", "", "")

	// idB intentionally absent → errored slot.
	body := `{"builds":["` + idA + `","00000000000000000000000000000000"],"buySimilar":true}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithBuySimilar(t, rec.Body.Bytes())
	// Need ≥2 successful builds to compute pairs; 1 successful → no entries.
	if len(resp.BuySimilar) != 0 {
		t.Errorf("buySimilar should be empty with only 1 successful build; got %v", resp.BuySimilar)
	}
}
