# Savecraft

## Project Overview

Savecraft parses video game save files and serves structured game state to AI assistants via MCP. Two components: a local Go daemon (WASM plugin runtime, filesystem watcher) and a remote Cloudflare Worker (MCP server, push API, Durable Object hub).

Read `docs/savecraft-architecture.md` for the full architecture document. It is the source of truth.

## Tech Stack

- **Daemon:** Go, wazero (WASM runtime), fsnotify, nhooyr.io/websocket
- **Cloud:** Cloudflare Workers (TypeScript), Durable Objects, R2, D1 (SQLite/FTS5)
- **Auth:** Clerk (OAuth, JWT, magic links)
- **Plugins:** Go compiled to WASI Preview 1 (.wasm), stdin/stdout contract, Ed25519 signed

## Key Conventions

- Monorepo, single Go module
- Plugins communicate via stdin (raw save bytes) / stdout (JSON GameState)
- All R2 access scoped to `users/{user_uuid}/` prefix
- Save identity resolved by `(user_uuid, game_id, identity_tuple)` → save UUID
- No cross-game schema normalization — each plugin defines its own section shapes
- Durable Objects use WebSocket Hibernation — no application-layer heartbeats

## Important Paths

- `docs/savecraft-architecture.md` — Architecture source of truth
- `docs/wireframes/` — UI wireframes (React/JSX)
- `cmd/daemon/` — Daemon entrypoint
- `cmd/server/` — Server entrypoint
- `internal/schema/` — Shared JSON types
- `worker/` — Cloudflare Worker + Durable Object
- `plugins/` — WASM plugin sources

## Commands

TBD — project is in initial setup.
