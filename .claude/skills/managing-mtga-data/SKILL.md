---
name: managing-mtga-data
description: D1 database access and MTGA reference data pipeline for Savecraft. Use when working with D1 databases, wrangler d1 commands, MTGA data imports, clearing or reimporting card/draft/rules data, debugging why imports skip, or running mtga-carddb, 17lands-fetch, scryfall-fetch, rules-fetch, tagger-fetch tools. Triggers on "D1", "wrangler", "MTGA data", "reimport", "pipeline state", "import skipping", "draft ratings", "card data stale", "force import", "update-mtga".
---

# Managing MTGA Data

## D1 Databases

| Environment | Database Name | Database ID |
|---|---|---|
| Staging | savecraft-staging | `0147892e-82e6-413e-a0ef-52f6d8787fdf` |
| Production | savecraft | `df241bb0-9b7d-48e5-a4d4-f84ebf09e6e5` |
| Local/Dev | savecraft | `local` (Miniflare) |

Cloudflare account ID: `cc0a94bb7aff760efd48b49ce983fe97`

### Wrangler D1 Commands

Always use `--remote` for staging/production. Without it, wrangler targets the local SQLite.

```bash
# Query staging
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "SELECT COUNT(*) FROM mtga_cards WHERE is_default=1"

# Query production
wrangler d1 execute df241bb0-9b7d-48e5-a4d4-f84ebf09e6e5 --remote \
  --command "SELECT COUNT(*) FROM mtga_draft_ratings"
```

Run wrangler from the `worker/` directory (it reads `wrangler.toml` for config). Use the database ID directly, not the binding name.

## Import Pipeline

### Just Targets

```bash
just update-mtga staging      # Full import: all phases, all tools
just update-mtga production   # Same for production
just update-mtga-retry staging  # Retry from cached SQL (no CSV reprocessing)
```

### Phases and Tools

Imports run in strict dependency order. **mtga-carddb must run first** — it populates `mtga_cards` from the MTGA client database. All other tools enrich or depend on that data.

| Phase | Tool | Writes To | Pipeline Key |
|---|---|---|---|
| 0 | `mtga-carddb` | `mtga_cards` + FTS, `arena_cards_gen.go` | `tool='mtga-carddb', set_code='_global'` |
| 1 (parallel) | `rules-fetch` | `mtga_rules`, `mtga_card_rulings` + FTS | `tool='rules', set_code='_global'` |
| 1 (parallel) | `scryfall-fetch` | Enriches `mtga_cards` + FTS, Vectorize | `tool='scryfall', set_code='_global'` |
| 2 | `tagger-fetch` | `mtga_card_roles` | `tool='tagger', set_code='{SET}'` |
| 3 | `17lands-fetch` | `mtga_draft_ratings`, `mtga_draft_archetype_stats`, `mtga_draft_synergies`, `mtga_draft_archetype_curves`, `mtga_draft_set_stats`, `mtga_draft_deck_stats` + FTS | `tool='17lands', set_code='{SET}'` |

**Phase 0** (`mtga-carddb`): Reads MTGA's `Raw_CardDatabase.mtga` SQLite file and imports full card data (name, mana cost, colors, type line, oracle text, produced mana, power, toughness, etc.) to D1. Also regenerates `arena_cards_gen.go` for the Go parser. Uses synthetic `oracle_id` (`arena-{arena_id}`) and empty `legalities` for cards Scryfall doesn't know about yet.

**Phase 1** (`scryfall-fetch`): Enrichment only — UPSERTs `oracle_id`, `legalities`, `keywords`, `oracle_text`, `produced_mana` onto existing rows using `INSERT ... ON CONFLICT(arena_id) DO UPDATE SET`. Also INSERTs non-Arena cards from Scryfall bulk data. **Does not delete `mtga_cards`** — mtga-carddb owns the base data. Deletes FTS entries per-card (by arena_id) before re-inserting, preserving FTS entries for MTGA-only cards.

Phase 2 depends on Phase 1 (tagger needs cards in D1). Phase 3 depends on Phase 2 (17lands needs roles + card CMC from D1).

### Running Individual Tools

All tools read `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from environment (loaded by direnv from `.envrc.local`). Flags override env vars.

```bash
# Phase 0: Import card data from MTGA client database (staging)
go run ./plugins/mtga/tools/mtga-carddb/ \
  --card-db=.reference/mtga-carddb/Raw_CardDatabase.mtga \
  --cf-account-id=cc0a94bb7aff760efd48b49ce983fe97 \
  --d1-database-id=0147892e-82e6-413e-a0ef-52f6d8787fdf \
  --cf-api-token="$CLOUDFLARE_API_TOKEN"

# Phase 1: Enrich with Scryfall data (staging)
go run ./plugins/mtga/tools/scryfall-fetch/ \
  --cf-account-id=cc0a94bb7aff760efd48b49ce983fe97 \
  --d1-database-id=0147892e-82e6-413e-a0ef-52f6d8787fdf \
  --vectorize-index=mtga-cards-staging

# Single set for 17lands
go run ./plugins/mtga/tools/17lands-fetch/ \
  --cf-account-id=cc0a94bb7aff760efd48b49ce983fe97 \
  --d1-database-id=0147892e-82e6-413e-a0ef-52f6d8787fdf \
  --set=DSK
```

**mtga-carddb requires the MTGA client's `Raw_CardDatabase.mtga` file** (SQLite). This is extracted from the MTGA client installation at `MTGA_Data/Downloads/Raw/`. It is not checked into the repo.

## Why Imports Skip (Pipeline State Dedup)

Every tool checks `mtga_pipeline_state` before importing:

```sql
-- Schema
CREATE TABLE mtga_pipeline_state (
  tool         TEXT NOT NULL,
  set_code     TEXT NOT NULL,  -- per-set code or '_global'
  content_hash TEXT NOT NULL,  -- SHA256 of generated SQL
  imported_at  TEXT NOT NULL,
  row_count    INTEGER NOT NULL,
  PRIMARY KEY (tool, set_code)
);
```

**Flow:** Tool fetches source data, generates SQL, SHA256-hashes it, compares against stored hash. If hashes match, the tool skips (source data unchanged). This is why imports "do nothing" when data hasn't changed upstream.

There is also an etag-based dedup layer in the D1 import API itself (`cfapi.ImportD1SQL`), but the pipeline state check happens first and is the usual reason for skipping.

## Forcing a Reimport

### Option 1: Clear Pipeline State (recommended)

Delete the hash row so the next run sees no prior state and reimports unconditionally.

```bash
# Force reimport of MTGA card data (staging)
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "DELETE FROM mtga_pipeline_state WHERE tool = 'mtga-carddb' AND set_code = '_global'"

# Force reimport of scryfall enrichment (staging)
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "DELETE FROM mtga_pipeline_state WHERE tool = 'scryfall' AND set_code = '_global'"

# Force reimport of 17lands for one set (staging)
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "DELETE FROM mtga_pipeline_state WHERE tool = '17lands' AND set_code = 'DSK'"

# Force reimport of ALL 17lands data (staging)
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "DELETE FROM mtga_pipeline_state WHERE tool = '17lands'"

# Force reimport of tagger roles (staging)
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "DELETE FROM mtga_pipeline_state WHERE tool = 'tagger'"

# Nuclear: force reimport of everything (staging)
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "DELETE FROM mtga_pipeline_state"
```

Then run the import tool or `just update-mtga staging`.

### Option 2: Retry from Cached SQL

If a D1 import failed partway (e.g., timeout), cached SQL files exist on disk. Retry without reprocessing:

```bash
just update-mtga-retry staging
```

This runs `tagger-fetch --retry` and `17lands-fetch --retry`, which scan `~/.cache/savecraft/17lands/sql/` for `*.sql` files and reimport them. Successfully imported files are deleted; failures are left for the next retry.

### Option 3: Delete Local Cache

Force re-download of source CSVs (17lands) or re-fetch from APIs:

```bash
rm -rf ~/.cache/savecraft/17lands/     # 17lands CSV + SQL cache
rm -rf /tmp/savecraft/sql/             # rules/scryfall temp SQL
```

### Inspecting Pipeline State

```bash
# See what's been imported (staging)
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "SELECT tool, set_code, imported_at, row_count FROM mtga_pipeline_state ORDER BY tool, set_code"
```

## Key Tables Quick Reference

| Table | Content | Populated By |
|---|---|---|
| `mtga_cards` | Full card data (all Arena printings) | mtga-carddb (primary), scryfall-fetch (enrichment) |
| `mtga_cards_fts` | FTS5 search index (default printings only) | mtga-carddb + scryfall-fetch |
| `mtga_rules` | MTG Comprehensive Rules | rules-fetch |
| `mtga_card_rulings` | Per-card Scryfall rulings | rules-fetch |
| `mtga_card_roles` | Tagger function roles per set | tagger-fetch |
| `mtga_draft_ratings` | Per-card 17Lands stats (overall) | 17lands-fetch |
| `mtga_draft_archetype_stats` | Per-card stats by archetype | 17lands-fetch |
| `mtga_draft_synergies` | Card pair co-occurrence | 17lands-fetch |
| `mtga_draft_archetype_curves` | Mana curve per archetype | 17lands-fetch |
| `mtga_draft_set_stats` | Per-set aggregate stats | 17lands-fetch |
| `mtga_draft_deck_stats` | Archetype composition stats | 17lands-fetch |
| `mtga_pipeline_state` | Import dedup hashes | All tools |

## Clearing Table Data

To wipe and reimport a specific domain, clear both the data tables AND the pipeline state:

```bash
# Example: clear all draft data and reimport (staging)
wrangler d1 execute 0147892e-82e6-413e-a0ef-52f6d8787fdf --remote \
  --command "DELETE FROM mtga_draft_ratings; DELETE FROM mtga_draft_archetype_stats; DELETE FROM mtga_draft_synergies; DELETE FROM mtga_draft_archetype_curves; DELETE FROM mtga_draft_set_stats; DELETE FROM mtga_draft_deck_stats; DELETE FROM mtga_draft_ratings_fts; DELETE FROM mtga_pipeline_state WHERE tool = '17lands'"

# Then reimport
just update-mtga staging
# Or just the 17lands phase:
go run ./plugins/mtga/tools/17lands-fetch/ \
  --cf-account-id=cc0a94bb7aff760efd48b49ce983fe97 \
  --d1-database-id=0147892e-82e6-413e-a0ef-52f6d8787fdf
```

For card data specifically: clearing `mtga_cards` requires re-running `mtga-carddb` first (to restore base data), then `scryfall-fetch` (to re-enrich). Clearing pipeline state alone is sufficient to force reimport of current data.
