# Savecraft

## Project Overview

Savecraft parses video game save files and serves structured game state to AI assistants via MCP. Two components: a local Go daemon (WASM plugin runtime, filesystem watcher) and a remote Cloudflare Worker (MCP server, push API, SourceHub + UserHub Durable Objects).

## Documentation

Read the doc relevant to your current task. Start with `overview.md` for orientation.

- `docs/overview.md` — What Savecraft is, system architecture, data flow, repo structure
- `docs/daemon.md` — Go daemon: orchestrator, watcher, plugin loading, WebSocket client (`internal/`, `cmd/`)
- `docs/worker.md` — Cloudflare Worker: push API, SourceHub + UserHub DOs, WebSocket protocol, D1 schemas (`worker/`)
- `docs/mcp.md` — OAuth architecture, MCP tools, notes, search, AI interaction patterns (`worker/src/mcp/`)
- `docs/plugins.md` — WASM plugin system, ndjson contract, signing, distribution (`plugins/`)
- `docs/adapters.md` — API game adapters: server-side TypeScript modules for API-backed games (`worker/src/adapters/`)
- `docs/web.md` — SvelteKit frontend, onboarding, components (`web/`)
- `docs/infrastructure.md` — CI/CD, deployment, signing, installation, security (`.github/`, `install/`)
- `docs/roadmap.md` — Planned features: game adapters, reference data, monetization, game roadmap
- `docs/mcp-design.md` — Cross-platform MCP tool design best practices (external reference)

## Tech Stack

- **Daemon:** Go 1.26, wazero (WASM runtime), fsnotify, nhooyr.io/websocket
- **Cloud:** Cloudflare Workers (TypeScript), Durable Objects, R2, D1 (SQLite/FTS5)
- **Auth:** Clerk (OAuth, JWT, magic links)
- **Frontend:** SvelteKit, TypeScript
- **Plugins:** Go compiled to WASI Preview 1 (.wasm), ndjson stdout contract, Ed25519 signed
- **Protocol:** Binary protobuf on all WebSocket legs. `Message` (daemon↔server), `RelayedMessage` (server→browser). Schema: proto/protocol.proto → buf generate → Go + worker TS + web TS
- **Build:** just (Justfile), nix devenv + direnv

## Project Phase

**Pre-launch. Treat main as a feature branch.** No backwards compatibility required for anything — wire protocol, API contracts, DB schema, plugin format. Everything is subject to change. Delete old code, don't version it. This note will be removed when the project ships.

**Pre-launch does NOT mean cut corners.** Always prefer the architecturally correct solution. "No backwards compatibility" means you can freely change schemas, protocols, and APIs without migration shims — it does NOT mean quick hacks, skipping proper design, or lowering code quality. When presenting options, lead with the best architectural choice and explain why. You may also note a simpler alternative, but never default to it without asking.

## Key Conventions

- Monorepo, single Go module
- WebSocket protocol defined once in protobuf, codegen'd to Go + worker TS + web TS. Binary proto on the wire (`Message` for daemon↔server, `RelayedMessage` for server→browser). No mirrored types, no JSON on WebSocket.
- GameState types (plugin output) are hand-written Go/TS — section data is arbitrary JSON per game. Types live next to their consumers, not in grab-bag packages.
- Plugin stdout is ndjson: `{"type": "status"|"result"|"error", ...}` per line
- Save data pushed via HTTP POST, not WebSocket. WS carries lightweight status events only.
- All R2 save access scoped to `sources/{source_uuid}/` prefix
- Save identity resolved by `(source_uuid, game_id, save_name)` → save UUID
- Sources own saves; users own sources. MCP/web access saves via source→user JOIN.
- Durable Objects use WebSocket Hibernation — no application-layer heartbeats
- Plugins provide a `summary` string for UI display (e.g. "Hammerdin, Level 89 Paladin")

## Worktrees

Feature branches use `.worktrees/` (gitignored). Nix devenv + direnv handles the environment automatically. Worktrees need `.env.local` copied (gitignored secrets) and `npm ci` for each JS subdirectory.

```
git worktree add .worktrees/feature/my-branch -b feature/my-branch
cd .worktrees/feature/my-branch
direnv allow
cp ../../.env.local .env.local          # gitignored secrets needed by SvelteKit / Storybook
cd web && npm ci && cd ..               # install from lockfile exactly
cd worker && npm ci && cd ..            # install from lockfile exactly
```

## Development Principles

- TDD: write the test first, watch it fail, implement, watch it pass.
- No mocking libraries — hand-written fakes that implement the same interface.
- Tests assert behavior, not implementation details.
- Domain-specific conventions (Go, TypeScript, D2R, etc.) are in `.claude/skills/`. They load automatically when you're working in the relevant area.

## Important Paths

- `docs/` — Architecture docs (see Documentation section above)
- `proto/savecraft/v1/protocol.proto` — Canonical WebSocket protocol definition
- `internal/proto/savecraft/v1/` — Generated Go protobuf code (do not edit)
- `worker/src/proto/savecraft/v1/` — Generated TypeScript protobuf code (do not edit)

## Scripts

- `web/scripts/screenshot.ts` — Capture Storybook story screenshots via Playwright. Usage: `cd web && npx tsx scripts/screenshot.ts --grep <pattern>` or `--all`. Requires Storybook running. Output in `web/screenshots/`.

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
