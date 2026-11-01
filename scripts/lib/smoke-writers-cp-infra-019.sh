#!/usr/bin/env bash
# Smoke test CP-INFRA-019: los 11 escritores, ejecutados con un .env de
# PRUEBA que apunta a PRODUCCIÓN (wthkddeleylijmonclxg) y con entorno
# controlado. Todos deben BLOQUEARSE (exit != 0, mensaje BLOQUEADO) antes de
# cualquier petición externa.
#
# El .env de prueba (URL de producción + token dummy) garantiza que los
# escritores que leen .env con parser local (apply-migration.cjs, m003, m004,
# pgrst, landing-demo, seed) lleguen AL GUARD con un destino identificable —
# en un checkout de CI sin .env morirían en ENOENT antes de validarlo, que
# también es fail-safe pero no ejercita el guard. Si el repo ya tiene .env
# (p.ej. el sandbox), se usa una COPIA y se restaura al terminar; el original
# no se toca.
#
# Uso: bash scripts/lib/smoke-writers-cp-infra-019.sh  (desde la raíz del repo)
set -u
cd "$(dirname "$0")/../.." || exit 1

TEST_ENV_URL="https://wthkddeleylijmonclxg.supabase.co" # PRODUCCIÓN (debe bloquear)
HAD_ENV=0
cleanup() {
  if [ "$HAD_ENV" = "1" ]; then
    mv -f .env.smoke-bak .env 2>/dev/null || true
  else
    rm -f .env
  fi
  rm -f .env.smoke-bak
}
trap cleanup EXIT
if [ -f .env ]; then
  HAD_ENV=1
  cp .env .env.smoke-bak
fi
printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=dummy-key-smoke\nSUPABASE_ACCESS_TOKEN=dummy-token-smoke\nE2E_SUPABASE_URL=%s\n' \
  "$TEST_ENV_URL" "$TEST_ENV_URL" > .env

PASS=0; FAIL=0
run_case() { # <nombre> <comando...>
  local name="$1"; shift
  local out rc
  out="$(timeout 25 "$@" 2>&1)"; rc=$?
  if [ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'BLOQUEADO'; then
    echo "PASS  $name (exit $rc, bloqueado por el guard)"
    PASS=$((PASS+1))
  else
    echo "FAIL  $name — exit=$rc"
    printf '%s\n' "$out" | head -4 | sed 's/^/      /'
    FAIL=$((FAIL+1))
  fi
}

echo "═══ Caso 1: entorno REAL (.env del repo = producción) — todos bloqueados ═══"
run_case "apply-rpc-fix.sh (ref prod hardcodeado)"        bash scripts/apply-rpc-fix.sh
run_case "apply-migration.cjs (URL .env = prod)"          node scripts/apply-migration.cjs
run_case "apply-sql-migration.js (URL env = prod)"        env NEXT_PUBLIC_SUPABASE_URL=https://wthkddeleylijmonclxg.supabase.co node scripts/apply-sql-migration.js
run_case "apply_migration_20260824000002.mjs (URL prod)"  env NEXT_PUBLIC_SUPABASE_URL=https://wthkddeleylijmonclxg.supabase.co node scripts/apply_migration_20260824000002.mjs
run_case "m002 (E2E_URL = prod)"                          env E2E_SUPABASE_URL=https://wthkddeleylijmonclxg.supabase.co node scripts/m002-aplicar-migracion-20261031140000.mjs
run_case "m003 (URL .env = prod)"                         node scripts/m003-aplicar-migracion.mjs
run_case "m004-130000 (URL .env = prod)"                  node scripts/m004-aplicar-migracion-20261030130000.mjs
run_case "m004-143000 (URL .env = prod)"                  node scripts/m004-aplicar-migracion-20261030143000.mjs
run_case "pgrst-reload-schema.mjs (URL .env = prod)"      node scripts/pgrst-reload-schema.mjs
run_case "seed-pick3-history.js (URL .env = prod)"        node scripts/seed-pick3-history.js
run_case "landing-demo-cleanup.cjs (URL .env = prod)"     node scripts/landing-demo-cleanup.cjs

echo
echo "═══ Caso 2: destino AUSENTE (sin URL en el entorno) — escrituras bloqueadas ═══"
run_case "apply-sql-migration.js (sin URL)"   env -u NEXT_PUBLIC_SUPABASE_URL -u SUPABASE_URL node scripts/apply-sql-migration.js
run_case "m002 (sin E2E_SUPABASE_URL)"        env -u E2E_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_URL node scripts/m002-aplicar-migracion-20261031140000.mjs
run_case "apply_migration_20260824 (sin URL)" env -u NEXT_PUBLIC_SUPABASE_URL -u SUPABASE_URL node scripts/apply_migration_20260824000002.mjs

echo
echo "═══ Caso 3: discrepancia — URL ambiental E2E pero operación dirigida a prod ═══"
# apply-rpc-fix.sh usa el ref prod hardcodeado AUNQUE el entorno apunte a E2E:
# el resultado debe seguir siendo BLOQUEADO (defecto A corregido).
run_case "apply-rpc-fix.sh (entorno=E2E, operación=prod)" env NEXT_PUBLIC_SUPABASE_URL=https://lguovmvrozxgssupkwpf.supabase.co E2E_SUPABASE_URL=https://lguovmvrozxgssupkwpf.supabase.co bash scripts/apply-rpc-fix.sh

echo
echo "══════════ RESUMEN ══════════"
echo "PASS: $PASS · FAIL: $FAIL"
[ $FAIL -eq 0 ]
