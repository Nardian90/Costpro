-- =====================================================================
-- FIX-SECURITY: v_global_operation_dates — cambiar a SECURITY INVOKER
-- Fecha: 2026-06-30
-- Severidad: CRITICAL (auditoría Supabase)
--
-- PROBLEMA:
--   La vista v_global_operation_dates era SECURITY DEFINER, lo que significa
--   que consultaba las tablas subyacentes con los permisos del CREADOR de la
--   vista (postgres/supabase_admin), no del usuario que la consulta.
--   Esto bypasseaba RLS en las tablas subyacentes.
--
--   Evidencia (probado en producción):
--     - Anon key (sin login) veía 405 registros de la vista
--     - Anon key veía 0 registros de transactions (RLS funcionaba en la tabla)
--     - La vista exponía fechas operativas de TODAS las tiendas sin filtrar
--
-- FIX:
--   Recrear la vista con SECURITY INVOKER. Así la vista respeta el RLS
--   del usuario que la consulta. Un usuario anónimo no verá nada (RLS
--   bloquea), y un usuario autenticado solo verá las fechas de las tiendas
--   a las que tiene acceso.
--
-- NOTA:
--   SECURITY INVOKER requiere PostgreSQL 15+. Supabase usa PG 15+ en todos
--   los proyectos nuevos, así que es seguro.
--
--   La definición de la vista (los UNION ALL) se preserva idéntica a la
--   última versión en 20260622000004_void_rpcs_op_date.sql. Solo cambiamos
--   la propiedad de seguridad.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_global_operation_dates
WITH (security_invoker = true) AS
-- Ventas (incluye anuladas — la anulación es un evento operativo)
SELECT 'sale'::text AS doc_type, id AS doc_id, store_id,
       COALESCE(cancelled_at, created_at) AS operation_date
FROM public.transactions
WHERE status IN ('completed', 'voided')
UNION ALL
-- Transferencias
SELECT 'transfer'::text, id, origin_store_id, created_at FROM public.transfers
WHERE status IN ('PENDIENTE', 'CONFIRMADA')
UNION ALL
-- Ajustes de inventario
SELECT 'inventory_adjustment'::text, id, store_id, created_at FROM public.inventory_adjustments
WHERE status IS NOT NULL
UNION ALL
-- Órdenes de compra: usar received_at si está disponible
SELECT 'purchase_order'::text, id, store_id, COALESCE(received_at, created_at) FROM public.purchase_orders
WHERE status IS NOT NULL
UNION ALL
-- Recepciones
SELECT 'receipt'::text, id, store_id, COALESCE(reception_date, created_at) FROM public.receipts
WHERE status IS NOT NULL
UNION ALL
-- Cierres de caja
SELECT 'cash_closure'::text, id, store_id, COALESCE(closed_at, created_at) FROM public.cash_closures
UNION ALL
-- Movimientos de caja
SELECT 'cash_movement'::text, id, store_id, created_at FROM public.cash_movements
UNION ALL
-- Sesiones de caja
SELECT 'cash_session'::text, id, store_id, COALESCE(opening_at, created_at) FROM public.cash_sessions
UNION ALL
-- Movimientos de stock
SELECT 'stock_movement'::text, id, store_id, created_at FROM public.stock_movements;

-- Comentario documentativo
COMMENT ON VIEW public.v_global_operation_dates IS
'Vista unificada de fechas operativas globales (ventas, transferencias, ajustes,
órdenes de compra, recepciones, cierres de caja, movimientos de stock).
SECURITY INVOKER desde 2026-06-30 — respeta RLS del usuario que consulta.
Antes era SECURITY DEFINER y bypasseaba RLS (bug crítico de seguridad).';
