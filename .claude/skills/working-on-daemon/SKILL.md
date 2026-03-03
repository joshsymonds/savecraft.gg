---
name: working-on-daemon
description: Go daemon development conventions for Savecraft. Use when working on files in internal/, cmd/savecraftd/, or implementing daemon features like filesystem watching, plugin execution, WebSocket client, or push client. Triggers on Go daemon code, wazero, fsnotify, daemon interfaces, or daemon tests.
---

# Working on the Daemon

Read `docs/daemon.md` for the full architecture reference.

## Verification

After changes, run in order:

```bash
just fmt-go        # goimports
just lint-go       # staticcheck + go vet
just test-go       # unit tests
just test-go-race  # race detector (before committing)
```

## Interface Pattern

Every external dependency has an interface in `internal/daemon/`. Tests inject hand-written fakes. Real implementations live in separate packages and satisfy interfaces implicitly.

| Interface | Real impl | Fake location |
|-----------|-----------|---------------|
| `Watcher` | `internal/watcher/` | `internal/daemon/daemon_test.go` |
| `Runner` | `internal/runner/` | `internal/daemon/daemon_test.go` |
| `PushClient` | `internal/push/` | `internal/daemon/daemon_test.go` |
| `WSClient` | `internal/wsconn/` | `internal/daemon/daemon_test.go` |
| `FS` | `internal/osfs/` | `internal/daemon/daemon_test.go` |
| `PluginManager` | `internal/pluginmgr/` | `internal/daemon/daemon_test.go` |

**No mocking libraries.** Hand-written fakes that implement the same interface. Fakes go in `_test.go` files next to the code they test.

## Go Conventions

**Interface design:**
- Define interfaces where USED, not where implemented.
- Small: 1-3 methods, never more than 5. Accept interfaces, return concrete types.
- Constructor functions accept interfaces for dependencies.

**Type safety:**
- Never use `interface{}` or `any` unless absolutely required (JSON unmarshaling).
- Create specific types for different contexts (`SaveUUID`, `GameID`).

**Error handling:**
- Always wrap: `fmt.Errorf("context: %w", err)`. Check immediately, never ignore.
- Create sentinel errors for known conditions.

**Concurrency:**
- Use channels for synchronization, never `time.Sleep()`.
- Manage goroutine lifecycles with `context.Context` or `sync.WaitGroup`.

**Code style:**
- `context.Context` as first parameter on anything that blocks.
- Early returns to reduce nesting.
- Table-driven tests with `t.Run()` subtests, comprehensive coverage.
- No globals. Dependencies injected via struct fields, wired at `main()`.

**Never do:**
- Use `init()` for setup.
- Panic in libraries (only in `main()`).
- Use bare returns or `_` for unused parameters — remove them.
- Create versioned functions (`GetUserV2`) — delete the old one.
- Add `//nolint` comments — fix the issue.

## Plugin Execution

- wazero: pure Go WASM runtime. No CGO, no libc.
- WASI Preview 1 only (Preview 2 not supported by wazero).
- stdin/stdout pipes. Plugin reads save bytes from stdin, writes ndjson to stdout.
- 2MB hard cap on result line. Typical game state is 10-500KB.
- Plugin stdout parsed line-by-line in a goroutine while WASM runs.

## WebSocket Client

- `nhooyr.io/websocket` — context-aware, clean shutdown.
- Reconnect with exponential backoff: 1s → 2s → 4s → ... → 60s cap.
- Graceful degradation: if WS is down, daemon continues locally. Status events dropped, push API (HTTP) independent.

## Key Paths

```
internal/daemon/daemon.go       # Orchestrator, Run loop, event handling
internal/daemon/daemon_test.go  # Tests + all fakes
internal/runner/wazero.go       # WASM execution
internal/watcher/watcher.go     # fsnotify + debounce + hash
internal/push/client.go         # HTTP push client
internal/wsconn/client.go       # WebSocket client
cmd/savecraftd/main.go          # Entrypoint
```
