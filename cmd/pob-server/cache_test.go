package main

import (
	"errors"
	"testing"
	"time"
)

func newTestCache() *BuildCache {
	now := time.Now()
	return &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    func() time.Time { return now },
		cancel:     func() {},
	}
}

func TestBuildCachePutAndLen(t *testing.T) {
	cache := newTestCache()

	xml := "<PathOfBuilding><Build level=\"99\"/></PathOfBuilding>"
	id := cache.Put(xml)

	if id == "" {
		t.Fatal("expected non-empty build ID")
	}
	if cache.Len() != 1 {
		t.Fatalf("expected 1 entry, got %d", cache.Len())
	}
}

func TestBuildCacheContentHashDedup(t *testing.T) {
	cache := newTestCache()

	xml := "<PathOfBuilding/>"
	id1 := cache.Put(xml)
	id2 := cache.Put(xml)

	if id1 != id2 {
		t.Fatalf("same content should produce same ID: %q != %q", id1, id2)
	}
	if cache.Len() != 1 {
		t.Fatalf("expected 1 entry, got %d", cache.Len())
	}
}

func TestBuildCacheTTLExpiry(t *testing.T) {
	now := time.Now()
	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        5 * time.Minute,
		maxEntries: 100,
		nowFunc:    func() time.Time { return now },
		cancel:     func() {},
	}

	cache.Put("<build/>")

	// Advance time past TTL
	now = now.Add(6 * time.Minute)
	cache.evict()

	if cache.Len() != 0 {
		t.Fatal("expected 0 entries after TTL expiry")
	}
}

func TestBuildCacheMaxEntries(t *testing.T) {
	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 3,
		nowFunc:    time.Now,
		cancel:     func() {},
	}

	cache.Put("<build1/>")
	cache.Put("<build2/>")
	cache.Put("<build3/>")
	cache.Put("<build4/>") // should evict the oldest

	if cache.Len() != 3 {
		t.Fatalf("expected 3 entries after eviction, got %d", cache.Len())
	}
}

func TestBuildCacheGetFromMemory(t *testing.T) {
	cache := newTestCache()

	xml := "<PathOfBuilding/>"
	id := cache.Put(xml)

	got, err := cache.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if got != xml {
		t.Fatalf("xml mismatch: got %q, want %q", got, xml)
	}
}

func TestBuildCacheGetMissNoStore(t *testing.T) {
	cache := newTestCache()

	_, err := cache.Get("nonexistent")
	if !errors.Is(err, ErrBuildNotFound) {
		t.Fatalf("expected ErrBuildNotFound, got %v", err)
	}
}

func TestBuildCacheGetReadThrough(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	cache := newTestCache()
	cache.store = store

	// Put directly into store, bypassing memory cache
	xml := "<PathOfBuilding><Build/></PathOfBuilding>"
	id := contentHash(xml)
	if err := store.Put(id, xml, "{}", "", ""); err != nil {
		t.Fatal(err)
	}

	// Cache memory is empty — should read through to SQLite
	if cache.Len() != 0 {
		t.Fatal("expected empty memory cache")
	}

	got, err := cache.Get(id)
	if err != nil {
		t.Fatal(err)
	}
	if got != xml {
		t.Fatalf("xml mismatch: got %q, want %q", got, xml)
	}

	// Should now be in memory cache
	if cache.Len() != 1 {
		t.Fatal("expected build to be promoted to memory cache")
	}
}

func TestBuildCachePutDoesNotWriteStore(t *testing.T) {
	store, err := NewBuildStore(tempDBPath(t))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	cache := newTestCache()
	cache.store = store

	xml := "<test/>"
	id := cache.Put(xml)

	// cache.Put only writes to memory; callers persist to store directly
	_, _, err = store.Get(id)
	if !errors.Is(err, ErrBuildNotFound) {
		t.Fatal("cache.Put should not write to store")
	}
}
