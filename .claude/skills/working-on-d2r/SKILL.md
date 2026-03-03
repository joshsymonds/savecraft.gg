---
name: working-on-d2r
description: D2R save file parser development for Savecraft. Use when working on files in plugins/d2r/, including d2s binary parsing, item decoding, skill trees, attribute parsing, or shared stash. Triggers on D2R plugin code, d2s format, Huffman decoding, item properties, treasure classes, or Reign of the Warlock.
---

# Working on the D2R Parser

The parser lives in `plugins/d2r/d2s/`. It's a WASM plugin that reads `.d2s` binary save files and emits ndjson to stdout. See `docs/plugins.md` for the plugin contract.

## Verification

```bash
cd plugins/d2r && just test      # D2R-specific tests
just test-go                      # Full Go test suite
just lint-go                      # Includes D2R with relaxed lint rules
```

## D2R v105 (Reign of the Warlock) Specifics

This parser targets **v105 only** (version byte `0x69`). Classic LoD saves are not supported.

**Expansion detection:** v105+ saves do NOT set the LoD status bit (0x20) in the header. You must check `header.Realm >= RealmLoD` to gate mercenary and golem parsing. This is a common trap — the LoD bit check works for older saves but silently misparses v105.

**Warlock class:** Class index 7. Skill offset is **373** (not 281 — those are monster skills). Skills.txt extracted via CASC.

**Item codes:** Huffman-encoded in D2R (not ASCII like LoD). The Huffman tree is in `d2s/huffman.go`.

**ISC (ItemStatCost):** RotW ISC is IDENTICAL to vanilla D2R — zero property bit width changes. RotW added properties 365 (sB=6) and 366 (sB=8), plus items not in vanilla tables.

## Lint Exceptions

`golangci-lint` config has exclusions for `plugins/d2r/`:
- govet/shadow (binary parsing has lots of shadowed `err`)
- globals (lookup tables are package-level)
- complexity (binary parsing functions are inherently complex)
- magic numbers (byte offsets, bit widths)

These exclusions are intentional. Don't try to "fix" them.

## Test Data

- **Primary test save:** `reference/Diablo II Resurrected/Atmus.d2s` — Level 74 Warlock, 45 items + 3 merc items.
- **Reference implementation:** `reference/olegbl-d2rmm/.../d2s/d2/items.ts` — `readItem()` function.

## CASC Data

Game data tables are extracted from the D2R CASC archive:

- Archive: `reference/d2r-casc/` (gitignored, must copy locally)
- Extracted tables: `reference/d2r-rotw-excel/` (gitignored — **Blizzard IP, NEVER check in**)
- Extract tool: `plugins/d2r/tools/casc-extract/` (uses CascLib, cloned at build time)
- Plugin `devenv.nix` adds cmake/gcc/zlib for building the extract tool

```bash
cd plugins/d2r
just build-casc-extract
just casc-extract "data/global/excel/Skills.txt"
```

## Shared Stash

`.d2i` files (e.g. `ModernSharedStashSoftCoreV2.d2i`) — multi-section format with 64-byte headers per tab, same item format as d2s. **Not yet implemented.**

## Architecture

One plugin per game. The plugin detects save version internally. Only v105 for now.

```
plugins/d2r/
├── d2s/           # Parser source (header, attributes, skills, items, merc, corpse, golem)
├── parser/        # WASM entrypoint (main.go → stdin bytes → ndjson stdout)
├── data/          # Shared lookup tables (items, runewords, treasure classes)
├── tools/         # casc-extract tool
└── plugin.toml    # Plugin metadata
```
