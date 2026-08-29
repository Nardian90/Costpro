#!/bin/bash
# ============================================================================
# F7-RUNNER — Caso F.7 CONCURRENCIA sobre clon efímero de costpro_audit_v2
# Ronda 1 (race sobre-devolución): 2 devoluciones CONCURRENTES, claves distintas,
#          4+4=8 unidades sobre venta de 5 → el tope acumulado debe rechazar.
# Ronda 2 (race misma clave): 2 devoluciones concurrentes con LA MISMA clave →
#          debe existir exactamente 1 devolución al final.
# v2 jamás se muta: se usa TEMPLATE clone, destruido al terminar.
# ============================================================================
set -u
PGBIN=/home/z/my-project/harness/client/usr/lib/postgresql/17/bin
export LD_LIBRARY_PATH=/home/z/my-project/harness/client/usr/lib/postgresql/17/lib:/home/z/my-project/harness/client/usr/lib/x86_64-linux-gnu
PSQL="$PGBIN/psql -h 127.0.0.1 -p 5433 -U postgres"
EVID=/home/z/my-project/download/auditoria-multitienda/W6-AF-20260828
mkdir -p "$EVID"

echo "════ F7 — PREPARACIÓN CLON EFÍMERO ════"
# Sin conexiones activas al template en este momento (sesiones A–F ya cerraron)
$PSQL -d postgres -q -c "DROP DATABASE IF EXISTS costpro_audit_v2_conc" 
$PSQL -d postgres -q -c "CREATE DATABASE costpro_audit_v2_conc TEMPLATE costpro_audit_v2"
echo "clon creado: costpro_audit_v2_conc (TEMPLATE costpro_audit_v2)"

$PSQL -d costpro_audit_v2_conc -q -f /home/z/my-project/scripts/af/af-f7-fixture.sql

# ── Consultas concurrentes ──
DEV_CALL='SELECT public.create_devolution_v2(
  p_store_id => '"'"'22222222-2222-2222-2222-222222222222'"'"'::uuid,
  p_items => '"'"'[{"product_id":"33333333-3333-3333-3333-33333333a007","quantity":__Q__,"unit_price":200}]'"'"'::jsonb,
  p_reason => '"'"'AF-F7 race __TAG__'"'"', p_user_id => '"'"'11111111-1111-1111-1111-111111111111'"'"'::uuid,
  p_original_transaction_id => (SELECT id FROM public.transactions WHERE idempotency_key='"'"'AF-F7-SALE-1'"'"'),
  p_payment_method => '"'"'cash'"'"', p_idempotency_key => '"'"'__KEY__'"'"'
) AS resultado;'

echo "════ F7 — RONDA 1: claves DISTINTAS (K1 qty4 vs K2 qty4) concurrentes ════"
CLAIMS=("-c" "SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'" "-c" "SET request.jwt.claim.role='authenticated'")
Q1=${DEV_CALL/__Q__/4}; Q1=${Q1/__TAG__/A}; Q1=${Q1/__KEY__/AF-F7-DEV-K1}
Q2=${DEV_CALL/__Q__/4}; Q2=${Q2/__TAG__/B}; Q2=${Q2/__KEY__/AF-F7-DEV-K2}
( $PSQL -d costpro_audit_v2_conc -q -At "${CLAIMS[@]}" -c "SET statement_timeout='15s'" -c "$Q1" > "$EVID/f7-race1-sessionA.out" 2>&1 ) &
PA=$!
( sleep 0.05; $PSQL -d costpro_audit_v2_conc -q -At "${CLAIMS[@]}" -c "SET statement_timeout='15s'" -c "$Q2" > "$EVID/f7-race1-sessionB.out" 2>&1 ) &
PB=$!
wait $PA; RA=$?; wait $PB; RB=$?
echo "sesión A (K1 qty4) exit=$RA → $(cat "$EVID/f7-race1-sessionA.out")"
echo "sesión B (K2 qty4) exit=$RB → $(cat "$EVID/f7-race1-sessionB.out")"

$PSQL -d costpro_audit_v2_conc -q -At -c \
  "SELECT 'F7|R1|devoluciones_creadas='||count(*)||'|stock_final='||(SELECT stock_current FROM public.products WHERE id='33333333-3333-3333-3333-33333333a007'::uuid)||'|vendida=5|stock_recibido=10' FROM public.devolutions WHERE store_id='22222222-2222-2222-2222-222222222222'::uuid" \
  | tee "$EVID/f7-race1-verdict.txt"

echo "════ F7 — RONDA 2: MISMA clave (K3 qty1 ×2) concurrente ════"
Q3=${DEV_CALL/__Q__/1}; Q3=${Q3/__TAG__/C1}; Q3=${Q3/__KEY__/AF-F7-DEV-K3}
Q4=${DEV_CALL/__Q__/1}; Q4=${Q4/__TAG__/C2}; Q4=${Q4/__KEY__/AF-F7-DEV-K3}
( $PSQL -d costpro_audit_v2_conc -q -At "${CLAIMS[@]}" -c "SET statement_timeout='15s'" -c "$Q3" > "$EVID/f7-race2-sessionA.out" 2>&1 ) &
PA=$!
( sleep 0.05; $PSQL -d costpro_audit_v2_conc -q -At "${CLAIMS[@]}" -c "SET statement_timeout='15s'" -c "$Q4" > "$EVID/f7-race2-sessionB.out" 2>&1 ) &
PB=$!
wait $PA; RA=$?; wait $PB; RB=$?
echo "sesión A (K3) exit=$RA → $(cat "$EVID/f7-race2-sessionA.out")"
echo "sesión B (K3) exit=$RB → $(cat "$EVID/f7-race2-sessionB.out")"

$PSQL -d costpro_audit_v2_conc -q -At -c \
  "SELECT 'F7|R2|devoluciones_con_clave_K3='||count(*)||' (esperado exactamente 1)' FROM public.devolutions WHERE idempotency_key='AF-F7-DEV-K3'" \
  | tee "$EVID/f7-race2-verdict.txt"

echo "════ F7 — DESTRUCCIÓN DEL CLON ════"
$PSQL -d postgres -q -c "DROP DATABASE costpro_audit_v2_conc" && echo "clon destruido; v2 nunca fue mutado"
