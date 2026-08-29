-- ============================================================================
-- CASO E — PRODUCCIÓN: MP withdrawal → costo server-side → costo producción → PT
-- Canónico (dueño §14-E): debe BLOQUEARSE cualquier costo = 0 silencioso
-- cuando existe información válida (MP con WAC=50).
--
-- Superficie real desplegada (v2 ≡ prod, S1=0):
--   withdraw_production_item LEGADO 6-arg  (costo = parámetro del cliente)
--   withdraw_production_item ENDURECIDA 9-arg con p_server_side_cost:
--     true  → costo desde products.cost_average FOR UPDATE, sin fallback (C-03/C-04)
--     false → costo del cliente (semántica legacy)
--   ⚠ Ambigüedad: llamar con los 6 args comunes → "function is not unique"
--
-- Plan:
--   E1  : ORD1 withdraw server_side=false, costo 0  (ataque legacy)   → defecto esperado
--   E1b : ORD2 withdraw server_side=true (ignora costo cliente)      → ¿remedio activo?
--   E2  : close ORD1 (sin key) → PT con MP a costo 0                 → contaminación
--   E3  : close ORD2 (sin key) → PT blend sobre PT contaminado
--   E7  : close ORD3 CON idempotency_key → uuid=text en audit_logs   → defecto drift
--   E5  : MP WAC intacto tras withdrawals
-- ============================================================================
\set ON_ERROR_STOP off
BEGIN;
\set ON_ERROR_ROLLBACK on
\i /home/z/my-project/scripts/af/af-common.sql

\echo '════ CASO E — PRODUCCIÓN ════'
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average, cost_price)
VALUES (:'PEMP'::uuid, 'AF Materia Prima', 'AF-E-MP', :'S'::uuid, 0, 0, 0),
       (:'PEPT'::uuid, 'AF Producto Terminado', 'AF-E-PT', :'S'::uuid, 0, 0, 0);
SELECT pg_temp.af_reception(:'PEMP'::uuid, 20, 50, 'E-R1', '2026-08-28 10:00:00+00') AS receipt_mp;

\echo '── STATE hash inicial (MP) ──'
SELECT 'STATE|E|start_mp|' || pg_temp.af_state_hash(:'PEMP'::uuid) AS state_hash;

\echo '── Órdenes de producción (in_progress) ──'
INSERT INTO public.production_orders (id, store_id, order_number, order_type, status, created_by)
VALUES ('55555555-5555-5555-5555-55555555e001', :'S'::uuid, 'AF-E-ORD1', 'production', 'in_progress', :'U'::uuid),
       ('55555555-5555-5555-5555-55555555e002', :'S'::uuid, 'AF-E-ORD2', 'production', 'in_progress', :'U'::uuid),
       ('55555555-5555-5555-5555-55555555e003', :'S'::uuid, 'AF-E-ORD3', 'production', 'in_progress', :'U'::uuid);
INSERT INTO public.production_order_items (id, order_id, product_id, budgeted_qty, budgeted_unit_cost, actual_qty)
VALUES ('55555555-5555-5555-5555-55555555e011', '55555555-5555-5555-5555-55555555e001', :'PEMP'::uuid, 5, 50, 0),
       ('55555555-5555-5555-5555-55555555e021', '55555555-5555-5555-5555-55555555e002', :'PEMP'::uuid, 5, 50, 0),
       ('55555555-5555-5555-5555-55555555e031', '55555555-5555-5555-5555-55555555e003', :'PEMP'::uuid, 5, 50, 0);

\echo '── E1 ATAQUE (semántica legacy server_side=false): withdraw 5 MP con costo cliente 0 ──'
SELECT public.withdraw_production_item(
  p_item_id => '55555555-5555-5555-5555-55555555e011'::uuid, p_qty => 5::numeric,
  p_unit_cost => 0::numeric, p_store_id => :'S'::uuid, p_user_id => :'U'::uuid,
  p_idempotency_key => 'AF-E-W1'::text,
  p_reference_id => NULL::uuid, p_reference_doc => 'AF-E1'::text,
  p_server_side_cost => false
) AS withdraw_legacy_costo0;
SELECT COALESCE(actual_unit_cost,-999) AS e1_costo_aceptado
FROM public.production_order_items WHERE id='55555555-5555-5555-5555-55555555e011' \gset
SELECT 'EVID|E|E1_legacy_costo0|actual_unit_cost=' || :'e1_costo_aceptado';

\echo '── E1b VARIANTE ENDURECIDA (server_side=true): costo lo fija el servidor ──'
SELECT public.withdraw_production_item(
  p_item_id => '55555555-5555-5555-5555-55555555e021'::uuid, p_qty => 5::numeric,
  p_unit_cost => 0::numeric, p_store_id => :'S'::uuid, p_user_id => :'U'::uuid,
  p_idempotency_key => 'AF-E-W2'::text,
  p_reference_id => NULL::uuid, p_reference_doc => 'AF-E1b'::text,
  p_server_side_cost => true
) AS withdraw_server_side;
SELECT COALESCE(actual_unit_cost,-999) AS e1b_costo_servidor
FROM public.production_order_items WHERE id='55555555-5555-5555-5555-55555555e021' \gset
SELECT 'EVID|E|E1b_server_side|actual_unit_cost=' || :'e1b_costo_servidor' || ' (canon: 50 = WAC MP)';

\echo '── EVIDENCIA movimientos production_out ──'
SELECT 'EVID|E|production_out|' || notes || '|qty=' || quantity_change || '|unit_cost=' || unit_cost
FROM public.stock_movements WHERE product_id=:'PEMP'::uuid AND movement_type='production_out' ORDER BY movement_date;

\echo '── E2 CIERRE ORD1 (MP al costo 0 del cliente) → PT ──'
SELECT public.close_production_order_v2(
  p_order_id => '55555555-5555-5555-5555-55555555e001'::uuid, p_store_id => :'S'::uuid,
  p_seller_id => :'U'::uuid, p_final_amount => 0::numeric, p_final_method => 'cash'::text,
  p_final_currency => 'CUP'::text, p_exchange_rate => 1.0::numeric,
  p_output_product_id => :'PEPT'::uuid, p_output_quantity => 5::numeric,
  p_user_id => :'U'::uuid, p_idempotency_key => NULL::text
) AS close_1;
SELECT COALESCE(cost_average,-999) AS e_pt_wac_close1 FROM public.products WHERE id=:'PEPT'::uuid \gset
SELECT 'EVID|E|post_close1|PT_cost_average=' || :'e_pt_wac_close1' || ' (canon: 50; contaminado por costo-0: 0)';

\echo '── E3 CIERRE ORD2 (MP server-side 50) → PT blend sobre PT contaminado ──'
SELECT public.close_production_order_v2(
  p_order_id => '55555555-5555-5555-5555-55555555e002'::uuid, p_store_id => :'S'::uuid,
  p_seller_id => :'U'::uuid, p_final_amount => 0::numeric, p_final_method => 'cash'::text,
  p_final_currency => 'CUP'::text, p_exchange_rate => 1.0::numeric,
  p_output_product_id => :'PEPT'::uuid, p_output_quantity => 5::numeric,
  p_user_id => :'U'::uuid, p_idempotency_key => NULL::text
) AS close_2;
SELECT COALESCE(stock_current,-999) AS e_pt_stock, COALESCE(cost_average,-999) AS e_pt_wac
FROM public.products WHERE id=:'PEPT'::uuid \gset
SELECT 'EVID|E|post_close2|PT_stock=' || :'e_pt_stock' || '|PT_cost_average=' || :'e_pt_wac' || ' (canon sin contaminación: 50; blend con PT=0 previo: 25)';
SELECT 'EVID|E|production_in|qty=' || quantity_change || '|unit_cost=' || unit_cost
FROM public.stock_movements WHERE product_id=:'PEPT'::uuid AND movement_type='production_in' ORDER BY movement_date;
SELECT 'EVID|E|MP_post_withdraws|stock=' || stock_current || '|wac=' || cost_average
FROM public.products WHERE id=:'PEMP'::uuid;

\echo '── E7 CIERRE CON idempotency_key (drift uuid=text en audit_logs) ──'
SELECT public.close_production_order_v2(
  p_order_id => '55555555-5555-5555-5555-55555555e003'::uuid, p_store_id => :'S'::uuid,
  p_seller_id => :'U'::uuid, p_final_amount => 0::numeric, p_final_method => 'cash'::text,
  p_final_currency => 'CUP'::text, p_exchange_rate => 1.0::numeric,
  p_output_product_id => :'PEPT'::uuid, p_output_quantity => 1::numeric,
  p_user_id => :'U'::uuid, p_idempotency_key => 'AF-E-C3'::text
) AS close_con_key;
SELECT 'EVID|E|E7_close_con_key|resultado=ERROR_operator_uuid_text (ver log) | estado_orden3=' ||
  (SELECT status FROM public.production_orders WHERE id='55555555-5555-5555-5555-55555555e003'::uuid);

\echo '── ASSERTIONS (canon E) ──'
SELECT pg_temp.af_assert_bool('E.1','Legacy (server_side=false): servidor rechaza/sustituye costo 0 (canon: bloquear 0 silencioso)',
  false, (:'e1_costo_aceptado'::numeric = 0));
SELECT pg_temp.af_assert('E.1b','Variante endurecida server_side=true: costo impuesto por servidor = 50', 50, :'e1b_costo_servidor'::numeric);
SELECT pg_temp.af_assert('E.2','PT valúo tras ORD1 con MP info válida WAC=50 (canon: 50)', 50, :'e_pt_wac_close1'::numeric);
SELECT pg_temp.af_assert_bool('E.3','ORD2 con costo server-side 50 aceptado y registrado',
  (:'e1b_costo_servidor'::numeric = 50), true);
SELECT pg_temp.af_assert('E.4','PT WAC final tras ambos cierres (canon sin contaminación: 50)', 50, :'e_pt_wac'::numeric);
SELECT pg_temp.af_assert_bool('E.5','MP WAC intacto tras withdrawals (salidas no alteran WAC=50)',
  (SELECT round(cost_average,6)=50 FROM public.products WHERE id=:'PEMP'::uuid), true);
SELECT pg_temp.af_assert_bool('E.7','close_production_order_v2 CON idempotency_key funciona (canon: idempotencia soportada)',
  true, (SELECT status='closed' FROM public.production_orders WHERE id='55555555-5555-5555-5555-55555555e003'::uuid));

\echo '── STATE hash final (MP) ──'
SELECT 'STATE|E|end_mp|' || pg_temp.af_state_hash(:'PEMP'::uuid) AS state_hash;
ROLLBACK;

\echo '── RESIDUO ──'
SELECT 'RESIDUE|E|products='||cnt FROM (SELECT count(*) cnt FROM public.products WHERE id IN (:'PEMP'::uuid, :'PEPT'::uuid)) x;
SELECT 'RESIDUE|E|orders='||cnt FROM (SELECT count(*) cnt FROM public.production_orders WHERE store_id=:'S'::uuid) x;
SELECT 'RESIDUE|E|movements='||cnt FROM (SELECT count(*) cnt FROM public.stock_movements WHERE product_id IN (:'PEMP'::uuid,:'PEPT'::uuid)) x;
\echo '════ FIN CASO E ════'
