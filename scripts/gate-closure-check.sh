#!/bin/bash
# ============================================================================
# GATE-CLOSURE CHECK — REGLA PERMANENTE (RECOVERY-PO-1 §20/§21)
#
#   "NO se puede emitir FINAL VERDICT de un gate si existen commits locales
#    sin publicar."
#
#   Orden obligatorio: AUDIT → FIX → TEST → EVIDENCE → COMMIT → PUSH →
#                      FETCH → VERIFY REMOTE → WORKTREE CLEAN → FINAL VERDICT
#
# Uso:   bash scripts/gate-closure-check.sh
# Exit:  0 = gate puede cerrarse   1 = FINAL VERDICT = NOT CLOSED
# ============================================================================
set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 2

DIRTY=$(git status --short | wc -l | tr -d ' ')
HEAD_SHA=$(git rev-parse HEAD 2>/dev/null)
git fetch origin 2>/dev/null
REMOTE_SHA=$(git rev-parse origin/main 2>/dev/null)

echo "WORKTREE CLEAN : $([ "$DIRTY" = "0" ] && echo YES || echo "NO ($DIRTY cambios)")"
echo "HEAD           : ${HEAD_SHA:-N/A}"
echo "ORIGIN/MAIN    : ${REMOTE_SHA:-N/A}"

if [ -z "${HEAD_SHA:-}" ] || [ -z "${REMOTE_SHA:-}" ]; then
  echo "FINAL VERDICT  : NOT CLOSED (refs indisponibles)"; exit 1
fi
if [ "$DIRTY" != "0" ]; then
  echo "FINAL VERDICT  : NOT CLOSED (worktree sucio)"; exit 1
fi
if [ "$HEAD_SHA" != "$REMOTE_SHA" ]; then
  echo "FINAL VERDICT  : NOT CLOSED (HEAD != origin/main — PUSH PENDIENTE)"; exit 1
fi
echo "FINAL VERDICT  : CLOSURE OK (HEAD == origin/main, worktree clean)"
exit 0
