# MCP Tool Annotation Justifications

OpenAI requires written justifications for each tool annotation at submission time. This document provides copy-paste-ready text for the Platform Dashboard.

## list_games

- **readOnlyHint: true** — Only executes SELECT queries against D1 and reads from R2 storage. No records are inserted, updated, or deleted.
- **destructiveHint: false** — No data is modified; this is a pure listing operation.
- **idempotentHint: true** — Calling with the same filter parameter always returns the same result from the same underlying state.
- **openWorldHint: false** — All data is fetched from Savecraft's own D1 database and R2 bucket. No external APIs or third-party services are contacted.

## get_save

- **readOnlyHint: true** — Executes only SELECT queries against D1 to retrieve save metadata, section listings, and note metadata.
- **destructiveHint: false** — No records are created, modified, or deleted.
- **idempotentHint: true** — Same save_id always returns the same data from current state; no side effects accumulate.
- **openWorldHint: false** — Operates entirely within Savecraft's D1 database. No external game APIs or third-party services are called.

## get_section

- **readOnlyHint: true** — Fetches section data via SELECT query from D1. No state is modified.
- **destructiveHint: false** — Read-only operation; no records are written.
- **idempotentHint: true** — Repeated calls with the same save_id and section names return identical results.
- **openWorldHint: false** — Reads only from Savecraft's internal D1 storage; no external system contact.

## get_note

- **readOnlyHint: true** — Retrieves note content via a D1 SELECT; no writes occur.
- **destructiveHint: false** — No data is altered.
- **idempotentHint: true** — Returns the same note content on every call with the same note_id until the note is externally modified.
- **openWorldHint: false** — Data is retrieved solely from Savecraft's internal database.

## create_note

- **readOnlyHint: false** — Inserts a new record into D1 and updates the FTS5 search index.
- **destructiveHint: false** — Creates a new record without overwriting or removing any existing data. The note can be deleted afterwards via delete_note.
- **idempotentHint: false** — Each invocation generates a new UUID and inserts a new note row; calling twice creates two separate notes.
- **openWorldHint: false** — Only Savecraft's internal D1 database is modified; no external services are contacted.

## update_note

- **readOnlyHint: false** — Executes a D1 UPDATE statement and re-indexes the note in FTS5.
- **destructiveHint: true** — Permanently overwrites the existing title and/or content; prior content is not versioned and cannot be recovered after the update.
- **idempotentHint: true** — Calling with identical arguments produces the same final database state; there is no accumulating side effect from repeated identical calls.
- **openWorldHint: false** — Operates exclusively on Savecraft's internal D1 storage and search index.

## delete_note

- **readOnlyHint: false** — Executes a DELETE query against D1 and removes the entry from the FTS5 search index.
- **destructiveHint: true** — Permanently removes the note; the data cannot be recovered.
- **idempotentHint: true** — Calling delete_note on an already-deleted note returns a "not found" error without further state change; the end state is identical.
- **openWorldHint: false** — Operates only on Savecraft's internal D1 database.

## refresh_save

- **readOnlyHint: false** — The adapter code path calls storePush, which upserts save records and section data in D1. The daemon code path sends a rescan command to the SourceHub Durable Object.
- **destructiveHint: false** — No data is deleted; section data is replaced with fresher game state, which is the intended outcome. The operation does not cause data loss.
- **idempotentHint: true** — Calling refresh multiple times produces the same result: the most current game state from the source. Repeated calls within the cooldown period are rejected without re-fetching.
- **openWorldHint: true** — Both execution paths contact systems outside the MCP server: the adapter path calls external game APIs (e.g., Battle.net); the daemon path signals the player's local Savecraft daemon via the SourceHub Durable Object WebSocket relay.

## search_saves

- **readOnlyHint: true** — Executes a full-text search SELECT against the D1 FTS5 index; no records are modified.
- **destructiveHint: false** — No writes occur.
- **idempotentHint: true** — The same query and optional save_id always returns the same results from unchanged underlying state.
- **openWorldHint: false** — Searches only within Savecraft's internal FTS5 index; no external services are queried.

## query_reference

- **readOnlyHint: true** — Invokes a read-only reference computation Worker via Cloudflare Dispatch Namespace; no D1 records are written.
- **destructiveHint: false** — Reference modules are stateless computation engines; they return calculated results without modifying any stored data.
- **idempotentHint: true** — The same game_id, module, and query parameters always produce the same computed result from the same game data tables.
- **openWorldHint: false** — The reference Worker is invoked via Cloudflare's internal Dispatch Namespace binding, not via an external HTTP call to a third-party service. All computation happens within Savecraft's infrastructure.

## get_savecraft_info

- **readOnlyHint: true** — Reads source records from D1 and returns static informational content about Savecraft setup, privacy, and architecture.
- **destructiveHint: false** — No data is written, updated, or deleted.
- **idempotentHint: true** — The same category, platform, and link_code inputs always return the same response from current state.
- **openWorldHint: false** — All data comes from Savecraft's internal D1 database and hardcoded documentation strings; no external services are contacted.
