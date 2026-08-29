#!/bin/bash
# ============================================================================
# run-af.sh — Ejecución canónica W6 casos A–F SOLO en costpro_audit_v2
# Evidencia → download/auditoria-multitienda/W6-AF-20260828/
# Cada caso: fixture → hash inicio → acciones → assertions → hash fin → ROLLBACK
#            → verificación de residuo (§13).
# ============================================================================
set -u
PGBIN=/home/z/my-project/harness/client/usr/lib/postgresql/17/bin
export LD_LIBRARY_PATH=/home/z/my-project/harness/client/usr/lib/postgresql/17/lib:/home/z/my-project/harness/client/usr/lib/x86_64-linux-gnu
PSQL="$PGBIN/psql -h 127.0.0.1 -p 5433 -U postgres -d costpro_audit_v2"
AFDIR=/home/z/my-project/scripts/af
EVID=/home/z/my-project/download/auditoria-multitienda/W6-AF-20260828
mkdir -p "$EVID"

run_case () {
  local letter=$1
  echo "▶ CASO $letter → $EVID/case-$letter.out"
  $PSQL -q -f "$AFDIR/af-case-$letter.sql" > "$EVID/case-$letter.out" 2>&1
  local rc=$?
  local fails=$(grep -c '|FAIL' "$EVID/case-$letter.out" || true)
  local pass=$(grep -c '|PASS' "$EVID/case-$letter.out" || true)
  local residue=$(grep 'RESIDUE' "$EVID/case-$letter.out" | grep -vc '=0' || true)
  echo "  rc=$rc asserts_PASS=$pass asserts_FAIL=$fails lineas_residuo_no_cero=$residue"
  # residuo: cualquier línea RESIDUE con valor != 0
  if grep 'RESIDUE' "$EVID/case-$letter.out" | grep -qv '=0'; then
    echo "  ⚠ RESIDUO DETECTADO en caso $letter"
    grep 'RESIDUE' "$EVID/case-$letter.out" | grep -v '=0'
  fi
}

run_case A
run_case B
run_case C
run_case D
run_case E
run_case F

echo "▶ CASO F7 (concurrencia, clon efímero)"
bash "$AFDIR/af-f7-runner.sh" > "$EVID/case-F7-conc.out" 2>&1
echo "  evidencia: case-F7-conc.out + f7-race*.out/txt"

echo "════ RESUMEN GLOBAL ════"
grep -h '|PASS\||FAIL' "$EVID"/case-*.out | sed 's/^ASSERT|//' | sort
