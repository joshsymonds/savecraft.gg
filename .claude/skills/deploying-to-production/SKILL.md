---
name: deploying-to-production
description: Proposes production releases for Savecraft components by finding latest git tags, diffing changes, and suggesting version bumps. Use when the user asks to deploy, release, tag, ship, or check what needs deploying to production. Triggers on "deploy to production", "what needs releasing", "propose version bumps", "cut a release", "tag for production", "ship it".
---

# Deploying to Production

Savecraft has independently versioned components. Each has its own tag prefix, deploy workflow, and relevant paths. Production deploys are triggered by pushing a semver tag.

## Step 1: Run the proposal script

Always start by running the script. Do not attempt to find tags or diff history manually.

```bash
bash .claude/skills/deploying-to-production/scripts/propose-releases.sh
```

The script handles tag discovery, path filtering, and net-diff calculation. It only shows components with actual changes (not commits that touched-then-reverted a path).

## Step 2: Interpret the output

For each component with changes, review the commits and diff stat. Present a summary table:

| Component | Current Tag | Proposed Tag | Reason |
|-----------|-------------|--------------|--------|
| cloud | cloud-v1.X.Y | cloud-v1.X+1.0 | ... |

### Version bump rules

- **Minor** (X.Y.0 → X.Y+1.0): New features, UI changes visible to users, new MCP tools, new sections, schema migrations, new plugin capabilities
- **Patch** (X.Y.Z → X.Y.Z+1): Bug fixes, lint fixes, formatting, dependency bumps, copy changes, test-only changes
- When in doubt, prefer minor

## Step 3: Confirm and tag

After the user approves, provide the exact git commands:

```bash
git tag <tag> && git push origin <tag>
```

Each tag push triggers its deploy workflow automatically via GitHub Actions.

## Component → Deploy Workflow Map

| Component | Tag Prefix | Workflow | What Deploys |
|-----------|-----------|----------|--------------|
| Daemon | `daemon-v` | `deploy-daemon.yml` | Go binaries (Linux/macOS/Windows), MSI, R2 upload, GitHub Release |
| Cloud | `cloud-v` | `deploy-cloud.yml` | Worker (API/MCP/DOs) + Web (Pages) + Site (Pages) + D1 migrations |
| Install | `install-v` | `deploy-install.yml` | Install Worker + curl script to R2 |
| Plugin | `plugin-{game}-v` | `deploy-plugin.yml` | WASM parser + manifest + icon to R2 |

## Critical: Reference Module Deploy Targets

Reference modules have **split deploy targets** depending on their type:

| Module type | Identified by | Cloud deploys | Plugin deploys |
|-------------|---------------|---------------|----------------|
| Native TS (e.g. MTGA) | `reference/register.ts` exists | Entire `reference/` dir (bundled into worker) | Nothing from `reference/` |
| WASM Go (e.g. Factorio, RimWorld) | No `register.ts` | Only `reference/views/` (Svelte → views.gen.ts) | `reference/*.go`, `reference/data/` (compiled to .wasm) |

The script handles this automatically. When both cloud and plugin show changes for the same game, **both need releases** — the view HTML and the WASM binary are separate artifacts.

## Datagen artifacts (game-dependabot pattern)

Committed codegen — `plugins/magic/parser/data/arena_cards_gen.go` and the
`plugins/{d2r,factorio,rimworld,stellaris}/reference/data/*_gen.{go,rs}`
files — is **version-pinned code, not cadence data.** It is regenerated
through a reviewed, CI-gated **Pull Request**, never by the nightly data
refresh and never by a direct push to `main`.

- Refresh command: `just datagen-<game>` (v1: `just datagen-magic`). It runs
  the game's datagen on the host where the game data lives, and **only if
  the artifact changed** opens/updates a PR on `datagen/<game>-...` using the
  host's existing `gh` auth (no bot account). A no-diff run is a no-op.
- The nightly `just update-mtga` populates D1 cadence data **only** and must
  never mutate a tracked file. (Cadence data — Scryfall/17lands/rules —
  lives in D1 and is out of git entirely.)
- **Before tagging a `plugin-{game}-v` release that should carry new
  game-data coverage** (e.g. a new MTGA set), run `just datagen-<game>`,
  merge the resulting PR, then cut the tag. The merged codegen is what the
  WASM/parser build embeds.
- Other games adopt the identical `just datagen-<game>` shape as their
  datagen is automated; the rule above is the same for each.

## What the script does internally

1. Finds the latest semver tag per family using `git tag --sort=-version:refname`
2. For each tag, runs `git diff --stat <tag>..HEAD -- <paths>` to check for net changes
3. Only reports components where the net diff is non-empty (ignores touch-then-revert)
4. Plugin families are discovered dynamically from existing `plugin-*-v*` tags
5. Path mappings:
   - daemon: `internal/ cmd/ go.mod go.sum`
   - cloud: `worker/ web/ site/` + native TS `reference/` dirs + WASM `reference/views/` dirs
   - install: `install/`
   - plugin-{game}: `plugins/{game}/` excluding `tools/`, excluding `reference/views/` (WASM) or `reference/` (native TS)
