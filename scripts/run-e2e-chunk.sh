#!/usr/bin/env bash
# Runner por FRAGMENTOS (FASE 8/9) — tamaño seguro para ejecución foreground.
# Uso: run-e2e-chunk.sh <etiqueta> <spec1> <spec2> ...
set -uo pipefail
cd /home/z/my-project/Costpro
LABEL="${1:?etiqueta requerida}"; shift

echo "=== CHUNK $LABEL — BEFORE ==="
node e2e/scripts/data-hygiene-guard.cjs --before 2>&1 | sed '/dotenvx/d'
BEFORE_RC=${PIPESTATUS[0]}
if [ $BEFORE_RC -ne 0 ]; then
  echo "GUARDRAIL BEFORE FALLÓ — abortando (FASE 15)"
  exit 1
fi

LOG="/home/z/my-project/chunk-${LABEL}.log"
echo "=== CHUNK $LABEL — RUN: $* ==="
npx playwright test "$@" --reporter=line > "$LOG" 2>&1
RC=$?
grep -E "passed|failed|skipped|flaky" "$LOG" | tail -3

echo "=== CHUNK $LABEL — AFTER ==="
node e2e/scripts/data-hygiene-guard.cjs 2>&1 | sed '/dotenvx/d'
AFTER_RC=${PIPESTATUS[0]}
echo "=== CHUNK $LABEL — resultado: run=$RC after=$AFTER_RC ==="
exit $(( RC != 0 ? RC : AFTER_RC ))
