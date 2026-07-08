#!/usr/bin/env bash
# Capture a real GGG OAuth `GET /character/<name>` response into a
# testdata fixture. Default game (poe) writes the pob-server ground-truth
# fixture (cmd/pob-server/testdata); --game poe2 writes a poe2 adapter
# fixture (plugins/poe2/testdata) instead, hitting GGG's poe2-realm path
# segment the same way plugins/poe2/adapter/index.ts does.
#
# The PoE access token is pulled from D1 (staging or production, per
# --env) and piped straight into the GGG API call as a shell variable.
# It is NEVER printed, written to disk, or otherwise surfaced — only the
# (non-secret) character JSON is saved, and only after an anonymization
# pass replaces the character name with a stable placeholder. Requires:
# wrangler authed via direnv, jq.
#
# Usage:
#   scripts/capture-ggg-character.sh [--env staging|production] [--game poe|poe2] <user_uuid>            # list characters
#   scripts/capture-ggg-character.sh [--env staging|production] [--game poe|poe2] <user_uuid> <name>     # capture one
#
# --env defaults to staging. --game defaults to poe (this script's
# original behavior/output path).
#
# If GGG returns 401 the stored token has expired — run refresh_save for
# a character of the target game on the target env (refreshes it
# in-adapter), then re-run.

set -euo pipefail

ENV_TARGET="staging"
GAME="poe"
ARGS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --env)
      ENV_TARGET="${2:?--env requires an argument}"
      shift 2
      ;;
    --env=*)
      ENV_TARGET="${1#--env=}"
      shift
      ;;
    --game)
      GAME="${2:?--game requires an argument}"
      shift 2
      ;;
    --game=*)
      GAME="${1#--game=}"
      shift
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        ARGS+=("$1")
        shift
      done
      ;;
    -*)
      echo "unknown flag: $1" >&2
      exit 1
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

case "${ENV_TARGET}" in
  staging | production) ;;
  *)
    echo "--env must be 'staging' or 'production'" >&2
    exit 1
    ;;
esac
case "${GAME}" in
  poe | poe2) ;;
  *)
    echo "--game must be 'poe' or 'poe2'" >&2
    exit 1
    ;;
esac

USER_UUID="${ARGS[0]:?usage: capture-ggg-character.sh [--env staging|production] [--game poe|poe2] <user_uuid> [character_name]}"
[[ "$USER_UUID" =~ ^[A-Za-z0-9_-]+$ ]] || {
  echo "invalid user uuid" >&2
  exit 1
}
CHAR_NAME="${ARGS[1]:-}"
UA='OAuth savecraft/1.0 (contact: oauth@savecraft.gg)'
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# GGG's PoE2 character endpoints put the realm in the URL path
# (/character/poe2, /character/poe2/<name>); PoE1-PC omits it
# (/character, /character/<name>) — mirrors POE2_REALM in
# plugins/poe2/adapter/index.ts.
if [ "${GAME}" = "poe2" ]; then
  CHAR_PATH="/character/poe2"
  OUT="${REPO_ROOT}/plugins/poe2/testdata/ggg-poe2-character-real.json"
else
  CHAR_PATH="/character"
  OUT="${REPO_ROOT}/cmd/pob-server/testdata/ggg_character_real_jewels.json"
fi

if [ "${ENV_TARGET}" = "production" ]; then
  D1_DB="savecraft"
else
  D1_DB="savecraft-staging"
fi

cd "${REPO_ROOT}/worker"

# Pull the token straight into a variable — no echo, no temp file.
# sed strips wrangler's non-JSON stdout preamble (e.g. the agent-skills
# promo line it prints even with --json) so jq sees only the JSON array.
TOKEN="$(npx wrangler d1 execute "${D1_DB}" --env "${ENV_TARGET}" --remote --json \
  --command "SELECT access_token FROM provider_credentials WHERE user_uuid='${USER_UUID}' AND provider='ggg'" \
  2>/dev/null | sed -n '/^\[/,$p' | jq -r '.[0].results[0].access_token // empty')"

if [ -z "${TOKEN}" ]; then
  echo "No PoE access token for ${USER_UUID} on ${ENV_TARGET}." >&2
  echo "Connect the GGG account / run refresh_save on ${ENV_TARGET} first." >&2
  exit 1
fi

AUTH=(-H "Authorization: Bearer ${TOKEN}" -H "User-Agent: ${UA}" -H "Accept: application/json")

if [ -z "${CHAR_NAME}" ]; then
  echo "Characters for ${USER_UUID} (${ENV_TARGET}, ${GAME}):"
  code="$(curl -sS -o /tmp/ggg_chars.json -w '%{http_code}' "${AUTH[@]}" \
    "https://api.pathofexile.com${CHAR_PATH}")"
  if [ "${code}" != "200" ]; then
    echo "GGG ${CHAR_PATH} returned ${code} (token likely expired — refresh_save on ${ENV_TARGET} then retry)." >&2
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
  "https://api.pathofexile.com${CHAR_PATH}/${ENC_NAME}")"
if [ "${code}" != "200" ]; then
  echo "GGG ${CHAR_PATH}/${CHAR_NAME} returned ${code}." >&2
  echo "(401 = token expired: run refresh_save on ${ENV_TARGET}, then re-run.)" >&2
  rm -f "${OUT}"
  exit 1
fi

# Anonymize before keeping the capture: character name is not committed
# to the repo, replaced with a stable placeholder. GGG's GET
# /character[/poe2]/<name> wraps the response in { "character": {...} }
# (verified live — see worker/test/poe-fetchstate.test.ts and
# plugins/poe2/adapter/index.ts's fetchState); the poe2 fixture is
# unwrapped to the bare character object to match the existing
# plugins/poe2/testdata/*.json fixtures (imported directly as
# Poe2Character by the adapter's unit tests). The poe path is left in
# its previously-captured shape (see cmd/pob-server/testdata/README.md)
# and only redacted, not reshaped.
#
# poe2 additionally scrubs GGG's stable identifiers — the character's
# own .id plus every .equipment[].id and .jewels[].id — since those are
# durable account-linked ids, not gameplay data. Arrays are handled with
# `// []` so a capture with no jewels/equipment doesn't fail the filter.
# Per-item placeholders are index-suffixed (REDACTED-EQUIP-<n> /
# REDACTED-JEWEL-<n>), not a single shared "REDACTED" string: PoB2's
# item loading resolves items by id, so giving every item the identical
# id collides them (verified — collapses socket-group/skill resolution
# and silently zeroes the imported character's DPS in
# TestPoE2ImportRealCharacterProducesDPS). Unique-but-redacted keeps
# items distinguishable without leaking the real GGG id.
if [ "${GAME}" = "poe2" ]; then
  JQ_FILTER='.character
    | .name = "REDACTED_CHAR"
    | .id = "REDACTED"
    | .equipment = ((.equipment // []) | to_entries | map(.value.id = "REDACTED-EQUIP-\(.key)") | map(.value))
    | .jewels = ((.jewels // []) | to_entries | map(.value.id = "REDACTED-JEWEL-\(.key)") | map(.value))'
else
  JQ_FILTER='if has("character") then .character.name = "REDACTED_CHAR" else .name = "REDACTED_CHAR" end'
fi
TMP_ANON="$(mktemp)"
jq "${JQ_FILTER}" "${OUT}" >"${TMP_ANON}"
mv "${TMP_ANON}" "${OUT}"

echo "Wrote ${OUT} ($(wc -c <"${OUT}") bytes)"
if [ "${GAME}" = "poe2" ]; then
  # Non-secret summary so we can sanity-check the capture landed.
  jq '{name, class, league, level,
       equipment: (.equipment | length),
       skills: (.skills | length),
       passives_hashes: (.passives.hashes | length)}' "${OUT}"
else
  # Non-secret summary so we can sanity-check the capture has jewels.
  jq '{name, class, league, level,
       equipment: (.equipment | length),
       jewels: (.jewels | length),
       jewel_inventoryIds: ([.jewels[].inventoryId] | unique),
       jewel_x: [.jewels[] | {name: .typeLine, x, y}],
       jewel_data_keys: (.passives.jewel_data | keys)}' "${OUT}"
fi
