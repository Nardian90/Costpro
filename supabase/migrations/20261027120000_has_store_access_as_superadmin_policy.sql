-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN TRANSVERSAL DE SEGURIDAD (2026-10-27) — has_store_access_as y la
-- familia de autorización por usuario explícito reconocen al SuperAdmin.
--
-- DEFECTO (causa raíz demostrada contra BD viva):
--   El SuperAdmin de plataforma (profiles.role='superadmin') NO lleva
--   membresías de tienda POR DISEÑO (§6 migración 20260826120000). Pero
--   has_store_access_as — la función compartida de autorización por usuario
--   explícito — resolvía el nivel administrativo con un check ESTRICTO
--   «v_role = 'admin'» (v1.2, 20260726000002), excluyendo 'superadmin'.
--   Resultado: falso rechazo (ERR_UNAUTHORIZED) del SuperAdmin en los 59
--   flujos RPC vivos que la consumen (ventas, caja, inventario, compras,
--   recepciones, transferencias, devoluciones, producción, reportes,
--   administración), contradiciendo la política efectiva del resto del
--   sistema: is_admin()/is_admin_check()/is_global_admin() incluyen
--   ('admin','superadmin') desde 20261026120000 §2-§3, las ~70 políticas RLS
--   usan is_admin(), la RLS stores_tenant_select añade bypass is_superadmin()
--   incluso con USE_TENANT_RLS=true (20261026160000 §2), has_store_role_as
--   ya incluye 'superadmin', y withStoreAccess (app) es transversal para
--   superadmin (PR #1512).
--
-- CORRECCIÓN CENTRALIZADA (delegación en el check central existente):
--   El nivel administrativo de plataforma se delega a is_admin_check(uid) —
--   la MISMA fuente confiable server-side (SELECT sobre profiles, sin
--   entrada del cliente) que usan las RLS y las RPCs del módulo PI (PR
--   #1512). NO se introduce una nueva forma de determinar el rol.
--
-- ALCANCE AUDITADO (grafo de consumidores de has_store_access_as, BD viva):
--   · RAÍZ: has_store_access_as — 59 consumidores RPC vivos (20 expuestos a
--     authenticated, 39 service-only), TODOS con guardia anti-spoofing v2.12.9
--     (v_caller_uid := CASE WHEN auth.role()='service_role' THEN
--     COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END). ACL viva
--     {postgres, service_role} (REVOKE authenticated en w9_f06). 0 políticas
--     RLS la llaman directamente (usan is_admin()/has_store_access).
--   · FALLOS DERIVADOS (los consumidores siguen bloqueando al superadmin por
--     gates propios con el mismo check estricto 'admin' de profiles):
--       - can_admin_reverse_transaction (reverse_transaction_v2,
--         regularize_sale_payment)
--       - can_pos_undo_transaction (void_transaction)
--       - can_reverse_document (reverse_receipt_v2, reverse_transfer,
--         reverse_devolution, reverse_inventory_adjustment_v2,
--         reverse_production_order)
--       - has_management_access_as (reset_store_data/3 y /2 — que TAMBIÉN
--         gatean con has_store_access_as)
--       - approve_transfer (gate propio «v_user_role = 'admin'» además de
--         has_store_access_as al origen)
--   · FUERA DE ALCANCE (documentado, NO tocados — mismos defectos de clase
--     pero NO consumidores del grafo): lock_fiscal_period,
--     manage_user_memberships, managed_create_user, bulk_soft_delete_stores,
--     soft_delete_store, restore_store_backup, generate_bulk_*_token,
--     has_role. Sus gates no involucran has_store_access_as.
--
-- POLÍTICA FINAL (alineada con is_admin()/is_admin_check() y RLS):
--   · SuperAdmin ('superadmin'): alcance de plataforma GLOBAL (transversal a
--     tiendas y tenants) — igual que 'admin' YA LO TENÍA vía esta función.
--     Identidad SIEMPRE resuelta server-side (is_admin_check lee profiles por
--     p_user_id; los consumidores ya aplican anti-spoofing antes de llamar).
--   · Admin de plataforma ('admin'): SIN cambios (ya era global aquí, igual
--     que en is_admin()/RLS). El aislamiento por tenant del administrador
--     ordinario vive en la capa app (withStoreAccess, USE_TENANT_RLS) y en
--     las RLS con GUC app.use_tenant_rls — no en esta función.
--   · tenant_admin y usuarios operativos (manager/clerk/warehouse/encargado/
--     usuario/costo): SIN cambios — requieren membresía ACTIVA con el rol de
--     tienda exigido por cada flujo. 'tenant_admin' NO está en
--     is_admin_check() y sigue atado a membresías.
--   · Denegación segura: user/store NULL, usuario inexistente, rol
--     desconocido o membresía inactiva → false (sin bypass implícito).
--   · El parámetro de rol requerido de cada consumidor (p_roles de
--     has_store_role, approver_roles de approve_transfer, memberships de
--     can_*) CONSERVA su semántica operativa: el bypass administrativo solo
--     reconoce el nivel de plataforma, no degrada los checks de rol de tienda.
--
-- COMPATIBILIDAD:
--   · Firmas IDÉNTICAS (mismos nombres, argumentos y tipos) — sin impacto en
--     consumidores. CREATE OR REPLACE conserva owner, ACL y dependencias.
--   · Atributos preservados: SECURITY DEFINER, search_path fijado, VOLATILE,
--     PARALLEL UNSAFE (los 6; is_admin_check es STABLE y callable desde
--     VOLATILE).
--   · Sin GRANT/REVOKE nuevos: ACL viva {postgres, service_role} intacta
--     (el replay del contrato de seguridad reproduce el mismo estado).
--   · can_reverse_document conserva su check de MEMBRESÍA de tienda
--     «v_membership_role = 'admin'» (rol de tienda, correcto); solo el check
--     de PERFIL se delega a is_admin_check.
--   · can_pos_undo_transaction conserva TODOS sus gates previos (vendedor,
--     30s, estado completed): el nivel administrativo no exime ser el
--     vendedor de la transacción (semántica POS intacta).
--
-- Idempotente (CREATE OR REPLACE). Aplicación verificada contra la BD viva
-- (scripts de la misión) + re-certificación del contract-surface (la única
-- función del set que ESCRIBE — approve_transfer — forma parte del surface
-- certificado de 153 funciones).
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- Guard de existencia y firma: is_admin_check(uuid) debe existir
-- con la semántica vigente ('admin','superadmin') antes de delegar.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_admin_check'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid'
      AND pg_get_functiondef(p.oid) ILIKE '%''admin'', ''superadmin''%'
  ) THEN
    RAISE EXCEPTION 'GUARD: public.is_admin_check(uuid) con roles (''admin'',''superadmin'') no existe — abortando (validación de firma de la migración 20261027120000)';
  END IF;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 1) RAÍZ: has_store_access_as(p_user_id, p_store_id)
--    59 consumidores RPC vivos. El check de nivel administrativo
--    se delega a is_admin_check (antes: v_role = 'admin' estricto).
--    Miembro operativo: semántica byte-idéntica (membresía activa).
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;

    -- [HSAA-20261027] Nivel administrativo de plataforma (admin|superadmin)
    -- delegado al check central is_admin_check(p_user_id) — la misma fuente
    -- confiable de is_admin()/RLS. Antes: v_role = 'admin' estricto, que
    -- rechazaba falsamente al superadmin (sin membresías por diseño).
    IF public.is_admin_check(p_user_id) THEN RETURN true; END IF;

    -- Check membership (usuarios operativos — semántica sin cambios)
    RETURN EXISTS (
        SELECT 1 FROM public.user_store_memberships
        WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active'
    );
END;
$function$;

-- ──────────────────────────────────────────────────────────────
-- 2) can_admin_reverse_transaction(p_actor, p_store_id)
--    Consumidores: reverse_transaction_v2, regularize_sale_payment.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_admin_reverse_transaction(p_actor uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;

  -- [HSAA-20261027] Nivel administrativo de plataforma (admin|superadmin)
  -- vía check central — antes: v_profile_role = 'admin' estricto.
  IF public.is_admin_check(p_actor) THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;

  RETURN COALESCE(v_membership_role IN ('admin','manager','encargado'), false);
END;
$function$;

-- ──────────────────────────────────────────────────────────────
-- 3) can_pos_undo_transaction(p_transaction_id, p_actor)
--    Consumidor: void_transaction. Se conservan TODOS los gates previos
--    (transacción completada, vendedor = actor, ventana de 30 segundos):
--    el nivel administrativo NO exime ser el vendedor (semántica POS).
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_pos_undo_transaction(p_transaction_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_membership_role TEXT;
BEGIN
  IF p_transaction_id IS NULL OR p_actor IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_tx.status <> 'completed' THEN RETURN false; END IF;

  IF v_tx.seller_id IS NULL OR v_tx.seller_id <> p_actor THEN RETURN false; END IF;

  IF v_tx.created_at IS NULL OR v_tx.created_at < now() - INTERVAL '30 seconds' THEN RETURN false; END IF;

  -- [HSAA-20261027] Nivel administrativo de plataforma (admin|superadmin)
  -- vía check central — antes: v_profile_role = 'admin' estricto.
  IF public.is_admin_check(p_actor) THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = v_tx.store_id AND m.status = 'active'
   LIMIT 1;

  RETURN COALESCE(v_membership_role IN ('admin','manager','encargado','clerk'), false);
END;
$function$;

-- ──────────────────────────────────────────────────────────────
-- 4) can_reverse_document(p_actor, p_store_id, p_operation)
--    Consumidores: reverse_receipt_v2, reverse_transfer, reverse_devolution,
--    reverse_inventory_adjustment_v2, reverse_production_order.
--    El check de MEMBRESÍA de tienda «v_membership_role = 'admin'» (rol de
--    tienda, no de perfil) se conserva intacto.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_reverse_document(p_actor uuid, p_store_id uuid, p_operation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL OR p_operation IS NULL THEN RETURN false; END IF;

  -- [HSAA-20261027] Nivel administrativo de plataforma (admin|superadmin)
  -- vía check central — antes: v_profile_role = 'admin' estricto. La política
  -- por membresía (incluido su rol de tienda 'admin') no cambia.
  IF public.is_admin_check(p_actor) THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;
  IF v_membership_role IS NULL THEN RETURN false; END IF;
  IF v_membership_role = 'admin' THEN RETURN true; END IF;

  CASE p_operation
    WHEN 'receipt' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'transfer' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'adjustment' THEN
      RETURN v_membership_role IN ('manager','encargado');
    WHEN 'devolution' THEN
      RETURN true; -- cualquier membresía activa (simétrica a la creación; módulo dormant)
    WHEN 'production_order' THEN
      RETURN v_membership_role IN ('manager','costo');
    ELSE
      RETURN false;
  END CASE;
END;
$function$;

-- ──────────────────────────────────────────────────────────────
-- 5) has_management_access_as(p_user_id, p_store_id)
--    Consumidores: reset_store_data/3 y /2 (que también gatean con
--    has_store_access_as). El bypass de servicio (service_role → true) y la
--    política de membresía admin/manager se conservan; el nivel de PERFIL
--    pasa de ('admin','manager','encargado') a is_admin_check OR
--    ('manager','encargado') — superadmin reconocido, resto sin cambios.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_management_access_as(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN auth.role() = 'service_role' THEN true
    ELSE
      -- [HSAA-20261027] plataforma (admin|superadmin) vía check central
      public.is_admin_check(p_user_id)
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = p_user_id
        AND role IN ('manager', 'encargado')
      )
      OR EXISTS (
        SELECT 1 FROM user_store_memberships
        WHERE user_id = p_user_id
        AND store_id = p_store_id
        AND status = 'active'
        AND role IN ('admin', 'manager')
      )
  END
$function$;

-- ──────────────────────────────────────────────────────────────
-- 6) approve_transfer(p_transfer_id, p_user_id)
--    Derivado: además del gate de acceso al origen (has_store_access_as),
--    su gate de aprobador tenía el override estricto «v_user_role='admin'».
--    Cuerpo byte-idéntico al vivo salvo esa línea (hardening de trampas de
--    nulidad 2026-10-21 conservado íntegro).
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
  v_rule RECORD;
  v_tenant_id UUID;
  v_has_approver_role BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;

  -- AUDITORÍA 2026-10-21 (trampa de nulidad): transfers.status es NULLABLE
  -- (information_schema viva). `NULL != 'PENDIENTE'` ⇒ NULL ⇒ guard saltado ⇒
  -- se aprobaba una transferencia de estado DESCONOCIDO. IS DISTINCT FROM
  -- trata NULL como «no es PENDIENTE» ⇒ fail-closed.
  IF v_transfer.status IS DISTINCT FROM 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden aprobar transferencias PENDIENTE';
  END IF;

  -- AUDITORÍA 2026-10-21 (trampa de nulidad): transfers.requires_approval es
  -- NULLABLE. `NOT NULL` ⇒ NULL ⇒ guard saltado ⇒ se aprobaba una
  -- transferencia con requisito de aprobación DESCONOCIDO. COALESCE(...,false)
  -- es el patrón que YA usa confirm_transfer (v2.12.10, 20260727000007):
  -- NULL ⇒ sin requisito ⇒ NO se aprueba por esta vía (fail-closed) y la
  -- semántica queda alineada entre ambos RPC del flujo.
  IF NOT COALESCE(v_transfer.requires_approval, false) THEN
    RAISE EXCEPTION 'ERR_NO_APPROVAL_REQUIRED';
  END IF;

  IF v_transfer.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_ALREADY_APPROVED';
  END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el caller tiene rol de aprobador
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
    SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = v_transfer.origin_store_id;

    SELECT * INTO v_rule FROM public.transfer_approval_rules
    WHERE is_active = true
      AND (
        (store_id = v_transfer.origin_store_id) OR
        (store_id IS NULL AND tenant_id IS NOT DISTINCT FROM v_tenant_id)
      )
      ORDER BY store_id NULLS LAST
      LIMIT 1;

    IF v_rule.id IS NOT NULL THEN
      -- [HSAA-20261027] Override administrativo delegado al check central
      -- (admin|superadmin) — antes: v_user_role = 'admin' estricto.
      v_has_approver_role := v_user_role = ANY(v_rule.approver_roles) OR public.is_admin_check(v_caller_uid);
      IF NOT v_has_approver_role THEN
        RAISE EXCEPTION 'ERR_NOT_APPROVER: tu rol (%) no está autorizado para aprobar (requerido: %)', v_user_role, v_rule.approver_roles;
      END IF;
    END IF;
  END IF;

  -- Marcar como aprobada
  UPDATE public.transfers
  SET approved_by = v_caller_uid,
      approved_at = NOW()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'approved_by', v_caller_uid,
    'approved_at', NOW()
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN (se ejecuta y documenta fuera de este archivo):
--   1. pg_get_functiondef de las 6 funciones == cuerpos de este archivo.
--   2. ACL preservada: has_store_access_as {postgres, service_role};
--      can_admin_reverse_transaction {postgres, service_role,
--      costpro_transaction_adjuster}; can_pos_undo_transaction {postgres,
--      service_role}; can_reverse_document {postgres, service_role};
--      has_management_access_as {postgres, service_role};
--      approve_transfer {postgres, service_role}.
--   3. Batería de seguridad por rol/tenant (Casos A–K de la misión).
--   4. Re-certificación del contract-surface (approve_transfer es la única
--      función ESCRITORA del set → parte del surface certificado).
-- ═══════════════════════════════════════════════════════════════════════════
