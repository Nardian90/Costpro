-- V2.12.43: Función central de disponibilidad + integración en create_sale
-- Resuelve T-6.1-6 (reclasificado a Alto): riesgo de integridad transversal

-- 1. get_available_stock: única fuente de verdad
CREATE OR REPLACE FUNCTION public.get_available_stock(
  p_store_id UUID,
  p_product_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stock_current NUMERIC;
  v_reserved NUMERIC;
  v_available NUMERIC;
BEGIN
  SELECT stock_current INTO v_stock_current
  FROM public.products
  WHERE id = p_product_id AND store_id = p_store_id;

  IF v_stock_current IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
  FROM public.inventory_reservations
  WHERE store_id = p_store_id
    AND product_id = p_product_id
    AND status = 'ACTIVE';

  v_available := v_stock_current - v_reserved;

  RETURN jsonb_build_object(
    'found', true,
    'stock_current', v_stock_current,
    'stock_reserved', v_reserved,
    'stock_available', v_available
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_stock(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_stock(UUID, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_available_stock(UUID, UUID) FROM anon;

-- 2. create_sale ahora valida stock_available antes de vender
-- (el RPC completo está en la BD, aquí solo documentamos el cambio)
-- El nuevo bloque en create_sale es:
--   SELECT * INTO v_stock_info FROM public.get_available_stock(p_store_id, v_pid);
--   IF (v_stock_info->>'found')::boolean THEN
--     IF (v_stock_info->>'stock_available')::numeric < v_qty THEN
--       RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: producto %, disponible %, solicitado %',
--         v_pid, (v_stock_info->>'stock_available'), v_qty;
--     END IF;
--   END IF;
