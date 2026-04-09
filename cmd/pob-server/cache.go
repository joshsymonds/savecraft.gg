// Package main implements the PoB calc server.
package main

import (
	"context"
	"crypto/sha256"
	"fmt"
	"sync"
	"time"
)

// BuildCache stores build XML keyed by content hash with TTL-based eviction.
// If a BuildStore is attached, writes go to both memory and SQLite,
// and reads fall through to SQLite on memory miss.
type BuildCache struct {
	mu         sync.Mutex
	builds     map[string]cachedBuild
	store      *BuildStore // optional persistent backing store
	ttl        time.Duration
	maxEntries int
	nowFunc    func() time.Time // for testing
	cancel     context.CancelFunc
}

type cachedBuild struct {
	xml      string
	lastUsed time.Time
}

// NewBuildCache creates a cache with the given TTL and max entry count.
func NewBuildCache(ttl time.Duration, maxEntries int) *BuildCache {
	ctx, cancel := context.WithCancel(context.Background())
	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        ttl,
		maxEntries: maxEntries,
		nowFunc:    time.Now,
		cancel:     cancel,
	}
	go cache.evictLoop(ctx)
	return cache
}

// Put stores build XML and returns its content-hash ID.
// If a store is attached, the build is also persisted to SQLite.
// If the cache exceeds maxEntries, the oldest entry is evicted from memory.
func (cache *BuildCache) Put(xml string) string {
	id := contentHash(xml)
	cache.mu.Lock()
	cache.builds[id] = cachedBuild{xml: xml, lastUsed: cache.nowFunc()}

	// Evict oldest entries if over capacity
	for len(cache.builds) > cache.maxEntries {
		var oldestID string
		var oldestTime time.Time
		for entryID, entry := range cache.builds {
			if oldestID == "" || entry.lastUsed.Before(oldestTime) {
				oldestID = entryID
				oldestTime = entry.lastUsed
			}
		}
		if oldestID != "" {
			delete(cache.builds, oldestID)
		}
	}

	cache.mu.Unlock()

	// Write-through to persistent store (best-effort)
	if cache.store != nil {
		_ = cache.store.Put(id, xml, "{}", "", "")
	}

	return id
}

// Get retrieves build XML by ID. Checks memory first, then falls back to
// the SQLite store if attached. On a store hit, the build is promoted to memory.
// Returns ErrBuildNotFound if the build is not in either layer.
func (cache *BuildCache) Get(id string) (string, error) {
	cache.mu.Lock()
	if entry, ok := cache.builds[id]; ok {
		cache.builds[id] = cachedBuild{xml: entry.xml, lastUsed: cache.nowFunc()}
		cache.mu.Unlock()
		return entry.xml, nil
	}
	cache.mu.Unlock()

	// Fall through to SQLite
	if cache.store != nil {
		xml, _, err := cache.store.Get(id)
		if err != nil {
			return "", err
		}
		// Promote to memory cache
		cache.mu.Lock()
		cache.builds[id] = cachedBuild{xml: xml, lastUsed: cache.nowFunc()}
		cache.mu.Unlock()
		return xml, nil
	}

	return "", ErrBuildNotFound
}

// Len returns the number of cached builds.
func (cache *BuildCache) Len() int {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	return len(cache.builds)
}

// Shutdown stops the eviction goroutine and closes the backing store.
func (cache *BuildCache) Shutdown() {
	cache.cancel()
	if cache.store != nil {
		cache.store.Close()
	}
}

func (cache *BuildCache) evictLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cache.evict()
		}
	}
}

func (cache *BuildCache) evict() {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	now := cache.nowFunc()
	for id, entry := range cache.builds {
		if now.Sub(entry.lastUsed) > cache.ttl {
			delete(cache.builds, id)
		}
	}
}

func contentHash(xml string) string {
	hash := sha256.Sum256([]byte(xml))
	return fmt.Sprintf("%x", hash[:16]) // 32 hex chars, plenty unique
}
