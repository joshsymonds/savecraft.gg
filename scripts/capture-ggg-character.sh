#!/usr/bin/env bash
# Capture a real GGG OAuth `GET /character/<name>` response into a
# pob-server testdata fixture (ground truth for the GGG→PoB transform).
#
# The PoE access token is pulled from staging D1 and piped straight into
# the GGG API call as a shell variable. It is NEVER printed, written to
# disk, or otherwise surfaced — only the (non-secret) character JSON is
# saved. Requires: wrangler authed via direnv, jq.
#
# Usage:
#   scripts/capture-ggg-character.sh <staging_user_uuid>            # list characters
#   scripts/capture-ggg-character.sh <staging_user_uuid> <name>     # capture one
#
# If GGG returns 401 the stored token has expired — run refresh_save for
# any PoE character on staging (refreshes it in-adapter), then re-run.

set -euo pipefail

USER_UUID="${1:?usage: capture-ggg-character.sh <staging_user_uuid> [character_name]}"
CHAR_NAME="${2:-}"
UA='OAuth savecraft/1.0 (contact: oauth@savecraft.gg)'
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO_ROOT}/cmd/pob-server/testdata/ggg_character_real_jewels.json"

cd "${REPO_ROOT}/worker"

# Pull the token straight into a variable — no echo, no temp file.
TOKEN="$(npx wrangler d1 execute savecraft-staging --env staging --remote --json \
  --command "SELECT access_token FROM game_credentials WHERE user_uuid='${USER_UUID}' AND game_id='poe'" \
  2>/dev/null | jq -r '.[0].results[0].access_token // empty')"

if [ -z "${TOKEN}" ]; then
  echo "No PoE access token for ${USER_UUID} on staging." >&2
  echo "Connect the GGG account / run refresh_save on staging first." >&2
  exit 1
fi

AUTH=(-H "Authorization: Bearer ${TOKEN}" -H "User-Agent: ${UA}" -H "Accept: application/json")

if [ -z "${CHAR_NAME}" ]; then
  echo "Characters for ${USER_UUID}:"
  code="$(curl -sS -o /tmp/ggg_chars.json -w '%{http_code}' "${AUTH[@]}" \
    https://api.pathofexile.com/character)"
  if [ "${code}" != "200" ]; then
    echo "GGG /character returned ${code} (token likely expired — refresh_save on staging then retry)." >&2
    exit 1
  fi
  jq -r '.characters[] | "\(.name)\t\(.class)\t\(.league)\tlevel \(.level)"' /tmp/ggg_chars.json
  rm -f /tmp/ggg_chars.json
  echo
  echo "Re-run with one of the names above to capture it into the fixture."
  exit 0
fi

ENC_NAME="$(jq -rn --arg c "${CHAR_NAME}" '$c|@uri')"
code="$(curl -sS -o "${OUT}" -w '%{http_code}' "${AUTH[@]}" \
  "https://api.pathofexile.com/character/${ENC_NAME}")"
if [ "${code}" != "200" ]; then
  echo "GGG /character/${CHAR_NAME} returned ${code}." >&2
  echo "(401 = token expired: run refresh_save on staging, then re-run.)" >&2
  rm -f "${OUT}"
  exit 1
fi

echo "Wrote ${OUT} ($(wc -c <"${OUT}") bytes)"
# Non-secret summary so we can sanity-check the capture has jewels.
jq '{name, class, league, level,
     equipment: (.equipment | length),
     jewels: (.jewels | length),
     jewel_inventoryIds: ([.jewels[].inventoryId] | unique),
     jewel_x: [.jewels[] | {name: .typeLine, x, y}],
     jewel_data_keys: (.passives.jewel_data | keys)}' "${OUT}"
