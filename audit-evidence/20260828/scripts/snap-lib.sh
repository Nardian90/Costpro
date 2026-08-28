#!/usr/bin/env bash
# snap-lib.sh — shared helper for READ-ONLY catalog extraction from Supabase production
# Protocol: Opción A autorizada por el dueño (2026-08-28).
# Regla inviolable: SOLO sentencias SELECT contra pg_catalog / information_schema.
#   Nada de INSERT/UPDATE/DELETE/DDL/RPC mutativa. Sin datos de negocio.
set -u
REF="wthkddeleylijmonclxg"
API="https://api.supabase.com/v1/projects/$REF/database/query"
source /home/z/my-project/Costpro/.env
RAW="/home/z/my-project/download/auditoria-multitienda/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT/extraction-raw"
QLOG="/home/z/my-project/download/auditoria-multitienda/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT/extraction-queries.log"

# q <slug> <sql-file>  → runs the SELECT, saves pristine response + logs the query
q() {
  local slug="$1" sqlfile="$2"
  local payload="/tmp/payload-$slug.json" resp="$RAW/$slug.response.json"
  jq -n --rawfile s "$sqlfile" '{query:$s}' > "$payload"
  local code
  code=$(curl -sS -m 120 -o "$resp" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" -d @"$payload" "$API")
  {
    echo "-- [$slug] $(date -u +%Y-%m-%dT%H:%M:%SZ) http=$code"
    cat "$sqlfile"
    echo
  } >> "$QLOG"
  if [ "$code" != "200" ] && [ "$code" != "201" ]; then
    echo "FAIL[$slug http=$code]:" >&2; head -c 400 "$resp" >&2; echo >&2
    return 1
  fi
  if jq -e 'type=="object" and has("message")' "$resp" >/dev/null 2>&1; then
    echo "SQLERR[$slug]:" >&2; head -c 400 "$resp" >&2; echo >&2
    return 1
  fi
  echo "OK[$slug] rows=$(jq 'length' "$resp")"
}
