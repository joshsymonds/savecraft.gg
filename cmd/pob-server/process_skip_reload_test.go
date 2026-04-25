package main

import (
	"sync"
	"testing"
	"time"
)

// TestProcessLastLoadedBuildID: Get/Set/Reset round-trip.
func TestProcessLastLoadedBuildID(t *testing.T) {
	pool := newAffinityTestPool(2, 5*time.Minute, 10*time.Minute, 2)
	defer pool.Shutdown()

	proc, err := pool.Acquire()
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Release(proc)

	if got := proc.LastLoadedBuildID(); got != "" {
		t.Fatalf("fresh process should have empty LastLoadedBuildID, got %q", got)
	}

	proc.SetLastLoadedBuildID("build-A")
	if got := proc.LastLoadedBuildID(); got != "build-A" {
		t.Fatalf("after Set, expected build-A, got %q", got)
	}

	proc.SetLastLoadedBuildID("build-B")
	if got := proc.LastLoadedBuildID(); got != "build-B" {
		t.Fatalf("after second Set, expected build-B, got %q", got)
	}

	proc.ResetLastLoadedBuildID()
	if got := proc.LastLoadedBuildID(); got != "" {
		t.Fatalf("after Reset, expected empty, got %q", got)
	}
}

// TestProcessLastLoadedBuildIDRace: concurrent Get/Set is race-clean.
// Run with -race; the struct must use a mutex (or atomic) to protect the field.
func TestProcessLastLoadedBuildIDRace(t *testing.T) {
	pool := newAffinityTestPool(2, 5*time.Minute, 10*time.Minute, 2)
	defer pool.Shutdown()

	proc, err := pool.Acquire()
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Release(proc)

	var wg sync.WaitGroup
	for range 10 {
		wg.Add(2)
		go func() {
			defer wg.Done()
			for range 100 {
				proc.SetLastLoadedBuildID("a")
				proc.SetLastLoadedBuildID("b")
			}
		}()
		go func() {
			defer wg.Done()
			for range 100 {
				_ = proc.LastLoadedBuildID()
			}
		}()
	}
	wg.Wait()
}

// TestPoolStealLRUResetsLoadedBuildID: when Pool steals an LRU pinned-idle
// process to repurpose it for a new build, the stolen process's
// LastLoadedBuildID must be cleared. Otherwise the new acquirer might send
// loadedBuildId="<previous>" and Lua would skip-reload a build that doesn't
// match the XML.
func TestPoolStealLRUResetsLoadedBuildID(t *testing.T) {
	pool := newAffinityTestPool(2, 5*time.Minute, 10*time.Minute, 2)
	defer pool.Shutdown()

	pA, _ := pool.AcquireForBuild("build-A")
	pool.Pin(pA, "build-A")
	pA.SetLastLoadedBuildID("build-A") // simulate handler updating after Send
	pool.Release(pA)

	pB, _ := pool.AcquireForBuild("build-B")
	pool.Pin(pB, "build-B")
	pB.SetLastLoadedBuildID("build-B")
	pool.Release(pB)

	// Pool full. AcquireForBuild for a new build → LRU-steal one of A/B.
	pC, err := pool.AcquireForBuild("build-C")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Release(pC)

	if got := pC.LastLoadedBuildID(); got != "" {
		t.Fatalf("stolen process must have LastLoadedBuildID cleared; still %q", got)
	}
}
