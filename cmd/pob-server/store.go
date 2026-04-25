package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// ErrBuildNotFound is returned when a build ID is not in the store.
var ErrBuildNotFound = errors.New("build not found")

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
}

const schema = `
CREATE TABLE IF NOT EXISTS builds (
	id          TEXT PRIMARY KEY,
	xml         TEXT NOT NULL,
	summary     TEXT NOT NULL DEFAULT '{}',
	source_url  TEXT NOT NULL DEFAULT '',
	parent_id   TEXT NOT NULL DEFAULT '',
	created_at  INTEGER NOT NULL,
	accessed_at INTEGER NOT NULL
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

	if _, err := db.ExecContext(context.Background(), schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("creating schema: %w", err)
	}

	return &BuildStore{db: db}, nil
}

// Put stores a build. If the ID already exists, summary/source_url/parent_id are updated.
func (s *BuildStore) Put(id, xml, summary, sourceURL, parentID string) error {
	now := time.Now().Unix()
	_, err := s.db.ExecContext(context.Background(), `
		INSERT INTO builds (id, xml, summary, source_url, parent_id, created_at, accessed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			summary = excluded.summary,
			source_url = CASE WHEN excluded.source_url = '' THEN builds.source_url ELSE excluded.source_url END,
			parent_id = CASE WHEN excluded.parent_id = '' THEN builds.parent_id ELSE excluded.parent_id END,
			accessed_at = excluded.accessed_at
	`, id, xml, summary, sourceURL, parentID, now, now)
	if err != nil {
		return fmt.Errorf("storing build %s: %w", id, err)
	}
	return nil
}

// Get retrieves a build's XML and summary by ID, updating accessed_at.
// Returns ErrBuildNotFound if the ID doesn't exist.
func (s *BuildStore) Get(id string) (xml string, summary string, err error) {
	ctx := context.Background()
	now := time.Now().Unix()
	err = s.db.QueryRowContext(ctx, "SELECT xml, summary FROM builds WHERE id = ?", id).Scan(&xml, &summary)
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
