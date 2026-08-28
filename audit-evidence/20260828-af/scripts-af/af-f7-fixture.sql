-- ============================================================================
-- F7-RACE — Concurrencia: fixture COMMITIDO en clon efímero costpro_audit_v2_conc
-- (clon TEMPLATE de costpro_audit_v2; v2 jamás mutado; clon se destruye al final)
-- Setup: recepción 10 @ 100 → venta 5 @ 200 (costo 100) → stock 5.
-- ============================================================================
\set ON_ERROR_STOP on
\set U 11111111-1111-1111-1111-111111111111
\set S 22222222-2222-2222-2222-222222222222
\set PF 33333333-3333-3333-3333-33333333a007
SET request.jwt.claim.sub = :'U';
SET request.jwt.claim.role = 'authenticated';
INSERT INTO auth.users (id) VALUES (:'U'::uuid) ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, full_name, is_active)
VALUES (:'U'::uuid, 'admin', 'AF F7', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.stores (id, name) VALUES (:'S'::uuid, 'AF F7 Store') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average, cost_price)
VALUES (:'PF'::uuid, 'AF F7 Producto', 'AF-F7-001', :'S'::uuid, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.receipts (id, store_id, user_id, status, reference_doc)
VALUES ('44444444-4444-4444-4444-44444444f701', :'S'::uuid, :'U'::uuid, 'pending', 'AF-F7-R1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
VALUES ('44444444-4444-4444-4444-44444444f701', :'PF'::uuid, 10, 100, 1.0);
SELECT public.confirm_pending_reception('44444444-4444-4444-4444-44444444f701', :'U'::uuid);
SELECT public.create_sale_v2(
  p_store_id => :'S'::uuid, p_seller_id => :'U'::uuid,
  p_items => '[{"product_id":"33333333-3333-3333-3333-33333333a007","quantity":5,"price":200,"cost_at_sale":100}]'::jsonb,
  p_payment_method => 'cash', p_idempotency_key => 'AF-F7-SALE-1',
  p_subtotal => 1000, p_total_amount => 1000
) AS venta;
\echo '── fixture F7 COMMITIDO ──'
