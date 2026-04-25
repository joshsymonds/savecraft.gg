package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"slices"
	"sync"
	"time"
)

// ErrPoolExhausted is returned when all processes are busy and the pool is at max size.
var ErrPoolExhausted = errors.New("all PoB processes are busy")

// Process represents a single persistent LuaJIT subprocess running wrapper.lua.
//
// lastLoadedBuildID tracks the buildID currently loaded into the wrapper's
// in-memory `build` global. Handlers send this in the request as
// `loadedBuildId`; wrapper.lua skips `loadBuildFromXML` when the request's
// `loadedBuildId` matches its own internal `_lastLoadedBuildId`. The pool
// clears this field when LRU-stealing the process for a different build, so
// the next request reloads.
type Process struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Scanner
	stderr io.ReadCloser
	exited chan struct{} // closed when the process exits

	loadedMu          sync.Mutex
	lastLoadedBuildID string
}

// LastLoadedBuildID returns the buildID most recently loaded by this process,
// or "" if no build has been loaded.
func (proc *Process) LastLoadedBuildID() string {
	proc.loadedMu.Lock()
	defer proc.loadedMu.Unlock()
	return proc.lastLoadedBuildID
}

// SetLastLoadedBuildID records the buildID most recently loaded. Handlers call
// this after a successful Send so subsequent requests on the same process can
// signal "build already loaded, skip the reload" via the loadedBuildId field.
func (proc *Process) SetLastLoadedBuildID(id string) {
	proc.loadedMu.Lock()
	defer proc.loadedMu.Unlock()
	proc.lastLoadedBuildID = id
}

// ResetLastLoadedBuildID clears the field. Called by Pool when a process is
// repurposed for a different build (LRU steal). Subsequent requests on the
// process will not skip-reload.
func (proc *Process) ResetLastLoadedBuildID() {
	proc.loadedMu.Lock()
	defer proc.loadedMu.Unlock()
	proc.lastLoadedBuildID = ""
}

// SpawnProcess starts a new LuaJIT subprocess running wrapper.lua.
func SpawnProcess(ctx context.Context, luajitBin, wrapperPath, pobDir string) (*Process, error) {
	command := exec.CommandContext(ctx, luajitBin, wrapperPath)
	command.Dir = pobDir
	command.Env = append(command.Environ(), "POB_DIR=.")

	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}

	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	stderrPipe, err := command.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start luajit: %w", err)
	}

	proc := &Process{
		cmd:    command,
		stdin:  stdin,
		stdout: bufio.NewScanner(stdout),
		stderr: stderrPipe,
		exited: make(chan struct{}),
	}
	proc.stdout.Buffer(make([]byte, 0, 64*1024), 4*1024*1024) // 4MB max line

	// Wait for the process in the background so Alive() is reliable.
	// Also drains stderr for logging.
	go proc.waitAndDrain(stderrPipe)

	return proc, nil
}

func (proc *Process) waitAndDrain(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		// Debug level to avoid noise; PoB prints load progress here
		slog.Default().Debug("pob", "msg", scanner.Text())
	}
	// stderr closed = process exited. Call Wait to populate ProcessState.
	_ = proc.cmd.Wait()
	close(proc.exited)
}

// SendTimeout is the maximum time to wait for a response from the LuaJIT process.
const SendTimeout = 25 * time.Second

// Send sends a JSON request to the process and reads the JSON response.
// It enforces a timeout — if the process doesn't respond within SendTimeout,
// it is killed and an error is returned.
func (proc *Process) Send(request any) (json.RawMessage, error) {
	data, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	data = append(data, '\n')
	if _, err := proc.stdin.Write(data); err != nil {
		return nil, fmt.Errorf("write to process: %w", err)
	}

	type scanResult struct {
		data []byte
		err  error
	}
	ch := make(chan scanResult, 1)
	go func() {
		if proc.stdout.Scan() {
			// Copy the bytes — scanner reuses its internal buffer on next Scan()
			ch <- scanResult{data: []byte(proc.stdout.Text())}
		} else {
			ch <- scanResult{err: proc.stdout.Err()}
		}
	}()

	select {
	case result := <-ch:
		if result.err != nil {
			return nil, fmt.Errorf("read from process: %w", result.err)
		}
		if result.data == nil {
			return nil, fmt.Errorf("process closed stdout unexpectedly")
		}
		return json.RawMessage(result.data), nil
	case <-time.After(SendTimeout):
		proc.Kill()
		return nil, fmt.Errorf("PoB process timed out after %s", SendTimeout)
	}
}

// Kill terminates the subprocess and waits for the background goroutine to finish.
func (proc *Process) Kill() {
	proc.stdin.Close()
	_ = proc.cmd.Process.Kill()
	<-proc.exited // wait for waitAndDrain to complete
}

// Alive checks if the subprocess is still running.
func (proc *Process) Alive() bool {
	select {
	case <-proc.exited:
		return false
	default:
		return true
	}
}

// DefaultAffinityTTL is the idle window after which a build_id pin expires.
// Each AcquireForBuild hit resets the timer (sliding window).
const DefaultAffinityTTL = 10 * time.Minute

// Pool manages a lazy pool of PoB LuaJIT processes.
//
// # Affinity contract
//
// A process can be pinned to a single build_id. AcquireForBuild prefers a
// pinned-idle process over a generic idle process or a fresh spawn. After any
// operation that produces a new content-hash buildID (modify, resolve), the
// caller must invoke SwapAffinity or Pin to keep the affinity map consistent;
// otherwise the process stays pinned to the wrong buildID until the TTL sweep
// clears it. Pins survive Release; only the TTL timer, an explicit Unpin, an
// LRU eviction, or process death clears them.
type Pool struct {
	mu          sync.Mutex
	idle        []*Process
	busy        int
	maxSize     int
	idleTimeout time.Duration
	log         *slog.Logger

	// Configuration for spawning new processes
	luajitBin   string
	wrapperPath string
	pobDir      string

	// Idle timers keyed by process pointer
	timers map[*Process]*time.Timer

	// Affinity tracking. All four maps are kept in sync under pool.mu.
	affinityTTL      time.Duration          // sliding-window TTL for pins
	affinityMaxPins  int                    // max simultaneous pins; 0 disables pinning
	affinityProc     map[string]*Process    // buildID → pinned process
	affinityRev      map[*Process]string    // process → buildID (one-to-one with affinityProc)
	affinityLastUsed map[string]time.Time   // buildID → last touch (for LRU)
	affinityTimers   map[string]*time.Timer // buildID → TTL expiry timer
	affinityEpoch    map[string]uint64      // buildID → monotonic epoch; bumped on touch/unpin so already-fired timers can detect they're stale and skip Unpin
}

// NewPool creates a new lazy process pool.
//
// affinityMaxPins defaults to poolMax; affinityTTL to DefaultAffinityTTL. Tests
// override via direct field assignment.
func NewPool(poolMax int, idleTimeout time.Duration, luajitBin, wrapperPath, pobDir string, logger *slog.Logger) *Pool {
	return &Pool{
		maxSize:          poolMax,
		idleTimeout:      idleTimeout,
		luajitBin:        luajitBin,
		wrapperPath:      wrapperPath,
		pobDir:           pobDir,
		log:              logger,
		timers:           make(map[*Process]*time.Timer),
		affinityTTL:      DefaultAffinityTTL,
		affinityMaxPins:  poolMax,
		affinityProc:     make(map[string]*Process),
		affinityRev:      make(map[*Process]string),
		affinityLastUsed: make(map[string]time.Time),
		affinityTimers:   make(map[string]*time.Timer),
		affinityEpoch:    make(map[string]uint64),
	}
}

// Acquire returns an idle process, spawns a new one if under max, or returns
// ErrPoolExhausted. Equivalent to AcquireForBuild("") — never matches affinity,
// never auto-pins. Use AcquireForBuild for build-aware acquisition.
func (pool *Pool) Acquire() (*Process, error) {
	return pool.AcquireForBuild("")
}

// AcquireForBuild prefers the process pinned to buildID when buildID is
// non-empty and the pin's process is idle; otherwise falls back to generic
// acquire. On a pin hit the sliding-window TTL is reset. Falls through silently
// when the pin is missing, the pinned process is busy, or the pinned process
// is dead.
//
// AcquireForBuild does NOT auto-pin. Callers must invoke Pin (after first load
// for an unknown buildID) or SwapAffinity (after content-hash change) to
// establish or maintain affinity.
func (pool *Pool) AcquireForBuild(buildID string) (*Process, error) {
	pool.mu.Lock()

	// 1. Pin hit (only if pin's process is idle and alive)
	if buildID != "" {
		if proc := pool.takePinnedIdleLocked(buildID); proc != nil {
			pool.mu.Unlock()
			return proc, nil
		}
	}

	// 2. Unpinned idle (LIFO of non-pinned)
	if proc := pool.popUnpinnedIdleLocked(); proc != nil {
		pool.mu.Unlock()
		return proc, nil
	}

	// 3. Spawn under capacity
	if pool.busy+len(pool.idle) < pool.maxSize {
		pool.busy++
		pool.mu.Unlock()

		proc, err := SpawnProcess(context.Background(), pool.luajitBin, pool.wrapperPath, pool.pobDir)
		if err != nil {
			pool.mu.Lock()
			pool.busy--
			pool.mu.Unlock()
			return nil, fmt.Errorf("spawn process: %w", err)
		}
		return proc, nil
	}

	// 4. All capacity is pinned-idle: steal the LRU pin and repurpose
	if proc := pool.stealLRUPinnedIdleLocked(); proc != nil {
		pool.mu.Unlock()
		return proc, nil
	}

	// 5. Exhausted — every slot is pinned-and-busy
	pool.mu.Unlock()
	return nil, ErrPoolExhausted
}

// Pin establishes affinity from buildID to proc. Replaces any existing pin for
// buildID. Drops any prior pin proc held under a different buildID. When the
// affinity map is at affinityMaxPins capacity, the LRU pin is evicted before
// the new pin is installed.
//
// Empty buildID is a no-op.
func (pool *Pool) Pin(proc *Process, buildID string) {
	if buildID == "" || proc == nil {
		return
	}
	pool.mu.Lock()
	defer pool.mu.Unlock()

	if pool.affinityMaxPins <= 0 {
		return
	}

	// If proc already pinned under a different buildID, detach it.
	if oldID, ok := pool.affinityRev[proc]; ok {
		if oldID == buildID {
			// Already correctly pinned — just refresh the TTL.
			pool.touchAffinityLocked(buildID)
			return
		}
		pool.unpinLocked(oldID)
	}

	// If buildID currently maps to a different process, evict that pin.
	if existing, ok := pool.affinityProc[buildID]; ok && existing != proc {
		pool.unpinLocked(buildID)
	}

	// LRU-evict to stay at capacity.
	for len(pool.affinityProc) >= pool.affinityMaxPins {
		victim := pool.lruPinLocked()
		if victim == "" {
			break
		}
		pool.unpinLocked(victim)
	}

	pool.affinityProc[buildID] = proc
	pool.affinityRev[proc] = buildID
	pool.touchAffinityLocked(buildID)
}

// SwapAffinity transfers the pin from oldBuildID to newBuildID on whatever
// process oldBuildID currently references. Resets the TTL on newBuildID. No-op
// if oldBuildID has no pin. If newBuildID already has a different pin, that
// pin is evicted first (more recent operation wins).
func (pool *Pool) SwapAffinity(oldBuildID, newBuildID string) {
	if oldBuildID == "" || newBuildID == "" || oldBuildID == newBuildID {
		return
	}
	pool.mu.Lock()
	defer pool.mu.Unlock()

	proc, ok := pool.affinityProc[oldBuildID]
	if !ok {
		return // no-op
	}

	// If newBuildID already pinned to a different process, evict that pin.
	if existing, ok := pool.affinityProc[newBuildID]; ok && existing != proc {
		pool.unpinLocked(newBuildID)
	}

	pool.unpinLocked(oldBuildID)
	pool.affinityProc[newBuildID] = proc
	pool.affinityRev[proc] = newBuildID
	pool.touchAffinityLocked(newBuildID)
}

// PinnedBuildID returns the buildID currently pinned to proc, or "" if none.
func (pool *Pool) PinnedBuildID(proc *Process) string {
	pool.mu.Lock()
	defer pool.mu.Unlock()
	return pool.affinityRev[proc]
}

// LookupAffinity returns the process pinned to buildID, or nil if no pin.
func (pool *Pool) LookupAffinity(buildID string) *Process {
	pool.mu.Lock()
	defer pool.mu.Unlock()
	return pool.affinityProc[buildID]
}

// takePinnedIdleLocked: if buildID's pinned process is in the idle list and
// alive, remove it from idle, mark busy, refresh TTL, and return it. Returns
// nil if pin is missing, process is busy (not in idle list), or process is
// dead. Cleans up the pin in the dead-process case.
func (pool *Pool) takePinnedIdleLocked(buildID string) *Process {
	proc, ok := pool.affinityProc[buildID]
	if !ok {
		return nil
	}
	if !pool.removeFromIdleLocked(proc) {
		return nil // pin's process is busy — caller falls back
	}
	pool.cancelIdleTimerLocked(proc)
	if !proc.Alive() {
		pool.unpinLocked(buildID)
		return nil
	}
	pool.busy++
	pool.touchAffinityLocked(buildID)
	return proc
}

// popUnpinnedIdleLocked finds the most recently released unpinned process in
// the idle list, removes it, and returns it. Skips dead processes (cleans them
// up in passing). Returns nil if every idle process is pinned (or none idle).
func (pool *Pool) popUnpinnedIdleLocked() *Process {
	for i := len(pool.idle) - 1; i >= 0; i-- {
		proc := pool.idle[i]
		if _, isPinned := pool.affinityRev[proc]; isPinned {
			continue
		}
		pool.idle = append(pool.idle[:i], pool.idle[i+1:]...)
		pool.cancelIdleTimerLocked(proc)
		if !proc.Alive() {
			continue // try next unpinned
		}
		pool.busy++
		return proc
	}
	return nil
}

// stealLRUPinnedIdleLocked finds the LRU pin whose process is idle, evicts the
// pin, removes the process from idle, and returns it ready for reuse. Returns
// nil if no pin's process is idle.
func (pool *Pool) stealLRUPinnedIdleLocked() *Process {
	var oldestID string
	var oldestTime time.Time
	first := true
	for id := range pool.affinityProc {
		proc := pool.affinityProc[id]
		if !pool.isIdleLocked(proc) {
			continue
		}
		t := pool.affinityLastUsed[id]
		if first || t.Before(oldestTime) {
			oldestID = id
			oldestTime = t
			first = false
		}
	}
	if oldestID == "" {
		return nil
	}
	proc := pool.affinityProc[oldestID]
	pool.unpinLocked(oldestID)
	pool.removeFromIdleLocked(proc)
	pool.cancelIdleTimerLocked(proc)
	if !proc.Alive() {
		return nil
	}
	// Repurposed for a different build: clear the load-skip hint so the next
	// request reloads. Otherwise the next handler might send loadedBuildId
	// matching the prior pin and Lua would skip-reload incorrect XML.
	proc.ResetLastLoadedBuildID()
	pool.busy++
	return proc
}

// lruPinLocked returns the LRU buildID across all current pins regardless of
// whether the process is busy or idle. Used by Pin's capacity-enforcement
// loop.
func (pool *Pool) lruPinLocked() string {
	var oldestID string
	var oldestTime time.Time
	first := true
	for id, t := range pool.affinityLastUsed {
		if first || t.Before(oldestTime) {
			oldestID = id
			oldestTime = t
			first = false
		}
	}
	return oldestID
}

// removeFromIdleLocked: if proc is in pool.idle, remove it and return true.
func (pool *Pool) removeFromIdleLocked(proc *Process) bool {
	i := slices.Index(pool.idle, proc)
	if i < 0 {
		return false
	}
	pool.idle = slices.Delete(pool.idle, i, i+1)
	return true
}

func (pool *Pool) isIdleLocked(proc *Process) bool {
	return slices.Contains(pool.idle, proc)
}

func (pool *Pool) cancelIdleTimerLocked(proc *Process) {
	if t, ok := pool.timers[proc]; ok {
		t.Stop()
		delete(pool.timers, proc)
	}
}

// touchAffinityLocked updates the last-used timestamp and resets the TTL timer.
// Caller must hold pool.mu and have already established affinityProc[buildID].
//
// Bumps affinityEpoch[buildID] so any prior timer that has already fired but
// is still queued waiting on pool.mu will see a stale epoch and skip Unpin.
// Without this, a fired-but-not-yet-run timer can unpin a freshly-replaced
// pin and force an unnecessary 1.2s XML reload on the next request.
func (pool *Pool) touchAffinityLocked(buildID string) {
	pool.affinityLastUsed[buildID] = time.Now()
	pool.affinityEpoch[buildID]++
	epoch := pool.affinityEpoch[buildID]
	if t, ok := pool.affinityTimers[buildID]; ok {
		t.Stop()
		delete(pool.affinityTimers, buildID)
	}
	if pool.affinityTTL > 0 {
		pool.affinityTimers[buildID] = time.AfterFunc(pool.affinityTTL, func() {
			pool.unpinIfEpochCurrent(buildID, epoch)
		})
	}
}

// unpinIfEpochCurrent unpins buildID only if epoch still matches the current
// affinityEpoch — meaning no touchAffinityLocked has reset the timer since
// this AfterFunc was scheduled. Stale calls (post-touch fires) become no-ops.
func (pool *Pool) unpinIfEpochCurrent(buildID string, epoch uint64) {
	pool.mu.Lock()
	defer pool.mu.Unlock()
	if pool.affinityEpoch[buildID] != epoch {
		return
	}
	pool.unpinLocked(buildID)
}

// unpinLocked: remove all affinity bookkeeping for buildID. The underlying
// process is left alone.
func (pool *Pool) unpinLocked(buildID string) {
	proc, ok := pool.affinityProc[buildID]
	if !ok {
		return
	}
	delete(pool.affinityProc, buildID)
	delete(pool.affinityRev, proc)
	delete(pool.affinityLastUsed, buildID)
	if t, ok := pool.affinityTimers[buildID]; ok {
		t.Stop()
		delete(pool.affinityTimers, buildID)
	}
	// Drop the epoch entry too so long-running daemons handling many
	// distinct buildIDs don't accumulate stale keys. Safe because any
	// pending stale-timer goroutine captures the epoch by value, not
	// by map reference.
	delete(pool.affinityEpoch, buildID)
}

// Release returns a process to the idle pool and starts its idle timer.
func (pool *Pool) Release(proc *Process) {
	pool.mu.Lock()
	defer pool.mu.Unlock()

	pool.busy--

	if !proc.Alive() {
		return // dead, just drop it
	}

	pool.idle = append(pool.idle, proc)

	// Start idle timeout timer
	timer := time.AfterFunc(pool.idleTimeout, func() {
		pool.killIdle(proc)
	})
	pool.timers[proc] = timer
}

func (pool *Pool) killIdle(proc *Process) {
	pool.mu.Lock()
	defer pool.mu.Unlock()

	// Remove from idle list
	for i, idleProc := range pool.idle {
		if idleProc == proc {
			pool.idle = append(pool.idle[:i], pool.idle[i+1:]...)
			break
		}
	}
	delete(pool.timers, proc)

	// Clear any pin on this process so the affinity slot is released
	// immediately. Otherwise — when idleTimeout < affinityTTL — the
	// dead pin survives in affinityProc/Rev until the affinity timer
	// fires, wasting one of the pool's pin slots and triggering
	// needless LRU eviction logic in the meantime.
	if buildID, ok := pool.affinityRev[proc]; ok {
		pool.unpinLocked(buildID)
	}

	proc.Kill()
	pool.log.Info("killed idle PoB process", "idle", len(pool.idle), "busy", pool.busy)
}

// Stats returns pool statistics.
func (pool *Pool) Stats() (idle, busy, poolMax int) {
	pool.mu.Lock()
	defer pool.mu.Unlock()
	return len(pool.idle), pool.busy, pool.maxSize
}

// Shutdown kills all processes and clears all affinity state.
func (pool *Pool) Shutdown() {
	pool.mu.Lock()
	defer pool.mu.Unlock()

	for _, timer := range pool.timers {
		timer.Stop()
	}
	pool.timers = make(map[*Process]*time.Timer)

	for _, timer := range pool.affinityTimers {
		timer.Stop()
	}
	pool.affinityTimers = make(map[string]*time.Timer)
	pool.affinityProc = make(map[string]*Process)
	pool.affinityRev = make(map[*Process]string)
	pool.affinityLastUsed = make(map[string]time.Time)
	pool.affinityEpoch = make(map[string]uint64)

	for _, proc := range pool.idle {
		proc.Kill()
	}
	pool.idle = nil
}
