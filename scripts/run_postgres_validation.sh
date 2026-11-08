#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# COSTPRO-MULTICASHIER-DESIGN-008/009 · Runner de validación PostgreSQL real.
# Reproduce TODO el expediente docs/audits/evidence/postgres_multicashier/
# desde un checkout limpio, sin dependencias del agente:
#   · rutas relativas a la raíz del repositorio;
#   · detección explícita de dependencias (PostgreSQL 16/17: initdb, pg_ctl, psql);
#   · clúster DESECHABLE en un directorio temporal y puerto libre, limpiado con
#     trap al terminar (incluso si una prueba falla);
#   · base creada desde cero en cada ejecución; SIN producción, SIN CostproE2E,
#     SIN Supabase, SIN credenciales, SIN datos personales;
#   · fase de CONCURRENCIA con DOS conexiones psql reales (custodia N29, saldo e
#     idempotencia concurrentes);
#   · PASS/FAIL identificable: falla si cualquier archivo SQL o aserción falla,
#     si el conteo de casos negativos no coincide o si falta el veredicto final.
#
# Requisitos: PostgreSQL >= 16 en PATH (o export PG_BIN_DIR=<dir de binarios>).
# Método sin root documentado en docs/audits/evidence/postgres_multicashier/README.md.
# Uso: bash scripts/run_postgres_validation.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVDIR="$REPO_ROOT/docs/audits/evidence/postgres_multicashier"

# ── 1) Localizar binarios: PATH → PG_BIN_DIR → error explícito ────────────────
PSQL_BIN="$(command -v psql || true)"
INITDB_BIN="$(command -v initdb || true)"
PGCTL_BIN="$(command -v pg_ctl || true)"
if [[ -z "$PSQL_BIN" || -z "$INITDB_BIN" || -z "$PGCTL_BIN" ]]; then
  if [[ -n "${PG_BIN_DIR:-}" && -x "$PG_BIN_DIR/psql" && -x "$PG_BIN_DIR/initdb" && -x "$PG_BIN_DIR/pg_ctl" ]]; then
    PSQL_BIN="$PG_BIN_DIR/psql"; INITDB_BIN="$PG_BIN_DIR/initdb"; PGCTL_BIN="$PG_BIN_DIR/pg_ctl"
  else
    echo "ERROR EXPLÍCITO: PostgreSQL no encontrado (se requieren initdb, pg_ctl y psql ≥ 16)." >&2
    echo "  · Instala PostgreSQL 16/17 y asegúrate de que esté en PATH, o" >&2
    echo "  · exporta PG_BIN_DIR apuntando al directorio de binarios, por ejemplo:" >&2
    echo "      apt-get download postgresql-17 postgresql-client-17 && \\" >&2
    echo "      for d in *.deb; do dpkg-deb -x \"\$d\" root/; done && \\" >&2
    echo "      PG_BIN_DIR=\$PWD/root/usr/lib/postgresql/17/bin bash scripts/run_postgres_validation.sh" >&2
    echo "  · Método sin root documentado en $EVDIR/README.md" >&2
    exit 2
  fi
fi
BIN_DIR="$(dirname "$INITDB_BIN")"
echo "── PostgreSQL detectado: $("$PSQL_BIN" --version)"

# ── 2) Clúster desechable: directorio temporal + puerto libre + trap ──────────
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mc_audit.XXXXXX")"
DATA="$WORK/data"
SOCK="$WORK"
cleanup() {
  "$PGCTL_BIN" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
  if [[ -n "${KEEP_WORK:-}" ]]; then echo "── KEEP_WORK: artefactos en $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

pick_port() {
  local p; for p in $(shuf -i 15432-16432 -n 5 2>/dev/null || echo 15432 15433 15434); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "$p"; return 0; fi
  done
  echo 25432
}
PORT="$(pick_port)"
PGUSER=postgres
DB=audit_mc

q() { "$PSQL_BIN" -h "$SOCK" -p "$PORT" -U "$PGUSER" -d "$@" ; }

"$INITDB_BIN" -D "$DATA" -U "$PGUSER" -A trust >/dev/null
"$PGCTL_BIN" -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=''" \
  -l "$WORK/pg.log" start >/dev/null
for _ in $(seq 1 20); do
  q postgres -tAc "SELECT 1" >/dev/null 2>&1 && break
  sleep 0.5
done
q postgres -tAc "SELECT 1" >/dev/null   # debe responder
q postgres -qAc "CREATE DATABASE $DB"
echo "── Clúster desechable listo en puerto $PORT (se destruye al terminar)"

fail() { echo "VALIDACIÓN POSTGRESQL: FAIL — $1" >&2; exit 1; }

# ── 3) Carga del expediente en orden de dependencias (03 antes de 02) ─────────
for f in 00_schema_minimal.sql 01_constraints.sql 03_v3_reconciliation.sql \
         02_triggers.sql 04_valid_fixtures.sql 05_invalid_fixtures.sql 06_assertions.sql; do
  echo "── cargando $f"
  q "$DB" -v ON_ERROR_STOP=1 -q -f "$EVDIR/$f" > "$WORK/out_$f.log" 2>&1 \
    || { echo "── FALLO en $f:"; cat "$WORK/out_$f.log"; fail "carga de $f"; }
  grep -E '══|OK |RESULTADO' "$WORK/out_$f.log" | head -60 || true
done

# ── 4) Conteo de casos negativos: debe coincidir con lo documentado ───────────
N_OK="$(grep -cE 'OK (N|S-N|I-N|A-N)' "$WORK/out_05_invalid_fixtures.sql.log" || true)"
if [[ "$N_OK" -ne 46 ]]; then
  fail "conteo de casos negativos OK en 05 = $N_OK, esperado 46"
fi
echo "── casos negativos verificados en 05: $N_OK"

# ── 5) Fase de CONCURRENCIA con DOS conexiones psql REALES ────────────────────
# Fixture: cuenta C2 (Tienda Norte) con saldo 1000 CUP y dos transferencias de
# 700 C2→G3; transferencia entregada T-CC0 con custodia seq1 (titular K) para N29.
q "$DB" -v ON_ERROR_STOP=1 -q -f - > "$WORK/conc_prep.log" 2>&1 <<'SQL' || fail "fixtures de concurrencia"
INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
         currency, ref_type, ref_id, cash_account_id, created_by)
VALUES ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
        'in', 'cash', 1000, 'CUP', 'sale', NULL,
        '40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006');
SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000002',
         NULL, '40000000-0000-0000-0000-000000000002',
         '30000000-0000-0000-0000-000000000003', NULL,
         700, 'CUP', '20000000-0000-0000-0000-000000000006',
         '20000000-0000-0000-0000-000000000006', 'idem-CC1');
SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000002',
         NULL, '40000000-0000-0000-0000-000000000002',
         '30000000-0000-0000-0000-000000000003', NULL,
         700, 'CUP', '20000000-0000-0000-0000-000000000006',
         '20000000-0000-0000-0000-000000000006', 'idem-CC2');
SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
         '30000000-0000-0000-0000-000000000001', NULL,
         '30000000-0000-0000-0000-000000000002', NULL,
         1200, 'CUP', '20000000-0000-0000-0000-000000000001',
         '20000000-0000-0000-0000-000000000001', 'idem-CC0');
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0'),
         '20000000-0000-0000-0000-000000000002',
         '50000000-0000-0000-0000-000000000001', NULL);
SQL

client() {  # client <nombre> <sql>
  local name="$1" sql="$2" rc=0
  "$PSQL_BIN" -h "$SOCK" -p "$PORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 \
    -c "SET client_min_messages=notice;" -c "$sql" > "$WORK/$name.out" 2>&1 || rc=$?
  echo "$rc" > "$WORK/$name.rc"
}
# N29: dos reasignaciones CONCURRENTES sobre idem-CC0 (custodio vigente K).
# Con el lock FOR UPDATE se serializan: el ganador crea seq=2; el perdedor, que
# leyó el mismo estado previo (prev=K), es rechazado por ERR_CUSTODY_PREV_MISMATCH
# (prevención de reasignación obsoleta) — sin bifurcación ni secuencia rota.
client c1 "SELECT f_create_custody_event(
             (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0'),
             '20000000-0000-0000-0000-000000000002'::uuid,
             '20000000-0000-0000-0000-000000000005'::uuid,
             '20000000-0000-0000-0000-000000000001'::uuid, NULL, 'rea. A');" &
client c2 "SELECT f_create_custody_event(
             (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0'),
             '20000000-0000-0000-0000-000000000002'::uuid,
             '20000000-0000-0000-0000-000000000004'::uuid,
             '20000000-0000-0000-0000-000000000001'::uuid, NULL, 'rea. B');" &
wait
# Saldo concurrente: dos entregas de 700 desde C2 (saldo 1000) — solo una confirma.
client c3 "SELECT f_deliver_cash_transfer(
             (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC1'),
             '20000000-0000-0000-0000-000000000006', NULL, NULL);" &
client c4 "SELECT f_deliver_cash_transfer(
             (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC2'),
             '20000000-0000-0000-0000-000000000006', NULL, NULL);" &
wait
# Idempotencia concurrente: misma clave, MISMOS parámetros ⇒ ambos OK, mismo id.
client c5 "SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             480, 'CUP', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', 'idem-CC3');" &
client c6 "SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             480, 'CUP', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', 'idem-CC3');" &
wait
# Idempotencia concurrente: misma clave, importe distinto ⇒ uno OK, otro REUSE.
client c7 "SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             500, 'CUP', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', 'idem-CC4');" &
client c8 "SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             900, 'CUP', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', 'idem-CC4');" &
wait

echo "── N29 (custodia concurrente): c1.rc=$(cat "$WORK/c1.rc") c2.rc=$(cat "$WORK/c2.rc")"
echo "── saldo concurrente: c3.rc=$(cat "$WORK/c3.rc") c4.rc=$(cat "$WORK/c4.rc")"
echo "── idempotencia concurrente: c5.rc=$(cat "$WORK/c5.rc") c6.rc=$(cat "$WORK/c6.rc") c7.rc=$(cat "$WORK/c7.rc") c8.rc=$(cat "$WORK/c8.rc")"

# Resultados esperados por par (exactamente uno de cada par rechazado):
ONE_OK_ONE_ERR() {
  local a="$1" b="$2" msg="$3"
  local ra rb; ra="$(cat "$WORK/$a.rc")"; rb="$(cat "$WORK/$b.rc")"
  if [[ "$ra" == "0" && "$rb" != "0" ]] || [[ "$ra" != "0" && "$rb" == "0" ]]; then return 0; fi
  fail "$msg: se esperaba exactamente un cliente OK y uno rechazado (rc=$ra/$rb)"
}
ONE_OK_ONE_ERR c1 c2 "N29 custodia concurrente"
ONE_OK_ONE_ERR c3 c4 "saldo concurrente"
ONE_OK_ONE_ERR c7 c8 "idempotencia concurrente (reuse)"
grep -q 'ERR_CUSTODY_PREV_MISMATCH' "$WORK/c1.out" "$WORK/c2.out" \
  || fail "N29: el perdedor debía ser rechazado por ERR_CUSTODY_PREV_MISMATCH"
SALDO_ERR=0
grep -q 'ERR_SALDO_INSUFICIENTE' "$WORK/c3.out" && SALDO_ERR=$((SALDO_ERR+1))
grep -q 'ERR_SALDO_INSUFICIENTE' "$WORK/c4.out" && SALDO_ERR=$((SALDO_ERR+1))
if [[ "$SALDO_ERR" -ne 1 ]]; then fail "saldo concurrente: se esperaba 1 ERR_SALDO_INSUFICIENTE"; fi

# ── 6) Verificación HARD-FAIL de los resultados concurrentes ──────────────────
q "$DB" -v ON_ERROR_STOP=1 -q -f - > "$WORK/conc_verify.log" 2>&1 <<'SQL' || { cat "$WORK/conc_verify.log"; fail "aserciones de concurrencia"; }
DO $$
DECLARE v_ev int; v_lineal int; v_legs_cc int; v_saldo numeric(14,2);
        v_cc3 int; v_cc3_ids int; v_cc4 int; v_reuse_ok boolean; v_ganador_ok boolean;
BEGIN
  -- N29: exactamente un evento seq=2; cadena lineal; sin bifurcación.
  SELECT count(*) INTO v_ev FROM cash_transfer_custody_events
   WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0');
  SELECT count(*) INTO v_lineal FROM cash_transfer_custody_events e
   JOIN cash_transfer_custody_events p
     ON e.previous_event_id = p.id AND e.event_seq = p.event_seq + 1
   WHERE e.transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0');
  IF v_ev <> 2 OR v_lineal <> 1 THEN
    RAISE EXCEPTION 'N29 FALLO: eventos=% enlaces=% (esperado 2/1)', v_ev, v_lineal;
  END IF;
  RAISE NOTICE 'OK N29: reasignaciones concurrentes serializadas, cadena lineal (2 eventos, 1 enlace)';
  -- Saldo concurrente: exactamente UNA pierna de CC1+CC2; saldo final 300.
  SELECT count(*) INTO v_legs_cc FROM payment_transactions pt
   JOIN cash_transfers ct ON pt.ref_type='cash_transfer' AND pt.ref_id=ct.id
  WHERE ct.idempotency_key IN ('idem-CC1','idem-CC2') AND pt.direction='out';
  SELECT COALESCE(SUM(CASE WHEN v.direction='in' THEN v.amount ELSE -v.amount END),0) INTO v_saldo
    FROM v_cash_ledger_classification v
   WHERE v.holder_type='cuenta' AND v.holder_id='40000000-0000-0000-0000-000000000002'
     AND v.currency='CUP' AND v.model_scope='multicaja'
     AND v.class NOT IN ('electronico','historico_sin_titular');
  IF v_legs_cc <> 1 OR v_saldo <> 300 THEN
    RAISE EXCEPTION 'SALDO-CONC FALLO: piernas=% saldo=% (esperado 1/300)', v_legs_cc, v_saldo;
  END IF;
  RAISE NOTICE 'OK saldo concurrente: una sola salida confirmó, saldo final 300, la otra revirtió íntegra';
  -- Idempotencia concurrente misma clave+params: 1 transferencia, ambos clientes OK.
  SELECT count(*) INTO v_cc3 FROM cash_transfers WHERE idempotency_key='idem-CC3';
  IF v_cc3 <> 1 THEN RAISE EXCEPTION 'IDEM-CONC FALLO: % transferencias con idem-CC3', v_cc3; END IF;
  RAISE NOTICE 'OK idempotencia concurrente (mismos parámetros): una transferencia, sin error espurio';
  -- Idempotencia concurrente misma clave+params distintos: 1 transferencia, un REUSE.
  SELECT count(*) INTO v_cc4 FROM cash_transfers WHERE idempotency_key='idem-CC4';
  IF v_cc4 <> 1 THEN RAISE EXCEPTION 'IDEM-REUSE FALLO: % transferencias con idem-CC4', v_cc4; END IF;
  RAISE NOTICE 'OK idempotencia concurrente (parámetros distintos): una transferencia y un ERR_IDEMPOTENCY_KEY_REUSE';
END $$;
SQL

grep -q 'ERR_CUSTODY_PREV_MISMATCH' "$WORK/c1.out" "$WORK/c2.out" \
  || fail "N29: el perdedor debía ser rechazado por ERR_CUSTODY_PREV_MISMATCH"
REUSE1="$(grep -c 'ERR_IDEMPOTENCY_KEY_REUSE' "$WORK/c7.out" || true)"
REUSE2="$(grep -c 'ERR_IDEMPOTENCY_KEY_REUSE' "$WORK/c8.out" || true)"
if [[ $((REUSE1 + REUSE2)) -ne 1 ]]; then
  fail "concurrencia idem-CC4: se esperaba exactamente 1 ERR_IDEMPOTENCY_KEY_REUSE, hubo $((REUSE1+REUSE2))"
fi
ID1="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$WORK/c5.out" | head -1)"
ID2="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$WORK/c6.out" | head -1)"
if [[ -z "$ID1" || "$ID1" != "$ID2" ]]; then
  fail "concurrencia idem-CC3: ids distintos o ausentes entre clientes ($ID1 / $ID2)"
fi
echo "── idem-CC3: ambos clientes obtuvieron el MISMO id $ID1"

# ── 7) Veredicto final ─────────────────────────────────────────────────────────
echo "════════════════════════════════════════════"
if grep -q 'RESULTADO FINAL: ASSERTIONS 009 OK' "$WORK/out_06_assertions.sql.log"; then
  echo "VALIDACIÓN POSTGRESQL 17: PASS — esquema+CHECKs+triggers+transacciones+concurrencia ejecutados y verificados"
else
  fail "falta el veredicto ASSERTIONS 009 OK"
fi
