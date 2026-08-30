-- w7-ext-fase20.sql — W7 FASE 20: sync_product_stock tie-break (created_at idéntico)
-- Demostración controlada del nondeterminismo y del efecto NETO por ruta.
-- Clon: w7_gate (una sesión; fixture cargado por el runner).
-- ============================================================================
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_evid('F20: sync_product_stock — created_at idéntico en una TX');
SELECT pg_temp.w62_product('f20010000001','F20 SyncStock',10,100,150,'22222222-2222-2222-2222-222222222222'::uuid) AS p20 \gset

-- 20.1 DOS movimientos del MISMO producto con created_at/movement_date IDÉNTICOS
--      (insertados directamente para forzar el tie; emula 2 líneas del mismo SKU en 1 TX)
INSERT INTO public.stock_movements (product_id, store_id, created_by, quantity_change, movement_type, reference_id, reference_doc, unit_cost, movement_date, created_at)
VALUES (:'p20'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid,
        2, 'purchase', NULL, 'F20-A', 100, '2026-08-30 12:00:00+00', '2026-08-30 12:00:00+00');
INSERT INTO public.stock_movements (product_id, store_id, created_by, quantity_change, movement_type, reference_id, reference_doc, unit_cost, movement_date, created_at)
VALUES (:'p20'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid,
        -1, 'sale', NULL, 'F20-B', 100, '2026-08-30 12:00:00+00', '2026-08-30 12:00:00+00');

-- balances correctos por construcción: A → 12, B → 11; inventory incremental = 11
SELECT pg_temp.w62_assert('F20-1','inventory (ledger incremental) = 11 EXACTO (inmune al orden)', 11,
  (SELECT quantity FROM public.inventory WHERE product_id=:'p20'::uuid));
SELECT pg_temp.w62_assert_bool('F20-2','balance_after de los movimientos: A=12, B=11 (secuencia correcta en el ledger)', true,
  (SELECT (SELECT balance_after FROM public.stock_movements WHERE reference_doc='F20-A')=12
       AND (SELECT balance_after FROM public.stock_movements WHERE reference_doc='F20-B')=11));

-- 20.2 productos.stock_current tras el tie: sync_product_stock eligió CON created_at idéntico
--      (trg_sync_product_stock AFTER INSERT disparó por cada fila con ORDER BY …DESC LIMIT 1 ambiguo)
--      estado FINAL de products tras estas inserciones directas (sin UPDATE correctivo de register):
SELECT 'EVID|F20|stock_current post-tie (puede ser 12 = STALE, o 11): ' ||
  stock_current::text || ' | inventory=' ||
  (SELECT quantity::text FROM public.inventory WHERE product_id=:'p20'::uuid)
FROM public.products WHERE id=:'p20'::uuid;
SELECT pg_temp.w62_assert_bool('F20-3','divergencia cache↔ledger POSIBLE con tie (stock_current ∈ {11,12} vs inventory=11)', true,
  (SELECT (SELECT stock_current FROM public.products WHERE id=:'p20'::uuid) IN (11,12)));
ROLLBACK;

-- 20.3 EFECTO NETO por ruta RPC: create_sale_v2 con DOS líneas del MISMO producto (tie real de producción)
BEGIN;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT pg_temp.w62_product('f20010000002','F20 SameSKU sale',10,100,150,'22222222-2222-2222-2222-222222222222'::uuid) AS p20b \gset
SELECT public.create_sale_v2(
  p_store_id=>'22222222-2222-2222-2222-222222222222'::uuid,
  p_seller_id=>'11111111-1111-1111-1111-111111111111'::uuid,
  p_items=>'[{"product_id":"33333333-3333-3333-3333-f20010000002","quantity":2,"price_at_sale":150},{"product_id":"33333333-3333-3333-3333-f20010000002","quantity":3,"price_at_sale":150}]'::jsonb,
  p_payment_method=>'cash', p_total_amount=>750, p_subtotal=>750,
  p_idempotency_key=>'F20-SALE-TIE') AS s20 \gset
-- 2 movimientos de venta del mismo producto en la misma TX (created_at idéntico) → tie real
SELECT pg_temp.w62_assert('F20-4','ruta RPC venta 2 líneas mismo SKU: stock_final CORRECTO = 5 (register_stock_movement corrige tras cada INSERT)', 5,
  (SELECT stock_current FROM public.products WHERE id=:'p20b'::uuid));
SELECT pg_temp.w62_assert('F20-5','ruta RPC: inventory = 5 (ledger exacto)', 5,
  (SELECT quantity FROM public.inventory WHERE product_id=:'p20b'::uuid));
SELECT pg_temp.w62_assert('F20-6','ruta RPC: WAC invariante 100 (sync_product_stock NO toca WAC)', 100,
  (SELECT cost_average FROM public.products WHERE id=:'p20b'::uuid));
SELECT pg_temp.w62_assert_bool('F20-7','INV-01/02 no violadas: cache==ledger tras ruta RPC (register corrige el pick ambiguo del trigger)', true,
  (SELECT (SELECT stock_current FROM public.products WHERE id=:'p20b'::uuid)
     = (SELECT quantity FROM public.inventory WHERE product_id=:'p20b'::uuid)));
COMMIT;
\echo 'w7-ext-fase20: FIN'
