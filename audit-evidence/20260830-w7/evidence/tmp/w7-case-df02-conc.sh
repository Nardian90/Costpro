#!/bin/bash
# case-df02-conc.sh — DF-02 concurrencia: 2 ventas simultáneas mismo producto
# FOR UPDATE en products serializa; cada venta usa WAC_prev de su instante.
source /home/z/my-project/scripts/w62-lab/w62-lab-lib.sh
CLONE=w7_gate
OUT=$W62OUT/W62-12-DF02-COGS.out

$PGBIN/psql $PSQLCONN -d $CLONE -q -At -f $W62LAB/w62-fixture.sql -f - << 'EOF' > /tmp/df02conc-setup.out 2>&1
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_product('df0290010001','Prod Conc Ventas',10,100,200,'22222222-2222-2222-2222-222222222222'::uuid) AS pidc \gset
SELECT 'SETUP-OK|pid='||:'pidc';
COMMIT;
EOF
SETUP=$(grep "SETUP-OK" /tmp/df02conc-setup.out); echo "$SETUP"
PIDC=$(echo "$SETUP" | sed "s/.*pid=\([^|]*\).*/\1/")

echo "════ DF02-CONC: 2 ventas simultáneas de 3u sobre stock 10@100 ════" | tee -a $OUT
SALE="SELECT public.create_sale_v2(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_seller_id=>'11111111-1111-1111-1111-111111111111'::uuid,
  p_items=>'[{\"product_id\":\"$PIDC\",\"quantity\":3,\"price_at_sale\":200,\"cost_at_sale\":5555}]'::jsonb,
  p_payment_method=>'cash', p_total_amount=>600, p_subtotal=>600,
  p_idempotency_key=>'DF02-CONC-__N__') AS result;"
S1=${SALE/__N__/A}; S2=${SALE/__N__/B}
CLAIMS=(-c "SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111'" -c "SET request.jwt.claim.role='authenticated'")
( $PGBIN/psql $PSQLCONN -d $CLONE -q -At "${CLAIMS[@]}" -c "SET statement_timeout='20s'" -c "$S1" > /tmp/df02conc-A.out 2>&1 ) & PA=$!
( sleep 0.03; $PGBIN/psql $PSQLCONN -d $CLONE -q -At "${CLAIMS[@]}" -c "SET statement_timeout='20s'" -c "$S2" > /tmp/df02conc-B.out 2>&1 ) & PB=$!
wait $PA; echo "sesión A exit=$? → $(cat /tmp/df02conc-A.out)" | tee -a $OUT
wait $PB; echo "sesión B exit=$? → $(cat /tmp/df02conc-B.out)" | tee -a $OUT

$PGBIN/psql $PSQLCONN -d $CLONE -q -At -f $W62LAB/w62-fixture.sql -f - << 'EOF' | tee -a $OUT
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_assert('DF02-C1', 'Conc: ambas ventas aceptadas (stock suficiente)', 2,
  (SELECT count(*)::numeric FROM public.transactions WHERE idempotency_key IN ('DF02-CONC-A','DF02-CONC-B')));
SELECT pg_temp.w62_assert('DF02-C2', 'Conc: COGS ambas = WAC 100 (cliente 5555 ignorado ×2)', 200,
  (SELECT sum(ti.cost_at_sale) FROM public.transaction_items ti JOIN public.transactions t ON t.id=ti.transaction_id WHERE t.idempotency_key IN ('DF02-CONC-A','DF02-CONC-B')));
SELECT pg_temp.w62_assert('DF02-C3', 'INV-01: stock final 10-3-3=4 (sin oversell)', 4,
  (SELECT stock_current FROM public.products WHERE sku='W62-df0290010001'));
SELECT pg_temp.w62_assert('DF02-C4', 'Conc: WAC invariante 100 (salidas puras)', 100,
  (SELECT cost_average FROM public.products WHERE sku='W62-df0290010001'));
SELECT pg_temp.w62_assert('DF02-C5', 'Conc: valor restante 4×100=400 (=1000−600 COGS)', 400,
  (SELECT stock_current*cost_average FROM public.products WHERE sku='W62-df0290010001'));
COMMIT;
EOF
echo "DF02-CONC completado" | tee -a $OUT
