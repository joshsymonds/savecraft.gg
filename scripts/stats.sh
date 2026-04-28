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
    UNION ALL
    SELECT user_uuid, created_at FROM mcp_tool_calls
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
     OR EXISTS (SELECT 1 FROM mcp_tool_calls ma WHERE ma.user_uuid = fs.user_uuid)
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

# ── Source usage: who installed/connected what, and who actually used it ─
SRC=$(d1 "
WITH all_users AS (
  SELECT DISTINCT user_uuid FROM (
    SELECT user_uuid FROM sources WHERE user_uuid IS NOT NULL
    UNION ALL SELECT user_uuid FROM api_keys
    UNION ALL SELECT user_uuid FROM mcp_tool_calls
  ) WHERE user_uuid != '${DEMO_UUID}'
),
daemon_inst AS (
  SELECT DISTINCT user_uuid FROM sources
  WHERE source_kind = 'daemon' AND user_uuid IS NOT NULL AND user_uuid != '${DEMO_UUID}'
),
daemon_used AS (
  SELECT DISTINCT user_uuid FROM sources
  WHERE source_kind = 'daemon' AND last_push_at IS NOT NULL
    AND user_uuid IS NOT NULL AND user_uuid != '${DEMO_UUID}'
),
adapter_inst AS (
  SELECT DISTINCT user_uuid FROM sources
  WHERE source_kind = 'adapter' AND user_uuid IS NOT NULL AND user_uuid != '${DEMO_UUID}'
),
adapter_used AS (
  SELECT DISTINCT user_uuid FROM sources
  WHERE source_kind = 'adapter' AND last_push_at IS NOT NULL
    AND user_uuid IS NOT NULL AND user_uuid != '${DEMO_UUID}'
)
SELECT
  (SELECT COUNT(*) FROM all_users) AS total,
  (SELECT COUNT(*) FROM daemon_inst) AS daemon_i,
  (SELECT COUNT(*) FROM daemon_used) AS daemon_u,
  (SELECT COUNT(*) FROM adapter_inst) AS adapter_i,
  (SELECT COUNT(*) FROM adapter_used) AS adapter_u,
  (SELECT COUNT(*) FROM all_users
    WHERE user_uuid NOT IN (SELECT user_uuid FROM daemon_inst)
      AND user_uuid NOT IN (SELECT user_uuid FROM adapter_inst)) AS no_source
")

T_TOTAL=$(echo "$SRC" | jq -r '.[0].results[0].total // 0')
T_D_I=$(echo "$SRC" | jq -r '.[0].results[0].daemon_i // 0')
T_D_U=$(echo "$SRC" | jq -r '.[0].results[0].daemon_u // 0')
T_A_I=$(echo "$SRC" | jq -r '.[0].results[0].adapter_i // 0')
T_A_U=$(echo "$SRC" | jq -r '.[0].results[0].adapter_u // 0')
T_NONE=$(echo "$SRC" | jq -r '.[0].results[0].no_source // 0')
T_D_DEAD=$((T_D_I - T_D_U))

echo "SOURCE USAGE (all-time, distinct users)"
{
    printf 'segment\tusers\tof total\n'
    printf 'Total users\t%d\t100%%\n' "$T_TOTAL"
    printf '  Daemon installed\t%d\t%d%%\n'         "$T_D_I"   "$(pct $T_D_I    $T_TOTAL)"
    printf '    pushed data\t%d\t%d%%\n'            "$T_D_U"   "$(pct $T_D_U    $T_TOTAL)"
    printf '    installed but never used\t%d\t%d%%\n' "$T_D_DEAD" "$(pct $T_D_DEAD $T_TOTAL)"
    printf '  Adapter connected\t%d\t%d%%\n'        "$T_A_I"   "$(pct $T_A_I    $T_TOTAL)"
    printf '    pulled data\t%d\t%d%%\n'            "$T_A_U"   "$(pct $T_A_U    $T_TOTAL)"
    printf '  No source (reference-only)\t%d\t%d%%\n' "$T_NONE"  "$(pct $T_NONE   $T_TOTAL)"
} | column -t -s $'\t' | sed 's/^/  /'
echo ""

# ── Conversion funnel: depth (cumulative) + retention (separate axis) ────
CONV=$(d1 "
WITH all_users AS (
  SELECT DISTINCT user_uuid FROM (
    SELECT user_uuid FROM sources WHERE user_uuid IS NOT NULL
    UNION ALL SELECT user_uuid FROM api_keys
    UNION ALL SELECT user_uuid FROM mcp_tool_calls
  ) WHERE user_uuid != '${DEMO_UUID}'
),
queried AS (
  SELECT DISTINCT user_uuid FROM mcp_tool_calls WHERE user_uuid != '${DEMO_UUID}'
),
user_games AS (
  SELECT DISTINCT user_uuid, json_extract(params, '\$.game_id') AS game_id
  FROM mcp_tool_calls
  WHERE user_uuid != '${DEMO_UUID}'
    AND params IS NOT NULL AND json_valid(params) = 1
    AND json_extract(params, '\$.game_id') IS NOT NULL
  UNION
  SELECT DISTINCT m.user_uuid, s.game_id
  FROM mcp_tool_calls m
  JOIN saves s ON s.uuid = json_extract(m.params, '\$.save_id')
  WHERE m.user_uuid != '${DEMO_UUID}'
    AND m.params IS NOT NULL AND json_valid(m.params) = 1
    AND json_extract(m.params, '\$.save_id') IS NOT NULL
),
games_per_user AS (
  SELECT user_uuid, COUNT(DISTINCT game_id) AS n_games FROM user_games GROUP BY user_uuid
),
days_per_user AS (
  SELECT user_uuid, COUNT(DISTINCT substr(created_at, 1, 10)) AS n_days
  FROM mcp_tool_calls WHERE user_uuid != '${DEMO_UUID}'
  GROUP BY user_uuid
)
SELECT
  (SELECT COUNT(*) FROM all_users) AS s1_signup,
  (SELECT COUNT(*) FROM queried) AS s2_query,
  (SELECT COUNT(*) FROM games_per_user WHERE n_games >= 1) AS s3_game,
  (SELECT COUNT(*) FROM games_per_user WHERE n_games >= 2) AS s4_multi,
  (SELECT COUNT(*) FROM games_per_user g JOIN days_per_user d ON d.user_uuid = g.user_uuid
     WHERE g.n_games >= 1 AND d.n_days >= 2) AS r2_returned,
  (SELECT COUNT(*) FROM games_per_user g JOIN days_per_user d ON d.user_uuid = g.user_uuid
     WHERE g.n_games >= 1 AND d.n_days >= 3) AS r3_returned
")

S1=$(echo "$CONV" | jq -r '.[0].results[0].s1_signup // 0')
S2=$(echo "$CONV" | jq -r '.[0].results[0].s2_query // 0')
S3=$(echo "$CONV" | jq -r '.[0].results[0].s3_game // 0')
S4=$(echo "$CONV" | jq -r '.[0].results[0].s4_multi // 0')
R2=$(echo "$CONV" | jq -r '.[0].results[0].r2_returned // 0')
R3=$(echo "$CONV" | jq -r '.[0].results[0].r3_returned // 0')

echo "ENGAGEMENT DEPTH (all-time, cumulative)"
{
    printf 'step\tusers\tfrom prev\tof signups\n'
    printf '1. Signed up\t%d\t-\t100%%\n'              "$S1"
    printf '2. Made any MCP query\t%d\t%d%%\t%d%%\n'   "$S2" "$(pct $S2 $S1)" "$(pct $S2 $S1)"
    printf '3. Talked about a game\t%d\t%d%%\t%d%%\n'  "$S3" "$(pct $S3 $S2)" "$(pct $S3 $S1)"
    printf '4. Talked about 2+ games\t%d\t%d%%\t%d%%\n' "$S4" "$(pct $S4 $S3)" "$(pct $S4 $S1)"
} | column -t -s $'\t' | sed 's/^/  /'
echo ""

echo "RETENTION (of ${S3} users who talked about a game)"
{
    printf 'milestone\tusers\tof gamers\n'
    printf 'Came back (>=2 active days)\t%d\t%d%%\n' "$R2" "$(pct $R2 $S3)"
    printf 'Returned often (>=3 days)\t%d\t%d%%\n'  "$R3" "$(pct $R3 $S3)"
} | column -t -s $'\t' | sed 's/^/  /'
echo ""

# ── Retention by acquisition client (first MCP client per user) ──────────
PCR=$(d1 "
WITH first_client AS (
  SELECT user_uuid, mcp_client FROM (
    SELECT user_uuid, mcp_client,
           ROW_NUMBER() OVER (PARTITION BY user_uuid ORDER BY created_at) AS rn
    FROM mcp_tool_calls WHERE user_uuid != '${DEMO_UUID}'
  ) WHERE rn = 1
),
days_per_user AS (
  SELECT user_uuid, COUNT(DISTINCT substr(created_at, 1, 10)) AS n_days
  FROM mcp_tool_calls WHERE user_uuid != '${DEMO_UUID}'
  GROUP BY user_uuid
)
SELECT fc.mcp_client AS client,
       COUNT(*) AS users,
       SUM(CASE WHEN d.n_days >= 2 THEN 1 ELSE 0 END) AS r2,
       SUM(CASE WHEN d.n_days >= 3 THEN 1 ELSE 0 END) AS r3
FROM first_client fc
LEFT JOIN days_per_user d ON d.user_uuid = fc.user_uuid
GROUP BY fc.mcp_client ORDER BY users DESC")

echo "RETENTION BY ACQUISITION CLIENT (first MCP client per user)"
{
    printf 'client\tusers\t>=2 days\t>=3 days\n'
    echo "$PCR" | jq -r '.[0].results[] | "\(.client)\t\(.users)\t\(.r2)\t\(.r3)"' \
      | while IFS=$'\t' read -r c u r2 r3; do
            p2=$(pct "$r2" "$u")
            p3=$(pct "$r3" "$u")
            printf '%s\t%d\t%d (%d%%)\t%d (%d%%)\n' "$c" "$u" "$r2" "$p2" "$r3" "$p3"
        done
} | column -t -s $'\t' | sed 's/^/  /'
echo ""

# ── MCP client breakdown (windowed, with prior-window comparison) ────────
CLIENTS=$(d1 "
WITH first_call AS (
  SELECT user_uuid, mcp_client, created_at,
         ROW_NUMBER() OVER (PARTITION BY user_uuid ORDER BY created_at) AS rn
  FROM mcp_tool_calls
  WHERE user_uuid != '${DEMO_UUID}'
),
recent AS (
  SELECT mcp_client,
         COUNT(*) AS calls,
         COUNT(DISTINCT user_uuid) AS users
  FROM mcp_tool_calls
  WHERE user_uuid != '${DEMO_UUID}'
    AND created_at >= datetime('now', '${MODIFIER}')
  GROUP BY mcp_client
),
prior AS (
  SELECT mcp_client,
         COUNT(DISTINCT user_uuid) AS users
  FROM mcp_tool_calls
  WHERE user_uuid != '${DEMO_UUID}'
    AND created_at >= datetime('now', '${MODIFIER}', '${MODIFIER}')
    AND created_at <  datetime('now', '${MODIFIER}')
  GROUP BY mcp_client
),
new_now AS (
  SELECT mcp_client, COUNT(*) AS new_users
  FROM first_call
  WHERE rn = 1
    AND created_at >= datetime('now', '${MODIFIER}')
  GROUP BY mcp_client
)
SELECT r.mcp_client AS client,
       r.calls,
       r.users,
       COALESCE(n.new_users, 0) AS new_users,
       COALESCE(p.users, 0) AS prev_users
FROM recent r
LEFT JOIN prior   p ON r.mcp_client = p.mcp_client
LEFT JOIN new_now n ON r.mcp_client = n.mcp_client
ORDER BY r.calls DESC")

echo "MCP CLIENT BREAKDOWN (this ${WINDOW} vs prior ${WINDOW})"
CLIENT_ROWS=$(echo "$CLIENTS" | jq -r '.[0].results | length')
if [[ "$CLIENT_ROWS" -eq 0 ]]; then
    echo "  (no MCP activity)"
else
    printf "  %-15s %8s %8s %8s %12s\n" "client" "calls" "users" "new" "prev_users"
    echo "$CLIENTS" | jq -r '.[0].results[] |
        "  \(.client // "unknown" | .[0:15])\t\(.calls)\t\(.users)\t\(.new_users)\t\(.prev_users)"' \
        | awk -F'\t' '{printf "  %-15s %8s %8s %8s %12s\n", $1, $2, $3, $4, $5}'
fi
echo ""

# ── Reference-only retention (all-time, the daemon-optional bet) ─────────
REF=$(d1 "
WITH ref_only AS (
  SELECT DISTINCT user_uuid
  FROM mcp_tool_calls
  WHERE user_uuid != '${DEMO_UUID}'
    AND user_uuid NOT IN (SELECT user_uuid FROM sources WHERE user_uuid IS NOT NULL)
),
active_days AS (
  SELECT user_uuid, COUNT(DISTINCT substr(created_at, 1, 10)) AS days
  FROM mcp_tool_calls
  WHERE user_uuid IN (SELECT user_uuid FROM ref_only)
  GROUP BY user_uuid
)
SELECT
  (SELECT COUNT(*) FROM ref_only) AS total,
  (SELECT COUNT(*) FROM active_days WHERE days >= 2) AS returned,
  (SELECT COUNT(*) FROM active_days WHERE days >= 3) AS three_plus")

REF_TOTAL=$(echo "$REF" | jq -r '.[0].results[0].total // 0')
REF_RETURNED=$(echo "$REF" | jq -r '.[0].results[0].returned // 0')
REF_THREE=$(echo "$REF" | jq -r '.[0].results[0].three_plus // 0')

echo "REFERENCE-ONLY RETENTION (all-time)"
printf "  Reference-only users:    %4d\n" "$REF_TOTAL"
printf "    ≥2 active days:        %4d  (%s%%)\n" "$REF_RETURNED" "$(pct "$REF_RETURNED" "$REF_TOTAL")"
printf "    ≥3 active days:        %4d  (%s%%)\n" "$REF_THREE" "$(pct "$REF_THREE" "$REF_TOTAL")"
echo ""

# ── New user details ──────────────────────────────────
DETAILS=$(d1 "${NEW_USERS_CTE}
SELECT
  fs.user_uuid,
  fs.first_at,
  (SELECT GROUP_CONCAT(DISTINCT s.game_id) FROM saves s WHERE s.user_uuid = fs.user_uuid) as games,
  CASE WHEN EXISTS (SELECT 1 FROM api_keys ak WHERE ak.user_uuid = fs.user_uuid)
            OR EXISTS (SELECT 1 FROM mcp_tool_calls ma WHERE ma.user_uuid = fs.user_uuid)
       THEN 1 ELSE 0 END as has_mcp,
  (SELECT mcp_client FROM mcp_tool_calls m WHERE m.user_uuid = fs.user_uuid ORDER BY m.created_at LIMIT 1) as first_client,
  (SELECT hostname FROM sources src WHERE src.user_uuid = fs.user_uuid ORDER BY src.created_at DESC LIMIT 1) as hostname,
  (SELECT source_kind FROM sources src WHERE src.user_uuid = fs.user_uuid ORDER BY src.created_at DESC LIMIT 1) as source_kind
FROM first_seen fs
ORDER BY fs.first_at DESC")

DETAIL_ROWS=$(echo "$DETAILS" | jq -r '.[0].results | length')
if [[ "$DETAIL_ROWS" -gt 0 ]]; then
    echo "NEW USER DETAILS"
    echo "$DETAILS" | jq -r '.[0].results[] |
        "  \(.first_at)  \(.source_kind // "ref-only")  \(.hostname // "-")  games=\(.games // "none")  mcp=\(if .has_mcp > 0 then "yes (\(.first_client // "?"))" else "no" end)"'
    echo ""
fi
