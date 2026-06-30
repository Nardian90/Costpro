-- =====================================================================
-- Migration: get_low_stock_count RPC
-- Fecha: 2026-06-30
-- Propósito: Optimizar la query de stock bajo (FIX-400 auditoría v3)
--
-- Problema:
--   PostgREST NO soporta comparar dos columnas con operadores de orden
--   (lte, gte, etc.) — solo eq/neq. Las queries del frontend generaban:
--     or=(stock_current.lte.min_stock) → HTTP 400
--     filter('stock', 'lte', 'min_stock') → HTTP 400 (columna 'stock' no existe)
--
-- Solución:
--   RPC SECURITY DEFINER que cuenta server-side los productos con:
--     - is_active = true
--     - stock_current > 0
--     - min_stock IS NOT NULL AND min_stock > 0
--     - stock_current <= min_stock
--
--   Si p_store_id es NULL, cuenta en todas las tiendas.
--   Si p_store_id se provee, filtra por esa tienda.
--
--   Al ser SECURITY DEFINER + GRANT EXECUTE TO anon/authenticated,
--   cualquier usuario autenticado puede llamarla sin tocar RLS de products
--   (la función corre con permisos del owner, que es seguro porque es
--   read-only).
--
-- Uso desde el frontend:
--   const { data } = await supabase.rpc('get_low_stock_count', { p_store_id: storeId })
--   const count = data ?? 0
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_low_stock_count(p_store_id uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.products
  WHERE
    (p_store_id IS NULL OR store_id = p_store_id)
    AND is_active = true
    AND stock_current > 0
    AND min_stock IS NOT NULL
    AND min_stock > 0
    AND stock_current <= min_stock;
$$;

COMMENT ON FUNCTION public.get_low_stock_count(uuid) IS
'Cuenta productos activos con stock_current > 0 y stock_current <= min_stock.
Si p_store_id es NULL, cuenta en todas las tiendas. Filtra en BD para evitar
el HTTP 400 que ocurre al intentar comparar dos columnas via PostgREST.';

-- Permisos: cualquier usuario autenticado o anónimo puede ejecutarla.
-- La función es SECURITY DEFINER (corre como owner) y read-only, así que
-- no hay riesgo de escalada de privilegios.
GRANT EXECUTE ON FUNCTION public.get_low_stock_count(uuid) TO anon, authenticated;
