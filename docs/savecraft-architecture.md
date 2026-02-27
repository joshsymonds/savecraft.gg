# Savecraft Architecture Document

## Overview

Savecraft is a platform that parses video game save files and exposes structured game state to AI assistants via MCP (Model Context Protocol). It enables AI conversations like "what's my Hammerdin's gear?" or "am I on track for Perfection in Stardew?" by giving Claude, ChatGPT, and Gemini access to actual save file data — not screenshots, not memory dumps, but the full structured state.

**Domains:** savecraft.gg (primary), savecraft.ai (redirect)
**Parent company:** Autotome.ai

## System Architecture

Savecraft has two fully separate components that share a user account and a data contract.

```
┌─────────────────────┐         ┌──────────────────────────────┐
│   Gaming Device      │         │   Cloud (Cloudflare)         │
│   (PC / Steam Deck)  │         │                              │
│                      │  HTTPS  │  ┌────────────────────────┐  │
│  ┌────────────────┐  │ ──────> │  │  Push API (Worker)     │  │
│  │  Daemon         │  │  POST  │  │  - validates JSON      │  │
│  │  - fs watcher   │  │        │  │  - writes to R2        │  │
│  │  - WASM runtime │  │        │  └────────────────────────┘  │
│  │  - plugin loader│  │        │                              │
│  └────────────────┘  │        │  ┌────────────────────────┐  │
│                      │        │  │  R2 Object Store       │  │
│  Save files:         │        │  │  - snapshots (immutable)│  │
│  - D2R .d2s          │        │  │  - latest.json (ptr)   │  │
│  - Stardew XML       │        │  │  - plugins (.wasm)     │  │
│  - etc.              │        │  └────────────────────────┘  │
└─────────────────────┘         │                              │
                                │  ┌────────────────────────┐  │
┌─────────────────────┐         │  │  MCP Server (Worker)   │  │
│   AI Client          │  HTTPS  │  │  - OAuth via Clerk     │  │
│   (Claude, ChatGPT,  │ <────> │  │  - serves MCP tools    │  │
│    Gemini)           │  MCP   │  │  - reads from R2       │  │
└─────────────────────┘         │  └────────────────────────┘  │
                                │                              │
                                │  ┌────────────────────────┐  │
                                │  │  D1 (SQLite at edge)   │  │
                                │  │  - user accounts       │  │
                                │  │  - device configs      │  │
                                │  │  - plugin registry     │  │
                                │  └────────────────────────┘  │
                                └──────────────────────────────┘
```

### Component 1: Local Daemon

Runs on the gaming device (Windows PC, Linux PC, Steam Deck). Background process that watches save file directories, parses saves using WASM plugins, and pushes structured JSON to the cloud API. Maintains a persistent WebSocket connection to a per-user Durable Object for real-time config updates and status reporting.

- **No MCP involvement.** Pure background service.
- **Windows:** MSI installer + Windows Service. Service runs on startup, restarts on crash. EV code-signed to avoid SmartScreen warnings.
- **macOS:** `.pkg` installer + launchd service. Notarized via Apple Developer account for Gatekeeper.
- **Linux / Steam Deck:** Static binary installed to `~/.local/bin/` + systemd user unit (`systemctl --user enable savecraft`). Sandboxed via systemd directives (read-only filesystem access, no privilege escalation). See [Daemon Sandboxing](#daemon-sandboxing).
- **Configuration:** All configuration happens via the web interface at savecraft.gg/settings. Config changes push to daemon in real time via WebSocket. Per-device configs stored server-side in D1.

### Component 2: Remote MCP Server

Cloud-hosted HTTPS endpoint that serves game state to AI clients. This is a standard remote MCP server — Claude, ChatGPT, and Gemini connect directly via their built-in MCP connector/plugin systems.

- **Claude.ai:** Custom connector via Settings → Connectors → "Add custom connector." Requires OAuth with Dynamic Client Registration (RFC 7591) + PKCE.
- **ChatGPT:** Developer Mode on Business/Enterprise/Edu. Remote MCP via SSE/HTTP with OAuth.
- **Gemini:** CLI and SDK support OAuth for remote servers.

### Shared Server Binary

The daemon push API and MCP server run as a **single Cloudflare Worker** (or single Go binary if self-hosted). Two route groups on the same deployment:

- `/api/v1/*` — Daemon push API (authenticated via API key/bearer token)
- `/api/v1/notes/*` — Note CRUD for web UI and MCP write tools (authenticated via Clerk session or OAuth)
- `/mcp/*` — MCP tool-serving endpoint (authenticated via OAuth)
- `/ws/daemon` — WebSocket upgrade for daemon real-time connection (authenticated via bearer token, routed to per-user Durable Object)
- `/ws/ui` — WebSocket upgrade for web UI live status (authenticated via Clerk session, routed to same per-user Durable Object)
- `/.well-known/oauth-protected-resource` — OAuth discovery metadata

This is not microservices. One binary, shared auth middleware, shared R2 client. The Durable Object is a separate class in the same Worker bundle.

## Repository Structure

Monorepo. Single Go module.

```
savecraft/
├── proto/
│   └── savecraft/v1/
│       └── protocol.proto       # Canonical WebSocket message types (protobuf)
├── buf.yaml                     # buf module config
├── buf.gen.yaml                 # buf codegen config (Go + TypeScript targets)
├── Justfile                     # Command runner targets
├── cmd/
│   └── savecraftd/              # Local daemon binary
│       └── main.go
├── internal/
│   ├── proto/                   # Generated Go code from protobuf (do not edit)
│   │   └── savecraft/v1/
│   │       └── protocol.pb.go
│   ├── daemon/                  # Daemon orchestrator, domain types (GameState), interfaces
│   │   ├── daemon.go            # Daemon struct, Run loop, event handling
│   │   └── daemon_test.go       # Tests with hand-written fakes
│   ├── runner/                  # WASM plugin execution via wazero
│   │   └── wazero.go            # WazeroRunner: ndjson stdout parsing, 2MB limit
│   ├── watcher/                 # Filesystem watcher: fsnotify + debounce + hash
│   │   └── watcher.go
│   ├── push/                    # HTTP client for /api/v1/push
│   │   └── client.go
│   └── wsconn/                  # WebSocket client for /ws/daemon
│       └── client.go
├── worker/                      # Cloudflare Worker + Durable Object (TypeScript)
│   ├── src/
│   │   ├── index.ts             # Worker routes, request handling
│   │   ├── hub.ts               # SaveHub Durable Object class (WebSocket relay + API fetch coordinator)
│   │   ├── adapters/            # Server-side game adapters (API-backed saves)
│   │   │   └── poe2.ts          # Path of Exile 2 adapter (GGG API)
│   │   └── proto/               # Generated TypeScript from protobuf (do not edit)
│   │       └── savecraft/v1/
│   │           └── protocol.ts
│   ├── wrangler.toml
│   └── package.json
├── plugins/
│   ├── echo/                    # Reference/test plugin: reflects input as GameState
│   │   ├── main.go
│   │   └── Justfile             # just build → echo.wasm
│   └── d2r/                     # D2R parser source (compiles to .wasm)
│       ├── main.go              # stdin→parse→stdout (ndjson)
│       ├── parser.go            # d2s format parsing
│       ├── items.go             # Item decoding with lookup tables
│       └── Justfile             # just build → d2r.wasm
├── install/
│   ├── install.sh               # Linux/Steam Deck curl installer
│   ├── savecraft.service        # systemd user unit template
│   └── build/                   # MSI (WiX), .pkg, signing scripts
├── web/                         # SvelteKit frontend: device status, settings, notes
├── go.mod
└── go.sum
```

Cross-compilation for daemon:
```bash
GOOS=windows GOARCH=amd64 go build -o savecraft-daemon.exe ./cmd/savecraftd
GOOS=linux GOARCH=amd64 go build -o savecraft-daemon-linux ./cmd/savecraftd
GOOS=linux GOARCH=arm64 go build -o savecraft-daemon-deck ./cmd/savecraftd
```

Go `internal/` packages are daemon-only. The server is a TypeScript Cloudflare Worker (`worker/`), not a Go binary.

## WASM Plugin System

### Why WASM

- **Cross-platform:** One .wasm binary works on Windows x86, Linux x86, Linux ARM (Steam Deck). No per-platform compilation for plugins.
- **Sandboxed:** Plugins cannot access filesystem, network, or environment. They process bytes the daemon feeds them via stdin and emit JSON to stdout. Structurally impossible to exfiltrate data.
- **Community-friendly:** Contributors write parsers in Go (or Rust/Zig), compile to WASM. Same toolchain as the daemon for Go plugins.
- **Language-agnostic build:** Each plugin provides a `Justfile` with a `just build` target that produces a `.wasm` file in the plugin directory. The top-level `just build-plugin <name>` delegates to the plugin's own build. The daemon doesn't care what language the plugin is written in — only that it speaks WASI Preview 1 with the ndjson contract.

### Runtime: wazero

Pure-Go WASM runtime. No CGO, no libc, no external dependencies. Supports WASI Preview 1 (the stable, widely-implemented version). wazero compiles WASM to native machine code at load time for near-native performance.

WASI Preview 2 (Component Model) is not used — wazero doesn't support it yet, and Preview 1 is sufficient for the stdin/stdout contract.

### Plugin Contract: ndjson on stdout via WASI

Plugins are compiled as WASI executables. The daemon feeds raw save file bytes on stdin. The plugin writes newline-delimited JSON (ndjson) to stdout. No manual memory management, no malloc/free exports, no pointer arithmetic.

**Input:** Raw save file bytes on stdin.

**Output:** Newline-delimited JSON on stdout. Every line is a JSON object with a `type` field:

- `"status"` — Progress update. Optional. Plugin authors emit these for long-running or multi-step parses. The daemon forwards them to the UI via WebSocket.
- `"result"` — Final GameState output. **Required on exit code 0.** Must be the last line.
- `"error"` — Structured error. **Required on exit code 1.** Must be the last line.

**stderr** is for unstructured debug logging. The daemon captures it for diagnostics but does not parse it.

**Status line:**
```json
{"type": "status", "message": "Found 3 save files in directory"}
{"type": "status", "message": "Decoding inventory (247 items)"}
```

**Result line (success, exit code 0):**
```json
{"type": "result", "identity": {...}, "summary": "...", "sections": {...}}
```

**Error line (failure, exit code 1):**
```json
{"type": "error", "error_type": "corrupt_file", "message": "Human-readable description", "byte_offset": 1234}
```

Valid `error_type` values: `unsupported_version`, `corrupt_file`, `parse_error`.

**Plugin Go source example (D2R):**

```go
// plugins/d2r/main.go
// Build: just build (see plugins/d2r/Justfile)
package main

import (
    "encoding/json"
    "io"
    "os"
)

var enc = json.NewEncoder(os.Stdout)

func main() {
    data, err := io.ReadAll(os.Stdin)
    if err != nil {
        writeError("parse_error", "failed to read stdin: "+err.Error())
        os.Exit(1)
    }

    enc.Encode(map[string]string{"type": "status", "message": "Read " + fmt.Sprintf("%d", len(data)) + " bytes"})

    state, err := ParseD2S(data)
    if err != nil {
        writeError("corrupt_file", err.Error())
        os.Exit(1)
    }

    // Emit the final result line
    enc.Encode(map[string]any{
        "type":     "result",
        "identity": state.Identity,
        "summary":  state.Summary,
        "sections": state.Sections,
    })
}

func writeError(errType, message string) {
    enc.Encode(map[string]string{
        "type":       "error",
        "error_type": errType,
        "message":    message,
    })
}
```

Simple plugins that don't need progress updates just emit a single result line. The status lines are optional.

**Reference plugin (echo):** `plugins/echo/` is a minimal plugin that reads stdin and reflects its content back as a GameState. It validates the ndjson contract and wazero integration end-to-end without any game-specific logic. Tests use it to verify the runner, status forwarding, and error paths.

**Daemon-side execution with wazero:**

```go
// Pseudocode for plugin execution
ctx := context.Background()
r := wazero.NewRuntime(ctx)
wasi_snapshot_preview1.MustInstantiate(ctx, r)

// stdout is a pipe — daemon reads ndjson lines as they arrive
stdoutR, stdoutW := io.Pipe()
var stderr bytes.Buffer

config := wazero.NewModuleConfig().
    WithStdin(bytes.NewReader(saveFileBytes)).
    WithStdout(stdoutW).
    WithStderr(&stderr)

// Read stdout lines in a goroutine
go func() {
    scanner := bufio.NewScanner(stdoutR)
    for scanner.Scan() {
        line := scanner.Bytes()
        msg := parsePluginLine(line)
        switch msg.Type {
        case "status":
            // Forward to WebSocket as PluginStatus event
            ws.Send(PluginStatus{GameID: gameID, FileName: fileName, Message: msg.Message})
        case "result":
            // Store as the final GameState
            gameState = msg.GameState
        case "error":
            // Store as the parse error
            parseErr = msg.Error
        }
    }
}()

mod, err := r.InstantiateWithConfig(ctx, pluginWasm, config)
stdoutW.Close()
// Check exit code, use gameState or parseErr
```

**Size limit:** The daemon enforces a 2MB hard cap on the result line. If a plugin emits a result larger than 2MB, the daemon treats it as a parse error and logs a warning. Typical game state JSON is 10-500KB.

### Plugin Metadata (`plugin.toml`)

Each production plugin has a `plugin.toml` in its directory — the single source of truth for plugin metadata. Test plugins (echo, error, noop, crash) are dev-only and have no `plugin.toml`.

```toml
game_id = "d2r"
name = "Diablo II: Resurrected"
description = "Parses .d2s character save files from Reign of the Warlock (v105)"
version = "0.0.1"
channel = "beta"                          # "beta" or "stable"
coverage = "partial"                      # "partial" or "full"
file_extensions = [".d2s"]
homepage = "https://savecraft.gg/plugins/d2r"

limitations = [
  "Shared stash (.d2i) not yet supported",
  "Only Reign of the Warlock (v105) saves — classic LoD not supported",
]

[author]
name = "Josh Symonds"
github = "joshsymonds"

[default_paths]
windows = "%USERPROFILE%/Saved Games/Diablo II Resurrected"
linux = "~/.local/share/Diablo II Resurrected"
darwin = "~/Library/Application Support/Diablo II Resurrected"
```

**Field reference:**

| Field | Required | Description |
|-------|----------|-------------|
| `game_id` | yes | Unique identifier, matches plugin directory name |
| `name` | yes | Human-readable game title |
| `description` | yes | What the plugin parses |
| `version` | yes | Semver. Bump to trigger a plugin release |
| `channel` | yes | `"beta"` or `"stable"` — daemon can filter by channel |
| `coverage` | yes | `"partial"` (known limitations) or `"full"` |
| `file_extensions` | yes | Save file extensions this plugin handles |
| `homepage` | no | URL for plugin documentation |
| `limitations` | no | Known gaps, shown in UI and MCP responses |
| `author.name` | yes | Plugin author's display name |
| `author.github` | yes | GitHub username |
| `default_paths` | yes | Per-OS default save directory (env vars and `~` expanded by daemon) |

The daemon resolves environment variables and `~` in default paths at startup. If a declared path exists, it auto-configures. The user can override paths via the web settings UI; overrides are stored per-device in D1.

### Plugin Manifest (`manifest.json`)

`manifest.json` is a **generated** artifact — never hand-edited. The `cmd/plugin-manifest/` Go tool reads `plugin.toml`, computes the sha256 of the built `.wasm` binary, and writes `manifest.json` with all fields plus `sha256` and `url`. This manifest is uploaded to R2 alongside the signed WASM binary.

```
just plugin-manifest d2r          # generate plugins/d2r/manifest.json
just build-plugin d2r             # build the .wasm first
```

The manifest endpoint `GET /api/v1/plugins/manifest` returns all fields from R2 — version, sha256, name, description, channel, coverage, file_extensions, default_paths, limitations, author, homepage — plus a resolved download URL. The worker passes through whatever the manifest contains with no filtering.

### Plugin Distribution

Plugins are hosted alongside their manifests in R2:

```
plugins/{game_id}/manifest.json
plugins/{game_id}/parser.wasm
plugins/{game_id}/parser.wasm.sig
```

**Polling:** Daemon checks `GET /api/v1/plugins/manifest` on startup and every 24 hours. Response is a JSON object mapping game IDs to plugin metadata (version, sha256, url, plus all `plugin.toml` fields). Daemon compares local versions, downloads updates as needed.

**Signing:** Every `.wasm` binary is signed with an Ed25519 private key held by Savecraft (`SIGNING_PRIVATE_KEY` in GitHub Actions secrets, base64-encoded raw 32-byte key). A `.sig` file ships alongside each `.wasm`. The daemon has the public key baked in (`internal/signing/signing_key.pub`) and verifies signatures before loading. Unsigned or tampered modules are refused.

**Trust model:** Community contributors submit PRs with parser source code to the `plugins/` directory in the monorepo. Maintainer reviews source code and merges. Release pipeline builds the WASM, signs the binary, and uploads to R2. Same model as Linux package signing.

## Server-Side Game Adapters

### Why Not WASM

The daemon plugin model is designed around local file parsing: read bytes from stdin, write ndjson to stdout, no network, no secrets, no ambient authority. API-backed games (PoE2, WoW via Battle.net, FFXIV) break every one of those constraints:

- **Network access** to hit game APIs
- **Secrets** (OAuth tokens, API keys) that should never touch the user's machine
- **Rate limiting / retry logic** better handled server-side
- **No daemon dependency** — the whole point of API games is the user doesn't need local software

These are not plugins. They're **server-side game adapters**: TypeScript modules that run in the SaveHub DO, with access to credentials and outbound `fetch()`.

### Adapter Interface

```typescript
interface GameAdapter {
  gameId: string;
  gameName: string;
  fetchSave(credentials: GameCredentials, characterId?: string): Promise<GameState>;
  listCharacters(credentials: GameCredentials): Promise<CharacterInfo[]>;
}

interface GameCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface CharacterInfo {
  characterId: string;
  name: string;
  summary: string;  // e.g. "Level 95 Witch — Occultist"
}
```

Each adapter is a plain TypeScript module in `worker/src/adapters/`. No WASM, no sandbox, no signing. They're first-party server code, deployed with the Worker.

The output is the same `GameState` shape that daemon plugins produce — sections with arbitrary JSON per game. R2 storage, D1 metadata, MCP tools, search — all identical downstream.

### Credential Management

Game API credentials are stored in D1, encrypted at rest with a Worker-level secret (`CREDENTIAL_KEY` in `wrangler.toml` secrets).

```sql
CREATE TABLE game_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,    -- encrypted
  refresh_token_enc TEXT,            -- encrypted, nullable
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_uuid) REFERENCES users(uuid),
  UNIQUE(user_uuid, game_id)
);
```

**OAuth flows:** Each game has its own OAuth provider (Battle.net, GGG, etc.). The web UI initiates the OAuth dance, the Worker handles the callback, and the resulting tokens are encrypted and stored. Token refresh happens automatically when the adapter detects expiry.

**No tokens on the user's machine.** The daemon never sees game API credentials. This is a security advantage — a compromised daemon can't leak OAuth tokens for games it doesn't even handle.

### Refresh Flow

When `refresh_save` targets an API-backed save:

```
MCP client → Worker → SaveHub DO → adapter.fetchSave(credentials, characterId)
                                  → game API (e.g. api.pathofexile.com)
                                  ← GameState JSON
                                  → write to R2 (same layout as daemon pushes)
                                  → update D1 metadata (save row, summary)
                                  → emit status event to UI WebSocket
                                  ← { refreshed: true, timestamp: "..." }
```

The SaveHub emits the same status event types as daemon-backed parses (`ParseStarted`, `ParseCompleted`, etc.) so the UI activity feed renders identically.

### Rate Limiting

Game APIs have rate limits (GGG: ~45 req/min, Battle.net: varies by endpoint). Adapters must respect these. Since adapters run in the SaveHub DO (one per user, single-threaded), there's a natural serialization per user. Cross-user rate limiting (shared API key limits) requires a separate rate limiter — a small DO keyed by game ID that tracks request counts.

## Data Schema

### GameState (plugin output)

All plugins emit a `result` line on stdout conforming to this structure (the `type: "result"` field is stripped by the daemon before storage):

**Character save** (most common — one save per character/playthrough):

```json
{
  "identity": {
    "character_name": "Hammerdin",
    "game_id": "d2r",
    "extra": {
      "class": "Paladin",
      "level": 89
    }
  },
  "summary": "Hammerdin, Level 89 Paladin",
  "sections": {
    "character_overview": {
      "description": "Level, class, difficulty, play time",
      "data": {
        "name": "Hammerdin",
        "class": "Paladin",
        "level": 89,
        "experience": 2345678901,
        "difficulty": "Hell",
        "play_time": 86400,
        "strength": 156,
        "dexterity": 75,
        "vitality": 300,
        "energy": 15
      }
    },
    "equipped_gear": {
      "description": "All equipped items with stats, sockets, runewords",
      "data": {
        "helmet": { "name": "Harlequin Crest", "base": "Shako", "...": "..." },
        "body_armor": { "name": "Enigma", "base": "Mage Plate", "...": "..." }
      }
    }
  }
}
```

**Game save** (shared state across all characters — shared stash, meta-progression, unlocks):

```json
{
  "identity": {
    "game_id": "d2r"
  },
  "summary": "Shared Stash (3 tabs, 47 items)",
  "sections": {
    "stash": {
      "description": "Shared stash contents across all characters",
      "data": { "tabs": [ { "items": ["..."] } ] }
    }
  }
}
```

When `character_name` is omitted from `identity`, the save is game-scoped: one per `(user_uuid, game_id)`. Character saves and game saves use the same sections model, same R2 storage, same MCP tools. The distinction is purely identity cardinality. Examples of game-level state: D2R shared stash, Hades mirror upgrades, Dead Cells unlocked blueprints, roguelite meta-progression.

**Design principles:**

- **Self-describing.** Every section carries a `description` field. The AI uses these to decide which sections to request.
- **Section-level granularity.** Stardew Valley farm state can be megabytes. The AI requests only the sections it needs for the question.
- **Plugin-defined schema.** The server does not validate section contents. Each game's sections have different shapes. The plugin is the authority on what data looks like.
- **No cross-game normalization.** D2R gear and Stardew crops are fundamentally different data. Attempting to normalize into a universal schema would lose information and add complexity for zero benefit.
- **Plugin-authored summaries.** The `summary` field is a human-readable display string authored by the plugin. The plugin knows what matters for its game. Examples: `"Hammerdin, Level 89 Paladin"` (D2R), `"Berry Merry Farm, Year 3 Fall — 69% Perfection"` (Stardew), `"Emperor Halfdan of Scandinavia, 847 AD"` (CK3). The server stores summaries in D1 for fast UI rendering and MCP tool responses.
- **Two identity scopes.** Character saves are identified by `(user_uuid, game_id, character_name)`. Game saves are identified by `(user_uuid, game_id)` with no character name. The plugin decides which scope applies by including or omitting `character_name` in the identity block.

### R2 Object Layout

```
users/{user_uuid}/saves/{save_uuid}/snapshots/{timestamp}.json
users/{user_uuid}/saves/{save_uuid}/latest.json
plugins/{game_id}/manifest.json
plugins/{game_id}/parser.wasm
plugins/{game_id}/parser.wasm.sig
```

- **Snapshots are immutable.** Every push creates a new timestamped object.
- **`latest.json`** is a copy of the most recent snapshot for fast reads. Updated only if the incoming `parsed_at` timestamp is newer than the current latest (prevents race conditions from out-of-order pushes).
- **Save UUID** is assigned by the server when a save is first pushed. The daemon includes the plugin's identity block in the push. The server resolves identity to a save UUID in D1:
  - **Character saves:** `(user_uuid, game_id, character_name)` — one save per character.
  - **Game saves:** `(user_uuid, game_id)` where `character_name` is NULL — one save per game for shared state.

  D1 enforces uniqueness via partial indexes: `UNIQUE(user_uuid, game_id) WHERE character_name IS NULL` and `UNIQUE(user_uuid, game_id, character_name) WHERE character_name IS NOT NULL`. All subsequent pushes for the same identity map to the same save UUID.
- **User UUID** is assigned at account creation. All R2 access scoped to `users/{user_uuid}/`.

### Historical Data and Diffs

- Every push is timestamped and stored as an immutable snapshot.
- Retention policy: TBD. For now, keep everything. Will implement time-based thinning later (every save for a week, daily for a month, weekly beyond).
- MCP tools support optional `timestamp` parameter for point-in-time queries.
- Diff tool: `get_section_diff(save_id, section, from_timestamp, to_timestamp)` returns changed fields.

## Daemon Behavior

### Architecture: Interface-Driven with Fakes

The daemon orchestrator (`internal/daemon/`) defines interfaces for all external dependencies: `Watcher`, `Runner`, `PushClient`, `WSClient`, `FS`. Tests inject hand-written fakes. Real implementations live in separate packages (`internal/runner/`, `internal/watcher/`, etc.) and satisfy the interfaces implicitly.

The `Daemon.Run()` loop: connect WebSocket → send `DaemonOnline` → scan configured games → enter event loop (file events, WS commands, context cancellation). On shutdown, send `DaemonOffline`.

### Filesystem Watching

The daemon uses fsnotify to watch save file directories.

**Debounce + hash strategy:**

1. fsnotify fires a write/rename/create event for a watched file extension.
2. Start a 500ms debounce timer. Reset on subsequent events within the window.
3. When timer expires, SHA-256 the file.
4. If hash matches last successfully parsed hash, skip (no change).
5. If hash differs, read file bytes and feed to WASM plugin.
6. If plugin returns success (exit 0), push JSON to cloud API. Store hash as last-known-good.
7. If plugin returns error (exit 1), log the error and wait for next event. The game probably hasn't finished writing yet.

This handles:
- **Temp-file-rename pattern** (most games): rename event → debounce → hash → parse. Clean.
- **In-place write pattern** (some games): multiple write events → debounce waits for writes to stop → parse.
- **Partial write corruption:** parser errors → daemon retries on next event.
- **Steam Cloud sync overwrites:** treated the same as any save change. No special handling needed.

### Save Directory Discovery

1. On startup, daemon fetches its device config from the server (includes any user-set path overrides).
2. For each installed plugin, resolve manifest's `save_paths` for the current OS (expand env vars, `~`).
3. If a path exists on disk, register it for watching.
4. User-set overrides from web UI take precedence over manifest defaults.
5. If no path found for a game, skip it (game not installed on this device).

### Plugin Loading

1. On startup and every 24 hours, daemon fetches plugin registry from `/api/v1/plugins/manifest`.
2. For each plugin: compare local version to registry version.
3. If update available: download `.wasm` and `.sig` from registry URLs.
4. Verify Ed25519 signature against baked-in public key. Refuse unsigned/tampered binaries.
5. Replace local `.wasm` file. Re-initialize wazero module for that game.
6. Plugin binaries cached locally (e.g., `~/.savecraft/plugins/d2r/parser.wasm`).

## Push API

### `POST /api/v1/push`

Daemon pushes parsed game state to the cloud.

**Headers:**
```
Authorization: Bearer <daemon-api-token>
Content-Type: application/json
X-Game: d2r
X-Parsed-At: 2026-02-25T21:30:00Z
```

**Body:** Full GameState JSON (all sections in one push). The `identity` block in the body is used by the server to resolve or create the save UUID.

**Server validation:**
1. Authenticate token → resolve user UUID.
2. Validate: is body valid JSON? Is it under 5MB?
3. Validate structure: does top-level have `identity` and `sections` keys?
4. Validate `X-Game` matches a known plugin.
5. Look up save UUID from identity in D1. If `character_name` is present: `(user_uuid, game_id, character_name)`. If absent: `(user_uuid, game_id)` with `character_name IS NULL`. Create if first push.
6. Write snapshot to `users/{user_uuid}/saves/{save_uuid}/snapshots/{timestamp}.json` in R2.
7. Compare `X-Parsed-At` to current `latest.json` timestamp. Only update latest pointer if incoming is newer.
8. Re-index save sections in FTS5 (DELETE old rows for this save, INSERT new rows per section).

**Response:** `201 Created` with save UUID and snapshot timestamp, or appropriate error.

**Why single push, not per-section:**
- Most game states are 10-500KB of JSON. Overhead is negligible.
- One push = one atomic snapshot. No partial state, no ordering issues, no "daemon crashed mid-section-push."
- Simpler daemon code, simpler server code, simpler mental model.

## Real-Time Communication

### Overview

The daemon and web UI maintain persistent WebSocket connections to a per-user Durable Object (DO) that acts as a message hub. This enables real-time config delivery, live status reporting, and an interactive setup experience where users see immediate feedback as the daemon discovers and parses saves.

### Architecture: SaveHub Durable Object

Each user gets a single Durable Object (`SaveHub`), keyed by user UUID (`env.SAVE_HUB.get(env.SAVE_HUB.idFromName(userUUID))`). The SaveHub is the per-user coordination point for all save updates, regardless of source.

**Two roles:**

1. **WebSocket relay** for daemon-backed saves. Holds up to two tagged WebSocket connections:
   - **`"daemon"` connection:** One per device. The daemon connects on startup and maintains the connection for the lifetime of the process.
   - **`"ui"` connection:** One per active web UI session. The browser connects when the user opens the device status page and disconnects when they navigate away.
   - Receives messages from one side, inspects the tag, forwards to the other. For `refresh_save` on daemon-backed games, sends `RescanGame` to the daemon.

2. **API fetch coordinator** for API-backed saves. When `refresh_save` targets an API-backed game, the SaveHub calls the game adapter directly — fetches from the game API, shapes the response into GameState, writes to R2, and updates D1. Status events flow to the UI WebSocket the same as daemon events ("Fetching PoE2 character…", "Updated PoE2 character ✓").

When no connections are active and no fetches are in progress, the DO hibernates and incurs zero cost.

**Why one DO per user (not shared):** Durable Objects are actors — single-threaded, pinned to a region. A shared DO serving 500 users would need internal routing tables and creates a single point of failure. Per-user DOs have zero routing logic, zero cross-user concerns, and cost nothing when idle thanks to WebSocket Hibernation. Cloudflare designed DOs for the "millions of tiny actors" pattern; the billing model assumes it.

### WebSocket Hibernation

The DO uses Cloudflare's WebSocket Hibernation API. The platform holds WebSocket connections at the infrastructure level while the DO sleeps. The DO only wakes when an application-level message arrives. Protocol-level pings/pongs (keepalive) are handled by Cloudflare automatically and do not wake the DO.

Critical: no application-layer heartbeats. The UI must not send periodic pings. WebSocket protocol keepalive handles liveness. Application messages are the only things that wake the DO.

### Message Protocol

All messages are protobuf-defined with JSON encoding on the wire. The canonical schema lives in `proto/protocol.proto`. Go types are generated to `internal/proto/`, TypeScript types to `worker/src/proto/`. No mirrored types — both languages codegen from the same `.proto` file via `buf generate`.

Messages use a protobuf `oneof` envelope (`Message.payload`). Field numbers are grouped by category with gaps for future additions. Each side processes the variants it cares about and ignores the rest.

**Save data does not flow through the WebSocket.** The daemon pushes parsed GameState JSON to the server via HTTP POST (`/api/v1/push`). The WebSocket carries only lightweight status events (~200 bytes each). This keeps the Durable Object cheap and simple — it relays small messages and hibernates, never processing multi-KB payloads.

**Full lifecycle for a save update (daemon → server → UI):**

```
ScanStarted       → "Scanning /home/deck/.local/share/D2R/..."
ScanCompleted     → "Found 3 files: Hammerdin.d2s, Sorceress.d2s, SharedStash.d2i"
ParseStarted      → "Parsing Hammerdin.d2s..."
PluginStatus      → "Decoding inventory (247 items)"     [optional, from plugin stdout]
ParseCompleted    → "Parsed: Hammerdin, Level 89 Paladin (8 sections, 47KB)"
PushStarted       → "Uploading Hammerdin (47KB)..."
PushCompleted     → "✓ Uploaded Hammerdin (47KB) in 340ms"
```

**On parse failure:**

```
ParseStarted      → "Parsing SharedStash.d2i..."
ParseFailed       → "✗ Parse failed: unsupported format version 0x62"
```

**On push failure with retry:**

```
PushStarted       → "Uploading Hammerdin (47KB)..."
PushFailed        → "✗ Upload failed: 503 — will retry in 2s"
PushStarted       → "Uploading Hammerdin (47KB)..."
PushCompleted     → "✓ Uploaded Hammerdin (47KB) in 280ms"
```

**Message categories:**

| Range | Direction | Category | Messages |
|-------|-----------|----------|----------|
| 1-9 | daemon → server | Daemon lifecycle | `DaemonOnline`, `DaemonOffline` |
| 10-19 | daemon → server | Game discovery | `ScanStarted`, `ScanCompleted`, `GameDetected`, `GameNotFound`, `Watching` |
| 20-29 | daemon → server | Parse lifecycle | `ParseStarted`, `PluginStatus`, `ParseCompleted`, `ParseFailed` |
| 30-39 | daemon → server | Push lifecycle | `PushStarted`, `PushCompleted`, `PushFailed` |
| 40-49 | daemon → server | Plugin mgmt | `PluginUpdated` |
| 50-59 | server → daemon | Commands | `ConfigUpdate`, `RescanGame`, `PluginAvailable` |
| 60-69 | server → UI | State | `DeviceState` (cold-start snapshot) |
| 70-79 | UI → server → daemon | User actions | `TestPath`, `TestPathResult` |

The DO forwards all daemon status events (ranges 1-49) to the UI WebSocket if connected. On UI connect, the DO sends a `DeviceState` snapshot constructed from D1 persisted events.

**Coordination:** The daemon sends `PushStarted` before the HTTP POST, `PushCompleted`/`PushFailed` after. It only sends `PushStarted` after a successful parse. If the push fails and will be retried, the daemon sends `PushFailed` with `will_retry: true`, then `PushStarted` again on retry.

### Status Persistence

The DO writes status events to a `device_events` table in D1 (last 100 events per device, older rows pruned on insert). This serves two purposes:

1. **UI cold start:** When the web UI connects, the DO loads recent events from D1 and sends them as initial state, so the page isn't blank even if the daemon hasn't sent anything recently.
2. **Diagnostics:** Persisted events can be queried for debugging ("when did my daemon last successfully parse?").

**D1 schema:**

```sql
CREATE TABLE device_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_uuid) REFERENCES users(uuid)
);

CREATE INDEX idx_device_events_user_device ON device_events(user_uuid, device_id, created_at DESC);
```

**Saves table (identity → save UUID mapping):**

```sql
CREATE TABLE saves (
  uuid TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL,
  game_id TEXT NOT NULL,
  character_name TEXT,              -- NULL for game-scoped saves
  summary TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_uuid) REFERENCES users(uuid)
);

-- Character saves: one per (user, game, character).
CREATE UNIQUE INDEX idx_saves_character
  ON saves(user_uuid, game_id, character_name) WHERE character_name IS NOT NULL;

-- Game saves: one per (user, game). Shared stash, meta-progression, etc.
CREATE UNIQUE INDEX idx_saves_game
  ON saves(user_uuid, game_id) WHERE character_name IS NULL;
```

### Daemon WebSocket Client (Go)

Uses `nhooyr.io/websocket` for context-aware WebSocket with clean shutdown.

**Connection lifecycle:**
1. On startup, connect to `wss://mcp.savecraft.gg/ws/daemon` with bearer token in header.
2. On connect success, send `daemon_online` event.
3. Listen for incoming messages (config updates, rescan commands) in a goroutine.
4. Send status events as they occur (parse results, errors, game detection).
5. On disconnect, reconnect with exponential backoff: 1s → 2s → 4s → 8s → ... → 60s cap.
6. On graceful shutdown (SIGTERM), send `daemon_offline` event, close connection.

**Graceful degradation:** If the WebSocket is down, the daemon continues operating locally — watching files, parsing saves, queuing push API calls. Status events are dropped (not queued) during disconnection. The push API (HTTP POST) is independent of the WebSocket; save data always reaches R2 even if the real-time channel is down.

### Web UI: Device Status Page

Located at `savecraft.gg/devices`. This is the first page users see after installing the daemon. It is the onboarding experience.

**Device cards:**
- Device name, online/offline indicator, last seen timestamp
- Per-game status: game detected (green), watching (green with file count), parse errors (yellow with error message), game not found (gray)
- Per-game, saves found with identity preview: "Hammerdin, Paladin 87" / "Farm, Year 3, Spring"

**Activity feed:**
- Real-time scrolling log of status events, newest at top
- Friendly formatting: "✓ Parsed Hammerdin (42KB)" / "⚠ Parse error: SharedStash.d2i — unsupported format" / "→ Watching 3 files in /home/deck/.local/share/..."
- Updates live via WebSocket as events arrive

**Setup wizard integration:**
When a user adds a game or changes a save path:
1. Config writes to D1
2. Worker pokes the user's DO
3. DO pushes config to daemon via WebSocket
4. Daemon scans the new path, sends status events back
5. Web UI updates in real time: "Scanning... → Found 3 saves → Parsed Hammerdin (Level 87) ✓"

The entire flow takes <2 seconds. The user sees immediate confirmation that their configuration is correct and the daemon is working.

### Cost

Durable Objects require the Workers Paid plan ($5/month), which you'd hit anyway at any real traffic level.

**Per-request pricing:** $0.15 per million DO requests. Each WebSocket message that wakes a hibernating DO counts as one request.

At 1K users with active daemons:
- Config pushes: ~2-3 per user per month (rare)
- Status events per active play session: ~10-50 parse events + watching notifications
- Heartbeats: none (protocol-level keepalive, no DO wake)
- Web UI connections: sporadic, only when user is on the status page

Estimated ~300K DO requests/day at 1K active users → ~9M/month → **$1.35/month**. Duration charges are pennies (each handler runs <5ms). At 10K users: ~$13.50/month. Negligible.

## MCP Server

### OAuth Discovery Chain

The MCP server participates in the standard OAuth 2.0 discovery flow required by Claude, ChatGPT, and Gemini:

1. AI client hits MCP endpoint unauthenticated.
2. Server returns `401 Unauthorized` with header:
   ```
   WWW-Authenticate: Bearer resource_metadata="https://mcp.savecraft.gg/.well-known/oauth-protected-resource"
   ```
3. AI client fetches that URL and gets:
   ```json
   {
     "resource": "https://mcp.savecraft.gg",
     "authorization_servers": ["https://<clerk-instance>.clerk.accounts.dev"],
     "scopes_supported": ["savecraft:read"],
     "bearer_methods_supported": ["header"],
     "mcp_protocol_version": "2025-06-18",
     "resource_type": "mcp-server"
   }
   ```
4. AI client discovers Clerk's endpoints via `/.well-known/openid-configuration` on the Clerk instance.
5. AI client dynamically registers itself via RFC 7591 DCR (Clerk supports this).
6. User authenticates via Clerk (magic link email, or Discord OAuth if added later).
7. AI client receives access token (JWT signed by Clerk).
8. Subsequent MCP requests include `Authorization: Bearer <jwt>`.
9. MCP server validates JWT locally using Clerk's cached public keys. No network hop per request.
10. JWT `sub` claim + Clerk `publicMetadata` → Savecraft user UUID → R2 prefix `users/{user_uuid}/`.

### Authentication Provider: Clerk

- **Signup/login:** Email magic links. No passwords.
- **Future addition:** Discord OAuth (toggle in Clerk dashboard). High-signal for gaming audience.
- **MCP OAuth support:** Clerk supports RFC 7591 DCR, PKCE, and the full discovery chain. Validated by Context7's production MCP server using Clerk.
- **User metadata:** Clerk's `publicMetadata` carries the Savecraft user ID and subscription tier, flowing through to JWT claims.
- **Free tier:** Clerk covers 10K MAU on free plan.

### MCP Tools

The server exposes these tools to AI clients:

#### `list_saves`

Returns all saves the user has pushed, with metadata.

```json
{
  "saves": [
    {
      "save_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "game_id": "d2r",
      "game_name": "Diablo II: Resurrected",
      "scope": "character",
      "name": "Hammerdin",
      "last_updated": "2026-02-25T21:30:00Z",
      "summary": "Hammerdin, Level 89 Paladin"
    },
    {
      "save_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "game_id": "d2r",
      "game_name": "Diablo II: Resurrected",
      "scope": "game",
      "name": null,
      "last_updated": "2026-02-25T21:30:00Z",
      "summary": "Shared Stash (3 tabs, 47 items)"
    },
    {
      "save_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "game_id": "stardew",
      "game_name": "Stardew Valley",
      "scope": "character",
      "name": "Sunrise Farm - Luna",
      "last_updated": "2026-02-25T20:00:00Z",
      "summary": "Berry Merry Farm, Year 3 Fall — 69% Perfection"
    }
  ]
}
```

The `scope` field distinguishes character saves (`"character"`) from game-level saves (`"game"`). Game saves have `name: null`. AI consumers can correlate game saves with character saves by matching `game_id`.

#### `get_save_sections(save_id)`

Returns available sections and their descriptions for a save. The AI uses this to decide which sections to fetch.

```json
{
  "save_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "game_id": "d2r",
  "sections": [
    { "name": "character_overview", "description": "Level, class, difficulty, play time" },
    { "name": "equipped_gear", "description": "All equipped items with stats, sockets, runewords" },
    { "name": "skills", "description": "Skill point allocation by tree" }
  ]
}
```

#### `get_section(save_id, section, timestamp?)`

Returns a single section's data. Optional `timestamp` for historical queries.

```json
{
  "save_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "section": "equipped_gear",
  "timestamp": "2026-02-25T21:30:00Z",
  "data": { ... }
}
```

#### `get_save_summary(save_id)`

Shortcut for the `character_overview` / `player_summary` / equivalent overview section. Every plugin must emit an overview section.

#### `get_section_diff(save_id, section, from_timestamp, to_timestamp)`

Returns changes between two snapshots for a section.

```json
{
  "save_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "section": "equipped_gear",
  "from": "2026-02-24T12:00:00Z",
  "to": "2026-02-25T21:30:00Z",
  "changes": [
    { "path": "helmet.name", "old": "Tal Rasha's Horadric Crest", "new": "Harlequin Crest" },
    { "path": "body_armor.name", "old": "Smoke", "new": "Enigma" }
  ]
}
```

#### `refresh_save(save_id)`

Requests fresh data for a save. The server routes to the appropriate ingest path based on the save's game type — the MCP client never needs to know which path is taken.

- **Daemon-backed saves** (local files: D2R, Stardew, etc.): The Worker sends `RescanGame` to the SaveHub DO, which forwards it to the daemon over WebSocket. The daemon rescans the save directory, re-parses changed files, and pushes fresh data to R2 via the push API.
- **API-backed saves** (remote APIs: PoE2, WoW via Battle.net, etc.): The Worker fetches directly from the game's API using stored credentials, parses the response, and writes to R2.

Both paths produce the same result: updated snapshots in R2, updated metadata in D1. Subsequent `get_section` calls return the fresh data.

```json
{
  "save_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "refreshed": true,
  "timestamp": "2026-02-25T21:31:15Z"
}
```

**Latency:** API-backed refreshes complete in ~1-2 seconds (single HTTP round-trip to the game API). Daemon-backed refreshes take ~3-5 seconds (WebSocket command → daemon rescan → parse → HTTP push). Both are fast enough for conversational use — the AI says "let me check…" and it feels natural.

**Failure modes:** If the daemon is offline, returns an error with `"daemon_offline": true` so the AI can tell the user to check their daemon. If the game API is rate-limited or down, returns the error from the upstream API. In both cases, the last-known data is still available via normal `get_section` calls.

### AI Interaction Pattern

When a user asks about their game state, the AI follows this pattern:

1. Call `list_saves` to see what's available, or `search(query)` to find specific content across saves.
2. Call `get_save_sections(save_id)` to see available sections for a save.
3. Based on the question, fetch only the relevant sections:
   - "What should I upgrade?" → `equipped_gear` + `inventory` + `skills`
   - "Have I finished Act 3?" → `quest_progress`
   - "How has my build changed this week?" → `get_section_diff` on relevant sections
   - "Am I following my build guide?" → `search` or `list_notes` to find the guide, `get_note` to read it, then relevant sections for comparison
4. If the user indicates something just changed ("I just equipped a new item", "I just finished a quest"), call `refresh_save` to get fresh data before reading sections. The AI doesn't need to know whether the save is daemon-backed or API-backed — the server handles routing.
5. Combine structured save data with the AI's existing game knowledge (item stats, quest walkthroughs, build guides, meta analysis) to give personalized advice.

## Notes

### Overview

Notes are user-supplied reference material attached to a save. They cover the full spectrum from short goals ("farming for Ber rune") to full build guides (15KB of pasted Maxroll content) to progression checklists. When the AI reads a save's state, it can also read the attached notes and compare: "here's what you have vs. what the note says you should have."

Notes are **not** vectorized, chunked, or RAG'd. A typical note is 200 bytes to 20KB of markdown. The AI reads individual notes in full after discovering them via search or listing.

### Data Model

```json
{
  "note_id": "f7a8b9c0-d1e2-3456-789a-bcdef0123456",
  "save_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Maxroll Helltide Warlock Build",
  "content": "## Gear\n\n### Helm\nHarlequin Crest (Shako)...",
  "source": "user",
  "created_at": "2026-02-25T22:00:00Z",
  "updated_at": "2026-02-25T22:00:00Z"
}
```

**Limits:**
- 50KB max per note (generous — most build guides are 10-15KB of markdown, most goals/reminders are under 1KB)
- 10 notes max per save

**Storage:** Both metadata and content stored in D1 (not R2). Note content is indexed by FTS5 for full-text search alongside save section data. See the [Search](#search) section below.

**Source field:** `"user"` for v1 (user-pasted or AI-created content). Future partner integrations would use `"maxroll"`, `"icy_veins"`, etc. Same data model, same MCP tools, different origin. The partner integration is a content pipeline problem, not an architecture problem.

### MCP Tools: Notes

Read tools:

#### `list_notes(save_id)`

Returns metadata for all notes attached to a save. No content — use `get_note` to fetch full content after identifying the right one.

```json
{
  "save_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "notes": [
    { "note_id": "f7a8b9c0-...", "title": "Maxroll Helltide Warlock Build", "source": "user", "size_bytes": 12400 },
    { "note_id": "a2b3c4d5-...", "title": "Current Farming Goals", "source": "user", "size_bytes": 340 }
  ]
}
```

#### `get_note(save_id, note_id)`

Returns one note's full content.

```json
{
  "note_id": "f7a8b9c0-...",
  "title": "Maxroll Helltide Warlock Build",
  "source": "user",
  "content": "## Gear\n\n### Helm\nHarlequin Crest (Shako)..."
}
```

Write tools (enables UI-less v1 where the MCP is the entire interface):

#### `create_note(save_id, title, content)`

Creates a new note attached to a save. The AI calls this when the user says "save this build guide" or "remember that I'm targeting Harlequin Crest." The AI generates the title from context.

Returns the created `note_id`.

#### `update_note(save_id, note_id, content?, title?)`

Updates an existing note. For "actually, I got the Jah rune, update my farming goals."

#### `delete_note(save_id, note_id)`

Removes a note. Requires confirmation from the user in conversation before the AI calls this.

### AI Interaction with Notes

Typical flows:

**Reading a build guide:**
1. User: "Am I following my Warlock build correctly?"
2. AI calls `search(query: "warlock build")` → finds the note and the Warlock save
3. AI calls `get_note(save_id, note_id)` → gets the full build guide content
4. AI calls `get_section(save_id, "equipped_gear")` + `get_section(save_id, "skills")`
5. AI compares actual state to guide recommendations, identifies gaps

**Creating a goal:**
1. User: "I need to farm for Enigma. Remember that — I need Jah, Ber, and a 3-socket Mage Plate."
2. AI calls `create_note(save_id, "Enigma Farming Goals", "Need: Jah rune, Ber rune, 3os Mage Plate")`
3. Next session, user asks "what was I farming for?" → AI calls `list_notes` or `search("farming")`

**Updating a note:**
1. User: "I found the Jah rune! Update my farming note."
2. AI calls `search("farming")` → finds the note
3. AI calls `update_note(save_id, note_id, "Need: ~~Jah rune~~, Ber rune, 3os Mage Plate\n\nFound: Jah rune (2026-02-25)")`

### Web UI: Note Management

Located at `savecraft.gg/saves/{save_id}/notes` (or equivalent route in the settings/dashboard area). This is secondary to the MCP-first interaction model but provides a fallback for bulk operations.

**Note list view:**
- Shows all notes for the selected save as cards: title, source badge, created date, size
- "Add Note" button (prominent)
- Edit / delete actions per note

**Add/edit note view:**
- **Title field** — free text, required. User names it whatever they want ("Maxroll Hammerdin", "My PoE League Starter", "Stardew Year 1 Perfection Checklist", "Farming Goals")
- **Content field** — large textarea with monospace font. Accepts raw markdown. No rich text editor — the audience is gamers pasting from guide sites, and markdown is what they'll get when they copy from Maxroll/Icy Veins/Reddit. Show a live character/byte count against the 50KB limit.
- **Preview toggle** — renders the markdown so the user can verify it pasted correctly. Not critical for v1 but nice to have.
- **Save button** — validates size limit, writes to D1

**Note association:**
- Notes are attached to a specific save. The user picks the save first (from a dropdown or the save detail page), then adds notes to it.
- If a user has multiple saves in the same game (e.g., two D2R characters), notes are per-save, not per-game. A Hammerdin build guide doesn't apply to a Sorceress.
- If the user wants the same note on multiple saves, they paste it twice. Simplicity over cleverness for v1.

**No URL import for v1.** The user pastes content manually or has the AI create notes via MCP. This avoids building a web scraper, avoids copyright/ToS questions about automated content extraction, and keeps the user in control of what enters the system.

### Future: Partner Content

When strategy site partnerships materialize, partner-sourced content would:
- Arrive via a content feed/API rather than user paste
- Carry `"source": "maxroll"` with attribution metadata (author, URL, last_updated)
- Auto-update when the partner publishes changes (e.g., patch day guide revisions)
- Display with partner branding in the web UI
- Potentially be available to all users of that game (not per-save, but per-game), while user notes remain private and per-save

This is additive. No architecture changes needed — just a new content ingestion path that writes the same note objects.

## Search

### Overview

Unified full-text search across all of a user's save data and notes. Enables the AI to find relevant content without loading everything into context, and enables cross-save queries like "which of my characters has a Harlequin Crest?"

### Implementation: SQLite FTS5 in D1

D1 is SQLite at the edge. FTS5 is available out of the box — no external service, no embeddings, no vector DB.

**FTS5 table schema (conceptual):**

```sql
CREATE VIRTUAL TABLE search_index USING fts5(
  user_uuid UNINDEXED,
  save_id UNINDEXED,
  save_name UNINDEXED,
  type UNINDEXED,           -- 'section' or 'note'
  ref_id UNINDEXED,         -- section name or note_id
  ref_title UNINDEXED,      -- section description or note title
  content,                  -- searchable text (note markdown or section JSON)
  tokenize='porter unicode61'
);
```

**Indexing:**
- **Save sections:** Re-indexed on every push. DELETE existing rows for that save, INSERT new rows per section. Full section JSON stored as content. Structural noise (JSON keys) may produce some irrelevant matches — acceptable for v1, can flatten to values-only later if needed.
- **Notes:** Indexed on create/update/delete.

**Cost at scale:**
- ~100KB average save data + notes per user, stored in D1
- 1K users: ~750MB (within D1 5GB free tier)
- 10K users: ~7.5GB ($5.60/month at D1's $0.75/GB-month — irrelevant against revenue)
- Write amplification from re-indexing on push: ~10-50K writes/day at 1K users (within D1 100K writes/day free tier)

### MCP Tool: Search

#### `search(query, save_id?)`

Full-text keyword search across a user's saves and notes.

- **With `save_id`:** Scoped to that save's sections and notes. "Do I have a Shako?" or "find my hammerdin build guide."
- **Without `save_id`:** Searches across all the user's saves and notes. "Which character has Enigma?"

FTS5 provides ranked results, prefix matching, and boolean operators (`hammerdin OR "blessed hammer"`) for free.

```json
{
  "query": "enigma",
  "results": [
    {
      "type": "section",
      "save_id": "a1b2c3d4-...",
      "save_name": "Hammerdin",
      "section": "equipped_gear",
      "matches": ["...body_armor: **Enigma** Mage Plate..."]
    },
    {
      "type": "note",
      "save_id": "a1b2c3d4-...",
      "save_name": "Hammerdin",
      "note_id": "f7a8b9c0-...",
      "note_title": "Maxroll Blessed Hammer Paladin",
      "matches": ["...craft **Enigma** as your first priority runeword..."]
    }
  ]
}
```

The `type` field is critical. The AI must distinguish between "what you have" (section) and "what a note recommends" (note). That distinction is the core value prop of the platform.

## Infrastructure

### Cloudflare Stack

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Workers | MCP server, push API, auth endpoints | 100K requests/day |
| Durable Objects | Per-user WebSocket hub for daemon ↔ web UI real-time communication | Requires Workers Paid ($5/mo); $0.15/M requests, $12.50/M GB-s duration |
| R2 | Snapshot storage, plugin hosting | 10M reads, 1M writes/month |
| D1 | User accounts, device configs, device events, save UUID mapping, note content, FTS5 search index, plugin registry metadata | 5M rows read, 100K writes/day |

**Cost projections:**
- 1K paying users ($5K/month revenue): infrastructure <$100/month
- 10K users: $200-500/month
- Margins excellent — serving structured data, not compute-intensive inference

### Why Cloudflare R2 over S3

- Zero egress fees (S3 egress adds up at scale, and MCP reads = egress)
- S3-compatible API (Go code unchanged if migrating later)
- Free tier has absurd headroom for early stage
- Workers in front for compute, same platform

## Security Model

### Principle: R2 is Private, Server Mediates All Access

R2 buckets have no public access. The MCP server (with R2 credentials) is the only reader. All access scoped to the authenticated user's `users/{user_uuid}/` prefix.

### Daemon → Cloud Push

- Daemon authenticates with bearer token tied to user account.
- Server validates: well-formed JSON, under 5MB, expected top-level structure.
- Write scoped to user's prefix only.

### WASM Plugin Security

- wazero sandbox: plugins can only read stdin and write stdout/stderr. No filesystem, no network, no env vars.
- Ed25519 signature verification before loading any plugin.
- Community submits source → maintainer reviews → CI builds → release pipeline signs.

### MCP Server Hardening

- Rate limiting per user.
- Input validation on tool parameters (save_id and section validated against known values).
- No user-supplied query language — tools are fixed-function.
- JWT validation with cached Clerk public keys (no external call per request).

### Privacy Advantage

Save data flows through cloud and back via MCP. The AI never sees the user's local filesystem:
- Cannot request arbitrary files.
- Cannot discover what else is on the machine.
- Cannot see save directory paths.
- Only sees structured JSON that Savecraft chooses to serve.

Better privacy posture than a local MCP server with filesystem access.

### Daemon Sandboxing

The daemon runs with the minimum permissions necessary on each platform. Users can verify the sandbox configuration themselves.

**Linux / Steam Deck (systemd):**

The systemd user unit declares kernel-enforced restrictions:

```ini
[Unit]
Description=Savecraft Daemon
After=network-online.target

[Service]
ExecStart=%h/.local/bin/savecraft-daemon
Restart=on-failure
RestartSec=5

# Filesystem: read-only access to home, writable only for daemon's own config/cache
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/.config/savecraft %h/.cache/savecraft

# No privilege escalation
NoNewPrivileges=yes
PrivateTmp=yes

# Network: outbound only (no listening sockets)
RestrictAddressFamilies=AF_INET AF_INET6

[Install]
WantedBy=default.target
```

These are not promises — they're kernel-level enforcement. Even if the daemon binary were compromised, it cannot write to save files, cannot access files outside its declared paths, cannot escalate privileges. The user can inspect the unit file: `cat ~/.config/systemd/user/savecraft.service`.

The install script prints the sandbox summary after installation:

```
✓ Installed savecraft daemon
✓ Sandbox enabled:
    Read-only:  your game saves
    Write:      ~/.config/savecraft only
    Network:    outbound only (api.savecraft.gg)

  Inspect: cat ~/.config/systemd/user/savecraft.service
```

**macOS (launchd):**

The binary is signed and notarized with a `com.savecraft.daemon` entitlement profile. Hardened runtime enabled. The launchd plist restricts file access to the user's home directory (read-only) and the daemon's own `~/Library/Application Support/Savecraft/` directory (read-write). Less inspectable than systemd but enforced by the kernel.

**Windows:**

Weakest sandboxing story. The daemon runs as a Windows Service under a standard user account (no admin privileges). Code signing with an EV certificate provides authenticity assurance. No elegant equivalent of systemd's declarative sandboxing exists on Windows. Open source + code signing is the primary trust signal.

## Installation & Distribution

### Windows

**MSI installer** built with WiX or go-msi. The installer:
1. Installs the daemon binary to `C:\Program Files\Savecraft\`
2. Registers a Windows Service (starts on boot, restarts on crash, visible in Services panel)
3. Opens `savecraft.gg/setup` in the browser for account linking

**Code signing:** EV code signing certificate from DigiCert or Sectigo (~$300-400/year). Required to avoid SmartScreen "Windows protected your PC" warnings. Without it, most users won't complete installation. Non-negotiable for v1.

### macOS

**`.pkg` installer** + launchd service registration. Apple notarization required ($99/year Apple Developer account). Notarization process: `xcrun notarytool submit`, wait for Apple's servers, staple the ticket. Annoying but scriptable in CI.

Homebrew tap (`brew install savecraft/tap/savecraft`) as a secondary option for technical users, but not the primary install path — most gamers on Mac aren't homebrew users.

### Linux / Steam Deck

**Curl installer:**

```bash
curl -sSL https://install.savecraft.gg | bash
```

The install script:
1. Detects architecture (amd64/arm64)
2. Downloads signed daemon binary to `~/.local/bin/savecraft-daemon`
3. Verifies Ed25519 signature against baked-in public key
4. Installs systemd user unit to `~/.config/systemd/user/savecraft.service`
5. Enables and starts the service (`systemctl --user enable --now savecraft`)
6. Auto-detects game save directories by scanning known Steam/Proton paths
7. Prints sandbox summary and opens `savecraft.gg/setup` for account linking

**No root required.** Everything installs in `~/.local/bin/` and `~/.config/`. The daemon runs as a systemd user service under the current user. `inotify` (used by fsnotify) only needs read permission on watched directories, which the user already has for their own save files.

**Steam Deck specifics:** SteamOS is immutable — the root filesystem is read-only and resets on OS updates. But `~/.local/bin/` and `~/.config/` persist on the user partition. Systemd user services survive updates. Users need to switch to Desktop Mode to run the curl command via Konsole, but Deck users running D2R are already comfortable with Desktop Mode.

**Auto-detection on Deck:** If `~/.local/share/Steam/steamapps/compatdata/` exists, the install script scans for known game save paths within the Proton prefix tree and pre-configures any games it finds. Nice first-run experience.

### Console

**PS5:** No access to save data. Cloud saves sync to PS Plus with no API. Dead end, likely permanently unless Sony opens something up.

**Xbox / Game Pass PC:** Xbox Play Anywhere titles sync saves to PC via Xbox Cloud Save. Saves land in `%LOCALAPPDATA%\Packages\{game}\SystemAppData\wgs\`. Same format as PC saves in many cases. Not a true console integration, but Xbox players who also have Game Pass PC can install the daemon on their PC and pick up console-originated saves. Falls out naturally from supporting the PC versions — no special architecture needed.

**Nintendo Switch:** Completely sealed. No path.

Console is not a v1 concern and likely never will be for direct integration. The cross-save bridge via PC is the only realistic angle, and it's game-specific.

## Reference Data Strategy

### What Savecraft Does Not Build

Savecraft does not build a game encyclopedia. The AI already knows item stats, quest walkthroughs, game mechanics, crafting recipes, and drop tables. When knowledge is stale, the AI searches wikis. Replicating Fandom/Fextralife/Wowhead infrastructure provides zero incremental value.

### What Savecraft Serves

1. **User's actual game state** — what you have right now. This is the thing the AI cannot get on its own.
2. **Normalized build recommendations** (future) — curated build guides from strategy partners (Maxroll, Icy Veins, Wowhead) ingested into structured schema. Enables "compare my build to meta" queries.

### Strategy Content Layer (Future)

Not encyclopedic reference, but opinionated "here's what you should be doing" content that changes with patches. Patch-sensitive formulas (runeword recipes, crafting formulas) are a natural extension of build recommendation data.

## Monetization

### Why Ads Don't Work

Savecraft is headless. Value delivery happens inside someone else's UI (Claude, ChatGPT, Gemini). No surface for traditional ads:
- Web dashboard: low-traffic settings page
- Daemon: invisible background process
- MCP responses: injecting ads violates platform ToS, AI would strip them

### Freemium Tiers

| | Free | Paid ($3-5/month or $30-40/year) |
|---|---|---|
| Games | 1 game | Multiple games |
| State queries | Basic (what's my gear, stats) | Full access |
| Notes | 3 per save | 10 per save |
| Strategy comparison | — | Compare build to meta (partner content) |
| Historical tracking | — | Snapshots, diffs, "show build changes over last week" |
| Sync frequency | Standard | Faster |

Free tier generous enough for word-of-mouth. Paid tier unlocks infrastructure-intensive features.

### Future Revenue

- **Affiliate/referral:** "Your biggest gear gap is Harlequin Crest — here's the Maxroll farming guide." Measurable traffic to strategy sites.
- **Aggregated data insights (at scale):** Anonymized meta-analysis valuable to strategy sites, publishers, content creators. Requires 50K+ users.

## Game Support Roadmap

### Tier 1: Proof of Concept

| Game | Save Format | Parser Ecosystem | Notes |
|------|------------|-----------------|-------|
| Diablo II: Resurrected | `.d2s` binary | Excellent. dschu012/d2s (JS), nokka/d2s (Go), D2SLib (C#) | Dogfood game. Binary format, well-documented, battle-tested parsers. |

### Tier 2: First Expansion

| Game | Save Format | Parser Ecosystem | Notes |
|------|------------|-----------------|-------|
| Stardew Valley | XML (plain text) | Excellent. Multiple parsers (JS, Go, XSLT). Stardew Checkup parses 46 achievement tracks. | Trivial to parse. Massive audience. Completionist culture ("what am I missing for Perfection?"). |
| Paradox games (Stellaris, CK3) | Clausewitz text (gzip-compressed) | Good. Structured plaintext, parseable. | Ideal Savecraft games. Deep strategy, dozens of systems to optimize, players who'd connect an MCP server. |

### Tier 3: High Value, More Complex

| Game | Save Format | Parser Ecosystem | Notes |
|------|------------|-----------------|-------|
| Bethesda games (Skyrim, Fallout 4) | `.ess` binary | Good. UESP wiki has exhaustive format docs. Multiple parsers exist. | Inventory, skills, quest flags, faction standings all in save. Huge modding community. |
| Elden Ring | `.sl2` binary (encrypted) | Moderate. Multiple save editors exist (ClayAmore). Requires decrypt step. | Build optimization natural fit. Anti-cheat concern for online play, but read-only advisory is different from editing. |
| Baldur's Gate 3 | `.lsv` (Larian format) | Good. Norbyte's LSLib is canonical. | Large saves (~100MB) but compressible. Character builds, spell selections, quest state. |
| Civilization VI | `.Civ6Save` (compressed binary) | Moderate. pydt/civ6-save-parser (npm). Format partially documented. | Amazing advisory angle: "is my science output on track?" |

### Tier 4: API-Based (Server-Side Adapters)

| Game | Data Source | Notes |
|------|-----------|-------|
| Path of Exile 2 | GGG OAuth API | Character profiles, passive tree, equipped items, stash tabs. Official OAuth with granular scopes. |
| WoW (via API) | Battle.net OAuth API | Character profiles, gear, stats, achievements, mythic+ scores. Battle.net OAuth. |
| WoW (via addons) | `SavedVariables/*.lua` local files | Addons like Simulationcraft dump full character sheet to local Lua files. Daemon-backed parser — Tier 3 complexity, not an adapter. |
| FFXIV | Lodestone / XIVAPI (unofficial) | No local save data. Community APIs, no official OAuth. Fragile but viable. |

These are **not WASM plugins**. The daemon plugin model assumes local files, no network, no secrets. API-backed games break all three constraints. Instead, these are **server-side game adapters** — TypeScript modules that run in the Worker/SaveHub, with access to credentials and outbound `fetch()`.

See [Server-Side Game Adapters](#server-side-game-adapters) for the full architecture.

**Dual ingest, single abstraction.** The `refresh_save` MCP tool unifies both paths. For daemon-backed saves, the SaveHub sends `RescanGame` to the daemon over WebSocket. For API-backed saves, the SaveHub calls the game adapter directly. The MCP client — and by extension the AI — never knows which path is taken. One tool, two ingest paths, same R2 result. See [MCP Tools → `refresh_save`](#refresh_savesave_id) for the full contract.

**Conversation pattern is identical for both:**

```
Player (PoE2, API-backed):  "I just slotted a new skill gem."
AI: calls refresh_save → SaveHub calls GGG API → R2 updated → AI reads fresh sections

Player (Stardew, daemon-backed):  "I just finished the Community Center!"
AI: calls refresh_save → SaveHub sends RescanGame → daemon rescans → pushes to R2 → AI reads fresh sections
```

## Development Tooling

### Protobuf + buf

The WebSocket protocol is defined in `proto/protocol.proto`. `buf generate` produces Go types (`internal/proto/`) and TypeScript types (`worker/src/proto/`) from the same source. No mirrored types, no drift.

GameState types (what plugins emit, what R2 stores, what MCP serves) are **not** in protobuf. Section data is arbitrary JSON per game — protobuf's `Struct` type is an awkward fit. GameState types are hand-written Go structs in `internal/daemon/` (next to the interfaces that produce and consume them) and TypeScript interfaces in `worker/src/types/`. The envelope is small and stable enough (4 fields) that the duplication is acceptable.

### just

`just` is the command runner. All build/test/lint/generate targets are in the `Justfile`. `just --list` shows available targets. `just check` runs everything.

### Svelte

SvelteKit for the web UI. TypeScript throughout.

### Testing Strategy

**Unit tests (fast, run on every change):**
- Go: all external dependencies behind interfaces. Hand-written fakes for filesystem, WASM runtime, WebSocket client, HTTP push client. No mock libraries.
- Worker: Vitest + Miniflare for local D1, R2, Durable Objects, WebSocket.
- Svelte: component tests with mock WebSocket and API responses.

**Integration tests (Docker Compose, CI + on-demand):**
- Daemon binary + Miniflare Worker + real WebSocket connections + real file events.
- End-to-end: write a save file → daemon detects → parses → pushes → MCP tool returns data.

### Development Environment

nix devenv + direnv. `devenv.nix` provides Go, Node, Wrangler, buf, just, and all development tools. `direnv allow` activates the environment automatically on `cd`.

### CI & Release

CI and release are separate concerns with separate workflows in `.github/workflows/`.

**CI (`ci.yml`):** Runs on every push to `main` and every PR. Uses `dorny/paths-filter` to skip jobs when irrelevant files change:

| Job | Triggers on |
|-----|-------------|
| `go` | `internal/**`, `cmd/**`, `plugins/**`, `proto/**`, `go.mod`, `go.sum` |
| `worker` | `worker/**`, `proto/**` |
| `web` | `web/**` |
| `deploy` | Always (after all checks pass, main branch only) |

A web-only PR skips Go and Worker checks entirely. The `deploy` job runs if no check jobs failed — skipped jobs don't block it.

**Daemon release (`release-daemon.yml`):** Triggered by `v*` tags. Builds daemon binaries for all platforms (linux/amd64, linux/arm64, darwin/amd64, darwin/arm64, windows/amd64), signs them with Ed25519, generates checksums, bakes the public key and version into `install.sh`, and creates a GitHub Release with all artifacts. Daemon versioning follows git tags.

**Plugin release (`release-plugin.yml`):** Triggered by changes to `plugins/*/plugin.toml` on `main`. Plugin versioning is independent of the daemon — each plugin has its own version in `plugin.toml`. The workflow:

1. Detects which `plugin.toml` files changed in the commit
2. For each changed plugin:
   - Reads the new version from `plugin.toml`
   - Fetches the current `manifest.json` from R2 — if the version matches, skips (safety gate against re-runs)
   - Builds the WASM (`just build-plugin <game_id>`)
   - Signs the WASM with Ed25519
   - Generates `manifest.json` from `plugin.toml` + sha256 (`cmd/plugin-manifest/`)
   - Uploads `parser.wasm`, `parser.wasm.sig`, and `manifest.json` to R2

**To release a new plugin version:** bump `version` in `plugin.toml`, merge to main. No git tags needed. The version in `plugin.toml` is the source of truth — the release workflow reads it directly.

**Signing key:** Ed25519 keypair generated by `just keygen` (`cmd/savecraft-keygen/`). The public key (`internal/signing/signing_key.pub`) is checked into the repo and baked into daemon binaries. The private key is base64-encoded and stored as `SIGNING_PRIVATE_KEY` in GitHub Actions secrets.

## Open Decisions (Deferred)

These are policy decisions, not architecture decisions. Nothing about them changes the shape of the system.

- **Snapshot retention policy:** Keep everything for now. Implement thinning later.
- **Free tier game locking:** Can the user switch their one free game? Locked on first push? TBD.
- **Daemon auto-update mechanism:** Binary is signed and distributed via installers, but self-update (daemon downloads its own replacement) needs a strategy. Go self-update libraries exist. TBD.
- **Strategy site partnerships:** Approach Maxroll/Icy Veins as distribution partners or build scraper pipeline? TBD.
- **Anthropic Connectors Directory submission:** After dogfooding or immediately?
- **Multi-device support:** What happens when a user has the daemon on both a Windows PC and a Steam Deck? Same games, different saves? Same saves synced via Steam Cloud? The DO hub supports multiple daemon connections per user, but the UX for choosing "which device's save" in the MCP needs thought.

## Implementation Order

1. **Cloud skeleton:** Register savecraft.gg. Stand up R2 bucket, D1 database, Workers skeleton, Clerk instance. Basic push API that accepts JSON and writes to R2.
2. **Durable Object hub:** Implement SaveHub DO class with WebSocket Hibernation. `/ws/daemon` and `/ws/ui` upgrade routes. Message protocol types. Status event persistence in D1.
3. **Daemon core + WebSocket:** Go daemon binary with WebSocket client (nhooyr.io/websocket), reconnection backoff, status event reporting. Filesystem watcher (fsnotify + debounce + hash). Can test with dummy parse events before real WASM plugins.
4. **Web UI: device status page:** Activity feed, device health cards, game detection display. Real-time updates via WebSocket. This is the onboarding experience — users need to see the daemon working before anything else matters.
5. **Installation packaging:** Linux/Deck curl installer with systemd sandboxing. Windows MSI with code signing. macOS .pkg with notarization. Signature verification in all installers.
6. **WASM plugin runtime + D2R parser:** Implement wazero host in daemon. Define stdin/stdout contract. Build D2R parser as first WASM plugin using nokka/d2s as reference.
7. **End-to-end validation:** Install on Steam Deck. Watch status feed confirm parse. Connect MCP. Ask Claude about actual Hammerdin.
8. **MCP server with OAuth:** Implement MCP tools, register as custom connector in Claude.ai. Validate OAuth flow with Clerk end-to-end.
9. **MCP write tools + notes:** Note CRUD via MCP. UI-less guide management — Claude creates/updates/deletes notes inline during conversation.
10. **Plugin signing + distribution:** Ed25519 signing pipeline. Plugin registry endpoint. Daemon auto-download.
11. **Second game (Stardew Valley):** Validates the plugin system works for a completely different format (XML vs binary).
12. **Web UI: note management + settings:** Note CRUD via web, device configuration, game path overrides, account management.
13. **Historical tracking + diffs:** Snapshot retention, diff computation, MCP diff tool.
14. **Paid tier:** Stripe integration, tier enforcement in MCP server.
