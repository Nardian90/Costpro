#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# Audit Harness · Migration Runner (LAB ONLY)
# Aplica las migraciones timestamped del clone en orden cronológico
# (lexical de nombre), continúa en error, y emite LEDGER por archivo.
# Reglas: nunca edita archivos del repo; excluye no-migraciones sin fecha.
# ════════════════════════════════════════════════════════════════════
set -u
PGBIN=/home/z/my-project/harness/client/usr/lib/postgresql/17/bin
export LD_LIBRARY_PATH=/home/z/my-project/harness/client/usr/lib/postgresql/17/lib:${LD_LIBRARY_PATH:-}
export PATH="$PGBIN:$PATH"
export PGHOST=${PGHOST:-127.0.0.1} PGPORT=${PGPORT:-5433} PGUSER=${PGUSER:-postgres} PGDATABASE=${PGDATABASE:-costpro_audit}
MIGDIR=/home/z/my-project/Costpro/supabase/migrations
LEDGER=${LEDGER:-/home/z/my-project/harness/logs/migration-ledger.txt}
ERRLOG=${ERRLOG:-/home/z/my-project/harness/logs/migration-errors.log}

: > "$LEDGER"; : > "$ERRLOG"

echo "== SHIMS ==" | tee -a "$LEDGER"
if psql -q -v ON_ERROR_STOP=1 -f /home/z/my-project/scripts/harness-shims.sql > /tmp/shim-out.log 2>&1; then
  echo "SHIMS OK" | tee -a "$LEDGER"
else
  echo "SHIMS FAIL — abortando" | tee -a "$LEDGER"; cat /tmp/shim-out.log; exit 1
fi

ok=0; warn=0; fail=0; skipped=0
for f in $(ls "$MIGDIR" | sort); do
  case "$f" in
    [0-9][0-9][0-9][0-9]*) ;;           # timestamped = migración real
    *) echo "SKIP  $f (no-timestamped)" | tee -a "$LEDGER"; skipped=$((skipped+1)); continue;;
  esac
  out=$(psql -q -v ON_ERROR_STOP=0 -f "$MIGDIR/$f" 2>&1 >/dev/null)
  if [ -z "$out" ]; then
    echo "OK    $f" | tee -a "$LEDGER"; ok=$((ok+1))
  else
    nerr=$(echo "$out" | grep -c "ERROR")
    echo "ERR($nerr) $f" | tee -a "$LEDGER"
    { echo "═══ $f ═══"; echo "$out"; } >> "$ERRLOG"
    if [ "$nerr" -gt 0 ]; then fail=$((fail+1)); else warn=$((warn+1)); fi
  fi
done
echo "════════════════════════════════════" | tee -a "$LEDGER"
echo "RESUMEN: ok=$ok  con_errores=$fail  skip_no_timestamped=$skipped" | tee -a "$LEDGER"
