package main

import (
	"testing"
	"time"
)

func TestBuildCachePutGet(t *testing.T) {
	c := &BuildCache{
		builds:  make(map[string]cachedBuild),
		ttl:     10 * time.Minute,
		nowFunc: time.Now,
	}

	xml := "<PathOfBuilding><Build level=\"99\"/></PathOfBuilding>"
	id := c.Put(xml)

	if id == "" {
		t.Fatal("expected non-empty build ID")
	}

	got, ok := c.Get(id)
	if !ok {
		t.Fatal("expected cache hit")
	}
	if got != xml {
		t.Fatalf("expected %q, got %q", xml, got)
	}
}

func TestBuildCacheMiss(t *testing.T) {
	c := &BuildCache{
		builds:  make(map[string]cachedBuild),
		ttl:     10 * time.Minute,
		nowFunc: time.Now,
	}

	_, ok := c.Get("nonexistent")
	if ok {
		t.Fatal("expected cache miss")
	}
}

func TestBuildCacheContentHashDedup(t *testing.T) {
	c := &BuildCache{
		builds:  make(map[string]cachedBuild),
		ttl:     10 * time.Minute,
		nowFunc: time.Now,
	}

	xml := "<PathOfBuilding/>"
	id1 := c.Put(xml)
	id2 := c.Put(xml)

	if id1 != id2 {
		t.Fatalf("same content should produce same ID: %q != %q", id1, id2)
	}
	if c.Len() != 1 {
		t.Fatalf("expected 1 entry, got %d", c.Len())
	}
}

func TestBuildCacheTTLExpiry(t *testing.T) {
	now := time.Now()
	c := &BuildCache{
		builds:  make(map[string]cachedBuild),
		ttl:     5 * time.Minute,
		nowFunc: func() time.Time { return now },
	}

	id := c.Put("<build/>")

	// Advance time past TTL
	now = now.Add(6 * time.Minute)
	c.evict()

	_, ok := c.Get(id)
	if ok {
		t.Fatal("expected cache miss after TTL expiry")
	}
}

func TestBuildCacheGetRefreshesTTL(t *testing.T) {
	now := time.Now()
	c := &BuildCache{
		builds:  make(map[string]cachedBuild),
		ttl:     5 * time.Minute,
		nowFunc: func() time.Time { return now },
	}

	id := c.Put("<build/>")

	// Advance 4 minutes, then Get (should refresh)
	now = now.Add(4 * time.Minute)
	_, ok := c.Get(id)
	if !ok {
		t.Fatal("expected cache hit at 4 minutes")
	}

	// Advance another 4 minutes (8 total, but only 4 since last Get)
	now = now.Add(4 * time.Minute)
	c.evict()

	_, ok = c.Get(id)
	if !ok {
		t.Fatal("expected cache hit — Get should have refreshed TTL")
	}
}
