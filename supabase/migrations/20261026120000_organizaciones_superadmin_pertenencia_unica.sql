-- ============================================================================
-- MISIÓN ORGANIZACIONES / SUPERADMIN / PERTENENCIA ÚNICA (2026-10-26)
-- FASES 2-3 de la misión: SuperAdmin global + invariante de empresa única.
--
-- CONTENIDO (todo idempotente y retrocompatible):
--   1. is_superadmin()                — función canónica del rol de plataforma
--   2. is_admin() / is_global_admin() — incluyen 'superadmin' (cierra el hueco:
--                                        el enum ya lo tenía pero is_admin solo
--                                        aceptaba 'admin')
--   3. is_admin_check(p_user_id)      — igual inclusión
--   4. Policies endurecidas           — tenants visibles solo a SuperAdmin
--                                        (antes CUALQUIER admin veía TODOS los
--                                        tenants transversalmente)
--   5. Trigger de consistencia        — user_store_memberships rechaza
--                                        membresías cruzando tenants
--   6. Activación de SuperAdmin       — admin@demo.com (guarded, ver nota)
--
-- CORRECCIÓN CP-ORG-001 (2026-10-25, pre-despliegue — esta migración NUNCA se
-- aplicó a producción, por lo que se corrige en el propio archivo):
--   a. assign_user_organization: el actor se vincula a auth.uid() con el
--      patrón anti-spoofing H-7 (idéntico al de los 8 RPC corregidos en
--      20260820000001). Antes aceptaba p_actor_id arbitrario de CUALQUIER
--      authenticated vía PostgREST directo → escalamiento de privilegios.
--   b. assign_user_organization: el UPDATE del perfil filtraba por filas
--      cuyo active_store_id fuera NULL o ajeno al destino; si la tienda
--      activa ya pertenecía a la empresa destino (o era legacy sin tenant),
--      el cambio de empresa se OMITÍA silenciosamente reportando
--      applied=true. Ahora tenant_id se aplica SIEMPRE y solo
--      active_store_id se limpia condicionalmente.
--
-- ----------------------------------------------------------------------------
-- NOTA DE DESPLIEGUE (IMPORTANTE):
--   El paso 6 activa el rol 'superadmin' en admin@demo.com. El código de la
--   app que lo soporta (UserRole, jerarquía, navegación) viaja en ESTE mismo
--   PR. Aplicar migración y desplegar código JUNTOS — si la migración se
--   aplicara con el código anterior desplegado, la cuenta perdería el acceso
--   a las vistas admin hasta el despliegue. Es idempotente y guarda con
--   AND role = 'admin' para no tocar cuentas ya migradas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. is_superadmin() — rol de plataforma explícito, validado por el servidor.
--    Es la ÚNICA fuente canónica: ningún policy ni RPC debe confiar en una
--    cadena enviada por el cliente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'superadmin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. is_admin() / is_global_admin() — 'superadmin' hereda TODA la capacidad
--    administrativa existente (75+ policies dependen de is_admin()).
--    Antes: role = 'admin' solamente → un superadmin habría perdido acceso.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. is_admin_check(p_user_id) — variante por ID (usada por RPCs de gestión).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_check(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND role IN ('admin', 'superadmin')
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. Policies endurecidas — el acceso transversal a TENANTS queda reservado al
--    SuperAdmin. Un administrador ordinario solo ve su propia organización
--    (la suya por tenant_id o por ser owner). Antes: is_admin() daba a
--    CUALQUIER admin la lista completa de empresas de todos los clientes.
--    NO se debilita ninguna policy: se estrecha.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS tenants_select_own_or_admin ON public.tenants;
CREATE POLICY tenants_select_own_or_admin ON public.tenants
  FOR SELECT TO authenticated
  USING (
    is_superadmin()
    OR owner_id = auth.uid()
    OR id = public.current_user_tenant_id()
  );

DROP POLICY IF EXISTS tenants_select_own_or_store_member ON public.tenants;
CREATE POLICY tenants_select_own_or_store_member ON public.tenants
  FOR SELECT TO authenticated
  USING (
    is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.tenant_id = tenants.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_store_memberships m
      JOIN public.stores s ON s.id = m.store_id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND s.tenant_id = tenants.id
    )
  );

-- Tiendas: un admin ordinario ve las de SU tenant; el SuperAdmin ve todas.
-- (is_admin() ya incluye superadmin; se preserva el fallback legacy para
-- tiendas sin tenant.)
DROP POLICY IF EXISTS stores_tenant_select ON public.stores;
CREATE POLICY stores_tenant_select ON public.stores
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
        (tenant_id = public.current_user_tenant_id())
      ELSE
        (public.is_superadmin()
         OR (public.is_admin() AND tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id())
         OR (id = ANY (public.current_user_store_ids())))
    END
  );

-- ----------------------------------------------------------------------------
-- 5. Invariante de empresa única (FASE 2 §4) — una membresía a una tienda de
--    OTRA organización se rechaza en la base de datos. Aplica cuando AMBOS
--    lados tienen tenant asignado (compatibilidad con stores legacy sin
--    tenant: se permiten, igual que validate_tenant_access).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_membership_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_tenant uuid;
  v_profile_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = NEW.store_id;
  SELECT tenant_id INTO v_profile_tenant FROM public.profiles WHERE id = NEW.user_id;

  IF v_store_tenant IS NOT NULL
     AND v_profile_tenant IS NOT NULL
     AND v_store_tenant <> v_profile_tenant THEN
    RAISE EXCEPTION 'Membresía rechazada: la tienda pertenece a otra organización distinta a la del usuario'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_tenant_consistency ON public.user_store_memberships;
CREATE TRIGGER trg_membership_tenant_consistency
  BEFORE INSERT OR UPDATE OF user_id, store_id ON public.user_store_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_membership_tenant_consistency();

-- ----------------------------------------------------------------------------
-- 6. Activación de la cuenta SuperAdmin designada: admin@demo.com
--    (FASE 3). Idempotente y guardada. La cuenta NO conserva membresías de
--    tienda ni tienda activa (rol de plataforma global, no empresa comercial).
--    tenant_id se conserva: el rol de plataforma no exige renunciar al
--    tenant propio y evita regresiones de visibilidad RLS en policies que
--    aún comparan tenant (documentado en el expediente de la misión).
-- ----------------------------------------------------------------------------
UPDATE public.profiles
SET role = 'superadmin',
    store_id = NULL,
    active_store_id = NULL,
    updated_at = now()
WHERE email = 'admin@demo.com'
  AND role = 'admin';

DELETE FROM public.user_store_memberships m
USING public.profiles p
WHERE m.user_id = p.id
  AND p.email = 'admin@demo.com'
  AND p.role = 'superadmin';

-- Nota de auditoría: ninguna OTRA cuenta recibe 'superadmin' aquí. La
-- enumeración explícita (solo admin@demo.com) es parte del mandato; si más
-- adelante se designan más cuentas, debe hacerse con revisión y pruebas
-- equivalentes, nunca por coincidencia de nombre o email parecido.

-- ----------------------------------------------------------------------------
-- 7. RPC atómica de asignación de empresa (FASE 2 §3).
--    assign_user_organization(p_actor_id, p_user_id, p_tenant_id, p_confirm)
--
--    Reglas (espejo de la misión):
--      a. Solo SuperAdmin reasigna entre empresas distintas / deja sin
--         asignar. Un admin ordinario solo puede (re)asignar usuarios de SU
--         empresa a SU empresa.
--      b. Nunca toca cuentas superadmin (rol de plataforma, sin empresa).
--      c. La empresa destino debe existir y estar activa.
--      d. Las membresías en tiendas de OTRA empresa se retiran en la MISMA
--         transacción (no se conservan permisos de la empresa anterior).
--      e. Si hay membresías que retirar y p_confirm es false, NO aplica
--         nada: devuelve el detalle para que el operador confirme.
--      f. Audita en user_audit_log (old/new tenant + membresías retiradas).
--    El trigger del paso 5 queda como última barrera ante cualquier camino
--    que intente colar una membresía cruzando empresas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_user_organization(
  p_actor_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_confirm_removals boolean DEFAULT false
)
RETURNS TABLE (applied boolean, requires_confirmation boolean, removed_memberships int, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- CORRECCIÓN CP-ORG-001 (a): patrón anti-spoofing H-7 — un llamado
  -- authenticated usa SIEMPRE auth.uid() como actor (p_actor_id se ignora);
  -- solo service_role (la ruta API con clave de servicio) puede declarar
  -- p_actor_id (la sesión del usuario autenticado que la invoca).
  v_actor_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_actor_id, auth.uid()) ELSE auth.uid() END;
  v_actor_role public.user_role;
  v_actor_tenant uuid;
  v_user_tenant uuid;
  v_user_role public.user_role;
  v_target_active boolean;
  v_old_tenant uuid;
  v_removed int := 0;
BEGIN
  IF v_actor_uid IS NULL OR p_user_id IS NULL THEN
    RETURN QUERY SELECT false, false, 0, 'Parámetros incompletos'::text;
    RETURN;
  END IF;

  SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
    FROM public.profiles WHERE id = v_actor_uid;
  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'superadmin') THEN
    RETURN QUERY SELECT false, false, 0, 'El actor no tiene permisos administrativos'::text;
    RETURN;
  END IF;

  SELECT role, tenant_id INTO v_user_role, v_user_tenant
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 0, 'Usuario destino no encontrado'::text;
    RETURN;
  END IF;

  IF v_user_role = 'superadmin' THEN
    RETURN QUERY SELECT false, false, 0, 'La cuenta SuperAdmin de plataforma no pertenece a una empresa'::text;
    RETURN;
  END IF;

  -- Admin ordinario: solo su propia empresa, y solo usuarios de su empresa.
  IF v_actor_role <> 'superadmin' THEN
    IF p_tenant_id IS DISTINCT FROM v_actor_tenant OR v_user_tenant IS DISTINCT FROM v_actor_tenant THEN
      RETURN QUERY SELECT false, false, 0, 'Un administrador solo puede gestionar su propia empresa'::text;
      RETURN;
    END IF;
  END IF;

  IF p_tenant_id IS NOT NULL THEN
    SELECT is_active INTO v_target_active FROM public.tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, false, 0, 'La organización no existe'::text;
      RETURN;
    END IF;
    IF NOT v_target_active THEN
      RETURN QUERY SELECT false, false, 0, 'La organización está inactiva'::text;
      RETURN;
    END IF;
  END IF;

  v_old_tenant := v_user_tenant;

  -- Membresías que quedarían de otra empresa (tiendas con tenant distinto
  -- del destino). Tiendas sin tenant (legacy) no se consideran ajenas.
  SELECT count(*) INTO v_removed
    FROM public.user_store_memberships m
    JOIN public.stores s ON s.id = m.store_id
   WHERE m.user_id = p_user_id
     AND m.status = 'active'
     AND s.tenant_id IS NOT NULL
     AND s.tenant_id IS DISTINCT FROM p_tenant_id;

  IF v_removed > 0 AND NOT p_confirm_removals THEN
    RETURN QUERY SELECT false, true, v_removed,
      'La reasignación retirará membresías de tiendas de otra empresa; confirma para aplicar'::text;
    RETURN;
  END IF;

  -- Aplicación atómica: retirar memberships ajenos + mover empresa +
  -- limpiar tienda activa/store_id si quedaron apuntando afuera.
  IF v_removed > 0 THEN
    DELETE FROM public.user_store_memberships m
     USING public.stores s
     WHERE m.store_id = s.id
       AND m.user_id = p_user_id
       AND m.status = 'active'
       AND s.tenant_id IS NOT NULL
       AND s.tenant_id IS DISTINCT FROM p_tenant_id;
  END IF;

  -- CORRECCIÓN CP-ORG-001 (b): tenant_id se aplica SIEMPRE (el cambio de
  -- empresa nunca se omite). active_store_id solo se limpia cuando apunta a
  -- una tienda AJENA al destino (con tenant asignado distinto); si pertenece
  -- al destino o es legacy sin tenant, se conserva (coherente con el
  -- criterio de las membresías que se retiran arriba).
  UPDATE public.profiles
     SET tenant_id = p_tenant_id,
         active_store_id = CASE
           WHEN active_store_id IS NULL THEN NULL
           WHEN EXISTS (
             SELECT 1 FROM public.stores s2
             WHERE s2.id = profiles.active_store_id
               AND s2.tenant_id IS NOT NULL
               AND s2.tenant_id IS DISTINCT FROM p_tenant_id
           ) THEN NULL
           ELSE active_store_id
         END,
         updated_at = now()
   WHERE id = p_user_id;

  INSERT INTO public.user_audit_log (
    performed_by, target_user_id, action, old_values, new_values, metadata
  ) VALUES (
    v_actor_uid,
    p_user_id,
    'assign_organization',
    jsonb_build_object('tenant_id', v_old_tenant),
    jsonb_build_object('tenant_id', p_tenant_id),
    jsonb_build_object('removed_memberships', v_removed, 'actor_role', v_actor_role)
  );

  RETURN QUERY SELECT true, false, v_removed, NULL::text;
END;
$$;

-- CORRECCIÓN CP-ORG-001: ACL CERTIFICADA (patrón REM-INV-6): solo
-- service_role (rutas API con clave de servicio) ejecuta la RPC. El
-- enlace anti-spoofing H-7 a auth.uid() permanece como defensa en
-- profundidad si el grant cambiara en el futuro.
REVOKE EXECUTE ON FUNCTION public.assign_user_organization(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_organization(uuid, uuid, uuid, boolean) TO service_role;
