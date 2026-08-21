-- ============================================================================
-- Migration: 20260820000004_sync_products_stock_current.sql
-- Sincroniza products.stock_current con inventory.quantity (fuente de verdad)
--
-- CAUSA RAÍZ DE LA DESINCRONIZACIÓN:
-- El RPC reset_store_data (ejecutado el 2026-08-11 para reconstruir Puerto Padre)
-- usa set_config('app.restore_mode', 'true', true) para bypassear triggers.
-- Esto reseteó products.stock_current = 0 sin que los triggers de stock_movements
-- se re-ejecutaran después. Los datos de inventory se restauraron correctamente
-- (vía register_reception + create_sale que sí disparan triggers), pero
-- products.stock_current quedó en 0 para 67 productos.
--
-- CORRECCIÓN:
-- 1. Sincronizar products.stock_current = inventory.quantity para TODOS los
--    productos activos de ENERVIDA-VITALLCONS donde divergen.
-- 2. El RPC get_paginated_products ya fue corregido (migration 20260820000003)
--    para leer inventory.quantity en vez de products.stock_current.
-- 3. Esta migración asegura que products.stock_current también quede correcto
--    para otros consumidores que aún lo leen.
-- ============================================================================

UPDATE public.products p
SET stock_current = COALESCE(
  (SELECT inv.quantity FROM public.inventory inv
   WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0
),
updated_at = now()
WHERE p.is_active = true
  AND p.stock_current != COALESCE(
    (SELECT inv.quantity FROM public.inventory inv
     WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0
  );

-- Verification query (run manually to confirm):
-- SELECT
--   CASE WHEN p.stock_current = COALESCE(inv.quantity, 0) THEN 'MATCH' ELSE 'MISMATCH' END AS status,
--   COUNT(*) AS count
-- FROM public.products p
-- LEFT JOIN public.inventory inv ON inv.product_id = p.id AND inv.store_id = p.store_id
-- WHERE p.is_active = true
-- GROUP BY 1;
