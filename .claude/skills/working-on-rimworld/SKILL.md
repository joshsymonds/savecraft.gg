---
name: working-on-rimworld
description: RimWorld reference module and mod development for Savecraft. Use when working on files in plugins/rimworld/, including reference modules (surgery, crops, combat, materials, drugs, raids, genes, research), the datagen XML parser, decompiling Assembly-CSharp.dll, or the Harmony mod. Triggers on RimWorld plugin code, XML Defs, datagen, reference.wasm, decompilation, patch verification, or RimWorld game formulas.
---

# Working on RimWorld

## Architecture

**Two components:** a C# Harmony mod (pushes colony state via WebSocket) and a Go WASM reference module (8 computation modules in one binary). Design doc: `docs/rimworld.md`.

**Reference module pattern:** Same as D2R — generated Go struct literals from game data, computation logic in Go, compiled to WASM. No D1 database.

```
.reference/RimWorldDefs/           # XML Defs (SCP'd from Steam Deck, gitignored)
.reference/RimWorldDecompiled-v16/ # Fresh decompile (gitignored)
plugins/rimworld/tools/datagen/    # XML parser + Go code generator
plugins/rimworld/reference/data/   # Generated *_gen.go files
plugins/rimworld/reference/        # WASM entry point + 8 computation packages
```

## Verification

**View changes require `just build-views` + committing `views.gen.ts`.** See `working-on-views` skill for details. CI does not rebuild views — forgetting this ships stale HTML.

```bash
go test ./plugins/rimworld/...                                    # All RimWorld tests
go run ./plugins/rimworld/tools/datagen                           # Regenerate from XML
GOOS=wasip1 GOARCH=wasm go build -o ref.wasm ./plugins/rimworld/reference  # Build WASM (<5MB)
just test-go                                                      # Full Go suite
```

## Datagen: XML Inheritance Resolver

The datagen tool parses 1,558 XML Def files across Core + 5 DLCs. RimWorld uses `ParentName` attribute inheritance — child defs override parent fields, inheriting everything else.

**Key design decision:** The resolver namespaces `byDefName` by `defType:defName` to prevent cross-type collisions (e.g., ThingDef "MultiAnalyzer" vs ResearchProjectDef "MultiAnalyzer").

**Name matching:** All handlers use `matchDef()` — exact match → prefix match → substring match. Never first-hit substring.

## Formula-to-Module Mapping

Each module's computation comes from specific decompiled C# types. **When verifying after a patch, check these types:**

| Module | Decompiled Types | Key Formula |
|--------|-----------------|-------------|
| Surgery | `SurgeryOutcomeEffectDef` (XML), `SurgeryOutcomeComp_*` | quality = surgeon × bed × medicine_curve × difficulty × inspired, clamp(0, 0.98) |
| Crops | `Plant.GrowthRate`, `PlantUtility.GrowthRateFactorFor_*` | rate = fertility × temperature × light × (NoxiousHaze) × (Drought) |
| Combat (ranged) | `VerbProperties` | DPS = damage × burst / (warmup + cooldown + burst_delay) × accuracy |
| Combat (melee) | `StatWorker_MeleeAverageDPS`, `VerbProperties.AdjustedMeleeSelectionWeight` | weight = **damage²**, trueDPS = Σ(damage³) / Σ(damage² × cooldown) |
| Combat (armor) | `ArmorUtility.ApplyArmor` | ea = max(rating - AP, 0); zones: deflect (<ea/2), half (<ea), full |
| Materials | `StatPart_Quality` (XML StatDefs) | final = base × material_factor × quality_factor |
| Drugs | `CompProperties_Drug` (XML) | Data-driven: market value, addictiveness, ingredients |
| Raids | `StorytellerUtility.DefaultThreatPointsNow` | Piecewise curves: PointsPerWealthCurve, PointsPerColonistByWealthCurve |
| Genes | `GeneDef` (XML, Verse namespace) | Data-driven: complexity, metabolism, exclusion tags |
| Research | `ResearchProjectDef` (XML, Verse namespace) | Chain traversal + tribal tech level multipliers (medieval 1.5×, industrial+ 2×) |

**Critical v1.6 change:** Surgery was refactored from hardcoded C# to a comp system (`SurgeryOutcomeEffectDef` in XML). The formula is identical but the architecture changed completely. The 98% cap and medicine curve `(0,0.7),(1,1),(2,1.3)` are now in `Core/RecipeDefs/SurgeryOutcomeEffectDefs.xml`.

**Melee DPS trap:** Selection weight is `damage²`, NOT `damage/cooldown`. This was wrong in our initial implementation and corrected via v1.6 decompile verification.

## Patch-Day Verification

When Ludeon ships a RimWorld update:

### 1. Extract fresh data from Steam Deck

```bash
# SSH: deck@172.31.0.39, password in memory
nix-shell -p sshpass --run 'sshpass -p "..." scp -r deck@172.31.0.39:"~/.steam/steam/steamapps/common/RimWorld/Data/*/Defs" .reference/RimWorldDefs/'
nix-shell -p sshpass --run 'sshpass -p "..." scp -r deck@172.31.0.39:"~/.steam/steam/steamapps/common/RimWorld/RimWorldLinux_Data/Managed/" .reference/RimWorldDLLs/Managed/'
```

### 2. Decompile formula-relevant types

The decompiler runs via a temporary dotnet project in `/tmp/ilspy-decompile/`:

```bash
nix-shell -p dotnet-sdk_8 --run 'cd /tmp/ilspy-decompile && dotnet run -- \
  .reference/RimWorldDLLs/Managed/Assembly-CSharp.dll \
  .reference/RimWorldDLLs/Managed \
  .reference/RimWorldDecompiled-v16'
```

The project uses `ICSharpCode.Decompiler` NuGet package. It needs the full `Managed/` directory (102 DLLs) as reference assemblies — without them, ILSpy fails to resolve Unity dependencies.

**Namespace gotcha:** Some types are in `Verse` not `RimWorld`: `GeneDef`, `ResearchProjectDef`, `ArmorUtility`, `DamageWorker`, `VerbProperties`.

### 3. Diff and verify

Compare decompiled output against previous version. Focus on the types in the formula mapping table above. If any formula changed:

1. Update the Go computation package
2. Update tests with new expected values
3. Regenerate data: `go run ./plugins/rimworld/tools/datagen`
4. Run full test suite

### 4. Regenerate and test

```bash
go run ./plugins/rimworld/tools/datagen   # Regenerate from fresh XML
go test ./plugins/rimworld/...            # Verify all modules
```

## Data Sources

| Source | Location | Contents |
|--------|----------|----------|
| XML Defs | `.reference/RimWorldDefs/{Core,Royalty,Ideology,Biotech,Anomaly,Odyssey}/` | All game data (ThingDefs, GeneDefs, RecipeDefs, StatDefs, etc.) |
| v1.6 decompile | `.reference/RimWorldDecompiled-v16/` | Formula-relevant C# types |
| Old decompile | `.reference/RimWorldDecompiled/` | v1.2.2753, pre-Biotech — **do not trust for current formulas** |
| Reference DLLs | `.reference/RimWorldDLLs/Managed/` | Full Managed directory for ILSpy reference resolution |
