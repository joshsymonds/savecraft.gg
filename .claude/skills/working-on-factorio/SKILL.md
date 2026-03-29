---
name: working-on-factorio
description: Factorio plugin development for Savecraft. Use when working on files in plugins/factorio/, including the Lua mod (control.lua, info.json), WASM parser, reference modules (recipe_lookup, ratio_calculator), datagen pipeline, sprite sheet generator, or Factorio-specific views. Triggers on Factorio plugin code, Lua mod API, ratio calculator, recipe lookup, production chains, datagen, sprite sheets, or Factorio game data.
---

# Working on the Factorio Plugin

Factorio uses a **hybrid mod + daemon** architecture — unique among Savecraft plugins. A Lua mod writes JSON to `script-output/savecraft/`, the daemon watches via fsnotify, and a thin WASM parser converts to ndjson. Design doc: `plugins/factorio/README.md`.

## Architecture

```
plugins/factorio/
├── mod/                    # Factorio Lua mod (control.lua, info.json)
├── parser/                 # WASM pass-through parser (JSON → ndjson)
├── reference/              # WASM reference modules (recipe_lookup, ratio_calculator)
│   ├── data/               # Generated Go struct literals (*_gen.go)
│   └── views/              # Svelte reference views (ratio-calculator.svelte)
├── tools/
│   ├── datagen/            # Parses data-raw-dump.json → generated Go files
│   └── spritesheet/        # Packs icon PNGs into sprite sheet + manifest
├── sprites/                # Generated sprite sheets (items.png, fluids.png + JSON manifests)
├── plugin.toml             # Plugin metadata, sources = ["wasm", "mod"]
└── Justfile
```

## Verification

```bash
cd plugins/factorio
just test                   # Parser + reference module tests (32 tests)
just build                  # Build parser.wasm + reference.wasm
just datagen                # Regenerate from data-raw-dump.json
just spritesheet            # Regenerate sprite sheets from .reference/ PNGs
```

Full suite: `just test-go` (all Go) + `just test-worker` (all Worker) + `just build-views` (view compilation).

## Key Conventions

### Recipe Disambiguation

**Never guess which recipe to use.** When multiple non-recycling recipes produce the same item (e.g., solid-fuel from 3 oil sources), `resolveRecipe()` returns an error listing the options. The AI uses `recipe_lookup` (product query) to find options, picks contextually, and passes the explicit recipe name via the `recipe` or `recipe_overrides` parameters.

### Anti-Hallucination Modules Have No Views

`recipe_lookup` and `tech_tree_navigator` return data for the LLM to reason over. No player-facing visualization — the AI narrates results. Views exist only for modules whose output the player needs to SEE (ratio_calculator, oil_balancer, etc.).

### Shared Chart Components

`ProductionDAG` and `FlowSankey` live in `views/src/components/charts/` — shared across games. Only `FactorioIcon` is game-specific (in `views/src/components/factorio/`).

## Data Pipeline

### Source Data (from Steam Deck)

```
.reference/factorio-data-raw-dump.json    # factorio --dump-data (27MB, all prototypes)
.reference/factorio-sprites/{item,fluid,...}/  # factorio --dump-icon-sprites (64x64 PNGs)
.reference/factorio-locale/*-locale.json  # factorio --dump-prototype-locale (display names)
.reference/factorio-saves/                # Test save files
```

### Extracting Fresh Data

```bash
# SSH to Steam Deck (deck@172.31.0.39, password in memory)
# WARNING: Factorio CLI commands may steal focus from active games on the Deck
nix-shell -p sshpass --run 'sshpass -p "..." ssh deck@172.31.0.39 \
  "~/.steam/steam/steamapps/common/Factorio/bin/x64/factorio --dump-data"'
# Then SCP from ~/.factorio/script-output/
```

### Datagen Flow

```
.reference/factorio-data-raw-dump.json
  → go run ./plugins/factorio/tools/datagen/
  → plugins/factorio/reference/data/*_gen.go
    recipes_gen.go    (659 recipes)
    technologies_gen.go (275 techs)
    machines_gen.go   (17 crafting machines)
    modules_gen.go    (12 modules)
    logistics_gen.go  (belts, inserters, beacons)
    fluids_gen.go     (33 fluids)
  → compiled into reference.wasm (GOOS=wasip1 GOARCH=wasm)
```

**Factorio data quirk:** Empty collections are `{}` (object) not `[]` (array). The datagen tool handles this with `parseStringArray()`.

### Sprite Sheet Flow

```
.reference/factorio-sprites/item/*.png (340 icons, 64x64)
  → go run ./plugins/factorio/tools/spritesheet/
  → plugins/factorio/sprites/items.png (2048x704, 2.3MB)
  → plugins/factorio/sprites/items.json (manifest: name → {x,y,w,h,label})
```

Labels come from `.reference/factorio-locale/item-locale.json`.

## Lua Mod (Factorio 2.0 API)

### Critical 2.0 Renames

| 1.x | 2.0 |
|-----|-----|
| `game.write_file` | `helpers.write_file` |
| `game.table_to_json` | `helpers.table_to_json` |
| `game.item_prototypes` | `prototypes.item` |
| `global` | `storage` |
| `force.evolution_factor` | `force.get_evolution_factor(surface)` |

### Mod Structure

- `mod/info.json` — mod metadata, `factorio_version: "2.0"` (two-part only)
- `mod/control.lua` — `script.on_nth_tick()` hooks: lightweight stats every 300 ticks (5s), heavy entity scans every 1800 ticks (30s)
- Output path: `script-output/savecraft/state.json`
- **Mod is untested in-game** — API calls are based on research, not runtime verification

## Reference Module Architecture

Go WASM with baked-in data (RimWorld pattern, NOT native TypeScript like MTGA). Entry point: `reference/main.go` with query routing.

### Ratio Calculator Formulas

```
effective_speed = machine.CraftingSpeed × (1 + module_speed + beacon_speed)
beacon_speed = Σ(module_effect × dist_effectivity / √n) across all beacons
output_per_craft = result_amount × (1 + productivity_bonus)
items_per_sec = (effective_speed / craft_time) × output_per_craft
```

**Productivity does NOT increase ingredient consumption** — only gives free bonus output. This is validated by `TestValidation_ProductivityModules_AM3`.

### Adding New Reference Modules

1. Add handler function in `plugins/factorio/reference/`
2. Wire into `main.go` switch statement
3. Add to `schema()` in `main.go`
4. Add to `[reference.modules.*]` in `plugin.toml`
5. If player-facing: add view in `plugins/factorio/reference/views/`

## Attribution

`views/src/attributions.ts` has a `wube` entry for Factorio content. Plugin.toml declares `[attribution] sources = ["wube"]`.
