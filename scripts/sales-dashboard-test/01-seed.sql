-- Datos de prueba: 2 tiendas, 3 vendedores, ventas multimoneda, devoluciones,
-- pagos, anulación, conflicto sync, producto sin movimiento.
-- Tiempos fijos en America/Havana para aserciones deterministas.
\set ON_ERROR_STOP on

BEGIN;

-- tiendas
INSERT INTO stores (id, name, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Tienda Centro', true),
  ('22222222-2222-2222-2222-222222222222', 'Tienda Norte', true);

-- perfiles: admin (multi-tienda), clerk A (solo Centro), clerk B (solo Norte)
INSERT INTO profiles (id, full_name, email, role, active_store_id, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Admin General', 'admin@test.cu', 'admin', '11111111-1111-1111-1111-111111111111', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Clerk Ana', 'ana@test.cu', 'clerk', '11111111-1111-1111-1111-111111111111', true),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Clerk Bruno', 'bruno@test.cu', 'clerk', '22222222-2222-2222-2222-222222222222', true);

INSERT INTO user_store_memberships (user_id, store_id, role, status) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'admin', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'clerk', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'clerk', 'active');

-- productos (Centro): P1 popular, P2 caro, P3 sin movimiento
INSERT INTO products (id, store_id, name, sku, price, cost_price, is_active, status) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Refresco Cola', 'SKU-001', 150, 100, true, 'ACTIVE'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Ron Añejo', 'SKU-002', 2500, 1800, true, 'ACTIVE'),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Polvo de Hornear', 'SKU-003', 90, 50, true, 'ACTIVE');

-- ══ VENTAS TIENDA CENTRO (nov 2026, America/Havana) ════════════════════════
-- V1 (2 nov, 10:00h, Ana): P1 x4 = 600 bruto, desc 100, total 500 (cash)
INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at)
VALUES ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 500, 'completed', 'cash', 600, 100, 0, 'CUP', 1, '2026-11-02 10:00-05', '2026-11-02 10:00-05');
INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup, item_discount_value)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 4, 150, 150, 0);
INSERT INTO payment_transactions (id, store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date)
VALUES ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'sale', 'cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 500, 'cash', 'CUP', 1, 'in', '2026-11-02 10:00-05');

-- V2 (3 nov, 15:30h, Admin): P2 x1 = 2500 bruto, sin desc, total 2500 (transfer CUP)
INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at)
VALUES ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 2500, 'completed', 'transfer', 2500, 0, 0, 'CUP', 1, '2026-11-03 15:30-05', '2026-11-03 15:30-05');
INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup, item_discount_value)
VALUES ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 1, 2500, 2500, 0);
INSERT INTO payment_transactions (id, store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date)
VALUES ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'sale', 'cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', 2500, 'transfer', 'CUP', 1, 'in', '2026-11-03 15:30-05');

-- V3 (5 nov, 12:00h, Ana): venta USD-zelle: P2 x1 = 10 USD a tasa 400 → CUP 4000; pago zelle USD
INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at, zelle_amount)
VALUES ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 4000, 'completed', 'zelle', 4000, 0, 0, 'USD', 400, '2026-11-05 12:00-05', '2026-11-05 12:00-05', 4000);
INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup, item_discount_value, price_currency, currency, exchange_rate)
VALUES ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 1, 10, 4000, 0, 'USD', 'USD', 400);
INSERT INTO payment_transactions (id, store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date)
VALUES ('dddddddd-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'sale', 'cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003', 10, 'zelle', 'USD', 400, 'in', '2026-11-05 12:00-05');

-- V4 (6 nov, 18:45h, Ana): P1 x2 = 300, VOIDED (no cuenta como venta)
INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at, void_reason)
VALUES ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 300, 'voided', 'cash', 300, 0, 0, 'CUP', 1, '2026-11-06 18:45-05', '2026-11-06 18:45-05', 'prueba');
INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup, item_discount_value)
VALUES ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001', 2, 150, 150, 0);

-- V5 (7 nov, 09:15h, Admin): P1 x2 + P2 x1 = 2800 bruto, desc 300, total 2500, mixto: cash 1000 + zelle 3.75USD(1500)
INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at, cash_amount, zelle_amount)
VALUES ('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 2500, 'completed', 'mixed', 2800, 300, 0, 'USD', 400, '2026-11-07 09:15-05', '2026-11-07 09:15-05', 1000, 1500);
INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup, item_discount_value) VALUES
  ('cccccccc-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000001', 2, 150, 150, 0),
  ('cccccccc-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000002', 1, 2500, 2500, 0);
INSERT INTO payment_transactions (id, store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date) VALUES
  ('dddddddd-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'sale', 'cccccccc-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000005', 1000, 'cash', 'CUP', 1, 'in', '2026-11-07 09:15-05'),
  ('dddddddd-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'sale', 'cccccccc-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000005', 3.75, 'zelle', 'USD', 400, 'in', '2026-11-07 09:15-05');

-- VENTA SIN PAGOS REGISTRADOS (alerta conciliación): V6 (8 nov, 14:00h, Ana) P1 x1 = 150
INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at)
VALUES ('cccccccc-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 150, 'completed', 'cash', 150, 0, 0, 'CUP', 1, '2026-11-08 14:00-05', '2026-11-08 14:00-05');
INSERT INTO transaction_items (transaction_id, product_id, quantity, price_at_sale, price_at_sale_cup, item_discount_value)
VALUES ('cccccccc-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000001', 1, 150, 150, 0);

-- ══ VENTA TIENDA NORTE (aislamiento) ═══════════════════════════════════════
-- V7 (4 nov, Bruno): total 999 CUP
INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at)
VALUES ('cccccccc-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000003', 999, 'completed', 'cash', 999, 0, 0, 'CUP', 1, '2026-11-04 11:00-05', '2026-11-04 11:00-05');
INSERT INTO payment_transactions (id, store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date)
VALUES ('dddddddd-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'sale', 'cccccccc-0000-0000-0000-000000000007', 'cccccccc-0000-0000-0000-000000000007', 999, 'cash', 'CUP', 1, 'in', '2026-11-04 11:00-05');

-- ══ VENTA DEL PERÍODO ANTERIOR (oct: variación) ════════════════════════════
-- V8 (2 oct, Ana, Centro): total 1000
INSERT INTO transactions (id, store_id, seller_id, total_amount, status, payment_method, subtotal, discount_value, tax_amount, sale_currency, sale_exchange_rate, completed_at, created_at)
VALUES ('cccccccc-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 1000, 'completed', 'cash', 1000, 0, 0, 'CUP', 1, '2026-10-02 10:00-05', '2026-10-02 10:00-05');
INSERT INTO payment_transactions (id, store_id, ref_type, ref_id, transaction_id, amount, payment_method, currency, exchange_rate, direction, payment_date)
VALUES ('dddddddd-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'sale', 'cccccccc-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000008', 1000, 'cash', 'CUP', 1, 'in', '2026-10-02 10:00-05');

-- ══ DEVOLUCIÓN CUP (sobre V2, procesada 6 nov por Admin): 500 CUP ═════════
INSERT INTO devolutions (id, store_id, original_transaction_id, devolution_number, reason, total_amount, currency, exchange_rate, payment_method, status, processed_by, created_at)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002', 'NC-0001', 'producto dañado', 500, 'CUP', 1, 'cash', 'completed', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-06 16:00-05');
INSERT INTO devolution_items (devolution_id, product_id, quantity, unit_price, total)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 0.2, 2500, 500);

-- ══ DEVOLUCIÓN USD (sobre V3, 7 nov): 5 USD ═══════════════════════════════
INSERT INTO devolutions (id, store_id, original_transaction_id, devolution_number, reason, total_amount, currency, exchange_rate, payment_method, status, processed_by, created_at)
VALUES ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', 'NC-0002', 'cambio de opinión', 5, 'USD', 400, 'zelle', 'completed', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-07 17:00-05');
INSERT INTO devolution_items (devolution_id, product_id, quantity, unit_price, total)
VALUES ('eeeeeeee-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 0.5, 10, 5);

-- ══ sync_log: 1 conflicto y 1 error de venta en el período ═════════════════
INSERT INTO sync_log (idempotency_key, user_id, store_id, entity, operation_type, status, created_at) VALUES
  ('11111111-2222-3333-4444-555555555555', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'sale', 'CREATE', 'conflict', '2026-11-05 09:00-05'),
  ('11111111-2222-3333-4444-555555555556', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'sale', 'CREATE', 'error', '2026-11-06 09:00-05');

COMMIT;
