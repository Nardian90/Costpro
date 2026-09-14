-- =====================================================================
-- REM-INV-4B — RC-3 (baseline e2e2a19e)
-- security: harden cross-store authorization surface
--
-- RC-3 (F-RC-3, P1): get_transferable_stores cross-user/cross-tenant
--   enumeration.
--   Before: p_user_id (client-controlled) reached has_store_access_as() and
--           the tenant was derived from the client-controlled
--           p_current_store_id (nonexistent/legacy p_current_store_id removed
--           the tenant filter entirely). Any authenticated caller could
--           enumerate the full store rows of ANY user (cross-user), ANY
--           tenant (cross-tenant), and — via an admin subject UUID — ALL
--           stores. Reproduced in staging (E2/E2b/E3/LEG-1/LEG-2/E8-oracle).
--   After:  under authenticated, the ONLY server-verifiable subject is the
--           caller itself (auth.uid(), from the platform-signed JWT). A
--           foreign subject requires the trusted server route
--           (auth.role() = 'service_role'), reusing the RC-1 pattern
--           validated in REM-INV-4A-R.
--   Headers preserved verbatim: LANGUAGE plpgsql / SECURITY DEFINER /
--   SET search_path TO 'public' / signature (2 args) / proacl.
--
--   Legitimate contract preserved: the only production caller
--   (CreateTransferModal -> useTransferableStores -> transfer-service) always
--   passes the session user id; p_user_id = auth.uid() passes the gate.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_transferable_stores(p_user_id uuid, p_current_store_id uuid)
 RETURNS SETOF stores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- RC-3 (REM-INV-4B): a client-supplied subject identity (p_user_id) is NOT
  -- proof of authorization. Under authenticated, the ONLY server-verifiable
  -- subject is the caller itself (auth.uid(), from the platform-signed JWT).
  -- A foreign subject requires the trusted server route
  -- (auth.role() = 'service_role'), which reuses the RC-1 pattern validated
  -- in REM-INV-4A-R (create_sale_v2 supervisor gate).
  IF auth.role() <> 'service_role'
     AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ERR_TRANSFERABLE_STORES_UNAUTHORIZED';
  END IF;
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
$function$

