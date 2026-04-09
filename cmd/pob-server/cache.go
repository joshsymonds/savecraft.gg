// Package main implements the PoB calc server.
package main

import (
	"crypto/sha256"
	"fmt"
	"sync"
	"time"
)

// BuildCache stores build XML keyed by content hash with TTL-based eviction.
type BuildCache struct {
	mu      sync.Mutex
	builds  map[string]cachedBuild
	ttl     time.Duration
	nowFunc func() time.Time // for testing
}

type cachedBuild struct {
	xml      string
	lastUsed time.Time
}

// NewBuildCache creates a cache with the given TTL for entries.
func NewBuildCache(ttl time.Duration) *BuildCache {
	cache := &BuildCache{
		builds:  make(map[string]cachedBuild),
		ttl:     ttl,
		nowFunc: time.Now,
	}
	go cache.evictLoop()
	return cache
}

// Put stores build XML and returns its content-hash ID.
func (cache *BuildCache) Put(xml string) string {
	id := contentHash(xml)
	cache.mu.Lock()
	cache.builds[id] = cachedBuild{xml: xml, lastUsed: cache.nowFunc()}
	cache.mu.Unlock()
	return id
}

// Get retrieves build XML by ID, refreshing its TTL. Returns ("", false) on miss.
func (cache *BuildCache) Get(id string) (string, bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	entry, ok := cache.builds[id]
	if !ok {
		return "", false
	}
	entry.lastUsed = cache.nowFunc()
	cache.builds[id] = entry
	return entry.xml, true
}

// Len returns the number of cached builds.
func (cache *BuildCache) Len() int {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	return len(cache.builds)
}

func (cache *BuildCache) evictLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		cache.evict()
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
