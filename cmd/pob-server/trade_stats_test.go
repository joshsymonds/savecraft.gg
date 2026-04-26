package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// mockTradeStatsResponse mirrors the upstream PoE trade API stats
// shape, trimmed to two categories with a couple entries each. The
// fetcher should normalize entry text by stripping numbers /
// punctuation per CompareTradeHelpers.lua's getTradeStatsLookup.
const mockTradeStatsResponse = `{
  "result": [
    {
      "id": "explicit",
      "label": "Explicit",
      "entries": [
        {"id": "explicit.stat_1234", "text": "+#% increased Movement Speed", "type": "explicit"},
        {"id": "explicit.stat_5678", "text": "+# to maximum Life", "type": "explicit"}
      ]
    },
    {
      "id": "implicit",
      "label": "Implicit",
      "entries": [
        {"id": "implicit.stat_9001", "text": "+# to all Attributes", "type": "implicit"}
      ]
    }
  ]
}`

func newMockTradeStatsServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
}

// TestTradeStatsFetchAndStore: a fresh fetch persists rows keyed by
// (league, stripped_text, category) and lookups can read them back.
func TestTradeStatsFetchAndStore(t *testing.T) {
	store := newInMemoryStoreForTest(t)
	mock := newMockTradeStatsServer(t, mockTradeStatsResponse)
	defer mock.Close()

	now := time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC)
	client := newTradeStatsClient(store, mock.URL, func() time.Time { return now })

	if err := client.Refresh("Standard"); err != nil {
		t.Fatalf("Refresh failed: %v", err)
	}

	// Movement Speed entry: text "+#% increased Movement Speed" → strip
	// removes [#()0-9-+.], keeping %. Result: "% increased Movement Speed".
	id, ok, err := store.LookupTradeStat("Standard", "% increased Movement Speed", "Explicit")
	if err != nil {
		t.Fatalf("lookup err: %v", err)
	}
	if !ok || id != "explicit.stat_1234" {
		t.Errorf("Movement Speed lookup: ok=%v id=%q, want true / explicit.stat_1234", ok, id)
	}

	// Life entry across same league.
	id2, ok, _ := store.LookupTradeStat("Standard", " to maximum Life", "Explicit")
	if !ok || id2 != "explicit.stat_5678" {
		t.Errorf("Life lookup: ok=%v id=%q", ok, id2)
	}

	// Implicit entry — different category.
	id3, ok, _ := store.LookupTradeStat("Standard", " to all Attributes", "Implicit")
	if !ok || id3 != "implicit.stat_9001" {
		t.Errorf("Attributes lookup: ok=%v id=%q", ok, id3)
	}
}

// TestTradeStatsTTLRespectsRecentFetch: a Refresh call within the TTL
// returns without re-hitting the network. The mock server records a
// hit counter; second Refresh should leave it unchanged.
func TestTradeStatsTTLRespectsRecentFetch(t *testing.T) {
	store := newInMemoryStoreForTest(t)

	hits := 0
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(mockTradeStatsResponse))
	}))
	defer mock.Close()

	now := time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC)
	advance := time.Duration(0)
	client := newTradeStatsClient(store, mock.URL, func() time.Time { return now.Add(advance) })

	if err := client.Refresh("Standard"); err != nil {
		t.Fatal(err)
	}
	if hits != 1 {
		t.Fatalf("first Refresh should hit the API once, got %d", hits)
	}

	// Advance 1 hour — well within the 24h TTL — and Refresh again.
	advance = 1 * time.Hour
	if err := client.Refresh("Standard"); err != nil {
		t.Fatal(err)
	}
	if hits != 1 {
		t.Errorf("second Refresh inside TTL should NOT re-hit the API; hits=%d", hits)
	}
}

// TestTradeStatsTTLRefetchesStaleData: 25h after the previous fetch,
// a Refresh re-hits the network and overwrites the rows.
func TestTradeStatsTTLRefetchesStaleData(t *testing.T) {
	store := newInMemoryStoreForTest(t)

	hits := 0
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(mockTradeStatsResponse))
	}))
	defer mock.Close()

	now := time.Date(2026, 4, 26, 12, 0, 0, 0, time.UTC)
	advance := time.Duration(0)
	client := newTradeStatsClient(store, mock.URL, func() time.Time { return now.Add(advance) })

	if err := client.Refresh("Standard"); err != nil {
		t.Fatal(err)
	}
	advance = 25 * time.Hour
	if err := client.Refresh("Standard"); err != nil {
		t.Fatal(err)
	}
	if hits != 2 {
		t.Errorf("Refresh after 25h should re-hit; hits=%d", hits)
	}
}

// TestTradeStatsLookupMissingReturnsFalse: lookup for a category /
// stripped-text combo that isn't in the store returns ok=false without
// error.
func TestTradeStatsLookupMissingReturnsFalse(t *testing.T) {
	store := newInMemoryStoreForTest(t)
	_, ok, err := store.LookupTradeStat("Standard", "nope", "Explicit")
	if err != nil {
		t.Fatalf("missing lookup should not error, got %v", err)
	}
	if ok {
		t.Error("missing lookup should return ok=false")
	}
}

// TestTradeStatsRefreshEndpointHappyPath: POST /admin/refresh-trade-stats
// with a valid Bearer token returns 200 and a JSON envelope summarizing
// the fetch.
func TestTradeStatsRefreshEndpointHappyPath(t *testing.T) {
	store := newInMemoryStoreForTest(t)
	mock := newMockTradeStatsServer(t, mockTradeStatsResponse)
	defer mock.Close()

	srv := newTestServer(t)
	srv.cache.store = store
	srv.tradeStats = newTradeStatsClient(store, mock.URL, time.Now)

	req := httptest.NewRequest(http.MethodPost, "/admin/refresh-trade-stats?league=Standard", nil)
	rec := httptest.NewRecorder()
	srv.handleRefreshTradeStats(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		League    string `json:"league"`
		FetchedAt int64  `json:"fetchedAt"`
		RowCount  int    `json:"rowCount"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if resp.League != "Standard" {
		t.Errorf("league=%q, want Standard", resp.League)
	}
	if resp.RowCount != 3 {
		t.Errorf("rowCount=%d, want 3 (mock fixture has 3 entries)", resp.RowCount)
	}
}

// TestTradeStatsRefreshEndpointDefaultsToStandard: omitting league
// query param defaults to "Standard". Mirrors the buy-similar default.
func TestTradeStatsRefreshEndpointDefaultsToStandard(t *testing.T) {
	store := newInMemoryStoreForTest(t)
	mock := newMockTradeStatsServer(t, mockTradeStatsResponse)
	defer mock.Close()

	srv := newTestServer(t)
	srv.cache.store = store
	srv.tradeStats = newTradeStatsClient(store, mock.URL, time.Now)

	req := httptest.NewRequest(http.MethodPost, "/admin/refresh-trade-stats", nil)
	rec := httptest.NewRecorder()
	srv.handleRefreshTradeStats(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"league":"Standard"`) {
		t.Errorf("expected league=Standard, got body=%s", rec.Body.String())
	}
}
