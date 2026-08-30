#!/bin/bash
# case-df01-conc.sh — DF-01 concurrencia: 2 confirmaciones simultáneas mismo producto
# Serialización vía FOR UPDATE en fn_recalc_wac; conservación de valor (INV-15).
source /home/z/my-project/scripts/w62-lab/w62-lab-lib.sh
CLONE=w7d1_reg
OUT=/home/z/my-project/w7-readiness/tmp/w7d1-reg-df01-conc.out

# Fixture del caso: producto 10@100 + 2 recepciones pendientes
$PGBIN/psql $PSQLCONN -d $CLONE -q -At -f $W62LAB/w62-fixture.sql -f - << 'EOF' > /tmp/df01conc-setup.out 2>&1
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_product('df0199010001','Prod Conc WAC',10,100,200,'22222222-2222-2222-2222-222222222222'::uuid) AS pidc \gset
INSERT INTO receipts (id, store_id, user_id, status, reference_doc)
VALUES (gen_random_uuid(),'22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','pending','W62-CONC-A')
RETURNING id AS ra \gset
INSERT INTO receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
VALUES (:'ra', :'pidc', 2, 200, 1.0);
INSERT INTO receipts (id, store_id, user_id, status, reference_doc)
VALUES (gen_random_uuid(),'22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','pending','W62-CONC-B')
RETURNING id AS rb \gset
INSERT INTO receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
VALUES (:'rb', :'pidc', 3, 300, 1.0);
SELECT 'SETUP-OK|pid='||:'pidc'||'|receipt_A='||:'ra'||'|receipt_B='||:'rb';
COMMIT;
EOF
SETUP=$(cat /tmp/df01conc-setup.out | grep 'SETUP-OK')
echo "$SETUP"
PIDC=$(echo "$SETUP" | sed 's/.*pid=\([^|]*\).*/\1/')
RA=$(echo "$SETUP" | sed 's/.*receipt_A=\([^|]*\).*/\1/')
RB=$(echo "$SETUP" | sed 's/.*receipt_B=\([^|]*\).*/\1/')

echo "════ DF01-CONC: confirmaciones concurrentes A(2@200) y B(3@300) sobre stock 10@100 ════" | tee -a $OUT
CONFIRM_A="SELECT public.confirm_pending_reception('$RA'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, clock_timestamp()) AS confirmed;"
CONFIRM_B="SELECT public.confirm_pending_reception('$RB'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, clock_timestamp()) AS confirmed;"
CLAIMS=(-c "SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'" -c "SET request.jwt.claim.role='authenticated'")

( $PGBIN/psql $PSQLCONN -d $CLONE -q -At "${CLAIMS[@]}" -c "SET statement_timeout='20s'" -c "$CONFIRM_A" > /tmp/df01conc-A.out 2>&1 ) &
PA=$!
( sleep 0.03; $PGBIN/psql $PSQLCONN -d $CLONE -q -At "${CLAIMS[@]}" -c "SET statement_timeout='20s'" -c "$CONFIRM_B" > /tmp/df01conc-B.out 2>&1 ) &
PB=$!
wait $PA; RCA=$?; wait $PB; RCB=$?
echo "sesión A (2@200) exit=$RCA → $(cat /tmp/df01conc-A.out)" | tee -a $OUT
echo "sesión B (3@300) exit=$RCB → $(cat /tmp/df01conc-B.out)" | tee -a $OUT

$PGBIN/psql $PSQLCONN -d $CLONE -q -At -f $W62LAB/w62-fixture.sql -f - << 'EOF' | tee -a $OUT
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_assert('DF01-C1', 'Concurrencia: stock final 10+2+3=15', 15,
  (SELECT stock_current FROM public.products WHERE sku='W62-df0199010001'));
SELECT pg_temp.w62_assert('DF01-C2', 'INV-15 conservación: stock×WAC = 1000+400+900 = 2300', 2300,
  (SELECT stock_current*cost_average FROM public.products WHERE sku='W62-df0199010001'));
SELECT pg_temp.w62_assert('DF01-C3', 'INV-15: 2 filas wac_change_log (blends serializados)', 2,
  (SELECT count(*)::numeric FROM public.wac_change_log cl
    JOIN public.products p ON p.id=cl.product_id WHERE p.sku='W62-df0199010001' AND cl.event='reception_in'));
SELECT pg_temp.w62_assert('DF01-C4', 'Concurrencia: sin lost update (WAC final = 2300/15)', 153.333333333333333,
  (SELECT cost_average FROM public.products WHERE sku='W62-df0199010001'));
SELECT 'EVID|log=' || coalesce(string_agg(event||':'||round(wac_before,3)||'→'||round(wac_after,3), ' ; ' ORDER BY created_at),'')
  FROM wac_change_log cl JOIN products p ON p.id=cl.product_id WHERE p.sku='W62-df0199010001';
COMMIT;
EOF
echo "DF01-CONC completado" | tee -a $OUT
