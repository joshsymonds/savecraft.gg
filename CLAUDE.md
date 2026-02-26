# Savecraft

## Project Overview

Savecraft parses video game save files and serves structured game state to AI assistants via MCP. Two components: a local Go daemon (WASM plugin runtime, filesystem watcher) and a remote Cloudflare Worker (MCP server, push API, Durable Object hub).

Read `docs/savecraft-architecture.md` for the full architecture document. It is the source of truth.

## Tech Stack

- **Daemon:** Go, wazero (WASM runtime), fsnotify, nhooyr.io/websocket
- **Cloud:** Cloudflare Workers (TypeScript), Durable Objects, R2, D1 (SQLite/FTS5)
- **Auth:** Clerk (OAuth, JWT, magic links)
- **Frontend:** SvelteKit, TypeScript
- **Plugins:** Go compiled to WASI Preview 1 (.wasm), ndjson stdout contract, Ed25519 signed
- **Protocol:** Protobuf (proto/protocol.proto) → buf generate → Go + TypeScript
- **Build:** just (Justfile), nix devenv + direnv

## Project Phase

**Pre-launch. Treat main as a feature branch.** No backwards compatibility required for anything — wire protocol, API contracts, DB schema, plugin format. Everything is subject to change. Delete old code, don't version it. This note will be removed when the project ships.

## Key Conventions

- Monorepo, single Go module
- WebSocket protocol defined once in protobuf, codegen'd to both languages. No mirrored types.
- GameState types (plugin output) are hand-written Go/TS — section data is arbitrary JSON per game
- Plugin stdout is ndjson: `{"type": "status"|"result"|"error", ...}` per line
- Save data pushed via HTTP POST, not WebSocket. WS carries lightweight status events only.
- All R2 access scoped to `users/{user_uuid}/` prefix
- Save identity resolved by `(user_uuid, game_id, character_name)` → save UUID
- Durable Objects use WebSocket Hibernation — no application-layer heartbeats
- Plugins provide a `summary` string for UI display (e.g. "Hammerdin, Level 89 Paladin")

## Development Principles

### Testing

Every layer must be fully testable in isolation and in integration.

**Unit tests (fast, run on every change):**
- Go daemon: all external dependencies behind interfaces. Fakes for filesystem, WASM runtime, WebSocket client, HTTP push client. Tests inject fakes.
- Cloudflare Worker: Miniflare for local D1, R2, Durable Objects, WebSocket. Vitest as test runner.
- Svelte UI: component tests with mock WebSocket, mock API responses.

**Integration tests (Docker Compose, run in CI + on-demand):**
- Daemon binary + Miniflare Worker + real WebSocket connections + real file events.
- End-to-end: write a save file → daemon detects → parses → pushes → MCP tool returns data.

**Principles:**
- TDD: write the test first, watch it fail, implement, watch it pass.
- No mocking libraries — hand-written fakes that implement the same interface.
- Tests assert behavior, not implementation details.
- Integration tests use real binaries, real protocols, real data formats.

### Code Style

- Idiomatic Go: small interfaces, table-driven tests, error wrapping with `%w`, no globals.
- Idiomatic TypeScript: strict mode, no `any`, discriminated unions for message types.
- Svelte: SvelteKit conventions, TypeScript throughout.

## Important Paths

- `docs/savecraft-architecture.md` — Architecture source of truth
- `docs/wireframes/` — UI wireframes (React/JSX reference designs)
- `proto/savecraft/v1/protocol.proto` — Canonical WebSocket protocol definition
- `internal/proto/savecraft/v1/` — Generated Go protobuf code (do not edit)
- `worker/src/proto/savecraft/v1/` — Generated TypeScript protobuf code (do not edit)
- `internal/schema/` — Hand-written Go types (GameState, plugin manifest)
- `cmd/daemon/` — Daemon entrypoint
- `cmd/server/` — Server entrypoint (Go, for self-hosted option)
- `worker/` — Cloudflare Worker + Durable Object (TypeScript)
- `web/` — SvelteKit frontend
- `plugins/` — WASM plugin sources

## Commands

All targets in `Justfile`. Run `just --list` for full list.

- `just proto` — Generate Go + TypeScript from protobuf
- `just proto-lint` — Lint protobuf definitions
- `just test` — Run all tests (Go + Worker)
- `just test-go` — Run Go tests
- `just test-go-race` — Run Go tests with race detector
- `just test-worker` — Run Worker tests (Vitest + Miniflare)
- `just dev-worker` — Start Worker dev server (Miniflare)
- `just lint-go` — Run staticcheck + go vet
- `just fmt-go` — Run goimports
- `just check` — Lint, generate, test everything
