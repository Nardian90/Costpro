#!/usr/bin/env bash
#
# Local cron-poller for WhatsApp auto-publish.
#
# Same pattern as telegram-cron-poller.sh but for WhatsApp.
# Hits /api/cron/whatsapp-auto-publish every 5 min.
#
# IMPORTANT: WhatsApp requires an active Baileys session (live WebSocket).
# If no store has a connected WhatsApp session, the cron will skip them all
# with reason='no_session'. This is correct behavior — not an error.
#
# Logs go to stdout/stderr which PM2 captures.
# Use `pm2 logs whatsapp-cron-poller` to inspect.

set -euo pipefail

POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-60}"
CRON_HIT_INTERVAL_SECONDS="${CRON_HIT_INTERVAL_SECONDS:-300}"
TARGET_URL="${TARGET_URL:-http://localhost:3000/api/cron/whatsapp-auto-publish}"
STATE_FILE="${STATE_FILE:-/tmp/whatsapp-cron-poller-last-run}"

echo "[whatsapp-cron-poller] Starting — poll every ${POLL_INTERVAL_SECONDS}s, hit endpoint every ${CRON_HIT_INTERVAL_SECONDS}s"
echo "[whatsapp-cron-poller] Target: ${TARGET_URL}"

while true; do
  NOW_EPOCH=$(date +%s)

  LAST_RUN_EPOCH=0
  if [ -f "${STATE_FILE}" ]; then
    LAST_RUN_EPOCH=$(cat "${STATE_FILE}" 2>/dev/null || echo 0)
  fi

  ELAPSED=$((NOW_EPOCH - LAST_RUN_EPOCH))

  if [ "${ELAPSED}" -ge "${CRON_HIT_INTERVAL_SECONDS}" ]; then
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[${TIMESTAMP}] Hitting ${TARGET_URL} (elapsed since last: ${ELAPSED}s)"

    HTTP_RESPONSE=$(curl -s -m 30 -w "\n%{http_code}" "${TARGET_URL}" 2>&1 || echo "curl-failed")
    HTTP_BODY=$(echo "${HTTP_RESPONSE}" | head -n -1)
    HTTP_CODE=$(echo "${HTTP_RESPONSE}" | tail -n1)

    echo "[${TIMESTAMP}] HTTP ${HTTP_CODE}"
    echo "[${TIMESTAMP}] Body: ${HTTP_BODY:0:500}"

    if [ "${HTTP_CODE}" = "200" ]; then
      echo "${NOW_EPOCH}" > "${STATE_FILE}"
    fi
  fi

  sleep "${POLL_INTERVAL_SECONDS}"
done
