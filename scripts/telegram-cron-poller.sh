#!/usr/bin/env bash
#
# Local cron-poller for Telegram auto-publish.
#
# Why this exists:
#   vercel.json declares a cron that hits /api/cron/telegram-auto-publish
#   every 5 minutes. But Vercel Cron only fires for VERCEL DEPLOYMENTS,
#   not for the local PM2 server. If the user is running locally, or if
#   the Vercel/Render deployment is outdated and returns 404, no cron
#   fires and auto-publish never happens.
#
# This script runs under PM2 as a daemon. Every 60 seconds it wakes up
# and checks: has it been at least 5 minutes since the last invocation?
# If yes, it curls the local /api/cron/telegram-auto-publish endpoint.
# The endpoint itself is idempotent (per-store interval check), so
# calling it more often than the configured interval is safe — the
# endpoint will return "skipped: interval_not_elapsed" for stores whose
# interval hasn't elapsed yet.
#
# Configuration:
#   - POLL_INTERVAL_SECONDS (default 60): how often this script wakes up
#   - CRON_HIT_INTERVAL_SECONDS (default 300 = 5 min): minimum time
#     between calls to the endpoint
#   - TARGET_URL: defaults to http://localhost:3000/api/cron/telegram-auto-publish
#
# Logs go to stdout/stderr which PM2 captures into the log file.
# Use `pm2 logs telegram-cron-poller` to inspect.

set -euo pipefail

POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-60}"
CRON_HIT_INTERVAL_SECONDS="${CRON_HIT_INTERVAL_SECONDS:-300}"
TARGET_URL="${TARGET_URL:-http://localhost:3000/api/cron/telegram-auto-publish}"
STATE_FILE="${STATE_FILE:-/tmp/telegram-cron-poller-last-run}"

echo "[telegram-cron-poller] Starting — poll every ${POLL_INTERVAL_SECONDS}s, hit endpoint every ${CRON_HIT_INTERVAL_SECONDS}s"
echo "[telegram-cron-poller] Target: ${TARGET_URL}"

while true; do
  NOW_EPOCH=$(date +%s)

  # Read last run timestamp (if state file exists)
  LAST_RUN_EPOCH=0
  if [ -f "${STATE_FILE}" ]; then
    LAST_RUN_EPOCH=$(cat "${STATE_FILE}" 2>/dev/null || echo 0)
  fi

  ELAPSED=$((NOW_EPOCH - LAST_RUN_EPOCH))

  if [ "${ELAPSED}" -ge "${CRON_HIT_INTERVAL_SECONDS}" ]; then
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[${TIMESTAMP}] Hitting ${TARGET_URL} (elapsed since last: ${ELAPSED}s)"

    # Make the request with a 30s timeout
    HTTP_RESPONSE=$(curl -s -m 30 -w "\n%{http_code}" "${TARGET_URL}" 2>&1 || echo "curl-failed")
    HTTP_BODY=$(echo "${HTTP_RESPONSE}" | head -n -1)
    HTTP_CODE=$(echo "${HTTP_RESPONSE}" | tail -n1)

    echo "[${TIMESTAMP}] HTTP ${HTTP_CODE}"
    echo "[${TIMESTAMP}] Body: ${HTTP_BODY:0:500}"

    # Update state file only if curl succeeded (HTTP 200)
    if [ "${HTTP_CODE}" = "200" ]; then
      echo "${NOW_EPOCH}" > "${STATE_FILE}"
    fi
  else
    # Skip silently (would be noisy to log every 60s)
    :
  fi

  sleep "${POLL_INTERVAL_SECONDS}"
done
