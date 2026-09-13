-- DECLARED FINAL STATE (Git) de get_transferable_stores
-- fuente: 20260726000017_v2_6_h5_get_transferable_stores.sql stmt#0

CREATE OR REPLACE FUNCTION public.get_transferable_stores(
  p_user_id UUID,
  p_current_store_id UUID
)
RETURNS SETOF public.stores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- 1. Obtener tenant_id de la tienda actual
  SELECT tenant_id INTO v_tenant_id
  FROM public.stores
  WHERE id = p_current_store_id AND is_active = true;

  -- 2. Devolver tiendas donde el caller tiene acceso (has_store_access_as)
  --    EXCLUYENDO la tienda actual
  --    Si tenant_id es NOT NULL, filtrar por mismo tenant.
  --    Si tenant_id es NULL (legacy), mostrar todas las que el caller tiene acceso.
  IF v_tenant_id IS NOT NULL THEN
    RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.tenant_id = v_tenant_id
      AND s.id != p_current_store_id
      AND s.is_active = true
      AND s.is_archived = false
      AND public.has_store_access_as(p_user_id, s.id)
    ORDER BY s.name;
  ELSE
    -- Legacy: tiendas sin tenant_id — usar solo has_store_access_as
    RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.id != p_current_store_id
      AND s.is_active = true
      AND s.is_archived = false
      AND public.has_store_access_as(p_user_id, s.id)
    ORDER BY s.name;
  END IF;
END;
$$
