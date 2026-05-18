#!/usr/bin/env bash
# Push GGG OAuth secrets from the gitignored root .env.local into a
# Cloudflare Worker environment's secret store.
#
# The values are read from .env.local into shell variables and piped
# straight into `wrangler secret put` over stdin. They are NEVER echoed,
# logged, or written anywhere else. Idempotent (re-running overwrites).
#
# Usage: scripts/push-ggg-secrets.sh <staging|production>

set -euo pipefail

ENV_TARGET="${1:?usage: push-ggg-secrets.sh <staging|production>}"
case "${ENV_TARGET}" in
  staging|production) ;;
  *) echo "env must be 'staging' or 'production'" >&2; exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.local"
[ -f "${ENV_FILE}" ] || { echo ".env.local not found at ${ENV_FILE}" >&2; exit 1; }

# Extract a KEY=value from .env.local: last occurrence wins, optional
# `export ` prefix, optional surrounding single/double quotes stripped.
read_env() {
  local key="$1" line
  line="$(grep -E "^(export +)?${key}=" "${ENV_FILE}" | tail -n1 || true)"
  [ -n "${line}" ] || return 1
  line="${line#export }"
  line="${line#"${key}"=}"
  # strip a single matched pair of surrounding quotes
  case "${line}" in
    \"*\") line="${line%\"}"; line="${line#\"}" ;;
    \'*\') line="${line%\'}"; line="${line#\'}" ;;
  esac
  printf '%s' "${line}"
}

cd "${REPO_ROOT}/worker"

for key in GGG_CLIENT_ID GGG_CLIENT_SECRET; do
  if ! val="$(read_env "${key}")" || [ -z "${val}" ]; then
    echo "Missing ${key} in .env.local" >&2
    exit 1
  fi
  # printf %s → no trailing newline in the stored secret.
  printf '%s' "${val}" | npx wrangler secret put "${key}" --env "${ENV_TARGET}" >/dev/null
  unset val
  echo "set ${key} on ${ENV_TARGET}"
done

echo "Done. GGG_CLIENT_ID + GGG_CLIENT_SECRET set on ${ENV_TARGET} (values not displayed)."
