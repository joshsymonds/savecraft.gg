package main

// Affinity tests use real time (time.Sleep, real time.AfterFunc) rather
// than a fake clock. This matches the project convention already in use
// at process_test.go:TestPoolIdleTimeout — Pool's timer surface is not
// abstracted behind a clock interface. If CI flakes here, refactor Pool
// to take a clock dependency rather than papering over with longer
// timeouts.

import (
	"errors"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// newAffinityTestPool builds a pool with a long-lived test subprocess.
// Affinity tests deliberately sleep past the existing newTestPool's `cat ""`
// process death (cat exits immediately on missing-file error). `cat /dev/stdin`
// stays alive while stdin is open and exits within milliseconds when pool.Kill
// closes stdin — no 30-second cleanup leaks if a test fails to Shutdown.
//
// idleTimeout is fixed at 5 minutes — all affinity tests use the same value
// because the pool's affinity logic is the focus, not idle eviction.
func newAffinityTestPool(poolMax int, affinityTTL time.Duration, affinityMaxPins int) *Pool {
	pool := NewPool(poolMax, 5*time.Minute, "cat", "/dev/stdin", ".", slog.New(slog.NewTextHandler(io.Discard, nil)))
	pool.affinityTTL = affinityTTL
	pool.affinityMaxPins = affinityMaxPins
	return pool
}

// TestAffinityHit: AcquireForBuild on a pinned-idle process returns that exact process.
func TestAffinityHit(t *testing.T) {
	pool := newAffinityTestPool(2, 10*time.Minute, 2)
	defer pool.Shutdown()

	proc, err := pool.AcquireForBuild("build-A")
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	pool.Pin(proc, "build-A")
	pool.Release(proc)

	got, err := pool.AcquireForBuild("build-A")
	if err != nil {
		t.Fatalf("second acquire: %v", err)
	}
	defer pool.Release(got)
	if got != proc {
		t.Fatalf("expected affinity hit to return same process; got different process")
	}
}

// TestAffinitySlidingWindow: each AcquireForBuild hit resets the TTL.
// Repeated acquires within the TTL window keep the pin alive past what a
// single fixed-window timer would allow.
func TestAffinitySlidingWindow(t *testing.T) {
	ttl := 100 * time.Millisecond
	pool := newAffinityTestPool(2, ttl, 2)
	defer pool.Shutdown()

	proc, err := pool.AcquireForBuild("build-A")
	if err != nil {
		t.Fatal(err)
	}
	pool.Pin(proc, "build-A")
	pool.Release(proc)

	// Three hits at 60ms each — total 180ms, but each resets the 100ms TTL.
	// A non-sliding timer would expire after 100ms; sliding keeps it alive.
	for range 3 {
		time.Sleep(60 * time.Millisecond)
		got, err := pool.AcquireForBuild("build-A")
		if err != nil {
			t.Fatal(err)
		}
		if got != proc {
			t.Fatalf("expected sliding window hit to return same process")
		}
		pool.Release(got)
	}
}

// TestAffinityTTLExpiry: process unpinned after idle TTL elapses with no activity.
func TestAffinityTTLExpiry(t *testing.T) {
	ttl := 50 * time.Millisecond
	pool := newAffinityTestPool(2, ttl, 2)
	defer pool.Shutdown()

	proc, err := pool.AcquireForBuild("build-A")
	if err != nil {
		t.Fatal(err)
	}
	pool.Pin(proc, "build-A")
	pool.Release(proc)

	time.Sleep(ttl * 3) // well past expiry

	if pinned := pool.PinnedBuildID(proc); pinned != "" {
		t.Fatalf("expected pin to expire; still pinned to %q", pinned)
	}
	if proc2 := pool.LookupAffinity("build-A"); proc2 != nil {
		t.Fatalf("expected affinityMap[build-A] to be empty after TTL")
	}
}

// TestAffinityLRUEviction: pinning a (pool_max + 1)th distinct build evicts the
// least-recently-used pin, repurposing that process for the new build.
func TestAffinityLRUEviction(t *testing.T) {
	pool := newAffinityTestPool(3, 10*time.Minute, 2)
	defer pool.Shutdown()

	// Pin two builds, with build-A used first (oldest)
	pA, _ := pool.AcquireForBuild("build-A")
	pool.Pin(pA, "build-A")
	pool.Release(pA)

	time.Sleep(5 * time.Millisecond)

	pB, _ := pool.AcquireForBuild("build-B")
	pool.Pin(pB, "build-B")
	pool.Release(pB)

	// Both pinned now (max=2). Pin a third build → A (LRU) should evict.
	pC, _ := pool.AcquireForBuild("build-C")
	pool.Pin(pC, "build-C")
	pool.Release(pC)

	if pool.LookupAffinity("build-A") != nil {
		t.Fatalf("expected build-A to be LRU-evicted")
	}
	if pool.LookupAffinity("build-B") != pB {
		t.Fatalf("build-B pin should remain")
	}
	if pool.LookupAffinity("build-C") != pC {
		t.Fatalf("build-C should be newly pinned")
	}
}

// TestAffinitySwap: SwapAffinity transfers the pin from old → new on the same process.
func TestAffinitySwap(t *testing.T) {
	pool := newAffinityTestPool(2, 10*time.Minute, 2)
	defer pool.Shutdown()

	proc, _ := pool.AcquireForBuild("build-A")
	pool.Pin(proc, "build-A")
	pool.Release(proc)

	pool.SwapAffinity("build-A", "build-A-modified")

	if pool.LookupAffinity("build-A") != nil {
		t.Fatalf("old pin should be removed")
	}
	if pool.LookupAffinity("build-A-modified") != proc {
		t.Fatalf("new pin should reference the same process")
	}

	// Acquiring by the new ID hits the same process
	got, _ := pool.AcquireForBuild("build-A-modified")
	defer pool.Release(got)
	if got != proc {
		t.Fatalf("expected same process via new pin")
	}
}

// TestAffinitySwapNoOp: SwapAffinity on an oldID without a pin is a silent no-op.
func TestAffinitySwapNoOp(t *testing.T) {
	pool := newAffinityTestPool(2, 10*time.Minute, 2)
	defer pool.Shutdown()

	// No panic, no error — just nothing happens
	pool.SwapAffinity("does-not-exist", "new-id")

	if pool.LookupAffinity("new-id") != nil {
		t.Fatalf("swap from missing oldID should not create a new pin")
	}
}

// TestAffinitySwapEvictsExisting: SwapAffinity into a newID that already has a
// (different) pin evicts the existing newID pin first; the more recent
// operation wins.
func TestAffinitySwapEvictsExisting(t *testing.T) {
	pool := newAffinityTestPool(3, 10*time.Minute, 3)
	defer pool.Shutdown()

	pA, _ := pool.AcquireForBuild("build-A")
	pool.Pin(pA, "build-A")
	pool.Release(pA)

	pB, _ := pool.AcquireForBuild("build-B")
	pool.Pin(pB, "build-B")
	pool.Release(pB)

	pool.SwapAffinity("build-A", "build-B") // collision

	if pool.LookupAffinity("build-A") != nil {
		t.Fatalf("build-A pin should be cleared")
	}
	if pool.LookupAffinity("build-B") != pA {
		t.Fatalf("build-B should now reference pA (the swapped-in process)")
	}
	// pB's pin removed; it is now an unpinned idle/spawnable process. No assertion
	// on its location — just that it isn't pinned anywhere.
	if id := pool.PinnedBuildID(pB); id != "" {
		t.Fatalf("pB should no longer be pinned; pinned to %q", id)
	}
}

// TestAffinityConcurrentPinRace: many AcquireForBuild calls for the same
// uncached build_id from different goroutines — exactly one ends up pinning the
// build, and final state has exactly one pin (no orphaned pins, no double-pins).
// Pool size > N so racing acquires don't hit ErrPoolExhausted; the test
// exercises Pin's deduplication, not capacity.
func TestAffinityConcurrentPinRace(t *testing.T) {
	pool := newAffinityTestPool(8, 10*time.Minute, 8)
	defer pool.Shutdown()

	const concurrentPins = 5
	var wg sync.WaitGroup
	procs := make([]*Process, concurrentPins)
	for i := range concurrentPins {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			p, err := pool.AcquireForBuild("build-X")
			if err != nil {
				t.Errorf("goroutine %d: %v", i, err)
				return
			}
			// Each caller pins after acquiring (mimics the post-load Pin call site).
			pool.Pin(p, "build-X")
			procs[i] = p
			pool.Release(p)
		}(i)
	}
	wg.Wait()

	// Final state: exactly one process pinned to build-X
	pinned := pool.LookupAffinity("build-X")
	if pinned == nil {
		t.Fatalf("expected build-X to have a pin after racing Pins")
	}
	// And among the *distinct* racing procs, none are still pinned to a stale
	// buildID. Dedupe procs[] first: under serial-ish scheduling all 5 acquires
	// can return the same idle pinned process, and that's correct behavior.
	// The invariant is "at most one distinct proc is pinned to build-X", not
	// "the procs[] slice has at most one entry pinned to build-X".
	seen := make(map[*Process]bool, len(procs))
	pinCount := 0
	for _, p := range procs {
		if p == nil || seen[p] {
			continue
		}
		seen[p] = true
		if pool.PinnedBuildID(p) == "build-X" {
			pinCount++
		}
	}
	if pinCount != 1 {
		t.Fatalf("expected exactly 1 distinct process pinned to build-X; got %d", pinCount)
	}
}

// TestAffinityConcurrentAcquireExistingPin: two AcquireForBuild calls for a
// build that already has a pin — the busy-pin case falls back to a generic
// acquire. The first caller gets the pinned process; the second gets a generic
// process (different).
func TestAffinityConcurrentAcquireExistingPin(t *testing.T) {
	pool := newAffinityTestPool(2, 10*time.Minute, 2)
	defer pool.Shutdown()

	proc, _ := pool.AcquireForBuild("build-A")
	pool.Pin(proc, "build-A")
	pool.Release(proc)

	// First caller takes the pin
	first, err := pool.AcquireForBuild("build-A")
	if err != nil {
		t.Fatal(err)
	}
	if first != proc {
		t.Fatalf("first caller should get pinned process")
	}

	// Second caller — pinned process is busy, falls back to generic.
	second, err := pool.AcquireForBuild("build-A")
	if err != nil {
		t.Fatalf("second acquire: %v", err)
	}
	if second == proc {
		t.Fatalf("second caller should get a different process (pin busy)")
	}

	// Cleanup
	pool.Release(first)
	pool.Release(second)
}

// TestAffinityGenericAcquireUnchanged: Acquire() (no build_id) preserves
// existing semantics — returns any free unpinned process.
func TestAffinityGenericAcquireUnchanged(t *testing.T) {
	pool := newAffinityTestPool(2, 10*time.Minute, 2)
	defer pool.Shutdown()

	pinned, _ := pool.AcquireForBuild("build-A")
	pool.Pin(pinned, "build-A")
	pool.Release(pinned)

	// Acquire() should prefer a non-pinned process. Since there isn't one, it
	// should spawn a new generic process (pool max=2, one slot free).
	generic, err := pool.Acquire()
	if err != nil {
		t.Fatalf("generic acquire: %v", err)
	}
	defer pool.Release(generic)
	if generic == pinned {
		t.Fatalf("generic Acquire() should not steal pinned process when capacity exists")
	}
}

// TestAffinityPoolFullStealsLRU: when AcquireForBuild requests a new build but
// pool is full and ALL processes are pinned, the LRU pin is evicted and its
// process repurposed.
func TestAffinityPoolFullStealsLRU(t *testing.T) {
	pool := newAffinityTestPool(2, 10*time.Minute, 2)
	defer pool.Shutdown()

	pA, _ := pool.AcquireForBuild("build-A")
	pool.Pin(pA, "build-A")
	pool.Release(pA)

	time.Sleep(5 * time.Millisecond)

	pB, _ := pool.AcquireForBuild("build-B")
	pool.Pin(pB, "build-B")
	pool.Release(pB)

	// Pool is full of pinned-idle processes. AcquireForBuild for a new build:
	pC, err := pool.AcquireForBuild("build-C")
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer pool.Release(pC)

	// pC must be one of pA or pB (repurposed from LRU); not a brand-new one
	// (pool full at max=2).
	if pC != pA && pC != pB {
		t.Fatalf("expected LRU pin to be evicted and process repurposed")
	}
	// build-A was LRU; its pin should be gone.
	if pool.LookupAffinity("build-A") != nil {
		t.Fatalf("expected build-A pin to be evicted (LRU)")
	}
}

// TestAffinityProcessCrash: if a pinned process dies, the next
// AcquireForBuild reloads cleanly without observing the dead process.
func TestAffinityProcessCrash(t *testing.T) {
	pool := newAffinityTestPool(2, 10*time.Minute, 2)
	defer pool.Shutdown()

	proc, _ := pool.AcquireForBuild("build-A")
	pool.Pin(proc, "build-A")
	pool.Release(proc)

	// Kill the subprocess; pin entry now points at a dead process.
	proc.Kill()
	<-proc.exited

	got, err := pool.AcquireForBuild("build-A")
	if err != nil {
		t.Fatalf("acquire after crash: %v", err)
	}
	defer pool.Release(got)
	if got == proc {
		t.Fatalf("should not return the dead process")
	}
	if !got.Alive() {
		t.Fatalf("returned process should be alive")
	}
}

// TestAffinityShutdownClean: Shutdown clears all pins and stops timers; no
// goroutine leaks and Stats reports zero busy/idle.
func TestAffinityShutdownClean(t *testing.T) {
	pool := newAffinityTestPool(3, 10*time.Minute, 3)

	for _, id := range []string{"a", "b", "c"} {
		p, err := pool.AcquireForBuild(id)
		if err != nil {
			t.Fatal(err)
		}
		pool.Pin(p, id)
		pool.Release(p)
	}

	pool.Shutdown()

	idle, busy, _ := pool.Stats()
	if idle != 0 || busy != 0 {
		t.Fatalf("after shutdown: expected 0/0, got %d/%d", idle, busy)
	}
	if pool.LookupAffinity("a") != nil || pool.LookupAffinity("b") != nil || pool.LookupAffinity("c") != nil {
		t.Fatalf("all pins should be cleared after shutdown")
	}
}

// TestAffinityTimestampUpdated: Pin and AcquireForBuild hits both bump the
// last-used timestamp. Verified via observable ordering in LRU eviction:
// access pattern A→B→A then pin C should evict B (A was touched last).
func TestAffinityTimestampUpdated(t *testing.T) {
	pool := newAffinityTestPool(3, 10*time.Minute, 2)
	defer pool.Shutdown()

	pA, _ := pool.AcquireForBuild("build-A")
	pool.Pin(pA, "build-A")
	pool.Release(pA)

	time.Sleep(5 * time.Millisecond)

	pB, _ := pool.AcquireForBuild("build-B")
	pool.Pin(pB, "build-B")
	pool.Release(pB)

	time.Sleep(5 * time.Millisecond)

	// Touch A again — bumps its timestamp ahead of B.
	got, _ := pool.AcquireForBuild("build-A")
	pool.Release(got)

	time.Sleep(5 * time.Millisecond)

	// Pin a third — B should evict (now LRU), not A.
	pC, _ := pool.AcquireForBuild("build-C")
	pool.Pin(pC, "build-C")
	pool.Release(pC)

	if pool.LookupAffinity("build-A") == nil {
		t.Fatalf("build-A should remain pinned (most recently touched)")
	}
	if pool.LookupAffinity("build-B") != nil {
		t.Fatalf("build-B should be LRU-evicted")
	}
}

// TestAffinityAcquireForBuildEmptyID: AcquireForBuild("") behaves like Acquire()
// — never pins, never matches.
func TestAffinityAcquireForBuildEmptyID(t *testing.T) {
	pool := newAffinityTestPool(2, 10*time.Minute, 2)
	defer pool.Shutdown()

	proc, err := pool.AcquireForBuild("")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Release(proc)

	if pool.PinnedBuildID(proc) != "" {
		t.Fatalf("empty buildID should not result in a pin")
	}
}

// Compile-time guards: if these helpers don't exist, the whole file fails to
// compile and the failure is unambiguous about the missing API.
var (
	_ = (*Pool)(nil).AcquireForBuild
	_ = (*Pool)(nil).Pin
	_ = (*Pool)(nil).SwapAffinity
	_ = (*Pool)(nil).PinnedBuildID
	_ = (*Pool)(nil).LookupAffinity
)

// Sentinel ensures we don't accidentally suppress the unused import warning
// when refactoring.
var _ = atomic.Int32{}
var _ = errors.New
