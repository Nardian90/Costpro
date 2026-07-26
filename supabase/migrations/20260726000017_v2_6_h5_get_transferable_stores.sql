-- ════════════════════════════════════════════════════════════════════════
-- V2.6 — H5: get_transferable_stores alineado con modelo de roles actual
--
-- PROBLEMA (auditoría H5):
-- La función se escribió en feb 2026 (20260211) con una regla fija:
--   "comparten al menos un encargado/manager/admin en user_store_memberships"
-- Pero desde entonces:
--   1. Se añadieron más roles (warehouse, costo, clerk, usuario)
--   2. Se introdujo tenant_id en has_store_access (junio 2026)
--   3. Los roles válidos ahora viven en user_role enum
--
-- SOLUCIÓN:
-- La nueva regla es: "tiendas del MISMO tenant donde el caller tiene
-- acceso (has_store_access_as)". Esto alinea con el modelo actual y
-- elimina la dependencia de una lista hardcodeada de roles.
-- ════════════════════════════════════════════════════════════════════════

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
$$;

GRANT EXECUTE ON FUNCTION public.get_transferable_stores(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transferable_stores(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.get_transferable_stores(UUID, UUID) IS
'V2.6 H5: Devuelve tiendas del MISMO tenant donde el caller tiene acceso (has_store_access_as). Reemplaza la regla obsoleta de feb 2026 que filtraba por roles hardcodeados (encargado/manager/admin).';

NOTIFY pgrst, 'reload schema';
