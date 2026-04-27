package main

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
)

// TestBuildStoreVersionFilterRejectsStaleEntries pins the cache-version
// invariant: a row with wrapper_schema_version != current returns
// ErrBuildNotFound on Get. Existing rows with version=0 (the default
// value pre-migration) auto-invalidate against the current constant.
func TestBuildStoreVersionFilterRejectsStaleEntries(t *testing.T) {
	store := newBuildStoreInTempDir(t)

	// Stale entry: version 0 (pre-migration default).
	if err := store.Put("stale", "<xml/>", `{"v":"old"}`, "", ""); err != nil {
		t.Fatalf("seed put: %v", err)
	}
	setBuildSchemaVersionForTest(t, store, "stale")

	if _, _, err := store.Get("stale"); !errors.Is(err, ErrBuildNotFound) {
		t.Errorf("Get on stale entry: expected ErrBuildNotFound, got %v", err)
	}
}

// TestBuildStoreVersionFilterAcceptsCurrentEntries pins the inverse:
// fresh Put writes the current constant; Get returns the row.
func TestBuildStoreVersionFilterAcceptsCurrentEntries(t *testing.T) {
	store := newBuildStoreInTempDir(t)

	if err := store.Put("fresh", "<xml/>", `{"v":"new"}`, "", ""); err != nil {
		t.Fatalf("put: %v", err)
	}
	xml, summary, err := store.Get("fresh")
	if err != nil {
		t.Fatalf("Get on current entry: %v", err)
	}
	if xml != "<xml/>" || summary != `{"v":"new"}` {
		t.Errorf("Get returned wrong data: xml=%q summary=%q", xml, summary)
	}

	// Confirm current version was stamped.
	if got := readBuildSchemaVersionForTest(t, store, "fresh"); got != wrapperSchemaVersion {
		t.Errorf("expected version=%d after Put, got %d", wrapperSchemaVersion, got)
	}
}

// TestBuildStoreVersionRewriteOnPut pins that Put always writes the
// current version, including on conflict — so re-storing a stale row
// upgrades it back to current and no manual migration is needed.
func TestBuildStoreVersionRewriteOnPut(t *testing.T) {
	store := newBuildStoreInTempDir(t)

	if err := store.Put("rewrite", "<xml/>", `{}`, "", ""); err != nil {
		t.Fatalf("first put: %v", err)
	}
	setBuildSchemaVersionForTest(t, store, "rewrite")

	if err := store.Put("rewrite", "<xml/>", `{"v":"updated"}`, "", ""); err != nil {
		t.Fatalf("second put: %v", err)
	}
	if got := readBuildSchemaVersionForTest(t, store, "rewrite"); got != wrapperSchemaVersion {
		t.Errorf("expected version=%d after re-Put, got %d", wrapperSchemaVersion, got)
	}
	xml, _, err := store.Get("rewrite")
	if err != nil {
		t.Fatalf("Get after re-Put: %v", err)
	}
	if xml != "<xml/>" {
		t.Errorf("Get returned wrong xml: %q", xml)
	}
}

// newBuildStoreInTempDir creates a fresh BuildStore in a per-test temp
// directory and registers cleanup. Each test gets its own DB.
func newBuildStoreInTempDir(t *testing.T) *BuildStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := NewBuildStore(dbPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(store.Close)
	return store
}

// setBuildSchemaVersionForTest direct-SQL marks a row as stale by
// resetting its wrapper_schema_version to 0 (the pre-migration default).
// Production code never writes a non-current version; tests use this to
// simulate pre-deploy rows so cache-invalidation logic can be exercised.
func setBuildSchemaVersionForTest(t *testing.T, store *BuildStore, id string) {
	t.Helper()
	res, err := store.db.ExecContext(context.Background(),
		"UPDATE builds SET wrapper_schema_version = 0 WHERE id = ?", id)
	if err != nil {
		t.Fatalf("set version: %v", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		t.Fatalf("set version: no row matched id=%q", id)
	}
}

// readBuildSchemaVersionForTest reads back the stored version for a row.
// Used to confirm Put stamped the current constant.
func readBuildSchemaVersionForTest(t *testing.T, store *BuildStore, id string) int {
	t.Helper()
	var v int
	err := store.db.QueryRowContext(context.Background(),
		"SELECT wrapper_schema_version FROM builds WHERE id = ?", id).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("read version: no row for id=%q", id)
	}
	if err != nil {
		t.Fatalf("read version: %v", err)
	}
	return v
}
