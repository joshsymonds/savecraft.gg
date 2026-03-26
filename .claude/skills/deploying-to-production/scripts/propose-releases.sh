#!/usr/bin/env bash
# propose-releases.sh — Find what changed since last production tag per component
#
# For each component, finds the latest semver tag, diffs to HEAD filtered by
# the component's relevant paths, and reports only components with net changes.
#
# Usage: bash .claude/skills/deploying-to-production/scripts/propose-releases.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Component definitions: tag_prefix|paths (space-separated, passed to git -- <paths>)
#
# IMPORTANT: Native TypeScript reference modules (plugins/*/reference/) are
# bundled into the main worker and deploy via cloud, NOT via plugin deploy.
# Plugin entries exclude reference/ and tools/ directories.
COMPONENTS=(
  "daemon|internal/ cmd/ go.mod go.sum"
  "cloud|worker/ web/ site/ plugins/*/reference/"
  "install|install/"
)

# Dynamically discover plugin tag families
while IFS= read -r family; do
  game_id="${family#plugin-}"
  COMPONENTS+=("${family}|plugins/${game_id}/ :(exclude)plugins/${game_id}/reference/ :(exclude)plugins/${game_id}/tools/")
done < <(git tag --list 'plugin-*-v*' | sed -E 's/-v[0-9]+\.[0-9]+\.[0-9]+.*$//' | sort -u)

found_changes=false

for entry in "${COMPONENTS[@]}"; do
  IFS='|' read -r prefix paths <<< "$entry"
  tag_pattern="${prefix}-v*"

  latest=$(git tag --list "$tag_pattern" --sort=-version:refname | head -1)
  if [[ -z "$latest" ]]; then
    echo "=== ${prefix}: no tags found matching ${tag_pattern} ==="
    echo ""
    continue
  fi

  # Use git diff (net change) as source of truth, not git log.
  # git log shows commits that touched paths even if changes cancelled out.
  # shellcheck disable=SC2086
  diff_stat=$(git diff --stat "${latest}..HEAD" -- $paths 2>/dev/null || true)

  if [[ -z "$diff_stat" ]]; then
    continue
  fi

  found_changes=true

  # Get commits for context
  # shellcheck disable=SC2086
  commits=$(git log --oneline "${latest}..HEAD" -- $paths 2>/dev/null || true)
  commit_count=$(echo "$commits" | wc -l | tr -d ' ')

  echo "=== ${prefix} (latest: ${latest}) — ${commit_count} commit(s) ==="
  echo ""
  echo "Commits:"
  echo "$commits"
  echo ""
  echo "Net diff:"
  echo "$diff_stat"
  echo ""
done

if [[ "$found_changes" == "false" ]]; then
  echo "No components have changes since their last production tag."
fi
