-- SQL checks para diagnóstico de auditoría (solo SELECTs)
-- Ejecutar en staging

-- 1) Listar tablas públicas
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- 2) Contar filas en tablas clave
SELECT 'stock_movements' AS table_name, COUNT(*) FROM public.stock_movements;
SELECT 'inventory' AS table_name, COUNT(*) FROM public.inventory;
SELECT 'receipts' AS table_name, COUNT(*) FROM public.receipts;
SELECT 'receipt_items' AS table_name, COUNT(*) FROM public.receipt_items;

-- 3) Receipts sin items
SELECT r.id, r.reference_doc, r.created_at FROM public.receipts r LEFT JOIN public.receipt_items ri ON ri.receipt_id = r.id WHERE ri.id IS NULL LIMIT 50;

-- 4) Stock vs sumatoria de movimientos
SELECT i.store_id, i.product_id, i.quantity AS inventory_quantity, COALESCE(sm.sum_qty,0) AS movements_sum FROM public.inventory i LEFT JOIN (SELECT store_id, product_id, SUM(quantity_change) AS sum_qty FROM public.stock_movements GROUP BY store_id, product_id) sm ON i.store_id = sm.store_id AND i.product_id = sm.product_id WHERE i.quantity <> COALESCE(sm.sum_qty,0) LIMIT 50;

-- 5) Movimientos de compra sin receipt asociado
SELECT sm.* FROM public.stock_movements sm LEFT JOIN public.receipts r ON sm.reference_id::uuid = r.id WHERE sm.movement_type = 'purchase' AND r.id IS NULL LIMIT 100;

-- 6) Receipts duplicados por referencia
SELECT reference_doc, COUNT(*) FROM public.receipts GROUP BY reference_doc HAVING COUNT(*) > 1 LIMIT 50;

-- 7) Policies RLS en esquema public
SELECT * FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;

-- 8) Funciones públicas relacionadas con recepción
SELECT routine_name, routine_definition FROM information_schema.routines WHERE specific_schema = 'public' AND (routine_name ILIKE '%reception%' OR routine_name ILIKE '%register%' OR routine_name ILIKE '%cancel%' OR routine_name ILIKE '%current_user_store_id%');
