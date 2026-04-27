package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// ErrBuildNotFound is returned when a build ID is not in the store.
var ErrBuildNotFound = errors.New("build not found")

// wrapperSchemaVersion stamps cached BuildStore entries so that
// wrapper.lua emission shape changes auto-invalidate pre-existing rows.
// BuildStore.Put writes this value on every insert/upsert; BuildStore.Get
// returns ErrBuildNotFound for rows whose stored version doesn't match.
//
// BUMP THIS WHENEVER the JSON shape wrapper.lua emits in `data` (or any
// subkey hydrateEntryFromData reads — character, summary, sections.tree,
// sections.items, sections.socketGroups, sections.config, statSources)
// changes in a way that would make old cached rows return wrong-shape
// responses to /compare or /modify cache hits. The constant only goes
// up; existing rows below current auto-invalidate, which is the point.
//
// Pre-migration rows have wrapper_schema_version=0 (column default), so
// any current >= 1 invalidates them on first read post-deploy.
const wrapperSchemaVersion = 1

// BuildMeta holds non-content metadata for a stored build.
type BuildMeta struct {
	SourceURL  string
	ParentID   string
	CreatedAt  time.Time
	AccessedAt time.Time
}

// BuildStore persists builds in SQLite.
type BuildStore struct {
	db *sql.DB

	// tradeStatsMem caches the full trade_stats table per league in
	// memory so /compare's per-mod lookups don't all serialize on the
	// single SQLite connection. ~5000 entries per league = ~500KB heap.
	// Populated lazily on first lookup miss for a league or eagerly via
	// PutTradeStatsBatch; invalidated for a league whenever
	// PutTradeStatsBatch writes that league.
	tradeStatsMemMu sync.RWMutex
	tradeStatsMem   map[string]map[string]string // league → "category|stripped" → trade_id
}

const schema = `
CREATE TABLE IF NOT EXISTS builds (
	id          TEXT PRIMARY KEY,
	xml         TEXT NOT NULL,
	summary     TEXT NOT NULL DEFAULT '{}',
	source_url  TEXT NOT NULL DEFAULT '',
	parent_id   TEXT NOT NULL DEFAULT '',
	created_at  INTEGER NOT NULL,
	accessed_at INTEGER NOT NULL,
	wrapper_schema_version INTEGER NOT NULL DEFAULT 0
);

-- Delta cache for per-node perturbation results. Keyed by
-- (build_id, node_id, metric); value is the per-stat delta from removing
-- (audit) or adding (nearby) that single node. Builds are content-addressed
-- so deltas are deterministic; the cache never invalidates. Rows for
-- deleted builds are dead but harmless until a future cleanup pass.
CREATE TABLE IF NOT EXISTS node_deltas (
	build_id   TEXT NOT NULL,
	node_id    INTEGER NOT NULL,
	metric     TEXT NOT NULL,
	delta      REAL NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (build_id, node_id, metric)
);

-- Trade-API stats cache for Feature 2's advanced buy-similar mod-ID
-- lookups. Mirrors PoB's upstream CompareTradeHelpers.getTradeStatsLookup
-- shape but driven from Go (no Lua HTTP). Per-league because trade IDs
-- can vary by realm/league reset; in practice they stay stable across
-- a league but the league field future-proofs the cache.
--
-- stripped_text is the entry's text with [#()0-9-+.] removed —
-- matches the upstream Lua normalization. category is PoB's category
-- label (Explicit, Implicit, Enchant, etc).
CREATE TABLE IF NOT EXISTS trade_stats (
	league        TEXT NOT NULL,
	stripped_text TEXT NOT NULL,
	category      TEXT NOT NULL,
	trade_id      TEXT NOT NULL,
	fetched_at    INTEGER NOT NULL,
	PRIMARY KEY (league, stripped_text, category)
);
`

// NewBuildStore opens or creates a SQLite database at dbPath.
func NewBuildStore(dbPath string) (*BuildStore, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("creating db directory: %w", err)
	}

	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("opening database: %w", err)
	}

	// SQLite is single-writer; with parallel /compare goroutines and
	// auto-power-report writes fan-in, multiple Go-side connections
	// would otherwise serialize on SQLite's write lock and burn the
	// 5s busy_timeout retrying. Cap at 1 to make the serialization
	// deterministic in Go and skip the retry path.
	db.SetMaxOpenConns(1)

	if _, err := db.ExecContext(context.Background(), schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("creating schema: %w", err)
	}

	// Idempotent migration: existing DBs (pre-version-stamping) need the
	// wrapper_schema_version column added. PRAGMA table_info introspects
	// the live schema; ALTER TABLE ADD COLUMN with a NOT NULL DEFAULT is
	// atomic in SQLite and back-fills existing rows with the default.
	if err := ensureWrapperSchemaVersionColumn(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("ensuring wrapper_schema_version column: %w", err)
	}

	return &BuildStore{
		db:            db,
		tradeStatsMem: make(map[string]map[string]string),
	}, nil
}

// ensureWrapperSchemaVersionColumn adds the wrapper_schema_version
// column to the builds table if it's missing. Idempotent — safe to call
// on every startup; no-op when the column already exists. Existing rows
// receive the default value (0), which auto-invalidates against any
// current wrapperSchemaVersion >= 1.
func ensureWrapperSchemaVersionColumn(db *sql.DB) error {
	rows, err := db.QueryContext(context.Background(), "PRAGMA table_info(builds)")
	if err != nil {
		return fmt.Errorf("PRAGMA table_info: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var (
			cid        int
			name       string
			ctype      string
			notnull    int
			dfltValue  sql.NullString
			primaryKey int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &primaryKey); err != nil {
			return fmt.Errorf("scan column info: %w", err)
		}
		if name == "wrapper_schema_version" {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate column info: %w", err)
	}
	if _, err := db.ExecContext(context.Background(),
		"ALTER TABLE builds ADD COLUMN wrapper_schema_version INTEGER NOT NULL DEFAULT 0",
	); err != nil {
		return fmt.Errorf("ALTER TABLE: %w", err)
	}
	return nil
}

// tradeStatsMemKey is the per-league memcache lookup key.
func tradeStatsMemKey(category, strippedText string) string {
	return category + "|" + strippedText
}

// Put stores a build. If the ID already exists, summary/source_url/parent_id
// and wrapper_schema_version are updated. Always stamps the row with the
// current wrapperSchemaVersion so re-storing a stale row upgrades it.
func (s *BuildStore) Put(id, xml, summary, sourceURL, parentID string) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(context.Background(), `
		INSERT INTO builds (id, xml, summary, source_url, parent_id, created_at, accessed_at, wrapper_schema_version)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			summary = excluded.summary,
			source_url = CASE WHEN excluded.source_url = '' THEN builds.source_url ELSE excluded.source_url END,
			parent_id = CASE WHEN excluded.parent_id = '' THEN builds.parent_id ELSE excluded.parent_id END,
			accessed_at = excluded.accessed_at,
			wrapper_schema_version = excluded.wrapper_schema_version
	`, id, xml, summary, sourceURL, parentID, now, now, wrapperSchemaVersion)
	if err != nil {
		return fmt.Errorf("storing build %s: %w", id, err)
	}
	return nil
}

// Get retrieves a build's XML and summary by ID, updating accessed_at.
// Returns ErrBuildNotFound if the ID doesn't exist OR the stored row's
// wrapper_schema_version doesn't match the current constant. Stale-version
// rows are invisible to readers; the caller falls through to a fresh calc
// path and a subsequent Put rewrites the row with the current version.
func (s *BuildStore) Get(id string) (xml string, summary string, err error) {
	ctx := context.Background()
	now := time.Now().Unix()
	err = s.db.QueryRowContext(ctx,
		"SELECT xml, summary FROM builds WHERE id = ? AND wrapper_schema_version = ?",
		id, wrapperSchemaVersion,
	).Scan(&xml, &summary)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", ErrBuildNotFound
	}
	if err != nil {
		return "", "", fmt.Errorf("querying build %s: %w", id, err)
	}
	// Update accessed_at (best-effort, don't fail the read)
	_, _ = s.db.ExecContext(ctx, "UPDATE builds SET accessed_at = ? WHERE id = ?", now, id)
	return xml, summary, nil
}

// GetMeta retrieves non-content metadata for a build.
func (s *BuildStore) GetMeta(id string) (*BuildMeta, error) {
	var meta BuildMeta
	var createdAt, accessedAt int64
	err := s.db.QueryRowContext(context.Background(),
		"SELECT source_url, parent_id, created_at, accessed_at FROM builds WHERE id = ?", id,
	).Scan(&meta.SourceURL, &meta.ParentID, &createdAt, &accessedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrBuildNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("querying build meta %s: %w", id, err)
	}
	meta.CreatedAt = time.Unix(createdAt, 0)
	meta.AccessedAt = time.Unix(accessedAt, 0)
	return &meta, nil
}

// Cleanup removes builds not accessed within maxAge. Returns the count removed.
func (s *BuildStore) Cleanup(maxAge time.Duration) (int64, error) {
	threshold := time.Now().Add(-maxAge).Unix()
	result, err := s.db.ExecContext(context.Background(), "DELETE FROM builds WHERE accessed_at < ?", threshold)
	if err != nil {
		return 0, fmt.Errorf("cleaning up builds: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("getting rows affected: %w", err)
	}
	return n, nil
}

// Close closes the database connection.
func (s *BuildStore) Close() {
	s.db.Close()
}

// deltaLookup is one (node_id, metric) pair in a bulk delta cache query.
type deltaLookup struct {
	NodeID int
	Metric string
}

// PutDelta stores a single (build_id, node_id, metric) → delta entry.
// Replaces any prior value for the same key (deterministic data, so equal
// rows are no-ops; differences indicate a calc change worth overwriting).
func (s *BuildStore) PutDelta(buildID string, nodeID int, metric string, delta float64) error {
	_, err := s.db.ExecContext(context.Background(), `
		INSERT INTO node_deltas (build_id, node_id, metric, delta, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(build_id, node_id, metric) DO UPDATE SET delta = excluded.delta
	`, buildID, nodeID, metric, delta, time.Now().Unix())
	if err != nil {
		return fmt.Errorf("storing delta (%s, %d, %s): %w", buildID, nodeID, metric, err)
	}
	return nil
}

// GetDelta returns the cached delta for the triple if present.
func (s *BuildStore) GetDelta(buildID string, nodeID int, metric string) (float64, bool, error) {
	var delta float64
	err := s.db.QueryRowContext(context.Background(),
		"SELECT delta FROM node_deltas WHERE build_id = ? AND node_id = ? AND metric = ?",
		buildID, nodeID, metric,
	).Scan(&delta)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("reading delta (%s, %d, %s): %w", buildID, nodeID, metric, err)
	}
	return delta, true, nil
}

// PutDeltasBatch writes a node→metric→delta map in one transaction. Empty
// maps are no-ops.
func (s *BuildStore) PutDeltasBatch(buildID string, deltas map[int]map[string]float64) error {
	if len(deltas) == 0 {
		return nil
	}
	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO node_deltas (build_id, node_id, metric, delta, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(build_id, node_id, metric) DO UPDATE SET delta = excluded.delta
	`)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	now := time.Now().Unix()
	for nodeID, byMetric := range deltas {
		for metric, delta := range byMetric {
			if _, err := stmt.ExecContext(ctx, buildID, nodeID, metric, delta, now); err != nil {
				return fmt.Errorf("inserting delta (%s, %d, %s): %w", buildID, nodeID, metric, err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// GetDeltasBatch looks up a slice of (node_id, metric) pairs in one query.
// Returns hits keyed by node→metric→value and the slice of misses
// preserving caller order. Empty input → empty output, no DB roundtrip.
func (s *BuildStore) GetDeltasBatch(
	buildID string, lookups []deltaLookup,
) (hits map[int]map[string]float64, misses []deltaLookup, err error) {
	hits = make(map[int]map[string]float64)
	if len(lookups) == 0 {
		return hits, nil, nil
	}

	// Build (node_id, metric) → index map so we can mark hits and report
	// misses preserving caller order.
	type pos struct{ idx int }
	want := make(map[deltaLookup]pos, len(lookups))
	for i, lookup := range lookups {
		if _, exists := want[lookup]; exists {
			continue // duplicate; first wins for ordering
		}
		want[lookup] = pos{idx: i}
	}

	// Build query with one row per distinct (node_id, metric) pair.
	// SQLite parameter limit is 32766 — we're safe at typical pob-server
	// scale (50 candidates × 5 metrics = 250 pairs).
	args := make([]any, 0, 1+len(want)*2)
	args = append(args, buildID)
	placeholders := make([]string, 0, len(want))
	for lookup := range want {
		placeholders = append(placeholders, "(?, ?)")
		args = append(args, lookup.NodeID, lookup.Metric)
	}
	query := `SELECT node_id, metric, delta FROM node_deltas
		WHERE build_id = ? AND (node_id, metric) IN (` +
		strings.Join(placeholders, ",") + `)`

	rows, err := s.db.QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("query deltas: %w", err)
	}
	defer rows.Close()

	hitSet := make(map[deltaLookup]bool, len(want))
	for rows.Next() {
		var nodeID int
		var metric string
		var delta float64
		if err := rows.Scan(&nodeID, &metric, &delta); err != nil {
			return nil, nil, fmt.Errorf("scan delta row: %w", err)
		}
		if hits[nodeID] == nil {
			hits[nodeID] = make(map[string]float64)
		}
		hits[nodeID][metric] = delta
		hitSet[deltaLookup{NodeID: nodeID, Metric: metric}] = true
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterating delta rows: %w", err)
	}

	for _, lookup := range lookups {
		if !hitSet[lookup] {
			misses = append(misses, lookup)
		}
	}
	return hits, misses, nil
}

// PutTradeStatsBatch upserts trade-stats rows for one league in a
// single transaction. Caller is responsible for fetched_at; the
// fetcher uses time.Now to populate it before calling.
//
// Each row is keyed by (league, stripped_text, category). On
// conflict the trade_id and fetched_at are overwritten so a stale
// row gets refreshed in place.
func (s *BuildStore) PutTradeStatsBatch(league string, rows []tradeStatsRow) error {
	if len(rows) == 0 {
		return nil
	}
	ctx := context.Background()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO trade_stats (league, stripped_text, category, trade_id, fetched_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(league, stripped_text, category) DO UPDATE SET
			trade_id   = excluded.trade_id,
			fetched_at = excluded.fetched_at
	`)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	for _, row := range rows {
		_, err := stmt.ExecContext(
			ctx, league, row.StrippedText, row.Category, row.TradeID, row.FetchedAt.Unix(),
		)
		if err != nil {
			return fmt.Errorf(
				"inserting trade_stats (%s, %q, %q): %w", league, row.StrippedText, row.Category, err,
			)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit trade_stats batch: %w", err)
	}

	// Refresh the in-memory cache for this league so /compare hits the
	// new data without needing another SQLite roundtrip per mod.
	memEntries := make(map[string]string, len(rows))
	for _, row := range rows {
		memEntries[tradeStatsMemKey(row.Category, row.StrippedText)] = row.TradeID
	}
	s.tradeStatsMemMu.Lock()
	s.tradeStatsMem[league] = memEntries
	s.tradeStatsMemMu.Unlock()
	return nil
}

// LookupTradeStat returns the trade_id for a (league, stripped_text,
// category) tuple. ok=false with nil error when the row isn't present.
// Used by buy-similar URL construction to populate per-mod filter IDs.
//
// Backed by a per-league in-memory cache populated lazily on first
// lookup miss for a league or eagerly via PutTradeStatsBatch. After
// warm, /compare's per-mod loops never touch SQLite.
func (s *BuildStore) LookupTradeStat(league, strippedText, category string) (string, bool, error) {
	key := tradeStatsMemKey(category, strippedText)

	s.tradeStatsMemMu.RLock()
	entries, warm := s.tradeStatsMem[league]
	s.tradeStatsMemMu.RUnlock()
	if warm {
		id, ok := entries[key]
		return id, ok, nil
	}

	loaded, err := s.loadTradeStatsLeague(league)
	if err != nil {
		return "", false, err
	}
	id, ok := loaded[key]
	return id, ok, nil
}

// loadTradeStatsLeague reads every row for a league from SQLite and
// stores the resulting map in the in-memory cache. Returns the loaded
// map so the caller can answer the lookup that triggered the load
// without re-acquiring the lock. Concurrent loads for the same league
// race-and-overwrite — acceptable since the data is identical.
func (s *BuildStore) loadTradeStatsLeague(league string) (map[string]string, error) {
	rows, err := s.db.QueryContext(context.Background(), `
		SELECT stripped_text, category, trade_id FROM trade_stats WHERE league = ?
	`, league)
	if err != nil {
		return nil, fmt.Errorf("load trade_stats league %q: %w", league, err)
	}
	defer rows.Close()

	entries := make(map[string]string)
	for rows.Next() {
		var stripped, category, tradeID string
		if err := rows.Scan(&stripped, &category, &tradeID); err != nil {
			return nil, fmt.Errorf("scan trade_stats: %w", err)
		}
		entries[tradeStatsMemKey(category, stripped)] = tradeID
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate trade_stats: %w", err)
	}

	s.tradeStatsMemMu.Lock()
	s.tradeStatsMem[league] = entries
	s.tradeStatsMemMu.Unlock()
	return entries, nil
}

// TradeStatsLatestFetchedAt returns the most-recent fetched_at across
// rows for a league, or (zero, false, nil) when no rows exist. Used by
// the fetcher to short-circuit when within TTL.
func (s *BuildStore) TradeStatsLatestFetchedAt(league string) (time.Time, bool, error) {
	var ts int64
	err := s.db.QueryRowContext(context.Background(), `
		SELECT MAX(fetched_at) FROM trade_stats WHERE league = ?
	`, league).Scan(&ts)
	if errors.Is(err, sql.ErrNoRows) || ts == 0 {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, fmt.Errorf("lookup latest trade_stats fetched_at: %w", err)
	}
	return time.Unix(ts, 0), true, nil
}
