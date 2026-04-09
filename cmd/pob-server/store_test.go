package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func tempDBPath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "test.db")
}

func TestBuildStorePutAndGet(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	xml := "<PathOfBuilding><Build level=\"99\"/></PathOfBuilding>"
	id := contentHash(xml)

	if err := store.Put(id, xml, `{"stats":{}}`, "", ""); err != nil {
		t.Fatal(err)
	}

	got, summary, err := store.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if got != xml {
		t.Fatalf("xml mismatch: got %q, want %q", got, xml)
	}
	if summary != `{"stats":{}}` {
		t.Fatalf("summary mismatch: got %q", summary)
	}
}

func TestBuildStoreGetMissing(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	_, _, err = store.Get("nonexistent")
	if !errors.Is(err, ErrBuildNotFound) {
		t.Fatalf("expected ErrBuildNotFound, got %v", err)
	}
}

func TestBuildStoreUpsert(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	id := contentHash("<build/>")

	if err := store.Put(id, "<build/>", `{"v":1}`, "", ""); err != nil {
		t.Fatal(err)
	}
	// Same ID, updated summary
	if err := store.Put(id, "<build/>", `{"v":2}`, "", ""); err != nil {
		t.Fatal(err)
	}

	_, summary, err := store.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if summary != `{"v":2}` {
		t.Fatalf("expected updated summary, got %q", summary)
	}
}

func TestBuildStoreParentID(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	parentID := contentHash("<parent/>")
	childID := contentHash("<child/>")

	if err := store.Put(parentID, "<parent/>", "{}", "", ""); err != nil {
		t.Fatal(err)
	}
	if err := store.Put(childID, "<child/>", "{}", "", parentID); err != nil {
		t.Fatal(err)
	}

	meta, err := store.GetMeta(childID)
	if err != nil {
		t.Fatal(err)
	}
	if meta.ParentID != parentID {
		t.Fatalf("expected parent_id %q, got %q", parentID, meta.ParentID)
	}
}

func TestBuildStoreCleanup(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	id := contentHash("<old/>")
	if err := store.Put(id, "<old/>", "{}", "", ""); err != nil {
		t.Fatal(err)
	}

	// Force accessed_at to 31 days ago
	_, err = store.db.Exec("UPDATE builds SET accessed_at = ? WHERE id = ?",
		time.Now().Add(-31*24*time.Hour).Unix(), id)
	if err != nil {
		t.Fatal(err)
	}

	removed, err := store.Cleanup(30 * 24 * time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("expected 1 removed, got %d", removed)
	}

	_, _, err = store.Get(id)
	if !errors.Is(err, ErrBuildNotFound) {
		t.Fatalf("expected build to be cleaned up, got %v", err)
	}
}

func TestBuildStoreCleanupKeepsRecent(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	id := contentHash("<recent/>")
	if err := store.Put(id, "<recent/>", "{}", "", ""); err != nil {
		t.Fatal(err)
	}

	removed, err := store.Cleanup(30 * 24 * time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 {
		t.Fatalf("expected 0 removed, got %d", removed)
	}

	xml, _, err := store.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if xml != "<recent/>" {
		t.Fatal("recent build should survive cleanup")
	}
}

func TestBuildStorePersistsAcrossReopen(t *testing.T) {
	dbPath := tempDBPath(t)

	// Write and close
	store1, err := NewBuildStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	id := contentHash("<persist/>")
	if err := store1.Put(id, "<persist/>", `{"ok":true}`, "https://pobb.in/abc", ""); err != nil {
		t.Fatal(err)
	}
	store1.Close()

	// Reopen and read
	store2, err := NewBuildStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store2.Close()

	xml, summary, err := store2.Get(id)
	if err != nil {
		t.Fatalf("build should persist across reopen: %v", err)
	}
	if xml != "<persist/>" {
		t.Fatalf("xml mismatch after reopen: %q", xml)
	}
	if summary != `{"ok":true}` {
		t.Fatalf("summary mismatch after reopen: %q", summary)
	}

	meta, err := store2.GetMeta(id)
	if err != nil {
		t.Fatal(err)
	}
	if meta.SourceURL != "https://pobb.in/abc" {
		t.Fatalf("source_url mismatch: %q", meta.SourceURL)
	}
}

func TestBuildStoreGetUpdatesAccessedAt(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	id := contentHash("<access/>")
	if err := store.Put(id, "<access/>", "{}", "", ""); err != nil {
		t.Fatal(err)
	}

	// Force accessed_at to 1 hour ago
	oneHourAgo := time.Now().Add(-time.Hour).Unix()
	if _, err := store.db.Exec("UPDATE builds SET accessed_at = ? WHERE id = ?", oneHourAgo, id); err != nil {
		t.Fatal(err)
	}

	// Get should update accessed_at
	if _, _, err := store.Get(id); err != nil {
		t.Fatal(err)
	}

	var accessedAt int64
	if err := store.db.QueryRow("SELECT accessed_at FROM builds WHERE id = ?", id).Scan(&accessedAt); err != nil {
		t.Fatal(err)
	}
	if accessedAt <= oneHourAgo {
		t.Fatal("Get should update accessed_at")
	}
}

func TestNewBuildStoreCreatesDir(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "subdir", "builds.db")

	store, err := NewBuildStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Verify file exists
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Fatal("expected database file to be created")
	}
}
