package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestPool(poolMax int, idleTimeout time.Duration) *Pool {
	return NewPool(poolMax, idleTimeout, "cat", "", ".", GamePoE, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// TestPoolAcquireSpawns tests that Acquire spawns a process using a simple cat process.
func TestPoolAcquireSpawns(t *testing.T) {
	pool := newTestPool(2, 5*time.Minute)

	proc, err := pool.Acquire()
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer proc.Kill()

	idle, busy, poolMax := pool.Stats()
	if idle != 0 || busy != 1 || poolMax != 2 {
		t.Fatalf("expected 0/1/2, got %d/%d/%d", idle, busy, poolMax)
	}

	pool.Release(proc)

	idle, busy, poolMax = pool.Stats()
	if idle != 1 || busy != 0 || poolMax != 2 {
		t.Fatalf("after release: expected 1/0/2, got %d/%d/%d", idle, busy, poolMax)
	}
}

// TestPoolExhausted tests that acquiring beyond max returns ErrPoolExhausted.
func TestPoolExhausted(t *testing.T) {
	pool := newTestPool(1, 5*time.Minute)

	proc, err := pool.Acquire()
	if err != nil {
		t.Fatalf("first acquire: %v", err)
	}
	defer proc.Kill()

	_, err = pool.Acquire()
	if !errors.Is(err, ErrPoolExhausted) {
		t.Fatalf("expected ErrPoolExhausted, got: %v", err)
	}
}

// TestPoolReuse tests that released processes are reused.
func TestPoolReuse(t *testing.T) {
	pool := newTestPool(2, 5*time.Minute)

	proc1, err := pool.Acquire()
	if err != nil {
		t.Fatal(err)
	}
	pool.Release(proc1)

	proc2, err := pool.Acquire()
	if err != nil {
		t.Fatal(err)
	}
	defer proc2.Kill()

	if proc1 != proc2 {
		t.Fatal("expected to reuse the same process")
	}
}

// TestPoolIdleTimeout tests that idle processes are killed after timeout.
func TestPoolIdleTimeout(t *testing.T) {
	pool := newTestPool(2, 50*time.Millisecond)

	proc, err := pool.Acquire()
	if err != nil {
		t.Fatal(err)
	}
	pool.Release(proc)

	// Wait for idle timeout to fire
	time.Sleep(150 * time.Millisecond)

	idle, busy, _ := pool.Stats()
	if idle != 0 || busy != 0 {
		t.Fatalf("expected 0/0 after idle timeout, got %d/%d", idle, busy)
	}
}

// TestPoolStampsGameOnSpawnedProcess verifies a Pool constructed for a
// given game tags every process it spawns with that game, so
// GamePool-level Release/Pin/SwapAffinity can route back to the correct
// underlying Pool without a separate lookup.
func TestPoolStampsGameOnSpawnedProcess(t *testing.T) {
	pool := NewPool(2, 5*time.Minute, "cat", "", ".", GamePoE2, slog.New(slog.NewTextHandler(io.Discard, nil)))

	proc, err := pool.Acquire()
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer proc.Kill()

	if proc.game != GamePoE2 {
		t.Fatalf("expected process game %q, got %q", GamePoE2, proc.game)
	}
}

// TestSpawnProcessSetsPobGameEnv verifies SpawnProcess exports POB_GAME
// into the subprocess environment — wrapper.lua reads this to select the
// per-game module path for the (renamed, in PoE2) trade-helpers module.
func TestSpawnProcessSetsPobGameEnv(t *testing.T) {
	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	mockScript := filepath.Join(t.TempDir(), "echo-game.sh")
	script := "#!/bin/sh\nread line\necho \"{\\\"type\\\":\\\"result\\\",\\\"data\\\":{\\\"game\\\":\\\"$POB_GAME\\\"}}\"\n"
	if err := os.WriteFile(mockScript, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	proc, err := SpawnProcess(context.Background(), bashPath, mockScript, ".", GamePoE2)
	if err != nil {
		t.Fatalf("spawn: %v", err)
	}
	defer proc.Kill()

	resp, err := proc.Send(map[string]string{"type": "ping"})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if !strings.Contains(string(resp), `"game":"poe2"`) {
		t.Fatalf("expected POB_GAME=poe2 to reach the subprocess, got: %s", resp)
	}
}

// TestPoolShutdown tests that Shutdown kills all processes.
func TestPoolShutdown(t *testing.T) {
	pool := newTestPool(4, 5*time.Minute)

	procs := make([]*Process, 3)
	for i := range procs {
		var err error
		procs[i], err = pool.Acquire()
		if err != nil {
			t.Fatal(err)
		}
	}
	for _, proc := range procs {
		pool.Release(proc)
	}

	idle, _, _ := pool.Stats()
	if idle == 0 {
		t.Fatal("expected at least 1 idle process after releasing 3")
	}

	pool.Shutdown()

	idle, busy, _ := pool.Stats()
	if idle != 0 || busy != 0 {
		t.Fatalf("after shutdown: expected 0/0, got %d/%d", idle, busy)
	}
}
