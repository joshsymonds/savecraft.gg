package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
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
