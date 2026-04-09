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
	"sync"
	"time"
)

// ErrPoolExhausted is returned when all processes are busy and the pool is at max size.
var ErrPoolExhausted = errors.New("all PoB processes are busy")

// Process represents a single persistent LuaJIT subprocess running wrapper.lua.
type Process struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Scanner
	stderr io.ReadCloser
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
	}
	proc.stdout.Buffer(make([]byte, 0, 64*1024), 4*1024*1024) // 4MB max line

	// Drain stderr in background
	go drainStderr(stderrPipe)

	return proc, nil
}

func drainStderr(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		// Log at debug level to avoid noise; PoB prints load progress here
		slog.Default().Debug("pob", "msg", scanner.Text())
	}
}

// Send sends a JSON request to the process and reads the JSON response.
func (proc *Process) Send(request any) (json.RawMessage, error) {
	data, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	data = append(data, '\n')
	if _, err := proc.stdin.Write(data); err != nil {
		return nil, fmt.Errorf("write to process: %w", err)
	}

	if !proc.stdout.Scan() {
		if scanErr := proc.stdout.Err(); scanErr != nil {
			return nil, fmt.Errorf("read from process: %w", scanErr)
		}
		return nil, fmt.Errorf("process closed stdout unexpectedly")
	}

	return json.RawMessage(proc.stdout.Bytes()), nil
}

// Kill terminates the subprocess.
func (proc *Process) Kill() {
	proc.stdin.Close()
	_ = proc.cmd.Process.Kill()
	_ = proc.cmd.Wait()
}

// Alive checks if the subprocess is still running.
func (proc *Process) Alive() bool {
	return proc.cmd.ProcessState == nil // nil means not yet exited
}

// Pool manages a lazy pool of PoB LuaJIT processes.
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
}

// NewPool creates a new lazy process pool.
func NewPool(poolMax int, idleTimeout time.Duration, luajitBin, wrapperPath, pobDir string, logger *slog.Logger) *Pool {
	return &Pool{
		maxSize:     poolMax,
		idleTimeout: idleTimeout,
		luajitBin:   luajitBin,
		wrapperPath: wrapperPath,
		pobDir:      pobDir,
		log:         logger,
		timers:      make(map[*Process]*time.Timer),
	}
}

// Acquire returns an idle process, spawns a new one if under max, or returns ErrPoolExhausted.
func (pool *Pool) Acquire() (*Process, error) {
	pool.mu.Lock()
	defer pool.mu.Unlock()

	// Try to grab an idle process
	for len(pool.idle) > 0 {
		proc := pool.idle[len(pool.idle)-1]
		pool.idle = pool.idle[:len(pool.idle)-1]

		// Cancel its idle timer
		if timer, ok := pool.timers[proc]; ok {
			timer.Stop()
			delete(pool.timers, proc)
		}

		// Check it's still alive
		if proc.Alive() {
			pool.busy++
			return proc, nil
		}
		// Dead process, discard it
	}

	// No idle processes — can we spawn a new one?
	total := len(pool.idle) + pool.busy
	if total >= pool.maxSize {
		return nil, ErrPoolExhausted
	}

	pool.busy++
	pool.mu.Unlock()

	proc, err := SpawnProcess(context.Background(), pool.luajitBin, pool.wrapperPath, pool.pobDir)
	if err != nil {
		pool.mu.Lock()
		pool.busy--
		return nil, fmt.Errorf("spawn process: %w", err)
	}

	pool.mu.Lock()
	return proc, nil
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

	proc.Kill()
	pool.log.Info("killed idle PoB process", "idle", len(pool.idle), "busy", pool.busy)
}

// Stats returns pool statistics.
func (pool *Pool) Stats() (idle, busy, poolMax int) {
	pool.mu.Lock()
	defer pool.mu.Unlock()
	return len(pool.idle), pool.busy, pool.maxSize
}

// Shutdown kills all processes.
func (pool *Pool) Shutdown() {
	pool.mu.Lock()
	defer pool.mu.Unlock()

	for _, timer := range pool.timers {
		timer.Stop()
	}
	pool.timers = make(map[*Process]*time.Timer)

	for _, proc := range pool.idle {
		proc.Kill()
	}
	pool.idle = nil
}
