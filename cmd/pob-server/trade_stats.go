package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sync"
	"time"
)

// trade_stats.go — Go-side fetcher + cache for the PoE trade API stats
// dictionary. Mirrors PoB's upstream Classes/CompareTradeHelpers.lua
// getTradeStatsLookup behavior but driven from Go so wrapper.lua never
// needs to make outbound HTTP calls (per the lua-thin architectural
// rule from feedback_pob_server_lua_thin).
//
// Stats are fetched per-league and persisted in the existing SQLite
// cache (trade_stats table). The cached lookup gets passed to
// wrapper.lua as a flat object on /compare requests when buy_similar
// asks for per-mod filtering.

const (
	defaultTradeStatsURL = "https://www.pathofexile.com/api/trade/data/stats"
	tradeStatsTTL        = 24 * time.Hour
	tradeStatsTimeout    = 30 * time.Second
	// Real responses are ~1MB; cap at 16MiB so a misbehaving (or
	// hijacked) upstream can't OOM the daemon before the timeout fires.
	tradeStatsMaxBytes = 16 << 20
)

// tradeStatsStripPattern mirrors the Lua-side normalization:
// `text:gsub("[#()0-9%-%+%.]", "")` — strip placeholders, digits, and
// punctuation so a mod's text matches across builds with different
// rolls.
var tradeStatsStripPattern = regexp.MustCompile(`[#()0-9\-+.]`)

// tradeStatsRow is one persisted row keyed by (league, stripped_text,
// category). Exported field names match the BuildStore method's
// expectations.
type tradeStatsRow struct {
	StrippedText string
	Category     string
	TradeID      string
	FetchedAt    time.Time
}

// tradeStatsClient owns the HTTP client + store handle and gates
// network calls behind the per-league TTL.
type tradeStatsClient struct {
	store    *BuildStore
	tradeURL string
	now      func() time.Time
	http     *http.Client

	// fetchMu serializes concurrent Refresh calls per league so two
	// callers waking at the same time don't double-fetch. Per-league
	// rather than global so a Standard refresh doesn't block a Mirage
	// refresh.
	fetchMu       sync.Mutex
	leagueFetchAt map[string]time.Time
}

func newTradeStatsClient(store *BuildStore, tradeURL string, now func() time.Time) *tradeStatsClient {
	if now == nil {
		now = time.Now
	}
	return &tradeStatsClient{
		store:         store,
		tradeURL:      tradeURL,
		now:           now,
		http:          &http.Client{Timeout: tradeStatsTimeout},
		leagueFetchAt: make(map[string]time.Time),
	}
}

// Refresh fetches and persists the trade stats for one league when
// the cached rows are stale (older than tradeStatsTTL) or missing.
// Returns nil when fresh data is already cached — callers shouldn't
// distinguish "didn't fetch" from "fetched and stored."
func (c *tradeStatsClient) Refresh(league string) error {
	if c == nil || c.store == nil {
		return fmt.Errorf("trade stats client not initialized")
	}
	if league == "" {
		league = "Standard"
	}

	c.fetchMu.Lock()
	defer c.fetchMu.Unlock()

	now := c.now()

	// In-process gate first — avoids hitting SQLite at all when a
	// recent Refresh just succeeded.
	if last, ok := c.leagueFetchAt[league]; ok {
		if now.Sub(last) < tradeStatsTTL {
			return nil
		}
	}

	// Persisted gate — survives process restarts.
	latest, ok, err := c.store.TradeStatsLatestFetchedAt(league)
	if err != nil {
		return fmt.Errorf("trade_stats latest check: %w", err)
	}
	if ok && now.Sub(latest) < tradeStatsTTL {
		c.leagueFetchAt[league] = latest
		return nil
	}

	rows, err := c.fetch()
	if err != nil {
		return err
	}
	for i := range rows {
		rows[i].FetchedAt = now
	}
	if err := c.store.PutTradeStatsBatch(league, rows); err != nil {
		return fmt.Errorf("persist trade_stats: %w", err)
	}
	c.leagueFetchAt[league] = now
	return nil
}

// LastRefreshRowCount returns how many rows were last persisted for
// league via this client. Wrapped here rather than computed at the
// admin endpoint so the count includes only what THIS Refresh cycle
// produced (not historical rows from a stale league cleanup pass that
// might be added later).
//
// Implemented as a SQL count rather than tracked in memory because
// the admin endpoint may be called on a fresh process where the
// in-memory counter is empty.
func (c *tradeStatsClient) LastRefreshRowCount(league string) (int, error) {
	var n int
	err := c.store.db.QueryRowContext(context.Background(), `
		SELECT COUNT(*) FROM trade_stats WHERE league = ?
	`, league).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count trade_stats: %w", err)
	}
	return n, nil
}

// fetch hits the upstream trade API and parses entries into rows.
// Stripped text is the entry's text after running the strip pattern.
// fetched_at is left zero — Refresh fills it in from c.now().
func (c *tradeStatsClient) fetch() ([]tradeStatsRow, error) {
	req, err := http.NewRequest(http.MethodGet, c.tradeURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build trade stats request: %w", err)
	}
	req.Header.Set("User-Agent", "savecraft-pob-server/trade-stats-fetcher")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch trade stats: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("trade stats API returned %s", resp.Status)
	}

	var parsed struct {
		Result []struct {
			ID      string `json:"id"`
			Label   string `json:"label"`
			Entries []struct {
				ID   string `json:"id"`
				Text string `json:"text"`
				Type string `json:"type"`
			} `json:"entries"`
		} `json:"result"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, tradeStatsMaxBytes)).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode trade stats: %w", err)
	}

	rowEstimate := 0
	for _, category := range parsed.Result {
		rowEstimate += len(category.Entries)
	}
	rows := make([]tradeStatsRow, 0, rowEstimate)
	for _, category := range parsed.Result {
		for _, entry := range category.Entries {
			if entry.ID == "" || entry.Text == "" {
				continue
			}
			stripped := tradeStatsStripPattern.ReplaceAllString(entry.Text, "")
			rows = append(rows, tradeStatsRow{
				StrippedText: stripped,
				Category:     category.Label,
				TradeID:      entry.ID,
			})
		}
	}
	return rows, nil
}

// handleRefreshTradeStats is the admin endpoint for forcing a
// trade-stats refresh. Useful on league-launch days when the 24h TTL
// is too long to wait for. Reads `league` from the query string,
// defaulting to "Standard". Returns a JSON envelope so the caller can
// confirm the fetch landed.
func (srv *Server) handleRefreshTradeStats(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		jsonError(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if srv.tradeStats == nil {
		jsonError(writer, "trade stats client not configured", http.StatusNotImplemented)
		return
	}
	league := request.URL.Query().Get("league")
	if league == "" {
		league = "Standard"
	}
	if !isValidLeague(league) {
		jsonError(writer, "league must be ≤64 chars and contain no path separators", http.StatusBadRequest)
		return
	}
	if err := srv.tradeStats.Refresh(league); err != nil {
		srv.log.Error("trade stats refresh", "league", league, "err", err)
		jsonError(writer, "trade stats refresh failed", http.StatusBadGateway)
		return
	}
	rowCount, err := srv.tradeStats.LastRefreshRowCount(league)
	if err != nil {
		srv.log.Error("trade stats row count", "league", league, "err", err)
		rowCount = 0
	}
	latest, _, _ := srv.store().TradeStatsLatestFetchedAt(league)

	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(map[string]any{
		"league":    league,
		"fetchedAt": latest.Unix(),
		"rowCount":  rowCount,
	})
}

// store is a small accessor used by the admin endpoint above; keeps
// the field private on Server while still letting the response
// envelope include the freshly-recorded fetched_at.
func (srv *Server) store() *BuildStore {
	if srv.cache == nil {
		return nil
	}
	return srv.cache.store
}
