# Savecraft Overview

## What Savecraft Is

Savecraft gives AI assistants access to your actual game state — your character, your gear, your progress — via MCP (Model Context Protocol). It turns Claude, ChatGPT, and Gemini into something that knows your game the way a co-op partner would: it can optimize your build, track your goals, and react when you vent about Countess dropping nothing for the fifteenth run in a row.

Most of these games are played solo. The best moments — the lucky drop, the build finally clicking, the boss that took twenty attempts — happen with nobody watching. Savecraft means there's always someone who knows the context. You don't explain what a Shael is or why Perfection matters. The AI already knows your character, your gear, your goals. It's Player 2.

Two modes of use emerge naturally from the same data:

- **Companion.** "Another Countess run and ZERO SHAELS. Wtf." / "I JUST FOUND A BER RUNE." / "I think I'm burned out on this character." The AI knows your actual state and can react with context — commiserate, celebrate, suggest what to do next.
- **Optimizer.** "What should I upgrade?" / "Am I hitting the 125% FCR breakpoint?" / "Compare my build to the Maxroll guide." The AI reads your sections, compares to game knowledge and attached notes, and gives specific advice.

Both modes use the same MCP tools, the same save data, the same notes. The architecture doesn't distinguish between them — it just serves structured state and lets the conversation go wherever the player takes it.

**Domains:** savecraft.gg (primary), savecraft.ai (redirect)
**Creator:** [Josh Symonds](https://joshsymonds.com)

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
│                      │        │                              │
│  Some games need no  │        │  ┌────────────────────────┐  │
│  daemon — API-backed │        │  │  API Adapters (Worker)  │  │
│  games (WoW, PoE2)   │        │  │  - fetch game APIs     │  │
│  are served directly │        │  │  - same GameState out   │  │
│  by the Worker.      │        │  └────────────────────────┘  │
└─────────────────────┘         │                              │
                                │  ┌────────────────────────┐  │
┌─────────────────────┐         │  │  MCP Server (Worker)   │  │
│   AI Client          │  HTTPS  │  │  - OAuth AS (own keys) │  │
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
- **Linux / Steam Deck:** Static binary installed to `~/.local/bin/` + systemd user unit. Sandboxed via systemd directives. See `docs/infrastructure.md`.
- **Configuration:** All configuration happens via the web interface at savecraft.gg/settings. Config changes push to daemon in real time via WebSocket. Per-device configs stored server-side in D1.

### Component 2: Remote MCP Server

Cloud-hosted HTTPS endpoint that serves game state to AI clients. This is a standard remote MCP server — Claude, ChatGPT, and Gemini connect directly via their built-in MCP connector/plugin systems.

- **Claude.ai:** Custom connector via Settings → Connectors → "Add custom connector." Requires OAuth with Dynamic Client Registration (RFC 7591) + PKCE.
- **ChatGPT:** Developer Mode on Business/Enterprise/Edu. Remote MCP via SSE/HTTP with OAuth.
- **Gemini:** CLI and SDK support OAuth for remote servers.

### Shared Server Binary

The daemon push API and MCP server run as a **single Cloudflare Worker**. Two route groups on the same deployment:

- `/api/v1/*` — Daemon push API (authenticated via API key/bearer token)
- `/api/v1/notes/*` — Note CRUD for web UI and MCP write tools (authenticated via Clerk session or OAuth)
- `/mcp/*` — MCP tool-serving endpoint (authenticated via OAuth access token from our AS)
- `/oauth/authorize` — Redirects to Clerk for user login, then completes authorization
- `/oauth/callback` — Receives Clerk auth code, exchanges for Clerk token, issues our own OAuth grant
- `/oauth/token` — Token endpoint (authorization code → access token exchange, refresh token support)
- `/oauth/register` — Dynamic Client Registration (RFC 7591) for AI clients
- `/.well-known/oauth-authorization-server` — AS metadata (auto-served by library)
- `/.well-known/oauth-protected-resource` — Protected resource metadata (auto-served by library)
- `/ws/daemon` — WebSocket upgrade for daemon real-time connection (authenticated via bearer token, routed to per-user Durable Object)
- `/ws/ui` — WebSocket upgrade for web UI live status (authenticated via Clerk session, routed to same per-user Durable Object)

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
│   ├── pluginmgr/              # Plugin download, verification, caching, manifest access
│   └── wsconn/                  # WebSocket client for /ws/daemon
│       └── client.go
├── worker/                      # Cloudflare Worker + Durable Object (TypeScript)
│   ├── src/
│   │   ├── index.ts             # Worker routes, request handling
│   │   ├── hub.ts               # SaveHub Durable Object class
│   │   └── proto/               # Generated TypeScript from protobuf (do not edit)
│   │       └── savecraft/v1/
│   │           └── protocol.ts
│   ├── wrangler.toml
│   └── package.json
├── plugins/
│   ├── echo/                    # Reference/test plugin: reflects input as GameState
│   │   ├── main.go
│   │   └── Justfile             # just build → parser.wasm
│   └── d2r/                     # D2R plugin
│       ├── parser/              # Daemon-side: save file parsing
│       │   └── main.go          # stdin bytes → ndjson stdout
│       ├── reference/           # Worker-side: reference data computation
│       │   └── main.go          # JSON query on stdin → ndjson result
│       ├── d2s/                 # Shared parsing + data tables
│       ├── Justfile             # just build → parser.wasm + reference.wasm
│       └── plugin.toml
├── install/
│   ├── install.sh               # Linux/Steam Deck curl installer
│   ├── savecraft.service        # systemd user unit template
│   └── worker/                  # Cloudflare Worker (UA-based install router)
│       └── src/index.ts
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

## Data Schema

### GameState (plugin output)

All plugins emit a `result` line on stdout conforming to this structure (the `type: "result"` field is stripped by the daemon before storage):

**Character save** (most common — one save per character/playthrough):

```json
{
  "identity": {
    "saveName": "Hammerdin",
    "gameId": "d2r",
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
    "saveName": "Shared Stash (Softcore)",
    "gameId":   "d2r"
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

Every save has a `saveName` provided by the plugin. For character saves this is the character name (e.g. "Hammerdin"). For game-scoped saves it's a descriptive label (e.g. "Shared Stash (Softcore)"). The unique identity is always `(user_uuid, game_id, save_name)`.

**Design principles:**

- **Self-describing.** Every section carries a `description` field. The AI uses these to decide which sections to request.
- **Section-level granularity.** Stardew Valley farm state can be megabytes. The AI requests only the sections it needs for the question.
- **Plugin-defined schema.** The server does not validate section contents. Each game's sections have different shapes. The plugin is the authority on what data looks like.
- **No cross-game normalization.** D2R gear and Stardew crops are fundamentally different data. Attempting to normalize into a universal schema would lose information and add complexity for zero benefit.
- **Plugin-authored summaries.** The `summary` field is a human-readable display string authored by the plugin. Examples: `"Hammerdin, Level 89 Paladin"` (D2R), `"Berry Merry Farm, Year 3 Fall — 69% Perfection"` (Stardew), `"Emperor Halfdan of Scandinavia, 847 AD"` (CK3). The server stores summaries in D1 for fast UI rendering and MCP tool responses.
- **Plugin-named saves.** Every save is identified by `(user_uuid, game_id, save_name)`. The plugin always provides a `saveName`.

### R2 Storage

Two separate R2 buckets per environment, split by access pattern:

| Bucket | Binding | Contents |
|--------|---------|----------|
| `savecraft-saves` | `SAVES` | User save snapshots — private, scoped to `users/{user_uuid}/` |
| `savecraft-plugins` | `PLUGINS` | Plugin binaries and manifests — public-read via API |

Staging uses `-staging` suffix (`savecraft-saves-staging`, `savecraft-plugins-staging`).

**Saves bucket layout:**

```
users/{user_uuid}/saves/{save_uuid}/snapshots/{timestamp}.json
users/{user_uuid}/saves/{save_uuid}/latest.json
```

**Plugins bucket layout:**

```
plugins/{game_id}/manifest.json
plugins/{game_id}/parser.wasm
plugins/{game_id}/parser.wasm.sig
plugins/{game_id}/reference.wasm        # optional, if plugin has reference modules
plugins/{game_id}/reference.wasm.sig
```

- **Snapshots are immutable.** Every push creates a new timestamped object.
- **`latest.json`** is a copy of the most recent snapshot for fast reads. Updated only if the incoming `parsed_at` timestamp is newer than the current latest.
- **Save UUID** is assigned by the server when a save is first pushed. Identity resolved in D1: `(user_uuid, game_id, save_name)` → `UNIQUE` constraint.
- **User UUID** is assigned at account creation. All R2 access scoped to `users/{user_uuid}/`.

### Historical Data and Diffs

- Every push is timestamped and stored as an immutable snapshot.
- Retention policy: TBD. For now, keep everything.
- MCP tools support optional `timestamp` parameter for point-in-time queries.
- Diff tool: `get_section_diff(save_id, section, from_timestamp, to_timestamp)` returns changed fields.
