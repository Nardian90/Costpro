#!/bin/bash
# R1 · §23 concurrency test — two parallel attempts of the full repair script
# Both MUST be rejected by barrier B1 (batch already applied) with 0 additional mutations.
set -u
COSTPRO=/home/z/my-project/Costpro
R1=$COSTPRO/audit-evidence/20260906-w9-b10b-obs2-r1
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' "$COSTPRO/.env" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')

node "$COSTPRO/audit-evidence/20260905-w9-b10b/scripts/b10b_query.js" \
  "$R1/scripts/r1_execute.sql" "$R1/raw/r1_concurrent_attempt_1.json" > /tmp/c1.log 2>&1 &
P1=$!
node "$COSTPRO/audit-evidence/20260905-w9-b10b/scripts/b10b_query.js" \
  "$R1/scripts/r1_execute.sql" "$R1/raw/r1_concurrent_attempt_2.json" > /tmp/c2.log 2>&1 &
P2=$!
wait $P1; E1=$?
wait $P2; E2=$?
echo "attempt1_exit=$E1 (expected 1=REJECT)"
echo "attempt2_exit=$E2 (expected 1=REJECT)"
echo "--- attempt1 error ---"; head -c 220 "$R1/raw/r1_concurrent_attempt_1.json" 2>/dev/null || cat /tmp/c1.log | head -2
echo; echo "--- attempt2 error ---"; head -c 220 "$R1/raw/r1_concurrent_attempt_2.json" 2>/dev/null || cat /tmp/c2.log | head -2
echo
node "$COSTPRO/audit-evidence/20260905-w9-b10b/scripts/b10b_query.js" \
  "$R1/scripts/r1_after_concurrency.sql" "$R1/raw/r1_after_concurrency.json"
