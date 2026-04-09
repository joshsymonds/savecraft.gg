package main

import (
	"testing"
	"time"
)

func newTestCache(ttl time.Duration) *BuildCache {
	now := time.Now()
	return &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        ttl,
		maxEntries: 100,
		nowFunc:    func() time.Time { return now },
		cancel:     func() {},
	}
}

func TestBuildCachePutAndLen(t *testing.T) {
	cache := newTestCache(10 * time.Minute)

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
	cache := newTestCache(10 * time.Minute)

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
