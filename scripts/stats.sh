#!/usr/bin/env bash
set -euo pipefail

WINDOW="${1:-24h}"
DEMO_UUID="user_3Am5RxH69moj3A8va1VjrkI983A"

# Convert window to SQLite datetime modifier
case "$WINDOW" in
    *m) MODIFIER="-${WINDOW%m} minutes" ;;
    *h) MODIFIER="-${WINDOW%h} hours" ;;
    *d) MODIFIER="-${WINDOW%d} days" ;;
    *)
        echo "Usage: $0 [Xm|Xh|Xd] (e.g. 30m, 1h, 24h, 7d)"
        exit 1
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(dirname "$SCRIPT_DIR")/worker"
DB="savecraft"
ENV="production"

d1() {
    (cd "$WORKER_DIR" && npx wrangler d1 execute "$DB" --env "$ENV" --remote --json --command "$1" 2>/dev/null)
}

# Shared CTE: users whose first D1 appearance falls within the window
NEW_USERS_CTE="WITH first_seen AS (
  SELECT user_uuid, MIN(created_at) as first_at
  FROM (
    SELECT user_uuid, created_at FROM sources WHERE user_uuid IS NOT NULL
    UNION ALL
    SELECT user_uuid, created_at FROM api_keys
  )
  GROUP BY user_uuid
  HAVING user_uuid != '${DEMO_UUID}'
    AND first_at >= datetime('now', '${MODIFIER}')
)"

echo ""
echo "Savecraft Stats (past ${WINDOW})"
echo "═══════════════════════════════════════"
echo ""

# ── Core metrics (single query) ──────────────────────
CORE=$(d1 "${NEW_USERS_CTE},
new_with_saves AS (
  SELECT DISTINCT fs.user_uuid
  FROM first_seen fs
  JOIN saves s ON s.user_uuid = fs.user_uuid
),
new_with_mcp AS (
  SELECT DISTINCT fs.user_uuid
  FROM first_seen fs
  WHERE EXISTS (SELECT 1 FROM api_keys ak WHERE ak.user_uuid = fs.user_uuid)
     OR EXISTS (SELECT 1 FROM mcp_activity ma WHERE ma.user_uuid = fs.user_uuid)
)
SELECT
  (SELECT COUNT(*) FROM first_seen) as new_signups,
  (SELECT COUNT(*) FROM new_with_saves) as with_games,
  (SELECT COUNT(*) FROM new_with_mcp) as with_mcp,
  (SELECT COUNT(*) FROM new_with_saves nws WHERE nws.user_uuid IN (SELECT user_uuid FROM new_with_mcp)) as with_both")

SIGNUPS=$(echo "$CORE" | jq -r '.[0].results[0].new_signups // 0')
WITH_GAMES=$(echo "$CORE" | jq -r '.[0].results[0].with_games // 0')
WITH_MCP=$(echo "$CORE" | jq -r '.[0].results[0].with_mcp // 0')
WITH_BOTH=$(echo "$CORE" | jq -r '.[0].results[0].with_both // 0')

pct() {
    local n="$1" total="$2"
    if [[ "$total" -eq 0 ]]; then
        echo "0"
    else
        echo $(( n * 100 / total ))
    fi
}

echo "NEW SIGNUPS: ${SIGNUPS}"
echo ""
echo "ONBOARDING (of ${SIGNUPS} new users)"
printf "  Linked games:    %4d  (%s%%)\n" "$WITH_GAMES" "$(pct "$WITH_GAMES" "$SIGNUPS")"
printf "  Connected MCP:   %4d  (%s%%)\n" "$WITH_MCP" "$(pct "$WITH_MCP" "$SIGNUPS")"
printf "  Both:            %4d  (%s%%)\n" "$WITH_BOTH" "$(pct "$WITH_BOTH" "$SIGNUPS")"
echo ""

# ── Game popularity ───────────────────────────────────
GAMES=$(d1 "${NEW_USERS_CTE}
SELECT s.game_id, COUNT(DISTINCT s.user_uuid) as users
FROM first_seen fs
JOIN saves s ON s.user_uuid = fs.user_uuid
GROUP BY s.game_id
ORDER BY users DESC")

echo "GAME POPULARITY (new users)"
GAME_ROWS=$(echo "$GAMES" | jq -r '.[0].results | length')
if [[ "$GAME_ROWS" -eq 0 ]]; then
    echo "  (none)"
else
    echo "$GAMES" | jq -r '.[0].results[] | "\(.game_id)\t\(.users)"' | column -t -s $'\t' | sed 's/^/  /'
fi
echo ""

# ── Source types ──────────────────────────────────────
SOURCES=$(d1 "${NEW_USERS_CTE}
SELECT src.source_kind, COUNT(*) as count
FROM first_seen fs
JOIN sources src ON src.user_uuid = fs.user_uuid
GROUP BY src.source_kind
ORDER BY count DESC")

echo "SOURCE TYPES (new users)"
SOURCE_ROWS=$(echo "$SOURCES" | jq -r '.[0].results | length')
if [[ "$SOURCE_ROWS" -eq 0 ]]; then
    echo "  (none)"
else
    echo "$SOURCES" | jq -r '.[0].results[] | "\(.source_kind)\t\(.count)"' | column -t -s $'\t' | sed 's/^/  /'
fi
echo ""

# ── All-time funnel ───────────────────────────────────
FUNNEL=$(d1 "SELECT
  (SELECT COUNT(DISTINCT user_uuid) FROM sources WHERE user_uuid IS NOT NULL AND user_uuid != '${DEMO_UUID}') as with_source,
  (SELECT COUNT(DISTINCT user_uuid) FROM saves WHERE user_uuid != '${DEMO_UUID}') as with_saves,
  (SELECT COUNT(DISTINCT user_uuid) FROM (
    SELECT user_uuid FROM api_keys WHERE user_uuid != '${DEMO_UUID}'
    UNION
    SELECT user_uuid FROM mcp_activity WHERE user_uuid != '${DEMO_UUID}'
  )) as with_mcp")

F_SOURCE=$(echo "$FUNNEL" | jq -r '.[0].results[0].with_source // 0')
F_SAVES=$(echo "$FUNNEL" | jq -r '.[0].results[0].with_saves // 0')
F_MCP=$(echo "$FUNNEL" | jq -r '.[0].results[0].with_mcp // 0')

echo "ALL-TIME FUNNEL"
printf "  Registered source:  %4d\n" "$F_SOURCE"
printf "  Has saves:          %4d  (%s%%)\n" "$F_SAVES" "$(pct "$F_SAVES" "$F_SOURCE")"
printf "  Connected MCP:      %4d  (%s%%)\n" "$F_MCP" "$(pct "$F_MCP" "$F_SOURCE")"
echo ""

# ── New user details ──────────────────────────────────
DETAILS=$(d1 "${NEW_USERS_CTE}
SELECT
  fs.user_uuid,
  fs.first_at,
  (SELECT GROUP_CONCAT(DISTINCT s.game_id) FROM saves s WHERE s.user_uuid = fs.user_uuid) as games,
  CASE WHEN EXISTS (SELECT 1 FROM api_keys ak WHERE ak.user_uuid = fs.user_uuid)
            OR EXISTS (SELECT 1 FROM mcp_activity ma WHERE ma.user_uuid = fs.user_uuid)
       THEN 1 ELSE 0 END as has_mcp,
  (SELECT hostname FROM sources src WHERE src.user_uuid = fs.user_uuid ORDER BY src.created_at DESC LIMIT 1) as hostname,
  (SELECT source_kind FROM sources src WHERE src.user_uuid = fs.user_uuid ORDER BY src.created_at DESC LIMIT 1) as source_kind
FROM first_seen fs
ORDER BY fs.first_at DESC")

DETAIL_ROWS=$(echo "$DETAILS" | jq -r '.[0].results | length')
if [[ "$DETAIL_ROWS" -gt 0 ]]; then
    echo "NEW USER DETAILS"
    echo "$DETAILS" | jq -r '.[0].results[] |
        "  \(.first_at)  \(.source_kind // "-")  \(.hostname // "-")  games=\(.games // "none")  mcp=\(if .has_mcp > 0 then "yes" else "no" end)"'
    echo ""
fi
