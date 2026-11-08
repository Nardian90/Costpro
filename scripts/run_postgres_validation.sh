#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# COSTPRO-MULTICASHIER-DESIGN-008/009/010 · Runner de validación PostgreSQL real.
# Reproduce TODO el expediente docs/audits/evidence/postgres_multicashier/
# desde un checkout limpio, sin dependencias del agente:
#   · rutas relativas a la raíz del repositorio;
#   · detección explícita de dependencias (PostgreSQL 16/17: initdb, pg_ctl, psql);
#   · clúster DESECHABLE en un directorio temporal y puerto libre, limpiado con
#     trap al terminar (incluso si una prueba falla);
#   · base creada desde cero en cada ejecución; SIN producción, SIN CostproE2E,
#     SIN Supabase, SIN credenciales, SIN datos personales;
#   · fase de CONCURRENCIA DETERMINISTA (misión 010, D.23.6): una conexión
#     coordinadora mantiene el bloqueo, se VERIFICA vía pg_stat_activity que los
#     dos clientes esperan el bloqueo (wait_event_type='Lock') ANTES de liberarlo,
#     y solo entonces se resuelve la contención. pg_sleep solo sirve de intervalo
#     de sondeo del coordinador; la prueba de contención es el estado real de
#     espera observado;
#   · PASS/FAIL identificable: falla si cualquier archivo SQL o aserción falla,
#     si el conteo de casos negativos no coincide, si la contención concurrente
#     no se demuestra o si falta el veredicto final.
#
# Requisitos: PostgreSQL >= 16 en PATH (o export PG_BIN_DIR=<dir de binarios>).
# Método sin root documentado en docs/audits/evidence/postgres_multicashier/README.md.
# Uso: bash scripts/run_postgres_validation.sh      (KEEP_WORK=1 conserva artefactos)
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
  grep -E '══|OK |RESULTADO' "$WORK/out_$f.log" | head -70 || true
done

# ── 4) Conteo de casos negativos: debe coincidir con lo documentado ───────────
N_OK="$(grep -cE 'OK (N|S-N|I-N|A-N)' "$WORK/out_05_invalid_fixtures.sql.log" || true)"
if [[ "$N_OK" -ne 73 ]]; then
  fail "conteo de casos negativos OK en 05 = $N_OK, esperado 73 (46 aserciones de D.22 + 27 de D.23; A-N3 y A-N7 emiten dos)"
fi
echo "── casos negativos verificados en 05: $N_OK"

# ── 5) Fase de CONCURRENCIA DETERMINISTA (D.23.6) ─────────────────────────────
# Fixture: cuenta C2 (Tienda Norte) con saldo 1000 CUP y dos transferencias de
# 700 C2→G3; transferencia entregada idem-CC0 con custodia seq1 (custodio K);
# tabla de control conc_gate para la barrera coordinador↔runner.
q "$DB" -v ON_ERROR_STOP=1 -q -f - > "$WORK/conc_prep.log" 2>&1 <<'SQL' || fail "fixtures de concurrencia"
CREATE TABLE conc_gate(id int PRIMARY KEY, state text);
INSERT INTO conc_gate VALUES (1,'init');
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
    -c "$sql" > "$WORK/$name.out" 2>&1 || rc=$?
  echo "$rc" > "$WORK/$name.rc"
}
waiters() {  # waiters <patrón de query de los clientes>
  q "$DB" -tAc "SELECT count(*) FROM pg_stat_activity
                 WHERE wait_event_type='Lock' AND state='active'
                   AND pid <> pg_backend_pid()
                   AND query ILIKE '$1'"
}
advisory_held() {  # advisory_held <clave>  ⇒ 1 si una sesión RETIENE la clave
  q "$DB" -tAc "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND granted"
}
advisory_waiters() {  # advisory_waiters <clave> ⇒ backends ESPERANDO esa clave
  q "$DB" -tAc "SELECT count(*) FROM pg_stat_activity
                 WHERE wait_event_type='Lock' AND wait_event='advisory'
                   AND query ILIKE '%pg_advisory_lock($1)%'"
}
holder() {  # holder <varpid> <clave>: retiene la clave (sesión viva) hasta que lo maten
  "$PSQL_BIN" -h "$SOCK" -p "$PORT" -U "$PGUSER" -d "$DB" \
    -tAc "SELECT pg_advisory_lock($2);" \
    -c "SELECT pg_sleep(1800);" > "$WORK/holder_$2.log" 2>&1 &
  eval "$1=$!"
}
wait_lock_held() {  # wait_lock_held <clave> <intentos>
  local i
  for i in $(seq 1 "$2"); do
    [[ "$(advisory_held "$1")" == "1" ]] && return 0
    sleep 0.25
  done
  return 1
}
wait_coord_blocked() {  # wait_coord_blocked <clave> <intentos>: coordinador con bloqueo de fila tomado
  local i
  for i in $(seq 1 "$2"); do
    [[ "$(advisory_waiters "$1")" == "1" ]] && return 0
    sleep 0.25
  done
  return 1
}
release() {  # release <clave> <varpid>: termina la SESIÓN que retiene la clave
  # (matar el psql no aborta pg_sleep: el backend no nota el socket muerto hasta
  # terminar la sentencia; pg_terminate_backend libera el lock al instante)
  q "$DB" -tAc "SELECT pg_terminate_backend(l.pid) FROM pg_locks l
                 WHERE l.locktype='advisory' AND l.objid=$1 AND l.granted" >/dev/null 2>&1 || true
  kill "${!2}" 2>/dev/null || true
}
ONE_OK_ONE_ERR() {
  local a="$1" b="$2" msg="$3"
  local ra rb; ra="$(cat "$WORK/$a.rc")"; rb="$(cat "$WORK/$b.rc")"
  if [[ "$ra" == "0" && "$rb" != "0" ]] || [[ "$ra" != "0" && "$rb" == "0" ]]; then return 0; fi
  fail "$msg: se esperaba exactamente un cliente OK y uno rechazado (rc=$ra/$rb)"
}

# ═══ Escenario 1 · SALDO: coordinador bloquea la fila de la cuenta C2 ═════════
holder HPID1 777
wait_lock_held 777 40 || fail "portador de saldo no retuvo la clave advisory 777"
"$PSQL_BIN" -h "$SOCK" -p "$PORT" -U "$PGUSER" -d "$DB" -q -f - > "$WORK/coord1.log" 2>&1 <<'SQL' &
BEGIN;
SELECT 1 FROM cash_accounts WHERE id='40000000-0000-0000-0000-000000000002' FOR UPDATE;
SELECT pg_advisory_lock(777);
ROLLBACK;
SQL
wait_coord_blocked 777 80 || fail "coordinador de saldo no tomó el bloqueo de la cuenta"
client c1 "SELECT f_deliver_cash_transfer(
             (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC1'),
             '20000000-0000-0000-0000-000000000006', NULL, NULL);" &
client c2 "SELECT f_deliver_cash_transfer(
             (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC2'),
             '20000000-0000-0000-0000-000000000006', NULL, NULL);" &
sleep 1
W1=0
for i in $(seq 1 60); do W1="$(waiters '%f_deliver_cash_transfer(%')"; [[ "$W1" == "2" ]] && break; sleep 0.5; done
if [[ "$W1" != "2" ]]; then fail "SALDO: contención no demostrada — waiters=$W1 (se exigían 2 backends en wait_event_type='Lock')"; fi
echo "── espera real demostrada (saldo): 2 backends en wait_event_type='Lock' sobre el bloqueo de la cuenta"
release 777 HPID1
wait
echo "── saldo concurrente: c1.rc=$(cat "$WORK/c1.rc") c2.rc=$(cat "$WORK/c2.rc")"
ONE_OK_ONE_ERR c1 c2 "saldo concurrente"
SALDO_ERR=0
grep -q 'ERR_SALDO_INSUFICIENTE' "$WORK/c1.out" && SALDO_ERR=$((SALDO_ERR+1))
grep -q 'ERR_SALDO_INSUFICIENTE' "$WORK/c2.out" && SALDO_ERR=$((SALDO_ERR+1))
if [[ "$SALDO_ERR" -ne 1 ]]; then fail "saldo concurrente: se esperaba 1 ERR_SALDO_INSUFICIENTE"; fi
q "$DB" -v ON_ERROR_STOP=1 -q -f - > "$WORK/v1.log" 2>&1 <<'SQL' || { cat "$WORK/v1.log"; fail "verificación saldo concurrente"; }
DO $$
DECLARE v_legs int; v_saldo numeric(14,2);
BEGIN
  SELECT count(*) INTO v_legs FROM payment_transactions pt
   JOIN cash_transfers ct ON pt.ref_type='cash_transfer' AND pt.ref_id=ct.id
  WHERE ct.idempotency_key IN ('idem-CC1','idem-CC2') AND pt.direction='out';
  SELECT COALESCE(SUM(CASE WHEN v.direction='in' THEN v.amount ELSE -v.amount END),0) INTO v_saldo
    FROM v_cash_ledger_classification v
   WHERE v.holder_type='cuenta' AND v.holder_id='40000000-0000-0000-0000-000000000002'
     AND v.currency='CUP' AND v.model_scope='multicaja'
     AND v.class NOT IN ('electronico','historico_sin_titular');
  IF v_legs <> 1 OR v_saldo <> 300 THEN
    RAISE EXCEPTION 'SALDO-CONC FALLO: piernas=% saldo=% (esperado 1/300)', v_legs, v_saldo;
  END IF;
  RAISE NOTICE 'OK saldo concurrente: una sola salida confirmó tras la contención demostrada; saldo final 300';
END $$;
SQL

# ═══ Escenario 2 · CUSTODIA (N29): coordinador bloquea la fila del traspaso ═══
holder HPID2 778
wait_lock_held 778 40 || fail "portador de custodia no retuvo la clave advisory 778"
"$PSQL_BIN" -h "$SOCK" -p "$PORT" -U "$PGUSER" -d "$DB" -q -f - > "$WORK/coord2.log" 2>&1 <<'SQL' &
BEGIN;
SELECT 1 FROM cash_transfers WHERE id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0') FOR UPDATE;
SELECT pg_advisory_lock(778);
ROLLBACK;
SQL
wait_coord_blocked 778 80 || fail "coordinador de custodia no tomó el bloqueo del traspaso"
client c3 "SELECT f_create_custody_event(
             (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0'),
             '20000000-0000-0000-0000-000000000002'::uuid,
             '20000000-0000-0000-0000-000000000005'::uuid,
             '20000000-0000-0000-0000-000000000001'::uuid, NULL, 'rea. A');" &
client c4 "SELECT f_create_custody_event(
             (SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0'),
             '20000000-0000-0000-0000-000000000002'::uuid,
             '20000000-0000-0000-0000-000000000004'::uuid,
             '20000000-0000-0000-0000-000000000001'::uuid, NULL, 'rea. B');" &
sleep 1
W2=0
for i in $(seq 1 60); do W2="$(waiters '%f_create_custody_event(%')"; [[ "$W2" == "2" ]] && break; sleep 0.5; done
if [[ "$W2" != "2" ]]; then fail "CUSTODIA: contención no demostrada — waiters=$W2 (se exigían 2 backends en wait_event_type='Lock')"; fi
echo "── espera real demostrada (custodia N29): 2 backends en wait_event_type='Lock' sobre el bloqueo del traspaso"
release 778 HPID2
wait
echo "── N29 (custodia concurrente): c3.rc=$(cat "$WORK/c3.rc") c4.rc=$(cat "$WORK/c4.rc")"
ONE_OK_ONE_ERR c3 c4 "N29 custodia concurrente"
grep -q 'ERR_CUSTODY_PREV_MISMATCH' "$WORK/c3.out" "$WORK/c4.out" \
  || fail "N29: el perdedor debía ser rechazado por ERR_CUSTODY_PREV_MISMATCH"
q "$DB" -v ON_ERROR_STOP=1 -q -f - > "$WORK/v2.log" 2>&1 <<'SQL' || { cat "$WORK/v2.log"; fail "verificación custodia concurrente"; }
DO $$
DECLARE v_ev int; v_lineal int;
BEGIN
  SELECT count(*) INTO v_ev FROM cash_transfer_custody_events
   WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0');
  SELECT count(*) INTO v_lineal FROM cash_transfer_custody_events e
   JOIN cash_transfer_custody_events p
     ON e.previous_event_id = p.id AND e.event_seq = p.event_seq + 1
   WHERE e.transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-CC0');
  IF v_ev <> 2 OR v_lineal <> 1 THEN
    RAISE EXCEPTION 'N29 FALLO: eventos=% enlaces=% (esperado 2/1)', v_ev, v_lineal;
  END IF;
  RAISE NOTICE 'OK N29: reasignaciones concurrentes serializadas tras contención demostrada; cadena lineal';
END $$;
SQL

# ═══ Escenario 3 · IDEMPOTENCIA: coordinador toma la clave idem-CC3 (INSERT sin commit) ═══
holder HPID3 779
wait_lock_held 779 40 || fail "portador de idempotencia no retuvo la clave advisory 779"
"$PSQL_BIN" -h "$SOCK" -p "$PORT" -U "$PGUSER" -d "$DB" -q -f - > "$WORK/coord3.log" 2>&1 <<'SQL' &
BEGIN;
INSERT INTO cash_transfers(store_id, amount, currency, status,
         from_register_id, from_account_id, to_register_id, to_account_id,
         requested_by, authorized_by, idempotency_key, request_fingerprint)
VALUES ('10000000-0000-0000-0000-000000000001', 480, 'CUP', 'solicitada',
        '30000000-0000-0000-0000-000000000001', NULL,
        '30000000-0000-0000-0000-000000000002', NULL,
        '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        'idem-CC3', 'coordinador');
SELECT pg_advisory_lock(779);
ROLLBACK;   -- el INSERT se revierte: la clave queda libre para la carrera
SQL
wait_coord_blocked 779 80 || fail "coordinador de idempotencia no tomó la clave única idem-CC3"
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
sleep 1
W3=0
for i in $(seq 1 60); do W3="$(waiters '%f_request_cash_transfer(%')"; [[ "$W3" == "2" ]] && break; sleep 0.5; done
if [[ "$W3" != "2" ]]; then fail "IDEMPOTENCIA: contención no demostrada — waiters=$W3 (se exigían 2 backends en wait_event_type='Lock')"; fi
echo "── espera real demostrada (idempotencia): 2 backends en wait_event_type='Lock' sobre la resolución de la clave"
release 779 HPID3
wait
echo "── idempotencia concurrente: c5.rc=$(cat "$WORK/c5.rc") c6.rc=$(cat "$WORK/c6.rc")"
if [[ "$(cat "$WORK/c5.rc")" != "0" || "$(cat "$WORK/c6.rc")" != "0" ]]; then
  fail "idempotencia concurrente: ambos clientes debían terminar OK con el mismo id"
fi
ID1="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$WORK/c5.out" | head -1)"
ID2="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$WORK/c6.out" | head -1)"
if [[ -z "$ID1" || "$ID1" != "$ID2" ]]; then
  fail "concurrencia idem-CC3: ids distintos o ausentes entre clientes ($ID1 / $ID2)"
fi
echo "── idem-CC3: ambos clientes obtuvieron el MISMO id $ID1"

# ═══ Escenario 4 · IDEMPOTENCIA con parámetros distintos (carrera por la clave única) ═══
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
echo "── idempotencia concurrente (reuse): c7.rc=$(cat "$WORK/c7.rc") c8.rc=$(cat "$WORK/c8.rc")"
ONE_OK_ONE_ERR c7 c8 "idempotencia concurrente (reuse)"
REUSE=0
grep -q 'ERR_IDEMPOTENCY_KEY_REUSE' "$WORK/c7.out" && REUSE=$((REUSE+1))
grep -q 'ERR_IDEMPOTENCY_KEY_REUSE' "$WORK/c8.out" && REUSE=$((REUSE+1))
if [[ "$REUSE" -ne 1 ]]; then fail "idem-CC4: se esperaba exactamente 1 ERR_IDEMPOTENCY_KEY_REUSE"; fi
q "$DB" -v ON_ERROR_STOP=1 -q -f - > "$WORK/v3.log" 2>&1 <<'SQL' || { cat "$WORK/v3.log"; fail "verificación idempotencia concurrente"; }
DO $$
DECLARE v_cc3 int; v_cc4 int;
BEGIN
  SELECT count(*) INTO v_cc3 FROM cash_transfers WHERE idempotency_key='idem-CC3';
  SELECT count(*) INTO v_cc4 FROM cash_transfers WHERE idempotency_key='idem-CC4';
  IF v_cc3 <> 1 OR v_cc4 <> 1 THEN
    RAISE EXCEPTION 'IDEM-CONC FALLO: transferencias CC3=% CC4=% (esperado 1/1)', v_cc3, v_cc4;
  END IF;
  RAISE NOTICE 'OK idempotencia concurrente: una transferencia por clave en ambos casos';
END $$;
SQL

# ── 6) Veredicto final ─────────────────────────────────────────────────────────
echo "════════════════════════════════════════════"
if grep -q 'RESULTADO FINAL: ASSERTIONS 010 OK' "$WORK/out_06_assertions.sql.log"; then
  echo "VALIDACIÓN POSTGRESQL 17: PASS — esquema+CHECKs+triggers+transacciones+concurrencia determinista ejecutados y verificados"
else
  fail "falta el veredicto ASSERTIONS 010 OK"
fi
